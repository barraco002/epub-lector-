// Integraciones del sistema en Android: copia automática, widget y accesos directos.
// Todo se hace al cambiar algo o al salir de la app, nunca con temporizadores periódicos.
import { effect } from '@preact/signals'
import { backupData, restoreData, type Backup } from './backup'
import { kv } from './db'
import { goalMs, profile, streak, today } from './game/game'
import { library } from './library'
import { isNative, onShortcut, readSnapshot, updateWidget, writeSnapshot } from './native'
import { go } from './router'
import { info } from './toasts'
import { addDays, debounce } from './util'
import { t } from './i18n'
import * as ambient from './audio/ambient'
import * as pomodoro from './pomodoro'

const SNAPSHOT_EVERY = 10 * 60_000
let lastSnapshot = 0

/** Copia ligera (sin EPUB) que Android sube a la nube con su copia automática. */
async function snapshot(force = false) {
  if (!force && Date.now() - lastSnapshot < SNAPSHOT_EVERY) return
  lastSnapshot = Date.now()
  await writeSnapshot(JSON.stringify(await backupData()))
}

/**
 * Tras reinstalar (o en un móvil nuevo), Android devuelve la copia antes del primer arranque.
 * Si la app está vacía, se restaura sola: progreso, rachas, logros, subrayados y palabras.
 */
async function restoreIfFresh() {
  if (library.value.length || profile.value.xp > 0 || (await kv.get('autoRestored'))) return
  const raw = await readSnapshot()
  if (!raw) return
  await kv.set('autoRestored', true)
  try {
    const data = JSON.parse(raw) as Backup
    if (!data.books?.length && !data.profile?.xp) return
    await restoreData(data)
    info(t('Progreso recuperado'), t('Vuelve a importar tus EPUB: recuperarán su posición y subrayados'))
  } catch {
    /* copia ilegible: se ignora */
  }
}

const lastBook = () =>
  [...library.value].filter((b) => b.status === 'reading').sort((a, b) => (b.openedAt ?? b.addedAt) - (a.openedAt ?? a.addedAt))[0]

function continueReading() {
  const book = lastBook()
  go(book ? { name: 'reader', bookId: book.id } : { name: 'library' })
  return !!book
}

function onAction(action: string) {
  if (action === 'continuar') continueReading()
  else if (action === 'pomodoro') {
    continueReading()
    pomodoro.start('focus')
  } else if (action === 'lluvia') {
    continueReading()
    const rain = ambient.PRESETS.find((p) => p.id === 'tarde-lluvia') ?? ambient.PRESETS[0]
    ambient.applyPreset(rain)
  }
}

const pushWidget = debounce(() => {
  const p = profile.value
  const d = today.value
  const book = lastBook()
  // La racha sigue viva hasta el día siguiente a la última lectura (más los comodines)
  const until = p.streak.lastDay ? addDays(p.streak.lastDay, 1 + p.streak.freezes) : ''
  void updateWidget({
    day: d.date,
    minutes: Math.floor(d.ms / 60_000),
    goal: Math.round(goalMs.value / 60_000),
    streak: streak.value,
    streakUntil: until,
    title: book?.title ?? '',
    progress: Math.round((book?.progress ?? 0) * 100),
  })
}, 4000)

export async function initAndroid() {
  if (!isNative()) return
  await restoreIfFresh()
  await onShortcut(onAction)
  effect(() => {
    // Dependencias: lectura de hoy, racha, meta y libros
    void [today.value.ms, streak.value, goalMs.value, library.value]
    pushWidget()
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return
    pushWidget.flush()
    void snapshot()
  })
  // Primera copia poco después de arrancar (si ya hay algo que guardar)
  setTimeout(() => library.value.length && void snapshot(true), 30_000)
}
