import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { BookA, BookmarkPlus, Check, Copy, Languages, Search, StickyNote, Trash2, ExternalLink, Volume2 } from 'lucide-preact'
import { active, bookAnnotations, openPanel, searchQuery } from './state'
import { annotations as annStore, type Annotation, type HighlightColor } from '../../lib/db'
import { cleanWord, define, googleTranslateUrl, raeUrl, translate, type Definition } from '../../lib/dictionary'
import { settings } from '../../lib/settings'
import { track } from '../../lib/game/game'
import { info } from '../../lib/toasts'
import { debounce, uid } from '../../lib/util'
import { Sheet, useCloser } from '../ui'
import { isNative, translateWithApp } from '../../lib/native'
import { isSaved, saveWord, sentenceAround } from '../../lib/vocab'
import { t } from '../../lib/i18n'

const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple']
const COLOR_NAMES: Record<HighlightColor, string> = {
  yellow: 'amarillo',
  green: 'verde',
  blue: 'azul',
  pink: 'rosa',
  purple: 'morado',
}

interface Sel {
  s: number
  start: number
  end: number
  text: string
  rect: DOMRect
}

function menuStyle(rect: DOMRect) {
  const width = Math.min(360, innerWidth - 16)
  const left = Math.max(8, Math.min(innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))
  // Debajo de la selección (Android muestra su propia barra encima)
  const below = rect.bottom + 14
  const top = below + 120 < innerHeight ? below : Math.max(8, rect.top - 130)
  return { left: `${left}px`, top: `${top}px`, width: `${width}px` }
}

async function saveHighlight(sel: Sel, color: HighlightColor, note?: string) {
  const ctx = active.value
  if (!ctx) return
  const a: Annotation = {
    id: uid(),
    bookId: ctx.record.id,
    kind: 'highlight',
    s: sel.s,
    start: sel.start,
    end: sel.end,
    text: sel.text,
    color,
    note,
    createdAt: Date.now(),
  }
  await annStore.put(a)
  bookAnnotations.value = [...bookAnnotations.value, a]
  ctx.engine.setAnnotations(bookAnnotations.value)
  track('highlight')
  getSelection()?.removeAllRanges()
}

async function updateAnnotation(a: Annotation, patch: Partial<Annotation>) {
  const next = { ...a, ...patch }
  await annStore.put(next)
  bookAnnotations.value = bookAnnotations.value.map((x) => (x.id === a.id ? next : x))
  active.value?.engine.setAnnotations(bookAnnotations.value)
}

async function removeAnnotation(a: Annotation) {
  await annStore.remove(a.id)
  bookAnnotations.value = bookAnnotations.value.filter((x) => x.id !== a.id)
  active.value?.engine.setAnnotations(bookAnnotations.value)
}

function DictionarySheet({ text, mode, context, onClose }: { text: string; mode: 'define' | 'translate'; context?: string; onClose: () => void }) {
  const ctx = active.value
  const lang = ctx?.book.metadata.language || 'en'
  const to = settings.value.translateTo
  const [def, setDef] = useState<Definition | null | undefined>(undefined)
  const [tr, setTr] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (mode === 'define') {
      track('lookup')
      void define(text, lang).then(setDef)
    }
    void translate(text, lang, to).then(setTr)
  }, [text, mode])
  const word = cleanWord(text)
  const offline = !navigator.onLine
  const [saved, setSaved] = useState(() => isSaved(mode === 'define' ? word : text))
  const save = async () => {
    const first = def?.senses[0]?.definitions[0]?.text
    const meaning = [tr, first].filter(Boolean).join(' — ')
    await saveWord({
      word: mode === 'define' ? word : text.trim(),
      lang,
      meaning,
      context,
      bookId: ctx?.record.id,
      bookTitle: ctx?.record.title,
    })
    setSaved(true)
    info(t('Guardada en Mis palabras'), t('Repásala en Progreso'))
  }
  return (
    <Sheet title={mode === 'define' ? word : t('Traducción')} onClose={onClose} size="sm">
      {offline && <p class="muted">{t('Sin conexión: el diccionario y la traducción necesitan internet.')}</p>}
      {mode === 'define' && (
        <div class="dict">
          {def === undefined && !offline && <p class="muted">{t('Buscando definición…')}</p>}
          {def === null && <p class="muted">{t('No encontré una definición para «{word}».', { word })}</p>}
          {def && (
            <>
              {(def.phonetic || def.audio) && (
                <p class="dict-phonetic">
                  {def.phonetic}
                  {def.audio && (
                    <button type="button" class="icon-btn" aria-label={t('Escuchar pronunciación')} onClick={() => void new Audio(def.audio).play().catch(() => {})}>
                      <Volume2 size={16} />
                    </button>
                  )}
                </p>
              )}
              {def.senses.map((s, i) => (
                <div class="dict-sense" key={i}>
                  <em class="dict-pos">{s.pos}</em>
                  <ol>
                    {s.definitions.map((d, j) => (
                      <li key={j}>
                        {d.text}
                        {d.example && <span class="dict-example">{t('«{example}»', { example: d.example })}</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
              <p class="muted small">{t('Fuente: {source}', { source: def.source })}</p>
            </>
          )}
        </div>
      )}
      <div class="dict-translation">
        <span class="eyebrow">{t('Traducción ({to})', { to })}</span>
        {tr === undefined && !offline && <p class="muted">{t('Traduciendo…')}</p>}
        {tr === null && <p class="muted">{t('No se pudo traducir ahora.')}</p>}
        {tr && <p class="dict-tr">{tr}</p>}
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-sm" disabled={saved || (def === undefined && tr === undefined && !offline)} onClick={() => void save()}>
          {saved ? <Check size={14} /> : <BookmarkPlus size={14} />} {saved ? t('En Mis palabras') : t('Guardar palabra')}
        </button>
        {isNative() && (
          <button type="button" class="btn btn-sm btn-primary" onClick={() => void translateWithApp(text)}>
            <Languages size={14} /> {t('Traducir con una app')}
          </button>
        )}
        <a class="btn btn-sm" href={googleTranslateUrl(text, to)} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} /> Google Translate
        </a>
        {lang.startsWith('es') && (
          <a class="btn btn-sm" href={raeUrl(word)} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} /> RAE
          </a>
        )}
        {def && (
          <a class="btn btn-sm" href={def.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} /> Wiktionary
          </a>
        )}
      </div>
    </Sheet>
  )
}

function NoteSheet({ initial, onSave, onClose }: { initial: string; onSave: (note: string) => void; onClose: () => void }) {
  const [note, setNote] = useState(initial)
  return (
    <Sheet title={t('Nota')} onClose={onClose} size="sm">
      <textarea class="note-input" rows={6} value={note} placeholder={t('Escribe tu nota…')} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} autoFocus />
      <div class="btn-row">
        <button type="button" class="btn" onClick={onClose}>
          {t('Cancelar')}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          onClick={() => {
            onSave(note.trim())
            onClose()
          }}
        >
          {t('Guardar')}
        </button>
      </div>
    </Sheet>
  )
}

function FloatingMenu({ rect, children, onClose }: { rect: DOMRect; children: ComponentChildren; onClose: () => void }) {
  useCloser(onClose)
  return (
    <div class="sel-menu" style={menuStyle(rect)} role="toolbar" onPointerDown={(e) => e.preventDefault()}>
      {children}
    </div>
  )
}

export function SelectionLayer() {
  const [sel, setSel] = useState<Sel | null>(null)
  const [hl, setHl] = useState<{ a: Annotation; rect: DOMRect } | null>(null)
  const [dict, setDict] = useState<{
    text: string
    mode: 'define' | 'translate'
    context?: string
  } | null>(null)
  const [note, setNote] = useState<{ sel?: Sel; a?: Annotation } | null>(null)

  useEffect(() => {
    const check = debounce(() => {
      const ctx = active.value
      const selection = getSelection()
      if (!ctx || !selection) return
      setSel(ctx.engine.selectionInfo(selection))
    }, 220)
    const onScroll = () => {
      setSel(null)
      setHl(null)
      check()
    }
    const scroller = document.querySelector('.reader-scroller')
    document.addEventListener('selectionchange', check)
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    const onHlTap = (e: Event) => {
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail
      const ctx = active.value
      const id = ctx?.engine.annotationAt(x, y)
      const a = id && bookAnnotations.value.find((b) => b.id === id)
      if (a) setHl({ a, rect: new DOMRect(x - 1, y - 10, 2, 20) })
    }
    addEventListener('lunaria:highlight-tap', onHlTap)
    return () => {
      document.removeEventListener('selectionchange', check)
      scroller?.removeEventListener('scroll', onScroll)
      removeEventListener('lunaria:highlight-tap', onHlTap)
    }
  }, [])

  const words = sel ? sel.text.split(/\s+/).length : 0
  const lookup = (sel: Sel, mode: 'define' | 'translate') => {
    const ctx = active.value
    const context = ctx && words <= 4 ? sentenceAround(ctx.engine.chapterText(sel.s), sel.start, sel.end) : undefined
    setDict({ text: sel.text, mode, context })
  }
  return (
    <>
      {sel && !dict && !note && (
        <FloatingMenu rect={sel.rect} onClose={() => (getSelection()?.removeAllRanges(), setSel(null))}>
          <div class="sel-colors">
            {COLORS.map((c) => (
              <button type="button" class={`hl-dot hl-${c}`} aria-label={t('Subrayar en {color}', { color: t(COLOR_NAMES[c]) })} onClick={() => (void saveHighlight(sel, c), setSel(null))} />
            ))}
          </div>
          <div class="sel-actions">
            <button type="button" onClick={() => setNote({ sel })}>
              <StickyNote size={16} /> {t('Nota')}
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(sel.text).then(() => info(t('Copiado')))
                getSelection()?.removeAllRanges()
                setSel(null)
              }}
            >
              <Copy size={16} /> {t('Copiar')}
            </button>
            {words <= 4 && (
              <button type="button" onClick={() => lookup(sel, 'define')}>
                <BookA size={16} /> {t('Definir')}
              </button>
            )}
            <button type="button" onClick={() => lookup(sel, 'translate')}>
              <Languages size={16} /> {t('Traducir')}
            </button>
            <button
              type="button"
              onClick={() => {
                searchQuery.value = sel.text.slice(0, 80)
                getSelection()?.removeAllRanges()
                setSel(null)
                openPanel('search')
              }}
            >
              <Search size={16} /> {t('Buscar')}
            </button>
          </div>
        </FloatingMenu>
      )}
      {hl && !note && (
        <FloatingMenu rect={hl.rect} onClose={() => setHl(null)}>
          <div class="sel-colors">
            {COLORS.map((c) => (
              <button
                type="button"
                class={`hl-dot hl-${c} ${hl.a.color === c ? 'is-on' : ''}`}
                aria-label={t('Cambiar a {color}', { color: t(COLOR_NAMES[c]) })}
                onClick={() => (void updateAnnotation(hl.a, { color: c }), setHl(null))}
              />
            ))}
          </div>
          {hl.a.note && <p class="sel-note">{hl.a.note}</p>}
          <div class="sel-actions">
            <button type="button" onClick={() => setNote({ a: hl.a })}>
              <StickyNote size={16} /> {hl.a.note ? t('Editar nota') : t('Nota')}
            </button>
            <button type="button" onClick={() => (void navigator.clipboard?.writeText(hl.a.text).then(() => info(t('Copiado'))), setHl(null))}>
              <Copy size={16} /> {t('Copiar')}
            </button>
            <button type="button" class="danger" onClick={() => (void removeAnnotation(hl.a), setHl(null))}>
              <Trash2 size={16} /> {t('Quitar')}
            </button>
          </div>
        </FloatingMenu>
      )}
      {dict && (
        <DictionarySheet
          text={dict.text}
          mode={dict.mode}
          context={dict.context}
          onClose={() => {
            setDict(null)
            setSel(null)
          }}
        />
      )}
      {note && (
        <NoteSheet
          initial={note.a?.note ?? ''}
          onClose={() => {
            setNote(null)
            setHl(null)
          }}
          onSave={(text) => {
            if (note.a) void updateAnnotation(note.a, { note: text || undefined })
            else if (note.sel) void saveHighlight(note.sel, 'yellow', text || undefined)
            setSel(null)
          }}
        />
      )}
    </>
  )
}
