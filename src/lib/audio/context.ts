// AudioContext compartido. Se suspende en cuanto nada suena: un contexto activo mantiene
// despierto el hilo de audio del sistema y gasta batería aunque esté en silencio.

let ctx: AudioContext | null = null
let out: GainNode | null = null
const holds = new Set<string>()
let suspendTimer: ReturnType<typeof setTimeout> | undefined

export function audio() {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new Ctor({ latencyHint: 'playback' })
    out = ctx.createGain()
    out.connect(ctx.destination)
  }
  return { ctx, out: out! }
}

export function hold(reason: string) {
  holds.add(reason)
  clearTimeout(suspendTimer)
  const { ctx } = audio()
  if (ctx.state !== 'running') void ctx.resume().catch(() => {})
}

export function release(reason: string, delayMs = 1500) {
  holds.delete(reason)
  if (holds.size || !ctx) return
  clearTimeout(suspendTimer)
  suspendTimer = setTimeout(() => {
    if (!holds.size && ctx?.state === 'running') void ctx.suspend().catch(() => {})
  }, delayMs)
}

export const isHeld = (reason: string) => holds.has(reason)
