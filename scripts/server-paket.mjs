// Schnürt das Paket für den Schul-Apps-Server (02.10.2026): node scripts/server-paket.mjs
//
// 1. Oberfläche bauen (electron-vite, wie für die Exe) → out/renderer
// 2. Server bündeln (vite.server.config.ts) – außerhalb von Dropbox
// 3. Alles mit Dockerfile, Compose, Laufzeit-package.json und Zertifikats-Hook in EIN Archiv:
//    dist/schul-apps-server.tgz – auf dem VPS nach /opt/schul-apps entpacken, dort `docker compose up -d --build`.
//
// Geheimnisse sind NIE im Paket: Hauptschlüssel (geheim/) und Notzugang-Passwort (notzugang.env)
// entstehen auf dem VPS.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { brotliCompressSync, constants as zlibKonstanten } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const wurzel = resolve(import.meta.dirname, '..')
const bau = join(tmpdir(), 'schulapps-server-paket')
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const lauf = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: wurzel, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } })

rmSync(bau, { recursive: true, force: true })
mkdirSync(bau, { recursive: true })

if (!process.argv.includes('--ohne-oberflaeche')) {
  console.log('1/3 Oberfläche bauen …')
  lauf(process.execPath, [join(wurzel, 'scripts', 'bauen.mjs')])
}
if (!existsSync(join(wurzel, 'out', 'renderer', 'index.html'))) throw new Error('out/renderer fehlt – erst bauen.')

console.log('2/3 Server bündeln …')
lauf(npx, ['vite', 'build', '-c', 'vite.server.config.ts'], { SCHULAPPS_SERVER_OUT: join(bau, 'server') })

console.log('3/3 Paket schnüren …')
for (const datei of ['Dockerfile', 'docker-compose.yml', 'package.json', 'schul-apps-zertifikat.sh', 'IServ-Freischaltung.md']) cpSync(join(wurzel, 'deploy', 'vps', datei), join(bau, datei))
cpSync(join(wurzel, 'out', 'renderer'), join(bau, 'oberflaeche'), { recursive: true })
// Bündel vorab packen (09.10.2026): Der Server liefert „.br" nur noch aus – Packen im Container sprengte den Speicher
{
  const assets = join(bau, 'oberflaeche', 'assets')
  let n = 0
  for (const name of existsSync(assets) ? readdirSync(assets) : []) {
    const datei = join(assets, name)
    if (!/\.(m?js|css|json|svg|txt|wasm)$/.test(name) || statSync(datei).size < 1024) continue
    const roh = readFileSync(datei)
    writeFileSync(`${datei}.br`, brotliCompressSync(roh, { params: { [zlibKonstanten.BROTLI_PARAM_QUALITY]: 11, [zlibKonstanten.BROTLI_PARAM_SIZE_HINT]: roh.length } }))
    n++
  }
  console.log(`${n} Dateien vorab gepackt (Brotli)`)
}
// Ressourcen ohne die Einzel-SVGs von OpenMoji (die App liest den Index) – wie electron-builder.yml
cpSync(join(wurzel, 'resources'), join(bau, 'resources'), {
  recursive: true,
  filter: (q) => !/[\\/]openmoji[\\/]svg[\\/]/.test(q) && !/\.md$/i.test(q)
})
const ziel = join(wurzel, 'dist', 'schul-apps-server.tgz')
mkdirSync(join(wurzel, 'dist'), { recursive: true })
rmSync(ziel, { force: true })
// Unter Windows das eingebaute tar (GNU-tar aus Git hielte „D:“ für einen entfernten Rechner)
const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
execFileSync(tar, ['-czf', ziel, '-C', bau, '.'], { stdio: 'inherit' })
console.log(`\nFertig: ${ziel} (${(statSync(ziel).size / 1024 / 1024).toFixed(1)} MB)`)
