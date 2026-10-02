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

/**
 * Dateien der Nutzer verschlüsselt (02.10.2026, src/server/shims/fs.ts): Hauptprozess-Bausteine und
 * Server bekommen statt `fs` die Hülle – außer der Hülle selbst und dem, was sie braucht.
 */
const dateischutz = {
  name: 'schulapps-dateischutz',
  enforce: 'pre' as const,
  resolveId(quelle: string, von?: string): string | null {
    if ((quelle !== 'fs' && quelle !== 'node:fs') || !von) return null
    const p = von.replace(/\\/g, '/')
    if (!p.includes('/src/main/') && !p.includes('/src/server/')) return null
    if (/\/src\/server\/(shims\/fs|geheim|pfade)\.ts$/.test(p)) return null
    return r('src/server/shims/fs.ts')
  }
}

export default defineConfig({
  cacheDir: join(tmpdir(), 'schulapps-vite-server'),
  publicDir: false,
  plugins: [dateischutz],
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
      output: { format: 'es', entryFileNames: 'start.mjs', inlineDynamicImports: true },
      // „use client" der Oberflächen-Bibliotheken (Mantine) ist auf dem Server bedeutungslos
      onwarn(w, weiter) {
        if (w.code === 'MODULE_LEVEL_DIRECTIVE') return
        weiter(w)
      }
    }
  }
})
