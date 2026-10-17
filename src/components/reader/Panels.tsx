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

function AutoPanel() {
  const ctx = active.value!
  const s = settings.value
  const running = ctx.auto.running.value
  return (
    <div class="auto-panel">
      <button
        type="button"
        class="btn btn-primary btn-block"
        onClick={() => {
          ctx.auto.toggle()
          if (!running) panel.value = null
        }}
      >
        {running ? <Pause size={18} /> : <Play size={18} />} {running ? 'Pausar autoscroll' : 'Empezar autoscroll'}
      </button>
      <Section title="Modo">
        <Segmented
          label="Modo"
          value={s.autoMode}
          onChange={(autoMode) => {
            update({ autoMode })
            ctx.auto.restart()
          }}
          options={[
            { value: 'smooth', label: 'Continuo' },
            { value: 'screen', label: 'Por pantallas' },
          ]}
        />
        <p class="muted small">{s.autoMode === 'smooth' ? 'El texto sube despacio y sin pausa.' : 'Pasa una pantalla cada pocos segundos (gasta menos batería).'}</p>
      </Section>
      <Section title="Velocidad">
        <Slider label="Palabras por minuto" value={s.autoWpm} min={40} max={800} step={10} format={(v) => `${v} ppm`} onInput={(autoWpm) => update({ autoWpm })} />
        <button type="button" class="link-btn" onClick={() => update({ autoWpm: Math.round(readingWpm.value / 10) * 10 })}>
          Usar mi velocidad medida ({readingWpm.value} ppm)
        </button>
        <p class="muted small">Toca la pantalla para pausar. En el PC: tecla A para empezar/parar y +/− para la velocidad.</p>
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
    <Sheet title={TITLES[id]} onClose={close} scrim={!live} size={id === 'toc' || id === 'search' ? 'lg' : 'md'}>
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
