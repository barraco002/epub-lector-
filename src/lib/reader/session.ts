// Sesión de lectura: tiempo activo, palabras leídas y avisos de progreso.
// - El tiempo solo cuenta si hubo interacción reciente (o autoscroll) y la app está visible.
// - Las palabras se limitan con un "cubo" a ~800 ppm: saltar capítulos o hojear no suma.
import { signal } from '@preact/signals'
import type { BookRecord, Position } from '../db'
import { addReading, bookFinished, chapterDone } from '../game/game'
import { settings } from '../settings'
import { toast } from '../toasts'
import { fmtNum } from '../util'
import type { PositionInfo } from './engine'

const IDLE_MS = 3 * 60_000
const TICK_MS = 10_000
const MAX_CHARS_PER_MS = (800 * 5.8) / 60_000
const BUCKET_CAP = 6000

export interface SessionView {
  ms: number
  words: number
  startProgress: number
  progress: number
  /** Fracción del libro realmente leída en esta sesión (sin contar saltos) */
  readFraction: number
}

export class ReadingSession {
  readonly view = signal<SessionView>({ ms: 0, words: 0, startProgress: 0, progress: 0, readFraction: 0 })
  private readChars = 0
  chaptersDone = 0
  private lastAbs: number | null = null
  private lastPosAt = performance.now()
  private bucket = 2000
  private lastActivity = performance.now()
  private lastTick = performance.now()
  private timer: ReturnType<typeof setInterval> | undefined
  private pendingMs = 0
  private pendingWords = 0
  private wordsShown = 0
  private percentShown = 0
  private lastChapter = -1
  private lastChapterProgress = 0
  private finishedNotified: boolean
  isAutoscrolling = () => false
  isRaining = () => false

  constructor(
    private book: BookRecord,
    private wordsPerChar: (s: number) => number,
    private onFinished: () => void,
  ) {
    this.finishedNotified = book.status === 'finished'
    this.view.value = { ms: 0, words: 0, startProgress: book.progress, progress: book.progress, readFraction: 0 }
    this.timer = setInterval(() => this.tick(), TICK_MS)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  activity() {
    this.lastActivity = performance.now()
  }

  /** Navegación explícita (índice, búsqueda, barra): la siguiente posición no cuenta como lectura. */
  markJump() {
    this.lastAbs = null
  }

  onPosition(pos: Position, info: PositionInfo) {
    const now = performance.now()
    this.bucket = Math.min(BUCKET_CAP, this.bucket + (now - this.lastPosAt) * MAX_CHARS_PER_MS)
    this.lastPosAt = now
    if (this.lastAbs != null) {
      const delta = info.absChars - this.lastAbs
      if (delta > 0) {
        const counted = Math.min(delta, this.bucket)
        this.bucket -= counted
        this.readChars += counted
        this.pendingWords += counted * this.wordsPerChar(pos.s)
      }
    }
    this.lastAbs = info.absChars
    this.activity()

    // Capítulo terminado: avanzamos al siguiente habiendo pasado por el final del anterior
    if (this.lastChapter >= 0 && pos.s === this.lastChapter + 1 && this.lastChapterProgress > 0.85) {
      if (settings.value.toastChapter && settings.value.toastsEnabled) {
        toast({ kind: 'progress', icon: '📖', title: `Capítulo terminado`, body: `+10 XP · vas en ${Math.round(info.progress * 100)}%`, bar: info.progress })
      }
      chapterDone()
      this.chaptersDone++
    }
    this.lastChapter = pos.s
    this.lastChapterProgress = info.chapterProgress

    const v = this.view.value
    this.view.value = { ...v, progress: info.progress, readFraction: Math.min(1, this.readChars / Math.max(1, this.book.totalChars)) }
    this.checkMilestones(info.progress)

    if (!this.finishedNotified && info.progress >= 0.995) {
      this.finishedNotified = true
      this.flush()
      bookFinished({ ...this.book, progress: 1 })
      this.onFinished()
    }
  }

  private checkMilestones(progress: number) {
    const s = settings.value
    if (!s.toastsEnabled) return
    const v = this.view.value
    const words = v.words + this.pendingWords
    if (s.toastWords > 0) {
      const step = Math.floor(words / s.toastWords)
      if (step > this.wordsShown) {
        this.wordsShown = step
        toast({ kind: 'progress', icon: '✍️', title: `Leíste ${fmtNum(step * s.toastWords)} palabras`, body: 'en esta sesión', bar: progress })
        return
      }
    }
    if (s.toastPercent > 0) {
      const gained = v.readFraction * 100
      const step = Math.floor(gained / s.toastPercent)
      if (step > this.percentShown) {
        this.percentShown = step
        toast({
          kind: 'progress',
          icon: '📈',
          title: `Avanzaste ${Math.round(gained)}%`,
          body: `en esta sesión · vas en ${Math.round(progress * 100)}%`,
          bar: progress,
        })
      }
    }
  }

  // En segundo plano no queda ningún temporizador vivo
  private onVisibility = () => {
    if (document.hidden) {
      this.tick(true)
      clearInterval(this.timer)
      this.timer = undefined
    } else {
      this.lastTick = performance.now()
      this.lastActivity = performance.now()
      this.timer ??= setInterval(() => this.tick(), TICK_MS)
    }
  }

  private tick(final = false) {
    const now = performance.now()
    const elapsed = Math.min(now - this.lastTick, TICK_MS * 1.5)
    this.lastTick = now
    const active = !document.hidden || final
    if (active && (now - this.lastActivity < IDLE_MS || this.isAutoscrolling())) this.pendingMs += elapsed
    this.flush()
  }

  flush() {
    const ms = Math.round(this.pendingMs)
    const words = Math.round(this.pendingWords)
    if (ms < 1000 && words < 1) return
    this.pendingMs -= ms
    this.pendingWords -= words
    const v = this.view.value
    const next = { ...v, ms: v.ms + ms, words: v.words + words }
    this.view.value = next
    addReading({
      ms,
      words,
      bookId: this.book.id,
      sessionMs: next.ms,
      rain: this.isRaining(),
      autoscroll: this.isAutoscrolling(),
      language: this.book.language,
    })
  }

  end() {
    this.tick(true)
    clearInterval(this.timer)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }
}
