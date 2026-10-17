import { books, type BookRecord } from './db'
import { openEpub, resourceType, type EpubBook } from './epub/book'
import { chapterText, prepareChapter } from './epub/chapter'
import { countWords, fileId } from './util'

export const yieldToMain = () => {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  return s?.yield ? s.yield() : new Promise<void>((r) => setTimeout(r, 0))
}

async function coverThumbnail(book: EpubBook): Promise<Blob | undefined> {
  const path = book.coverPath
  if (!path) return
  const type = resourceType(book, path)
  const blob = new Blob([book.files[path] as BlobPart], { type })
  if (type === 'image/svg+xml') return blob
  try {
    const bmp = await createImageBitmap(blob)
    const width = Math.min(400, bmp.width)
    const height = Math.round((bmp.height * width) / bmp.width)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bmp, 0, 0, width, height)
    bmp.close()
    return await new Promise<Blob | undefined>((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/jpeg', 0.84))
  } catch {
    return blob.size < 500_000 ? blob : undefined
  }
}

export interface ImportResult {
  record: BookRecord
  duplicate: boolean
}

export async function importEpub(file: Blob, fileName: string, onProgress?: (p: number) => void): Promise<ImportResult> {
  const buffer = await file.arrayBuffer()
  const id = await fileId(buffer)
  const existing = await books.get(id)
  if (existing) return { record: existing, duplicate: true }

  const book = await openEpub(new Uint8Array(buffer))
  const chapters = []
  let last = performance.now()
  for (const item of book.spine) {
    const prepared = prepareChapter(book, item.index)
    const text = prepared ? chapterText(prepared) : ''
    chapters.push({ chars: text.length, words: countWords(text) })
    // Cedemos el hilo principal con regularidad para que la interfaz no se congele
    if (performance.now() - last > 40) {
      onProgress?.(item.index / book.spine.length)
      await yieldToMain()
      last = performance.now()
    }
  }

  const meta = book.metadata
  const fallbackTitle = fileName.replace(/\.epub$/i, '').replace(/[_-]+/g, ' ').trim()
  const record: BookRecord = {
    id,
    title: meta.title && meta.title !== 'Sin título' ? meta.title : fallbackTitle || 'Sin título',
    authors: meta.authors,
    language: meta.language,
    publisher: meta.publisher,
    description: meta.description,
    cover: await coverThumbnail(book),
    size: buffer.byteLength,
    addedAt: Date.now(),
    chapters,
    totalChars: chapters.reduce((a, c) => a + c.chars, 0),
    totalWords: chapters.reduce((a, c) => a + c.words, 0),
    progress: 0,
    timeMs: 0,
    wordsRead: 0,
    status: 'new',
  }
  await books.putFile(id, new Blob([buffer], { type: 'application/epub+zip' }))
  await books.put(record)
  onProgress?.(1)
  return { record, duplicate: false }
}
