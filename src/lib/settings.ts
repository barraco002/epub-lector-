import { computed, effect, signal } from '@preact/signals'
import { BUILTIN_THEMES, DEFAULT_THEME_ID, type Theme } from './themes'
import { kv } from './db'
import { debounce } from './util'
import { langPref, type LangPref } from './i18n'

export interface Typography {
  font: string
  headingFont: string // 'same' = igual que el cuerpo
  size: number // px
  weight: number
  lineHeight: number
  letterSpacing: number // em
  wordSpacing: number // em
  paraSpacing: number // em
  indent: number // em
  align: 'start' | 'justify'
  hyphens: boolean
  margin: number // px a cada lado (móvil)
  paddingY: number // px de aire arriba y abajo del área de lectura
  maxWidth: number // px de columna máxima (legado; ahora manda measure)
  measure: number // letras por línea
  normalizeSize: boolean // mismo tamaño aparente al cambiar de fuente (altura de la x)
  publisherFonts: boolean
  publisherColors: boolean
  publisherSpacing: boolean
  dimImages: boolean
}

export interface Settings {
  themeId: string
  texture: 'theme' | 'none' | 'paper' | 'linen' | 'grain' | 'dots' | 'lines' | 'vignette'
  /** Colores propios que se superponen al tema ('' = los del tema) */
  colors: { text: string; bg: string; accent: string }
  bgImage: boolean // imagen de fondo propia (guardada en IndexedDB)
  bgImageOpacity: number // 0..1
  focusMode: 'off' | 'marco' | 'franja'
  /** Pareja día/noche: themeId es el tema de día */
  nightThemeId: string
  nightMode: 'off' | 'on' | 'system' | 'schedule'
  gameMode: 'completo' | 'discreto' | 'estadisticas'
  progressStyle: 'sutil' | 'acento'
  chapterHeaders: boolean
  /** Idioma de la interfaz: automático (según el sistema), español o inglés */
  lang: LangPref
  typo: Typography
  uiFont: string
  // Lectura
  tapZones: 'vertical' | 'horizontal' | 'off'
  tapScrollRatio: number // fracción de pantalla por toque
  instantPaging: boolean // paso de pantalla sin animación
  volumeKeys: boolean
  keepAwakeMin: number // 0 = según el sistema
  fullscreen: boolean
  showStatus: boolean // reloj, batería y progreso abajo
  progressBar: 'none' | 'book' | 'chapter' | 'goal'
  // Autoscroll
  autoMode: 'smooth' | 'screen'
  autoWpm: number
  // Filtro de luz azul y atenuación
  blueLight: boolean
  blueIntensity: number // 0..100
  blueSchedule: boolean
  blueFrom: string // "21:00"
  blueTo: string // "07:00"
  dim: number // 0..0.8
  brightness: number // -1 = sistema (solo Android)
  // Metas y avisos
  dailyGoalMin: number
  toastWords: number // 0 = desactivado
  toastPercent: number // 0 = desactivado
  toastChapter: boolean
  toastsEnabled: boolean
  sessionSummary: boolean
  // Diccionario
  translateTo: string
  // Pomodoro
  pomo: {
    focus: number
    short: number
    long: number
    every: number
    autoBreak: boolean
    autoFocus: boolean
    breakOverlay: boolean
    chime: 'campana' | 'cuenco' | 'madera' | 'ninguno'
    soundsOnlyInFocus: boolean
    pauseAutoscrollOnBreak: boolean
  }
  // Sonidos
  sound: {
    master: number
    volumes: Record<string, number>
    pauseOnHide: boolean
    sleepMin: number
    screenOff: boolean // seguir sonando con la pantalla apagada (Android, servicio en primer plano)
  }
}

export const DEFAULT_TYPO: Typography = {
  font: 'spectral',
  headingFont: 'same',
  size: 19,
  weight: 400,
  lineHeight: 1.6,
  letterSpacing: 0,
  wordSpacing: 0,
  paraSpacing: 1,
  indent: 0,
  align: 'start',
  hyphens: false,
  margin: 22,
  paddingY: 36,
  maxWidth: 680,
  measure: 70,
  normalizeSize: true,
  publisherFonts: false,
  publisherColors: false,
  publisherSpacing: false,
  dimImages: true,
}

export const DEFAULT_SETTINGS: Settings = {
  themeId: DEFAULT_THEME_ID,
  texture: 'theme',
  colors: { text: '', bg: '', accent: '' },
  bgImage: false,
  bgImageOpacity: 0.25,
  focusMode: 'off',
  nightThemeId: 'substack-noche',
  nightMode: 'off',
  gameMode: 'completo',
  progressStyle: 'sutil',
  chapterHeaders: true,
  lang: 'auto',
  typo: DEFAULT_TYPO,
  uiFont: 'system-sans',
  tapZones: 'vertical',
  tapScrollRatio: 0.85,
  instantPaging: false,
  volumeKeys: true,
  keepAwakeMin: 5,
  fullscreen: true,
  showStatus: true,
  progressBar: 'book',
  autoMode: 'smooth',
  autoWpm: 230,
  blueLight: false,
  blueIntensity: 45,
  blueSchedule: false,
  blueFrom: '21:00',
  blueTo: '07:00',
  dim: 0,
  brightness: -1,
  dailyGoalMin: 20,
  toastWords: 1000,
  toastPercent: 5,
  toastChapter: true,
  toastsEnabled: true,
  sessionSummary: true,
  translateTo: 'es',
  pomo: {
    focus: 25,
    short: 5,
    long: 15,
    every: 4,
    autoBreak: true,
    autoFocus: false,
    breakOverlay: true,
    chime: 'campana',
    soundsOnlyInFocus: false,
    pauseAutoscrollOnBreak: true,
  },
  sound: { master: 0.7, volumes: {}, pauseOnHide: true, sleepMin: 0, screenOff: false },
}

export interface TypoPreset {
  id: string
  name: string
  typo: Partial<Typography>
  custom?: boolean
}

export const BUILTIN_PRESETS: TypoPreset[] = [
  { id: 'substack', name: 'Substack', typo: { font: 'spectral', headingFont: 'same', size: 19, lineHeight: 1.6, paraSpacing: 1, indent: 0, align: 'start', letterSpacing: 0, wordSpacing: 0, measure: 70, weight: 400 } },
  { id: 'clasico', name: 'Libro clásico', typo: { font: 'eb-garamond', headingFont: 'same', size: 21, lineHeight: 1.5, paraSpacing: 0, indent: 1.5, align: 'justify', hyphens: true, letterSpacing: 0, wordSpacing: 0, measure: 62, weight: 400 } },
  { id: 'kindle', name: 'Kindle', typo: { font: 'literata', headingFont: 'same', size: 19, lineHeight: 1.55, paraSpacing: 0, indent: 1.2, align: 'justify', hyphens: true, letterSpacing: 0, wordSpacing: 0, measure: 64, weight: 400 } },
  { id: 'revista', name: 'Revista', typo: { font: 'newsreader', headingFont: 'fraunces', size: 20, lineHeight: 1.55, paraSpacing: 0.9, indent: 0, align: 'start', letterSpacing: 0, wordSpacing: 0, measure: 70, weight: 400 } },
  { id: 'moderno', name: 'Moderno', typo: { font: 'inter', headingFont: 'same', size: 18, lineHeight: 1.65, paraSpacing: 1, indent: 0, align: 'start', letterSpacing: -0.005, wordSpacing: 0, measure: 68, weight: 400 } },
  { id: 'escritor', name: 'Escritor', typo: { font: 'ia-writer', headingFont: 'same', size: 18, lineHeight: 1.7, paraSpacing: 1, indent: 0, align: 'start', letterSpacing: 0, wordSpacing: 0, measure: 64, weight: 400 } },
  { id: 'accesible', name: 'Accesible', typo: { font: 'atkinson', headingFont: 'same', size: 21, lineHeight: 1.75, paraSpacing: 1.1, indent: 0, align: 'start', letterSpacing: 0.02, wordSpacing: 0.08, measure: 60, weight: 400 } },
  { id: 'dislexia', name: 'Dislexia', typo: { font: 'opendyslexic', headingFont: 'same', size: 19, lineHeight: 1.9, paraSpacing: 1.3, indent: 0, align: 'start', letterSpacing: 0.04, wordSpacing: 0.16, measure: 56, weight: 400 } },
  { id: 'compacto', name: 'Compacto', typo: { font: 'source-serif', headingFont: 'same', size: 17, lineHeight: 1.45, paraSpacing: 0.6, indent: 0, align: 'justify', hyphens: true, letterSpacing: 0, wordSpacing: 0, measure: 78, weight: 400 } },
]

const LS_KEY = 'lunaria.settings.v1'

function deepMerge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const b = out[k]
    if (b && typeof b === 'object' && !Array.isArray(b) && v && typeof v === 'object' && !Array.isArray(v)) {
      // Records abiertos (p. ej. volúmenes) se aceptan tal cual
      out[k] = Object.keys(b).length ? deepMerge(b, v) : v
    } else if (v !== undefined && (b === undefined || typeof v === typeof b)) {
      out[k] = v
    }
  }
  return out as T
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return deepMerge(DEFAULT_SETTINGS, JSON.parse(raw))
  } catch {
    /* almacenamiento bloqueado o JSON corrupto */
  }
  return DEFAULT_SETTINGS
}

export const settings = signal<Settings>(loadSettings())
effect(() => {
  langPref.value = settings.value.lang
})
export const customThemes = signal<Theme[]>([])
export const customPresets = signal<TypoPreset[]>([])

export const allThemes = computed(() => [...BUILTIN_THEMES, ...customThemes.value])
/** ¿Toca el tema de noche? Lo calcula appearance.ts (modo manual, sistema u horario). */
export const nightActive = signal(false)
export const currentThemeId = computed(() => (nightActive.value ? settings.value.nightThemeId : settings.value.themeId))
export const currentTheme = computed(() => allThemes.value.find((x) => x.id === currentThemeId.value) ?? BUILTIN_THEMES[0])
/** Elegir un tema cambia el de día o el de noche según lo que esté activo. */
export function chooseTheme(id: string) {
  update(nightActive.value ? { nightThemeId: id } : { themeId: id })
}

const persist = debounce((s: Settings) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s))
  } catch {
    /* sin espacio o bloqueado */
  }
}, 300)
effect(() => persist(settings.value))
addEventListener('pagehide', () => persist.flush())

export function update(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch }
}
export function updateTypo(patch: Partial<Typography>) {
  settings.value = { ...settings.value, typo: { ...settings.value.typo, ...patch } }
}
export function updatePomo(patch: Partial<Settings['pomo']>) {
  settings.value = { ...settings.value, pomo: { ...settings.value.pomo, ...patch } }
}
export function updateSound(patch: Partial<Settings['sound']>) {
  settings.value = { ...settings.value, sound: { ...settings.value.sound, ...patch } }
}

export async function loadCustomData() {
  customThemes.value = (await kv.get<Theme[]>('customThemes')) ?? []
  customPresets.value = (await kv.get<TypoPreset[]>('customPresets')) ?? []
}

// El editor de temas cambia colores en cada movimiento del selector: agrupamos las escrituras
const persistThemes = debounce((list: Theme[]) => void kv.set('customThemes', list), 400)
addEventListener('pagehide', () => persistThemes.flush())

export async function saveCustomThemes(list: Theme[]) {
  customThemes.value = list
  persistThemes(list)
}

export async function saveCustomPresets(list: TypoPreset[]) {
  customPresets.value = list
  await kv.set('customPresets', list)
}

export function replaceSettings(next: unknown) {
  settings.value = deepMerge(DEFAULT_SETTINGS, next)
}
