/**
 * Bau der Exe „Schul-Apps Online" (02.10.2026): Hauptprozess und Preload nach out-client/
 * (bzw. SCHULAPPS_CLIENT_OUT). Die Oberfläche kommt vom Server – hier steckt nur das Fenster und
 * der IServ-Zugang (WebDAV mit lokal verschlüsseltem Passwort) drin.
 */
import { builtinModules } from 'module'
import { readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { defineConfig } from 'vite'

const r = (p: string): string => resolve(__dirname, p)
const version = (JSON.parse(readFileSync(r('package.json'), 'utf8')) as { version: string }).version

export default defineConfig({
  cacheDir: join(tmpdir(), 'schulapps-vite-client'),
  publicDir: false,
  resolve: {
    alias: [
      { find: '@shared', replacement: r('src/shared') },
      { find: '@renderer', replacement: r('src/renderer/src') }
    ]
  },
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir: process.env.SCHULAPPS_CLIENT_OUT || r('out-client'),
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    sourcemap: false,
    reportCompressedSize: false,
    lib: {
      entry: { main: r('src/client/main.ts'), preload: r('src/client/preload.ts') },
      formats: ['cjs'],
      fileName: (_format, name) => `${name}.cjs`
    },
    rollupOptions: {
      external: ['electron', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)]
    }
  }
})
