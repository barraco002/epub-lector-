// Puente con Android (Capacitor) con alternativas web para el PC.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { downloadBlob } from './util'
import { t } from './i18n'

interface LunariaPlugin {
  setImmersive(opts: { enabled: boolean }): Promise<void>
  setKeepAwake(opts: { enabled: boolean }): Promise<void>
  setBrightness(opts: { value: number }): Promise<void>
  setVolumeKeys(opts: { enabled: boolean }): Promise<void>
  setSystemBars(opts: { color: string; dark: boolean }): Promise<void>
  shareFile(opts: { name: string; data: string; mime: string }): Promise<void>
  getPinned(): Promise<{ pinned: boolean }>
  unpin(): Promise<void>
  translateWithApp(opts: { text: string }): Promise<void>
  scheduleTimer(opts: { endsAt: number; title: string; body: string; endTitle: string; endBody: string }): Promise<void>
  cancelTimer(): Promise<void>
  setAudioActive(opts: { active: boolean; screenOff: boolean; title: string }): Promise<void>
  writeSnapshot(opts: { data: string }): Promise<void>
  readSnapshot(): Promise<{ data?: string }>
  updateWidget(opts: WidgetData): Promise<void>
  addListener(event: 'volumeKey', cb: (e: { direction: 'up' | 'down' }) => void): Promise<PluginListenerHandle>
  addListener(event: 'fileOpened', cb: (e: { path: string; name: string }) => void): Promise<PluginListenerHandle>
  addListener(event: 'audioControl', cb: (e: { action: 'pause' | 'resume'; transient: boolean }) => void): Promise<PluginListenerHandle>
  addListener(event: 'shortcut', cb: (e: { action: string }) => void): Promise<PluginListenerHandle>
}

export interface WidgetData {
  day: string
  minutes: number
  goal: number
  streak: number
  /** Último día en que la racha sigue viva sin leer (con comodines) */
  streakUntil: string
  title: string
  progress: number
}

export const isNative = () => Capacitor.isNativePlatform()
const Lunaria = registerPlugin<LunariaPlugin>('Lunaria')

const quiet = <T>(p: Promise<T>) => p.catch(() => undefined)

export async function haptic(kind: 'light' | 'medium' | 'heavy' = 'light') {
  if (isNative()) {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    const style = kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light
    await quiet(Haptics.impact({ style }))
  } else if (navigator.vibrate && matchMedia('(pointer: coarse)').matches) {
    navigator.vibrate(kind === 'heavy' ? 40 : 12)
  }
}

export async function setImmersive(enabled: boolean) {
  if (isNative()) return quiet(Lunaria.setImmersive({ enabled }))
  // En el PC la pantalla completa del navegador requiere un gesto del usuario
  try {
    if (enabled && !document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    else if (!enabled && document.fullscreenElement) await document.exitFullscreen()
  } catch {
    /* sin permiso o sin soporte */
  }
}

let wakeLock: { release: () => Promise<void> } | null = null
export async function setKeepAwake(enabled: boolean) {
  if (isNative()) return quiet(Lunaria.setKeepAwake({ enabled }))
  try {
    if (enabled && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await (navigator as Navigator & { wakeLock: { request: (t: 'screen') => Promise<typeof wakeLock> } }).wakeLock.request('screen')
    } else if (!enabled && wakeLock) {
      await wakeLock.release()
      wakeLock = null
    }
  } catch {
    wakeLock = null
  }
}

export const setBrightness = (value: number) => (isNative() ? quiet(Lunaria.setBrightness({ value })) : Promise.resolve())

export const setVolumeKeys = (enabled: boolean) => (isNative() ? quiet(Lunaria.setVolumeKeys({ enabled })) : Promise.resolve())

export const setSystemBars = (color: string, dark: boolean) =>
  isNative() ? quiet(Lunaria.setSystemBars({ color, dark })) : Promise.resolve()

export function onVolumeKey(cb: (dir: 'up' | 'down') => void): () => void {
  if (!isNative()) return () => {}
  const handle = Lunaria.addListener('volumeKey', (e) => cb(e.direction))
  return () => void handle.then((h) => h.remove())
}

/** Archivo .epub abierto desde otra app ("Abrir con Lunaria"). */
export async function readOpenedFile(path: string, name: string): Promise<File | null> {
  try {
    const res = await fetch(Capacitor.convertFileSrc(path))
    if (!res.ok) return null
    return new File([await res.blob()], name || t('libro.epub'), { type: 'application/epub+zip' })
  } catch {
    return null
  }
}

/** Los archivos abiertos con "Abrir con Lunaria" o compartidos llegan como evento (retenido hasta escucharlo). */
export async function initNativeFileOpen(onFile: (file: File) => void) {
  if (!isNative()) return
  await quiet(
    Lunaria.addListener('fileOpened', async (e) => {
      const f = await readOpenedFile(e.path, e.name)
      if (f) onFile(f)
    }),
  )
}

export const isPinned = async () => (isNative() ? ((await quiet(Lunaria.getPinned()))?.pinned ?? false) : false)
export const unpin = () => (isNative() ? quiet(Lunaria.unpin()) : Promise.resolve())

/** Envía el texto a una app de traducción instalada (Google Translate, DeepL…): funciona sin conexión si la app lo permite. */
export async function translateWithApp(text: string): Promise<boolean> {
  if (!isNative()) return false
  try {
    await Lunaria.translateWithApp({ text })
    return true
  } catch {
    return false
  }
}

/**
 * Atrás de Android: primero cierra lo abierto; en la raíz sale de la app.
 * Con la app fijada, Android ignora exitApp: el primer Atrás en la raíz la desfija (salida predecible).
 */
export async function onBackButton(handler: () => boolean, onUnpinned?: () => void) {
  if (!isNative()) return
  const { App } = await import('@capacitor/app')
  await App.addListener('backButton', async () => {
    if (handler()) return
    if (await isPinned()) {
      await unpin()
      onUnpinned?.()
    } else void App.exitApp()
  })
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

/** Guarda un archivo: descarga en el PC; menú Compartir en Android (el WebView no descarga blob:). */
export async function saveFile(blob: Blob, name: string) {
  if (!isNative()) return downloadBlob(blob, name)
  await Lunaria.shareFile({ name, data: await toBase64(blob), mime: blob.type || 'application/octet-stream' })
}

// ——— Pomodoro con la pantalla apagada: cuenta atrás en la notificación y alarma al final ———

export const scheduleTimer = (opts: { endsAt: number; title: string; body: string; endTitle: string; endBody: string }) =>
  isNative() ? quiet(Lunaria.scheduleTimer({ ...opts, endsAt: Math.round(opts.endsAt) })) : Promise.resolve()
export const cancelTimer = () => (isNative() ? quiet(Lunaria.cancelTimer()) : Promise.resolve())

// ——— Sonido ambiente: foco de audio (llamadas, otras apps, auriculares) y pantalla apagada ———

export const setAudioActive = (active: boolean, screenOff: boolean, title: string) =>
  isNative() ? quiet(Lunaria.setAudioActive({ active, screenOff, title })) : Promise.resolve()

export function onAudioControl(cb: (action: 'pause' | 'resume', transient: boolean) => void) {
  if (isNative()) void quiet(Lunaria.addListener('audioControl', (e) => cb(e.action, e.transient)))
}

// ——— Copia automática, widget y accesos directos ———

export const writeSnapshot = (data: string) => (isNative() ? quiet(Lunaria.writeSnapshot({ data })) : Promise.resolve())
export const readSnapshot = async () => (isNative() ? ((await quiet(Lunaria.readSnapshot()))?.data ?? null) : null)
export const updateWidget = (data: WidgetData) => (isNative() ? quiet(Lunaria.updateWidget(data)) : Promise.resolve())

/** lunaria://continuar, pomodoro o lluvia (retenido hasta escucharlo: llega también en arranque en frío). */
export async function onShortcut(cb: (action: string) => void) {
  if (isNative()) await quiet(Lunaria.addListener('shortcut', (e) => cb(e.action)))
}
