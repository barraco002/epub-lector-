// Copia de seguridad en JSON (ajustes, temas, progreso, estadísticas, logros y subrayados).
// Los EPUB no se incluyen: al volver a importarlos se recupera su progreso automáticamente.
import { annotations, books, days, kv, type Annotation, type BookRecord, type DayStats } from './db'
import { customPresets, customThemes, replaceSettings, saveCustomPresets, saveCustomThemes, settings } from './settings'
import { flushGame, profile, replaceProfile } from './game/game'
import type { Profile } from './game/achievements'
import { refreshLibrary } from './library'
import { dayKey } from './util'
import { saveFile } from './native'
import { loadVocab, vocab, type VocabWord } from './vocab'
import type { Theme } from './themes'
import type { TypoPreset } from './settings'

export interface Backup {
  app: 'lunaria'
  version: 1
  exportedAt: number
  settings: unknown
  themes: Theme[]
  presets: TypoPreset[]
  profile: Profile
  days: DayStats[]
  books: Omit<BookRecord, 'cover'>[]
  annotations: Annotation[]
  vocab?: VocabWord[]
}

export async function exportBackup() {
  const data = await backupData()
  await saveFile(new Blob([JSON.stringify(data)], { type: 'application/json' }), `lunaria-copia-${dayKey()}.json`)
}

/** Todo menos los EPUB: pocos KB, cabe en la copia automática de Android. */
export async function backupData(): Promise<Backup> {
  flushGame()
  const list = await books.all()
  return {
    app: 'lunaria',
    version: 1,
    exportedAt: Date.now(),
    settings: settings.value,
    themes: customThemes.value,
    presets: customPresets.value,
    profile: profile.value,
    days: await days.all(),
    books: list.map(({ cover: _cover, ...rest }) => rest),
    annotations: await annotations.all(),
    vocab: vocab.value,
  }
}

export async function importBackup(file: File): Promise<string> {
  return restoreData(JSON.parse(await file.text()) as Backup)
}

export async function restoreData(data: Backup): Promise<string> {
  if (data?.app !== 'lunaria') throw new Error('El archivo no es una copia de Lunaria')
  replaceSettings(data.settings)
  await saveCustomThemes(data.themes ?? [])
  await saveCustomPresets(data.presets ?? [])
  await kv.set('profile', data.profile)
  for (const d of data.days ?? []) await days.put(d)
  replaceProfile(data.profile, data.days ?? [])
  const orphans = (await kv.get<Record<string, unknown>>('orphans')) ?? {}
  let restored = 0
  for (const b of data.books ?? []) {
    const existing = await books.get(b.id)
    const progress = {
      position: b.position,
      progress: b.progress,
      timeMs: b.timeMs,
      wordsRead: b.wordsRead,
      status: b.status,
      finishedAt: b.finishedAt,
      openedAt: b.openedAt,
    }
    if (existing) {
      await books.update(b.id, progress)
      restored++
    } else orphans[b.id] = progress
  }
  await kv.set('orphans', orphans)
  for (const a of data.annotations ?? []) await annotations.put(a)
  if (data.vocab?.length) {
    const have = new Set(vocab.value.map((w) => w.id))
    await kv.set('vocab', [...vocab.value, ...data.vocab.filter((w) => !have.has(w.id))])
    await loadVocab()
  }
  await refreshLibrary()
  const pending = Object.keys(orphans).length
  return `Copia restaurada: ${restored} libros actualizados${pending ? `, ${pending} pendientes (impórtalos y recuperarán su progreso)` : ''}.`
}
