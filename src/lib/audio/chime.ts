// Avisos sonoros del pomodoro, sintetizados con osciladores (sin archivos de audio).
import { audio, hold, release } from './context'

type ChimeName = 'campana' | 'cuenco' | 'madera' | 'ninguno'

interface Overtone {
  ratio: number
  gain: number
  decay: number
}

const VOICES: Record<Exclude<ChimeName, 'ninguno'>, { freq: number; partials: Overtone[]; gap: number }> = {
  // Campana: parciales inarmónicos típicos de una campana pequeña
  campana: {
    freq: 880,
    gap: 0.32,
    partials: [
      { ratio: 1, gain: 0.5, decay: 1.6 },
      { ratio: 2.76, gain: 0.22, decay: 0.9 },
      { ratio: 5.4, gain: 0.12, decay: 0.5 },
      { ratio: 8.93, gain: 0.06, decay: 0.3 },
    ],
  },
  // Cuenco tibetano: grave, largo y con batido suave
  cuenco: {
    freq: 392,
    gap: 0.9,
    partials: [
      { ratio: 1, gain: 0.5, decay: 4.5 },
      { ratio: 1.006, gain: 0.3, decay: 4.5 },
      { ratio: 2.71, gain: 0.2, decay: 2.8 },
      { ratio: 5.12, gain: 0.08, decay: 1.6 },
    ],
  },
  // Bloque de madera: seco y breve
  madera: {
    freq: 760,
    gap: 0.22,
    partials: [
      { ratio: 1, gain: 0.6, decay: 0.09 },
      { ratio: 2.3, gain: 0.25, decay: 0.05 },
    ],
  },
}

export function playChime(name: ChimeName, times = 2) {
  if (name === 'ninguno') return
  try {
    const { ctx, out } = audio()
    hold('chime')
    const voice = VOICES[name]
    let end = ctx.currentTime
    for (let n = 0; n < times; n++) {
      const t0 = ctx.currentTime + 0.05 + n * voice.gap
      for (const p of voice.partials) {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.frequency.value = voice.freq * p.ratio * (n % 2 ? 1.122 : 1)
        g.gain.setValueAtTime(0, t0)
        g.gain.linearRampToValueAtTime(p.gain * 0.35, t0 + 0.008)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + p.decay)
        osc.connect(g).connect(out)
        osc.start(t0)
        osc.stop(t0 + p.decay + 0.05)
        end = Math.max(end, t0 + p.decay)
      }
    }
    release('chime', (end - ctx.currentTime) * 1000 + 600)
  } catch {
    /* audio no disponible */
  }
}
