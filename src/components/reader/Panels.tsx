import { Pause, Play } from 'lucide-preact'
import { active, panel, type PanelId } from './state'
import { settings, update } from '../../lib/settings'
import { readingWpm } from '../../lib/game/game'
import { Section, Segmented, Sheet, Slider } from '../ui'
import { TypographyPanel } from './panels/Typography'
import { ThemePanel } from './panels/Themes'
import { SoundPanel } from './panels/Sounds'
import { PomodoroPanel } from './panels/Pomodoro'
import { SearchPanel, TocPanel } from './panels/Navigation'
import { t } from '../../lib/i18n'

function AutoPanel() {
  const ctx = active.value!
  const s = settings.value
  void ctx.auto.paused.value
  const running = ctx.auto.active
  return (
    <div class="auto-panel">
      <button
        type="button"
        class="btn btn-primary btn-block"
        onClick={() => {
          // Al arrancar, el lector recoge menús y paneles (ver Reader)
          if (running) ctx.auto.stop()
          else ctx.auto.start()
        }}
      >
        {running ? <Pause size={18} /> : <Play size={18} />} {running ? t('Salir del modo auto') : t('Empezar autoscroll')}
      </button>
      <Section title={t('Modo')}>
        <Segmented
          label={t('Modo')}
          value={s.autoMode}
          onChange={(autoMode) => {
            update({ autoMode })
            ctx.auto.restart()
          }}
          options={[
            { value: 'smooth', label: t('Continuo') },
            { value: 'screen', label: t('Por pantallas') },
          ]}
        />
        <p class="muted small">{s.autoMode === 'smooth' ? t('El texto sube despacio y sin pausa.') : t('Pasa una pantalla cada pocos segundos (gasta menos batería).')}</p>
      </Section>
      <Section title={t('Velocidad')}>
        <Slider label={t('Palabras por minuto')} value={s.autoWpm} min={40} max={800} step={10} format={(v) => t('{n} ppm', { n: v })} onInput={(autoWpm) => update({ autoWpm })} />
        <button type="button" class="link-btn" onClick={() => update({ autoWpm: Math.round(readingWpm.value / 10) * 10 })}>
          {t('Usar mi velocidad medida ({n} ppm)', { n: readingWpm.value })}
        </button>
        <p class="muted small">{t('Toca el texto para pausar y otra vez para seguir. En Android, las teclas de volumen cambian la velocidad. En el PC: A para empezar/salir y +/− para la velocidad.')}</p>
      </Section>
    </div>
  )
}

const TITLES: Record<Exclude<PanelId, null>, string> = {
  typo: 'Texto',
  theme: 'Tema y luz',
  sound: 'Sonidos ambientales',
  pomo: 'Pomodoro',
  toc: 'Navegación',
  search: 'Buscar',
  auto: 'Autoscroll',
}

export function Panels() {
  const id = panel.value
  if (!id) return null
  const close = () => (panel.value = null)
  // Los paneles de ajuste no oscurecen el texto: así se ve el cambio en vivo
  const live = id === 'typo' || id === 'theme' || id === 'auto'
  return (
    <Sheet title={t(TITLES[id])} onClose={close} scrim={!live} size={id === 'toc' || id === 'search' ? 'lg' : 'md'}>
      {id === 'typo' && <TypographyPanel />}
      {id === 'theme' && <ThemePanel />}
      {id === 'sound' && <SoundPanel />}
      {id === 'pomo' && <PomodoroPanel />}
      {id === 'toc' && <TocPanel />}
      {id === 'search' && <SearchPanel />}
      {id === 'auto' && <AutoPanel />}
    </Sheet>
  )
}
