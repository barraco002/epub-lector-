import { useMemo, useState } from 'preact/hooks'
import { ArrowLeft, Lock } from 'lucide-preact'
import { go } from '../lib/router'
import { goalMs, goalProgress, history, level, profile, readingWpm, streak, today } from '../lib/game/game'
import { ACHIEVEMENTS, type AchievementCtx } from '../lib/game/achievements'
import { levelTitle } from '../lib/game/levels'
import { library } from '../lib/library'
import { settings, update } from '../lib/settings'
import { addDays, dayKey, fmtDuration, fmtNum } from '../lib/util'
import { Bar, IconButton, Ring, Slider } from './ui'

const WEEKS = 18
const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const fmtDay = (key: string) => new Date(key + 'T12:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })

/** Escala secuencial de un solo tono: del fondo al acento del tema (5 pasos). */
const LEVEL_FILL = ['var(--surface-3)', 'color-mix(in srgb, var(--accent) 30%, var(--surface))', 'color-mix(in srgb, var(--accent) 55%, var(--surface))', 'color-mix(in srgb, var(--accent) 80%, var(--surface))', 'var(--accent)']

function levelOf(ms: number, goal: number) {
  if (ms <= 0) return 0
  const r = ms / goal
  return r < 0.25 ? 1 : r < 0.6 ? 2 : r < 1 ? 3 : 4
}

function Heatmap({ onPick }: { onPick: (text: string) => void }) {
  const h = history.value
  const goal = goalMs.value
  // Columna = semana (lunes a domingo); la última columna contiene hoy
  const todayKey = today.value.date
  const dow = (new Date(todayKey + 'T12:00').getDay() + 6) % 7
  const start = addDays(todayKey, -(WEEKS - 1) * 7 - dow)
  const cell = 14
  const gap = 2
  const cells = []
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const key = addDays(start, w * 7 + d)
      if (key > todayKey) continue
      const ms = key === todayKey ? today.value.ms : (h.get(key)?.ms ?? 0)
      const label = `${fmtDay(key)}: ${ms ? fmtDuration(ms) : 'sin lectura'}`
      cells.push(
        <rect
          key={key}
          x={20 + w * (cell + gap)}
          y={d * (cell + gap)}
          width={cell}
          height={cell}
          rx={3}
          fill={LEVEL_FILL[levelOf(ms, goal)]}
          class="hm-cell"
          aria-label={label}
          onClick={() => onPick(label)}
          onMouseEnter={() => onPick(label)}
        >
          <title>{label}</title>
        </rect>,
      )
    }
  }
  const width = 20 + WEEKS * (cell + gap)
  return (
    <div class="heatmap">
      <svg viewBox={`0 0 ${width} ${7 * (cell + gap)}`} role="img" aria-label={`Minutos leídos por día, últimas ${WEEKS} semanas`}>
        {DOW.map((d, i) =>
          i % 2 === 0 ? (
            <text key={d} x={0} y={i * (cell + gap) + cell - 3} class="axis-text">
              {d}
            </text>
          ) : null,
        )}
        {cells}
      </svg>
      <div class="hm-legend" aria-hidden="true">
        <span>Menos</span>
        {LEVEL_FILL.map((f) => (
          <i style={{ background: f }} />
        ))}
        <span>Meta cumplida</span>
      </div>
    </div>
  )
}

function DailyBars({ onPick }: { onPick: (text: string) => void }) {
  const h = history.value
  const goalMin = goalMs.value / 60000
  const todayKey = today.value.date
  const data = Array.from({ length: 14 }, (_, i) => {
    const key = addDays(todayKey, i - 13)
    const ms = key === todayKey ? today.value.ms : (h.get(key)?.ms ?? 0)
    return { key, min: ms / 60000 }
  })
  const max = Math.max(goalMin * 1.25, ...data.map((d) => d.min), 1)
  const W = 320
  const H = 140
  const base = H - 18
  const slot = (W - 28) / data.length
  const bw = Math.min(16, slot - 4)
  const y = (v: number) => base - (v / max) * (base - 8)
  const goalY = y(goalMin)
  return (
    <div class="bars">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Minutos leídos en los últimos 14 días">
        <line x1={24} x2={W} y1={base} y2={base} class="axis-line" />
        <line x1={24} x2={W} y1={goalY} y2={goalY} class="goal-line" />
        <text x={0} y={goalY + 4} class="axis-text">
          meta
        </text>
        {data.map((d, i) => {
          const x = 28 + i * slot + (slot - bw) / 2
          const top = y(d.min)
          const hgt = base - top
          const r = Math.min(4, hgt)
          const label = `${fmtDay(d.key)}: ${Math.round(d.min)} min`
          return (
            <g key={d.key} class="bar-g" onClick={() => onPick(label)} onMouseEnter={() => onPick(label)}>
              <rect x={x - (slot - bw) / 2} y={0} width={slot} height={base} fill="transparent" />
              {hgt > 0.5 && (
                <path
                  d={`M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z`}
                  fill={d.min >= goalMin ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 55%, var(--surface))'}
                />
              )}
              {i % 2 === 1 && (
                <text x={x + bw / 2} y={H - 4} class="axis-text" text-anchor="middle">
                  {new Date(d.key + 'T12:00').getDate()}
                </text>
              )}
              <title>{label}</title>
            </g>
          )
        })}
      </svg>
      <table class="sr-only">
        <caption>Minutos leídos por día</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th>{fmtDay(d.key)}</th>
              <td>{Math.round(d.min)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div class="tile card">
      <span class="eyebrow">{label}</span>
      <strong class="tile-value">{value}</strong>
      {sub && <span class="muted small">{sub}</span>}
    </div>
  )
}

export function Stats() {
  const p = profile.value
  const lv = level.value
  const [readout, setReadout] = useState<string>('Toca un día para ver el detalle')
  const ctx: AchievementCtx = { p, today: today.value, weekendBoth: false, libraryCount: library.value.length }
  const unlocked = ACHIEVEMENTS.filter((a) => p.achievements[a.id])
  const weekMs = useMemo(() => {
    let ms = 0
    for (let i = 0; i < 7; i++) {
      const k = addDays(dayKey(), -i)
      ms += k === today.value.date ? today.value.ms : (history.value.get(k)?.ms ?? 0)
    }
    return ms
  }, [history.value, today.value])
  return (
    <div class="page stats-page">
      <header class="topbar">
        <IconButton label="Volver" onClick={() => go({ name: 'library' })}>
          <ArrowLeft size={22} />
        </IconButton>
        <h1 class="page-title">Progreso</h1>
        <span />
      </header>
      <main class="page-main">
        <section class="level-card card">
          <div class="level-num">
            <span class="eyebrow">Nivel</span>
            <strong>{lv.level}</strong>
          </div>
          <div class="level-info">
            <h2>{levelTitle(lv.level)}</h2>
            <Bar value={lv.progress} />
            <span class="muted small">
              {fmtNum(p.xp - lv.base)} / {fmtNum(lv.next - lv.base)} XP para el nivel {lv.level + 1} · {fmtNum(p.xp)} XP en total
            </span>
          </div>
        </section>

        <section class="tiles">
          <div class="tile card tile-goal">
            <Ring value={goalProgress.value} size={56} stroke={6}>
              <span class="ring-num">{Math.floor(today.value.ms / 60000)}</span>
            </Ring>
            <div>
              <span class="eyebrow">Hoy</span>
              <strong class="tile-value">{goalProgress.value >= 1 ? 'Meta ✓' : `${settings.value.dailyGoalMin} min`}</strong>
              <span class="muted small">{fmtNum(today.value.words)} palabras</span>
            </div>
          </div>
          <Tile label="Racha" value={`🔥 ${streak.value}`} sub={`Mejor: ${p.streak.best} · 🧊 ${p.streak.freezes} comodín${p.streak.freezes === 1 ? '' : 'es'}`} />
          <Tile label="Esta semana" value={fmtDuration(weekMs, true)} sub="últimos 7 días" />
          <Tile label="Tiempo total" value={fmtDuration(p.totals.ms, true)} sub={`${fmtNum(p.totals.words)} palabras`} />
          <Tile label="Libros terminados" value={String(p.totals.booksFinished)} sub={`${library.value.length} en la biblioteca`} />
          <Tile label="Pomodoros" value={`🍅 ${p.totals.pomodoros}`} sub={`hoy: ${today.value.pomodoros}`} />
          <Tile label="Velocidad" value={`${readingWpm.value} ppm`} sub="palabras por minuto" />
        </section>

        <section class="card chart-card">
          <div class="chart-head">
            <h2>Últimas {WEEKS} semanas</h2>
            <span class="muted small" aria-live="polite">
              {readout}
            </span>
          </div>
          <Heatmap onPick={setReadout} />
        </section>

        <section class="card chart-card">
          <div class="chart-head">
            <h2>Minutos por día</h2>
            <span class="muted small">Meta: {settings.value.dailyGoalMin} min</span>
          </div>
          <DailyBars onPick={setReadout} />
          <Slider label="Meta diaria" value={settings.value.dailyGoalMin} min={5} max={180} step={5} format={(v) => `${v} min`} onInput={(dailyGoalMin) => update({ dailyGoalMin })} />
        </section>

        <section class="achievements">
          <div class="shelf-head">
            <h2>Logros</h2>
            <span class="muted small">
              {unlocked.length} de {ACHIEVEMENTS.length}
            </span>
          </div>
          <div class="ach-grid">
            {ACHIEVEMENTS.map((a) => {
              const got = p.achievements[a.id]
              const prog = got ? 1 : (a.progress?.(ctx) ?? 0)
              return (
                <div class={`ach card ${got ? 'is-got' : ''}`} key={a.id}>
                  <span class="ach-icon" aria-hidden="true">
                    {got ? a.icon : <Lock size={18} />}
                  </span>
                  <div class="ach-text">
                    <strong>{a.name}</strong>
                    <span class="muted small">{a.desc}</span>
                    {!got && a.progress && <Bar value={prog} thin />}
                    {got && <span class="muted small">+{a.xp} XP · {new Date(got).toLocaleDateString('es')}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}
