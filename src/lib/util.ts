export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

/** Ejecuta `fn` como mucho una vez cada `ms`, garantizando una última llamada. */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let last = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: A | undefined
  const run = () => {
    last = Date.now()
    timer = undefined
    const args = pending!
    pending = undefined
    fn(...args)
  }
  const wrapped = (...args: A) => {
    pending = args
    if (timer) return
    const wait = ms - (Date.now() - last)
    if (wait <= 0) run()
    else timer = setTimeout(run, wait)
  }
  wrapped.flush = () => {
    if (timer) {
      clearTimeout(timer)
      run()
    }
  }
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    pending = undefined
  }
  return wrapped
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: A | undefined
  const wrapped = (...args: A) => {
    pending = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      fn(...pending!)
    }, ms)
  }
  wrapped.flush = () => {
    if (!timer) return
    clearTimeout(timer)
    timer = undefined
    fn(...pending!)
  }
  return wrapped
}

/** Fecha local en formato YYYY-MM-DD (las rachas se cuentan por día local, no UTC). */
export function dayKey(d: Date | number = new Date()): string {
  const date = typeof d === 'number' ? new Date(d) : d
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${day}`
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + n))
}

const nf = new Intl.NumberFormat('es')
export const fmtNum = (n: number) => nf.format(Math.round(n))

export function fmtDuration(ms: number, short = false): string {
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 1) return short ? '<1 min' : 'menos de 1 min'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Hash rápido (FNV-1a) para colores deterministas de portadas, etc. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Identificador de libro estable: SHA-1 del archivo (en trozos para no duplicar memoria). */
export async function fileId(data: ArrayBuffer): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-1', data)
    return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  // crypto.subtle no existe en contextos inseguros: degradamos a FNV del contenido muestreado
  const bytes = new Uint8Array(data)
  let h = 0x811c9dc5
  const step = Math.max(1, Math.floor(bytes.length / 65536))
  for (let i = 0; i < bytes.length; i += step) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16) + bytes.length.toString(16)
}

export const isTouch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function countWords(text: string): number {
  // \S+ cuenta igual en español e inglés; para escrituras sin espacios (CJK) aproximamos por caracteres
  const m = text.match(/\S+/g)
  if (!m) return 0
  let n = m.length
  const cjk = text.match(/[぀-ヿ㐀-䶿一-鿿가-힯]/g)
  if (cjk && cjk.length > n) n = Math.round(cjk.length / 1.5)
  return n
}

/** Días naturales entre dos claves YYYY-MM-DD (b - a). */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

/** ¿El título ya numera el capítulo («Capítulo 2», «2. El viaje», «Parte IV»)? Entonces no se le añade un «N de M» que podría contradecirlo. */
export const numbersItself = (title: string) => /^(?:\p{L}+\.?\s+)?(?:\d+|[IVXLCDM]+)(?![\p{L}\d])/u.test(title.trim())
