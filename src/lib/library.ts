import { signal } from '@preact/signals'
import { annotations, books, kv, type BookRecord } from './db'
import { importEpub } from './importer'
import { error, info, toast } from './toasts'
import { libraryCount, recheck } from './game/game'
import { saveFile } from './native'
import { locale, t } from './i18n'

export const library = signal<BookRecord[]>([])
export const importing = signal<{ name: string; progress: number; index: number; total: number } | null>(null)

const coverUrls = new Map<string, string>()

export function coverUrl(book: BookRecord): string | null {
  if (!book.cover) return null
  let url = coverUrls.get(book.id)
  if (!url) {
    url = URL.createObjectURL(book.cover)
    coverUrls.set(book.id, url)
  }
  return url
}

export async function refreshLibrary() {
  library.value = await books.all()
  libraryCount.value = library.value.length
}

export function patchBook(id: string, patch: Partial<BookRecord>) {
  library.value = library.value.map((b) => (b.id === id ? { ...b, ...patch } : b))
}

/** Progreso de libros que venían en una copia de seguridad pero cuyo archivo aún no estaba. */
interface Orphan {
  position?: BookRecord['position']
  progress: number
  timeMs: number
  wordsRead: number
  status: BookRecord['status']
  finishedAt?: number
  openedAt?: number
}

export async function importFiles(files: File[]): Promise<BookRecord | null> {
  // Algunos gestores de archivos de Android no dan extensión ni tipo: el parser valida el resto
  const epubs = files.filter((f) => /\.epub$/i.test(f.name) || /epub|zip|octet-stream/.test(f.type) || (!f.type && !/\.\w{2,4}$/.test(f.name)))
  if (!epubs.length) {
    error(t('Solo se pueden importar archivos .epub'))
    return null
  }
  let last: BookRecord | null = null
  let added = 0
  const orphans = (await kv.get<Record<string, Orphan>>('orphans')) ?? {}
  for (let i = 0; i < epubs.length; i++) {
    const file = epubs[i]
    importing.value = { name: file.name, progress: 0, index: i, total: epubs.length }
    try {
      const { record, duplicate } = await importEpub(file, file.name, (p) => {
        importing.value = { name: file.name, progress: p, index: i, total: epubs.length }
      })
      if (duplicate) info(t('Ya está en tu biblioteca'), record.title)
      else {
        added++
        const orphan = orphans[record.id]
        if (orphan) {
          await books.update(record.id, orphan)
          delete orphans[record.id]
          await kv.set('orphans', orphans)
        }
      }
      last = record
    } catch (e) {
      error(t('No se pudo abrir «{name}»', { name: file.name }), e instanceof Error ? e.message : undefined)
    }
  }
  importing.value = null
  await refreshLibrary()
  if (added) {
    toast({ kind: 'info', icon: '📚', title: added === 1 ? t('Libro añadido') : t('{n} libros añadidos', { n: added }) })
    recheck()
  }
  return last
}

export async function removeBook(id: string) {
  await books.remove(id)
  const url = coverUrls.get(id)
  if (url) URL.revokeObjectURL(url)
  coverUrls.delete(id)
  await refreshLibrary()
}

export async function setStatus(id: string, status: BookRecord['status']) {
  const patch: Partial<BookRecord> = { status }
  if (status === 'finished') {
    patch.finishedAt = Date.now()
    patch.progress = 1
  }
  if (status === 'new') {
    patch.progress = 0
    patch.position = undefined
    patch.finishedAt = undefined
  }
  await books.update(id, patch)
  patchBook(id, patch)
}

export async function exportHighlights(book: BookRecord) {
  const list = (await annotations.forBook(book.id)).filter((a) => a.kind === 'highlight').sort((a, b) => a.s - b.s || a.start - b.start)
  if (!list.length) {
    info(t('Este libro aún no tiene subrayados'))
    return
  }
  let md = `# ${book.title}\n\n${book.authors.join(', ')}\n\n`
  for (const a of list) {
    md += `> ${a.text.replace(/\n+/g, '\n> ')}\n\n`
    if (a.note) md += `${a.note}\n\n`
    md += `— *${t('capítulo {n}, {date}', { n: a.s + 1, date: new Date(a.createdAt).toLocaleDateString(locale()) })}*\n\n---\n\n`
  }
  await saveFile(new Blob([md], { type: 'text/markdown' }), `${book.title.replace(/[\\/:*?"<>|]+/g, '')} — ${t('subrayados')}.md`)
}

export function sortBooks(list: BookRecord[], by: 'recent' | 'title' | 'author' | 'progress' | 'added') {
  const arr = [...list]
  const collator = new Intl.Collator(locale(), { sensitivity: 'base', numeric: true })
  switch (by) {
    case 'title':
      return arr.sort((a, b) => collator.compare(a.title, b.title))
    case 'author':
      return arr.sort((a, b) => collator.compare(a.authors[0] ?? '', b.authors[0] ?? '') || collator.compare(a.title, b.title))
    case 'progress':
      return arr.sort((a, b) => b.progress - a.progress)
    case 'added':
      return arr.sort((a, b) => b.addedAt - a.addedAt)
    default:
      return arr.sort((a, b) => (b.openedAt ?? b.addedAt) - (a.openedAt ?? a.addedAt))
  }
}
