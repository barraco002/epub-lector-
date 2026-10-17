// Pomodoro basado en marcas de tiempo: un único setTimeout hasta el final de la fase.
// No hay "tic" cada segundo; la interfaz solo se refresca mientras está visible.
import { computed, signal } from '@preact/signals'
import { settings } from './settings'
import { pomodoroDone } from './game/game'
import { toast } from './toasts'
import { playChime } from './audio/chime'
import { haptic } from './native'

export type Phase = 'focus' | 'short' | 'long'

export interface PomoState {
  phase: Phase
  running: boolean
  /** Momento de fin (ms epoch) si está en marcha */
  endsAt: number | null
  /** Restante (ms) si está en pausa */
  remaining: number
  /** Pomodoros de enfoque completados en este ciclo */
  cycle: number
  /** Hay una fase lista para empezar (tras completar otra sin autoinicio) */
  idle: boolean
}

const durationOf = (phase: Phase) => {
  const p = settings.value.pomo
  return (phase === 'focus' ? p.focus : phase === 'short' ? p.short : p.long) * 60_000
}

export const pomo = signal<PomoState>({ phase: 'focus', running: false, endsAt: null, remaining: durationOf('focus'), cycle: 0, idle: true })
/** Se emite al terminar una fase (lo usa el lector para la pantalla de descanso). */
export const pomoEvent = signal<{ ended: Phase; next: Phase; at: number; skipped: boolean } | null>(null)

export const inFocus = computed(() => pomo.value.running && pomo.value.phase === 'focus')
export const inBreak = computed(() => pomo.value.running && pomo.value.phase !== 'focus')

let timer: ReturnType<typeof setTimeout> | undefined

function arm() {
  clearTimeout(timer)
  const s = pomo.value
  if (!s.running || !s.endsAt) return
  // Los navegadores limitan temporizadores largos en segundo plano: revisamos al volver
  timer = setTimeout(complete, Math.max(0, s.endsAt - Date.now()))
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return
  const s = pomo.value
  if (s.running && s.endsAt && Date.now() >= s.endsAt) complete()
  else arm()
})

export function remainingMs(now = Date.now()) {
  const s = pomo.value
  return s.running && s.endsAt ? Math.max(0, s.endsAt - now) : s.remaining
}

export function start(phase?: Phase) {
  const s = pomo.value
  if (s.running && (phase === undefined || phase === s.phase)) return
  const ph = phase ?? s.phase
  const fresh = phase !== undefined && phase !== s.phase
  const remaining = fresh || s.idle ? durationOf(ph) : s.remaining
  pomo.value = { ...s, phase: ph, running: true, idle: false, endsAt: Date.now() + remaining, remaining }
  arm()
}

export function pause() {
  const s = pomo.value
  if (!s.running) return
  pomo.value = { ...s, running: false, remaining: remainingMs(), endsAt: null }
  clearTimeout(timer)
}

export function toggle() {
  if (pomo.value.running) pause()
  else start()
}

export function reset() {
  clearTimeout(timer)
  pomo.value = { phase: 'focus', running: false, endsAt: null, remaining: durationOf('focus'), cycle: 0, idle: true }
}

export function skip() {
  complete(true)
}

/** Ajustes cambiados: si no está en marcha, refleja la nueva duración. */
export function syncDurations() {
  const s = pomo.value
  if (!s.running && s.idle) pomo.value = { ...s, remaining: durationOf(s.phase) }
}

function complete(skipped = false) {
  clearTimeout(timer)
  const s = pomo.value
  const p = settings.value.pomo
  let cycle = s.cycle
  let next: Phase
  if (s.phase === 'focus') {
    if (!skipped) {
      cycle++
      pomodoroDone()
    }
    next = cycle > 0 && cycle % Math.max(1, p.every) === 0 ? 'long' : 'short'
  } else {
    next = 'focus'
    if (s.phase === 'long') cycle = 0
  }
  if (!skipped) {
    playChime(p.chime, s.phase === 'focus' ? 3 : 2)
    haptic('heavy')
    toast({
      kind: 'pomodoro',
      icon: s.phase === 'focus' ? '🍅' : '☀️',
      title: s.phase === 'focus' ? '¡Pomodoro completado! +25 XP' : 'Fin del descanso',
      body: s.phase === 'focus' ? (next === 'long' ? 'Toca un descanso largo' : 'Toca un descanso corto') : 'De vuelta a la lectura',
    })
  }
  const auto = next === 'focus' ? p.autoFocus : p.autoBreak
  pomo.value = { phase: next, running: false, endsAt: null, remaining: durationOf(next), cycle, idle: true }
  pomoEvent.value = { ended: s.phase, next, at: Date.now(), skipped }
  if (auto) start(next)
}

export const PHASE_LABEL: Record<Phase, string> = { focus: 'Enfoque', short: 'Descanso corto', long: 'Descanso largo' }
