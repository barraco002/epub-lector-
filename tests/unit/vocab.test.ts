import { describe, expect, it } from 'vitest'
import { INTERVAL_DAYS, MASTERED_BOX, nextState, sentenceAround, type VocabWord } from '../../src/lib/vocab'

const DAY = 86_400_000
const word = (box: number): VocabWord => ({ id: 'w', word: 'gleam', lang: 'en', meaning: 'brillo', box, due: 0, addedAt: 0, reviews: 0 })

describe('Mis palabras', () => {
  it('acertar sube de caja y espacia el repaso', () => {
    const w = nextState(word(0), true, 0)
    expect(w.box).toBe(1)
    expect(w.due).toBe(INTERVAL_DAYS[1] * DAY)
    expect(w.reviews).toBe(1)
  })
  it('fallar vuelve a la primera caja (mañana)', () => {
    const w = nextState(word(4), false, 0)
    expect(w.box).toBe(0)
    expect(w.due).toBe(DAY)
  })
  it('la caja más alta es el tope', () => {
    expect(nextState(word(MASTERED_BOX), true, 0).box).toBe(MASTERED_BOX)
  })
  it('extrae la frase que contiene la palabra', () => {
    const text = 'Era de noche. A lo lejos vio un gleam dorado sobre el agua. Luego nada.'
    const at = text.indexOf('gleam')
    expect(sentenceAround(text, at, at + 5)).toBe('A lo lejos vio un gleam dorado sobre el agua.')
  })
  it('recorta frases muy largas', () => {
    const text = 'x '.repeat(500) + 'gleam' + ' y'.repeat(500)
    const at = text.indexOf('gleam')
    expect(sentenceAround(text, at, at + 5, 40).length).toBeLessThan(100)
  })
})
