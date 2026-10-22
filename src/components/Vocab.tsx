// Mis palabras: lista y repaso con tarjetas.
import { useEffect, useMemo, useState } from 'preact/hooks'
import { Trash2 } from 'lucide-preact'
import { dueWords, MASTERED_BOX, refreshDue, removeWord, review, vocab, type VocabWord } from '../lib/vocab'
import { t } from '../lib/i18n'
import { Bar, Sheet } from './ui'

/** La frase del libro con la palabra resaltada. */
function Context({ w }: { w: VocabWord }) {
  if (!w.context) return null
  const i = w.context.toLowerCase().indexOf(w.word.toLowerCase())
  return (
    <p class="vocab-context">
      {t('«')}
      {i < 0 ? (
        w.context
      ) : (
        <>
          {w.context.slice(0, i)}
          <mark>{w.context.slice(i, i + w.word.length)}</mark>
          {w.context.slice(i + w.word.length)}
        </>
      )}
      {t('»')}
    </p>
  )
}

function ReviewSheet({ onClose }: { onClose: () => void }) {
  // La tanda se fija al abrir: lo que se repasa ahora no vuelve a salir hoy
  const queue = useMemo(() => [...dueWords.value].sort((a, b) => a.box - b.box || a.due - b.due), [])
  const [i, setI] = useState(0)
  const [shown, setShown] = useState(false)
  const [right, setRight] = useState(0)
  const w = queue[i]
  const answer = async (knew: boolean) => {
    await review(w.id, knew)
    if (knew) setRight((r) => r + 1)
    setShown(false)
    setI(i + 1)
  }
  return (
    <Sheet title={t('Repaso')} onClose={onClose} size="sm">
      {w ? (
        <div class="vocab-card">
          <Bar value={i / queue.length} thin />
          <span class="muted small">{t('{n} de {total}', { n: i + 1, total: queue.length })}</span>
          <strong class="vocab-word">{w.word}</strong>
          <Context w={w} />
          {shown ? (
            <>
              <p class="vocab-meaning">{w.meaning || t('Sin significado guardado')}</p>
              <div class="btn-row">
                <button type="button" class="btn" onClick={() => void answer(false)}>
                  {t('No me acordaba')}
                </button>
                <button type="button" class="btn btn-primary" onClick={() => void answer(true)}>
                  {t('La sabía')}
                </button>
              </div>
            </>
          ) : (
            <button type="button" class="btn btn-primary btn-block" onClick={() => setShown(true)}>
              {t('Mostrar significado')}
            </button>
          )}
          {w.bookTitle && <span class="muted small">{t('De «{title}»', { title: w.bookTitle })}</span>}
        </div>
      ) : (
        <div class="vocab-card">
          <strong class="vocab-word">{t('¡Repaso hecho!')}</strong>
          <p class="muted">
            {right
              ? t('{right} de {total} bien · +{xp} XP. Las que fallaste vuelven mañana.', { right, total: queue.length, xp: right * 2 })
              : t('{right} de {total} bien. Las que fallaste vuelven mañana.', { right, total: queue.length })}
          </p>
          <button type="button" class="btn btn-primary btn-block" onClick={onClose}>
            {t('Listo')}
          </button>
        </div>
      )}
    </Sheet>
  )
}

export function VocabSection() {
  const [reviewing, setReviewing] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(refreshDue, [])
  const list = vocab.value
  const due = dueWords.value.length
  const mastered = list.filter((w) => w.box >= MASTERED_BOX).length
  return (
    <section class="card vocab-section">
      <div class="chart-head">
        <h2>{t('Mis palabras')}</h2>
        <span class="muted small">{mastered ? t('{n} guardadas · {m} dominadas', { n: list.length, m: mastered }) : t('{n} guardadas', { n: list.length })}</span>
      </div>
      {list.length === 0 ? (
        <p class="muted small">
          {t('Al definir o traducir una palabra, pulsa «Guardar palabra»: se guarda con su frase del libro y te la recuerdo en repasos cortos.')}
        </p>
      ) : (
        <>
          <div class="btn-row">
            <button type="button" class="btn btn-primary" disabled={!due} onClick={() => setReviewing(true)}>
              {due ? t(due === 1 ? 'Repasar {n} palabra' : 'Repasar {n} palabras', { n: due }) : t('Nada que repasar hoy')}
            </button>
            <button type="button" class="btn" onClick={() => setOpen(!open)}>
              {open ? t('Ocultar lista') : t('Ver todas')}
            </button>
          </div>
          {open && (
            <ul class="vocab-list">
              {list.map((w) => (
                <li key={w.id}>
                  <div>
                    <strong>{w.word}</strong>
                    <span class="muted small">{w.meaning}</span>
                  </div>
                  <span class="vocab-box" title={t('Caja de repaso')}>
                    {w.box >= MASTERED_BOX ? '★' : `${w.box + 1}/${MASTERED_BOX + 1}`}
                  </span>
                  <button type="button" class="icon-btn" aria-label={t('Quitar {word}', { word: w.word })} onClick={() => void removeWord(w.id)}>
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {reviewing && <ReviewSheet onClose={() => setReviewing(false)} />}
    </section>
  )
}
