/**
 * Bau des Servers (02.10.2026): `npx vite build -c vite.server.config.ts` → out/server/start.mjs
 *
 * Derselbe Code wie der Hauptprozess am PC (src/main/kanaele.ts und die Dienste), nur mit einem
 * anderen `electron` (src/server/shims/electron.ts): Datenordner je Nutzer, Verschlüsselung mit
 * dem Hauptschlüssel des Servers, keine Fenster. Gebündelt wird alles außer playwright-core
 * (bringt eigene Startprogramme mit und wird im Docker-Bild installiert).
 */
import { readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { defineConfig } from 'vite'

const r = (p: string): string => resolve(__dirname, p)
const version = (JSON.parse(readFileSync(r('package.json'), 'utf8')) as { version: string }).version

export default defineConfig({
  cacheDir: join(tmpdir(), 'schulapps-vite-server'),
  publicDir: false,
  resolve: {
    alias: [
      { find: /^electron$/, replacement: r('src/server/shims/electron.ts') },
      { find: '@shared', replacement: r('src/shared') },
      { find: '@renderer', replacement: r('src/renderer/src') }
    ]
  },
  define: {
    __APP_VERSION__: JSON.stringify(version)
  },
  ssr: {
    noExternal: true,
    external: ['playwright-core']
  },
  build: {
    ssr: r('src/server/start.ts'),
    outDir: process.env.SCHULAPPS_SERVER_OUT || r('out/server'),
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    sourcemap: true,
    reportCompressedSize: false,
    rollupOptions: {
      output: { format: 'es', entryFileNames: 'start.mjs', inlineDynamicImports: true }
    }
  }
})
