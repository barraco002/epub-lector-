import { useState } from 'preact/hooks'
import { Check, ChevronLeft, Copy, Download, Pencil, Trash2, Upload } from 'lucide-preact'
import { allThemes, currentTheme, customThemes, saveCustomThemes, settings, update } from '../../../lib/settings'
import { newCustomTheme, type Texture, type Theme } from '../../../lib/themes'
import { contrast, isDark } from '../../../lib/color'
import { track } from '../../../lib/game/game'
import { error, info } from '../../../lib/toasts'
import { downloadBlob } from '../../../lib/util'
import { isNative } from '../../../lib/native'
import { Section, Segmented, Slider, Toggle } from '../../ui'

function Swatch({ theme, on, onClick }: { theme: Theme; on: boolean; onClick: () => void }) {
  return (
    <button type="button" class={`swatch ${on ? 'is-on' : ''}`} onClick={onClick} style={{ background: theme.bg, color: theme.text, borderColor: on ? theme.accent : theme.border }} aria-pressed={on} title={theme.name}>
      <span class="swatch-aa" style={{ color: theme.heading ?? theme.text }}>
        Aa
      </span>
      <span class="swatch-lines" aria-hidden="true">
        <i style={{ background: theme.muted }} />
        <i style={{ background: theme.muted }} />
      </span>
      <span class="swatch-dot" style={{ background: theme.accent }} />
      <span class="swatch-name" style={{ color: theme.muted }}>
        {theme.name}
      </span>
      {on && (
        <span class="swatch-check" style={{ background: theme.accent, color: isDark(theme.accent) ? '#fff' : '#111' }}>
          <Check size={12} />
        </span>
      )}
    </button>
  )
}

const FIELDS: [keyof Theme, string][] = [
  ['bg', 'Fondo'],
  ['text', 'Texto'],
  ['heading', 'Títulos'],
  ['muted', 'Texto secundario'],
  ['accent', 'Acento'],
  ['link', 'Enlaces'],
  ['surface', 'Paneles'],
  ['border', 'Bordes'],
  ['selection', 'Selección'],
]

function ContrastBadge({ a, b }: { a: string; b: string }) {
  const c = contrast(a, b)
  const grade = c >= 7 ? 'AAA' : c >= 4.5 ? 'AA' : 'Bajo'
  return (
    <span class={`contrast-badge ${c >= 4.5 ? 'ok' : 'low'}`}>
      {c.toFixed(1)}:1 · {grade}
    </span>
  )
}

function ThemeEditor({ theme, onBack }: { theme: Theme; onBack: () => void }) {
  const save = (patch: Partial<Theme>) => {
    void saveCustomThemes(customThemes.value.map((t) => (t.id === theme.id ? { ...t, ...patch } : t)))
  }
  const remove = () => {
    if (!confirm(`¿Eliminar el tema «${theme.name}»?`)) return
    update({ themeId: 'substack' })
    void saveCustomThemes(customThemes.value.filter((t) => t.id !== theme.id))
    onBack()
  }
  return (
    <div class="theme-editor">
      <button type="button" class="link-btn" onClick={onBack}>
        <ChevronLeft size={18} /> Todos los temas
      </button>
      <label class="field">
        <span>Nombre</span>
        <input type="text" value={theme.name} onInput={(e) => save({ name: (e.target as HTMLInputElement).value })} />
      </label>
      <div class="theme-preview" style={{ background: theme.bg, color: theme.text, borderColor: theme.border }}>
        <strong style={{ color: theme.heading ?? theme.text }}>Capítulo I</strong>
        <p>
          En un lugar de la Mancha, de cuyo nombre no quiero acordarme, <a style={{ color: theme.link ?? theme.accent }}>no ha mucho tiempo</a> que vivía un hidalgo.
        </p>
        <span style={{ color: theme.muted }}>12 min restantes</span>
      </div>
      <div class="row">
        <span class="row-label">Contraste del texto</span>
        <ContrastBadge a={theme.text} b={theme.bg} />
      </div>
      <div class="color-grid">
        {FIELDS.map(([key, label]) => {
          const value = (theme[key] as string | undefined) ?? (key === 'heading' ? theme.text : key === 'link' ? theme.accent : key === 'selection' ? theme.accent : '#888888')
          return (
            <label class="color-field" key={key}>
              <input type="color" value={value.slice(0, 7)} onInput={(e) => save({ [key]: (e.target as HTMLInputElement).value })} />
              <span>{label}</span>
              <code>{value}</code>
            </label>
          )
        })}
      </div>
      <div class="row">
        <span class="row-label">Textura</span>
        <select class="select" value={theme.texture ?? 'none'} onChange={(e) => save({ texture: (e.target as HTMLSelectElement).value as Texture })}>
          <option value="none">Ninguna</option>
          <option value="paper">Papel</option>
          <option value="linen">Lino</option>
          <option value="grain">Grano</option>
        </select>
      </div>
      <div class="btn-row">
        <button
          type="button"
          class="btn"
          onClick={() => {
            const json = JSON.stringify({ ...theme, custom: undefined, id: undefined }, null, 2)
            downloadBlob(new Blob([json], { type: 'application/json' }), `tema-${theme.name}.json`)
          }}
        >
          <Download size={16} /> Exportar
        </button>
        <button type="button" class="btn btn-danger" onClick={remove}>
          <Trash2 size={16} /> Eliminar
        </button>
      </div>
    </div>
  )
}

function importTheme() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.onchange = async () => {
    const f = input.files?.[0]
    if (!f) return
    try {
      const data = JSON.parse(await f.text()) as Partial<Theme>
      const required: (keyof Theme)[] = ['bg', 'text', 'accent']
      if (!required.every((k) => typeof data[k] === 'string')) throw new Error('Faltan colores básicos (bg, text, accent)')
      const base = { surface: data.bg!, muted: data.text!, border: data.text!, ...data } as Theme
      const t = newCustomTheme(base, data.name ?? 'Tema importado')
      await saveCustomThemes([...customThemes.value, t])
      update({ themeId: t.id })
      info('Tema importado', t.name)
    } catch (e) {
      error('No se pudo importar el tema', e instanceof Error ? e.message : undefined)
    }
  }
  input.click()
}

export function ThemePanel() {
  const s = settings.value
  const cur = currentTheme.value
  const [editing, setEditing] = useState<string | null>(null)
  const editingTheme = customThemes.value.find((t) => t.id === editing)
  if (editingTheme) return <ThemeEditor theme={editingTheme} onBack={() => setEditing(null)} />

  const themes = allThemes.value
  const light = themes.filter((t) => !isDark(t.bg))
  const dark = themes.filter((t) => isDark(t.bg))
  const customize = () => {
    const t = newCustomTheme(cur, cur.custom ? `${cur.name} (copia)` : `${cur.name} personalizado`)
    void saveCustomThemes([...customThemes.value, t]).then(() => {
      update({ themeId: t.id })
      track('theme')
      setEditing(t.id)
    })
  }
  return (
    <div class="theme-panel">
      <div class="btn-row">
        {cur.custom && (
          <button type="button" class="btn btn-sm" onClick={() => setEditing(cur.id)}>
            <Pencil size={15} /> Editar «{cur.name}»
          </button>
        )}
        <button type="button" class="btn btn-sm" onClick={customize}>
          <Copy size={15} /> {cur.custom ? 'Duplicar' : 'Personalizar este tema'}
        </button>
        <button type="button" class="btn btn-sm" onClick={importTheme}>
          <Upload size={15} /> Importar
        </button>
      </div>
      {[
        ['Claros', light],
        ['Oscuros', dark],
      ].map(([title, list]) => (
        <Section key={title as string} title={title as string}>
          <div class="swatches">
            {(list as Theme[]).map((t) => (
              <Swatch key={t.id} theme={t} on={t.id === cur.id} onClick={() => update({ themeId: t.id })} />
            ))}
          </div>
        </Section>
      ))}

      <Section title="Textura del fondo">
        <Segmented
          label="Textura"
          value={s.texture}
          onChange={(texture) => update({ texture })}
          options={[
            { value: 'theme', label: 'Del tema' },
            { value: 'none', label: 'Lisa' },
            { value: 'paper', label: 'Papel' },
            { value: 'linen', label: 'Lino' },
            { value: 'grain', label: 'Grano' },
          ]}
        />
      </Section>

      <Section title="Protección de luz azul">
        <Toggle label="Filtro de luz azul" hint="Calienta los colores del tema y las imágenes" checked={s.blueLight} onChange={(blueLight) => update({ blueLight })} />
        <Slider label="Intensidad" value={s.blueIntensity} min={5} max={100} step={5} format={(v) => `${v}%`} onInput={(blueIntensity) => update({ blueIntensity })} />
        <Toggle label="Programar automáticamente" checked={s.blueSchedule} onChange={(blueSchedule) => update({ blueSchedule })} />
        {s.blueSchedule && (
          <div class="row time-row">
            <label>
              Desde <input type="time" value={s.blueFrom} onChange={(e) => update({ blueFrom: (e.target as HTMLInputElement).value })} />
            </label>
            <label>
              hasta <input type="time" value={s.blueTo} onChange={(e) => update({ blueTo: (e.target as HTMLInputElement).value })} />
            </label>
          </div>
        )}
      </Section>

      <Section title="Brillo">
        <Slider label="Atenuar pantalla" value={s.dim} min={0} max={0.8} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onInput={(dim) => update({ dim })} hint="Oscurece por debajo del mínimo del sistema, ideal de noche" />
        {isNative() && (
          <>
            <Toggle label="Brillo del sistema" checked={s.brightness < 0} onChange={(sys) => update({ brightness: sys ? -1 : 0.5 })} />
            {s.brightness >= 0 && <Slider label="Brillo de la app" value={s.brightness} min={0.01} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onInput={(brightness) => update({ brightness })} />}
          </>
        )}
      </Section>
    </div>
  )
}
