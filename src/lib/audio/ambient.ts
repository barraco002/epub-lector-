// Mezclador de sonidos ambientales.
// Cada sonido activo = 2 reproducciones del mismo búfer mono desfasadas (izquierda/derecha),
// lo que da un estéreo amplio sin duplicar memoria. Nada se procesa en JavaScript en tiempo real.
import { computed, effect, signal } from '@preact/signals'
import { settings, updateSound } from '../settings'
import { audio, hold, release } from './context'
import BakeWorker from './bake.worker?worker&inline'
import type { BakeInput, BakeRequest, BakeResponse } from './bake.worker'
import { isNative, onAudioControl, setAudioActive } from '../native'
import { t } from '../i18n'

export interface Preset {
  id: string
  name: string
  icon: string
  volumes: Record<string, number>
}

export const PRESETS: Preset[] = [
  { id: 'tarde-lluvia', name: 'Tarde de lluvia', icon: '☔', volumes: { lluvia: 0.6, ventana: 0.25, marron: 0.12 } },
  { id: 'cabana', name: 'Cabaña', icon: '🛖', volumes: { fuego: 0.55, lluvia: 0.3, viento: 0.15 } },
  { id: 'tormenta', name: 'Tormenta nocturna', icon: '🌩️', volumes: { tormenta: 0.6, viento: 0.2 } },
  { id: 'playa', name: 'Playa', icon: '🏖️', volumes: { olas: 0.7, viento: 0.12 } },
  { id: 'bosque', name: 'Bosque', icon: '🌲', volumes: { bosque: 0.6, arroyo: 0.3 } },
  { id: 'noche', name: 'Noche de verano', icon: '🌙', volumes: { grillos: 0.45, viento: 0.1 } },
  { id: 'biblioteca', name: 'Biblioteca', icon: '📖', volumes: { rosa: 0.18, ventilador: 0.25 } },
  { id: 'enfoque', name: 'Enfoque profundo', icon: '🎧', volumes: { marron: 0.55 } },
]

const RAIN_IDS = ['lluvia', 'ventana', 'tormenta']

interface Voice {
  sources: AudioBufferSourceNode[]
  gain: GainNode
}

export const playing = signal(false)
const voices = new Map<string, Voice>()
const starting = new Set<string>()
const buffers = new Map<string, AudioBuffer>()
let bus: GainNode | null = null
let thunderTimer: ReturnType<typeof setTimeout> | undefined
let sleepTimer: ReturnType<typeof setTimeout> | undefined
let resumeOnVisible = false
let resumeAfterInterrupt = false

export const activeIds = computed(() => Object.entries(settings.value.sound.volumes).filter(([, v]) => v > 0).map(([id]) => id))
export const rainPlaying = computed(() => playing.value && activeIds.value.some((id) => RAIN_IDS.includes(id)))

function getBus() {
  const { ctx, out } = audio()
  if (!bus) {
    bus = ctx.createGain()
    bus.gain.value = settings.value.sound.master
    bus.connect(out)
  }
  return { ctx, bus }
}

// ——— Generación en segundo plano (Web Worker) ———
let worker: Worker | null = null
let workerIdle: ReturnType<typeof setTimeout> | undefined
let nextReq = 1
const requests = new Map<number, (r: BakeResponse) => void>()

function bakeInWorker(req: BakeInput): Promise<{ data: Float32Array; rate: number } | null> {
  if (!worker) {
    worker = new BakeWorker()
    worker.onmessage = (e: MessageEvent<BakeResponse>) => {
      requests.get(e.data.id)?.(e.data)
      requests.delete(e.data.id)
    }
  }
  clearTimeout(workerIdle)
  const id = nextReq++
  return new Promise((resolve) => {
    requests.set(id, (r) => {
      resolve('error' in r ? null : r)
      // Sin trabajo pendiente durante un rato, liberamos el worker y su memoria
      if (!requests.size) workerIdle = setTimeout(() => (worker?.terminate(), (worker = null)), 30_000)
    })
    worker!.postMessage({ ...req, id } as BakeRequest)
  })
}

const pendingBuffers = new Map<string, Promise<AudioBuffer | null>>()

function bufferFor(id: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(id)
  if (cached) return Promise.resolve(cached)
  let p = pendingBuffers.get(id)
  if (!p) {
    const { ctx } = audio()
    p = bakeInWorker({ kind: 'sound', sound: id, ctxRate: ctx.sampleRate, seed: 0x1234 + id.length * 7919 }).then((res) => {
      pendingBuffers.delete(id)
      if (!res) return null
      const buf = ctx.createBuffer(1, res.data.length, res.rate)
      buf.copyToChannel(res.data as Float32Array<ArrayBuffer>, 0)
      buffers.set(id, buf)
      // Solo guardamos los 5 búferes más recientes (cada uno ocupa 1-5 MB)
      if (buffers.size > 5) {
        const victim = [...buffers.keys()].find((k) => !voices.has(k) && k !== id)
        if (victim) buffers.delete(victim)
      }
      return buf
    })
    pendingBuffers.set(id, p)
  }
  return p
}

function startVoice(id: string) {
  if (voices.has(id) || starting.has(id)) return
  starting.add(id)
  void bufferFor(id).then((buf) => {
    starting.delete(id)
    // Puede que mientras se generaba se haya pausado o quitado el sonido
    const volume = settings.value.sound.volumes[id] ?? 0
    if (!buf || !playing.value || volume <= 0 || voices.has(id)) return
    const { ctx, bus } = getBus()
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.4)
    const merger = ctx.createChannelMerger(2)
    const sources = [0, 1].map((ch) => {
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      src.connect(merger, 0, ch)
      src.start(ctx.currentTime, (ch * 0.5 + Math.random() * 0.1) * buf.duration)
      return src
    })
    merger.connect(gain).connect(bus)
    voices.set(id, { sources, gain })
    if (id === 'tormenta') scheduleThunder()
  })
}

function stopVoice(id: string, fade = 0.35) {
  const v = voices.get(id)
  if (!v) return
  voices.delete(id)
  const { ctx } = audio()
  v.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3)
  for (const s of v.sources) s.stop(ctx.currentTime + fade + 0.1)
  if (id === 'tormenta') clearTimeout(thunderTimer)
}

let thunderBuffers: AudioBuffer[] = []
function scheduleThunder() {
  clearTimeout(thunderTimer)
  thunderTimer = setTimeout(() => {
    if (!playing.value || !voices.has('tormenta')) return
    const { ctx, bus } = getBus()
    if (!thunderBuffers.length) {
      // Primer trueno: se generan en segundo plano y suena el siguiente
      void Promise.all([11, 23, 37].map((seed) => bakeInWorker({ kind: 'thunder', rate: 22050, seed }))).then((list) => {
        thunderBuffers = list.filter(Boolean).map((r) => {
          const b = ctx.createBuffer(1, r!.data.length, r!.rate)
          b.copyToChannel(r!.data as Float32Array<ArrayBuffer>, 0)
          return b
        })
      })
      scheduleThunder()
      return
    }
    const src = ctx.createBufferSource()
    src.buffer = thunderBuffers[Math.floor(Math.random() * thunderBuffers.length)]
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.4 - 0.7
    const g = ctx.createGain()
    g.gain.value = (settings.value.sound.volumes.tormenta ?? 0.5) * (0.5 + Math.random() * 0.7)
    src.connect(pan).connect(g).connect(bus)
    src.start()
    scheduleThunder()
  }, 14_000 + Math.random() * 30_000)
}

export function play() {
  if (!activeIds.value.length) return
  hold('ambient')
  const { ctx, bus } = getBus()
  bus.gain.cancelScheduledValues(ctx.currentTime)
  bus.gain.setTargetAtTime(settings.value.sound.master, ctx.currentTime, 0.2)
  for (const id of activeIds.value) startVoice(id)
  playing.value = true
  armSleep()
}

export function pause() {
  if (!playing.value) return
  playing.value = false
  starting.clear()
  for (const id of [...voices.keys()]) stopVoice(id)
  clearTimeout(sleepTimer)
  release('ambient', 800)
}

export function toggle() {
  if (playing.value) pause()
  else play()
}

export function setVolume(id: string, volume: number) {
  const volumes = { ...settings.value.sound.volumes, [id]: volume }
  if (volume <= 0) delete volumes[id]
  updateSound({ volumes })
  if (!playing.value) {
    if (volume > 0) play()
    return
  }
  if (volume <= 0) {
    stopVoice(id)
    if (!voices.size) pause()
    return
  }
  const v = voices.get(id)
  if (v) v.gain.gain.setTargetAtTime(volume, audio().ctx.currentTime, 0.08)
  else startVoice(id)
}

export function applyPreset(p: Preset) {
  const prev = [...voices.keys()]
  updateSound({ volumes: { ...p.volumes } })
  if (playing.value) {
    for (const id of prev) if (!(id in p.volumes)) stopVoice(id, 1)
    for (const [id, v] of Object.entries(p.volumes)) {
      const voice = voices.get(id)
      if (voice) voice.gain.gain.setTargetAtTime(v, audio().ctx.currentTime, 0.3)
      else startVoice(id)
    }
  } else play()
}

export function stopAll() {
  pause()
  updateSound({ volumes: {} })
}

function armSleep() {
  clearTimeout(sleepTimer)
  const min = settings.value.sound.sleepMin
  if (!min) return
  sleepTimer = setTimeout(() => {
    if (!playing.value || !bus) return
    const { ctx } = audio()
    bus.gain.setTargetAtTime(0, ctx.currentTime, 6) // fundido suave de ~20 s
    setTimeout(pause, 20_000)
  }, min * 60_000)
}

// Volumen general en vivo
effect(() => {
  const m = settings.value.sound.master
  if (bus && playing.value) bus.gain.setTargetAtTime(m, audio().ctx.currentTime, 0.05)
})

/** Con la opción activa (Android), un servicio mantiene el sonido con la pantalla apagada. */
const keepsPlayingHidden = () => isNative() && settings.value.sound.screenOff

// Ahorro de batería: pausa al salir de la app y reanuda al volver
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (playing.value && settings.value.sound.pauseOnHide && !keepsPlayingHidden()) {
      resumeOnVisible = true
      pause()
    }
  } else if (resumeOnVisible) {
    resumeOnVisible = false
    play()
  }
})

// Android: foco de audio (llamadas, otra música, auriculares desconectados) y servicio de pantalla apagada
let lastAudioState = ''
effect(() => {
  const on = playing.value
  const screenOff = settings.value.sound.screenOff
  const preset = PRESETS.find((p) => sameMix(p.volumes, settings.value.sound.volumes))
  const title = preset ? `${preset.icon} ${t(preset.name)}` : t('Sonido ambiente')
  // Solo cuando cambia algo que le importa al sistema (no en cada ajuste)
  const key = `${on}|${screenOff}|${on ? title : ''}`
  if (key === lastAudioState) return
  lastAudioState = key
  void setAudioActive(on, screenOff, title)
})
onAudioControl((action, transient) => {
  if (action === 'pause' && playing.value) {
    resumeAfterInterrupt = transient
    resumeOnVisible = false
    pause()
  } else if (action === 'resume' && resumeAfterInterrupt) {
    resumeAfterInterrupt = false
    play()
  }
})

function sameMix(a: Record<string, number>, b: Record<string, number>) {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => k in b)
}

export function resetSleepTimer() {
  if (playing.value) armSleep()
}
