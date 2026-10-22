// Mis palabras: vocabulario guardado desde el diccionario, con su frase del libro,
// y repaso espaciado con cajas de Leitner (1, 2, 4, 8, 16 y 32 días).
import { computed, signal } from '@preact/signals'
import { kv } from './db'
import { bonusXp } from './game/game'
import { uid } from './util'

export interface VocabWord {
  id: string
  word: string
  lang: string
  meaning: string
  context?: string
  bookId?: string
  bookTitle?: string
  /** Caja de Leitner (0 = nueva o fallada) */
  box: number
  /** Próximo repaso (ms) */
  due: number
  addedAt: number
  reviews: number
}

const KEY = 'vocab'
const DAY = 86_400_000
export const INTERVAL_DAYS = [1, 2, 4, 8, 16, 32]
export const MASTERED_BOX = INTERVAL_DAYS.length - 1

export const vocab = signal<VocabWord[]>([])
const now = signal(Date.now())
export const dueWords = computed(() => vocab.value.filter((w) => w.due <= now.value))

export async function loadVocab() {
  vocab.value = (await kv.get<VocabWord[]>(KEY)) ?? []
}

async function persist(list: VocabWord[]) {
  vocab.value = list
  await kv.set(KEY, list)
}

const norm = (w: string) => w.trim().toLowerCase()

export const isSaved = (word: string) => vocab.value.some((w) => norm(w.word) === norm(word))

/** Guarda (o actualiza) una palabra. La primera revisión llega al día siguiente. */
export async function saveWord(entry: Pick<VocabWord, 'word' | 'lang' | 'meaning' | 'context' | 'bookId' | 'bookTitle'>) {
  const list = vocab.peek()
  const existing = list.find((w) => norm(w.word) === norm(entry.word))
  if (existing) return persist(list.map((w) => (w === existing ? { ...w, ...entry, meaning: entry.meaning || w.meaning } : w)))
  const t = Date.now()
  return persist([{ ...entry, id: uid(), box: 0, due: t + DAY, addedAt: t, reviews: 0 }, ...list])
}

export async function removeWord(id: string) {
  await persist(vocab.peek().filter((w) => w.id !== id))
}

/** Resultado de un repaso: acierto sube de caja; fallo vuelve a la primera. */
export function nextState(w: VocabWord, knew: boolean, t = Date.now()): VocabWord {
  const box = knew ? Math.min(MASTERED_BOX, w.box + 1) : 0
  return {
    ...w,
    box,
    due: t + INTERVAL_DAYS[box] * DAY,
    reviews: w.reviews + 1,
  }
}

export async function review(id: string, knew: boolean) {
  const list = vocab.peek()
  await persist(list.map((w) => (w.id === id ? nextState(w, knew) : w)))
  if (knew) bonusXp(2)
  now.value = Date.now()
}

export function refreshDue() {
  now.value = Date.now()
}

/** Frase que contiene [start, end) dentro del texto del capítulo, recortada a ~240 letras. */
export function sentenceAround(text: string, start: number, end: number, max = 240): string {
  const stops = /[.!?…;\n]/
  let a = start
  while (a > 0 && start - a < max && !stops.test(text[a - 1])) a--
  let b = end
  while (b < text.length && b - end < max && !stops.test(text[b])) b++
  if (b < text.length && text[b] !== '\n') b++
  return text.slice(a, b).replace(/\s+/g, ' ').trim()
}
