import { Pause, Play, RotateCcw, SkipForward, Volume2 } from 'lucide-preact'
import { PHASE_LABEL, pomo, remainingMs, reset, skip, start, syncDurations, toggle, type Phase } from '../../../lib/pomodoro'
import { playChime } from '../../../lib/audio/chime'
import { settings, updatePomo, type Settings } from '../../../lib/settings'
import { today } from '../../../lib/game/game'
import { fmtClock } from '../../../lib/util'
import { Ring, Section, Segmented, Slider, Toggle } from '../../ui'
import { useTicker } from '../Chrome'

export function PomodoroPanel() {
  const st = pomo.value
  const p = settings.value.pomo
  useTicker(1000, st.running)
  const total = (st.phase === 'focus' ? p.focus : st.phase === 'short' ? p.short : p.long) * 60_000
  const rem = remainingMs()
  const setP = (patch: Partial<Settings['pomo']>) => {
    updatePomo(patch)
    syncDurations()
  }
  return (
    <div class="pomo-panel">
      <div class="pomo-hero">
        <Ring value={1 - rem / total} size={168} stroke={10} color={st.phase === 'focus' ? 'var(--accent)' : 'var(--link)'}>
          <span class="pomo-time">{fmtClock(rem)}</span>
          <span class="pomo-phase">{PHASE_LABEL[st.phase]}</span>
        </Ring>
        <div class="pomo-dots" aria-label={`${st.cycle % p.every} de ${p.every} pomodoros del ciclo`}>
          {Array.from({ length: p.every }, (_, i) => (
            <i class={i < st.cycle % p.every || (st.cycle > 0 && st.cycle % p.every === 0 && st.phase === 'long') ? 'on' : ''} />
          ))}
        </div>
        <div class="pomo-controls">
          <button type="button" class="icon-btn lg" aria-label="Reiniciar" onClick={reset}>
            <RotateCcw size={20} />
          </button>
          <button type="button" class="play-btn" aria-label={st.running ? 'Pausar' : 'Empezar'} onClick={toggle}>
            {st.running ? <Pause size={28} /> : <Play size={28} />}
          </button>
          <button type="button" class="icon-btn lg" aria-label="Saltar fase" onClick={skip}>
            <SkipForward size={20} />
          </button>
        </div>
        <Segmented<Phase>
          label="Fase"
          value={st.phase}
          onChange={(ph) => start(ph)}
          options={[
            { value: 'focus', label: 'Enfoque' },
            { value: 'short', label: 'Corto' },
            { value: 'long', label: 'Largo' },
          ]}
        />
        <p class="muted small">Hoy: {today.value.pomodoros} 🍅 · cada pomodoro da +25 XP</p>
      </div>

      <Section title="Duraciones">
        <Slider label="Enfoque" value={p.focus} min={5} max={90} step={5} format={(v) => `${v} min`} onInput={(focus) => setP({ focus })} />
        <Slider label="Descanso corto" value={p.short} min={1} max={30} step={1} format={(v) => `${v} min`} onInput={(short) => setP({ short })} />
        <Slider label="Descanso largo" value={p.long} min={5} max={60} step={5} format={(v) => `${v} min`} onInput={(long) => setP({ long })} />
        <Slider label="Descanso largo cada" value={p.every} min={2} max={8} step={1} format={(v) => `${v} pomodoros`} onInput={(every) => setP({ every })} />
      </Section>

      <Section title="Comportamiento">
        <Toggle label="Empezar descansos automáticamente" checked={p.autoBreak} onChange={(autoBreak) => setP({ autoBreak })} />
        <Toggle label="Empezar enfoque automáticamente" checked={p.autoFocus} onChange={(autoFocus) => setP({ autoFocus })} />
        <Toggle label="Pantalla de descanso" hint="Recordatorio para descansar la vista (regla 20-20-20)" checked={p.breakOverlay} onChange={(breakOverlay) => setP({ breakOverlay })} />
        <Toggle label="Pausar autoscroll en descansos" checked={p.pauseAutoscrollOnBreak} onChange={(pauseAutoscrollOnBreak) => setP({ pauseAutoscrollOnBreak })} />
        <div class="row">
          <span class="row-label">Sonido de aviso</span>
          <span class="row-inline">
            <select class="select" value={p.chime} onChange={(e) => setP({ chime: (e.target as HTMLSelectElement).value as Settings['pomo']['chime'] })}>
              <option value="campana">Campana</option>
              <option value="cuenco">Cuenco</option>
              <option value="madera">Madera</option>
              <option value="ninguno">Ninguno</option>
            </select>
            <button type="button" class="icon-btn" aria-label="Probar sonido" onClick={() => playChime(p.chime, 2)}>
              <Volume2 size={18} />
            </button>
          </span>
        </div>
      </Section>
    </div>
  )
}
