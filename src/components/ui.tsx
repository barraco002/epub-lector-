import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { X } from 'lucide-preact'
import { pushCloser } from '../lib/router'

/** Registra `onClose` en la pila de Atrás/Escape mientras el componente está montado. */
export function useCloser(onClose: () => void) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => pushCloser(() => ref.current()), [])
}

export function IconButton(props: JSX.HTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  const { label, active, class: cls, children, ...rest } = props
  return (
    <button type="button" aria-label={label} title={label} class={`icon-btn ${active ? 'is-active' : ''} ${cls ?? ''}`} {...rest}>
      {children}
    </button>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label class="row toggle-row">
      <span class="row-text">
        <span class="row-label">{label}</span>
        {hint && <span class="row-hint">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" class="switch" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
    </label>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onInput: (v: number) => void
  format?: (v: number) => string
  hint?: string
}

export function Slider({ label, value, min, max, step, onInput, format, hint }: SliderProps) {
  const clampStep = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step))
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div class="slider">
      <div class="slider-head">
        <span class="row-label">{label}</span>
        <span class="slider-value">{format ? format(value) : value}</span>
      </div>
      <div class="slider-body">
        <button type="button" class="step-btn" aria-label={`Reducir ${label}`} onClick={() => onInput(+clampStep(value - step).toFixed(4))}>
          −
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          style={{ '--pct': `${pct}%` }}
          onInput={(e) => onInput(+(e.target as HTMLInputElement).value)}
        />
        <button type="button" class="step-btn" aria-label={`Aumentar ${label}`} onClick={() => onInput(+clampStep(value + step).toFixed(4))}>
          +
        </button>
      </div>
      {hint && <div class="row-hint">{hint}</div>}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ComponentChildren }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button type="button" role="radio" aria-checked={o.value === value} class={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Section({ title, children, action }: { title: string; children: ComponentChildren; action?: ComponentChildren }) {
  return (
    <section class="panel-section">
      <div class="panel-section-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Panel deslizante: hoja inferior en móvil, cajón lateral en pantallas anchas. */
export function Sheet({ title, onClose, children, size = 'md', scrim = true }: { title: ComponentChildren; onClose: () => void; children: ComponentChildren; size?: 'sm' | 'md' | 'lg'; scrim?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useCloser(onClose)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])
  return (
    <div class={`sheet-layer ${scrim ? 'with-scrim' : ''}`}>
      {scrim && <div class="scrim" onClick={onClose} />}
      <div class={`sheet sheet-${size}`} role="dialog" aria-modal={scrim} tabIndex={-1} ref={ref}>
        <div class="sheet-grip" aria-hidden="true" />
        <header class="sheet-head">
          <h2>{title}</h2>
          <IconButton label="Cerrar" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </header>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  )
}

export function Ring({ value, size = 44, stroke = 4, children, color }: { value: number; size?: number; stroke?: number; children?: ComponentChildren; color?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div class="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" stroke-width={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? 'var(--accent)'}
          stroke-width={stroke}
          stroke-linecap="round"
          stroke-dasharray={c}
          stroke-dashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children && <div class="ring-inner">{children}</div>}
    </div>
  )
}

export function Bar({ value, thin }: { value: number; thin?: boolean }) {
  return (
    <div class={`bar ${thin ? 'bar-thin' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div class="bar-fill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, value))})` }} />
    </div>
  )
}

export function Confirm({ title, body, confirmLabel, danger, onConfirm, onClose }: { title: string; body: ComponentChildren; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  useCloser(onClose)
  return (
    <div class="sheet-layer with-scrim dialog-layer">
      <div class="scrim" onClick={onClose} />
      <div class="dialog" role="alertdialog" aria-modal="true">
        <h2>{title}</h2>
        <div class="dialog-body">{body}</div>
        <div class="dialog-actions">
          <button type="button" class="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            class={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
