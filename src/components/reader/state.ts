import { signal } from '@preact/signals'
import type { Annotation, BookRecord, Position } from '../../lib/db'
import type { EpubBook, TocItem } from '../../lib/epub/book'
import type { ReaderEngine } from '../../lib/reader/engine'
import type { ReadingSession } from '../../lib/reader/session'
import type { AutoScroller } from '../../lib/reader/autoscroll'

export type PanelId = 'typo' | 'theme' | 'sound' | 'pomo' | 'toc' | 'search' | 'auto' | null

export interface ActiveReader {
  book: EpubBook
  record: BookRecord
  engine: ReaderEngine
  session: ReadingSession
  auto: AutoScroller
  chapterLabel: (s: number) => string
  /** Navega marcando el salto para que no cuente como lectura */
  jump: (target: Position | { s: number; fragment: string }) => Promise<void>
  scrollScreen: (dir: 1 | -1) => void
}

export const active = signal<ActiveReader | null>(null)
export const panel = signal<PanelId>(null)
export const chrome = signal(false)
export const position = signal<{ s: number; c: number; progress: number; chapterProgress: number }>({ s: 0, c: 0, progress: 0, chapterProgress: 0 })
export const bookAnnotations = signal<Annotation[]>([])
export const searchQuery = signal('')

export function flattenToc(items: TocItem[], out: TocItem[] = []): TocItem[] {
  for (const it of items) {
    out.push(it)
    if (it.children.length) flattenToc(it.children, out)
  }
  return out
}

export function openPanel(id: PanelId) {
  panel.value = panel.value === id ? null : id
}
