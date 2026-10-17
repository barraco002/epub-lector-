// Autoscroll a palabras por minuto.
// - "smooth": desplazamiento continuo. La posición se acumula en coma flotante y solo se escribe
//   scrollTop cuando avanza un píxel físico: a velocidades lentas casi no hay trabajo por frame.
// - "screen": avanza una pantalla cada N segundos (sin bucle de animación: más ahorro de batería).
import { signal } from '@preact/signals'

export class AutoScroller {
  readonly running = signal(false)
  private raf = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private last = 0
  private pos = 0
  private wpp = 0.05
  private wppAt = 0
  private lastTop = -1

  constructor(
    private scroller: HTMLElement,
    private wordsPerPixel: () => number,
    private getWpm: () => number,
    private getMode: () => 'smooth' | 'screen',
    private onEnd: () => void,
  ) {}

  private pxPerSecond() {
    const now = performance.now()
    if (now - this.wppAt > 2000) {
      this.wpp = Math.max(0.002, this.wordsPerPixel())
      this.wppAt = now
    }
    return this.getWpm() / 60 / this.wpp
  }

  start() {
    if (this.running.value) return
    this.running.value = true
    this.wppAt = 0
    this.lastTop = -1
    if (this.getMode() === 'smooth') {
      this.last = performance.now()
      this.raf = requestAnimationFrame(this.frame)
    } else {
      this.scheduleScreen()
    }
  }

  stop() {
    if (!this.running.value) return
    this.running.value = false
    cancelAnimationFrame(this.raf)
    clearTimeout(this.timer)
  }

  toggle() {
    if (this.running.value) this.stop()
    else this.start()
  }

  /** Reinicia el modo si cambió en ajustes mientras estaba activo. */
  restart() {
    if (!this.running.value) return
    this.stop()
    this.start()
  }

  private frame = (t: number) => {
    if (!this.running.value) return
    const dt = Math.min(100, t - this.last)
    this.last = t
    const el = this.scroller
    const current = el.scrollTop
    // Si el usuario desplazó a mano (rueda, teclado), seguimos desde ahí
    if (this.lastTop < 0 || Math.abs(current - this.lastTop) > 2) this.pos = current
    this.pos += (this.pxPerSecond() * dt) / 1000
    const max = el.scrollHeight - el.clientHeight
    if (this.pos >= max) {
      el.scrollTop = max
      this.stop()
      this.onEnd()
      return
    }
    // Acumulamos en coma flotante y solo escribimos cuando cambia al menos un píxel físico:
    // el navegador redondea scrollTop y los incrementos pequeños se perderían
    const dpr = window.devicePixelRatio || 1
    const snapped = Math.round(this.pos * dpr) / dpr
    if (Math.abs(snapped - current) >= 1 / dpr) {
      el.scrollTop = snapped
      this.lastTop = el.scrollTop
    } else if (this.lastTop < 0) this.lastTop = current
    this.raf = requestAnimationFrame(this.frame)
  }

  private scheduleScreen() {
    const screen = this.scroller.clientHeight * 0.88
    const seconds = Math.max(2, screen / this.pxPerSecond())
    this.timer = setTimeout(() => {
      if (!this.running.value) return
      const before = this.scroller.scrollTop
      this.scroller.scrollBy({ top: screen, behavior: 'smooth' })
      setTimeout(() => {
        if (!this.running.value) return
        if (Math.abs(this.scroller.scrollTop - before) < 2) {
          this.stop()
          this.onEnd()
        } else this.scheduleScreen()
      }, 700)
    }, seconds * 1000)
  }
}
