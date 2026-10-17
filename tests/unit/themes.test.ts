import { describe, expect, it } from 'vitest'
import { BUILTIN_THEMES, resolveTheme } from '../../src/lib/themes'
import { contrast, intensityToKelvin, warm, parseHex } from '../../src/lib/color'

describe('temas', () => {
  it('hay muchos temas y sus ids son únicos', () => {
    expect(BUILTIN_THEMES.length).toBeGreaterThanOrEqual(40)
    expect(new Set(BUILTIN_THEMES.map((t) => t.id)).size).toBe(BUILTIN_THEMES.length)
  })
  it.each(BUILTIN_THEMES.map((t) => [t.name, t] as const))('%s: texto legible (WCAG ≥ 4.5:1) y secundario ≥ 3.5:1', (_name, t) => {
    expect(contrast(t.text, t.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t.muted, t.bg)).toBeGreaterThanOrEqual(3.5)
    if (t.heading) expect(contrast(t.heading, t.bg)).toBeGreaterThanOrEqual(4.5)
  })
  it('el filtro de luz azul reduce el azul más que el rojo', () => {
    const [r, , b] = parseHex(warm('#ffffff', intensityToKelvin(60)))
    expect(r).toBe(255)
    expect(b).toBeLessThan(200)
    const vars = resolveTheme(BUILTIN_THEMES[0], intensityToKelvin(60)).vars
    expect(vars['--bg']).not.toBe(BUILTIN_THEMES[0].bg)
  })
})
