// Resumen al cerrar el libro y ficha de "libro terminado" (con tarjeta para compartir).
import { useEffect, useState } from 'preact/hooks'
import { Share2 } from 'lucide-preact'
import type { BookRecord } from '../lib/db'
import { library } from '../lib/library'
import { settings } from '../lib/settings'
import { tokens } from '../lib/appearance'
import { saveFile } from '../lib/native'
import { bookStats, sessionSummary, type BookStats } from '../lib/summary'
import { error } from '../lib/toasts'
import { fmtDuration, fmtNum } from '../lib/util'
import { Bar, Sheet } from './ui'

const fmtDate = (d: string | number) =>
  new Date(d).toLocaleDateString('es', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

export function SessionSummarySheet() {
  const s = sessionSummary.value
  if (!s) return null
  const close = () => (sessionSummary.value = null)
  const book = library.value.find((b) => b.id === s.bookId)
  if (s.finished && book) return <FinishedSheet book={book} onClose={close} />
  const game = settings.value.gameMode !== 'estadisticas'
  return (
    <Sheet title="Sesión de lectura" onClose={close} size="sm">
      <p class="summary-book">{s.title}</p>
      <div class="summary-grid">
        <div>
          <strong>{fmtDuration(s.ms, true)}</strong>
          <span class="muted small">leyendo</span>
        </div>
        <div>
          <strong>{fmtNum(s.words)}</strong>
          <span class="muted small">palabras</span>
        </div>
        <div>
          <strong>{s.readFraction > 0 && s.readFraction < 0.01 ? '<1' : Math.round(s.readFraction * 100)}%</strong>
          <span class="muted small">del libro</span>
        </div>
        {game && (
          <div>
            <strong>+{fmtNum(s.xp)}</strong>
            <span class="muted small">XP</span>
          </div>
        )}
      </div>
      <div class="summary-progress">
        <Bar value={s.progress} />
        <span class="muted small">
          Vas en el {Math.round(s.progress * 100)}%{s.chapters ? ` · ${s.chapters} ${s.chapters === 1 ? 'capítulo terminado' : 'capítulos terminados'}` : ''}
        </span>
      </div>
      {s.celebrations.length > 0 && (
        <ul class="summary-cele">
          {s.celebrations.map((c) => (
            <li key={c.id}>
              <span aria-hidden="true">{c.icon ?? '✨'}</span>
              <div>
                <strong>{c.title}</strong>
                {c.body && <span class="muted small">{c.body}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" class="btn btn-primary btn-block" onClick={close}>
        Listo
      </button>
    </Sheet>
  )
}

/** Ficha del libro terminado: sello "ex libris", cifras y tarjeta para compartir. */
export function FinishedSheet({ book, onClose }: { book: BookRecord; onClose: () => void }) {
  const [stats, setStats] = useState<BookStats | null>(null)
  useEffect(() => {
    void bookStats(book).then(setStats)
  }, [book.id])
  const when = book.finishedAt ? fmtDate(book.finishedAt) : null
  const share = async () => {
    if (!stats) return
    try {
      const blob = await shareCard(book, stats)
      await saveFile(blob, `${book.title.replace(/[\\/:*?"<>|]+/g, '').slice(0, 60) || 'libro'} - Lunaria.png`)
    } catch (e) {
      error('No se pudo crear la tarjeta', e instanceof Error ? e.message : undefined)
    }
  }
  return (
    <Sheet title="Libro terminado" onClose={onClose} size="sm">
      <div class="exlibris">
        <span class="exlibris-orn" aria-hidden="true">
          ❦
        </span>
        <span class="eyebrow">Ex libris</span>
        <strong class="exlibris-title">{book.title}</strong>
        {book.authors[0] && <span class="muted">{book.authors.join(', ')}</span>}
        {when && <span class="muted small">Terminado el {when}</span>}
      </div>
      {stats && (
        <div class="summary-grid">
          <div>
            <strong>{fmtDuration(stats.timeMs, true)}</strong>
            <span class="muted small">en total</span>
          </div>
          <div>
            <strong>{Math.max(1, stats.days)}</strong>
            <span class="muted small">{stats.days > 1 ? 'días' : 'día'} de lectura</span>
          </div>
          <div>
            <strong>{fmtNum(book.totalWords)}</strong>
            <span class="muted small">palabras</span>
          </div>
          {stats.wpm && (
            <div>
              <strong>{stats.wpm}</strong>
              <span class="muted small">palabras/min</span>
            </div>
          )}
          <div>
            <strong>{stats.highlights}</strong>
            <span class="muted small">subrayados</span>
          </div>
          <div>
            <strong>{stats.notes}</strong>
            <span class="muted small">notas</span>
          </div>
        </div>
      )}
      {stats?.firstDay && stats.lastDay && stats.firstDay !== stats.lastDay && (
        <p class="muted small center">
          Del {fmtDate(stats.firstDay + 'T12:00')} al {fmtDate(stats.lastDay + 'T12:00')}
        </p>
      )}
      <div class="btn-row">
        <button type="button" class="btn" disabled={!stats} onClick={() => void share()}>
          <Share2 size={16} /> Guardar tarjeta
        </button>
        <button type="button" class="btn btn-primary" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Sheet>
  )
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > max && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/** Tarjeta 1080×1350 con los colores del tema actual. */
export async function shareCard(book: BookRecord, stats: BookStats): Promise<Blob> {
  const W = 1080
  const H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const { vars } = tokens.value
  const css = getComputedStyle(document.documentElement)
  const serif = css.getPropertyValue('--rfont').trim() || 'Georgia, serif'
  const sans = css.getPropertyValue('--ui-font').trim() || 'system-ui, sans-serif'
  await document.fonts?.ready
  ctx.fillStyle = vars['--bg']
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = vars['--accent']
  ctx.lineWidth = 3
  ctx.strokeRect(60, 60, W - 120, H - 120)
  ctx.lineWidth = 1
  ctx.strokeRect(76, 76, W - 152, H - 152)
  ctx.textAlign = 'center'
  ctx.fillStyle = vars['--accent']
  ctx.font = `64px ${serif}`
  ctx.fillText('❦', W / 2, 230)
  ctx.font = `600 30px ${sans}`
  ctx.fillText('E X   L I B R I S', W / 2, 300)
  ctx.fillStyle = vars['--text']
  ctx.font = `700 76px ${serif}`
  let y = 430
  for (const l of wrap(ctx, book.title, W - 260).slice(0, 4)) {
    ctx.fillText(l, W / 2, y)
    y += 90
  }
  if (book.authors[0]) {
    ctx.fillStyle = vars['--muted']
    ctx.font = `italic 40px ${serif}`
    ctx.fillText(book.authors.join(', ').slice(0, 60), W / 2, y + 10)
    y += 70
  }
  ctx.fillStyle = vars['--muted']
  ctx.font = `34px ${sans}`
  if (book.finishedAt) ctx.fillText(`Terminado el ${fmtDate(book.finishedAt)}`, W / 2, y + 40)
  const rows: [string, string][] = [
    [fmtDuration(stats.timeMs, true), 'de lectura'],
    [String(Math.max(1, stats.days)), stats.days > 1 ? 'días' : 'día'],
    [fmtNum(book.totalWords), 'palabras'],
    [String(stats.highlights), 'subrayados'],
  ]
  const top = Math.max(y + 140, 900)
  rows.forEach(([value, label], i) => {
    const x = W / 2 + (i % 2 ? 200 : -200)
    const ry = top + Math.floor(i / 2) * 150
    ctx.fillStyle = vars['--text']
    ctx.font = `700 56px ${sans}`
    ctx.fillText(value, x, ry)
    ctx.fillStyle = vars['--muted']
    ctx.font = `30px ${sans}`
    ctx.fillText(label, x, ry + 44)
  })
  ctx.fillStyle = vars['--accent']
  ctx.font = `600 28px ${sans}`
  ctx.fillText('Lunaria', W / 2, H - 120)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'))
}
