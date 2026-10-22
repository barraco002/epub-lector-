// Motor del lector en scroll continuo.
// - Solo se construye el DOM de los capítulos cercanos a la vista (IntersectionObserver) y los
//   lejanos se descargan para mantener la memoria acotada en libros enormes.
// - Las posiciones se guardan como (capítulo, carácter): estables ante cambios de tipografía.
// - Los subrayados usan la CSS Custom Highlight API: no se toca el DOM del libro.
import type { EpubBook } from '../epub/book'
import { resourceType } from '../epub/book'
import { prepareChapter, type PreparedChapter } from '../epub/chapter'
import { extractImports, scopeStylesheet, BOOK_BODY, BOOK_ROOT } from '../epub/css'
import { resolveHref } from '../epub/paths'
import { readText } from '../epub/book'
import { caretFromPoint, TextIndex } from '../textindex'
import type { Annotation, ChapterStats, Position } from '../db'
import { yieldToMain } from '../importer'
import { throttle } from '../util'

export interface EngineCallbacks {
  onPosition?: (pos: Position, info: PositionInfo) => void
  onFootnote?: (note: { html: DocumentFragment; title: string; target: { s: number; fragment: string } }) => void
  onImage?: (src: string, alt: string) => void
  onChapterRendered?: (s: number) => void
  /** Cabecera discreta al inicio de un capítulo (null = sin cabecera; sin label = solo el ornamento y el título) */
  chapterHeader?: (s: number) => { label?: string; title: string } | null
  /** Navegación por un enlace interno (no cuenta como lectura) */
  onNavigate?: () => void
}

export interface PositionInfo {
  /** Progreso del libro 0..1 */
  progress: number
  /** Progreso del capítulo 0..1 */
  chapterProgress: number
  /** Caracteres absolutos desde el inicio del libro */
  absChars: number
}

export interface SearchHit {
  s: number
  start: number
  end: number
  before: string
  match: string
  after: string
}

interface Chapter {
  section: HTMLElement
  rendered: boolean
  index: TextIndex | null
  ranges: Map<string, Range>
  lastUsed: number
}

const MAX_RENDERED = 10
const HL_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const

const highlightApi = () =>
  typeof CSS !== 'undefined' && 'highlights' in CSS && typeof (globalThis as { Highlight?: unknown }).Highlight === 'function'

function normalizeForSearch(text: string) {
  // Mismo largo que el original: cada unidad UTF-16 se mapea a su letra base en minúscula
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const code = c.charCodeAt(0)
    out += code < 128 ? c.toLowerCase() : (c.normalize('NFD')[0] ?? c).toLowerCase()
  }
  return out
}

export class ReaderEngine {
  private chapters: Chapter[] = []
  private prefix: number[] = []
  private total = 0
  private observer: IntersectionObserver
  private styleEl: HTMLStyleElement
  private addedSheets = new Set<string>()
  private blobUrls = new Map<string, string>()
  private annotationsByChapter = new Map<number, Annotation[]>()
  private highlights = new Map<string, Highlight>()
  private searchHighlight: Highlight | null = null
  private suppressUntil = 0
  private destroyed = false
  private positionRaf = 0
  private lastPosition: Position | null = null
  current = 0

  constructor(
    readonly book: EpubBook,
    readonly scroller: HTMLElement,
    readonly root: HTMLElement,
    readonly stats: ChapterStats[],
    readonly cb: EngineCallbacks = {},
  ) {
    let acc = 0
    this.prefix = stats.map((c) => {
      const p = acc
      acc += c.chars
      return p
    })
    this.total = acc || 1
    this.styleEl = document.createElement('style')
    this.styleEl.dataset.book = '1'
    document.head.append(this.styleEl)

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const i = Number((e.target as HTMLElement).dataset.i)
          if (!this.chapters[i]?.rendered) this.render(i)
        }
      },
      { root: scroller, rootMargin: '150% 0px 150% 0px' },
    )

    if (highlightApi()) {
      for (const c of HL_COLORS) {
        const h = new Highlight()
        this.highlights.set(c, h)
        CSS.highlights.set(`hl-${c}`, h)
      }
      this.searchHighlight = new Highlight()
      CSS.highlights.set('search-hit', this.searchHighlight)
    }

    const frag = document.createDocumentFragment()
    book.spine.forEach((item, i) => {
      const section = document.createElement('section')
      section.className = 'ch'
      section.dataset.i = String(i)
      if (!item.linear) section.dataset.nonlinear = '1'
      section.style.height = `${this.estimateHeight(i)}px`
      frag.append(section)
      this.chapters.push({ section, rendered: false, index: null, ranges: new Map(), lastUsed: 0 })
    })
    root.replaceChildren(frag)

    root.addEventListener('click', this.onClick)
    scroller.addEventListener('scroll', this.onScroll, { passive: true })
  }

  get chapterCount() {
    return this.chapters.length
  }

  /** Altura aproximada de un capítulo aún no renderizado, a partir de su número de caracteres. */
  private estimateHeight(i: number) {
    const cs = getComputedStyle(this.root)
    const fs = parseFloat(cs.getPropertyValue('--fs')) || 18
    const lh = parseFloat(cs.getPropertyValue('--lh')) || 1.6
    const width = Math.max(240, this.root.clientWidth || this.scroller.clientWidth - 40)
    const charsPerLine = Math.max(20, width / (fs * 0.5))
    const lines = (this.stats[i]?.chars ?? 2000) / charsPerLine
    return Math.round(lines * fs * lh * 1.12 + fs * 6)
  }

  /** Recalcula alturas estimadas (tras cambiar fuente o tamaño). */
  reestimate() {
    this.chapters.forEach((ch, i) => {
      if (!ch.rendered) ch.section.style.height = `${this.estimateHeight(i)}px`
    })
  }

  // ——— Recursos ———

  private resourceUrl = (path: string): string | null => {
    const real = this.book.find(path)
    if (!real) return null
    let url = this.blobUrls.get(real)
    if (!url) {
      const data = this.book.files[real]
      if (!data) return null
      url = URL.createObjectURL(new Blob([data as BlobPart], { type: resourceType(this.book, real) }))
      this.blobUrls.set(real, url)
    }
    return url
  }

  private addStylesheet(path: string, depth = 0) {
    if (this.addedSheets.has(path) || depth > 3) return
    this.addedSheets.add(path)
    const text = readText(this.book, path)
    if (!text) return
    const { css, imports } = extractImports(text)
    for (const imp of imports) {
      const r = resolveHref(imp, path)
      const real = r && this.book.find(r.path)
      if (real) this.addStylesheet(real, depth + 1)
    }
    const scoped = scopeStylesheet(css, (url) => {
      const r = resolveHref(url, path)
      return r ? this.resourceUrl(r.path) : null
    })
    if (scoped) this.styleEl.append(document.createTextNode(scoped + '\n'))
  }

  private addInlineCss(prepared: PreparedChapter, i: number) {
    if (!prepared.inlineCss.trim()) return
    const from = this.book.spine[i].path
    const scoped = scopeStylesheet(
      prepared.inlineCss,
      (url) => {
        const r = resolveHref(url, from)
        return r ? this.resourceUrl(r.path) : null
      },
      `${BOOK_ROOT} [data-i="${i}"]`,
      BOOK_BODY,
    )
    if (scoped) this.styleEl.append(document.createTextNode(scoped + '\n'))
  }

  // ——— Renderizado ———

  render(i: number) {
    const ch = this.chapters[i]
    if (!ch || ch.rendered || this.destroyed) return
    const prepared = prepareChapter(this.book, i)
    ch.rendered = true
    ch.lastUsed = performance.now()
    if (!prepared) {
      ch.section.style.height = ''
      return
    }
    for (const sheet of prepared.stylesheets) this.addStylesheet(sheet)
    if (!this.addedSheets.has(`inline:${i}`)) {
      this.addedSheets.add(`inline:${i}`)
      this.addInlineCss(prepared, i)
    }

    const body = document.createElement('div')
    body.className = `bk-body ${prepared.bodyClass}`.trim()
    if (prepared.lang) body.lang = prepared.lang
    if (prepared.dir) body.dir = prepared.dir
    // Importar nodos ya saneados (sin pasar por innerHTML: conserva la estructura XHTML)
    const frag = document.createDocumentFragment()
    for (const node of [...prepared.body.childNodes]) frag.append(document.importNode(node, true))
    body.append(frag)

    for (const el of body.querySelectorAll<HTMLElement | SVGElement>('[data-res]')) {
      const url = this.resourceUrl(el.getAttribute('data-res')!)
      if (!url) continue
      if (el instanceof SVGElement) el.setAttribute('href', url)
      else el.setAttribute('src', url)
    }

    const head = this.cb.chapterHeader?.(i)
    if (head) {
      // Fuera de .bk-body: no entra en el índice de texto, así no altera posiciones ni subrayados
      const header = document.createElement('header')
      header.className = 'ch-head'
      header.setAttribute('aria-hidden', 'true')
      const orn = document.createElement('span')
      orn.className = 'ch-orn'
      orn.textContent = '❦'
      const parts: HTMLElement[] = [orn]
      if (head.label) {
        const label = document.createElement('span')
        label.className = 'ch-label'
        label.textContent = head.label
        parts.push(label)
      }
      // Si el libro ya abre con ese mismo título, no lo repetimos
      const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase()
      const firstHeading = body.querySelector('h1, h2, h3')?.textContent ?? ''
      if (norm(firstHeading) !== norm(head.title)) {
        const title = document.createElement('span')
        title.className = 'ch-title'
        title.textContent = head.title
        parts.push(title)
      }
      header.append(...parts)
      ch.section.replaceChildren(header, body)
    } else ch.section.replaceChildren(body)
    ch.section.style.height = ''
    ch.section.dataset.rendered = '1'
    ch.index = new TextIndex(body)
    this.applyAnnotations(i)
    this.cb.onChapterRendered?.(i)
    this.evict(i)
  }

  private unrender(i: number) {
    const ch = this.chapters[i]
    if (!ch.rendered) return
    const h = ch.section.getBoundingClientRect().height
    for (const [id, range] of ch.ranges) {
      for (const hl of this.highlights.values()) hl.delete(range)
      ch.ranges.delete(id)
    }
    ch.section.replaceChildren()
    ch.section.style.height = `${Math.round(h)}px`
    delete ch.section.dataset.rendered
    ch.rendered = false
    ch.index = null
  }

  /** Mantiene como mucho MAX_RENDERED capítulos vivos, descargando los más lejanos. */
  private evict(justRendered: number) {
    const live = this.chapters.map((c, i) => ({ c, i })).filter((x) => x.c.rendered)
    if (live.length <= MAX_RENDERED) return
    const anchor = this.current
    live
      .filter((x) => Math.abs(x.i - anchor) > 2 && x.i !== justRendered)
      .sort((a, b) => Math.abs(b.i - anchor) - Math.abs(a.i - anchor))
      .slice(0, live.length - MAX_RENDERED)
      .forEach((x) => this.unrender(x.i))
  }

  /** Empieza a vigilar las secciones; se llama tras el primer posicionamiento. */
  observe() {
    for (const ch of this.chapters) this.observer.observe(ch.section)
  }

  // ——— Posición ———

  private readingLine() {
    const rect = this.scroller.getBoundingClientRect()
    const bodyRect = this.root.getBoundingClientRect()
    return { x: bodyRect.left + bodyRect.width * 0.3, y: rect.top + 12, top: rect.top }
  }

  /** Capítulo que ocupa la coordenada `y` (búsqueda binaria: las secciones están en orden). */
  private chapterAtY(y: number): number {
    let lo = 0
    let hi = this.chapters.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.chapters[mid].section.getBoundingClientRect().bottom > y) hi = mid
      else lo = mid + 1
    }
    return lo
  }

  /** Posición actual: el texto en la parte superior de la pantalla. */
  position(): Position {
    const { x, y } = this.readingLine()
    let s = this.chapterAtY(y)
    let c = 0
    const ch = this.chapters[s]
    if (ch?.index) {
      // Probamos algunos puntos por si caemos en un margen o una imagen
      for (const dy of [0, 16, 32, 64, 120]) {
        const caret = caretFromPoint(x, y + dy)
        if (!caret || !ch.section.contains(caret.node)) continue
        const off = ch.index.offsetOf(caret.node, caret.offset)
        if (off != null) {
          c = off
          break
        }
      }
    } else if (ch) {
      const r = ch.section.getBoundingClientRect()
      const frac = r.height > 0 ? Math.min(1, Math.max(0, (y - r.top) / r.height)) : 0
      c = Math.round(frac * (this.stats[s]?.chars ?? 0))
    }
    if (s < 0) s = 0
    return { s, c }
  }

  info(pos: Position): PositionInfo {
    const chars = this.stats[pos.s]?.chars || 1
    const c = Math.min(pos.c, chars)
    const absChars = (this.prefix[pos.s] ?? 0) + c
    // Al final del todo, el progreso es exactamente 1
    const atEnd = this.scroller.scrollTop + this.scroller.clientHeight >= this.scroller.scrollHeight - 4
    return {
      progress: atEnd && pos.s >= this.chapters.length - 1 ? 1 : Math.min(1, absChars / this.total),
      chapterProgress: Math.min(1, c / chars),
      absChars,
    }
  }

  // La posición se calcula como mucho ~8 veces por segundo durante el scroll (no en cada frame)
  private onScroll = throttle(() => {
    cancelAnimationFrame(this.positionRaf)
    this.positionRaf = requestAnimationFrame(() => {
      this.positionRaf = 0
      if (performance.now() < this.suppressUntil) return
      this.emitPosition()
    })
  }, 120)

  emitPosition() {
    const pos = this.position()
    this.current = pos.s
    const ch = this.chapters[pos.s]
    if (ch) ch.lastUsed = performance.now()
    if (this.lastPosition && this.lastPosition.s === pos.s && this.lastPosition.c === pos.c) return
    this.lastPosition = pos
    this.cb.onPosition?.(pos, this.info(pos))
  }

  /** Desplaza la vista para que el carácter `c` del capítulo `s` quede arriba. */
  async goTo(target: Position | { s: number; fragment: string }, opts: { smooth?: boolean; offset?: number } = {}) {
    const s = Math.max(0, Math.min(target.s, this.chapters.length - 1))
    this.current = s
    // Renderizamos el destino y sus vecinos antes de medir
    this.render(s)
    if (s + 1 < this.chapters.length) this.render(s + 1)
    if (s > 0) this.render(s - 1)
    await new Promise((r) => requestAnimationFrame(r))
    const ch = this.chapters[s]
    let c = 0
    if ('c' in target) c = target.c
    else if (target.fragment && ch.index) {
      const el = ch.section.querySelector(`[id="${CSS.escape(target.fragment)}"], [name="${CSS.escape(target.fragment)}"]`)
      if (el) c = ch.index.offsetOf(el, 0) ?? 0
    }
    // Los saltos a un ancla dejan algo de aire por encima del destino
    this.scrollToChar(s, c, 'fragment' in target && opts.offset == null ? { ...opts, offset: 24 } : opts)
  }

  private scrollToChar(s: number, c: number, opts: { smooth?: boolean; offset?: number }) {
    const ch = this.chapters[s]
    const top = this.scroller.getBoundingClientRect().top
    let delta: number
    if (c <= 0 && s === 0) {
      delta = -this.scroller.scrollTop // inicio del libro: arriba del todo, con su margen
    } else if (c <= 0 || !ch.index) {
      delta = ch.section.getBoundingClientRect().top - top - (opts.offset ?? 28)
    } else {
      const rect = ch.index.rectAt(c)
      delta = (rect ? rect.top : ch.section.getBoundingClientRect().top) - top - (opts.offset ?? 4)
    }
    this.suppressUntil = performance.now() + (opts.smooth ? 600 : 80)
    this.scroller.scrollBy({ top: delta, behavior: opts.smooth ? 'smooth' : 'instant' })
    setTimeout(() => this.emitPosition(), opts.smooth ? 650 : 100)
  }

  /** Va a una fracción del libro (0..1), p. ej. desde la barra de progreso. */
  goToProgress(p: number) {
    const abs = Math.max(0, Math.min(1, p)) * this.total
    let s = 0
    while (s + 1 < this.prefix.length && this.prefix[s + 1] <= abs) s++
    return this.goTo({ s, c: Math.round(abs - this.prefix[s]) })
  }

  posFromAbs(abs: number): Position {
    let s = 0
    while (s + 1 < this.prefix.length && this.prefix[s + 1] <= abs) s++
    return { s, c: Math.round(abs - this.prefix[s]) }
  }

  get totalChars() {
    return this.total
  }

  /** Borde superior del renglón que pasa por la coordenada `y` (null si ahí no hay texto). */
  lineTopAt(y: number): { top: number; left: number } | null {
    const body = this.root.getBoundingClientRect()
    const caret = caretFromPoint(body.left + body.width * 0.3, y)
    if (!caret || caret.node.nodeType !== Node.TEXT_NODE || !this.root.contains(caret.node)) return null
    const text = caret.node as Text
    const r = document.createRange()
    const at = Math.min(caret.offset, Math.max(0, text.data.length - 1))
    r.setStart(text, at)
    r.setEnd(text, Math.min(at + 1, text.data.length))
    const rect = r.getClientRects()[0]
    if (!rect) return null
    const lineStart = text.parentElement?.getBoundingClientRect().left ?? rect.left
    return { top: rect.top, left: Math.max(body.left, Math.min(lineStart, rect.left)) }
  }

  // ——— Enlaces, notas e imágenes ———

  private onClick = (e: MouseEvent) => {
    const target = e.target as Element
    const img = target.closest('img')
    if (img && !target.closest('a')) {
      this.cb.onImage?.((img as HTMLImageElement).src, (img as HTMLImageElement).alt)
      return
    }
    const a = target.closest('a')
    if (!a) return
    const dataHref = a.getAttribute('data-href')
    if (!dataHref) return // enlace externo: se abre normalmente
    e.preventDefault()
    const hash = dataHref.indexOf('#')
    const path = dataHref.slice(0, hash)
    const fragment = dataHref.slice(hash + 1)
    const s = this.book.spineByPath.get(path)
    if (s == null) return
    if (this.isNoteRef(a)) {
      const note = this.extractNote(s, fragment)
      if (note) {
        this.cb.onFootnote?.({ ...note, target: { s, fragment } })
        return
      }
    }
    this.cb.onNavigate?.()
    void this.goTo({ s, fragment })
  }

  private isNoteRef(a: Element) {
    const type = `${a.getAttribute('data-epub-type') ?? ''} ${a.getAttribute('role') ?? ''}`
    if (/noteref|doc-noteref|doc-biblioref|glossref/.test(type)) return true
    if (/backlink/.test(type)) return false
    const text = (a.textContent ?? '').trim()
    return !!a.closest('sup') || !!a.querySelector('sup') || (/^[[(]?\d{1,3}[\])]?$|^[*†‡§]+$/.test(text) && text.length <= 5)
  }

  private extractNote(s: number, fragment: string): { html: DocumentFragment; title: string } | null {
    if (!fragment) return null
    let el: Element | null = null
    const ch = this.chapters[s]
    const sel = `[id="${CSS.escape(fragment)}"], [name="${CSS.escape(fragment)}"]`
    if (ch.rendered) el = ch.section.querySelector(sel)
    else el = prepareChapter(this.book, s)?.body.querySelector(sel) ?? null
    if (!el) return null
    // Si el destino es un elemento en línea, subimos hasta el bloque que contiene la nota
    const inline = /^(a|span|sup|sub|em|strong|i|b|small)$/i
    while (el && inline.test(el.localName) && el.parentElement && !/^(body|section)$/i.test(el.parentElement.localName)) el = el.parentElement
    if (!el || (el.textContent ?? '').length > 4000) return null
    const frag = document.createDocumentFragment()
    const clone = document.importNode(el, true) as Element
    clone.removeAttribute('id')
    for (const res of clone.querySelectorAll('[data-res]')) {
      const url = this.resourceUrl(res.getAttribute('data-res')!)
      if (url) res.setAttribute('src', url)
    }
    frag.append(clone)
    return { html: frag, title: 'Nota' }
  }

  // ——— Subrayados ———

  setAnnotations(list: Annotation[]) {
    this.annotationsByChapter.clear()
    for (const a of list) {
      if (a.kind !== 'highlight') continue
      const arr = this.annotationsByChapter.get(a.s) ?? []
      arr.push(a)
      this.annotationsByChapter.set(a.s, arr)
    }
    this.chapters.forEach((ch, i) => {
      if (!ch.rendered) return
      for (const range of ch.ranges.values()) for (const hl of this.highlights.values()) hl.delete(range)
      ch.ranges.clear()
      this.applyAnnotations(i)
    })
  }

  private applyAnnotations(i: number) {
    const ch = this.chapters[i]
    if (!ch.index || !this.highlights.size) return
    for (const a of this.annotationsByChapter.get(i) ?? []) {
      const range = ch.index.range(a.start, a.end)
      if (!range) continue
      this.highlights.get(a.color)?.add(range)
      ch.ranges.set(a.id, range)
    }
  }

  /** Subrayado bajo un punto de la pantalla (para editarlo al tocarlo). */
  annotationAt(x: number, y: number): string | null {
    const caret = caretFromPoint(x, y)
    if (!caret) return null
    for (const ch of this.chapters) {
      if (!ch.rendered || !ch.section.contains(caret.node)) continue
      for (const [id, range] of ch.ranges) {
        try {
          if (range.isPointInRange(caret.node, caret.offset)) return id
        } catch {
          /* nodo fuera de rango */
        }
      }
    }
    return null
  }

  /** Convierte la selección actual en (capítulo, inicio, fin). */
  selectionInfo(sel: Selection): { s: number; start: number; end: number; text: string; rect: DOMRect } | null {
    if (!sel.rangeCount || sel.isCollapsed) return null
    const range = sel.getRangeAt(0)
    const section = (range.startContainer.nodeType === 1 ? (range.startContainer as Element) : range.startContainer.parentElement)?.closest('section.ch') as HTMLElement | null
    if (!section || !this.root.contains(section)) return null
    const s = Number(section.dataset.i)
    const index = this.chapters[s]?.index
    if (!index) return null
    const start = index.offsetOf(range.startContainer, range.startOffset)
    let end = section.contains(range.endContainer) ? index.offsetOf(range.endContainer, range.endOffset) : index.length
    if (start == null || end == null || end <= start) return null
    end = Math.min(end, start + 20000)
    const text = index.text(start, end).trim()
    if (!text) return null
    const rects = range.getClientRects()
    return { s, start, end, text, rect: rects[0] ?? range.getBoundingClientRect() }
  }

  // ——— Búsqueda ———

  chapterText(s: number): string {
    const ch = this.chapters[s]
    if (ch?.index) return ch.index.nodes.map((n) => n.data).join('')
    return prepareChapter(this.book, s)?.body.textContent ?? ''
  }

  async search(query: string, onHit: (hit: SearchHit) => void, signal: { cancelled: boolean }, limit = 400) {
    const q = normalizeForSearch(query.trim())
    if (q.length < 2) return 0
    let count = 0
    for (let s = 0; s < this.chapters.length && !signal.cancelled; s++) {
      const text = this.chapterText(s)
      const norm = normalizeForSearch(text)
      for (let at = norm.indexOf(q); at >= 0; at = norm.indexOf(q, at + q.length)) {
        onHit({
          s,
          start: at,
          end: at + q.length,
          before: text.slice(Math.max(0, at - 50), at).replace(/\s+/g, ' '),
          match: text.slice(at, at + q.length),
          after: text.slice(at + q.length, at + q.length + 70).replace(/\s+/g, ' '),
        })
        if (++count >= limit) return count
      }
      if (s % 4 === 3) await yieldToMain()
    }
    return count
  }

  async showHit(hit: SearchHit) {
    await this.goTo({ s: hit.s, c: hit.start }, { offset: this.scroller.clientHeight * 0.3 })
    const range = this.chapters[hit.s].index?.range(hit.start, hit.end)
    if (range && this.searchHighlight) {
      this.searchHighlight.clear()
      this.searchHighlight.add(range)
    }
  }

  clearSearchHighlight() {
    this.searchHighlight?.clear()
  }

  /** Palabras por píxel del capítulo visible (para el autoscroll por palabras/minuto). */
  wordsPerPixel(): number {
    const ch = this.chapters[this.current]
    const h = ch?.section.getBoundingClientRect().height ?? 0
    const words = this.stats[this.current]?.words ?? 0
    if (ch?.rendered && h > 200 && words > 50) return words / h
    const fs = parseFloat(getComputedStyle(this.root).getPropertyValue('--fs')) || 18
    const lh = parseFloat(getComputedStyle(this.root).getPropertyValue('--lh')) || 1.6
    const width = this.root.clientWidth || 600
    return width / (fs * 0.5) / 5.8 / (fs * lh)
  }

  chapterWordsRatio(s: number) {
    const st = this.stats[s]
    return st && st.chars ? st.words / st.chars : 1 / 5.8
  }

  destroy() {
    this.destroyed = true
    this.observer.disconnect()
    this.root.removeEventListener('click', this.onClick)
    this.scroller.removeEventListener('scroll', this.onScroll)
    this.onScroll.cancel()
    cancelAnimationFrame(this.positionRaf)
    this.styleEl.remove()
    for (const url of this.blobUrls.values()) URL.revokeObjectURL(url)
    this.blobUrls.clear()
    if (highlightApi()) {
      for (const c of HL_COLORS) CSS.highlights.delete(`hl-${c}`)
      CSS.highlights.delete('search-hit')
    }
    this.root.replaceChildren()
  }
}
