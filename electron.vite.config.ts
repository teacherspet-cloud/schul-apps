import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()],
    // Oberfläche verkleinern (09.10.2026, Befund Ladezeiten): electron-vite lässt den Renderer sonst unverkleinert –
    // 20 MB statt ~8 MB, über die Leitung (Brotli) etwa 3,4 statt ~2 MB
    build: {
      minify: 'esbuild',
      // Kleine Symbole der Leiste (*-96.webp) immer einbetten (13.10.2026, Befund: das Symbol der Vokabellisten erschien
      // verzögert) – Vite bettet sonst nur Dateien unter 4 KB ein, einige Symbole liegen knapp darüber und kamen nachgeladen
      assetsInlineLimit: (datei: string) => (/-96\.webp$/.test(datei) ? true : undefined)
    }
  }
})
