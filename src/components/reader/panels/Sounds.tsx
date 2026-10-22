import { Pause, Play, Square } from 'lucide-preact'
import { applyPreset, playing, PRESETS, setVolume, stopAll, toggle, resetSleepTimer } from '../../../lib/audio/ambient'
import { RECIPES } from '../../../lib/audio/generators'
import { settings, updatePomo, updateSound } from '../../../lib/settings'
import { isNative } from '../../../lib/native'
import { Section, Slider, Toggle } from '../../ui'

export function SoundPanel() {
  const s = settings.value.sound
  const anyActive = Object.values(s.volumes).some((v) => v > 0)
  return (
    <div class="sound-panel">
      <div class="sound-hero">
        <button type="button" class="play-btn" onClick={() => (anyActive ? toggle() : applyPreset(PRESETS[0]))} aria-label={playing.value ? 'Pausar sonidos' : 'Reproducir sonidos'}>
          {playing.value ? <Pause size={26} /> : <Play size={26} />}
        </button>
        <div class="sound-hero-text">
          <strong>{playing.value ? 'Sonando' : anyActive ? 'En pausa' : 'Elige un ambiente'}</strong>
          <span class="muted small">Sintetizados en el dispositivo · sin conexión</span>
        </div>
        {anyActive && (
          <button type="button" class="icon-btn" aria-label="Detener y limpiar mezcla" title="Detener y limpiar" onClick={stopAll}>
            <Square size={18} />
          </button>
        )}
      </div>
      <Slider label="Volumen general" value={s.master} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onInput={(master) => updateSound({ master })} />

      <Section title="Ambientes">
        <div class="chips">
          {PRESETS.map((p) => (
            <button type="button" class="chip" key={p.id} onClick={() => applyPreset(p)}>
              {p.icon} {p.name}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Mezcla">
        <div class="sound-list">
          {RECIPES.map((r) => {
            const v = s.volumes[r.id] ?? 0
            return (
              <div class={`sound-row ${v > 0 ? 'is-on' : ''}`} key={r.id}>
                <button type="button" class="sound-icon" aria-label={`${v > 0 ? 'Quitar' : 'Añadir'} ${r.name}`} onClick={() => setVolume(r.id, v > 0 ? 0 : 0.5)}>
                  {r.icon}
                </button>
                <span class="sound-name">{r.name}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={v}
                  aria-label={`Volumen de ${r.name}`}
                  style={{ '--pct': `${v * 100}%` }}
                  onInput={(e) => setVolume(r.id, +(e.target as HTMLInputElement).value)}
                />
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Opciones">
        <div class="row">
          <span class="row-label">Apagar tras</span>
          <select
            class="select"
            value={s.sleepMin}
            onChange={(e) => {
              updateSound({ sleepMin: +(e.target as HTMLSelectElement).value })
              resetSleepTimer()
            }}
          >
            {[0, 15, 30, 45, 60, 90, 120].map((m) => (
              <option value={m}>{m ? `${m} min` : 'Nunca'}</option>
            ))}
          </select>
        </div>
        {isNative() && (
          <Toggle
            label="Seguir sonando con la pantalla apagada"
            hint="Con controles en la notificación; se pausa solo en llamadas o al quitar los auriculares"
            checked={s.screenOff}
            onChange={(screenOff) => updateSound({ screenOff })}
          />
        )}
        {!(isNative() && s.screenOff) && (
          <Toggle label="Pausar al salir de la app" hint="Ahorra batería con la pantalla apagada" checked={s.pauseOnHide} onChange={(pauseOnHide) => updateSound({ pauseOnHide })} />
        )}
        <Toggle label="Solo durante el enfoque" hint="Silencio en los descansos del pomodoro" checked={settings.value.pomo.soundsOnlyInFocus} onChange={(soundsOnlyInFocus) => updatePomo({ soundsOnlyInFocus })} />
      </Section>
    </div>
  )
}
