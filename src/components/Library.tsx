import { useMemo, useRef, useState } from 'preact/hooks'
import { Award, BarChart3, BookOpen, Check, Download, Info, LayoutGrid, List, MoreHorizontal, Plus, RotateCcw, Search, Settings as SettingsIcon, Trash2 } from 'lucide-preact'
import type { BookRecord } from '../lib/db'
import { coverUrl, exportHighlights, importFiles, importing, library, removeBook, setStatus, sortBooks } from '../lib/library'
import { go } from '../lib/router'
import { goalProgress, level, readingWpm, streak, today } from '../lib/game/game'
import { levelTitle } from '../lib/game/levels'
import { settings } from '../lib/settings'
import { fmtDuration, fmtNum, hashString } from '../lib/util'
import { isNative } from '../lib/native'
import { Bar, Confirm, IconButton, Ring, Segmented, Sheet } from './ui'
import { FinishedSheet } from './Summary'
import { t } from '../lib/i18n'

type Filter = 'all' | 'reading' | 'new' | 'finished'
type Sort = 'recent' | 'title' | 'author' | 'progress' | 'added'

const VIEW_KEY = 'lunaria.libraryView'

export function Cover({ book, size = 'md' }: { book: BookRecord; size?: 'sm' | 'md' | 'lg' }) {
  const url = coverUrl(book)
  if (url) return <img class={`cover cover-${size}`} src={url} alt="" loading="lazy" decoding="async" />
  // Portada tipográfica generada (color estable a partir del título)
  const h = hashString(book.title + book.authors.join())
  const hue = h % 360
  return (
    <div class={`cover cover-${size} cover-gen`} style={{ '--h': hue }} aria-hidden="true">
      <span class="cover-gen-title">{book.title}</span>
      {book.authors[0] && <span class="cover-gen-author">{book.authors[0]}</span>}
    </div>
  )
}

function minutesLeft(book: BookRecord) {
  return ((1 - book.progress) * book.totalWords) / readingWpm.value
}

export function openBook(book: BookRecord) {
  go({ name: 'reader', bookId: book.id })
}

function BookMenu({ book, onClose }: { book: BookRecord; onClose: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const [card, setCard] = useState(false)
  if (card) return <FinishedSheet book={book} onClose={onClose} />
  return (
    <>
      <Sheet title={book.title} onClose={onClose} size="sm">
        <div class="book-info">
          <Cover book={book} size="sm" />
          <div>
            <p class="muted">{book.authors.join(', ') || t('Autor desconocido')}</p>
            <p class="muted small">
              {t('{n} palabras · {pct}% · {time} leídos', { n: fmtNum(book.totalWords), pct: Math.round(book.progress * 100), time: fmtDuration(book.timeMs) })}
            </p>
            {book.publisher && <p class="muted small">{book.publisher}</p>}
          </div>
        </div>
        {book.description && <p class="book-desc">{book.description.slice(0, 600)}</p>}
        <div class="menu-list">
          <button type="button" class="menu-item" onClick={() => (onClose(), openBook(book))}>
            <BookOpen size={18} /> {t(book.status === 'new' ? 'Empezar a leer' : 'Continuar leyendo')}
          </button>
          {book.status !== 'finished' ? (
            <button type="button" class="menu-item" onClick={() => (setStatus(book.id, 'finished'), onClose())}>
              <Check size={18} /> {t('Marcar como terminado')}
            </button>
          ) : (
            <>
              <button type="button" class="menu-item" onClick={() => setCard(true)}>
                <Award size={18} /> {t('Ficha de libro terminado')}
              </button>
              <button type="button" class="menu-item" onClick={() => (setStatus(book.id, 'new'), onClose())}>
                <RotateCcw size={18} /> {t('Marcar como no leído')}
              </button>
            </>
          )}
          <button type="button" class="menu-item" onClick={() => exportHighlights(book)}>
            <Download size={18} /> {t('Exportar subrayados (Markdown)')}
          </button>
          <button type="button" class="menu-item danger" onClick={() => setConfirm(true)}>
            <Trash2 size={18} /> {t('Eliminar de la biblioteca')}
          </button>
        </div>
      </Sheet>
      {confirm && (
        <Confirm
          title={t('¿Eliminar este libro?')}
          body={<p>{t('Se borrarán el archivo, el progreso y los subrayados de «{title}». Tus estadísticas y logros se mantienen.', { title: book.title })}</p>}
          confirmLabel={t('Eliminar')}
          danger
          onConfirm={() => {
            void removeBook(book.id)
            onClose()
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </>
  )
}

function BookCard({ book, view, onMenu }: { book: BookRecord; view: 'grid' | 'list'; onMenu: () => void }) {
  const status = book.status === 'finished' ? t('Terminado') : book.status === 'new' ? t('Nuevo') : `${Math.round(book.progress * 100)}%`
  return (
    <article class={`book-card book-${view}`}>
      <button type="button" class="book-open" onClick={() => openBook(book)} aria-label={t('Abrir {title}', { title: book.title })}>
        <Cover book={book} size={view === 'grid' ? 'md' : 'sm'} />
        <div class="book-meta">
          <h3 class="book-title">{book.title}</h3>
          <p class="book-author">{book.authors[0] ?? t('Autor desconocido')}</p>
          <div class="book-progress">
            {book.status === 'reading' && <Bar value={book.progress} thin />}
            <span class={`book-status status-${book.status}`}>
              {book.status === 'finished' && <Check size={12} />} {status}
            </span>
          </div>
        </div>
      </button>
      <IconButton label={t('Opciones del libro')} class="book-more" onClick={onMenu}>
        <MoreHorizontal size={18} />
      </IconButton>
    </article>
  )
}

function TodayCard() {
  const lv = level.value
  const goalMin = settings.value.dailyGoalMin
  const mins = Math.floor(today.value.ms / 60000)
  return (
    <button type="button" class="today-card card" onClick={() => go({ name: 'stats' })}>
      <Ring value={goalProgress.value} size={64} stroke={6}>
        <span class="ring-num">{mins}</span>
        <span class="ring-unit">/{goalMin}m</span>
      </Ring>
      <div class="today-text">
        <span class="eyebrow">{t('Hoy')}</span>
        <strong>{goalProgress.value >= 1 ? t('¡Meta cumplida!') : t('{n} min para tu meta', { n: Math.max(0, goalMin - mins) })}</strong>
        <span class="muted small">
          {t('{words} palabras · 🔥 {n} {days}', { words: fmtNum(today.value.words), n: streak.value, days: t(streak.value === 1 ? 'día' : 'días') })}
        </span>
      </div>
      {settings.value.gameMode !== 'estadisticas' && (
        <div class="today-level">
          <span class="level-badge">{t('Nv {n}', { n: lv.level })}</span>
          <span class="muted small">{levelTitle(lv.level)}</span>
          <Bar value={lv.progress} thin />
        </div>
      )}
    </button>
  )
}

function ContinueCard({ book }: { book: BookRecord }) {
  return (
    <button type="button" class="continue-card card" onClick={() => openBook(book)}>
      <Cover book={book} size="lg" />
      <div class="continue-text">
        <span class="eyebrow">{t('Continuar leyendo')}</span>
        <h2>{book.title}</h2>
        <p class="muted">{book.authors.join(', ')}</p>
        <Bar value={book.progress} />
        <p class="muted small">
          {t('{pct}% · quedan ~{time}', { pct: Math.round(book.progress * 100), time: fmtDuration(minutesLeft(book) * 60000) })}
        </p>
        <span class="btn btn-primary btn-sm">{t('Seguir leyendo')}</span>
      </div>
    </button>
  )
}

export function Library() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('recent')
  const [query, setQuery] = useState('')
  const [menuFor, setMenuFor] = useState<BookRecord | null>(null)
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as 'grid' | 'list') || 'grid'
    } catch {
      return 'grid'
    }
  })
  const all = library.value
  const current = useMemo(
    () =>
      sortBooks(
        all.filter((b) => b.status === 'reading'),
        'recent',
      )[0],
    [all],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = all.filter((b) => (filter === 'all' || b.status === filter) && (!q || b.title.toLowerCase().includes(q) || b.authors.join(' ').toLowerCase().includes(q)))
    return sortBooks(list, sort)
  }, [all, filter, sort, query])

  const pick = () => fileInput.current?.click()
  const setViewMode = (v: 'grid' | 'list') => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* ignorar */
    }
  }

  const imp = importing.value

  return (
    <div class="library">
      <header class="topbar">
        <div class="brand">
          <span class="brand-moon" aria-hidden="true" />
          <span class="brand-name">Lunaria</span>
        </div>
        <div class="topbar-actions">
          <IconButton label={t('Progreso y logros')} onClick={() => go({ name: 'stats' })}>
            <BarChart3 size={20} />
          </IconButton>
          <IconButton label={t('Ajustes')} onClick={() => go({ name: 'settings' })}>
            <SettingsIcon size={20} />
          </IconButton>
          <button type="button" class="btn btn-primary btn-sm" onClick={pick}>
            <Plus size={16} /> {t('Importar')}
          </button>
        </div>
      </header>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept={isNative() ? undefined : '.epub,application/epub+zip'}
        onChange={(e) => {
          const input = e.target as HTMLInputElement
          if (input.files?.length) void importFiles([...input.files])
          input.value = ''
        }}
      />

      <main class="library-main">
        {imp && (
          <div class="card importing">
            <span>
              {t('Importando')} {imp.total > 1 ? `${imp.index + 1}/${imp.total} · ` : ''}
              {imp.name}
            </span>
            <Bar value={imp.progress} />
          </div>
        )}

        {all.length > 0 && (
          <div class={`hero ${current ? '' : 'hero-single'}`}>
            {current && <ContinueCard book={current} />}
            <TodayCard />
          </div>
        )}

        {all.length === 0 && !imp ? (
          <div class="empty">
            <div class="empty-moon" aria-hidden="true" />
            <h1>{t('Tu biblioteca está esperando')}</h1>
            <p class="muted">
              {isNative() ? t('Importa tus libros EPUB. Se guardan solo en este dispositivo.') : t('Importa tus libros EPUB o arrástralos a esta ventana. Se guardan solo en este dispositivo.')}
            </p>
            <button type="button" class="btn btn-primary" onClick={pick}>
              <Plus size={18} /> {t('Importar EPUB')}
            </button>
          </div>
        ) : (
          <section class="shelf">
            <div class="shelf-head">
              <h2>{t('Biblioteca')}</h2>
              <span class="muted small">
                {all.length} {t(all.length === 1 ? 'libro' : 'libros')}
              </span>
            </div>
            <div class="shelf-tools">
              <Segmented<Filter>
                label={t('Filtrar')}
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: t('Todos') },
                  { value: 'reading', label: t('Leyendo') },
                  { value: 'new', label: t('Por leer') },
                  { value: 'finished', label: t('Terminados') },
                ]}
              />
              <div class="shelf-tools-right">
                <label class="search-field">
                  <Search size={16} />
                  <input type="search" placeholder={t('Buscar título o autor')} value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
                </label>
                <select class="select" value={sort} aria-label={t('Ordenar')} onChange={(e) => setSort((e.target as HTMLSelectElement).value as Sort)}>
                  <option value="recent">{t('Recientes')}</option>
                  <option value="added">{t('Añadidos')}</option>
                  <option value="title">{t('Título')}</option>
                  <option value="author">{t('Autor')}</option>
                  <option value="progress">{t('Progreso')}</option>
                </select>
                <IconButton label={t(view === 'grid' ? 'Ver como lista' : 'Ver como cuadrícula')} onClick={() => setViewMode(view === 'grid' ? 'list' : 'grid')}>
                  {view === 'grid' ? <List size={18} /> : <LayoutGrid size={18} />}
                </IconButton>
              </div>
            </div>
            {shown.length ? (
              <div class={`books books-${view}`}>
                {shown.map((b) => (
                  <BookCard key={b.id} book={b} view={view} onMenu={() => setMenuFor(b)} />
                ))}
              </div>
            ) : (
              <p class="muted empty-filter">
                <Info size={16} /> {t('No hay libros que coincidan.')}
              </p>
            )}
          </section>
        )}
      </main>
      {menuFor && <BookMenu book={menuFor} onClose={() => setMenuFor(null)} />}
    </div>
  )
}
