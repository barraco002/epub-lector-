import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface Position {
  /** Índice del capítulo en el spine. */
  s: number
  /** Desplazamiento de caracteres dentro del capítulo. */
  c: number
}

export interface ChapterStats {
  chars: number
  words: number
}

export type BookStatus = 'new' | 'reading' | 'finished'

export interface BookRecord {
  id: string
  title: string
  authors: string[]
  language: string
  publisher: string
  description: string
  cover?: Blob
  size: number
  addedAt: number
  openedAt?: number
  finishedAt?: number
  chapters: ChapterStats[]
  totalChars: number
  totalWords: number
  position?: Position
  /** 0..1 */
  progress: number
  timeMs: number
  wordsRead: number
  status: BookStatus
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple'

export interface Annotation {
  id: string
  bookId: string
  kind: 'highlight' | 'bookmark'
  s: number
  start: number
  end: number
  text: string
  note?: string
  color: HighlightColor
  createdAt: number
}

export interface DayStats {
  date: string
  ms: number
  words: number
  pomodoros: number
  xp: number
  /** ms por libro ese día */
  books: Record<string, number>
  /** minutos leídos por franja horaria (0-23) para logros tipo "búho nocturno" */
  hours?: Record<number, number>
  /** meta diaria cumplida */
  goal?: boolean
}

export interface CustomFont {
  id: string
  name: string
  data: Blob
  addedAt: number
}

interface Schema extends DBSchema {
  books: { key: string; value: BookRecord }
  files: { key: string; value: { id: string; data: Blob } }
  annotations: { key: string; value: Annotation; indexes: { bookId: string } }
  days: { key: string; value: DayStats }
  kv: { key: string; value: unknown }
  fonts: { key: string; value: CustomFont }
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

export function db() {
  dbPromise ??= openDB<Schema>('lunaria', 1, {
    upgrade(d) {
      d.createObjectStore('books', { keyPath: 'id' })
      d.createObjectStore('files', { keyPath: 'id' })
      d.createObjectStore('annotations', { keyPath: 'id' }).createIndex('bookId', 'bookId')
      d.createObjectStore('days', { keyPath: 'date' })
      d.createObjectStore('kv')
      d.createObjectStore('fonts', { keyPath: 'id' })
    },
  })
  return dbPromise
}

export const books = {
  all: async () => (await db()).getAll('books'),
  get: async (id: string) => (await db()).get('books', id),
  put: async (b: BookRecord) => void (await db()).put('books', b),
  async update(id: string, patch: Partial<BookRecord>) {
    const d = await db()
    const tx = d.transaction('books', 'readwrite')
    const cur = await tx.store.get(id)
    if (cur) await tx.store.put({ ...cur, ...patch })
    await tx.done
  },
  async remove(id: string) {
    const d = await db()
    const tx = d.transaction(['books', 'files', 'annotations'], 'readwrite')
    await tx.objectStore('books').delete(id)
    await tx.objectStore('files').delete(id)
    const idx = tx.objectStore('annotations').index('bookId')
    for (let c = await idx.openCursor(id); c; c = await c.continue()) await c.delete()
    await tx.done
  },
  file: async (id: string) => (await (await db()).get('files', id))?.data,
  putFile: async (id: string, data: Blob) => void (await db()).put('files', { id, data }),
}

export const annotations = {
  forBook: async (bookId: string) => (await db()).getAllFromIndex('annotations', 'bookId', bookId),
  all: async () => (await db()).getAll('annotations'),
  put: async (a: Annotation) => void (await db()).put('annotations', a),
  remove: async (id: string) => void (await db()).delete('annotations', id),
}

export const days = {
  all: async () => (await db()).getAll('days'),
  get: async (date: string) => (await db()).get('days', date),
  put: async (d: DayStats) => void (await db()).put('days', d),
}

export const kv = {
  get: async <T>(key: string) => (await (await db()).get('kv', key)) as T | undefined,
  set: async (key: string, value: unknown) => void (await db()).put('kv', value, key),
}

export const fonts = {
  all: async () => (await db()).getAll('fonts'),
  put: async (f: CustomFont) => void (await db()).put('fonts', f),
  remove: async (id: string) => void (await db()).delete('fonts', id),
}

/** Pide al navegador que no borre los datos bajo presión de espacio. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {
    /* no soportado */
  }
}
