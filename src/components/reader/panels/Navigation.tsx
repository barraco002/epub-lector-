import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Download, Trash2 } from 'lucide-preact'
import { active, bookAnnotations, panel, position, searchQuery } from '../state'
import { annotations as annStore, type Annotation } from '../../../lib/db'
import { exportHighlights } from '../../../lib/library'
import type { TocItem } from '../../../lib/epub/book'
import type { SearchHit } from '../../../lib/reader/engine'
import { Segmented } from '../../ui'

function TocList({ items, current }: { items: TocItem[]; current: number }) {
  const ctx = active.value!
  return (
    <ol class="toc-list">
      {items.map((it) => (
        <li key={`${it.path}#${it.fragment}#${it.label}`}>
          <button
            type="button"
            class={`toc-item depth-${Math.min(it.depth, 3)} ${it.spine === current ? 'is-current' : ''}`}
            disabled={it.spine < 0}
            onClick={() => {
              panel.value = null
              void ctx.jump({ s: it.spine, fragment: it.fragment })
            }}
          >
            {it.label}
          </button>
          {it.children.length > 0 && <TocList items={it.children} current={current} />}
        </li>
      ))}
    </ol>
  )
}

function AnnotationList({ kind }: { kind: Annotation['kind'] }) {
  const ctx = active.value!
  const list = bookAnnotations.value.filter((a) => a.kind === kind).sort((a, b) => a.s - b.s || a.start - b.start)
  if (!list.length) {
    return <p class="muted empty-list">{kind === 'bookmark' ? 'Aún no hay marcadores. Usa el icono de marcador en la barra superior.' : 'Selecciona texto para subrayarlo con colores y añadir notas.'}</p>
  }
  const remove = async (a: Annotation) => {
    await annStore.remove(a.id)
    bookAnnotations.value = bookAnnotations.value.filter((x) => x.id !== a.id)
    ctx.engine.setAnnotations(bookAnnotations.value)
  }
  return (
    <>
      {kind === 'highlight' && (
        <button type="button" class="link-btn" onClick={() => exportHighlights(ctx.record)}>
          <Download size={16} /> Exportar a Markdown
        </button>
      )}
      <ul class="ann-list">
        {list.map((a) => (
          <li key={a.id} class={`ann ann-${a.color}`}>
            <button
              type="button"
              class="ann-main"
              onClick={() => {
                panel.value = null
                void ctx.jump({ s: a.s, c: a.start })
              }}
            >
              <span class="ann-chapter">{ctx.chapterLabel(a.s)}</span>
              <span class="ann-text">{a.text}</span>
              {a.note && <span class="ann-note">{a.note}</span>}
            </button>
            <button type="button" class="icon-btn" aria-label="Eliminar" onClick={() => void remove(a)}>
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

export function TocPanel() {
  const ctx = active.value!
  const [tab, setTab] = useState<'toc' | 'bookmark' | 'highlight'>('toc')
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Desplazar el índice hasta el capítulo actual
    listRef.current?.querySelector('.is-current')?.scrollIntoView({ block: 'center' })
  }, [tab])
  return (
    <div class="toc-panel" ref={listRef}>
      <Segmented
        label="Sección"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'toc', label: 'Índice' },
          { value: 'bookmark', label: 'Marcadores' },
          { value: 'highlight', label: 'Subrayados' },
        ]}
      />
      {tab === 'toc' ? <TocList items={ctx.book.toc} current={position.value.s} /> : <AnnotationList kind={tab} />}
    </div>
  )
}

export function SearchPanel() {
  const ctx = active.value!
  const [q, setQ] = useState(searchQuery.value)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [state, setState] = useState<'idle' | 'searching' | 'done'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  useEffect(() => {
    searchQuery.value = q
    if (q.trim().length < 2) {
      setHits([])
      setState('idle')
      return
    }
    const signal = { cancelled: false }
    const found: SearchHit[] = []
    const timer = setTimeout(async () => {
      setState('searching')
      let lastFlush = performance.now()
      await ctx.engine.search(q, (h) => {
        found.push(h)
        if (performance.now() - lastFlush > 150) {
          setHits([...found])
          lastFlush = performance.now()
        }
      }, signal)
      if (!signal.cancelled) {
        setHits([...found])
        setState('done')
      }
    }, 350)
    return () => {
      signal.cancelled = true
      clearTimeout(timer)
    }
  }, [q])
  useEffect(() => () => ctx.engine.clearSearchHighlight(), [])
  const grouped = useMemo(() => hits, [hits])
  return (
    <div class="search-panel">
      <input ref={inputRef} type="search" class="search-input" placeholder="Buscar en el libro…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <p class="muted small">
        {state === 'searching' ? `Buscando… ${hits.length}` : state === 'done' ? (hits.length >= 400 ? 'Más de 400 resultados' : `${hits.length} resultados`) : 'Escribe al menos 2 letras. No distingue mayúsculas ni tildes.'}
      </p>
      <ul class="search-results">
        {grouped.map((h) => (
          <li key={`${h.s}:${h.start}`}>
            <button
              type="button"
              onClick={() => {
                ctx.remember()
                ctx.session.markJump()
                void ctx.engine.showHit(h)
                if (matchMedia('(max-width: 899px)').matches) panel.value = null
              }}
            >
              <span class="ann-chapter">{ctx.chapterLabel(h.s)}</span>
              <span class="hit">
                …{h.before}
                <mark>{h.match}</mark>
                {h.after}…
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
