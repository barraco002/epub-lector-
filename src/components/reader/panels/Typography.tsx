import { useState } from 'preact/hooks'
import { AlignJustify, AlignLeft, ChevronLeft, ChevronRight, Plus, RotateCcw, Save, Trash2 } from 'lucide-preact'
import { BUILTIN_PRESETS, customPresets, DEFAULT_TYPO, saveCustomPresets, settings, updateTypo, type TypoPreset } from '../../../lib/settings'
import { addCustomFont, allFonts, CATEGORY_LABEL, removeCustomFont, type FontCategory, type FontDef } from '../../../lib/fonts'
import { track } from '../../../lib/game/game'
import { error, info } from '../../../lib/toasts'
import { uid } from '../../../lib/util'
import { locale, shown, t } from '../../../lib/i18n'
import { Section, Segmented, Slider, Toggle } from '../../ui'

const ORDER: FontCategory[] = ['serif', 'sans', 'access', 'display', 'mono', 'system', 'custom']

// Dos decimales según el idioma: 1,60 en español y 1.60 en inglés.
const dec2 = (v: number) => v.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
        info(t('Fuente añadida'), def.name)
      } catch (e) {
        error(t('No se pudo añadir la fuente'), e instanceof Error ? e.message : undefined)
      }
    }
    input.click()
  }
  return (
    <div class="font-picker">
      <button type="button" class="link-btn" onClick={onBack}>
        <ChevronLeft size={18} /> {t('Volver')}
      </button>
      {allowSame && (
        <button type="button" class={`font-tile wide ${value === 'same' ? 'is-on' : ''}`} onClick={() => onPick('same')}>
          <span class="font-tile-name">{t('Igual que el texto')}</span>
        </button>
      )}
      {ORDER.map((cat) => {
        const list = fonts.filter((f) => f.category === cat)
        if (!list.length && cat !== 'custom') return null
        return (
          <Section key={cat} title={t(CATEGORY_LABEL[cat])}>
            <div class="font-grid">
              {list.map((f: FontDef) => (
                <div class="font-tile-wrap" key={f.id}>
                  <button type="button" class={`font-tile ${value === f.id ? 'is-on' : ''}`} style={{ fontFamily: f.stack }} onClick={() => onPick(f.id)}>
                    <span class="font-tile-aa">Aa</span>
                    <span class="font-tile-name">{shown(f.name, cat === 'custom')}</span>
                    {f.note && <span class="font-tile-note">{t(f.note)}</span>}
                  </button>
                  {cat === 'custom' && (
                    <button type="button" class="font-del" aria-label={t('Eliminar {name}', { name: shown(f.name, cat === 'custom') })} onClick={() => void removeCustomFont(f.id)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {cat === 'custom' && (
                <button type="button" class="font-tile add" onClick={pickFile}>
                  <Plus size={20} />
                  <span class="font-tile-name">{t('Añadir fuente (.ttf, .otf, .woff2)')}</span>
                </button>
              )}
            </div>
          </Section>
        )
      })}
    </div>
  )
}

const fontName = (id: string) => (id === 'same' ? t('Igual que el texto') : t(allFonts().find((f) => f.id === id)?.name ?? id))

export function TypographyPanel() {
  const typo = settings.value.typo
  const [picker, setPicker] = useState<null | 'body' | 'heading'>(null)
  if (picker) {
    return (
      <FontPicker
        value={picker === 'body' ? typo.font : typo.headingFont}
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
    const name = prompt(t('Nombre del estilo'), t('Mi estilo'))
    if (!name) return
    void saveCustomPresets([...customPresets.value, { id: `p-${uid()}`, name, typo: { ...typo }, custom: true }])
  }
  const em = (v: number) => `${dec2(v)} em`
  return (
    <div class="typo-panel">
      <Section title={t('Estilos rápidos')} action={<button type="button" class="link-btn" onClick={savePreset}><Save size={16} /> {t('Guardar actual')}</button>}>
        <div class="chips">
          {presets.map((p) => (
            <span class="chip-wrap" key={p.id}>
              <button type="button" class="chip" onClick={() => updateTypo(p.typo)}>
                {shown(p.name, p.custom)}
              </button>
              {p.custom && (
                <button type="button" class="chip-x" aria-label={t('Borrar {name}', { name: shown(p.name, p.custom) })} onClick={() => void saveCustomPresets(customPresets.value.filter((x) => x.id !== p.id))}>
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      </Section>

      <Section title={t('Fuente')}>
        <button type="button" class="row nav-row" onClick={() => setPicker('body')}>
          <span class="row-label">{t('Texto')}</span>
          <span class="row-value" style={{ fontFamily: 'var(--rfont)' }}>
            {fontName(typo.font)} <ChevronRight size={16} />
          </span>
        </button>
        <button type="button" class="row nav-row" onClick={() => setPicker('heading')}>
          <span class="row-label">{t('Títulos')}</span>
          <span class="row-value" style={{ fontFamily: 'var(--hfont)' }}>
            {fontName(typo.headingFont)} <ChevronRight size={16} />
          </span>
        </button>
        <Slider label={t('Tamaño')} value={typo.size} min={12} max={40} step={1} format={(v) => `${v} px`} onInput={(size) => updateTypo({ size })} />
        <Toggle label={t('Mismo tamaño al cambiar de fuente')} hint={t('Iguala la altura de las minúsculas entre fuentes')} checked={typo.normalizeSize !== false} onChange={(normalizeSize) => updateTypo({ normalizeSize })} />
        <Slider label={t('Grosor')} value={typo.weight} min={250} max={700} step={25} onInput={(weight) => updateTypo({ weight })} hint={t('Funciona mejor con fuentes variables (casi todas las incluidas)')} />
      </Section>

      <Section title={t('Espaciado')}>
        <Slider label={t('Interlineado')} value={typo.lineHeight} min={1} max={2.4} step={0.05} format={(v) => dec2(v)} onInput={(lineHeight) => updateTypo({ lineHeight })} />
        <Slider label={t('Entre párrafos')} value={typo.paraSpacing} min={0} max={2.5} step={0.1} format={em} onInput={(paraSpacing) => updateTypo({ paraSpacing })} />
        <Slider label={t('Sangría')} value={typo.indent} min={0} max={3} step={0.1} format={em} onInput={(indent) => updateTypo({ indent })} />
        <Slider label={t('Entre letras')} value={typo.letterSpacing} min={-0.05} max={0.2} step={0.005} format={em} onInput={(letterSpacing) => updateTypo({ letterSpacing })} />
        <Slider label={t('Entre palabras')} value={typo.wordSpacing} min={0} max={0.6} step={0.02} format={em} onInput={(wordSpacing) => updateTypo({ wordSpacing })} />
      </Section>

      <Section title={t('Página')}>
        <Slider label={t('Márgenes laterales')} value={typo.margin} min={0} max={96} step={2} format={(v) => `${v} px`} onInput={(margin) => updateTypo({ margin })} />
        <Slider label={t('Aire arriba y abajo')} value={typo.paddingY ?? 36} min={0} max={140} step={4} format={(v) => `${v} px`} onInput={(paddingY) => updateTypo({ paddingY })} />
        <Slider label={t('Letras por línea')} value={typo.measure ?? 70} min={40} max={100} step={2} format={(v) => `${v}`} onInput={(measure) => updateTypo({ measure })} hint={t('Lo más cómodo son unas 60-75. En el móvil manda el ancho de la pantalla.')} />
        <div class="row">
          <span class="row-label">{t('Alineación')}</span>
          <Segmented
            label={t('Alineación')}
            value={typo.align}
            onChange={(align) => updateTypo({ align })}
            options={[
              { value: 'start', label: <AlignLeft size={16} /> },
              { value: 'justify', label: <AlignJustify size={16} /> },
            ]}
          />
        </div>
        <Toggle label={t('Separación silábica')} hint={t('Mejora el texto justificado')} checked={typo.hyphens} onChange={(hyphens) => updateTypo({ hyphens })} />
      </Section>

      <Section title={t('Estilos del libro')}>
        <Toggle label={t('Usar las fuentes del libro')} checked={typo.publisherFonts} onChange={(publisherFonts) => updateTypo({ publisherFonts })} />
        <Toggle label={t('Usar los colores del libro')} checked={typo.publisherColors} onChange={(publisherColors) => updateTypo({ publisherColors })} />
        <Toggle label={t('Usar el espaciado del libro')} hint={t('Interlineado, márgenes y sangrías originales')} checked={typo.publisherSpacing} onChange={(publisherSpacing) => updateTypo({ publisherSpacing })} />
        <Toggle label={t('Atenuar imágenes en temas oscuros')} checked={typo.dimImages} onChange={(dimImages) => updateTypo({ dimImages })} />
      </Section>

      <button type="button" class="btn btn-block" onClick={() => updateTypo(DEFAULT_TYPO)}>
        <RotateCcw size={16} /> {t('Restablecer tipografía')}
      </button>
    </div>
  )
}
