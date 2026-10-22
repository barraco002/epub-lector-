import { useEffect, useRef, useState } from 'preact/hooks'
import { effect } from '@preact/signals'
import { annotations, books, type BookRecord, type Position } from '../../lib/db'
import { openEpub } from '../../lib/epub/book'
import { ReaderEngine } from '../../lib/reader/engine'
import { ReadingSession } from '../../lib/reader/session'
import { AutoScroller } from '../../lib/reader/autoscroll'
import { settings } from '../../lib/settings'
import { go, pushCloser } from '../../lib/router'
import { patchBook } from '../../lib/library'
import { haptic, onVolumeKey, setBrightness, setImmersive, setKeepAwake, setVolumeKeys } from '../../lib/native'
import { rainPlaying } from '../../lib/audio/ambient'
import { bgImageUrl } from '../../lib/background'
import * as ambient from '../../lib/audio/ambient'
import { inBreak, pomoEvent, inFocus } from '../../lib/pomodoro'
import * as pomodoro from '../../lib/pomodoro'
import { numbersItself, prefersReducedMotion, throttle } from '../../lib/util'
import { error as toastError, pendingCelebrations } from '../../lib/toasts'
import { flushGame, profile } from '../../lib/game/game'
import { sessionSummary } from '../../lib/summary'
import { active, bookAnnotations, chapterPill, chrome, flattenToc, hereMark, openPanel, panel, position, returnSpot, type ActiveReader } from './state'
import { BottomBar, ChapterPill, EdgeProgress, StatusLine, TopBar, AutoPill, ReturnChip, HereMark } from './Chrome'
import { Panels } from './Panels'
import { SelectionLayer } from './Selection'
import { BreakOverlay, FootnotePopup, ImageViewer, type FootnoteData } from './Overlays'

const TAP_MAX_MS = 350
const TAP_MAX_MOVE = 10

export function Reader({ bookId }: { bookId: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [footnote, setFootnote] = useState<FootnoteData | null>(null)
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null)
  const [breakShown, setBreakShown] = useState(false)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    let cancelled = false
    let ctx: ActiveReader | null = null
    let record: BookRecord | null = null
    let xpAtOpen = 0
    let finishedNow = false
    const cleanups: (() => void)[] = []
    const scroller = scrollerRef.current!
    const root = rootRef.current!

    const save = throttle((pos: Position, progress: number) => {
      if (!record || !ctx) return
      const v = ctx.session.view.value
      const patch: Partial<BookRecord> = {
        position: pos,
        progress,
        timeMs: record.timeMs + v.ms,
        wordsRead: record.wordsRead + v.words,
        openedAt: Date.now(),
      }
      if (record.status === 'new') patch.status = 'reading'
      void books.update(record.id, patch)
      patchBook(record.id, patch)
    }, 2500)

    ;(async () => {
      try {
        record = (await books.get(bookId)) ?? null
        const blob = await books.file(bookId)
        if (!record || !blob) throw new Error('No se encontró el libro')
        const book = await openEpub(new Uint8Array(await blob.arrayBuffer()))
        if (cancelled) return
        // Por seguridad, si los conteos no cuadran con el spine, los rellenamos
        const stats = book.spine.map((_, i) => record!.chapters[i] ?? { chars: 0, words: 0 })

        const toc = flattenToc(book.toc)
        const labels: string[] = []
        for (const t of toc) if (t.spine >= 0 && labels[t.spine] === undefined) labels[t.spine] = t.label
        // Capítulos "de verdad": spine que empieza una entrada del índice
        const starts = labels.map((l, i) => (l ? i : -1)).filter((i) => i >= 0)
        const chapterHeader = (i: number) => {
          if (!settings.peek().chapterHeaders || !labels[i]) return null
          // Si el título ya numera el capítulo, un «N de M» propio podría contradecirlo
          const n = starts.indexOf(i) + 1
          return { label: numbersItself(labels[i]) ? undefined : `${n} de ${starts.length}`, title: labels[i] }
        }
        const chapterLabel = (s: number) => {
          for (let i = s; i >= 0; i--) if (labels[i]) return labels[i]
          return record!.title
        }

        const engine = new ReaderEngine(book, scroller, root, stats, {
          chapterHeader,
          onPosition: (pos, info) => {
            const prev = position.peek().s
            position.value = {
              ...pos,
              progress: info.progress,
              chapterProgress: info.chapterProgress,
            }
            // Aviso suave al cruzar a otro capítulo (no al abrir el libro)
            if (ctx && pos.s !== prev && labels[pos.s] && settings.peek().chapterHeaders) chapterPill.value = { key: Date.now(), text: labels[pos.s] }
            ctx?.session.onPosition(pos, info)
            save(pos, info.progress)
          },
          onFootnote: (n) => setFootnote(n),
          onNavigate: () => {
            ctx?.remember()
            ctx?.session.markJump()
          },
          onImage: (src, alt) => setImage({ src, alt }),
        })
        const session = new ReadingSession(
          record,
          (s) => engine.chapterWordsRatio(s),
          () => {
            setFinished(true)
            finishedNow = true
            const patch = {
              status: 'finished' as const,
              finishedAt: Date.now(),
              progress: 1,
            }
            record = { ...record!, ...patch }
            void books.update(record.id, patch)
            patchBook(record.id, patch)
          },
        )
        const auto = new AutoScroller(
          scroller,
          () => engine.wordsPerPixel(),
          () => settings.value.autoWpm,
          () => settings.value.autoMode,
          () => haptic('light'),
        )
        session.isAutoscrolling = () => auto.running.value
        session.isRaining = () => rainPlaying.value

        const remember = () => {
          // Varios saltos seguidos (p. ej. resultados de búsqueda): se conserva el sitio original
          if (returnSpot.peek()) return
          const p = position.peek()
          returnSpot.value = { s: p.s, c: p.c, label: chapterLabel(p.s) }
        }
        const jump: ActiveReader['jump'] = async (target) => {
          remember()
          session.markJump()
          await engine.goTo(target)
        }
        const scrollScreen = (dir: 1 | -1) => {
          const rect = scroller.getBoundingClientRect()
          let h = scroller.clientHeight * settings.value.tapScrollRatio
          if (dir === 1) {
            // El renglón cortado en el borde pasa a ser el primero: nunca se pierde media línea
            // Bajo la barra de estado del sistema no se ve: el renglón se coloca justo debajo
            const padTop = scroller.querySelector<HTMLElement>('.reader-pad-top')
            const safeTop = padTop ? Math.max(0, padTop.offsetHeight - (settings.value.typo.paddingY ?? 36)) : 0
            const line = engine.lineTopAt(rect.top + h)
            const top = line ? line.top - rect.top - safeTop : 0
            if (line && top > h * 0.5) {
              h = top
              hereMark.value = { key: Date.now(), top: rect.top + safeTop + 2, left: line.left }
            }
          }
          scroller.scrollBy({
            top: dir * h,
            behavior: settings.value.instantPaging || prefersReducedMotion() ? 'instant' : 'smooth',
          })
          session.activity()
        }
        ctx = {
          book,
          record,
          engine,
          session,
          auto,
          chapterLabel,
          jump,
          scrollScreen,
          remember,
        }

        bookAnnotations.value = await annotations.forBook(bookId)
        engine.setAnnotations(bookAnnotations.value)
        await engine.goTo(record.position ?? { s: 0, c: 0 })
        engine.observe()
        if (cancelled) return
        active.value = ctx
        xpAtOpen = profile.peek().xp
        pendingCelebrations.value = []
        sessionSummary.value = null
        setStatus('ready')
        if (record.status === 'new') {
          record = { ...record, status: 'reading' }
          void books.update(record.id, {
            status: 'reading',
            openedAt: Date.now(),
          })
          patchBook(record.id, { status: 'reading', openedAt: Date.now() })
        }
      } catch (e) {
        if (!cancelled) {
          setStatus('error')
          toastError('No se pudo abrir el libro', e instanceof Error ? e.message : undefined)
        }
      }
    })()

    return () => {
      cancelled = true
      chapterPill.value = null
      for (const fn of cleanups) fn()
      if (ctx) {
        // Última posición emitida: al desmontar, el DOM puede no estar ya en la página para medirlo
        const last = position.peek()
        ctx.session.end()
        flushGame()
        const v = ctx.session.view.value
        const s = settings.peek()
        if (record && s.sessionSummary && (finishedNow || v.ms >= 60_000 || v.words >= 150)) {
          sessionSummary.value = {
            bookId: record.id,
            title: record.title,
            ms: v.ms,
            words: v.words,
            readFraction: v.readFraction,
            progress: last.progress,
            xp: profile.peek().xp - xpAtOpen,
            chapters: ctx.session.chaptersDone,
            celebrations: pendingCelebrations.peek(),
            finished: finishedNow,
          }
        }
        pendingCelebrations.value = []
        save({ s: last.s, c: last.c }, last.progress)
        save.flush()
        ctx.auto.stop()
        ctx.engine.destroy()
      }
      active.value = null
      returnSpot.value = null
      hereMark.value = null
      panel.value = null
      chrome.value = false
      bookAnnotations.value = []
    }
  }, [bookId])

  // ——— Pantalla completa, brillo, teclas de volumen y pantalla encendida ———
  useEffect(() => {
    if (status !== 'ready') return
    const s = settings.peek()
    if (s.fullscreen) void setImmersive(true)
    if (s.brightness >= 0) void setBrightness(s.brightness)
    void setVolumeKeys(s.volumeKeys)
    const offVolume = onVolumeKey((dir) => {
      const ctx = active.value
      if (!ctx) return
      // En modo auto, el volumen regula la velocidad (subir = más rápido)
      if (ctx.auto.active) {
        const s = settings.peek()
        settings.value = {
          ...s,
          autoWpm: Math.max(40, Math.min(1200, s.autoWpm + (dir === 'up' ? 10 : -10))),
        }
      } else ctx.scrollScreen(dir === 'down' ? 1 : -1)
    })

    let awake = false
    let awakeTimer: ReturnType<typeof setTimeout> | undefined
    const poke = throttle(() => {
      const min = settings.peek().keepAwakeMin
      if (!min) return
      if (!awake) {
        awake = true
        void setKeepAwake(true)
      }
      clearTimeout(awakeTimer)
      awakeTimer = setTimeout(() => {
        // Con autoscroll o pomodoro en marcha seguimos despiertos
        if (active.value?.auto.running.value || inFocus.value) return poke()
        awake = false
        void setKeepAwake(false)
      }, min * 60_000)
    }, 5000)
    poke()
    const scroller = scrollerRef.current!
    const activity = () => {
      active.value?.session.activity()
      poke()
    }
    scroller.addEventListener('scroll', activity, { passive: true })
    addEventListener('keydown', activity)
    scroller.addEventListener('pointerdown', activity, { passive: true })
    return () => {
      offVolume()
      void setVolumeKeys(false)
      void setImmersive(false)
      void setBrightness(-1)
      clearTimeout(awakeTimer)
      poke.cancel()
      void setKeepAwake(false)
      scroller.removeEventListener('scroll', activity)
      removeEventListener('keydown', activity)
      scroller.removeEventListener('pointerdown', activity)
    }
  }, [status])

  // Reaplicar volumen/brillo si cambian en ajustes
  useEffect(
    () =>
      effect(() => {
        const s = settings.value
        if (status !== 'ready') return
        void setVolumeKeys(s.volumeKeys)
        void setBrightness(s.brightness)
      }),
    [status],
  )

  // Mantener la posición al cambiar tipografía (con un pequeño retardo para los deslizadores)
  useEffect(() => {
    if (status !== 'ready') return
    let prev = settings.peek().typo
    let anchor: Position | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    return effect(() => {
      const typo = settings.value.typo
      if (typo === prev) return
      prev = typo
      const ctx = active.peek()
      if (!ctx) return
      // La última posición conocida es anterior al cambio (medir ahora daría la del texto ya re-maquetado)
      const last = position.peek()
      anchor ??= { s: last.s, c: last.c }
      clearTimeout(timer)
      timer = setTimeout(() => {
        ctx.engine.reestimate()
        if (anchor) void ctx.engine.goTo(anchor)
        anchor = null
      }, 180)
    })
  }, [status])

  // Pomodoro: pantalla de descanso, pausa de autoscroll y sonidos solo en enfoque
  useEffect(() => {
    if (status !== 'ready') return
    let pausedAmbient = false
    const offEvent = effect(() => {
      const ev = pomoEvent.value
      if (!ev || Date.now() - ev.at > 2000) return
      const p = settings.peek().pomo
      if (ev.ended === 'focus') {
        if (p.breakOverlay && !ev.skipped) setBreakShown(true)
        if (p.pauseAutoscrollOnBreak) active.peek()?.auto.stop()
      } else setBreakShown(false)
    })
    const offFocus = effect(() => {
      if (!settings.value.pomo.soundsOnlyInFocus) return
      if (inBreak.value && ambient.playing.peek()) {
        ambient.pause()
        pausedAmbient = true
      } else if (inFocus.value && pausedAmbient) {
        pausedAmbient = false
        ambient.play()
      }
    })
    return () => {
      offEvent()
      offFocus()
    }
  }, [status])

  // ——— Teclado (PC) ———
  useEffect(() => {
    if (status !== 'ready') return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
          e.preventDefault()
          openPanel('search')
        }
        return
      }
      const ctx = active.value
      if (!ctx) return
      switch (e.key) {
        case ' ':
        case 'PageDown':
          e.preventDefault()
          ctx.scrollScreen(e.shiftKey ? -1 : 1)
          break
        case 'PageUp':
          e.preventDefault()
          ctx.scrollScreen(-1)
          break
        case 'a':
        case 'A':
          ctx.auto.toggle()
          break
        case '+':
        case '=':
          if (ctx.auto.active)
            settings.value = {
              ...settings.value,
              autoWpm: Math.min(1200, settings.value.autoWpm + 10),
            }
          break
        case '-':
          if (ctx.auto.active)
            settings.value = {
              ...settings.value,
              autoWpm: Math.max(40, settings.value.autoWpm - 10),
            }
          break
        case 't':
          openPanel('toc')
          break
        case 'f':
          void setImmersive(!document.fullscreenElement)
          break
        case 'p':
          pomodoro.toggle()
          break
        case 's':
          ambient.toggle()
          break
        case '/':
          e.preventDefault()
          openPanel('search')
          break
        case 'm':
          chrome.value = !chrome.value
          break
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [status])

  // El menú (barras superior/inferior) se registra en la pila de Atrás
  useEffect(() => {
    document.documentElement.dataset.chrome = chrome.value ? '1' : '0'
    return chrome.value ? pushCloser(() => (chrome.value = false)) : undefined
  }, [chrome.value])
  useEffect(() => () => void delete document.documentElement.dataset.chrome, [])

  // Modo auto: al arrancar se recogen menús y paneles para que nada tape el texto,
  // y Atrás/Escape sale del modo antes que del libro
  const autoRunning = active.value?.auto.running.value ?? false
  const autoActive = autoRunning || (active.value?.auto.paused.value ?? false)
  useEffect(() => {
    if (!autoRunning) return
    chrome.value = false
    panel.value = null
  }, [autoRunning])
  useEffect(() => (autoActive ? pushCloser(() => active.peek()?.auto.stop()) : undefined), [autoActive])

  // ——— Toques: zonas para avanzar/retroceder y mostrar el menú ———
  const tap = useRef<{
    x: number
    y: number
    t: number
    scrollAt: number
  } | null>(null)
  const lastScroll = useRef(0)
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    // Con autoscroll, tocar lo pausa al instante (y no cuenta como toque de menú)
    const auto = active.value?.auto
    if (auto?.running.value) {
      auto.pause()
      tap.current = null
      return
    }
    tap.current = {
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      scrollAt: lastScroll.current,
    }
  }
  const onPointerUp = (e: PointerEvent) => {
    const start = tap.current
    tap.current = null
    if (!start) return
    const ctx = active.value
    if (!ctx) return
    if (performance.now() - start.t > TAP_MAX_MS) return
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_MAX_MOVE) return
    // Un toque para frenar una inercia no es un toque "de verdad"
    if (start.t - start.scrollAt < 120) return
    const sel = getSelection()
    if (sel && !sel.isCollapsed) return
    const target = e.target as Element
    if (target.closest('a, img, button, input, video, audio, .hl-tap')) return
    // En pausa, otro toque sigue leyendo (arrastrar sí permite recolocar el texto)
    if (ctx.auto.paused.value) {
      ctx.auto.start()
      return
    }
    // ¿Toque sobre un subrayado? Lo gestiona la capa de selección
    if (ctx.engine.annotationAt(e.clientX, e.clientY)) {
      dispatchEvent(
        new CustomEvent('lunaria:highlight-tap', {
          detail: { x: e.clientX, y: e.clientY },
        }),
      )
      return
    }
    if (panel.value) {
      panel.value = null
      return
    }
    const mode = settings.value.tapZones
    const h = innerHeight
    const w = innerWidth
    const zone =
      mode === 'vertical' ? (e.clientY < h * 0.28 ? -1 : e.clientY > h * 0.72 ? 1 : 0) : mode === 'horizontal' ? (e.clientX < w * 0.3 ? -1 : e.clientX > w * 0.7 ? 1 : 0) : 0
    if (zone && !chrome.value) ctx.scrollScreen(zone as 1 | -1)
    else chrome.value = !chrome.value
  }

  const s = settings.value
  const cls = [
    'reader',
    s.showStatus && 'has-status',
    !s.typo.publisherFonts && 'f-font',
    !s.typo.publisherColors && 'f-color',
    !s.typo.publisherSpacing && 'f-space',
    s.typo.dimImages && 'dim-img',
    chrome.value && 'chrome-on',
  ]
    .concat(s.focusMode === 'marco' ? 'focus-marco' : '')
    .filter(Boolean)
    .join(' ')

  return (
    <div class={cls} data-state={status}>
      <div class="reader-texture" aria-hidden="true" />
      {s.bgImage && bgImageUrl.value && (
        <div
          class="reader-bgimg"
          style={{
            backgroundImage: `url(${bgImageUrl.value})`,
            opacity: s.bgImageOpacity,
          }}
          aria-hidden="true"
        />
      )}
      <div
        class="reader-scroller"
        ref={scrollerRef}
        tabIndex={-1}
        onScroll={() => (lastScroll.current = performance.now())}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <div class="reader-pad-top" />
        <div id="bk" ref={rootRef} lang={active.value?.book.metadata.language || undefined} />
        {status === 'ready' && (
          <div class="book-end">
            <div class="book-end-mark">❦</div>
            <p>{finished ? '¡Libro terminado!' : 'Fin del libro'}</p>
            <button type="button" class="btn" onClick={() => go({ name: 'library' })}>
              Volver a la biblioteca
            </button>
          </div>
        )}
      </div>
      {status === 'loading' && (
        <div class="reader-loading">
          <div class="spinner" />
        </div>
      )}
      {status === 'error' && (
        <div class="reader-loading">
          <p>No se pudo abrir este libro.</p>
          <button type="button" class="btn" onClick={() => go({ name: 'library' })}>
            Volver
          </button>
        </div>
      )}
      {status === 'ready' && (
        <>
          {s.focusMode === 'franja' && <div class="focus-band" aria-hidden="true" />}
          <ChapterPill />
          <EdgeProgress />
          <StatusLine />
          <TopBar />
          <BottomBar />
          <AutoPill />
          <ReturnChip />
          <HereMark />
          <Panels />
          <SelectionLayer />
        </>
      )}
      {s.dim > 0 && <div class="dim-layer" style={{ opacity: s.dim }} aria-hidden="true" />}
      {footnote && <FootnotePopup note={footnote} onClose={() => setFootnote(null)} />}
      {image && <ImageViewer {...image} onClose={() => setImage(null)} />}
      {breakShown && <BreakOverlay onClose={() => setBreakShown(false)} />}
    </div>
  )
}
