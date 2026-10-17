// Preparación de capítulos: parseo tolerante, saneado (sin scripts ni manejadores de eventos),
// recursos internos marcados para resolverlos como blob: y enlaces internos interceptables.
import { parseXml, readText, type EpubBook } from './book'
import { isExternalUrl, resolveHref } from './paths'

const XLINK = 'http://www.w3.org/1999/xlink'

const REMOVE = new Set([
  'script', 'noscript', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input',
  'button', 'select', 'textarea', 'link', 'meta', 'base', 'style', 'title', 'head', 'template', 'portal',
])

export interface PreparedChapter {
  /** Contenido del <body> ya saneado, listo para importar al documento. */
  body: Element
  /** Rutas de hojas de estilo enlazadas, en orden. */
  stylesheets: string[]
  /** CSS de los <style> del propio capítulo. */
  inlineCss: string
  bodyClass: string
  bodyId: string
  lang: string
  dir: string
}

function sanitizeElement(el: Element, from: string, book: EpubBook) {
  // Atributos peligrosos o inútiles
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase()
    const value = attr.value
    if (name.startsWith('on') || name === 'srcset' || name === 'formaction') {
      el.removeAttribute(attr.name)
    } else if (name === 'style' && /expression\(|javascript:|url\(/i.test(value)) {
      el.setAttribute(attr.name, value.replace(/[^;]*(expression\(|javascript:|url\()[^;]*;?/gi, ''))
    } else if (/^\s*(javascript|vbscript):/i.test(value)) {
      el.removeAttribute(attr.name)
    }
  }
  // epub:type es un atributo con espacio de nombres: lo copiamos a data-epub-type para el CSS
  const epubType = el.getAttribute('epub:type') ?? el.getAttributeNS('http://www.idpf.org/2007/ops', 'type')
  if (epubType) el.setAttribute('data-epub-type', epubType)
  const tag = el.localName
  if (tag === 'a' || tag === 'area') {
    const href = el.getAttribute('href') ?? el.getAttributeNS(XLINK, 'href')
    if (href) {
      if (isExternalUrl(href)) {
        el.setAttribute('target', '_blank')
        el.setAttribute('rel', 'noopener noreferrer')
      } else {
        const r = resolveHref(href, from)
        if (r) {
          const path = book.find(r.path) ?? r.path
          el.setAttribute('data-href', `${path}#${r.fragment}`)
          el.setAttribute('href', `#${r.fragment}`)
        }
      }
    }
    return
  }
  // Recursos: guardamos la ruta interna; el lector la convierte en blob: al mostrar el capítulo
  const srcAttr = tag === 'img' || tag === 'source' || tag === 'video' || tag === 'audio' || tag === 'track' ? 'src' : null
  if (srcAttr) {
    const src = el.getAttribute(srcAttr)
    if (src) {
      const r = resolveHref(src, from)
      el.removeAttribute(srcAttr)
      if (r) el.setAttribute('data-res', book.find(r.path) ?? r.path)
      else if (/^data:image\//i.test(src)) el.setAttribute(srcAttr, src)
    }
    if (tag === 'img') {
      el.setAttribute('loading', 'lazy')
      el.setAttribute('decoding', 'async')
    }
  }
  if (tag === 'video') el.setAttribute('controls', '')
  if (tag === 'image' || tag === 'use') {
    const href = el.getAttributeNS(XLINK, 'href') ?? el.getAttribute('href')
    if (href && !href.startsWith('#')) {
      const r = resolveHref(href, from)
      el.removeAttributeNS(XLINK, 'href')
      el.removeAttribute('href')
      if (r) el.setAttribute('data-res', book.find(r.path) ?? r.path)
    }
  }
}

function sanitizeTree(root: Element, from: string, book: EpubBook) {
  const doomed: Element[] = []
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      if (REMOVE.has(child.localName)) {
        doomed.push(child)
        continue
      }
      sanitizeElement(child, from, book)
      walk(child)
    }
  }
  sanitizeElement(root, from, book)
  walk(root)
  for (const el of doomed) el.remove()
}

export function prepareChapter(book: EpubBook, index: number): PreparedChapter | null {
  const item = book.spine[index]
  if (!item) return null
  const text = readText(book, item.path)
  if (text == null) return null
  const type: DOMParserSupportedType = item.mediaType.includes('xhtml') || item.mediaType.includes('xml') ? 'application/xhtml+xml' : 'text/html'
  const doc = parseXml(text, type)
  const html = doc.documentElement
  const body = (doc.body ?? doc.getElementsByTagName('body')[0] ?? html) as Element

  const stylesheets: string[] = []
  let inlineCss = ''
  for (const el of [...doc.getElementsByTagName('link'), ...doc.getElementsByTagName('style')]) {
    if (el.localName === 'link') {
      const relAttr = (el.getAttribute('rel') ?? '').toLowerCase()
      const href = el.getAttribute('href')
      if (relAttr.includes('stylesheet') && !relAttr.includes('alternate') && href) {
        const r = resolveHref(href, item.path)
        const path = r && book.find(r.path)
        if (path) stylesheets.push(path)
      }
    } else {
      inlineCss += (el.textContent ?? '') + '\n'
    }
  }

  sanitizeTree(body, item.path, book)

  return {
    body,
    stylesheets,
    inlineCss,
    bodyClass: body === html ? '' : (body.getAttribute('class') ?? ''),
    bodyId: body.getAttribute('id') ?? '',
    lang: html.getAttribute('xml:lang') ?? html.getAttribute('lang') ?? body.getAttribute('lang') ?? '',
    dir: body.getAttribute('dir') ?? html.getAttribute('dir') ?? '',
  }
}

/** Texto plano de un capítulo saneado: base de los conteos de caracteres y palabras. */
export const chapterText = (prepared: PreparedChapter) => prepared.body.textContent ?? ''
