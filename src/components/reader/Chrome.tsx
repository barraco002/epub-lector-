import { useEffect, useState } from 'preact/hooks'
import { ArrowLeft, Bookmark, BookmarkCheck, Headphones, List, Maximize, Minimize, Minus, Moon, Palette, Pause, Play, Plus, Search, Sun, Timer, Type, X } from 'lucide-preact'
import { active, bookAnnotations, chrome, openPanel, panel, position } from './state'
import { blueActive } from '../../lib/appearance'
import { settings, update } from '../../lib/settings'
import { go } from '../../lib/router'
import { goalProgress, readingWpm, today } from '../../lib/game/game'
import { playing as soundPlaying } from '../../lib/audio/ambient'
import { pomo, remainingMs } from '../../lib/pomodoro'
import { annotations as annStore, type Annotation } from '../../lib/db'
import { isNative, setImmersive } from '../../lib/native'
import { fmtClock, fmtDuration, fmtNum, uid } from '../../lib/util'
import { info } from '../../lib/toasts'
import { IconButton, Ring } from '../ui'

/** Re-renderiza cada `ms` mientras el componente está montado y la app visible. */
export function useTicker(ms: number, enabled = true) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setInterval> | undefined
    const startTimer = () => {
      clearInterval(timer)
      timer = document.hidden ? undefined : setInterval(() => set((n) => n + 1), ms)
    }
    startTimer()
    document.addEventListener('visibilitychange', startTimer)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', startTimer)
    }
  }, [ms, enabled])
}

function minutesLeft() {
  const ctx = active.value
  if (!ctx) return { chapter: 0, book: 0 }
  const p = position.value
  const stats = ctx.record.chapters
  const chapterWords = stats[p.s]?.words ?? 0
  const wpm = readingWpm.value
  return {
    chapter: ((1 - p.chapterProgress) * chapterWords) / wpm,
    book: ((1 - p.progress) * ctx.record.totalWords) / wpm,
  }
}

const isBookmarked = (list: Annotation[], s: number, c: number) => list.find((a) => a.kind === 'bookmark' && a.s === s && Math.abs(a.start - c) < 400)

async function toggleBookmark() {
  const ctx = active.value
  if (!ctx) return
  const pos = ctx.engine.position()
  const existing = isBookmarked(bookAnnotations.value, pos.s, pos.c)
  if (existing) {
    await annStore.remove(existing.id)
    bookAnnotations.value = bookAnnotations.value.filter((a) => a.id !== existing.id)
    info('Marcador eliminado')
    return
  }
  const text = ctx.engine.chapterText(pos.s).slice(pos.c, pos.c + 140).replace(/\s+/g, ' ').trim()
  const a: Annotation = { id: uid(), bookId: ctx.record.id, kind: 'bookmark', s: pos.s, start: pos.c, end: pos.c, text, color: 'yellow', createdAt: Date.now() }
  await annStore.put(a)
  bookAnnotations.value = [...bookAnnotations.value, a]
  info('Marcador añadido', ctx.chapterLabel(pos.s))
}

// Las barras solo existen mientras el menú está visible: ocultas no cuestan nada al hacer scroll
export function TopBar() {
  const ctx = active.value
  if (!ctx || !chrome.value) return null
  const p = position.value
  const marked = !!isBookmarked(bookAnnotations.value, p.s, p.c)
  return (
    <header class="r-top">
      <IconButton label="Volver a la biblioteca" onClick={() => go({ name: 'library' })}>
        <ArrowLeft size={22} />
      </IconButton>
      <div class="r-top-title">
        <strong>{ctx.record.title}</strong>
        <span>{ctx.chapterLabel(p.s)}</span>
      </div>
      <IconButton label="Buscar en el libro" onClick={() => openPanel('search')}>
        <Search size={20} />
      </IconButton>
      <IconButton label={marked ? 'Quitar marcador' : 'Añadir marcador'} onClick={toggleBookmark} active={marked}>
        {marked ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
      </IconButton>
      <IconButton label="Índice, marcadores y subrayados" onClick={() => openPanel('toc')}>
        <List size={20} />
      </IconButton>
    </header>
  )
}

function SessionStrip() {
  const ctx = active.value
  if (!ctx) return null
  const v = ctx.session.view.value
  const gained = v.readFraction * 100
  return (
    <div class="session-strip">
      <Ring value={goalProgress.value} size={28} stroke={3} />
      <span>
        <strong>Sesión</strong> {fmtDuration(v.ms, true)} · {fmtNum(v.words)} palabras · +{gained.toFixed(1).replace('.', ',')}%
      </span>
      <span class="muted">Hoy {Math.floor(today.value.ms / 60000)}/{settings.value.dailyGoalMin} min</span>
    </div>
  )
}

function ProgressSlider() {
  const ctx = active.value!
  const p = position.value
  const [drag, setDrag] = useState<number | null>(null)
  const shown = drag ?? p.progress
  const preview = drag != null ? ctx.chapterLabel(ctx.engine.posFromAbs(drag * ctx.engine.totalChars).s) : ctx.chapterLabel(p.s)
  const left = minutesLeft()
  return (
    <div class="progress-block">
      <div class="progress-labels">
        <span class="progress-chapter">{preview}</span>
        <span class="progress-pct">{(shown * 100).toFixed(1).replace('.', ',')}%</span>
      </div>
      <input
        type="range"
        class="progress-range"
        min={0}
        max={1000}
        value={Math.round(shown * 1000)}
        aria-label="Progreso del libro"
        style={{ '--pct': `${shown * 100}%` }}
        onInput={(e) => setDrag(+(e.target as HTMLInputElement).value / 1000)}
        onChange={(e) => {
          const v = +(e.target as HTMLInputElement).value / 1000
          setDrag(null)
          ctx.session.markJump()
          void ctx.engine.goToProgress(v)
        }}
      />
      <div class="progress-labels muted small">
        <span>{left.chapter < 1 ? 'Termina el capítulo' : `${fmtDuration(left.chapter * 60000, true)} en el capítulo`}</span>
        <span>{fmtDuration(left.book * 60000, true)} en el libro</span>
      </div>
    </div>
  )
}

function PomoButton() {
  const st = pomo.value
  useTicker(1000, st.running && chrome.value)
  const label = st.running || !st.idle ? fmtClock(remainingMs()) : null
  return (
    <button type="button" class={`r-action ${st.running ? 'is-active' : ''}`} onClick={() => openPanel('pomo')} aria-label="Pomodoro">
      <Timer size={20} />
      <span>{label ?? 'Pomodoro'}</span>
    </button>
  )
}

export function BottomBar() {
  const ctx = active.value
  if (!ctx || !chrome.value) return null
  const fs = isNative() ? settings.value.fullscreen : !!document.fullscreenElement
  return (
    <footer class="r-bottom">
      <SessionStrip />
          <ProgressSlider />
          <nav class="r-actions">
            <button type="button" class={`r-action ${panel.value === 'typo' ? 'is-active' : ''}`} onClick={() => openPanel('typo')}>
              <Type size={20} />
              <span>Texto</span>
            </button>
            <button type="button" class={`r-action ${panel.value === 'theme' ? 'is-active' : ''}`} onClick={() => openPanel('theme')}>
              <Palette size={20} />
              <span>Tema</span>
            </button>
            <button type="button" class={`r-action ${soundPlaying.value ? 'is-active' : ''}`} onClick={() => openPanel('sound')}>
              <Headphones size={20} />
              <span>Sonidos</span>
            </button>
            <PomoButton />
            <button type="button" class={`r-action ${ctx.auto.running.value ? 'is-active' : ''}`} onClick={() => openPanel('auto')}>
              <Play size={20} />
              <span>Auto</span>
            </button>
            <button
              type="button"
              class={`r-action ${blueActive.value ? 'is-active' : ''}`}
              onClick={() => update({ blueLight: !settings.value.blueLight, blueSchedule: false })}
            >
              {blueActive.value ? <Moon size={20} /> : <Sun size={20} />}
              <span>Luz azul</span>
            </button>
            <button
              type="button"
              class="r-action"
              onClick={() => {
                const next = !fs
                if (isNative()) update({ fullscreen: next })
                void setImmersive(next)
              }}
            >
              {fs ? <Minimize size={20} /> : <Maximize size={20} />}
              <span>Pantalla</span>
            </button>
          </nav>
    </footer>
  )
}

function useBattery() {
  const [level, setLevel] = useState<number | null>(null)
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<EventTarget & { level: number }> }
    let battery: (EventTarget & { level: number }) | null = null
    const onChange = () => battery && setLevel(battery.level)
    nav.getBattery?.().then((b) => {
      battery = b
      onChange()
      b.addEventListener('levelchange', onChange)
    }).catch(() => {})
    return () => battery?.removeEventListener('levelchange', onChange)
  }, [])
  return level
}

/** Línea de estado discreta (hora, batería, capítulo, progreso) cuando el menú está oculto. */
export function StatusLine() {
  const s = settings.value
  const visible = s.showStatus && !chrome.value
  useTicker(30_000, visible)
  const battery = useBattery()
  const st = pomo.value
  if (!visible || !active.value) return null
  const p = position.value
  const left = minutesLeft()
  const now = new Date()
  return (
    <div class="status-line" aria-hidden="true">
      <span>{now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
      {st.running && <span>🍅 {Math.ceil(remainingMs() / 60000)}m</span>}
      <span class="status-mid">{left.chapter >= 1 ? `${Math.round(left.chapter)} min · cap.` : 'fin de cap.'}</span>
      <span>{(p.progress * 100).toFixed(1).replace('.', ',')}%</span>
      {battery != null && <span>{Math.round(battery * 100)}%🔋</span>}
    </div>
  )
}

export function EdgeProgress() {
  const mode = settings.value.progressBar
  if (mode === 'none') return null
  const p = position.value
  const v = mode === 'book' ? p.progress : mode === 'chapter' ? p.chapterProgress : goalProgress.value
  return (
    <div class={`edge-progress edge-${mode} edge-${settings.value.progressStyle}`} aria-hidden="true">
      <div class="edge-fill" style={{ transform: `scaleX(${v})` }} />
    </div>
  )
}

export function AutoPill() {
  const ctx = active.value
  const running = ctx?.auto.running.value ?? false
  const paused = ctx?.auto.paused.value ?? false
  const wpm = settings.value.autoWpm
  // Mientras avanza, los controles se apartan a los 2,5 s; reaparecen al pausar o cambiar la velocidad
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    setIdle(false)
    if (!running) return
    const t = setTimeout(() => setIdle(true), 2500)
    return () => clearTimeout(t)
  }, [running, wpm])
  if (!ctx || (!running && !paused)) return null
  const set = (v: number) => update({ autoWpm: Math.max(40, Math.min(1200, v)) })
  return (
    <div class={`auto-pill ${idle ? 'is-idle' : ''} ${paused ? 'is-paused' : ''}`} role="toolbar" aria-label="Autoscroll">
      <IconButton label="Más lento" onClick={() => set(wpm - 10)}>
        <Minus size={18} />
      </IconButton>
      <span class="auto-speed">
        {wpm} <small>ppm</small>
      </span>
      <IconButton label="Más rápido" onClick={() => set(wpm + 10)}>
        <Plus size={18} />
      </IconButton>
      {paused ? (
        <IconButton label="Reanudar autoscroll" onClick={() => ctx.auto.start()}>
          <Play size={18} />
        </IconButton>
      ) : (
        <IconButton label="Pausar autoscroll" onClick={() => ctx.auto.pause()}>
          <Pause size={18} />
        </IconButton>
      )}
      <IconButton label="Salir del modo auto" onClick={() => ctx.auto.stop()}>
        <X size={18} />
      </IconButton>
    </div>
  )
}
