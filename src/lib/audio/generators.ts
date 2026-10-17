// Sonidos ambientales procedurales. Cada uno se "hornea" una sola vez en un búfer mono que
// luego se reproduce en bucle: en tiempo real no hay filtros ni procesado en JavaScript,
// así que el coste de CPU (y batería) es prácticamente el de reproducir un archivo.

export interface Recipe {
  id: string
  name: string
  icon: string
  /** frecuencia de muestreo del búfer (los sonidos graves no necesitan 48 kHz) */
  rate: number | 'ctx'
  seconds: number
  /** volumen relativo tras normalizar */
  trim: number
  render: (n: number, sr: number, rnd: Rng) => Float32Array
}

export type Rng = () => number

/** xorshift32: rápido y determinista. Devuelve [0, 1). */
export function rng(seed = 0x9e3779b9): Rng {
  let x = seed >>> 0 || 1
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) / 4294967296
  }
}

const TAU = Math.PI * 2

function white(n: number, rnd: Rng) {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = rnd() * 2 - 1
  return out
}

/** Ruido rosa (filtro de Paul Kellet). */
function pink(n: number, rnd: Rng) {
  const out = new Float32Array(n)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
  return out
}

/** Ruido marrón (integración de ruido blanco con fuga). */
function brown(n: number, rnd: Rng) {
  const out = new Float32Array(n)
  let last = 0
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (rnd() * 2 - 1)) / 1.02
    out[i] = last * 3.5
  }
  return out
}

function lowpass(buf: Float32Array, cutoff: number, sr: number, passes = 1) {
  const a = 1 - Math.exp((-TAU * cutoff) / sr)
  for (let p = 0; p < passes; p++) {
    let y = buf[0]
    for (let i = 0; i < buf.length; i++) {
      y += a * (buf[i] - y)
      buf[i] = y
    }
  }
  return buf
}

function highpass(buf: Float32Array, cutoff: number, sr: number, passes = 1) {
  const a = Math.exp((-TAU * cutoff) / sr)
  for (let p = 0; p < passes; p++) {
    let prevX = buf[0]
    let y = 0
    for (let i = 0; i < buf.length; i++) {
      const x = buf[i]
      y = a * (y + x - prevX)
      prevX = x
      buf[i] = y
    }
  }
  return buf
}

/**
 * Modulación lenta y suave (suma de senos de fase aleatoria) normalizada a 0..1.
 * Se calcula cada 64 muestras e interpola linealmente: es lenta, no hace falta más.
 */
function slowMod(n: number, sr: number, rnd: Rng, freqs: number[]) {
  const phases = freqs.map(() => rnd() * TAU)
  const out = new Float32Array(n)
  const BLOCK = 64
  const at = (i: number) => {
    const t = i / sr
    let v = 0
    for (let k = 0; k < freqs.length; k++) v += Math.sin(TAU * freqs[k] * t + phases[k])
    return 0.5 + v / (2 * freqs.length)
  }
  let a = at(0)
  for (let i = 0; i < n; i += BLOCK) {
    const b = at(i + BLOCK)
    const end = Math.min(n, i + BLOCK)
    for (let j = i; j < end; j++) out[j] = a + ((b - a) * (j - i)) / BLOCK
    a = b
  }
  return out
}

/**
 * Gota / golpe: resonador de 2 polos excitado por un impulso más un poco de ruido que decae.
 * Recursivo (sin senos ni exponenciales por muestra): unas pocas multiplicaciones por muestra.
 */
function addDampedTone(buf: Float32Array, at: number, sr: number, freq: number, amp: number, decaySec: number, noise: number, rnd: Rng, glide = 1) {
  const len = Math.min(buf.length - at, Math.ceil(decaySec * 4.6 * sr))
  if (len <= 0) return
  const r = Math.exp(-1 / (decaySec * sr))
  const r2 = r * r
  let w = (TAU * freq) / sr
  let c = 2 * r * Math.cos(w)
  // Para el "glide" recalculamos el coeficiente cada 32 muestras
  const wEnd = (TAU * freq * glide) / sr
  const dw = glide === 1 ? 0 : (wEnd - w) / Math.max(1, len / 32)
  let y1 = 0
  let y2 = 0
  let env = amp * noise
  const tone = amp * (1 - noise) * Math.sin(w)
  for (let k = 0; k < len; k++) {
    if (dw && (k & 31) === 0 && k) {
      w += dw
      c = 2 * r * Math.cos(w)
    }
    const y = c * y1 - r2 * y2 + (k === 0 ? 1 : 0)
    y2 = y1
    y1 = y
    buf[at + k] += tone * y + env * (rnd() * 2 - 1)
    env *= r
  }
}

function addChirp(buf: Float32Array, at: number, sr: number, f0: number, f1: number, dur: number, amp: number, vibrato = 0) {
  const len = Math.min(buf.length - at, Math.floor(dur * sr))
  let phase = 0
  let f = f0
  for (let k = 0; k < len; k++) {
    if ((k & 15) === 0) f = f0 + ((f1 - f0) * k) / len + vibrato * Math.sin((TAU * 40 * k) / sr)
    phase += (TAU * f) / sr
    const x = k / len
    // ventana sin² aproximada por una parábola al cuadrado (sin trigonometría)
    const wdw = 4 * x * (1 - x)
    buf[at + k] += amp * wdw * wdw * Math.sin(phase)
  }
}

function rain(n: number, sr: number, rnd: Rng, o: { bed: number; dropsPerSec: number; fMin: number; fMax: number; decay: [number, number]; lp: number }) {
  const bed = highpass(pink(n, rnd), 380, sr, 2)
  lowpass(bed, o.lp, sr)
  const swell = slowMod(n, sr, rnd, [0.07, 0.13, 0.31])
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = bed[i] * o.bed * (0.75 + 0.25 * swell[i])
  const drops = Math.round((o.dropsPerSec * n) / sr)
  for (let d = 0; d < drops; d++) {
    const at = Math.floor(rnd() * n)
    const amp = 0.04 + 0.7 * rnd() ** 4
    const f = o.fMin + (o.fMax - o.fMin) * rnd()
    const decay = o.decay[0] + (o.decay[1] - o.decay[0]) * rnd()
    addDampedTone(out, at, sr, f, amp, decay, 0.55, rnd)
  }
  return lowpass(out, Math.min(11000, sr * 0.45), sr)
}

export const RECIPES: Recipe[] = [
  {
    id: 'lluvia', name: 'Lluvia', icon: '🌧️', rate: 32000, seconds: 9, trim: 1,
    render: (n, sr, rnd) => rain(n, sr, rnd, { bed: 0.9, dropsPerSec: 320, fMin: 1800, fMax: 6500, decay: [0.0012, 0.004], lp: 7000 }),
  },
  {
    id: 'ventana', name: 'Lluvia en la ventana', icon: '🪟', rate: 32000, seconds: 10, trim: 0.9,
    render: (n, sr, rnd) => {
      const out = rain(n, sr, rnd, { bed: 0.45, dropsPerSec: 70, fMin: 600, fMax: 2600, decay: [0.004, 0.012], lp: 3500 })
      // Gotas sueltas que resbalan: tonos descendentes
      const drips = Math.round((2.2 * n) / sr)
      for (let d = 0; d < drips; d++) addDampedTone(out, Math.floor(rnd() * n), sr, 900 + 900 * rnd(), 0.18 + 0.2 * rnd(), 0.018, 0.15, rnd, 0.6)
      return out
    },
  },
  {
    id: 'tormenta', name: 'Tormenta', icon: '⛈️', rate: 32000, seconds: 10, trim: 1.05,
    render: (n, sr, rnd) => {
      const out = rain(n, sr, rnd, { bed: 1.3, dropsPerSec: 650, fMin: 1200, fMax: 5200, decay: [0.0015, 0.005], lp: 4800 })
      const low = lowpass(brown(n, rnd), 300, sr)
      const gust = slowMod(n, sr, rnd, [0.05, 0.11])
      for (let i = 0; i < n; i++) out[i] += low[i] * 0.5 * (0.5 + gust[i])
      return out
    },
  },
  {
    id: 'viento', name: 'Viento', icon: '🌬️', rate: 22050, seconds: 24, trim: 0.9,
    render: (n, sr, rnd) => {
      const src = pink(n, rnd)
      const center = slowMod(n, sr, rnd, [0.04, 0.09, 0.17])
      const gust = slowMod(n, sr, rnd, [0.05, 0.12, 0.21])
      const out = new Float32Array(n)
      // Filtro de estado variable con frecuencia central cambiante (silbido del viento)
      let low = 0, band = 0
      const q = 0.45
      let f = 0
      for (let i = 0; i < n; i++) {
        if ((i & 63) === 0) f = 2 * Math.sin((Math.PI * (220 + 700 * center[i])) / sr)
        low += f * band
        const high = src[i] - low - q * band
        band += f * high
        out[i] = band * (0.25 + 0.75 * gust[i] ** 1.6)
      }
      return out
    },
  },
  {
    id: 'olas', name: 'Olas del mar', icon: '🌊', rate: 22050, seconds: 32, trim: 1,
    render: (n, sr, rnd) => {
      const b = brown(n, rnd)
      const p = pink(n, rnd)
      const env = new Float32Array(n)
      for (let t = 0.5 + rnd() * 2; t < n / sr + 6; t += 7 + rnd() * 4) {
        const rise = 2.4 + rnd() * 1.2
        const fall = 4 + rnd() * 2.5
        const peak = 0.6 + 0.4 * rnd()
        const start = Math.floor(t * sr)
        const riseN = Math.floor(rise * sr)
        const total = Math.floor((rise + fall * 3) * sr)
        const decay = Math.exp(-1 / (fall * sr))
        let v = 1
        for (let k = 0; k < total; k++) {
          const i = (start + k) % n // envolvemos para que el bucle sea continuo
          let e: number
          if (k < riseN) {
            const x = k / riseN
            e = x * x
          } else {
            v *= decay
            e = v
          }
          if (e * peak > env[i]) env[i] = e * peak
        }
      }
      const out = new Float32Array(n)
      let y = 0
      let a = 0
      for (let i = 0; i < n; i++) {
        if ((i & 31) === 0) a = 1 - Math.exp((-TAU * (250 + 2600 * env[i])) / sr)
        y += a * (0.6 * b[i] + 0.4 * p[i] - y)
        out[i] = y * (0.12 + 0.88 * env[i])
      }
      return out
    },
  },
  {
    id: 'fuego', name: 'Chimenea', icon: '🔥', rate: 32000, seconds: 12, trim: 1,
    render: (n, sr, rnd) => {
      const roar = lowpass(brown(n, rnd), 420, sr)
      const flick = slowMod(n, sr, rnd, [0.3, 0.7, 1.3])
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) out[i] = roar[i] * 0.55 * (0.55 + 0.45 * flick[i])
      const hiss = highpass(white(n, rnd), 3000, sr)
      for (let i = 0; i < n; i++) out[i] += hiss[i] * 0.012 * flick[i]
      // Chasquidos: ráfagas de 1-4 clics secos
      const bursts = Math.round((9 * n) / sr)
      for (let c = 0; c < bursts; c++) {
        const at = Math.floor(rnd() * n)
        const clicks = 1 + Math.floor(rnd() * 4)
        const amp = 0.08 + 0.6 * rnd() ** 2
        for (let k = 0; k < clicks; k++) {
          const start = at + Math.floor(rnd() * 0.02 * sr)
          const len = Math.floor((0.0006 + 0.002 * rnd()) * sr)
          for (let j = 0; j < len && start + j < n; j++) out[start + j] += amp * Math.exp(-j / (len / 4)) * (rnd() * 2 - 1)
        }
      }
      // Estallidos graves ocasionales
      const pops = Math.round((0.6 * n) / sr)
      for (let c = 0; c < pops; c++) addDampedTone(out, Math.floor(rnd() * n), sr, 140 + 260 * rnd(), 0.3 * rnd(), 0.012, 0.4, rnd)
      return out
    },
  },
  {
    id: 'bosque', name: 'Bosque', icon: '🐦', rate: 32000, seconds: 24, trim: 0.8,
    render: (n, sr, rnd) => {
      const bed = lowpass(pink(n, rnd), 1100, sr)
      const leaves = slowMod(n, sr, rnd, [0.08, 0.19])
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) out[i] = bed[i] * 0.35 * (0.6 + 0.4 * leaves[i])
      for (let t = rnd() * 1.5; t < n / sr - 1.5; t += 1.2 + rnd() * 3) {
        const amp = 0.05 + 0.18 * rnd()
        let at = Math.floor(t * sr)
        const kind = rnd()
        if (kind < 0.5) {
          const f0 = 2800 + rnd() * 1800
          const notes = 2 + Math.floor(rnd() * 4)
          for (let k = 0; k < notes; k++) {
            const dur = 0.06 + rnd() * 0.07
            addChirp(out, at, sr, f0 * (0.9 + rnd() * 0.2), f0 * (0.7 + rnd() * 0.6), dur, amp, 60)
            at += Math.floor((dur + 0.04 + rnd() * 0.05) * sr)
          }
        } else if (kind < 0.8) {
          const f0 = 4600 + rnd() * 900
          const notes = 8 + Math.floor(rnd() * 8)
          for (let k = 0; k < notes; k++) {
            addChirp(out, at, sr, f0 + (k % 2 ? 300 : -300), f0, 0.025, amp * 0.8)
            at += Math.floor(0.035 * sr)
          }
        } else {
          addChirp(out, at, sr, 1800 + rnd() * 400, 2500 + rnd() * 500, 0.3 + rnd() * 0.25, amp, 20)
        }
      }
      return out
    },
  },
  {
    id: 'grillos', name: 'Noche de grillos', icon: '🦗', rate: 'ctx', seconds: 12, trim: 0.55,
    render: (n, sr, rnd) => {
      const out = lowpass(brown(n, rnd), 500, sr)
      for (let i = 0; i < n; i++) out[i] *= 0.18
      const crickets = 3 + Math.floor(rnd() * 2)
      for (let c = 0; c < crickets; c++) {
        const f = 4000 + rnd() * 1000
        const period = 0.55 + rnd() * 0.35
        const pulses = 3 + Math.floor(rnd() * 2)
        const amp = 0.04 + 0.1 * rnd()
        for (let t = rnd() * period; t < n / sr - 0.2; t += period * (0.95 + rnd() * 0.1)) {
          for (let p = 0; p < pulses; p++) {
            const at = Math.floor((t + p * 0.03) * sr)
            const len = Math.floor(0.018 * sr)
            const w = (TAU * f) / sr
            for (let k = 0; k < len && at + k < n; k++) {
              const x = k / len
              const s1 = Math.sin(w * k)
              // sin(2wk) = 2·sin(wk)·cos(wk); la envolvente es una parábola
              out[at + k] += amp * 4 * x * (1 - x) * s1 * (0.7 + 0.6 * s1 * Math.cos(w * k))
            }
          }
        }
      }
      return out
    },
  },
  {
    id: 'arroyo', name: 'Arroyo', icon: '🏞️', rate: 32000, seconds: 14, trim: 0.9,
    render: (n, sr, rnd) => {
      const out = highpass(pink(n, rnd), 300, sr)
      lowpass(out, 2600, sr)
      for (let i = 0; i < n; i++) out[i] *= 0.6
      const bubbles = Math.round((45 * n) / sr)
      for (let b = 0; b < bubbles; b++) {
        const at = Math.floor(rnd() * n)
        const f0 = 320 + rnd() * 800
        addChirp(out, at, sr, f0, f0 * (1.3 + rnd() * 0.5), 0.015 + rnd() * 0.035, 0.03 + 0.12 * rnd())
      }
      return out
    },
  },
  {
    id: 'ventilador', name: 'Ventilador', icon: '🌀', rate: 16000, seconds: 6, trim: 0.9,
    render: (n, sr, rnd) => {
      const out = lowpass(brown(n, rnd), 900, sr)
      const air = lowpass(pink(n, rnd), 2200, sr)
      for (let i = 0; i < n; i++) {
        const t = i / sr
        out[i] = out[i] * 0.7 + air[i] * 0.2 + 0.018 * Math.sin(TAU * 100 * t) + 0.008 * Math.sin(TAU * 200 * t)
      }
      return out
    },
  },
  { id: 'blanco', name: 'Ruido blanco', icon: '⚪', rate: 'ctx', seconds: 5, trim: 0.55, render: (n, sr, rnd) => lowpass(white(n, rnd), 12000, sr) },
  { id: 'rosa', name: 'Ruido rosa', icon: '🌸', rate: 'ctx', seconds: 5, trim: 0.8, render: (n, _sr, rnd) => pink(n, rnd) },
  { id: 'marron', name: 'Ruido marrón', icon: '🟤', rate: 16000, seconds: 6, trim: 1, render: (n, _sr, rnd) => brown(n, rnd) },
]

/** Une el final con el principio (fundido de igual potencia) para un bucle sin cortes. */
export function loopable(buf: Float32Array, n: number, fade: number): Float32Array {
  const out = buf.slice(0, n)
  for (let i = 0; i < fade; i++) {
    const x = i / fade
    out[i] = buf[i] * Math.sqrt(x) + buf[n + i] * Math.sqrt(1 - x)
  }
  return out
}

/** Normaliza a un RMS común para que todos los deslizadores suenen parecido. */
export function normalize(buf: Float32Array, targetRms = 0.16) {
  let sum = 0
  let peak = 0
  for (let i = 0; i < buf.length; i++) {
    sum += buf[i] * buf[i]
    peak = Math.max(peak, Math.abs(buf[i]))
  }
  const rms = Math.sqrt(sum / buf.length) || 1
  const gain = Math.min(targetRms / rms, 0.95 / (peak || 1))
  for (let i = 0; i < buf.length; i++) buf[i] *= gain
  return buf
}

export function bake(recipe: Recipe, ctxRate: number, seed: number): { data: Float32Array; rate: number } {
  const rate = recipe.rate === 'ctx' ? ctxRate : recipe.rate
  const n = Math.floor(recipe.seconds * rate)
  const fade = Math.floor(0.6 * rate)
  const raw = recipe.render(n + fade, rate, rng(seed))
  return { data: normalize(loopable(raw, n, fade)), rate }
}

/** Trueno de un solo disparo para la tormenta. */
export function bakeThunder(rate: number, seed: number): Float32Array {
  const rnd = rng(seed)
  const n = Math.floor(7 * rate)
  const out = new Float32Array(n)
  const rumble = lowpass(brown(n, rnd), 140, rate, 2)
  const bumps = 3 + Math.floor(rnd() * 3)
  const env = new Float32Array(n)
  for (let b = 0; b < bumps; b++) {
    const center = 0.2 + rnd() * 3
    const width = 0.3 + rnd() * 0.9
    const h = 0.4 + rnd() * 0.6
    const from = Math.max(0, Math.floor((center - width * 3) * rate))
    const to = Math.min(n, Math.ceil((center + width * 3) * rate))
    for (let i = from; i < to; i += 32) {
      const t = i / rate
      const v = h * Math.exp(-(((t - center) / width) ** 2))
      for (let j = i; j < Math.min(to, i + 32); j++) env[j] += v
    }
  }
  const fade = Math.exp(-1 / (2.8 * rate))
  let g = 1
  for (let i = 0; i < n; i++) {
    out[i] = rumble[i] * env[i] * g
    g *= fade
  }
  const crack = lowpass(white(Math.floor(0.25 * rate), rnd), 2500, rate)
  for (let i = 0; i < crack.length; i++) out[i] += crack[i] * 0.35 * Math.exp(-i / (0.05 * rate))
  return normalize(out, 0.2)
}
