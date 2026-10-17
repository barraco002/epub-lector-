// Copia de seguridad en JSON (ajustes, temas, progreso, estadísticas, logros y subrayados).
// Los EPUB no se incluyen: al volver a importarlos se recupera su progreso automáticamente.
import { annotations, books, days, kv, type Annotation, type BookRecord, type DayStats } from './db'
import { customPresets, customThemes, replaceSettings, saveCustomPresets, saveCustomThemes, settings } from './settings'
import { flushGame, profile, replaceProfile } from './game/game'
import type { Profile } from './game/achievements'
import { refreshLibrary } from './library'
import { downloadBlob, dayKey } from './util'
import type { Theme } from './themes'
import type { TypoPreset } from './settings'

interface Backup {
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
}

export async function exportBackup() {
  flushGame()
  const list = await books.all()
  const data: Backup = {
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
  }
  downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `lunaria-copia-${dayKey()}.json`)
}

export async function importBackup(file: File): Promise<string> {
  const data = JSON.parse(await file.text()) as Backup
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
    const progress = { position: b.position, progress: b.progress, timeMs: b.timeMs, wordsRead: b.wordsRead, status: b.status, finishedAt: b.finishedAt, openedAt: b.openedAt }
    if (existing) {
      await books.update(b.id, progress)
      restored++
    } else orphans[b.id] = progress
  }
  await kv.set('orphans', orphans)
  for (const a of data.annotations ?? []) await annotations.put(a)
  await refreshLibrary()
  const pending = Object.keys(orphans).length
  return `Copia restaurada: ${restored} libros actualizados${pending ? `, ${pending} pendientes (impórtalos y recuperarán su progreso)` : ''}.`
}
