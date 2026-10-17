export type RGB = [number, number, number]

export function parseHex(hex: string): RGB {
  let h = hex.trim().replace('#', '')
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const toHex = ([r, g, b]: RGB) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

export const rgba = (hex: string, alpha: number) => {
  const [r, g, b] = parseHex(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function channel(v: number) {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string) {
  const [r, g, b] = parseHex(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Contraste WCAG 2.x entre dos colores (1..21). */
export function contrast(a: string, b: string) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export const isDark = (hex: string) => luminance(hex) < 0.2

/** Texto legible (blanco o casi negro) sobre un color de fondo. */
export const readableOn = (hex: string) => (contrast(hex, '#ffffff') >= contrast(hex, '#141414') ? '#ffffff' : '#141414')

/**
 * Color de una fuente de luz a una temperatura dada (aprox. de Tanner Helland), normalizado a 0..1.
 * 6500 K ≈ blanco neutro; 1900 K ≈ luz de vela.
 */
export function kelvinToRgb(k: number): RGB {
  const t = k / 100
  let r: number, g: number, b: number
  if (t <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(t) - 161.1195681661
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  } else {
    r = 329.698727446 * (t - 60) ** -0.1332047592
    g = 288.1221695283 * (t - 60) ** -0.0755148492
    b = 255
  }
  const clamp = (v: number) => Math.max(0, Math.min(255, v)) / 255
  return [clamp(r), clamp(g), clamp(b)]
}

/** Intensidad 0..100 del filtro de luz azul → temperatura (6500 K → 1900 K). */
export const intensityToKelvin = (intensity: number) => 6500 - (Math.max(0, Math.min(100, intensity)) / 100) * 4600

/** Aplica el filtro de luz azul multiplicando cada canal por el color de la temperatura elegida. */
export function warm(hex: string, kelvin: number): string {
  const [r, g, b] = parseHex(hex)
  const [fr, fg, fb] = kelvinToRgb(kelvin)
  return toHex([r * fr, g * fg, b * fb])
}
