import { useEffect, useState } from 'preact/hooks'
import { effect } from '@preact/signals'
import { route, back, go } from './lib/router'
import { importFiles, refreshLibrary } from './lib/library'
import { loadGame } from './lib/game/game'
import { loadCustomData } from './lib/settings'
import { loadCustomFonts } from './lib/fonts'
import { loadBgImage } from './lib/background'
import { loadVocab } from './lib/vocab'
import { initAndroid } from './lib/android'
import { requestPersistence } from './lib/db'
import { initNativeFileOpen, isNative, onBackButton, setSystemBars } from './lib/native'
import { tokens } from './lib/appearance'
import { info } from './lib/toasts'
import { Library } from './components/Library'
import { Reader } from './components/reader/Reader'
import { Stats } from './components/Stats'
import { SettingsView } from './components/Settings'
import { Toasts } from './components/Toasts'
import { SessionSummarySheet } from './components/Summary'

function DropZone() {
  const [over, setOver] = useState(false)
  useEffect(() => {
    if (isNative()) return
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      setOver(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setOver(false)
    }
    const overFn = (e: DragEvent) => hasFiles(e) && e.preventDefault()
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setOver(false)
      const files = [...(e.dataTransfer?.files ?? [])]
      if (route.value.name !== 'library') go({ name: 'library' })
      await importFiles(files)
    }
    addEventListener('dragenter', enter)
    addEventListener('dragleave', leave)
    addEventListener('dragover', overFn)
    addEventListener('drop', drop)
    return () => {
      removeEventListener('dragenter', enter)
      removeEventListener('dragleave', leave)
      removeEventListener('dragover', overFn)
      removeEventListener('drop', drop)
    }
  }, [])
  return over ? (
    <div class="drop-zone">
      <div>Suelta aquí tus EPUB</div>
    </div>
  ) : null
}

export function App() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadGame(), loadCustomData(), loadCustomFonts(), refreshLibrary(), loadBgImage(), loadVocab()])
      } finally {
        setReady(true)
      }
      void requestPersistence()
      void initAndroid()
      void onBackButton(back, () => info('App desfijada', 'Pulsa Atrás otra vez para salir'))
      void initNativeFileOpen(async (file) => {
        const book = await importFiles([file])
        if (book) go({ name: 'reader', bookId: book.id })
      })
    })()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') back()
    }
    addEventListener('keydown', onKey)
    // Barras del sistema de Android con los colores del tema
    const off = effect(() => {
      const { vars, dark } = tokens.value
      void setSystemBars(vars['--bg'], dark)
    })
    return () => {
      removeEventListener('keydown', onKey)
      off()
    }
  }, [])

  if (!ready) return null
  const r = route.value
  return (
    <>
      {r.name === 'library' && <Library />}
      {r.name === 'reader' && <Reader key={r.bookId} bookId={r.bookId} />}
      {r.name === 'stats' && <Stats />}
      {r.name === 'settings' && <SettingsView />}
      {r.name !== 'reader' && <SessionSummarySheet />}
      <Toasts />
      <DropZone />
    </>
  )
}
