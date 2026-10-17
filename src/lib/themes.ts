import { contrast, isDark, mix, readableOn, rgba, warm } from './color'

export type Texture = 'none' | 'paper' | 'linen' | 'grain'

export interface Theme {
  id: string
  name: string
  bg: string
  surface: string
  text: string
  muted: string
  accent: string
  border: string
  heading?: string
  link?: string
  selection?: string
  texture?: Texture
  /** Tema creado por el usuario */
  custom?: boolean
}

type T = Omit<Theme, 'id' | 'name'>
const t = (id: string, name: string, v: T): Theme => ({ id, name, ...v })

export const BUILTIN_THEMES: Theme[] = [
  // ——— Claros ———
  t('substack', 'Substack', { bg: '#ffffff', surface: '#ffffff', text: '#363737', heading: '#1a1a1a', muted: '#6b6b6b', accent: '#ff6719', link: '#d4510b', border: '#e8e8e8' }),
  t('papel', 'Papel', { bg: '#faf8f3', surface: '#ffffff', text: '#2a2723', muted: '#6f6a61', accent: '#b5532c', border: '#e7e1d6', texture: 'paper' }),
  t('sepia', 'Sepia', { bg: '#f4ecd8', surface: '#f9f3e3', text: '#4a3927', muted: '#76624c', accent: '#9c5b26', border: '#e0d2b0' }),
  t('crema', 'Crema', { bg: '#fbf0d9', surface: '#fdf6e7', text: '#3a3029', muted: '#76675a', accent: '#a0522d', border: '#eadcbf' }),
  t('pergamino', 'Pergamino', { bg: '#efe2c4', surface: '#f5ead1', text: '#382a1a', muted: '#6a563d', accent: '#8b3a1a', border: '#d9c79c', texture: 'paper' }),
  t('periodico', 'Periódico', { bg: '#f7f5ef', surface: '#fcfbf7', text: '#161514', muted: '#55524c', accent: '#8b1a1a', border: '#d8d4c8', texture: 'grain' }),
  t('salmon', 'Salmón', { bg: '#fff1e5', surface: '#fff7f0', text: '#33302e', muted: '#66605c', accent: '#0d7680', border: '#f0dccb' }),
  t('nieve', 'Nieve', { bg: '#f6f8fb', surface: '#ffffff', text: '#1d2733', muted: '#596575', accent: '#2f6fde', border: '#e1e6ee' }),
  t('niebla', 'Niebla', { bg: '#ecebe8', surface: '#f4f3f1', text: '#26251f', muted: '#5e5c55', accent: '#3d6b58', border: '#d6d4cf' }),
  t('menta', 'Menta', { bg: '#effaf6', surface: '#f8fdfb', text: '#17322b', muted: '#4a675e', accent: '#0f8a6a', border: '#d3ece4' }),
  t('matcha', 'Matcha', { bg: '#eef1e6', surface: '#f6f8f0', text: '#273322', muted: '#57644e', accent: '#4f7a2a', border: '#d8dfc8' }),
  t('lavanda', 'Lavanda', { bg: '#f4f1fa', surface: '#fbfaff', text: '#2f2944', muted: '#645c7d', accent: '#7048c8', border: '#e2dcf0' }),
  t('sakura', 'Sakura', { bg: '#fdf3f4', surface: '#fffafa', text: '#3d2a30', muted: '#765862', accent: '#c44569', border: '#f1dde1' }),
  t('arena', 'Arena', { bg: '#f3e9dc', surface: '#f8f1e7', text: '#3a2e22', muted: '#6b5a48', accent: '#b8582a', border: '#e2d3bf', texture: 'linen' }),
  t('solarized-claro', 'Solarized claro', { bg: '#fdf6e3', surface: '#eee8d5', text: '#3f5359', muted: '#5f7278', accent: '#268bd2', link: '#1f6fa8', border: '#e4dcc4' }),
  t('gruvbox-claro', 'Gruvbox claro', { bg: '#fbf1c7', surface: '#f2e5bc', text: '#3c3836', muted: '#655c54', accent: '#af3a03', border: '#e3d4a8' }),
  t('latte', 'Catppuccin Latte', { bg: '#eff1f5', surface: '#e6e9ef', text: '#3f4259', muted: '#62657a', accent: '#8839ef', border: '#ccd0da' }),
  t('rose-pine-dawn', 'Rosé Pine Dawn', { bg: '#faf4ed', surface: '#fffaf3', text: '#4d4870', muted: '#6e6a88', accent: '#b4637a', border: '#ebe1d6' }),
  t('everforest-claro', 'Everforest claro', { bg: '#fdf6e3', surface: '#f4f0d9', text: '#45525a', muted: '#66756e', accent: '#5f7f1c', border: '#e6e2cc' }),
  t('e-ink', 'E-ink', { bg: '#ecece7', surface: '#f3f3ef', text: '#141414', muted: '#474747', accent: '#222222', border: '#cfcfc8', texture: 'grain' }),
  t('contraste-claro', 'Alto contraste claro', { bg: '#ffffff', surface: '#ffffff', text: '#000000', muted: '#2e2e2e', accent: '#0040c0', border: '#767676' }),
  // ——— Oscuros ———
  t('substack-noche', 'Substack noche', { bg: '#151515', surface: '#1e1e1e', text: '#e3e3e3', heading: '#f4f4f4', muted: '#9c9c9c', accent: '#ff6719', link: '#ff8a4c', border: '#2c2c2c' }),
  t('medianoche', 'Medianoche', { bg: '#101318', surface: '#181c23', text: '#d6dae0', muted: '#8f97a5', accent: '#7aa2ff', border: '#262c36' }),
  t('amoled', 'AMOLED', { bg: '#000000', surface: '#0d0d0d', text: '#c9c9c9', muted: '#858585', accent: '#ff8a3d', border: '#222222' }),
  t('noche-lluvia', 'Noche de lluvia', { bg: '#14181f', surface: '#1a1f28', text: '#ccd3dc', muted: '#8a95a5', accent: '#6ba8ff', border: '#262d39' }),
  t('biblioteca', 'Biblioteca', { bg: '#1e1712', surface: '#271e17', text: '#e6d8c3', muted: '#a8957c', accent: '#d39b4f', border: '#3a2d22', texture: 'linen' }),
  t('cafe', 'Café', { bg: '#2a201b', surface: '#33281f', text: '#ead9c6', muted: '#b09a85', accent: '#e0a46a', border: '#433529' }),
  t('sepia-noche', 'Sepia noche', { bg: '#231e17', surface: '#2b251c', text: '#dccdaa', muted: '#a3957a', accent: '#d1a05a', border: '#3b3226' }),
  t('bosque', 'Bosque', { bg: '#121c17', surface: '#18251e', text: '#d2e2d6', muted: '#8fa597', accent: '#6fc28f', border: '#233529' }),
  t('oceano', 'Océano', { bg: '#0d1b2a', surface: '#12243a', text: '#cfdbe8', muted: '#8ca2ba', accent: '#4fb0e8', border: '#1d3350' }),
  t('ciruela', 'Ciruela', { bg: '#221a2a', surface: '#2a2133', text: '#e8dcf2', muted: '#a998ba', accent: '#d08cf0', border: '#3a2e46' }),
  t('nord', 'Nord', { bg: '#2e3440', surface: '#3b4252', text: '#e5e9f0', muted: '#aab3c4', accent: '#88c0d0', border: '#434c5e' }),
  t('dracula', 'Dracula', { bg: '#282a36', surface: '#313442', text: '#f8f8f2', muted: '#a6abc9', accent: '#bd93f9', link: '#8be9fd', border: '#3c3f52' }),
  t('gruvbox-oscuro', 'Gruvbox oscuro', { bg: '#282828', surface: '#32302f', text: '#ebdbb2', muted: '#a89984', accent: '#fe8019', border: '#3c3836' }),
  t('mocha', 'Catppuccin Mocha', { bg: '#1e1e2e', surface: '#262637', text: '#cdd6f4', muted: '#a6adc8', accent: '#cba6f7', link: '#89b4fa', border: '#313244' }),
  t('frappe', 'Catppuccin Frappé', { bg: '#303446', surface: '#393e53', text: '#c6d0f5', muted: '#a5adce', accent: '#ca9ee6', link: '#8caaee', border: '#454a61' }),
  t('rose-pine', 'Rosé Pine', { bg: '#191724', surface: '#1f1d2e', text: '#e0def4', muted: '#9a96b5', accent: '#ebbcba', link: '#9ccfd8', border: '#2a2740' }),
  t('rose-pine-moon', 'Rosé Pine Moon', { bg: '#232136', surface: '#2a273f', text: '#e0def4', muted: '#9a96b5', accent: '#ea9a97', link: '#9ccfd8', border: '#393552' }),
  t('tokyo-night', 'Tokyo Night', { bg: '#1a1b26', surface: '#1f2335', text: '#c0caf5', muted: '#8e96bd', accent: '#7aa2f7', link: '#7dcfff', border: '#292e42' }),
  t('everforest-oscuro', 'Everforest oscuro', { bg: '#2d353b', surface: '#343f44', text: '#d3c6aa', muted: '#a3ada5', accent: '#a7c080', border: '#3d484d' }),
  t('kanagawa', 'Kanagawa', { bg: '#1f1f28', surface: '#2a2a37', text: '#dcd7ba', muted: '#a6a69c', accent: '#7e9cd8', link: '#7fb4ca', border: '#363646' }),
  t('one-dark', 'One Dark', { bg: '#282c34', surface: '#2f343f', text: '#c8ccd4', muted: '#949aa6', accent: '#61afef', border: '#3a3f4b' }),
  t('solarized-oscuro', 'Solarized oscuro', { bg: '#002b36', surface: '#073642', text: '#a9b7b7', muted: '#839496', accent: '#b58900', link: '#2aa198', border: '#0d4250' }),
  t('fosforo', 'Terminal fósforo', { bg: '#070d08', surface: '#0c150e', text: '#6ee08a', muted: '#46a35f', accent: '#9dffb3', border: '#173a20' }),
  t('ambar', 'Ámbar nocturno', { bg: '#120c03', surface: '#1b1306', text: '#f2b45a', muted: '#b8893f', accent: '#ffcf7a', border: '#33240d' }),
  t('contraste-oscuro', 'Alto contraste oscuro', { bg: '#000000', surface: '#000000', text: '#ffffff', muted: '#d4d4d4', accent: '#ffd400', border: '#6e6e6e' }),
]

export const DEFAULT_THEME_ID = 'substack'

export interface ResolvedTokens {
  dark: boolean
  vars: Record<string, string>
}

const HIGHLIGHTS_LIGHT = { yellow: '#ffe066', green: '#a9e5a0', blue: '#a7d3ff', pink: '#ffb3cf', purple: '#d7b8ff' }
const HIGHLIGHTS_DARK = { yellow: '#8a7417', green: '#2f6b3a', blue: '#24527d', pink: '#7d2f50', purple: '#5a3c8a' }

/** Convierte un tema en variables CSS, aplicando el filtro de luz azul si está activo. */
export function resolveTheme(theme: Theme, kelvin: number | null): ResolvedTokens {
  const f = (c: string) => (kelvin ? warm(c, kelvin) : c)
  const dark = isDark(theme.bg)
  const bg = f(theme.bg)
  const text = f(theme.text)
  const accent = f(theme.accent)
  const surface = f(theme.surface)
  const hl = dark ? HIGHLIGHTS_DARK : HIGHLIGHTS_LIGHT
  const vars: Record<string, string> = {
    '--bg': bg,
    '--surface': surface,
    '--surface-2': mix(surface, text, dark ? 0.07 : 0.045),
    '--surface-3': mix(surface, text, dark ? 0.13 : 0.09),
    '--text': text,
    '--heading': f(theme.heading ?? theme.text),
    '--muted': f(theme.muted),
    '--accent': accent,
    '--accent-ink': readableOn(accent),
    '--accent-soft': rgba(accent, dark ? 0.2 : 0.12),
    '--link': f(theme.link ?? (contrast(theme.accent, theme.bg) >= 3.5 ? theme.accent : theme.text)),
    '--border': f(theme.border),
    '--selection': theme.selection ? f(theme.selection) : rgba(accent, dark ? 0.38 : 0.26),
    '--hover': rgba(text, dark ? 0.08 : 0.055),
    '--shadow': dark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(30, 25, 15, 0.14)',
    '--scrim': dark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(20, 18, 14, 0.32)',
  }
  for (const [k, v] of Object.entries(hl)) vars[`--hl-${k}`] = f(v)
  return { dark, vars }
}

export function textureUrl(texture: Texture | undefined, dark: boolean): string {
  if (!texture || texture === 'none') return 'none'
  const opacity = dark ? 0.09 : 0.07
  const svg: Record<Exclude<Texture, 'none'>, string> = {
    paper: `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5 0 0 0 0 .45 0 0 0 0 .35 0 0 0 ${opacity * 6} 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/>`,
    grain: `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='linear' slope='${opacity * 5}'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(%23n)'/>`,
    linen: `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.02 1.2' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5 0 0 0 0 .45 0 0 0 0 .4 0 0 0 ${opacity * 5} 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/>`,
  }
  return `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>${svg[texture]}</svg>")`
}

export function newCustomTheme(base: Theme, name: string): Theme {
  return { ...base, id: `custom-${Date.now().toString(36)}`, name, custom: true }
}
