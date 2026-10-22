// Idioma de la interfaz. La clave de cada traducción es el texto español exacto, así que si falta
// una traducción se muestra el español y nada se rompe. El contenido del libro no cambia de idioma.
import { computed, effect, signal } from '@preact/signals'
import { EN } from './i18n/en'

export type Lang = 'es' | 'en'
export type LangPref = 'auto' | Lang

/** Preferencia del usuario (Ajustes → Idioma). La mantiene settings.ts. */
export const langPref = signal<LangPref>('auto')

/** Automático: español si el sistema está en español; inglés para el resto. */
const detect = (): Lang => (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en')

/** Idioma efectivo de la interfaz. */
export const lang = computed<Lang>(() => (langPref.value === 'auto' ? detect() : langPref.value))

const DICTS: Record<Lang, Record<string, string> | undefined> = { es: undefined, en: EN }

/** Traduce un texto escrito en español. `{nombre}` se sustituye por `vars.nombre`. Llamarla al pintar, no al cargar el módulo. */
export function t(text: string, vars?: Record<string, string | number>): string {
  let out = DICTS[lang.value]?.[text] ?? text
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  return out
}

/** Configuración regional para fechas y números. */
export const locale = (): string => (lang.value === 'es' ? 'es-ES' : 'en-GB')

if (typeof document !== 'undefined') {
  effect(() => {
    document.documentElement.lang = lang.value
  })
}
