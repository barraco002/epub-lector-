import { expect, test, type Page } from '@playwright/test'

const NOVELA = 'tests/.fixtures/novela-es.epub'
const CORTO = 'tests/.fixtures/corto-en.epub'

async function importBooks(page: Page, files: string[]) {
  await page.goto('/')
  await page.setInputFiles('input[type=file]', files)
  await expect(page.locator('.book-card')).toHaveCount(files.length, { timeout: 20_000 })
}

async function openBook(page: Page, title: string) {
  await page.locator('.book-open', { hasText: title }).click()
  await expect(page.locator('#bk section.ch[data-rendered]').first()).toBeVisible({ timeout: 20_000 })
  // El lector registra atajos y gestos al terminar de posicionarse
  await expect(page.locator('.reader[data-state="ready"]')).toBeVisible()
}

const scrollTop = (page: Page) => page.evaluate(() => document.querySelector('.reader-scroller')!.scrollTop)

async function showMenu(page: Page) {
  if (!(await page.locator('.r-bottom').isVisible())) await page.keyboard.press('m')
  await expect(page.locator('.r-bottom')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  ;(page as Page & { errors: string[] }).errors = errors
})

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors: string[] }).errors).toEqual([])
})

test('importa EPUB 2 y 3 con metadatos y portada', async ({ page }) => {
  await importBooks(page, [NOVELA, CORTO])
  await expect(page.locator('.book-title', { hasText: 'La novela de prueba' })).toBeVisible()
  await expect(page.locator('.book-author', { hasText: 'Ana Autora' })).toBeVisible()
  await expect(page.locator('.book-title', { hasText: 'A Short Book' })).toBeVisible()
  // Reimportar el mismo archivo no lo duplica
  await page.setInputFiles('input[type=file]', [NOVELA])
  await expect(page.getByText('Ya está en tu biblioteca')).toBeVisible()
  await expect(page.locator('.book-card')).toHaveCount(2)
})

test('sanea el contenido hostil y aísla el CSS del libro', async ({ page }) => {
  await importBooks(page, [NOVELA])
  await openBook(page, 'La novela de prueba')
  await expect(page.getByText('AMANECER-UNO')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
  expect(await page.locator('#bk script, #bk iframe, #bk [onclick]').count()).toBe(0)
  expect(await page.locator('#bk a[href^="javascript"]').count()).toBe(0)
  await page.getByText('Párrafo con manejador onclick').click()
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
  // El color rojo y Comic Sans del libro quedan anulados por el tema
  const style = await page.locator('#bk p').nth(3).evaluate((el) => getComputedStyle(el))
  expect(style.color).not.toBe('rgb(255, 0, 0)')
  expect(style.fontFamily).toContain('Spectral')
  // El CSS del libro no se escapa fuera del lector
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).not.toContain('Comic')
})

test('notas al pie, enlaces internos e índice', async ({ page }) => {
  await importBooks(page, [NOVELA])
  await openBook(page, 'La novela de prueba')
  await page.locator('#bk a[data-epub-type="noteref"]').click()
  await expect(page.locator('.footnote-body')).toContainText('nota al pie número uno')
  await page.keyboard.press('Escape')
  await expect(page.locator('.footnote-body')).toHaveCount(0)

  await page.getByText('capítulo tres').click()
  await expect.poll(async () => page.locator('#t3').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeLessThan(120)

  await page.keyboard.press('t')
  await page.locator('.toc-item', { hasText: 'Capítulo 30' }).click()
  await expect.poll(async () => page.locator('#t30').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeGreaterThanOrEqual(0)
  // Encima va la cabecera discreta del capítulo, así que el título queda algo más abajo
  await expect.poll(async () => page.locator('#t30').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeLessThan(260)
})

test('recuerda la posición de lectura al volver a abrir', async ({ page }) => {
  await importBooks(page, [NOVELA])
  await openBook(page, 'La novela de prueba')
  await page.keyboard.press('t')
  await page.locator('.toc-item', { hasText: 'Capítulo 12' }).click()
  await page.waitForTimeout(500)
  await page.evaluate(() => document.querySelector('.reader-scroller')!.scrollBy(0, 1500))
  await page.waitForTimeout(600)
  // Primer párrafo visible en la parte superior de la pantalla
  const text = await page.evaluate(() => {
    const top = document.querySelector('.reader-scroller')!.getBoundingClientRect().top
    const p = [...document.querySelectorAll('#bk p')].find((x) => x.getBoundingClientRect().bottom > top + 40)
    return p?.textContent?.slice(0, 60)
  })
  expect(text).toBeTruthy()
  await page.keyboard.press('m')
  await page.locator('.r-top').getByRole('button', { name: 'Volver a la biblioteca' }).click()
  await expect(page.locator('.continue-card')).toContainText('La novela de prueba')
  await page.reload()
  await page.locator('.continue-card').click()
  await expect(page.locator('.reader[data-state="ready"]')).toBeVisible()
  await page.waitForTimeout(500)
  const visible = await page.evaluate((needle) => {
    const r = document.querySelector('.reader-scroller')!.getBoundingClientRect()
    return [...document.querySelectorAll('#bk p')].some((p) => {
      const b = p.getBoundingClientRect()
      return b.bottom > r.top && b.top < r.top + r.height / 2 && p.textContent?.startsWith(needle ?? '###')
    })
  }, text)
  expect(visible).toBe(true)
})

test('búsqueda sin tildes ni mayúsculas y salto al resultado', async ({ page }) => {
  await importBooks(page, [NOVELA])
  await openBook(page, 'La novela de prueba')
  await page.keyboard.press('/')
  await page.locator('.search-input').fill('murcielago')
  await expect(page.locator('.search-results li')).toHaveCount(1)
  await page.locator('.search-results li button').click()
  await expect.poll(async () =>
    page.evaluate(() => {
      const w = document.createTreeWalker(document.querySelector('#bk')!, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if ((n as Text).data.includes('MURCIÉLAGO')) {
          const r = document.createRange()
          r.selectNodeContents(n)
          const top = r.getBoundingClientRect().top
          return top > 0 && top < innerHeight
        }
      }
      return false
    }),
  ).toBe(true)
})

test('subrayar, cambiar color y exportar desde la lista', async ({ page }) => {
  await importBooks(page, [CORTO])
  await openBook(page, 'A Short Book')
  await page.evaluate(() => {
    const p = document.querySelectorAll('#bk p')[2]
    const r = document.createRange()
    r.setStart(p.firstChild!, 0)
    r.setEnd(p.firstChild!, 30)
    getSelection()!.removeAllRanges()
    getSelection()!.addRange(r)
  })
  await page.locator('.sel-menu .hl-dot.hl-green').click()
  await expect.poll(() => page.evaluate(() => CSS.highlights.get('hl-green')?.size)).toBe(1)
  await page.keyboard.press('t')
  await page.getByRole('radio', { name: 'Subrayados' }).click()
  await expect(page.locator('.ann-text')).toContainText('Reading is to the mind')
  // Persisten tras recargar
  await page.reload()
  await openBook(page, 'A Short Book')
  await expect.poll(() => page.evaluate(() => CSS.highlights.get('hl-green')?.size)).toBe(1)
})

test('tipografía y temas cambian en vivo y se guardan', async ({ page }) => {
  await importBooks(page, [CORTO])
  await openBook(page, 'A Short Book')
  await showMenu(page)
  await page.locator('.r-action', { hasText: 'Texto' }).click()
  const size = () => page.locator('#bk p').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  const before = await size()
  await page.getByRole('button', { name: 'Aumentar Tamaño' }).click()
  await page.getByRole('button', { name: 'Aumentar Tamaño' }).click()
  expect(await size()).toBe(before + 2)
  await page.getByRole('button', { name: 'Kindle' }).click()
  await expect.poll(() => page.locator('#bk').evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Literata')
  await page.keyboard.press('Escape')
  await showMenu(page)
  await page.locator('.r-action', { hasText: 'Tema' }).click()
  await page.locator('.swatch[title="Nord"]').click()
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.reader')!).backgroundColor)).toBe('rgb(46, 52, 64)')
  await page.reload()
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(46, 52, 64)')
})

test('filtro de luz azul y par día/noche de un toque', async ({ page }) => {
  await importBooks(page, [CORTO])
  await openBook(page, 'A Short Book')
  const bg = () => page.evaluate(() => getComputedStyle(document.querySelector('.reader')!).backgroundColor)
  expect(await bg()).toBe('rgb(255, 255, 255)')
  await showMenu(page)
  await page.locator('.r-action', { hasText: 'Tema' }).click()
  await page.getByRole('switch', { name: 'Filtro de luz azul' }).click()
  await expect.poll(bg).not.toBe('rgb(255, 255, 255)')
  const [r, , b] = (await bg()).match(/\d+/g)!.map(Number)
  expect(r).toBeGreaterThan(b)
  await page.getByRole('switch', { name: 'Filtro de luz azul' }).click()
  await expect.poll(bg).toBe('rgb(255, 255, 255)')
  await page.keyboard.press('Escape')

  // Un toque pasa al tema de noche; elegir tema de noticia cambia solo el de noche
  await showMenu(page)
  await page.locator('.r-action', { hasText: 'Día' }).click()
  await expect.poll(async () => (await bg()).match(/\d+/g)!.map(Number)[0]).toBeLessThan(80)
  await page.locator('.r-action', { hasText: 'Tema' }).click()
  await page.locator('.swatch[title="Nord"]').click()
  await expect.poll(bg).toBe('rgb(46, 52, 64)')
  await page.keyboard.press('Escape')
  await showMenu(page)
  await page.locator('.r-action', { hasText: 'Noche' }).click()
  await expect.poll(bg).toBe('rgb(255, 255, 255)')
  await page.locator('.r-action', { hasText: 'Día' }).click()
  await expect.poll(bg).toBe('rgb(46, 52, 64)')
})

test('volver tras un salto y marca «aquí ibas» al pasar pantalla', async ({ page }) => {
  await importBooks(page, [NOVELA])
  await openBook(page, 'La novela de prueba')
  await page.keyboard.press('t')
  await page.locator('.toc-item', { hasText: 'Capítulo 20' }).click()
  await expect(page.locator('.return-chip')).toContainText('Volver a')
  await page.locator('.return-go').click()
  await expect(page.locator('.return-chip')).toHaveCount(0)
  await expect.poll(async () => page.locator('section.ch[data-i="0"]').evaluate((el) => el.getBoundingClientRect().bottom > 0)).toBe(true)

  // Pasar pantalla: el renglón cortado sube arriba entero y se marca
  await page.keyboard.press('Space')
  await expect(page.locator('.here-mark')).toHaveCount(1)
  await page.waitForTimeout(700)
  const cut = await page.evaluate(() => {
    const top = document.querySelector('.reader-scroller')!.getBoundingClientRect().top
    const w = document.createTreeWalker(document.querySelector('#bk')!, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const r = document.createRange()
      r.selectNodeContents(n)
      for (const rect of r.getClientRects()) if (rect.bottom > top && rect.height) return rect.top - top
    }
    return null
  })
  // Ningún renglón queda medio tapado por el borde superior
  expect(cut).not.toBeNull()
  expect(cut!).toBeGreaterThanOrEqual(-2)
})

test('resumen de sesión al cerrar y modo de juego discreto', async ({ page }) => {
  await importBooks(page, [NOVELA])
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByRole('radio', { name: 'Discreto' }).click()
  await page.getByRole('button', { name: 'Volver' }).click()
  await openBook(page, 'La novela de prueba')
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Space')
    await page.waitForTimeout(450)
  }
  // En modo discreto no hay avisos de progreso mientras se lee
  await expect(page.locator('.toast')).toHaveCount(0)
  await page.keyboard.press('m')
  await page.locator('.r-top').getByRole('button', { name: 'Volver a la biblioteca' }).click()
  const sheet = page.locator('.sheet', { hasText: 'Sesión de lectura' })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('palabras')
  await expect(sheet).toContainText('XP')
  await sheet.getByRole('button', { name: 'Listo' }).click()
  await expect(sheet).toHaveCount(0)
})

test('ficha de libro terminado y Mis palabras con repaso', async ({ page }) => {
  await page.route('**/api.dictionaryapi.dev/**', (r) =>
    r.fulfill({ json: [{ word: 'rain', phonetic: '/reɪn/', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'Water falling in drops.' }] }] }] }),
  )
  await page.route('**/api.mymemory.translated.net/**', (r) => r.fulfill({ json: { responseData: { translatedText: 'lluvia' }, responseStatus: 200 } }))
  await importBooks(page, [CORTO])
  await openBook(page, 'A Short Book')
  await page.evaluate(() => {
    const p = document.querySelectorAll('#bk p')[2]
    const t = p.firstChild as Text
    const at = t.data.indexOf('rain')
    const r = document.createRange()
    r.setStart(t, at)
    r.setEnd(t, at + 4)
    getSelection()!.removeAllRanges()
    getSelection()!.addRange(r)
  })
  await page.locator('.sel-menu').getByRole('button', { name: 'Definir' }).click()
  await expect(page.locator('.dict')).toContainText('Water falling in drops.')
  await page.getByRole('button', { name: 'Guardar palabra' }).click()
  await expect(page.getByRole('button', { name: 'En Mis palabras', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.keyboard.press('m')
  await page.locator('.r-top').getByRole('button', { name: 'Volver a la biblioteca' }).click()

  // La palabra vence mañana: adelantamos el reloj para repasarla
  await page.getByRole('button', { name: 'Progreso y logros' }).click()
  await expect(page.locator('.vocab-section')).toContainText('1 guardadas')
  await page.getByRole('button', { name: 'Ver todas' }).click()
  await expect(page.locator('.vocab-list')).toContainText('lluvia')
  await page.clock.install({ time: Date.now() + 2 * 86_400_000 })
  await page.reload()
  await page.getByRole('button', { name: 'Progreso y logros' }).click()
  await page.getByRole('button', { name: 'Repasar 1 palabra' }).click()
  await expect(page.locator('.vocab-context mark')).toHaveText('rain')
  await page.getByRole('button', { name: 'Mostrar significado' }).click()
  await page.getByRole('button', { name: 'La sabía' }).click()
  await expect(page.locator('.sheet')).toContainText('¡Repaso hecho!')
  await page.getByRole('button', { name: 'Listo' }).click()
  await page.getByRole('button', { name: 'Volver' }).click()

  // Ficha de terminado desde el menú del libro
  await page.locator('.book-card').getByRole('button', { name: /Opciones|Más/ }).click()
  await page.getByRole('button', { name: 'Marcar como terminado' }).click()
  await page.locator('.book-card').getByRole('button', { name: /Opciones|Más/ }).click()
  await page.getByRole('button', { name: 'Ficha de libro terminado' }).click()
  await expect(page.locator('.exlibris')).toContainText('A Short Book')
  await expect(page.getByRole('button', { name: 'Guardar tarjeta' })).toBeEnabled()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Guardar tarjeta' }).click()
  expect((await download).suggestedFilename()).toMatch(/A Short Book - Lunaria\.png/)
})

test('modo auto: sin menús encima, tocar pausa y reanuda, Escape sale', async ({ page }) => {
  await importBooks(page, [NOVELA])
  await openBook(page, 'La novela de prueba')
  // Se arranca desde el panel, con el menú abierto: al empezar no debe quedar nada tapando el texto
  await showMenu(page)
  await page.locator('.r-action', { hasText: 'Auto' }).click()
  await page.locator('.auto-panel .btn-primary').click()
  await expect(page.locator('.r-top, .r-bottom, .sheet')).toHaveCount(0)
  const start = await scrollTop(page)
  await page.waitForTimeout(2800)
  expect((await scrollTop(page)) - start).toBeGreaterThan(15)
  // Los controles se apartan solos mientras avanza
  await expect(page.locator('.auto-pill.is-idle')).toHaveCount(1)
  await page.locator('.reader-scroller').click({ position: { x: 150, y: 400 } })
  await expect(page.locator('.auto-pill.is-paused')).toBeVisible()
  const stopped = await scrollTop(page)
  await page.waitForTimeout(800)
  expect(await scrollTop(page)).toBe(stopped)
  await page.locator('.reader-scroller').click({ position: { x: 150, y: 400 } })
  await expect(page.locator('.auto-pill.is-paused')).toHaveCount(0)
  await page.waitForTimeout(1200)
  expect(await scrollTop(page)).toBeGreaterThan(stopped)
  await page.keyboard.press('Escape')
  await expect(page.locator('.auto-pill')).toHaveCount(0)
})

test('indicador de avance discreto y cabeceras de capítulo', async ({ page }) => {
  await importBooks(page, [NOVELA])
  await openBook(page, 'La novela de prueba')
  const color = await page.locator('.edge-fill').evaluate((el) => getComputedStyle(el).backgroundColor)
  // Tono del texto casi transparente (no el acento)
  expect(color).toMatch(/\/ 0\.2\)|, 0\.2\)/)
  expect(await page.locator('.edge-progress').evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThan(400)
  await page.keyboard.press('t')
  await page.getByRole('button', { name: 'Capítulo 5', exact: true }).click()
  await expect(page.locator('section.ch[data-i="4"] .ch-head .ch-label')).toHaveText('5 de 40')
  // El libro ya titula "Capítulo 5": la cabecera no lo repite
  await expect(page.locator('section.ch[data-i="4"] .ch-head .ch-title')).toHaveCount(0)
})

test('modo concentración, colores propios y aire vertical persisten', async ({ page }) => {
  await importBooks(page, [CORTO])
  await openBook(page, 'A Short Book')
  await showMenu(page)
  await page.locator('.r-action', { hasText: 'Tema' }).click()
  await page.locator('.segmented button', { hasText: 'Marco' }).click()
  await expect(page.locator('.reader.focus-marco')).toHaveCount(1)
  await page.locator('.color-field', { hasText: 'Fondo' }).locator('input').fill('#203040')
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('#bk')!).backgroundColor)).toBe('rgb(32, 48, 64)')
  await page.keyboard.press('Escape')
  await showMenu(page)
  await page.locator('.r-action', { hasText: 'Texto' }).click()
  await page.getByRole('button', { name: 'Aumentar Aire arriba y abajo' }).click()
  await page.reload()
  await openBook(page, 'A Short Book')
  await expect(page.locator('.reader.focus-marco')).toHaveCount(1)
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('#bk')!).backgroundColor)).toBe('rgb(32, 48, 64)')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pad-y').trim())).toBe('40px')
  await showMenu(page)
  await page.locator('.r-action', { hasText: 'Tema' }).click()
  await page.locator('.segmented button', { hasText: 'Franja' }).click()
  await expect(page.locator('.focus-band')).toHaveCount(1)
})

test('pomodoro, sonidos y avisos de progreso', async ({ page }) => {
  await importBooks(page, [NOVELA])
  await openBook(page, 'La novela de prueba')
  await showMenu(page)
  await page.locator('.r-action', { hasText: 'Pomodoro' }).click()
  await page.locator('.pomo-controls .play-btn').click()
  await expect(page.locator('.pomo-time')).not.toHaveText('25:00')
  await page.getByRole('button', { name: 'Saltar fase' }).click()
  await expect(page.locator('.pomo-phase')).toHaveText(/Descanso corto/)
  await page.keyboard.press('Escape')

  await showMenu(page)
  await page.locator('.r-action', { hasText: 'Sonidos' }).click()
  await page.locator('.chip', { hasText: 'Tarde de lluvia' }).click()
  await expect(page.getByRole('button', { name: 'Pausar sonidos' })).toBeVisible()
  await page.getByRole('button', { name: 'Pausar sonidos' }).click()
  await expect(page.getByRole('button', { name: 'Reproducir sonidos' })).toBeVisible()
  await page.keyboard.press('Escape')
})

test('estadísticas, logros y ajustes', async ({ page }) => {
  await importBooks(page, [CORTO])
  await page.getByRole('button', { name: 'Progreso y logros' }).click()
  await expect(page.locator('.level-card')).toContainText('Aprendiz de lector')
  await expect(page.locator('.ach')).toHaveCount(42)
  await expect(page.locator('.hm-cell').first()).toBeVisible()
  await page.getByRole('button', { name: 'Volver' }).click()
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await expect(page.getByText('Mantener la pantalla encendida')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exportar copia' })).toBeVisible()
})
