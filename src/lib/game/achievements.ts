import type { DayStats } from '../db'

export interface Profile {
  xp: number
  achievements: Record<string, number>
  streak: { count: number; best: number; lastDay: string | null; freezes: number }
  goalDays: number
  totals: {
    ms: number
    words: number
    pomodoros: number
    booksFinished: number
    highlights: number
    lookups: number
    longestSessionMs: number
    rainMs: number
    themesCreated: number
    fontsAdded: number
    autoscrollMs: number
  }
  languages: string[]
  biggestBookWords: number
}

export const emptyProfile = (): Profile => ({
  xp: 0,
  achievements: {},
  streak: { count: 0, best: 0, lastDay: null, freezes: 0 },
  goalDays: 0,
  totals: {
    ms: 0,
    words: 0,
    pomodoros: 0,
    booksFinished: 0,
    highlights: 0,
    lookups: 0,
    longestSessionMs: 0,
    rainMs: 0,
    themesCreated: 0,
    fontsAdded: 0,
    autoscrollMs: 0,
  },
  languages: [],
  biggestBookWords: 0,
})

export interface AchievementCtx {
  p: Profile
  today: DayStats
  /** días con lectura (para fin de semana) */
  weekendBoth: boolean
  libraryCount: number
}

export interface Achievement {
  id: string
  name: string
  desc: string
  icon: string
  xp: number
  check: (c: AchievementCtx) => boolean
  /** Progreso 0..1 para mostrar en la vitrina */
  progress?: (c: AchievementCtx) => number
}

const MIN = 60_000
const HOUR = 60 * MIN
const ratio = (v: number, goal: number) => Math.min(1, v / goal)

const words = (id: string, n: number, name: string, icon: string, xp: number): Achievement => ({
  id, name, icon, xp, desc: `Lee ${n.toLocaleString('es')} palabras en total`,
  check: (c) => c.p.totals.words >= n, progress: (c) => ratio(c.p.totals.words, n),
})
const books = (id: string, n: number, name: string, icon: string, xp: number): Achievement => ({
  id, name, icon, xp, desc: n === 1 ? 'Termina tu primer libro' : `Termina ${n} libros`,
  check: (c) => c.p.totals.booksFinished >= n, progress: (c) => ratio(c.p.totals.booksFinished, n),
})
const streak = (id: string, n: number, name: string, icon: string, xp: number): Achievement => ({
  id, name, icon, xp, desc: `Cumple tu meta diaria ${n} días seguidos`,
  check: (c) => c.p.streak.best >= n, progress: (c) => ratio(c.p.streak.best, n),
})
const pomos = (id: string, n: number, name: string, icon: string, xp: number): Achievement => ({
  id, name, icon, xp, desc: n === 1 ? 'Completa tu primer pomodoro' : `Completa ${n} pomodoros`,
  check: (c) => c.p.totals.pomodoros >= n, progress: (c) => ratio(c.p.totals.pomodoros, n),
})

const minutesBetween = (today: DayStats, from: number, to: number) => {
  let m = 0
  for (let h = from; h < to; h++) m += today.hours?.[h] ?? 0
  return m
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-steps', name: 'Primeras páginas', icon: '🌱', xp: 10, desc: 'Lee durante 1 minuto', check: (c) => c.p.totals.ms >= MIN },
  words('words-1k', 1_000, 'Mil palabras', '✍️', 15),
  words('words-10k', 10_000, 'Diez mil palabras', '📜', 40),
  words('words-100k', 100_000, 'Cien mil palabras', '📚', 120),
  words('words-500k', 500_000, 'Medio millón', '🏛️', 300),
  words('words-1m', 1_000_000, 'Millonario de palabras', '💎', 600),
  books('book-1', 1, 'Fin', '🎉', 80),
  books('book-5', 5, 'Estantería', '🗄️', 150),
  books('book-10', 10, 'Biblioteca personal', '🏠', 300),
  books('book-25', 25, 'Bibliotecario', '🦉', 600),
  books('book-50', 50, 'Alejandría', '🌕', 1000),
  streak('streak-3', 3, 'Calentando motores', '🔥', 30),
  streak('streak-7', 7, 'Una semana entera', '📅', 70),
  streak('streak-14', 14, 'Hábito en marcha', '⚡', 120),
  streak('streak-30', 30, 'Un mes de lectura', '🌙', 300),
  streak('streak-100', 100, 'Centenario', '🏆', 800),
  streak('streak-365', 365, 'Un año lunar', '🌌', 2000),
  pomos('pomo-1', 1, 'Tomate maduro', '🍅', 15),
  pomos('pomo-10', 10, 'Huerto', '🧺', 50),
  pomos('pomo-50', 50, 'Cosecha', '🌾', 150),
  pomos('pomo-100', 100, 'Granjero del enfoque', '🚜', 300),
  { id: 'pomo-day-4', name: 'Ciclo completo', icon: '🔄', xp: 60, desc: 'Completa 4 pomodoros en un día', check: (c) => c.today.pomodoros >= 4, progress: (c) => ratio(c.today.pomodoros, 4) },
  { id: 'marathon', name: 'Maratón', icon: '🏃', xp: 80, desc: 'Lee 2 horas en un mismo día', check: (c) => c.today.ms >= 2 * HOUR, progress: (c) => ratio(c.today.ms, 2 * HOUR) },
  { id: 'ultra', name: 'Ultramaratón', icon: '🦾', xp: 200, desc: 'Lee 4 horas en un mismo día', check: (c) => c.today.ms >= 4 * HOUR, progress: (c) => ratio(c.today.ms, 4 * HOUR) },
  { id: 'deep', name: 'Inmersión profunda', icon: '🤿', xp: 60, desc: 'Lee 60 minutos en una sola sesión', check: (c) => c.p.totals.longestSessionMs >= HOUR, progress: (c) => ratio(c.p.totals.longestSessionMs, HOUR) },
  { id: 'owl', name: 'Búho nocturno', icon: '🦉', xp: 40, desc: 'Lee 15 minutos entre la medianoche y las 4', check: (c) => minutesBetween(c.today, 0, 4) >= 15 },
  { id: 'lark', name: 'Madrugador', icon: '🐦', xp: 40, desc: 'Lee 15 minutos antes de las 7 de la mañana', check: (c) => minutesBetween(c.today, 4, 7) >= 15 },
  { id: 'weekend', name: 'Fin de semana lector', icon: '☕', xp: 40, desc: 'Lee el sábado y el domingo', check: (c) => c.weekendBoth },
  { id: 'goal-7', name: 'Constancia', icon: '🎯', xp: 60, desc: 'Cumple la meta diaria 7 días (no hace falta seguidos)', check: (c) => c.p.goalDays >= 7, progress: (c) => ratio(c.p.goalDays, 7) },
  { id: 'goal-30', name: 'Disciplina', icon: '🧭', xp: 200, desc: 'Cumple la meta diaria 30 días', check: (c) => c.p.goalDays >= 30, progress: (c) => ratio(c.p.goalDays, 30) },
  { id: 'brick', name: 'Ladrillo', icon: '🧱', xp: 200, desc: 'Termina un libro de más de 150.000 palabras', check: (c) => c.p.biggestBookWords >= 150_000 },
  { id: 'polyglot', name: 'Políglota', icon: '🌍', xp: 60, desc: 'Lee libros en 2 idiomas distintos', check: (c) => c.p.languages.length >= 2 },
  { id: 'collector', name: 'Coleccionista', icon: '🗃️', xp: 30, desc: 'Ten 10 libros en tu biblioteca', check: (c) => c.libraryCount >= 10, progress: (c) => ratio(c.libraryCount, 10) },
  { id: 'highlighter', name: 'Subrayador', icon: '🖍️', xp: 30, desc: 'Haz 10 subrayados', check: (c) => c.p.totals.highlights >= 10, progress: (c) => ratio(c.p.totals.highlights, 10) },
  { id: 'annotator', name: 'Marginalia', icon: '🪶', xp: 100, desc: 'Haz 100 subrayados', check: (c) => c.p.totals.highlights >= 100, progress: (c) => ratio(c.p.totals.highlights, 100) },
  { id: 'lexicon', name: 'Lexicógrafo', icon: '🔎', xp: 40, desc: 'Consulta el diccionario 25 veces', check: (c) => c.p.totals.lookups >= 25, progress: (c) => ratio(c.p.totals.lookups, 25) },
  { id: 'rain', name: 'Lluvia de ideas', icon: '🌧️', xp: 40, desc: 'Lee 30 minutos con sonido de lluvia', check: (c) => c.p.totals.rainMs >= 30 * MIN, progress: (c) => ratio(c.p.totals.rainMs, 30 * MIN) },
  { id: 'stylist', name: 'Estilista', icon: '🎨', xp: 25, desc: 'Crea un tema propio', check: (c) => c.p.totals.themesCreated >= 1 },
  { id: 'typographer', name: 'Tipógrafo', icon: '🔤', xp: 25, desc: 'Añade una fuente propia', check: (c) => c.p.totals.fontsAdded >= 1 },
  { id: 'cruise', name: 'Piloto automático', icon: '🛸', xp: 40, desc: 'Lee 30 minutos con autoscroll', check: (c) => c.p.totals.autoscrollMs >= 30 * MIN, progress: (c) => ratio(c.p.totals.autoscrollMs, 30 * MIN) },
  { id: 'hours-10', name: 'Diez horas', icon: '⏳', xp: 100, desc: 'Acumula 10 horas de lectura', check: (c) => c.p.totals.ms >= 10 * HOUR, progress: (c) => ratio(c.p.totals.ms, 10 * HOUR) },
  { id: 'hours-100', name: 'Cien horas', icon: '⌛', xp: 500, desc: 'Acumula 100 horas de lectura', check: (c) => c.p.totals.ms >= 100 * HOUR, progress: (c) => ratio(c.p.totals.ms, 100 * HOUR) },
]
