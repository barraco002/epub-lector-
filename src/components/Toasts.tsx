import { dismiss, toasts } from '../lib/toasts'

export function Toasts() {
  const list = toasts.value
  if (!list.length) return null
  return (
    <div class="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <button type="button" key={t.id} class={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.icon && <span class="toast-icon">{t.icon}</span>}
          <span class="toast-text">
            <strong>{t.title}</strong>
            {t.body && <span>{t.body}</span>}
            {t.bar != null && (
              <span class="toast-bar">
                <span style={{ transform: `scaleX(${t.bar})` }} />
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}
