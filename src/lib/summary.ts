// Resumen de sesión: se muestra al cerrar el libro, que es donde van las celebraciones.
import { signal } from '@preact/signals'
import { annotations, type BookRecord } from './db'
import { history, today } from './game/game'
import type { Toast } from './toasts'

export interface SessionSummary {
  bookId: string
  title: string
  ms: number
  words: number
  readFraction: number
  progress: number
  xp: number
  chapters: number
  celebrations: Toast[]
  finished: boolean
}

export const sessionSummary = signal<SessionSummary | null>(null)

export interface BookStats {
  timeMs: number
  days: number
  firstDay: string | null
  lastDay: string | null
  highlights: number
  notes: number
  wpm: number | null
}

/** Estadísticas de un libro a partir del historial diario y sus anotaciones. */
export async function bookStats(book: BookRecord): Promise<BookStats> {
  const days = [...history.value.values(), today.value].filter((d) => (d.books?.[book.id] ?? 0) > 30_000)
  const keys = [...new Set(days.map((d) => d.date))].sort()
  const anns = (await annotations.forBook(book.id)).filter((a) => a.kind === 'highlight')
  const minutes = book.timeMs / 60_000
  return {
    timeMs: book.timeMs,
    days: keys.length,
    firstDay: keys[0] ?? null,
    lastDay: keys.at(-1) ?? null,
    highlights: anns.length,
    notes: anns.filter((a) => a.note).length,
    wpm: minutes > 10 && book.wordsRead > 500 ? Math.round(book.wordsRead / minutes) : null,
  }
}
