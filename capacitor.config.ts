import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.lunaria.lector',
  appName: 'Lunaria',
  webDir: 'dist',
  android: {
    // Sin depuración remota del WebView en las compilaciones publicadas
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
}

export default config
