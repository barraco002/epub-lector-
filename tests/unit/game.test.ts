import { describe, expect, it } from 'vitest'
import { levelFromXp, levelTitle, xpForLevel } from '../../src/lib/game/levels'
import { liveStreak } from '../../src/lib/game/game'
import { emptyProfile } from '../../src/lib/game/achievements'
import { addDays, daysBetween, countWords } from '../../src/lib/util'
import { inWindow } from '../../src/lib/appearance'

describe('niveles', () => {
  it('curva creciente y nivel 2 alcanzable el primer día', () => {
    expect(xpForLevel(1)).toBe(0)
    expect(xpForLevel(2)).toBe(100)
    for (let l = 2; l < 60; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l))
    expect(levelFromXp(0).level).toBe(1)
    expect(levelFromXp(99).level).toBe(1)
    expect(levelFromXp(100).level).toBe(2)
    const lv = levelFromXp(150)
    expect(lv.progress).toBeGreaterThan(0)
    expect(lv.progress).toBeLessThan(1)
    expect(levelTitle(1)).toBe('Aprendiz de lector')
    expect(levelTitle(55)).toBe('Leyenda lunar')
  })
})

describe('rachas', () => {
  const today = '2026-10-17'
  it('se mantiene si se leyó ayer u hoy', () => {
    const p = emptyProfile()
    p.streak = { count: 5, best: 5, lastDay: addDays(today, -1), freezes: 0 }
    expect(liveStreak(p, today)).toBe(5)
    p.streak.lastDay = today
    expect(liveStreak(p, today)).toBe(5)
  })
  it('se rompe tras un día perdido sin comodines y los comodines la protegen', () => {
    const p = emptyProfile()
    p.streak = { count: 9, best: 9, lastDay: addDays(today, -2), freezes: 0 }
    expect(liveStreak(p, today)).toBe(0)
    p.streak.freezes = 1
    expect(liveStreak(p, today)).toBe(9)
  })
})

describe('utilidades', () => {
  it('cuenta días entre fechas, también con cambio de mes y año', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('cuenta palabras', () => {
    expect(countWords('Hola, ¿qué tal?  Bien.')).toBe(4)
    expect(countWords('')).toBe(0)
  })
  it('franja horaria del filtro de luz azul cruza la medianoche', () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 17, h, m)
    expect(inWindow(at(22), '21:00', '07:00')).toBe(true)
    expect(inWindow(at(3), '21:00', '07:00')).toBe(true)
    expect(inWindow(at(12), '21:00', '07:00')).toBe(false)
    expect(inWindow(at(14), '13:00', '15:30')).toBe(true)
    expect(inWindow(at(15, 30), '13:00', '15:30')).toBe(false)
  })
})
