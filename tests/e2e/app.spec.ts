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
  await expect.poll(async () => page.locator('#t30').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeLessThan(120)
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
  await expect(page.locator('#bk section.ch[data-rendered]').first()).toBeVisible()
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

test('filtro de luz azul calienta los colores del tema', async ({ page }) => {
  await importBooks(page, [CORTO])
  await openBook(page, 'A Short Book')
  const bg = () => page.evaluate(() => getComputedStyle(document.querySelector('.reader')!).backgroundColor)
  expect(await bg()).toBe('rgb(255, 255, 255)')
  await showMenu(page)
  await page.locator('.r-action', { hasText: 'Luz azul' }).click()
  await expect.poll(bg).not.toBe('rgb(255, 255, 255)')
  const [r, , b] = (await bg()).match(/\d+/g)!.map(Number)
  expect(r).toBeGreaterThan(b)
})

test('autoscroll avanza y se detiene al tocar', async ({ page }) => {
  await importBooks(page, [NOVELA])
  await openBook(page, 'La novela de prueba')
  const start = await scrollTop(page)
  await page.keyboard.press('a')
  await expect(page.locator('.auto-pill')).toBeVisible()
  await page.waitForTimeout(2500)
  const moved = (await scrollTop(page)) - start
  expect(moved).toBeGreaterThan(15)
  await page.locator('.reader-scroller').click({ position: { x: 150, y: 400 } })
  await expect(page.locator('.auto-pill')).toHaveCount(0)
  const stopped = await scrollTop(page)
  await page.waitForTimeout(800)
  expect(await scrollTop(page)).toBe(stopped)
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
