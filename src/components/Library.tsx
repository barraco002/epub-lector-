import { useMemo, useRef, useState } from 'preact/hooks'
import { BarChart3, BookOpen, Check, Download, Info, LayoutGrid, List, MoreHorizontal, Plus, RotateCcw, Search, Settings as SettingsIcon, Trash2 } from 'lucide-preact'
import type { BookRecord } from '../lib/db'
import { coverUrl, exportHighlights, importFiles, importing, library, removeBook, setStatus, sortBooks } from '../lib/library'
import { go } from '../lib/router'
import { goalProgress, level, readingWpm, streak, today } from '../lib/game/game'
import { levelTitle } from '../lib/game/levels'
import { settings } from '../lib/settings'
import { fmtDuration, fmtNum, hashString } from '../lib/util'
import { isNative } from '../lib/native'
import { Bar, Confirm, IconButton, Ring, Segmented, Sheet } from './ui'

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
  return (
    <>
      <Sheet title={book.title} onClose={onClose} size="sm">
        <div class="book-info">
          <Cover book={book} size="sm" />
          <div>
            <p class="muted">{book.authors.join(', ') || 'Autor desconocido'}</p>
            <p class="muted small">
              {fmtNum(book.totalWords)} palabras · {Math.round(book.progress * 100)}% · {fmtDuration(book.timeMs)} leídos
            </p>
            {book.publisher && <p class="muted small">{book.publisher}</p>}
          </div>
        </div>
        {book.description && <p class="book-desc">{book.description.slice(0, 600)}</p>}
        <div class="menu-list">
          <button type="button" class="menu-item" onClick={() => (onClose(), openBook(book))}>
            <BookOpen size={18} /> {book.status === 'new' ? 'Empezar a leer' : 'Continuar leyendo'}
          </button>
          {book.status !== 'finished' ? (
            <button type="button" class="menu-item" onClick={() => (setStatus(book.id, 'finished'), onClose())}>
              <Check size={18} /> Marcar como terminado
            </button>
          ) : (
            <button type="button" class="menu-item" onClick={() => (setStatus(book.id, 'new'), onClose())}>
              <RotateCcw size={18} /> Marcar como no leído
            </button>
          )}
          <button type="button" class="menu-item" onClick={() => exportHighlights(book)}>
            <Download size={18} /> Exportar subrayados (Markdown)
          </button>
          <button type="button" class="menu-item danger" onClick={() => setConfirm(true)}>
            <Trash2 size={18} /> Eliminar de la biblioteca
          </button>
        </div>
      </Sheet>
      {confirm && (
        <Confirm
          title="¿Eliminar este libro?"
          body={<p>Se borrarán el archivo, el progreso y los subrayados de «{book.title}». Tus estadísticas y logros se mantienen.</p>}
          confirmLabel="Eliminar"
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
  const status = book.status === 'finished' ? 'Terminado' : book.status === 'new' ? 'Nuevo' : `${Math.round(book.progress * 100)}%`
  return (
    <article class={`book-card book-${view}`}>
      <button type="button" class="book-open" onClick={() => openBook(book)} aria-label={`Abrir ${book.title}`}>
        <Cover book={book} size={view === 'grid' ? 'md' : 'sm'} />
        <div class="book-meta">
          <h3 class="book-title">{book.title}</h3>
          <p class="book-author">{book.authors[0] ?? 'Autor desconocido'}</p>
          <div class="book-progress">
            {book.status === 'reading' && <Bar value={book.progress} thin />}
            <span class={`book-status status-${book.status}`}>
              {book.status === 'finished' && <Check size={12} />} {status}
            </span>
          </div>
        </div>
      </button>
      <IconButton label="Opciones del libro" class="book-more" onClick={onMenu}>
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
        <span class="eyebrow">Hoy</span>
        <strong>{goalProgress.value >= 1 ? '¡Meta cumplida!' : `${Math.max(0, goalMin - mins)} min para tu meta`}</strong>
        <span class="muted small">
          {fmtNum(today.value.words)} palabras · 🔥 {streak.value} {streak.value === 1 ? 'día' : 'días'}
        </span>
      </div>
      <div class="today-level">
        <span class="level-badge">Nv {lv.level}</span>
        <span class="muted small">{levelTitle(lv.level)}</span>
        <Bar value={lv.progress} thin />
      </div>
    </button>
  )
}

function ContinueCard({ book }: { book: BookRecord }) {
  return (
    <button type="button" class="continue-card card" onClick={() => openBook(book)}>
      <Cover book={book} size="lg" />
      <div class="continue-text">
        <span class="eyebrow">Continuar leyendo</span>
        <h2>{book.title}</h2>
        <p class="muted">{book.authors.join(', ')}</p>
        <Bar value={book.progress} />
        <p class="muted small">
          {Math.round(book.progress * 100)}% · quedan ~{fmtDuration(minutesLeft(book) * 60000)}
        </p>
        <span class="btn btn-primary btn-sm">Seguir leyendo</span>
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
  const current = useMemo(() => sortBooks(all.filter((b) => b.status === 'reading'), 'recent')[0], [all])

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
          <IconButton label="Progreso y logros" onClick={() => go({ name: 'stats' })}>
            <BarChart3 size={20} />
          </IconButton>
          <IconButton label="Ajustes" onClick={() => go({ name: 'settings' })}>
            <SettingsIcon size={20} />
          </IconButton>
          <button type="button" class="btn btn-primary btn-sm" onClick={pick}>
            <Plus size={16} /> Importar
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
              Importando {imp.total > 1 ? `${imp.index + 1}/${imp.total} · ` : ''}
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
            <h1>Tu biblioteca está esperando</h1>
            <p class="muted">Importa tus libros EPUB{isNative() ? '' : ' o arrástralos a esta ventana'}. Se guardan solo en este dispositivo.</p>
            <button type="button" class="btn btn-primary" onClick={pick}>
              <Plus size={18} /> Importar EPUB
            </button>
          </div>
        ) : (
          <section class="shelf">
            <div class="shelf-head">
              <h2>Biblioteca</h2>
              <span class="muted small">{all.length} {all.length === 1 ? 'libro' : 'libros'}</span>
            </div>
            <div class="shelf-tools">
              <Segmented<Filter>
                label="Filtrar"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'Todos' },
                  { value: 'reading', label: 'Leyendo' },
                  { value: 'new', label: 'Por leer' },
                  { value: 'finished', label: 'Terminados' },
                ]}
              />
              <div class="shelf-tools-right">
                <label class="search-field">
                  <Search size={16} />
                  <input type="search" placeholder="Buscar título o autor" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
                </label>
                <select class="select" value={sort} aria-label="Ordenar" onChange={(e) => setSort((e.target as HTMLSelectElement).value as Sort)}>
                  <option value="recent">Recientes</option>
                  <option value="added">Añadidos</option>
                  <option value="title">Título</option>
                  <option value="author">Autor</option>
                  <option value="progress">Progreso</option>
                </select>
                <IconButton label={view === 'grid' ? 'Ver como lista' : 'Ver como cuadrícula'} onClick={() => setViewMode(view === 'grid' ? 'list' : 'grid')}>
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
                <Info size={16} /> No hay libros que coincidan.
              </p>
            )}
          </section>
        )}
      </main>
      {menuFor && <BookMenu book={menuFor} onClose={() => setMenuFor(null)} />}
    </div>
  )
}
