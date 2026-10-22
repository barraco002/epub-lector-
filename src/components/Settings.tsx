import { useEffect, useState } from 'preact/hooks'
import { ArrowLeft, Download, Upload } from 'lucide-preact'
import { go } from '../lib/router'
import { settings, update } from '../lib/settings'
import { allFonts } from '../lib/fonts'
import { exportBackup, importBackup } from '../lib/backup'
import { error, info } from '../lib/toasts'
import { isNative } from '../lib/native'
import { IconButton, Section, Segmented, Slider, Toggle } from './ui'
import { ThemePanel } from './reader/panels/Themes'

const LANGS: [string, string][] = [
  ['es', 'Español'],
  ['en', 'Inglés'],
  ['pt', 'Portugués'],
  ['fr', 'Francés'],
  ['it', 'Italiano'],
  ['de', 'Alemán'],
  ['ca', 'Catalán'],
  ['ja', 'Japonés'],
  ['zh', 'Chino'],
]

function StorageInfo() {
  const [text, setText] = useState('')
  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => setText(`${((e.usage ?? 0) / 1048576).toFixed(1)} MB usados${e.quota ? ` de ${Math.round(e.quota / 1048576)} MB disponibles` : ''}`))
      .catch(() => {})
  }, [])
  return text ? <p class="muted small">{text}</p> : null
}

export function SettingsView() {
  const s = settings.value
  const ui = allFonts().filter((f) => f.category !== 'mono')
  const restore = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      try {
        info(await importBackup(f))
      } catch (e) {
        error('No se pudo restaurar', e instanceof Error ? e.message : undefined)
      }
    }
    input.click()
  }
  return (
    <div class="page settings-page">
      <header class="topbar">
        <IconButton label="Volver" onClick={() => go({ name: 'library' })}>
          <ArrowLeft size={22} />
        </IconButton>
        <h1 class="page-title">Ajustes</h1>
        <span />
      </header>
      <main class="page-main narrow">
        <Section title="Lectura">
          <div class="row stack">
            <span class="row-label">Zonas de toque</span>
            <Segmented
              label="Zonas de toque"
              value={s.tapZones}
              onChange={(tapZones) => update({ tapZones })}
              options={[
                { value: 'vertical', label: 'Arriba / abajo' },
                { value: 'horizontal', label: 'Izq. / der.' },
                { value: 'off', label: 'Solo menú' },
              ]}
            />
            <span class="row-hint">Tocar arriba (o a la izquierda) retrocede una pantalla, abajo (o a la derecha) avanza y el centro abre el menú.</span>
          </div>
          <Slider
            label="Desplazamiento por toque"
            value={s.tapScrollRatio}
            min={0.5}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}% de pantalla`}
            onInput={(tapScrollRatio) => update({ tapScrollRatio })}
          />
          <Toggle
            label="Pasar pantalla sin animación"
            hint="Salto instantáneo (también si el sistema pide quitar animaciones)"
            checked={s.instantPaging}
            onChange={(instantPaging) => update({ instantPaging })}
          />
          {isNative() && <Toggle label="Pasar con las teclas de volumen" checked={s.volumeKeys} onChange={(volumeKeys) => update({ volumeKeys })} />}
          {isNative() && <Toggle label="Pantalla completa al leer" checked={s.fullscreen} onChange={(fullscreen) => update({ fullscreen })} />}
          <div class="row">
            <span class="row-label">Mantener la pantalla encendida</span>
            <select class="select" value={s.keepAwakeMin} onChange={(e) => update({ keepAwakeMin: +(e.target as HTMLSelectElement).value })}>
              <option value={0}>Según el sistema</option>
              <option value={2}>2 min sin tocar</option>
              <option value={5}>5 min sin tocar</option>
              <option value={10}>10 min sin tocar</option>
              <option value={30}>30 min sin tocar</option>
            </select>
          </div>
          <Toggle label="Línea de estado" hint="Hora, batería, progreso y tiempo restante del capítulo" checked={s.showStatus} onChange={(showStatus) => update({ showStatus })} />
          <div class="row">
            <span class="row-label">Barra de progreso fina</span>
            <select
              class="select"
              value={s.progressBar}
              onChange={(e) =>
                update({
                  progressBar: (e.target as HTMLSelectElement).value as typeof s.progressBar,
                })
              }
            >
              <option value="book">Libro</option>
              <option value="chapter">Capítulo</option>
              <option value="goal">Meta diaria</option>
              <option value="none">Ninguna</option>
            </select>
          </div>
        </Section>

        <Section title="Metas y avisos">
          <div class="row stack">
            <span class="row-label">Modo de juego</span>
            <Segmented
              label="Modo de juego"
              value={s.gameMode}
              onChange={(gameMode) => update({ gameMode })}
              options={[
                { value: 'completo', label: 'Completo' },
                { value: 'discreto', label: 'Discreto' },
                { value: 'estadisticas', label: 'Solo datos' },
              ]}
            />
            <span class="row-hint">
              {s.gameMode === 'completo'
                ? 'Avisos, logros y niveles mientras lees.'
                : s.gameMode === 'discreto'
                  ? 'Nada interrumpe la lectura: logros y niveles esperan al resumen al cerrar.'
                  : 'Sin XP, niveles ni logros a la vista: solo tiempo, palabras y rachas.'}
            </span>
          </div>
          <Toggle
            label="Resumen al cerrar el libro"
            hint="Tiempo, palabras, avance y logros de la sesión"
            checked={s.sessionSummary}
            onChange={(sessionSummary) => update({ sessionSummary })}
          />
          <Slider label="Meta diaria" value={s.dailyGoalMin} min={5} max={180} step={5} format={(v) => `${v} min`} onInput={(dailyGoalMin) => update({ dailyGoalMin })} />
          <Toggle label="Avisos de progreso" hint="«Leíste 1.000 palabras», «Avanzaste 5 %»…" checked={s.toastsEnabled} onChange={(toastsEnabled) => update({ toastsEnabled })} />
          <div class="row">
            <span class="row-label">Avisar cada</span>
            <select class="select" value={s.toastWords} onChange={(e) => update({ toastWords: +(e.target as HTMLSelectElement).value })}>
              <option value={0}>— palabras</option>
              <option value={250}>250 palabras</option>
              <option value={500}>500 palabras</option>
              <option value={1000}>1.000 palabras</option>
              <option value={2000}>2.000 palabras</option>
              <option value={5000}>5.000 palabras</option>
            </select>
          </div>
          <div class="row">
            <span class="row-label">y cada</span>
            <select class="select" value={s.toastPercent} onChange={(e) => update({ toastPercent: +(e.target as HTMLSelectElement).value })}>
              <option value={0}>— % del libro</option>
              <option value={1}>1 % del libro</option>
              <option value={2}>2 % del libro</option>
              <option value={5}>5 % del libro</option>
              <option value={10}>10 % del libro</option>
            </select>
          </div>
          <Toggle label="Avisar al terminar un capítulo" checked={s.toastChapter} onChange={(toastChapter) => update({ toastChapter })} />
        </Section>

        <Section title="Apariencia">
          <div class="row">
            <span class="row-label">Fuente de la interfaz</span>
            <select class="select" value={s.uiFont} onChange={(e) => update({ uiFont: (e.target as HTMLSelectElement).value })}>
              {ui.map((f) => (
                <option value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <ThemePanel />
        </Section>

        <Section title="Diccionario y traducción">
          <div class="row">
            <span class="row-label">Traducir a</span>
            <select class="select" value={s.translateTo} onChange={(e) => update({ translateTo: (e.target as HTMLSelectElement).value })}>
              {LANGS.map(([code, name]) => (
                <option value={code}>{name}</option>
              ))}
            </select>
          </div>
          <p class="muted small">Solo se usa internet al pedir una definición o traducción (Free Dictionary, Wiktionary y MyMemory).</p>
        </Section>

        <Section title="Tus datos">
          <p class="muted small">Todo se guarda solo en este dispositivo. Haz copias para pasar tu progreso al PC o al móvil.</p>
          <div class="btn-row">
            <button type="button" class="btn" onClick={() => void exportBackup()}>
              <Download size={16} /> Exportar copia
            </button>
            <button type="button" class="btn" onClick={restore}>
              <Upload size={16} /> Restaurar copia
            </button>
          </div>
          {isNative() && (
            <p class="muted small">
              Copia automática: tu progreso, rachas, subrayados y palabras (sin los EPUB) se guardan también en la copia de seguridad de Android. Si reinstalas la app o cambias de móvil,
              se recuperan solos al abrirla.
            </p>
          )}
          <StorageInfo />
        </Section>

        {!isNative() && (
          <Section title="Atajos de teclado">
            <dl class="shortcuts">
              <dt>Espacio / AvPág</dt>
              <dd>Avanzar una pantalla (Mayús: retroceder)</dd>
              <dt>A</dt>
              <dd>Autoscroll (+ / − cambian la velocidad)</dd>
              <dt>T</dt>
              <dd>Índice</dd>
              <dt>/ o Ctrl+F</dt>
              <dd>Buscar</dd>
              <dt>F</dt>
              <dd>Pantalla completa</dd>
              <dt>P</dt>
              <dd>Iniciar/pausar pomodoro</dd>
              <dt>S</dt>
              <dd>Sonidos</dd>
              <dt>M</dt>
              <dd>Mostrar/ocultar menú</dd>
              <dt>Esc</dt>
              <dd>Cerrar paneles</dd>
            </dl>
          </Section>
        )}

        <Section title="Acerca de">
          <p class="muted small">
            Lunaria {__APP_VERSION__}. Lector libre inspirado en Moon+ Reader y en el diseño de Substack. Parser EPUB basado en ideas de foliate-js (MIT). Fuentes con licencia SIL
            OFL vía Fontsource. Iconos de Lucide (ISC).
          </p>
        </Section>
      </main>
    </div>
  )
}
