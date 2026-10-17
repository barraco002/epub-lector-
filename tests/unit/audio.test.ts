import { describe, expect, it } from 'vitest'
import { bake, loopable, normalize, RECIPES, rng } from '../../src/lib/audio/generators'

describe('sonidos procedurales', () => {
  it('el bucle es continuo: el final enlaza con el principio', () => {
    const n = 1000
    const fade = 100
    const src = new Float32Array(n + fade).map((_, i) => Math.sin(i / 7))
    const out = loopable(src, n, fade)
    expect(out.length).toBe(n)
    // la muestra 0 del bucle es la continuación natural de la última
    expect(Math.abs(out[0] - src[n])).toBeLessThan(1e-6)
  })
  it('normaliza sin saturar', () => {
    const buf = new Float32Array(2000).map(() => (Math.random() * 2 - 1) * 3)
    normalize(buf)
    expect(Math.max(...buf.map(Math.abs))).toBeLessThanOrEqual(0.951)
  })
  it.each(RECIPES.map((r) => [r.name, r] as const))('%s: se genera sin NaN ni silencio', (_n, recipe) => {
    const { data } = bake({ ...recipe, seconds: 1.2 }, 22050, 42)
    let sum = 0
    for (const v of data) {
      expect(Number.isFinite(v)).toBe(true)
      sum += v * v
    }
    expect(Math.sqrt(sum / data.length)).toBeGreaterThan(0.01)
  })
  it('el generador aleatorio es determinista', () => {
    const a = rng(7)
    const b = rng(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})
