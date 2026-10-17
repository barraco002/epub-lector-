// Índice de texto de un capítulo renderizado: convierte (nodo, desplazamiento) ⇄ desplazamiento
// de caracteres. Las posiciones de lectura, subrayados y búsquedas se guardan como caracteres,
// así sobreviven a cambios de fuente, tamaño o márgenes.

export class TextIndex {
  readonly nodes: Text[] = []
  readonly starts: number[] = []
  readonly length: number
  private readonly lookup = new WeakMap<Text, number>()

  constructor(readonly root: Element) {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let total = 0
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      this.lookup.set(n, this.nodes.length)
      this.nodes.push(n)
      this.starts.push(total)
      total += n.data.length
    }
    this.length = total
  }

  /** Desplazamiento de caracteres para un punto DOM (como el que da caretPositionFromPoint). */
  offsetOf(node: Node, offset: number): number | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const i = this.lookup.get(node as Text)
      return i == null ? null : this.starts[i] + Math.min(offset, (node as Text).data.length)
    }
    if (!this.root.contains(node)) return null
    // Punto dentro de un elemento: buscamos el primer texto a partir del hijo `offset`
    const child = node.childNodes[offset] ?? null
    const doc = this.root.ownerDocument
    const walker = doc.createTreeWalker(this.root, NodeFilter.SHOW_TEXT)
    if (child) {
      walker.currentNode = child
      const t = child.nodeType === Node.TEXT_NODE ? (child as Text) : (walker.nextNode() as Text | null)
      if (t) {
        const i = this.lookup.get(t)
        if (i != null) return this.starts[i]
      }
    }
    return this.length
  }

  /** Punto DOM para un desplazamiento de caracteres (búsqueda binaria). */
  pointAt(offset: number): { node: Text; offset: number } | null {
    const { nodes, starts } = this
    if (!nodes.length) return null
    const target = Math.max(0, Math.min(offset, this.length))
    let lo = 0
    let hi = nodes.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= target) lo = mid
      else hi = mid - 1
    }
    const node = nodes[lo]
    return { node, offset: Math.min(target - starts[lo], node.data.length) }
  }

  range(start: number, end: number): Range | null {
    const a = this.pointAt(start)
    const b = this.pointAt(end)
    if (!a || !b) return null
    const r = this.root.ownerDocument.createRange()
    r.setStart(a.node, a.offset)
    r.setEnd(b.node, b.offset)
    return r
  }

  /** Rectángulo visible de un desplazamiento (salta espacios en blanco que no tienen caja). */
  rectAt(offset: number): DOMRect | null {
    let p = this.pointAt(offset)
    for (let tries = 0; p && tries < 40; tries++) {
      const r = this.root.ownerDocument.createRange()
      r.setStart(p.node, p.offset)
      r.setEnd(p.node, Math.min(p.offset + 1, p.node.data.length))
      const rect = r.getClientRects()[0]
      if (rect && (rect.width || rect.height)) return rect
      const i = this.lookup.get(p.node)!
      if (p.offset + 1 < p.node.data.length) p = { node: p.node, offset: p.offset + 1 }
      else if (i + 1 < this.nodes.length) p = { node: this.nodes[i + 1], offset: 0 }
      else break
    }
    // Último recurso: la caja del elemento padre
    const el = p?.node.parentElement
    return el ? el.getBoundingClientRect() : null
  }

  text(start: number, end: number): string {
    return this.range(start, end)?.toString() ?? ''
  }
}

type CaretPoint = { node: Node; offset: number }

/** caretPositionFromPoint estándar con alternativa WebKit/Blink antigua. */
export function caretFromPoint(x: number, y: number): CaretPoint | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y)
    return p ? { node: p.offsetNode, offset: p.offset } : null
  }
  if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y)
    return r ? { node: r.startContainer, offset: r.startOffset } : null
  }
  return null
}
