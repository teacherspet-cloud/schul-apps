/**
 * Bau der iPad-/iPhone-App (Capacitor): die Oberfläche des PCs samt „Hauptprozess" als reine
 * Web-Seite für den WKWebView – `npm run build:mobil` → out/mobil (webDir in capacitor.config.ts).
 *
 * - Einstieg ist src/mobil/start.ts statt src/renderer/src/main.tsx (baut window.api auf und lädt
 *   dann dieselbe Oberfläche).
 * - Node und Electron werden durch Nachbildungen ersetzt (src/mobil/shims), die Module für den
 *   Abo-Zugang durch Fassungen mit klarer Meldung (src/mobil/stubs).
 * - Die Ressourcen (Lehrpläne, Schulverzeichnis, OpenMoji …) kommen nach out/mobil/resources,
 *   dazu ein Verzeichnis (verzeichnis.json), aus dem die App lädt (src/mobil/vfs/mounts.ts).
 *
 * Prüf-Build mit KI-Attrappe: SCHULAPPS_MOBIL_TEST=1 npm run build:mobil (tests/e2e/mobil.mjs).
 */
import { execFileSync } from 'child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, relative, resolve, sep } from 'path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const r = (p: string): string => resolve(__dirname, p)
const shim = (name: string): string => r(`src/mobil/shims/${name}.ts`)
const posix = (p: string): string => p.split(sep).join('/')

/** Node- und Electron-Module → Nachbildungen */
const ERSATZ: [RegExp, string][] = [
  [/^electron$/, shim('electron')],
  [/^(node:)?fs$/, shim('fs')],
  [/^(node:)?fs\/promises$/, shim('fs-promises')],
  [/^(node:)?path$/, r('node_modules/path-browserify/index.js')],
  [/^(node:)?crypto$/, shim('crypto')],
  [/^(node:)?os$/, shim('os')],
  [/^(node:)?url$/, shim('url')],
  [/^(node:)?dns\/promises$/, shim('dns')],
  [/^(node:)?net$/, shim('net')],
  [/^node:buffer$/, r('node_modules/buffer/index.js')]
]

/** Ganze Module des Hauptprozesses, die es auf dem iPad in anderer Fassung gibt */
const TAUSCH: Record<string, string> = {
  [posix(r('src/main/services/ai/cli.ts'))]: r('src/mobil/stubs/cli.ts'),
  [posix(r('src/main/services/ai/setup.ts'))]: r('src/mobil/stubs/setup.ts')
}

function modulTausch(): Plugin {
  return {
    name: 'schulapps-mobil-tausch',
    enforce: 'pre',
    async resolveId(quelle, importer, optionen) {
      if (!importer || quelle.startsWith('\0')) return null
      const gefunden = await this.resolve(quelle, importer, { ...optionen, skipSelf: true })
      if (!gefunden) return null
      const ziel = TAUSCH[posix(gefunden.id.split('?')[0])]
      return ziel ?? null
    }
  }
}

/** Einstieg und Sicherheitsregeln der Seite für den WKWebView */
function einstieg(): Plugin {
  const START = '/__mobil/start.ts'
  let dev = false
  return {
    name: 'schulapps-mobil-einstieg',
    enforce: 'pre',
    configResolved(c) {
      dev = c.command === 'serve'
    },
    resolveId(id) {
      return id === START ? r('src/mobil/start.ts') : null
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        let out = html.replace('/src/main.tsx', START)
        /*
         * CSP für iOS: Die KI-Anbieter, Bildarchive und Quellen werden direkt angesprochen (https:),
         * Bilder aus dem Dateisystem kommen über capacitor:. Beim Entwickeln ohne CSP (Vite braucht
         * Inline-Skripte und ws: für das Neuladen).
         */
        const csp = dev
          ? ''
          : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: capacitor:; media-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; frame-src 'self' about: blob: data:; connect-src 'self' https: data: blob: capacitor:"
        out = out.replace(
          /<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/,
          csp ? `<meta http-equiv="Content-Security-Policy" content="${csp}" />` : ''
        )
        out = out.replace(
          '<meta charset="UTF-8" />',
          '<meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />\n    <meta name="format-detection" content="telephone=no" />'
        )
        return out
      }
    }
  }
}

/** Alle Dateien unter resources/ (ohne Beschreibungen) mit Größe */
function ressourcenListe(): { pfad: string; groesse: number }[] {
  const wurzel = r('resources')
  const out: { pfad: string; groesse: number }[] = []
  const gehe = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const voll = join(dir, name)
      if (statSync(voll).isDirectory()) gehe(voll)
      else if (!/\.md$/i.test(name)) out.push({ pfad: posix(relative(wurzel, voll)), groesse: statSync(voll).size })
    }
  }
  if (existsSync(wurzel)) gehe(wurzel)
  return out.sort((a, b) => a.pfad.localeCompare(b.pfad))
}

/** Ressourcen neben die Seite: beim Bauen kopieren, beim Entwickeln ausliefern */
function ressourcen(): Plugin {
  let ausgabe = ''
  return {
    name: 'schulapps-mobil-ressourcen',
    configResolved(c) {
      ausgabe = resolve(c.root, c.build.outDir)
    },
    buildStart() {
      // OpenMoji wird aus dem npm-Paket erzeugt und liegt nicht im Repository (.gitignore) – etwa beim Bau auf GitHub
      if (!existsSync(r('resources/openmoji/index.json'))) execFileSync(process.execPath, [r('scripts/prepare-openmoji.mjs')], { cwd: r('.'), stdio: 'inherit' })
    },
    configureServer(server) {
      server.middlewares.use((req, res, weiter) => {
        const pfad = decodeURIComponent((req.url ?? '').split('?')[0])
        if (!pfad.startsWith('/resources/')) return weiter()
        const rel = pfad.slice('/resources/'.length)
        if (rel === 'verzeichnis.json') {
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ dateien: ressourcenListe() }))
          return
        }
        const datei = r(join('resources', rel))
        if (!datei.startsWith(r('resources')) || !existsSync(datei) || statSync(datei).isDirectory()) return weiter()
        res.end(readFileSync(datei))
      })
    },
    writeBundle() {
      const liste = ressourcenListe()
      for (const d of liste) {
        const ziel = join(ausgabe, 'resources', d.pfad)
        mkdirSync(dirname(ziel), { recursive: true })
        copyFileSync(r(join('resources', d.pfad)), ziel)
      }
      writeFileSync(join(ausgabe, 'resources', 'verzeichnis.json'), JSON.stringify({ dateien: liste }))
    }
  }
}

const version = (JSON.parse(readFileSync(r('package.json'), 'utf8')) as { version: string }).version

export default defineConfig({
  root: r('src/renderer'),
  base: './',
  // Vorgebündelte Pakete beim Entwickeln außerhalb von Dropbox – sonst sperrt Dropbox das Umbenennen (EBUSY)
  cacheDir: join(tmpdir(), 'schulapps-vite-mobil'),
  publicDir: false,
  plugins: [einstieg(), modulTausch(), react(), ressourcen()],
  resolve: {
    alias: [
      { find: '@renderer', replacement: r('src/renderer/src') },
      { find: '@shared', replacement: r('src/shared') },
      ...ERSATZ.map(([find, replacement]) => ({ find, replacement }))
    ]
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __KI_ATTRAPPE_ERLAUBT__: JSON.stringify(process.env.SCHULAPPS_MOBIL_TEST === '1'),
    // Vite ersetzt `process.env` sonst durch {} – die Attrappe schaltet der Prüf-Build über diese Variable ein (mobil/start.ts)
    'process.env.SCHULAPPS_KI_ATTRAPPE': 'globalThis.__SCHULAPPS_KI_ATTRAPPE__'
  },
  build: {
    outDir: r('out/mobil'),
    emptyOutDir: true,
    target: 'safari16',
    chunkSizeWarningLimit: 8000,
    reportCompressedSize: false
  },
  optimizeDeps: {
    esbuildOptions: { target: 'safari16' }
  },
  server: { port: 5188, strictPort: false }
})
