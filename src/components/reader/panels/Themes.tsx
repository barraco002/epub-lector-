import { useState } from 'preact/hooks'
import { Check, ChevronLeft, Copy, Download, Image as ImageIcon, Moon, Pencil, Sun, Trash2, Upload } from 'lucide-preact'
import { clearBgImage, setBgImage } from '../../../lib/background'
import { allThemes, chooseTheme, currentTheme, customThemes, nightActive, saveCustomThemes, settings, update } from '../../../lib/settings'
import { newCustomTheme, type Texture, type Theme } from '../../../lib/themes'
import { contrast, isDark } from '../../../lib/color'
import { track } from '../../../lib/game/game'
import { error, info } from '../../../lib/toasts'
import { isNative, saveFile } from '../../../lib/native'
import { shown, t } from '../../../lib/i18n'
import { Section, Segmented, Slider, Toggle } from '../../ui'

function Swatch({ theme, on, onClick }: { theme: Theme; on: boolean; onClick: () => void }) {
  return (
    <button type="button" class={`swatch ${on ? 'is-on' : ''}`} onClick={onClick} style={{ background: theme.bg, color: theme.text, borderColor: on ? theme.accent : theme.border }} aria-pressed={on} title={shown(theme.name, theme.custom)}>
      <span class="swatch-aa" style={{ color: theme.heading ?? theme.text }}>
        Aa
      </span>
      <span class="swatch-lines" aria-hidden="true">
        <i style={{ background: theme.muted }} />
        <i style={{ background: theme.muted }} />
      </span>
      <span class="swatch-dot" style={{ background: theme.accent }} />
      <span class="swatch-name" style={{ color: theme.muted }}>
        {shown(theme.name, theme.custom)}
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
  const grade = c >= 7 ? 'AAA' : c >= 4.5 ? 'AA' : t('Bajo')
  return (
    <span class={`contrast-badge ${c >= 4.5 ? 'ok' : 'low'}`}>
      {c.toFixed(1)}:1 · {grade}
    </span>
  )
}

function ThemeEditor({ theme, onBack }: { theme: Theme; onBack: () => void }) {
  const save = (patch: Partial<Theme>) => {
    void saveCustomThemes(customThemes.value.map((th) => (th.id === theme.id ? { ...th, ...patch } : th)))
  }
  const remove = () => {
    if (!confirm(t('¿Eliminar el tema «{name}»?', { name: shown(theme.name, theme.custom) }))) return
    chooseTheme(nightActive.value ? 'substack-noche' : 'substack')
    void saveCustomThemes(customThemes.value.filter((th) => th.id !== theme.id))
    onBack()
  }
  return (
    <div class="theme-editor">
      <button type="button" class="link-btn" onClick={onBack}>
        <ChevronLeft size={18} /> {t('Todos los temas')}
      </button>
      <label class="field">
        <span>{t('Nombre')}</span>
        <input type="text" value={theme.name} onInput={(e) => save({ name: (e.target as HTMLInputElement).value })} />
      </label>
      <div class="theme-preview" style={{ background: theme.bg, color: theme.text, borderColor: theme.border }}>
        <strong style={{ color: theme.heading ?? theme.text }}>{t('Capítulo I')}</strong>
        <p>
          {t('En un lugar de la Mancha, de cuyo nombre no quiero acordarme,')} <a style={{ color: theme.link ?? theme.accent }}>{t('no ha mucho tiempo')}</a> {t('que vivía un hidalgo.')}
        </p>
        <span style={{ color: theme.muted }}>{t('12 min restantes')}</span>
      </div>
      <div class="row">
        <span class="row-label">{t('Contraste del texto')}</span>
        <ContrastBadge a={theme.text} b={theme.bg} />
      </div>
      <div class="color-grid">
        {FIELDS.map(([key, label]) => {
          const value = (theme[key] as string | undefined) ?? (key === 'heading' ? theme.text : key === 'link' ? theme.accent : key === 'selection' ? theme.accent : '#888888')
          return (
            <label class="color-field" key={key}>
              <input type="color" value={value.slice(0, 7)} onInput={(e) => save({ [key]: (e.target as HTMLInputElement).value })} />
              <span>{t(label)}</span>
              <code>{value}</code>
            </label>
          )
        })}
      </div>
      <div class="row">
        <span class="row-label">{t('Textura')}</span>
        <select class="select" value={theme.texture ?? 'none'} onChange={(e) => save({ texture: (e.target as HTMLSelectElement).value as Texture })}>
          <option value="none">{t('Ninguna')}</option>
          <option value="paper">{t('Papel')}</option>
          <option value="linen">{t('Lino')}</option>
          <option value="grain">{t('Grano')}</option>
        </select>
      </div>
      <div class="btn-row">
        <button
          type="button"
          class="btn"
          onClick={() => {
            const json = JSON.stringify({ ...theme, custom: undefined, id: undefined }, null, 2)
            void saveFile(new Blob([json], { type: 'application/json' }), t('tema-{name}.json', { name: shown(theme.name, theme.custom) }))
          }}
        >
          <Download size={16} /> {t('Exportar')}
        </button>
        <button type="button" class="btn btn-danger" onClick={remove}>
          <Trash2 size={16} /> {t('Eliminar')}
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
      if (!required.every((k) => typeof data[k] === 'string')) throw new Error(t('Faltan colores básicos (bg, text, accent)'))
      const base = { surface: data.bg!, muted: data.text!, border: data.text!, ...data } as Theme
      const imported = newCustomTheme(base, data.name ?? t('Tema importado'))
      await saveCustomThemes([...customThemes.value, imported])
      chooseTheme(imported.id)
      info(t('Tema importado'), imported.name)
    } catch (e) {
      error(t('No se pudo importar el tema'), e instanceof Error ? e.message : undefined)
    }
  }
  input.click()
}

function pickBackground() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async () => {
    const f = input.files?.[0]
    if (!f) return
    if (f.size > 8_000_000) return error(t('Imagen demasiado grande'), t('Usa una de menos de 8 MB'))
    await setBgImage(f)
  }
  input.click()
}

export function ThemePanel() {
  const s = settings.value
  const cur = currentTheme.value
  const [editing, setEditing] = useState<string | null>(null)
  const editingTheme = customThemes.value.find((th) => th.id === editing)
  if (editingTheme) return <ThemeEditor theme={editingTheme} onBack={() => setEditing(null)} />

  const themes = allThemes.value
  const light = themes.filter((th) => !isDark(th.bg))
  const dark = themes.filter((th) => isDark(th.bg))
  const customize = () => {
    const theme = newCustomTheme(cur, cur.custom ? t('{name} (copia)', { name: shown(cur.name, cur.custom) }) : t('{name} personalizado', { name: shown(cur.name, cur.custom) }))
    void saveCustomThemes([...customThemes.value, theme]).then(() => {
      chooseTheme(theme.id)
      track('theme')
      setEditing(theme.id)
    })
  }
  return (
    <div class="theme-panel">
      <div class="btn-row">
        {cur.custom && (
          <button type="button" class="btn btn-sm" onClick={() => setEditing(cur.id)}>
            <Pencil size={15} /> {t('Editar «{name}»', { name: shown(cur.name, cur.custom) })}
          </button>
        )}
        <button type="button" class="btn btn-sm" onClick={customize}>
          <Copy size={15} /> {cur.custom ? t('Duplicar') : t('Personalizar este tema')}
        </button>
        <button type="button" class="btn btn-sm" onClick={importTheme}>
          <Upload size={15} /> {t('Importar')}
        </button>
      </div>
      <Section title={t('Día y noche')}>
        <div class="day-night">
          <button type="button" class={`dn-card ${!nightActive.value ? 'is-on' : ''}`} onClick={() => update({ nightMode: 'off' })}>
            <Sun size={16} /> {t('Día')} · {t(allThemes.value.find((x) => x.id === s.themeId)?.name ?? s.themeId)}
          </button>
          <button type="button" class={`dn-card ${nightActive.value ? 'is-on' : ''}`} onClick={() => update({ nightMode: 'on' })}>
            <Moon size={16} /> {t('Noche')} · {t(allThemes.value.find((x) => x.id === s.nightThemeId)?.name ?? s.nightThemeId)}
          </button>
        </div>
        <Segmented
          label={t('Cambio automático')}
          value={s.nightMode === 'system' || s.nightMode === 'schedule' ? s.nightMode : 'manual'}
          onChange={(v) => update({ nightMode: v === 'manual' ? (nightActive.value ? 'on' : 'off') : v })}
          options={[
            { value: 'manual', label: t('Manual') },
            { value: 'system', label: t('Como el sistema') },
            { value: 'schedule', label: t('Por horario') },
          ]}
        />
        {s.nightMode === 'schedule' && (
          <div class="row time-row">
            <label>
              {t('Noche desde')} <input type="time" value={s.blueFrom} onChange={(e) => update({ blueFrom: (e.target as HTMLInputElement).value })} />
            </label>
            <label>
              {t('hasta')} <input type="time" value={s.blueTo} onChange={(e) => update({ blueTo: (e.target as HTMLInputElement).value })} />
            </label>
          </div>
        )}
        <p class="muted small">{nightActive.value ? t('Tocar un tema de abajo cambia el de noche.') : t('Tocar un tema de abajo cambia el de día.')}</p>
      </Section>
      {[
        ['Claros', light],
        ['Oscuros', dark],
      ].map(([title, list]) => (
        <Section key={title as string} title={t(title as string)}>
          <div class="swatches">
            {(list as Theme[]).map((th) => (
              <Swatch key={th.id} theme={th} on={th.id === cur.id} onClick={() => chooseTheme(th.id)} />
            ))}
          </div>
        </Section>
      ))}

      <Section
        title={t('Colores propios')}
        action={
          (s.colors.text || s.colors.bg || s.colors.accent) && (
            <button type="button" class="link-btn" onClick={() => update({ colors: { text: '', bg: '', accent: '' } })}>
              {t('Usar los del tema')}
            </button>
          )
        }
      >
        <p class="muted small">{t('Se aplican encima de cualquier tema y se guardan aunque cambies de tema.')}</p>
        <div class="color-grid">
          {(
            [
              ['bg', 'Fondo', cur.bg],
              ['text', 'Texto', cur.text],
              ['accent', 'Acento', cur.accent],
            ] as const
          ).map(([key, label, base]) => (
            <label class="color-field" key={key}>
              <input type="color" value={(s.colors[key] || base).slice(0, 7)} onInput={(e) => update({ colors: { ...s.colors, [key]: (e.target as HTMLInputElement).value } })} />
              <span>{t(label)}</span>
              <code>{s.colors[key] ? s.colors[key] : t('del tema')}</code>
            </label>
          ))}
        </div>
      </Section>

      <Section title={t('Fondo')}>
        <div class="chips">
          {(
            [
              ['theme', 'Del tema'],
              ['none', 'Liso'],
              ['paper', 'Papel'],
              ['linen', 'Lino'],
              ['grain', 'Grano'],
              ['dots', 'Puntos'],
              ['vignette', 'Viñeta'],
            ] as const
          ).map(([value, label]) => (
            <button type="button" key={value} class={`chip ${s.texture === value ? 'is-on' : ''}`} aria-pressed={s.texture === value} onClick={() => update({ texture: value })}>
              {t(label)}
            </button>
          ))}
        </div>
        <div class="row">
          <span class="row-label">{t('Imagen propia')}</span>
          <span class="row-inline">
            <button type="button" class="btn btn-sm" onClick={pickBackground}>
              <ImageIcon size={15} /> {s.bgImage ? t('Cambiar') : t('Elegir')}
            </button>
            {s.bgImage && (
              <button type="button" class="icon-btn" aria-label={t('Quitar imagen de fondo')} onClick={() => void clearBgImage()}>
                <Trash2 size={16} />
              </button>
            )}
          </span>
        </div>
        {s.bgImage && <Slider label={t('Intensidad de la imagen')} value={s.bgImageOpacity} min={0.05} max={0.8} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onInput={(bgImageOpacity) => update({ bgImageOpacity })} />}
      </Section>

      <Section title={t('Página')}>
        <div class="row stack">
          <span class="row-label">{t('Modo concentración')}</span>
          <Segmented
            label={t('Modo concentración')}
            value={s.focusMode}
            onChange={(focusMode) => update({ focusMode })}
            options={[
              { value: 'off', label: t('No') },
              { value: 'marco', label: t('Marco') },
              { value: 'franja', label: t('Franja') },
            ]}
          />
          <span class="row-hint">
            {s.focusMode === 'marco' ? t('El texto queda en una página enmarcada, separada del fondo.') : s.focusMode === 'franja' ? t('Atenúa arriba y abajo: lees en una franja central despejada.') : t('Texto a pantalla completa.')}
          </span>
        </div>
        <div class="row">
          <span class="row-label">{t('Indicador de avance')}</span>
          <select class="select" value={`${s.progressBar}:${s.progressStyle}`} onChange={(e) => {
            const [progressBar, progressStyle] = (e.target as HTMLSelectElement).value.split(':') as [typeof s.progressBar, typeof s.progressStyle]
            update({ progressBar, progressStyle })
          }}>
            <option value="book:sutil">{t('Libro · discreto')}</option>
            <option value="chapter:sutil">{t('Capítulo · discreto')}</option>
            <option value="goal:sutil">{t('Meta diaria · discreto')}</option>
            <option value="book:acento">{t('Libro · con color')}</option>
            <option value="none:sutil">{t('Ninguno')}</option>
          </select>
        </div>
        <Toggle label={t('Cabecera al empezar cada capítulo')} hint={t('Número y título del capítulo, y un aviso suave al cruzar de uno a otro')} checked={s.chapterHeaders} onChange={(chapterHeaders) => update({ chapterHeaders })} />
      </Section>

      <Section title={t('Protección de luz azul')}>
        <Toggle label={t('Filtro de luz azul')} hint={t('Calienta los colores del tema y las imágenes')} checked={s.blueLight} onChange={(blueLight) => update({ blueLight })} />
        <Slider label={t('Intensidad')} value={s.blueIntensity} min={5} max={100} step={5} format={(v) => `${v}%`} onInput={(blueIntensity) => update({ blueIntensity })} />
        <Toggle label={t('Programar automáticamente')} checked={s.blueSchedule} onChange={(blueSchedule) => update({ blueSchedule })} />
        {s.blueSchedule && (
          <div class="row time-row">
            <label>
              {t('Desde')} <input type="time" value={s.blueFrom} onChange={(e) => update({ blueFrom: (e.target as HTMLInputElement).value })} />
            </label>
            <label>
              {t('hasta')} <input type="time" value={s.blueTo} onChange={(e) => update({ blueTo: (e.target as HTMLInputElement).value })} />
            </label>
          </div>
        )}
      </Section>

      <Section title={t('Brillo')}>
        <Slider label={t('Atenuar pantalla')} value={s.dim} min={0} max={0.8} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onInput={(dim) => update({ dim })} hint={t('Oscurece por debajo del mínimo del sistema, ideal de noche')} />
        {isNative() && (
          <>
            <Toggle label={t('Brillo del sistema')} checked={s.brightness < 0} onChange={(sys) => update({ brightness: sys ? -1 : 0.5 })} />
            {s.brightness >= 0 && <Slider label={t('Brillo de la app')} value={s.brightness} min={0.01} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onInput={(brightness) => update({ brightness })} />}
          </>
        )}
      </Section>
    </div>
  )
}
