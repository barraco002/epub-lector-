import { useEffect, useRef, useState } from 'preact/hooks'
import { Coffee, X } from 'lucide-preact'
import { active } from './state'
import { pomo, remainingMs, skip, start, PHASE_LABEL } from '../../lib/pomodoro'
import { fmtClock } from '../../lib/util'
import { IconButton, Sheet, useCloser } from '../ui'
import { useTicker } from './Chrome'

export interface FootnoteData {
  html: DocumentFragment
  title: string
  target: { s: number; fragment: string }
}

export function FootnotePopup({ note, onClose }: { note: FootnoteData; onClose: () => void }) {
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    body.current?.replaceChildren(note.html.cloneNode(true))
  }, [note])
  return (
    <Sheet title={note.title} onClose={onClose} size="sm">
      <div class="footnote-body" id="bk-note" ref={body} />
      <button
        type="button"
        class="link-btn"
        onClick={() => {
          onClose()
          void active.value?.jump(note.target)
        }}
      >
        Ir a la nota en el texto
      </button>
    </Sheet>
  )
}

/** Visor de imágenes: ajustar a pantalla ↔ tamaño real (con desplazamiento), doble toque para alternar. */
export function ImageViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(false)
  useCloser(onClose)
  return (
    <div class="image-viewer" role="dialog" aria-label={alt || 'Imagen'}>
      <IconButton label="Cerrar" class="image-close" onClick={onClose}>
        <X size={22} />
      </IconButton>
      <div class={`image-stage ${zoom ? 'is-zoom' : ''}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
        <img src={src} alt={alt} onDblClick={() => setZoom(!zoom)} onClick={() => setZoom(!zoom)} />
      </div>
    </div>
  )
}

const TIPS = [
  'Mira algo a unos 6 metros durante 20 segundos: tus ojos te lo agradecerán.',
  'Levántate, estira el cuello y los hombros.',
  'Bebe un vaso de agua.',
  'Parpadea despacio varias veces: leyendo en pantalla parpadeamos menos.',
  'Piensa en lo que acabas de leer: ¿cómo lo resumirías en una frase?',
]

export function BreakOverlay({ onClose }: { onClose: () => void }) {
  const st = pomo.value
  useTicker(1000, true)
  useCloser(onClose)
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)])
  const onBreak = st.phase !== 'focus'
  return (
    <div class="break-overlay" role="dialog" aria-label="Descanso">
      <div class="break-card">
        <Coffee size={40} />
        <h2>{onBreak ? PHASE_LABEL[st.phase] : '¡Buen trabajo!'}</h2>
        {onBreak && <p class="break-time">{st.running ? fmtClock(remainingMs()) : 'Listo para empezar'}</p>}
        <p class="muted">{tip}</p>
        <div class="btn-row">
          <button type="button" class="btn" onClick={onClose}>
            Ocultar
          </button>
          {onBreak && (
            <button
              type="button"
              class="btn btn-primary"
              onClick={() => {
                skip()
                start('focus')
                onClose()
              }}
            >
              Seguir leyendo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
