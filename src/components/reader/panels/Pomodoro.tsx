import { Pause, Play, RotateCcw, SkipForward, Volume2 } from 'lucide-preact'
import { PHASE_LABEL, pomo, remainingMs, reset, skip, start, syncDurations, toggle, type Phase } from '../../../lib/pomodoro'
import { playChime } from '../../../lib/audio/chime'
import { settings, updatePomo, type Settings } from '../../../lib/settings'
import { today } from '../../../lib/game/game'
import { fmtClock, fmtNum } from '../../../lib/util'
import { t } from '../../../lib/i18n'
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
          <span class="pomo-phase">{t(PHASE_LABEL[st.phase])}</span>
        </Ring>
        <div class="pomo-dots" aria-label={t('{n} de {total} pomodoros del ciclo', { n: st.cycle % p.every, total: p.every })}>
          {Array.from({ length: p.every }, (_, i) => (
            <i class={i < st.cycle % p.every || (st.cycle > 0 && st.cycle % p.every === 0 && st.phase === 'long') ? 'on' : ''} />
          ))}
        </div>
        <div class="pomo-controls">
          <button type="button" class="icon-btn lg" aria-label={t('Reiniciar')} onClick={reset}>
            <RotateCcw size={20} />
          </button>
          <button type="button" class="play-btn" aria-label={st.running ? t('Pausar') : t('Empezar')} onClick={toggle}>
            {st.running ? <Pause size={28} /> : <Play size={28} />}
          </button>
          <button type="button" class="icon-btn lg" aria-label={t('Saltar fase')} onClick={skip}>
            <SkipForward size={20} />
          </button>
        </div>
        <Segmented<Phase>
          label={t('Fase')}
          value={st.phase}
          onChange={(ph) => start(ph)}
          options={[
            { value: 'focus', label: t('Enfoque') },
            { value: 'short', label: t('Corto') },
            { value: 'long', label: t('Largo') },
          ]}
        />
        <p class="muted small">{t('Hoy: {n} 🍅 · cada pomodoro da +25 XP', { n: fmtNum(today.value.pomodoros) })}</p>
      </div>

      <Section title={t('Duraciones')}>
        <Slider label={t('Enfoque')} value={p.focus} min={5} max={90} step={5} format={(v) => `${v} min`} onInput={(focus) => setP({ focus })} />
        <Slider label={t('Descanso corto')} value={p.short} min={1} max={30} step={1} format={(v) => `${v} min`} onInput={(short) => setP({ short })} />
        <Slider label={t('Descanso largo')} value={p.long} min={5} max={60} step={5} format={(v) => `${v} min`} onInput={(long) => setP({ long })} />
        <Slider label={t('Descanso largo cada')} value={p.every} min={2} max={8} step={1} format={(v) => t('{n} pomodoros', { n: v })} onInput={(every) => setP({ every })} />
      </Section>

      <Section title={t('Comportamiento')}>
        <Toggle label={t('Empezar descansos automáticamente')} checked={p.autoBreak} onChange={(autoBreak) => setP({ autoBreak })} />
        <Toggle label={t('Empezar enfoque automáticamente')} checked={p.autoFocus} onChange={(autoFocus) => setP({ autoFocus })} />
        <Toggle label={t('Pantalla de descanso')} hint={t('Recordatorio para descansar la vista (regla 20-20-20)')} checked={p.breakOverlay} onChange={(breakOverlay) => setP({ breakOverlay })} />
        <Toggle label={t('Pausar autoscroll en descansos')} checked={p.pauseAutoscrollOnBreak} onChange={(pauseAutoscrollOnBreak) => setP({ pauseAutoscrollOnBreak })} />
        <div class="row">
          <span class="row-label">{t('Sonido de aviso')}</span>
          <span class="row-inline">
            <select class="select" value={p.chime} onChange={(e) => setP({ chime: (e.target as HTMLSelectElement).value as Settings['pomo']['chime'] })}>
              <option value="campana">{t('Campana')}</option>
              <option value="cuenco">{t('Cuenco')}</option>
              <option value="madera">{t('Madera')}</option>
              <option value="ninguno">{t('Ninguno')}</option>
            </select>
            <button type="button" class="icon-btn" aria-label={t('Probar sonido')} onClick={() => playChime(p.chime, 2)}>
              <Volume2 size={18} />
            </button>
          </span>
        </div>
      </Section>
    </div>
  )
}
