import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import pkg from './package.json' with { type: 'json' }

// Dos salidas desde el mismo código:
//  - `vite build`               → dist/ (lo empaqueta Capacitor en el APK de Android)
//  - `vite build --mode single` → dist-single/index.html, un único archivo que se abre
//                                 con doble clic en el PC, sin servidor ni instalación.
export default defineConfig(({ mode }) => {
  const single = mode === 'single'
  return {
    base: './',
    plugins: [preact(), ...(single ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    define: {
      __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? pkg.version),
      __SINGLE_FILE__: JSON.stringify(single),
    },
    build: {
      outDir: single ? 'dist-single' : 'dist',
      target: 'es2022',
      assetsInlineLimit: single ? Number.MAX_SAFE_INTEGER : 4096,
      cssCodeSplit: !single,
      chunkSizeWarningLimit: 1500,
      reportCompressedSize: false,
    },
    test: {
      environment: 'happy-dom',
      setupFiles: ['tests/unit/setup.ts'],
      include: ['tests/unit/**/*.test.ts'],
    },
  }
})
