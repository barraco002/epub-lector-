import { describe, expect, it } from 'vitest'
import { numbersItself } from '../../src/lib/util'

describe('numbersItself', () => {
  it('reconoce los títulos que ya numeran el capítulo', () => {
    for (const t of ['Capítulo 2', 'Cap. 3', 'Chapter IV', 'Parte I', '2. El viaje', 'I. Introducción', 'Libro II', '12']) {
      expect(numbersItself(t), t).toBe(true)
    }
  })

  it('no toma por número palabras que solo empiezan igual', () => {
    for (const t of ['Prólogo', 'Introducción', 'El viaje', 'Mil días', 'Civilización', 'Lo que el viento se llevó']) {
      expect(numbersItself(t), t).toBe(false)
    }
  })
})
