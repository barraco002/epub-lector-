// Genera src/styles/fonts.generated.css a partir de los paquetes @fontsource instalados.
// Solo se incluyen los subconjuntos latin + latin-ext (español, inglés y lenguas europeas):
// el navegador descarga cada archivo únicamente cuando la fuente se usa de verdad.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SUBSETS = ['latin', 'latin-ext']
const root = new URL('..', import.meta.url).pathname

// [familia CSS, paquete, tipo, pesos (estáticas) | rango (variables)]
const FONTS = [
  ['Literata', 'literata', 'var', '200 900'],
  ['Newsreader', 'newsreader', 'var', '200 800'],
  ['Source Serif 4', 'source-serif-4', 'var', '200 900'],
  ['Lora', 'lora', 'var', '400 700'],
  ['Merriweather', 'merriweather', 'var', '300 900'],
  ['EB Garamond', 'eb-garamond', 'var', '400 800'],
  ['Crimson Pro', 'crimson-pro', 'var', '200 900'],
  ['Vollkorn', 'vollkorn', 'var', '400 900'],
  ['Alegreya', 'alegreya', 'var', '400 900'],
  ['Gelasio', 'gelasio', 'var', '400 700'],
  ['Fraunces', 'fraunces', 'var', '100 900'],
  ['Cormorant Garamond', 'cormorant-garamond', 'var', '300 700'],
  ['Bitter', 'bitter', 'var', '100 900'],
  ['Noto Serif', 'noto-serif', 'var', '100 900'],
  ['Playfair Display', 'playfair-display', 'var', '400 900'],
  ['Inter', 'inter', 'var', '100 900'],
  ['Atkinson Hyperlegible Next', 'atkinson-hyperlegible-next', 'var', '200 800'],
  ['Lexend', 'lexend', 'var', '100 900'],
  ['IBM Plex Sans', 'ibm-plex-sans', 'var', '100 700'],
  ['Figtree', 'figtree', 'var', '300 900'],
  ['JetBrains Mono', 'jetbrains-mono', 'var', '100 800'],
  ['Spectral', 'spectral', 'static', [400, 600, 700]],
  ['Libre Baskerville', 'libre-baskerville', 'static', [400, 700]],
  ['Charis SIL', 'charis-sil', 'static', [400, 700]],
  ['iA Writer Quattro', 'ia-writer-quattro', 'static', [400, 700]],
  ['OpenDyslexic', 'opendyslexic', 'static', [400, 700]],
  ['Courier Prime', 'courier-prime', 'static', [400, 700]],
]

let css = '/* Archivo generado por scripts/gen-fonts.mjs — no editar a mano. */\n'
let count = 0
for (const [family, id, kind, weights] of FONTS) {
  const scope = kind === 'var' ? '@fontsource-variable' : '@fontsource'
  const dir = join(root, 'node_modules', scope, id)
  const unicode = JSON.parse(readFileSync(join(dir, 'unicode.json'), 'utf8'))
  for (const subset of SUBSETS) {
    if (!unicode[subset]) continue
    for (const style of ['normal', 'italic']) {
      const variants = kind === 'var' ? [[weights, `${id}-${subset}-wght-${style}.woff2`]]
        : weights.map((w) => [String(w), `${id}-${subset}-${w}-${style}.woff2`])
      for (const [weight, file] of variants) {
        if (!existsSync(join(dir, 'files', file))) continue
        css += `@font-face{font-family:'${family}';font-style:${style};font-display:swap;font-weight:${weight};` +
          `src:url(../../node_modules/${scope}/${id}/files/${file}) format('woff2');unicode-range:${unicode[subset]}}\n`
        count++
      }
    }
  }
}
writeFileSync(join(root, 'src/styles/fonts.generated.css'), css)
console.log(`fonts.generated.css: ${count} @font-face`)
