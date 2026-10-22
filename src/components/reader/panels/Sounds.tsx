import { Pause, Play, Square } from 'lucide-preact'
import { applyPreset, playing, PRESETS, setVolume, stopAll, toggle, resetSleepTimer } from '../../../lib/audio/ambient'
import { RECIPES } from '../../../lib/audio/generators'
import { settings, updatePomo, updateSound } from '../../../lib/settings'
import { isNative } from '../../../lib/native'
import { t } from '../../../lib/i18n'
import { Section, Slider, Toggle } from '../../ui'

export function SoundPanel() {
  const s = settings.value.sound
  const anyActive = Object.values(s.volumes).some((v) => v > 0)
  return (
    <div class="sound-panel">
      <div class="sound-hero">
        <button type="button" class="play-btn" onClick={() => (anyActive ? toggle() : applyPreset(PRESETS[0]))} aria-label={playing.value ? t('Pausar sonidos') : t('Reproducir sonidos')}>
          {playing.value ? <Pause size={26} /> : <Play size={26} />}
        </button>
        <div class="sound-hero-text">
          <strong>{playing.value ? t('Sonando') : anyActive ? t('En pausa') : t('Elige un ambiente')}</strong>
          <span class="muted small">{t('Sintetizados en el dispositivo · sin conexión')}</span>
        </div>
        {anyActive && (
          <button type="button" class="icon-btn" aria-label={t('Detener y limpiar mezcla')} title={t('Detener y limpiar')} onClick={stopAll}>
            <Square size={18} />
          </button>
        )}
      </div>
      <Slider label={t('Volumen general')} value={s.master} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onInput={(master) => updateSound({ master })} />

      <Section title={t('Ambientes')}>
        <div class="chips">
          {PRESETS.map((p) => (
            <button type="button" class="chip" key={p.id} onClick={() => applyPreset(p)}>
              {p.icon} {t(p.name)}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('Mezcla')}>
        <div class="sound-list">
          {RECIPES.map((r) => {
            const v = s.volumes[r.id] ?? 0
            return (
              <div class={`sound-row ${v > 0 ? 'is-on' : ''}`} key={r.id}>
                <button type="button" class="sound-icon" aria-label={t(v > 0 ? 'Quitar {name}' : 'Añadir {name}', { name: t(r.name) })} onClick={() => setVolume(r.id, v > 0 ? 0 : 0.5)}>
                  {r.icon}
                </button>
                <span class="sound-name">{t(r.name)}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={v}
                  aria-label={t('Volumen de {name}', { name: t(r.name) })}
                  style={{ '--pct': `${v * 100}%` }}
                  onInput={(e) => setVolume(r.id, +(e.target as HTMLInputElement).value)}
                />
              </div>
            )
          })}
        </div>
      </Section>

      <Section title={t('Opciones')}>
        <div class="row">
          <span class="row-label">{t('Apagar tras')}</span>
          <select
            class="select"
            value={s.sleepMin}
            onChange={(e) => {
              updateSound({ sleepMin: +(e.target as HTMLSelectElement).value })
              resetSleepTimer()
            }}
          >
            {[0, 15, 30, 45, 60, 90, 120].map((m) => (
              <option value={m}>{m ? `${m} min` : t('Nunca')}</option>
            ))}
          </select>
        </div>
        {isNative() && (
          <Toggle
            label={t('Seguir sonando con la pantalla apagada')}
            hint={t('Con controles en la notificación; se pausa solo en llamadas o al quitar los auriculares')}
            checked={s.screenOff}
            onChange={(screenOff) => updateSound({ screenOff })}
          />
        )}
        {!(isNative() && s.screenOff) && (
          <Toggle label={t('Pausar al salir de la app')} hint={t('Ahorra batería con la pantalla apagada')} checked={s.pauseOnHide} onChange={(pauseOnHide) => updateSound({ pauseOnHide })} />
        )}
        <Toggle label={t('Solo durante el enfoque')} hint={t('Silencio en los descansos del pomodoro')} checked={settings.value.pomo.soundsOnlyInFocus} onChange={(soundsOnlyInFocus) => updatePomo({ soundsOnlyInFocus })} />
      </Section>
    </div>
  )
}
