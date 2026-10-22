import { useEffect, useState } from 'preact/hooks'
import { ArrowLeft, Download, Upload } from 'lucide-preact'
import { go } from '../lib/router'
import { settings, update } from '../lib/settings'
import { allFonts } from '../lib/fonts'
import { exportBackup, importBackup } from '../lib/backup'
import { error, info } from '../lib/toasts'
import { isNative } from '../lib/native'
import { t } from '../lib/i18n'
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
  const [est, setEst] = useState<StorageEstimate | null>(null)
  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => setEst(e))
      .catch(() => {})
  }, [])
  if (!est) return null
  const used = ((est.usage ?? 0) / 1048576).toFixed(1)
  return (
    <p class="muted small">
      {est.quota
        ? t('{used} MB usados de {quota} MB disponibles', { used, quota: Math.round(est.quota / 1048576) })
        : t('{used} MB usados', { used })}
    </p>
  )
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
        error(t('No se pudo restaurar'), e instanceof Error ? e.message : undefined)
      }
    }
    input.click()
  }
  return (
    <div class="page settings-page">
      <header class="topbar">
        <IconButton label={t('Volver')} onClick={() => go({ name: 'library' })}>
          <ArrowLeft size={22} />
        </IconButton>
        <h1 class="page-title">{t('Ajustes')}</h1>
        <span />
      </header>
      <main class="page-main narrow">
        <Section title={t('Idioma')}>
          <Segmented
            label={t('Idioma')}
            value={s.lang}
            onChange={(lang) => update({ lang })}
            options={[
              { value: 'auto', label: t('Automático') },
              { value: 'es', label: 'Español' },
              { value: 'en', label: 'English' },
            ]}
          />
          <p class="muted small">{t('Automático sigue el idioma del móvil o del navegador. El texto del libro no cambia.')}</p>
        </Section>
        <Section title={t('Lectura')}>
          <div class="row stack">
            <span class="row-label">{t('Zonas de toque')}</span>
            <Segmented
              label={t('Zonas de toque')}
              value={s.tapZones}
              onChange={(tapZones) => update({ tapZones })}
              options={[
                { value: 'vertical', label: t('Arriba / abajo') },
                { value: 'horizontal', label: t('Izq. / der.') },
                { value: 'off', label: t('Solo menú') },
              ]}
            />
            <span class="row-hint">{t('Tocar arriba (o a la izquierda) retrocede una pantalla, abajo (o a la derecha) avanza y el centro abre el menú.')}</span>
          </div>
          <Slider
            label={t('Desplazamiento por toque')}
            value={s.tapScrollRatio}
            min={0.5}
            max={1}
            step={0.05}
            format={(v) => t('{n}% de pantalla', { n: Math.round(v * 100) })}
            onInput={(tapScrollRatio) => update({ tapScrollRatio })}
          />
          <Toggle
            label={t('Pasar pantalla sin animación')}
            hint={t('Salto instantáneo (también si el sistema pide quitar animaciones)')}
            checked={s.instantPaging}
            onChange={(instantPaging) => update({ instantPaging })}
          />
          {isNative() && <Toggle label={t('Pasar con las teclas de volumen')} checked={s.volumeKeys} onChange={(volumeKeys) => update({ volumeKeys })} />}
          {isNative() && <Toggle label={t('Pantalla completa al leer')} checked={s.fullscreen} onChange={(fullscreen) => update({ fullscreen })} />}
          <div class="row">
            <span class="row-label">{t('Mantener la pantalla encendida')}</span>
            <select class="select" value={s.keepAwakeMin} onChange={(e) => update({ keepAwakeMin: +(e.target as HTMLSelectElement).value })}>
              <option value={0}>{t('Según el sistema')}</option>
              <option value={2}>{t('2 min sin tocar')}</option>
              <option value={5}>{t('5 min sin tocar')}</option>
              <option value={10}>{t('10 min sin tocar')}</option>
              <option value={30}>{t('30 min sin tocar')}</option>
            </select>
          </div>
          <Toggle label={t('Línea de estado')} hint={t('Hora, batería, progreso y tiempo restante del capítulo')} checked={s.showStatus} onChange={(showStatus) => update({ showStatus })} />
          <div class="row">
            <span class="row-label">{t('Barra de progreso fina')}</span>
            <select
              class="select"
              value={s.progressBar}
              onChange={(e) =>
                update({
                  progressBar: (e.target as HTMLSelectElement).value as typeof s.progressBar,
                })
              }
            >
              <option value="book">{t('Libro')}</option>
              <option value="chapter">{t('Capítulo')}</option>
              <option value="goal">{t('Meta diaria')}</option>
              <option value="none">{t('Ninguna')}</option>
            </select>
          </div>
        </Section>

        <Section title={t('Metas y avisos')}>
          <div class="row stack">
            <span class="row-label">{t('Modo de juego')}</span>
            <Segmented
              label={t('Modo de juego')}
              value={s.gameMode}
              onChange={(gameMode) => update({ gameMode })}
              options={[
                { value: 'completo', label: t('Completo') },
                { value: 'discreto', label: t('Discreto') },
                { value: 'estadisticas', label: t('Solo datos') },
              ]}
            />
            <span class="row-hint">
              {s.gameMode === 'completo'
                ? t('Avisos, logros y niveles mientras lees.')
                : s.gameMode === 'discreto'
                  ? t('Nada interrumpe la lectura: logros y niveles esperan al resumen al cerrar.')
                  : t('Sin XP, niveles ni logros a la vista: solo tiempo, palabras y rachas.')}
            </span>
          </div>
          <Toggle
            label={t('Resumen al cerrar el libro')}
            hint={t('Tiempo, palabras, avance y logros de la sesión')}
            checked={s.sessionSummary}
            onChange={(sessionSummary) => update({ sessionSummary })}
          />
          <Slider label={t('Meta diaria')} value={s.dailyGoalMin} min={5} max={180} step={5} format={(v) => `${v} min`} onInput={(dailyGoalMin) => update({ dailyGoalMin })} />
          <Toggle label={t('Avisos de progreso')} hint={t('«Leíste 1.000 palabras», «Avanzaste 5 %»…')} checked={s.toastsEnabled} onChange={(toastsEnabled) => update({ toastsEnabled })} />
          <div class="row">
            <span class="row-label">{t('Avisar cada')}</span>
            <select class="select" value={s.toastWords} onChange={(e) => update({ toastWords: +(e.target as HTMLSelectElement).value })}>
              <option value={0}>{t('— palabras')}</option>
              <option value={250}>{t('250 palabras')}</option>
              <option value={500}>{t('500 palabras')}</option>
              <option value={1000}>{t('1.000 palabras')}</option>
              <option value={2000}>{t('2.000 palabras')}</option>
              <option value={5000}>{t('5.000 palabras')}</option>
            </select>
          </div>
          <div class="row">
            <span class="row-label">{t('y cada')}</span>
            <select class="select" value={s.toastPercent} onChange={(e) => update({ toastPercent: +(e.target as HTMLSelectElement).value })}>
              <option value={0}>{t('— % del libro')}</option>
              <option value={1}>{t('1 % del libro')}</option>
              <option value={2}>{t('2 % del libro')}</option>
              <option value={5}>{t('5 % del libro')}</option>
              <option value={10}>{t('10 % del libro')}</option>
            </select>
          </div>
          <Toggle label={t('Avisar al terminar un capítulo')} checked={s.toastChapter} onChange={(toastChapter) => update({ toastChapter })} />
        </Section>

        <Section title={t('Apariencia')}>
          <div class="row">
            <span class="row-label">{t('Fuente de la interfaz')}</span>
            <select class="select" value={s.uiFont} onChange={(e) => update({ uiFont: (e.target as HTMLSelectElement).value })}>
              {ui.map((f) => (
                <option value={f.id}>{t(f.name)}</option>
              ))}
            </select>
          </div>
          <ThemePanel />
        </Section>

        <Section title={t('Diccionario y traducción')}>
          <div class="row">
            <span class="row-label">{t('Traducir a')}</span>
            <select class="select" value={s.translateTo} onChange={(e) => update({ translateTo: (e.target as HTMLSelectElement).value })}>
              {LANGS.map(([code, name]) => (
                <option value={code}>{t(name)}</option>
              ))}
            </select>
          </div>
          <p class="muted small">{t('Solo se usa internet al pedir una definición o traducción (Free Dictionary, Wiktionary y MyMemory).')}</p>
        </Section>

        <Section title={t('Tus datos')}>
          <p class="muted small">{t('Todo se guarda solo en este dispositivo. Haz copias para pasar tu progreso al PC o al móvil.')}</p>
          <div class="btn-row">
            <button type="button" class="btn" onClick={() => void exportBackup()}>
              <Download size={16} /> {t('Exportar copia')}
            </button>
            <button type="button" class="btn" onClick={restore}>
              <Upload size={16} /> {t('Restaurar copia')}
            </button>
          </div>
          {isNative() && (
            <p class="muted small">
              {t('Copia automática: tu progreso, rachas, subrayados y palabras (sin los EPUB) se guardan también en la copia de seguridad de Android. Si reinstalas la app o cambias de móvil, se recuperan solos al abrirla.')}
            </p>
          )}
          <StorageInfo />
        </Section>

        {!isNative() && (
          <Section title={t('Atajos de teclado')}>
            <dl class="shortcuts">
              <dt>{t('Espacio / AvPág')}</dt>
              <dd>{t('Avanzar una pantalla (Mayús: retroceder)')}</dd>
              <dt>A</dt>
              <dd>{t('Autoscroll (+ / − cambian la velocidad)')}</dd>
              <dt>T</dt>
              <dd>{t('Índice')}</dd>
              <dt>{t('/ o Ctrl+F')}</dt>
              <dd>{t('Buscar')}</dd>
              <dt>F</dt>
              <dd>{t('Pantalla completa')}</dd>
              <dt>P</dt>
              <dd>{t('Iniciar/pausar pomodoro')}</dd>
              <dt>S</dt>
              <dd>{t('Sonidos')}</dd>
              <dt>M</dt>
              <dd>{t('Mostrar/ocultar menú')}</dd>
              <dt>Esc</dt>
              <dd>{t('Cerrar paneles')}</dd>
            </dl>
          </Section>
        )}

        <Section title={t('Acerca de')}>
          <p class="muted small">
            {t(
              'Lunaria {v}. Lector libre inspirado en Moon+ Reader y en el diseño de Substack. Parser EPUB basado en ideas de foliate-js (MIT). Fuentes con licencia SIL OFL vía Fontsource. Iconos de Lucide (ISC).',
              { v: __APP_VERSION__ },
            )}
          </p>
        </Section>
      </main>
    </div>
  )
}
