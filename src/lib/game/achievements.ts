import type { DayStats } from '../db'
import { fmtNum } from '../util'

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
  /** Valores de los marcadores de desc ({n}, {h}…). Se leen al pintar: t(desc, descVars). */
  descVars?: Record<string, number | string>
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
  id, name, icon, xp, desc: 'Lee {n} palabras en total',
  // Getter: fmtNum se evalúa al pintar, así que sigue al idioma activo
  get descVars() { return { n: fmtNum(n) } },
  check: (c) => c.p.totals.words >= n, progress: (c) => ratio(c.p.totals.words, n),
})
const books = (id: string, n: number, name: string, icon: string, xp: number): Achievement => ({
  id, name, icon, xp, desc: n === 1 ? 'Termina tu primer libro' : 'Termina {n} libros', descVars: { n },
  check: (c) => c.p.totals.booksFinished >= n, progress: (c) => ratio(c.p.totals.booksFinished, n),
})
const streak = (id: string, n: number, name: string, icon: string, xp: number): Achievement => ({
  id, name, icon, xp, desc: 'Cumple tu meta diaria {n} días seguidos', descVars: { n },
  check: (c) => c.p.streak.best >= n, progress: (c) => ratio(c.p.streak.best, n),
})
const pomos = (id: string, n: number, name: string, icon: string, xp: number): Achievement => ({
  id, name, icon, xp, desc: n === 1 ? 'Completa tu primer pomodoro' : 'Completa {n} pomodoros', descVars: { n },
  check: (c) => c.p.totals.pomodoros >= n, progress: (c) => ratio(c.p.totals.pomodoros, n),
})

const minutesBetween = (today: DayStats, from: number, to: number) => {
  let m = 0
  for (let h = from; h < to; h++) m += today.hours?.[h] ?? 0
  return m
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-steps', name: 'Primeras páginas', icon: '🌱', xp: 10, desc: 'Lee durante {n} minuto', descVars: { n: 1 }, check: (c) => c.p.totals.ms >= MIN },
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
  { id: 'pomo-day-4', name: 'Ciclo completo', icon: '🔄', xp: 60, desc: 'Completa {n} pomodoros en un día', descVars: { n: 4 }, check: (c) => c.today.pomodoros >= 4, progress: (c) => ratio(c.today.pomodoros, 4) },
  { id: 'marathon', name: 'Maratón', icon: '🏃', xp: 80, desc: 'Lee {n} horas en un mismo día', descVars: { n: 2 }, check: (c) => c.today.ms >= 2 * HOUR, progress: (c) => ratio(c.today.ms, 2 * HOUR) },
  { id: 'ultra', name: 'Ultramaratón', icon: '🦾', xp: 200, desc: 'Lee {n} horas en un mismo día', descVars: { n: 4 }, check: (c) => c.today.ms >= 4 * HOUR, progress: (c) => ratio(c.today.ms, 4 * HOUR) },
  { id: 'deep', name: 'Inmersión profunda', icon: '🤿', xp: 60, desc: 'Lee {n} minutos en una sola sesión', descVars: { n: 60 }, check: (c) => c.p.totals.longestSessionMs >= HOUR, progress: (c) => ratio(c.p.totals.longestSessionMs, HOUR) },
  { id: 'owl', name: 'Búho nocturno', icon: '🦉', xp: 40, desc: 'Lee {n} minutos entre la medianoche y las {h}', descVars: { n: 15, h: 4 }, check: (c) => minutesBetween(c.today, 0, 4) >= 15 },
  { id: 'lark', name: 'Madrugador', icon: '🐦', xp: 40, desc: 'Lee {n} minutos antes de las {h} de la mañana', descVars: { n: 15, h: 7 }, check: (c) => minutesBetween(c.today, 4, 7) >= 15 },
  { id: 'weekend', name: 'Fin de semana lector', icon: '☕', xp: 40, desc: 'Lee el sábado y el domingo', check: (c) => c.weekendBoth },
  { id: 'goal-7', name: 'Constancia', icon: '🎯', xp: 60, desc: 'Cumple la meta diaria {n} días (no hace falta seguidos)', descVars: { n: 7 }, check: (c) => c.p.goalDays >= 7, progress: (c) => ratio(c.p.goalDays, 7) },
  { id: 'goal-30', name: 'Disciplina', icon: '🧭', xp: 200, desc: 'Cumple la meta diaria {n} días', descVars: { n: 30 }, check: (c) => c.p.goalDays >= 30, progress: (c) => ratio(c.p.goalDays, 30) },
  { id: 'brick', name: 'Ladrillo', icon: '🧱', xp: 200, desc: 'Termina un libro de más de {n} palabras', get descVars() { return { n: fmtNum(150_000) } }, check: (c) => c.p.biggestBookWords >= 150_000 },
  { id: 'polyglot', name: 'Políglota', icon: '🌍', xp: 60, desc: 'Lee libros en {n} idiomas distintos', descVars: { n: 2 }, check: (c) => c.p.languages.length >= 2 },
  { id: 'collector', name: 'Coleccionista', icon: '🗃️', xp: 30, desc: 'Ten {n} libros en tu biblioteca', descVars: { n: 10 }, check: (c) => c.libraryCount >= 10, progress: (c) => ratio(c.libraryCount, 10) },
  { id: 'highlighter', name: 'Subrayador', icon: '🖍️', xp: 30, desc: 'Haz {n} subrayados', descVars: { n: 10 }, check: (c) => c.p.totals.highlights >= 10, progress: (c) => ratio(c.p.totals.highlights, 10) },
  { id: 'annotator', name: 'Marginalia', icon: '🪶', xp: 100, desc: 'Haz {n} subrayados', descVars: { n: 100 }, check: (c) => c.p.totals.highlights >= 100, progress: (c) => ratio(c.p.totals.highlights, 100) },
  { id: 'lexicon', name: 'Lexicógrafo', icon: '🔎', xp: 40, desc: 'Consulta el diccionario {n} veces', descVars: { n: 25 }, check: (c) => c.p.totals.lookups >= 25, progress: (c) => ratio(c.p.totals.lookups, 25) },
  { id: 'rain', name: 'Lluvia de ideas', icon: '🌧️', xp: 40, desc: 'Lee {n} minutos con sonido de lluvia', descVars: { n: 30 }, check: (c) => c.p.totals.rainMs >= 30 * MIN, progress: (c) => ratio(c.p.totals.rainMs, 30 * MIN) },
  { id: 'stylist', name: 'Estilista', icon: '🎨', xp: 25, desc: 'Crea un tema propio', check: (c) => c.p.totals.themesCreated >= 1 },
  { id: 'typographer', name: 'Tipógrafo', icon: '🔤', xp: 25, desc: 'Añade una fuente propia', check: (c) => c.p.totals.fontsAdded >= 1 },
  { id: 'cruise', name: 'Piloto automático', icon: '🛸', xp: 40, desc: 'Lee {n} minutos con autoscroll', descVars: { n: 30 }, check: (c) => c.p.totals.autoscrollMs >= 30 * MIN, progress: (c) => ratio(c.p.totals.autoscrollMs, 30 * MIN) },
  { id: 'hours-10', name: 'Diez horas', icon: '⏳', xp: 100, desc: 'Acumula {n} horas de lectura', descVars: { n: 10 }, check: (c) => c.p.totals.ms >= 10 * HOUR, progress: (c) => ratio(c.p.totals.ms, 10 * HOUR) },
  { id: 'hours-100', name: 'Cien horas', icon: '⌛', xp: 500, desc: 'Acumula {n} horas de lectura', descVars: { n: 100 }, check: (c) => c.p.totals.ms >= 100 * HOUR, progress: (c) => ratio(c.p.totals.ms, 100 * HOUR) },
]
