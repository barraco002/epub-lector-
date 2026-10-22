import { expect, test } from '@playwright/test'

const CORTO = 'tests/.fixtures/corto-en.epub'

// El idioma de la interfaz sigue al sistema: con el navegador en inglés, todo sale en inglés.
test.use({ locale: 'en-US' })

test('la interfaz sale en inglés cuando el sistema está en inglés', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('input[type=file]', CORTO)
  await expect(page.locator('.book-card')).toHaveCount(1, { timeout: 20_000 })
  await page.locator('.book-open', { hasText: 'A Short Book' }).click()
  await expect(page.locator('.reader[data-state="ready"]')).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press('m')
  await expect(page.locator('.r-bottom')).toBeVisible()
  await expect(page.locator('.r-bottom').getByText('Fullscreen', { exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})
