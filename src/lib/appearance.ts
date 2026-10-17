// Aplica tema, filtro de luz azul y tipografía como variables CSS en :root.
// Todo se recalcula solo cuando cambia un ajuste: no hay temporizadores ni capas extra.
import { computed, effect, signal } from '@preact/signals'
import { currentTheme, settings } from './settings'
import { resolveTheme, textureUrl } from './themes'
import { customFonts, fontStack } from './fonts'
import { intensityToKelvin } from './color'

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** true si `now` cae en la franja [from, to), contemplando franjas que cruzan medianoche. */
export function inWindow(now: Date, from: string, to: string) {
  const n = now.getHours() * 60 + now.getMinutes()
  const a = minutes(from)
  const b = minutes(to)
  return a <= b ? n >= a && n < b : n >= a || n < b
}

const clock = signal(Date.now())
let scheduleTimer: ReturnType<typeof setTimeout> | undefined

// Un único temporizador hasta el siguiente cambio de franja (no un sondeo cada minuto)
effect(() => {
  const s = settings.value
  clearTimeout(scheduleTimer)
  if (!s.blueSchedule) return
  const now = new Date(clock.value)
  const n = now.getHours() * 60 + now.getMinutes()
  const next = [minutes(s.blueFrom), minutes(s.blueTo)].map((m) => (m - n + 1440) % 1440 || 1440)
  const waitMs = Math.min(...next) * 60_000 - now.getSeconds() * 1000 + 500
  scheduleTimer = setTimeout(() => (clock.value = Date.now()), waitMs)
})
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) clock.value = Date.now()
})

export const blueActive = computed(() => {
  const s = settings.value
  if (s.blueSchedule) return inWindow(new Date(clock.value), s.blueFrom, s.blueTo)
  return s.blueLight
})

export const tokens = computed(() => {
  const s = settings.value
  return resolveTheme(currentTheme.value, blueActive.value ? intensityToKelvin(s.blueIntensity) : null)
})

let themeMeta: HTMLMetaElement | null = null

export function startAppearance() {
  const root = document.documentElement
  effect(() => {
    const { vars, dark } = tokens.value
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
    root.dataset.dark = dark ? '1' : '0'
    root.style.colorScheme = dark ? 'dark' : 'light'
    const s = settings.value
    const texture = s.texture === 'theme' ? currentTheme.value.texture : s.texture
    root.style.setProperty('--texture', textureUrl(texture, dark))
    themeMeta ??= document.querySelector('meta[name="theme-color"]')
    themeMeta?.setAttribute('content', vars['--bg'])
    root.style.background = vars['--bg']
    try {
      localStorage.setItem('lunaria.bg', vars['--bg'])
    } catch {
      /* ignorar */
    }
    // Filtro para imágenes: misma temperatura que los colores del tema
    const k = blueActive.value ? intensityToKelvin(s.blueIntensity) : 6500
    root.style.setProperty('--img-filter', k < 6400 ? `sepia(${((6500 - k) / 4600) * 0.6}) saturate(${1 - ((6500 - k) / 4600) * 0.25})` : 'sepia(0)')
  })
  effect(() => {
    void customFonts.value // las fuentes propias pueden cargarse después
    const { typo, uiFont } = settings.value
    const v: Record<string, string> = {
      '--fs': `${typo.size}px`,
      '--weight': String(typo.weight),
      '--lh': String(typo.lineHeight),
      '--ls': `${typo.letterSpacing}em`,
      '--ws': `${typo.wordSpacing}em`,
      '--ps': `${typo.paraSpacing}em`,
      '--indent': `${typo.indent}em`,
      '--align': typo.align,
      '--hyphens': typo.hyphens ? 'auto' : 'manual',
      '--margin': `${typo.margin}px`,
      '--measure': `${typo.maxWidth}px`,
      '--rfont': fontStack(typo.font),
      '--hfont': typo.headingFont === 'same' ? fontStack(typo.font) : fontStack(typo.headingFont),
      '--ui-font': fontStack(uiFont),
    }
    for (const [k, val] of Object.entries(v)) root.style.setProperty(k, val)
  })
}
