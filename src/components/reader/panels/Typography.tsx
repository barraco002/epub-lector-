import { useState } from 'preact/hooks'
import { AlignJustify, AlignLeft, ChevronLeft, ChevronRight, Plus, RotateCcw, Save, Trash2 } from 'lucide-preact'
import { BUILTIN_PRESETS, customPresets, DEFAULT_TYPO, saveCustomPresets, settings, updateTypo, type TypoPreset } from '../../../lib/settings'
import { addCustomFont, allFonts, CATEGORY_LABEL, removeCustomFont, type FontCategory, type FontDef } from '../../../lib/fonts'
import { track } from '../../../lib/game/game'
import { error, info } from '../../../lib/toasts'
import { uid } from '../../../lib/util'
import { Section, Segmented, Slider, Toggle } from '../../ui'

const ORDER: FontCategory[] = ['serif', 'sans', 'access', 'display', 'mono', 'system', 'custom']

export function FontPicker({ value, onPick, onBack, allowSame }: { value: string; onPick: (id: string) => void; onBack: () => void; allowSame?: boolean }) {
  const fonts = allFonts()
  const pickFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.ttf,.otf,.woff,.woff2,font/*'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      try {
        const def = await addCustomFont(f)
        track('font')
        onPick(def.id)
        info('Fuente añadida', def.name)
      } catch (e) {
        error('No se pudo añadir la fuente', e instanceof Error ? e.message : undefined)
      }
    }
    input.click()
  }
  return (
    <div class="font-picker">
      <button type="button" class="link-btn" onClick={onBack}>
        <ChevronLeft size={18} /> Volver
      </button>
      {allowSame && (
        <button type="button" class={`font-tile wide ${value === 'same' ? 'is-on' : ''}`} onClick={() => onPick('same')}>
          <span class="font-tile-name">Igual que el texto</span>
        </button>
      )}
      {ORDER.map((cat) => {
        const list = fonts.filter((f) => f.category === cat)
        if (!list.length && cat !== 'custom') return null
        return (
          <Section key={cat} title={CATEGORY_LABEL[cat]}>
            <div class="font-grid">
              {list.map((f: FontDef) => (
                <div class="font-tile-wrap" key={f.id}>
                  <button type="button" class={`font-tile ${value === f.id ? 'is-on' : ''}`} style={{ fontFamily: f.stack }} onClick={() => onPick(f.id)}>
                    <span class="font-tile-aa">Aa</span>
                    <span class="font-tile-name">{f.name}</span>
                    {f.note && <span class="font-tile-note">{f.note}</span>}
                  </button>
                  {cat === 'custom' && (
                    <button type="button" class="font-del" aria-label={`Eliminar ${f.name}`} onClick={() => void removeCustomFont(f.id)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {cat === 'custom' && (
                <button type="button" class="font-tile add" onClick={pickFile}>
                  <Plus size={20} />
                  <span class="font-tile-name">Añadir fuente (.ttf, .otf, .woff2)</span>
                </button>
              )}
            </div>
          </Section>
        )
      })}
    </div>
  )
}

const fontName = (id: string) => (id === 'same' ? 'Igual que el texto' : (allFonts().find((f) => f.id === id)?.name ?? id))

export function TypographyPanel() {
  const t = settings.value.typo
  const [picker, setPicker] = useState<null | 'body' | 'heading'>(null)
  if (picker) {
    return (
      <FontPicker
        value={picker === 'body' ? t.font : t.headingFont}
        allowSame={picker === 'heading'}
        onBack={() => setPicker(null)}
        onPick={(id) => {
          updateTypo(picker === 'body' ? { font: id } : { headingFont: id })
          setPicker(null)
        }}
      />
    )
  }
  const presets: TypoPreset[] = [...BUILTIN_PRESETS, ...customPresets.value]
  const savePreset = () => {
    const name = prompt('Nombre del estilo', 'Mi estilo')
    if (!name) return
    void saveCustomPresets([...customPresets.value, { id: `p-${uid()}`, name, typo: { ...t }, custom: true }])
  }
  const em = (v: number) => `${v.toFixed(2).replace('.', ',')} em`
  return (
    <div class="typo-panel">
      <Section title="Estilos rápidos" action={<button type="button" class="link-btn" onClick={savePreset}><Save size={16} /> Guardar actual</button>}>
        <div class="chips">
          {presets.map((p) => (
            <span class="chip-wrap" key={p.id}>
              <button type="button" class="chip" onClick={() => updateTypo(p.typo)}>
                {p.name}
              </button>
              {p.custom && (
                <button type="button" class="chip-x" aria-label={`Borrar ${p.name}`} onClick={() => void saveCustomPresets(customPresets.value.filter((x) => x.id !== p.id))}>
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Fuente">
        <button type="button" class="row nav-row" onClick={() => setPicker('body')}>
          <span class="row-label">Texto</span>
          <span class="row-value" style={{ fontFamily: 'var(--rfont)' }}>
            {fontName(t.font)} <ChevronRight size={16} />
          </span>
        </button>
        <button type="button" class="row nav-row" onClick={() => setPicker('heading')}>
          <span class="row-label">Títulos</span>
          <span class="row-value" style={{ fontFamily: 'var(--hfont)' }}>
            {fontName(t.headingFont)} <ChevronRight size={16} />
          </span>
        </button>
        <Slider label="Tamaño" value={t.size} min={12} max={40} step={1} format={(v) => `${v} px`} onInput={(size) => updateTypo({ size })} />
        <Slider label="Grosor" value={t.weight} min={250} max={700} step={25} onInput={(weight) => updateTypo({ weight })} hint="Funciona mejor con fuentes variables (casi todas las incluidas)" />
      </Section>

      <Section title="Espaciado">
        <Slider label="Interlineado" value={t.lineHeight} min={1} max={2.4} step={0.05} format={(v) => v.toFixed(2).replace('.', ',')} onInput={(lineHeight) => updateTypo({ lineHeight })} />
        <Slider label="Entre párrafos" value={t.paraSpacing} min={0} max={2.5} step={0.1} format={em} onInput={(paraSpacing) => updateTypo({ paraSpacing })} />
        <Slider label="Sangría" value={t.indent} min={0} max={3} step={0.1} format={em} onInput={(indent) => updateTypo({ indent })} />
        <Slider label="Entre letras" value={t.letterSpacing} min={-0.05} max={0.2} step={0.005} format={em} onInput={(letterSpacing) => updateTypo({ letterSpacing })} />
        <Slider label="Entre palabras" value={t.wordSpacing} min={0} max={0.6} step={0.02} format={em} onInput={(wordSpacing) => updateTypo({ wordSpacing })} />
      </Section>

      <Section title="Página">
        <Slider label="Márgenes laterales" value={t.margin} min={0} max={96} step={2} format={(v) => `${v} px`} onInput={(margin) => updateTypo({ margin })} />
        <Slider label="Ancho máximo de línea" value={t.maxWidth} min={400} max={1200} step={20} format={(v) => `${v} px`} onInput={(maxWidth) => updateTypo({ maxWidth })} hint="En pantallas anchas: unas 65-75 letras por línea es lo más cómodo" />
        <div class="row">
          <span class="row-label">Alineación</span>
          <Segmented
            label="Alineación"
            value={t.align}
            onChange={(align) => updateTypo({ align })}
            options={[
              { value: 'start', label: <AlignLeft size={16} /> },
              { value: 'justify', label: <AlignJustify size={16} /> },
            ]}
          />
        </div>
        <Toggle label="Separación silábica" hint="Mejora el texto justificado" checked={t.hyphens} onChange={(hyphens) => updateTypo({ hyphens })} />
      </Section>

      <Section title="Estilos del libro">
        <Toggle label="Usar las fuentes del libro" checked={t.publisherFonts} onChange={(publisherFonts) => updateTypo({ publisherFonts })} />
        <Toggle label="Usar los colores del libro" checked={t.publisherColors} onChange={(publisherColors) => updateTypo({ publisherColors })} />
        <Toggle label="Usar el espaciado del libro" hint="Interlineado, márgenes y sangrías originales" checked={t.publisherSpacing} onChange={(publisherSpacing) => updateTypo({ publisherSpacing })} />
        <Toggle label="Atenuar imágenes en temas oscuros" checked={t.dimImages} onChange={(dimImages) => updateTypo({ dimImages })} />
      </Section>

      <button type="button" class="btn btn-block" onClick={() => updateTypo(DEFAULT_TYPO)}>
        <RotateCcw size={16} /> Restablecer tipografía
      </button>
    </div>
  )
}
