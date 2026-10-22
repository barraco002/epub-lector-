// Lectura del contenedor EPUB (2 y 3): container.xml → OPF → manifiesto, spine, metadatos,
// índice (nav de EPUB 3 o NCX de EPUB 2) y portada.
// Estructura inspirada en el parser de foliate-js (MIT, © John Factotum).
import { unzip, type Unzipped } from 'fflate'
import { mimeFromPath, normalizePath, resolveHref } from './paths'
import { t } from '../i18n'

const NS = {
  DC: 'http://purl.org/dc/elements/1.1/',
  OPF: 'http://www.idpf.org/2007/opf',
  EPUB: 'http://www.idpf.org/2007/ops',
  XHTML: 'http://www.w3.org/1999/xhtml',
}

export interface ManifestItem {
  id: string
  path: string
  mediaType: string
  properties: string[]
}

export interface SpineItem {
  index: number
  path: string
  mediaType: string
  linear: boolean
}

export interface TocItem {
  label: string
  path: string
  fragment: string
  spine: number
  depth: number
  children: TocItem[]
}

export interface BookMetadata {
  title: string
  authors: string[]
  language: string
  publisher: string
  description: string
  identifier: string
  date: string
}

export interface EpubBook {
  files: Unzipped
  metadata: BookMetadata
  manifest: Map<string, ManifestItem>
  byPath: Map<string, ManifestItem>
  spine: SpineItem[]
  spineByPath: Map<string, number>
  toc: TocItem[]
  coverPath: string | null
  dir: 'ltr' | 'rtl'
  /** Traduce una ruta resuelta al nombre real dentro del ZIP (tolera mayúsculas/codificación). */
  find: (path: string) => string | null
}

export class EpubError extends Error {}

const decoder = new TextDecoder('utf-8')

const unzipAsync = (data: Uint8Array) =>
  new Promise<Unzipped>((resolve, reject) => unzip(data, (err, res) => (err ? reject(err) : resolve(res))))

/** Busca una entrada del ZIP tolerando diferencias de mayúsculas y codificación. */
function makeLookup(files: Unzipped) {
  const lower = new Map<string, string>()
  for (const name of Object.keys(files)) lower.set(name.toLowerCase(), name)
  return (path: string): string | null => {
    if (path in files) return path
    const alt = lower.get(path.toLowerCase())
    if (alt) return alt
    try {
      const enc = encodeURI(path)
      if (enc in files) return enc
    } catch {
      /* ignorar */
    }
    return null
  }
}

export function readText(book: Pick<EpubBook, 'files'>, path: string): string | null {
  const data = book.files[path]
  if (!data) return null
  let text = decoder.decode(data)
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  // Algunos EPUB antiguos declaran otra codificación; lo más común es windows-1252/latin1
  const enc = text.slice(0, 200).match(/encoding=["']([\w-]+)["']/i)?.[1]?.toLowerCase()
  if (enc && enc !== 'utf-8' && enc !== 'utf8') {
    try {
      text = new TextDecoder(enc).decode(data)
    } catch {
      /* codificación desconocida: mantenemos UTF-8 */
    }
  }
  return text
}

export function parseXml(text: string, type: DOMParserSupportedType = 'application/xml'): Document {
  const parser = new DOMParser()
  let doc = parser.parseFromString(text, type)
  if (doc.getElementsByTagName('parsererror').length) {
    // XHTML mal formado (muy común): el parser HTML es tolerante
    doc = parser.parseFromString(text, 'text/html')
  }
  return doc
}

const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

const dcAll = (opf: Document, name: string) => [...opf.getElementsByTagNameNS(NS.DC, name)]

function stripHtml(s: string) {
  if (!/[<&]/.test(s)) return s
  const doc = new DOMParser().parseFromString(s, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export async function openEpub(data: Uint8Array): Promise<EpubBook> {
  let raw: Unzipped
  try {
    raw = await unzipAsync(data)
  } catch {
    throw new EpubError(t('El archivo no es un EPUB válido (no se pudo descomprimir).'))
  }
  // Normalizamos nombres: sin barra inicial
  const files: Unzipped = {}
  for (const [name, bytes] of Object.entries(raw)) {
    if (!name.endsWith('/')) files[normalizePath(name)] = bytes
  }
  const lookup = makeLookup(files)

  const containerText = readText({ files }, lookup('META-INF/container.xml') ?? '')
  let opfPath: string | null = null
  if (containerText) {
    const container = parseXml(containerText)
    const rootfile = [...container.getElementsByTagName('rootfile')].find(
      (r) => (r.getAttribute('media-type') ?? 'application/oebps-package+xml') === 'application/oebps-package+xml',
    )
    const full = rootfile?.getAttribute('full-path')
    if (full) opfPath = lookup(normalizePath(full))
  }
  // EPUB sin container.xml: buscamos cualquier .opf
  opfPath ??= Object.keys(files).find((n) => n.toLowerCase().endsWith('.opf')) ?? null
  if (!opfPath) throw new EpubError(t('No se encontró el paquete OPF del EPUB.'))

  const opf = parseXml(readText({ files }, opfPath) ?? '')
  const pkg = opf.documentElement

  const manifest = new Map<string, ManifestItem>()
  const byPath = new Map<string, ManifestItem>()
  for (const el of [...opf.getElementsByTagName('item')]) {
    const id = el.getAttribute('id') ?? ''
    const href = el.getAttribute('href')
    if (!href) continue
    const resolved = resolveHref(href, opfPath)
    if (!resolved) continue
    const path = lookup(resolved.path) ?? resolved.path
    const item: ManifestItem = {
      id,
      path,
      mediaType: el.getAttribute('media-type') ?? mimeFromPath(path),
      properties: (el.getAttribute('properties') ?? '').split(/\s+/).filter(Boolean),
    }
    manifest.set(id, item)
    byPath.set(path, item)
  }

  const spineEl = opf.getElementsByTagName('spine')[0]
  const spine: SpineItem[] = []
  for (const ref of spineEl ? [...spineEl.getElementsByTagName('itemref')] : []) {
    const item = manifest.get(ref.getAttribute('idref') ?? '')
    if (!item || !files[item.path]) continue
    if (!/html|xml/.test(item.mediaType)) continue
    spine.push({
      index: spine.length,
      path: item.path,
      mediaType: item.mediaType,
      linear: ref.getAttribute('linear') !== 'no',
    })
  }
  if (!spine.length) throw new EpubError(t('El EPUB no tiene capítulos legibles.'))
  const spineByPath = new Map(spine.map((s) => [s.path, s.index]))

  const metadata: BookMetadata = {
    title: textOf(dcAll(opf, 'title')[0]) || t('Sin título'),
    authors: dcAll(opf, 'creator').map(textOf).filter(Boolean),
    language: textOf(dcAll(opf, 'language')[0]),
    publisher: textOf(dcAll(opf, 'publisher')[0]),
    description: stripHtml(textOf(dcAll(opf, 'description')[0])),
    identifier: textOf(dcAll(opf, 'identifier')[0]),
    date: textOf(dcAll(opf, 'date')[0]),
  }

  const book: EpubBook = {
    files,
    metadata,
    manifest,
    byPath,
    spine,
    spineByPath,
    toc: [],
    coverPath: null,
    dir: spineEl?.getAttribute('page-progression-direction') === 'rtl' ? 'rtl' : 'ltr',
    find: lookup,
  }

  // Índice: nav de EPUB 3 primero, NCX después, y si no hay, uno generado del spine
  const navItem = [...manifest.values()].find((i) => i.properties.includes('nav'))
  if (navItem) book.toc = parseNav(book, navItem.path)
  if (!book.toc.length) {
    const ncxId = spineEl?.getAttribute('toc')
    const ncx = (ncxId && manifest.get(ncxId)) || [...manifest.values()].find((i) => i.mediaType === 'application/x-dtbncx+xml')
    if (ncx) book.toc = parseNcx(book, ncx.path)
  }
  if (!book.toc.length) {
    book.toc = spine.map((s) => ({
      label: t('Sección {n}', { n: s.index + 1 }),
      path: s.path,
      fragment: '',
      spine: s.index,
      depth: 0,
      children: [],
    }))
  }

  book.coverPath = findCover(book, opf, pkg, opfPath)
  return book
}

function makeTocItem(book: EpubBook, label: string, href: string | null, from: string, depth: number): TocItem | null {
  const resolved = href ? resolveHref(href, from) : null
  const path = resolved ? (book.find(resolved.path) ?? resolved.path) : ''
  const spineIndex = book.spineByPath.get(path)
  return {
    label: label || t('Sin título'),
    path,
    fragment: resolved?.fragment ?? '',
    spine: spineIndex ?? -1,
    depth,
    children: [],
  }
}

function parseNav(book: EpubBook, navPath: string): TocItem[] {
  const text = readText(book, navPath)
  if (!text) return []
  const doc = parseXml(text, 'application/xhtml+xml')
  const navs = [...doc.getElementsByTagName('nav')]
  const nav =
    navs.find((n) => (n.getAttributeNS(NS.EPUB, 'type') ?? n.getAttribute('epub:type') ?? '').split(/\s+/).includes('toc')) ??
    navs[0]
  const ol = nav && [...nav.children].find((c) => c.localName === 'ol')
  if (!ol) return []
  const walk = (list: Element, depth: number): TocItem[] =>
    [...list.children]
      .filter((li) => li.localName === 'li')
      .map((li) => {
        const a = [...li.children].find((c) => c.localName === 'a' || c.localName === 'span')
        const item = makeTocItem(book, textOf(a) || a?.getAttribute('title') || '', a?.getAttribute('href') ?? null, navPath, depth)!
        const sub = [...li.children].find((c) => c.localName === 'ol')
        if (sub) item.children = walk(sub, depth + 1)
        // Entradas sin destino propio heredan el del primer hijo
        if (item.spine < 0 && item.children[0]) {
          item.spine = item.children[0].spine
          item.path = item.children[0].path
          item.fragment = item.children[0].fragment
        }
        return item
      })
  return walk(ol, 0)
}

function parseNcx(book: EpubBook, ncxPath: string): TocItem[] {
  const text = readText(book, ncxPath)
  if (!text) return []
  const doc = parseXml(text)
  const navMap = doc.getElementsByTagName('navMap')[0]
  if (!navMap) return []
  const walk = (parent: Element, depth: number): TocItem[] =>
    [...parent.children]
      .filter((c) => c.localName === 'navPoint')
      .map((np) => {
        const label = textOf([...np.children].find((c) => c.localName === 'navLabel'))
        const src = [...np.children].find((c) => c.localName === 'content')?.getAttribute('src') ?? null
        const item = makeTocItem(book, label, src, ncxPath, depth)!
        item.children = walk(np, depth + 1)
        return item
      })
  return walk(navMap, 0)
}

const isImage = (i?: ManifestItem | null) => !!i && i.mediaType.startsWith('image/')

function findCover(book: EpubBook, opf: Document, pkg: Element, opfPath: string): string | null {
  const items = [...book.manifest.values()]
  // 1. EPUB 3: properties="cover-image"
  let item = items.find((i) => i.properties.includes('cover-image'))
  // 2. EPUB 2: <meta name="cover" content="id">
  if (!isImage(item)) {
    const meta = [...opf.getElementsByTagName('meta')].find((m) => m.getAttribute('name') === 'cover')
    const content = meta?.getAttribute('content')
    if (content) item = book.manifest.get(content) ?? book.byPath.get(resolveHref(content, opfPath)?.path ?? '')
  }
  // 3. Heurística por nombre
  if (!isImage(item)) item = items.find((i) => isImage(i) && /cover|portada/i.test(i.id + i.path))
  if (isImage(item) && book.files[item!.path]) return item!.path
  // 4. <guide><reference type="cover"> o primer capítulo: primera imagen que contenga
  const guideRef = [...pkg.getElementsByTagName('reference')].find((r) => r.getAttribute('type') === 'cover')
  const guidePath = guideRef && resolveHref(guideRef.getAttribute('href') ?? '', opfPath)?.path
  const pages = [guidePath && book.find(guidePath), book.spine[0]?.path].filter(Boolean) as string[]
  for (const page of pages) {
    const text = readText(book, page)
    if (!text) continue
    const doc = parseXml(text, 'application/xhtml+xml')
    const img = doc.querySelector('img[src], image')
    const src = img?.getAttribute('src') ?? img?.getAttribute('href') ?? img?.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    const resolved = src && resolveHref(src, page)?.path
    const path = resolved && book.find(resolved)
    if (path) return path
  }
  return null
}

export function resourceType(book: EpubBook, path: string) {
  return book.byPath.get(path)?.mediaType ?? mimeFromPath(path)
}
