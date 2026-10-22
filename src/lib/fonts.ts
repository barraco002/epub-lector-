import { signal } from '@preact/signals'
import { fonts as fontStore, type CustomFont } from './db'
import { uid } from './util'
import { t } from './i18n'

export type FontCategory = 'serif' | 'sans' | 'mono' | 'display' | 'access' | 'system' | 'custom'

export interface FontDef {
  id: string
  name: string
  stack: string
  category: FontCategory
  note?: string
}

const SERIF_FB = 'Georgia, serif'
const SANS_FB = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const MONO_FB = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"

const f = (id: string, family: string, category: FontCategory, fallback: string, note?: string): FontDef => ({
  id,
  name: family,
  stack: `'${family}', ${fallback}`,
  category,
  note,
})

export const BUILTIN_FONTS: FontDef[] = [
  f('spectral', 'Spectral', 'serif', SERIF_FB, 'La de Substack'),
  f('literata', 'Literata', 'serif', SERIF_FB, 'Diseñada para Google Play Books'),
  f('charis', 'Charis SIL', 'serif', SERIF_FB, 'Heredera de Charter'),
  f('newsreader', 'Newsreader', 'serif', SERIF_FB, 'Editorial, de revista'),
  f('source-serif', 'Source Serif 4', 'serif', SERIF_FB),
  f('lora', 'Lora', 'serif', SERIF_FB),
  f('merriweather', 'Merriweather', 'serif', SERIF_FB, 'Muy legible en pantallas'),
  f('eb-garamond', 'EB Garamond', 'serif', SERIF_FB, 'Clásica de libro'),
  f('crimson', 'Crimson Pro', 'serif', SERIF_FB),
  f('libre-baskerville', 'Libre Baskerville', 'serif', SERIF_FB),
  f('vollkorn', 'Vollkorn', 'serif', SERIF_FB),
  f('alegreya', 'Alegreya', 'serif', SERIF_FB, 'Caligráfica, para literatura'),
  f('gelasio', 'Gelasio', 'serif', SERIF_FB, 'Métrica de Georgia'),
  f('noto-serif', 'Noto Serif', 'serif', SERIF_FB),
  f('bitter', 'Bitter', 'serif', SERIF_FB, 'Slab, robusta'),
  f('inter', 'Inter', 'sans', SANS_FB),
  f('ibm-plex-sans', 'IBM Plex Sans', 'sans', SANS_FB),
  f('figtree', 'Figtree', 'sans', SANS_FB, 'Redondeada y amable'),
  f('ia-writer', 'iA Writer Quattro', 'sans', SANS_FB, 'Estilo iA Writer'),
  f('atkinson', 'Atkinson Hyperlegible Next', 'access', SANS_FB, 'Máxima legibilidad'),
  f('lexend', 'Lexend', 'access', SANS_FB, 'Pensada para leer más rápido'),
  f('opendyslexic', 'OpenDyslexic', 'access', SANS_FB, 'Para dislexia'),
  f('jetbrains-mono', 'JetBrains Mono', 'mono', MONO_FB),
  f('courier-prime', 'Courier Prime', 'mono', MONO_FB, 'Máquina de escribir'),
  f('fraunces', 'Fraunces', 'display', SERIF_FB, 'Para títulos'),
  f('playfair', 'Playfair Display', 'display', SERIF_FB, 'Para títulos'),
  f('cormorant', 'Cormorant Garamond', 'display', SERIF_FB, 'Elegante, para títulos'),
  { id: 'system-serif', name: 'Serif del sistema', stack: "ui-serif, Georgia, 'Noto Serif', 'Times New Roman', serif", category: 'system' },
  { id: 'system-sans', name: 'Sans del sistema', stack: SANS_FB, category: 'system' },
  { id: 'system-mono', name: 'Mono del sistema', stack: MONO_FB, category: 'system' },
]

export const CATEGORY_LABEL: Record<FontCategory, string> = {
  serif: 'Serif',
  sans: 'Sans',
  access: 'Accesibilidad',
  mono: 'Monoespaciadas',
  display: 'Títulos',
  system: 'Del sistema',
  custom: 'Tus fuentes',
}

export const customFonts = signal<FontDef[]>([])
const loadedFaces = new Map<string, FontFace>()

export function allFonts(): FontDef[] {
  return [...BUILTIN_FONTS, ...customFonts.value]
}

export function fontStack(id: string): string {
  return allFonts().find((x) => x.id === id)?.stack ?? BUILTIN_FONTS[0].stack
}

async function registerCustom(font: CustomFont): Promise<FontDef | null> {
  try {
    const family = `Lunaria Custom ${font.id}`
    if (!loadedFaces.has(font.id)) {
      const face = new FontFace(family, await font.data.arrayBuffer())
      await face.load()
      document.fonts.add(face)
      loadedFaces.set(font.id, face)
    }
    return { id: font.id, name: font.name, stack: `'${family}', ${SERIF_FB}`, category: 'custom' }
  } catch {
    return null
  }
}

export async function loadCustomFonts() {
  const list = await fontStore.all()
  const defs = (await Promise.all(list.map(registerCustom))).filter(Boolean) as FontDef[]
  customFonts.value = defs
}

export async function addCustomFont(file: File): Promise<FontDef> {
  const name = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ')
  const font: CustomFont = { id: `font-${uid()}`, name, data: file, addedAt: Date.now() }
  const def = await registerCustom(font)
  if (!def) throw new Error(t('No se pudo leer la fuente. Usa archivos .ttf, .otf, .woff o .woff2.'))
  await fontStore.put(font)
  customFonts.value = [...customFonts.value, def]
  return def
}

export async function removeCustomFont(id: string) {
  await fontStore.remove(id)
  const face = loadedFaces.get(id)
  if (face) document.fonts.delete(face)
  loadedFaces.delete(id)
  customFonts.value = customFonts.value.filter((x) => x.id !== id)
}
