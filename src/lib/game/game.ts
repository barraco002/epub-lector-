// Estado de gamificación: XP, niveles, rachas, metas y logros.
// Se guarda con escrituras agrupadas (cada pocos segundos y al salir), nunca en cada evento.
import { computed, signal } from '@preact/signals'
import { days as dayStore, kv, type BookRecord, type DayStats } from '../db'
import { settings } from '../settings'
import { t } from '../i18n'
import { toast } from '../toasts'
import { addDays, dayKey, daysBetween, debounce, fmtNum } from '../util'
import { ACHIEVEMENTS, emptyProfile, type AchievementCtx, type Profile } from './achievements'
import { levelFromXp, levelTitle, XP } from './levels'

export const profile = signal<Profile>(emptyProfile())
export const today = signal<DayStats>(emptyDay(dayKey()))
/** Historial por día (para estadísticas y logros de fin de semana). */
export const history = signal<Map<string, DayStats>>(new Map())
export const libraryCount = signal(0)

export const level = computed(() => levelFromXp(profile.value.xp))
export const goalMs = computed(() => Math.max(1, settings.value.dailyGoalMin) * 60_000)
export const goalProgress = computed(() => Math.min(1, today.value.ms / goalMs.value))

export function emptyDay(date: string): DayStats {
  return { date, ms: 0, words: 0, pomodoros: 0, xp: 0, books: {}, hours: {} }
}

export function liveStreak(p: Profile, todayKey = dayKey()): number {
  const last = p.streak.lastDay
  if (!last) return 0
  const gap = daysBetween(last, todayKey) - 1
  if (gap <= 0) return p.streak.count
  return gap <= p.streak.freezes ? p.streak.count : 0
}
export const streak = computed(() => liveStreak(profile.value, today.value.date))

const save = debounce(async () => {
  await kv.set('profile', profile.value)
  await dayStore.put(today.value)
}, 2500)

export function flushGame() {
  save.flush()
}
addEventListener('pagehide', flushGame)
document.addEventListener('visibilitychange', () => document.hidden && flushGame())

export async function loadGame() {
  const p = await kv.get<Profile>('profile')
  if (p) {
    const base = emptyProfile()
    profile.value = { ...base, ...p, totals: { ...base.totals, ...p.totals }, streak: { ...base.streak, ...p.streak } }
  }
  const all = await dayStore.all()
  history.value = new Map(all.map((d) => [d.date, d]))
  const key = dayKey()
  today.value = history.value.get(key) ?? emptyDay(key)
}

/** Cambio de día con la app abierta (leer pasada la medianoche). */
function rollover() {
  const key = dayKey()
  if (today.value.date === key) return
  save.flush()
  today.value = history.value.get(key) ?? emptyDay(key)
}

function commitToday(d: DayStats) {
  today.value = d
  const h = new Map(history.value)
  h.set(d.date, d)
  history.value = h
}

function gainXp(amount: number, p: Profile, d: DayStats) {
  p.xp += amount
  d.xp += amount
}

function levelCheck(before: number) {
  const after = level.value.level
  if (after > before) {
    toast({ kind: 'level', icon: '⭐', title: t('¡Nivel {n}!', { n: after }), body: levelTitle(after) })
  }
}

function weekendBoth(d: DayStats) {
  const dow = new Date(d.date + 'T12:00').getDay()
  const other = dow === 0 ? addDays(d.date, -1) : dow === 6 ? addDays(d.date, 1) : null
  if (!other) return false
  return d.ms > 60_000 && (history.value.get(other)?.ms ?? 0) > 60_000
}

function checkAchievements(p: Profile, d: DayStats) {
  const ctx: AchievementCtx = { p, today: d, weekendBoth: weekendBoth(d), libraryCount: libraryCount.value }
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id]) continue
    let ok = false
    try {
      ok = a.check(ctx)
    } catch {
      ok = false
    }
    if (!ok) continue
    p.achievements[a.id] = Date.now()
    gainXp(a.xp, p, d)
    toast({ kind: 'achievement', icon: a.icon, title: t('Logro: {name}', { name: t(a.name) }), body: t('{desc} · +{xp} XP', { desc: t(a.desc, a.descVars), xp: a.xp }) })
  }
}

function mutate(fn: (p: Profile, d: DayStats) => void) {
  rollover()
  const before = level.value.level
  const p: Profile = structuredClone(profile.value)
  const d: DayStats = structuredClone(today.value)
  fn(p, d)
  checkAchievements(p, d)
  profile.value = p
  commitToday(d)
  levelCheck(before)
  save()
}

function onGoalMet(p: Profile, d: DayStats) {
  d.goal = true
  p.goalDays++
  const s = p.streak
  const key = d.date
  if (s.lastDay !== key) {
    const gap = s.lastDay ? daysBetween(s.lastDay, key) - 1 : -1
    if (gap === 0) s.count++
    else if (gap > 0 && gap <= s.freezes) {
      s.freezes -= gap
      s.count++
    } else s.count = 1
    s.lastDay = key
    s.best = Math.max(s.best, s.count)
    if (s.count % 7 === 0 && s.freezes < 2) s.freezes++
  }
  const bonus = Math.min(XP.streakBonusCap, s.count * XP.streakBonusPerDay)
  gainXp(XP.dailyGoal + bonus, p, d)
  toast({
    kind: 'goal',
    icon: '🔥',
    title: s.count > 1 ? t('¡Meta cumplida! Racha de {n} días', { n: s.count }) : t('¡Meta diaria cumplida!'),
    body:
      s.count % 7 === 0
        ? t('+{xp} XP · ganaste un comodín de racha 🧊', { xp: XP.dailyGoal + bonus })
        : t('+{xp} XP', { xp: XP.dailyGoal + bonus }),
  })
}

export interface ReadingDelta {
  ms: number
  words: number
  bookId: string
  sessionMs: number
  rain: boolean
  autoscroll: boolean
  language?: string
}

export function addReading(r: ReadingDelta) {
  if (r.ms <= 0 && r.words <= 0) return
  mutate((p, d) => {
    const wasMet = d.ms >= goalMs.value
    d.ms += r.ms
    d.words += r.words
    d.books[r.bookId] = (d.books[r.bookId] ?? 0) + r.ms
    const hour = new Date().getHours()
    d.hours = d.hours ?? {}
    d.hours[hour] = (d.hours[hour] ?? 0) + r.ms / 60_000
    p.totals.ms += r.ms
    p.totals.words += r.words
    p.totals.longestSessionMs = Math.max(p.totals.longestSessionMs, r.sessionMs)
    if (r.rain) p.totals.rainMs += r.ms
    if (r.autoscroll) p.totals.autoscrollMs += r.ms
    const lang = r.language?.slice(0, 2).toLowerCase()
    if (lang && !p.languages.includes(lang) && d.ms > 0) p.languages = [...p.languages, lang]
    gainXp(r.words * XP.perWords, p, d)
    if (!wasMet && !d.goal && d.ms >= goalMs.value) onGoalMet(p, d)
  })
}

export function pomodoroDone() {
  mutate((p, d) => {
    p.totals.pomodoros++
    d.pomodoros++
    gainXp(XP.pomodoro, p, d)
  })
}

export function chapterDone() {
  mutate((p, d) => gainXp(XP.chapter, p, d))
}

export function bookFinished(book: BookRecord) {
  const bonus = XP.bookBase + Math.round((book.totalWords / 1000) * XP.bookPer1000Words)
  mutate((p, d) => {
    p.totals.booksFinished++
    p.biggestBookWords = Math.max(p.biggestBookWords, book.totalWords)
    gainXp(bonus, p, d)
  })
  toast({ kind: 'achievement', icon: '📕', title: t('¡Terminaste «{title}»!', { title: book.title }), body: t('{n} palabras · +{xp} XP', { n: fmtNum(book.totalWords), xp: bonus }) })
}

export type TrackEvent = 'highlight' | 'lookup' | 'theme' | 'font'

export function track(e: TrackEvent) {
  mutate((p) => {
    if (e === 'highlight') p.totals.highlights++
    else if (e === 'lookup') p.totals.lookups++
    else if (e === 'theme') p.totals.themesCreated++
    else if (e === 'font') p.totals.fontsAdded++
  })
}

/** Re-evalúa logros que dependen de datos externos (p. ej. tamaño de la biblioteca). */
export function recheck() {
  mutate(() => {})
}

export function replaceProfile(p: Profile, dayList: DayStats[]) {
  profile.value = { ...emptyProfile(), ...p }
  history.value = new Map(dayList.map((d) => [d.date, d]))
  today.value = history.value.get(dayKey()) ?? emptyDay(dayKey())
}

/** Velocidad de lectura medida (palabras por minuto); 230 hasta tener datos suficientes. */
export const readingWpm = computed(() => {
  const t = profile.value.totals
  if (t.ms < 10 * 60_000 || t.words < 1000) return 230
  return Math.max(80, Math.min(900, Math.round(t.words / (t.ms / 60_000))))
})

/** XP extra (p. ej. repasar palabras). */
export function bonusXp(amount: number) {
  mutate((p, d) => gainXp(amount, p, d))
}
