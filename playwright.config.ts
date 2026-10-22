import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

// En el contenedor de desarrollo Chromium vive en /opt/pw-browsers/chromium; en CI se usa el de Playwright.
const localChromium = '/opt/pw-browsers/chromium'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    locale: 'es-ES',
    launchOptions: existsSync(localChromium) ? { executablePath: localChromium } : {},
  },
  projects: [
    { name: 'movil', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'escritorio', use: { viewport: { width: 1366, height: 860 }, browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
})
