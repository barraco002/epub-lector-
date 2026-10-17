// Curva de niveles: suave al principio (nivel 2 el primer día) y exigente después
// (nivel 30 ≈ 3-4 meses leyendo 30 min diarios).
export const xpForLevel = (level: number) => {
  const l = Math.max(0, level - 1)
  return Math.round(50 * l ** 1.8 + 50 * l)
}

export function levelFromXp(xp: number) {
  let level = 1
  while (xpForLevel(level + 1) <= xp) level++
  const base = xpForLevel(level)
  const next = xpForLevel(level + 1)
  return { level, base, next, progress: (xp - base) / (next - base) }
}

const TITLES: [number, string][] = [
  [1, 'Aprendiz de lector'],
  [3, 'Hojeador'],
  [5, 'Lector curioso'],
  [8, 'Devorador de capítulos'],
  [12, 'Ratón de biblioteca'],
  [16, 'Bibliófilo'],
  [20, 'Erudito'],
  [25, 'Archivista'],
  [30, 'Guardián de Alejandría'],
  [40, 'Sabio'],
  [50, 'Leyenda lunar'],
]

export const levelTitle = (level: number) => [...TITLES].reverse().find(([l]) => level >= l)![1]

/** XP por palabras leídas: 1 XP cada 50 palabras (≈5 XP por minuto a 250 ppm). */
export const XP = {
  perWords: 1 / 50,
  pomodoro: 25,
  dailyGoal: 50,
  chapter: 10,
  bookBase: 200,
  bookPer1000Words: 1,
  streakBonusPerDay: 5,
  streakBonusCap: 100,
}
