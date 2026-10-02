/**
 * Die Exe „Schul-Apps Online" bauen (02.10.2026) – außerhalb von Dropbox wie scripts/exe-bauen.mjs.
 *
 *   node scripts/client-exe-bauen.mjs [--server=https://…]
 *
 * Ergebnis: dist/Schul-Apps Online.exe (portable). Die Oberfläche kommt vom Server; in der Exe
 * stecken nur das Fenster und der IServ-Zugang. Die bisherige Exe (Schul-Apps.exe, ohne Server)
 * bleibt unverändert und wird weiter mit scripts/exe-bauen.mjs gebaut.
 */
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = process.cwd()
const arbeit = join(tmpdir(), 'schul-apps-online-exe')
const app = join(arbeit, 'app')
const slash = (p) => p.replace(/\\/g, '/')
const paket = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const electronVersion = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8')).version

rmSync(arbeit, { recursive: true, force: true })
mkdirSync(app, { recursive: true })

console.log('1/3 Bauen …')
execSync('npx vite build -c vite.client.config.ts', { stdio: 'inherit', env: { ...process.env, SCHULAPPS_CLIENT_OUT: app } })
for (const f of ['main.cjs', 'preload.cjs']) if (!existsSync(join(app, f))) throw new Error(`${f} fehlt nach dem Bauen.`)
writeFileSync(
  join(app, 'package.json'),
  JSON.stringify({ name: 'schul-apps-online', productName: 'Schul-Apps Online', version: paket.version, main: 'main.cjs', author: paket.author, description: 'Schul-Apps über den Schul-Apps-Server' }, null, 2)
)

console.log('2/3 Verpacken …')
const konfig = `appId: de.schulapps.online
productName: Schul-Apps Online
electronVersion: ${electronVersion}
directories:
  app: ${slash(app)}
  output: ${slash(arbeit)}
files:
  - '**/*'
electronLanguages:
  - de
  - en-US
win:
  icon: ${slash(join(root, 'build/icon.ico'))}
  target:
    - target: portable
      arch: [x64]
portable:
  artifactName: Schul-Apps Online.exe
  splashImage: ${slash(join(root, 'build/splash.bmp'))}
  unpackDirName: Schul-Apps-Online
npmRebuild: false
`
const konfigDatei = join(arbeit, 'builder.yml')
writeFileSync(konfigDatei, konfig, 'utf8')
execSync(`npx electron-builder --win --config "${konfigDatei}"`, { stdio: 'inherit', cwd: root })

const exe = join(arbeit, 'Schul-Apps Online.exe')
if (!existsSync(exe)) throw new Error('Die exe wurde nicht erzeugt.')
console.log('3/3 Nach dist kopieren …')
mkdirSync(join(root, 'dist'), { recursive: true })
const ziel = join(root, 'dist', 'Schul-Apps Online.exe')
try {
  copyFileSync(exe, ziel)
  console.log(`\nFertig: ${resolve(ziel)}`)
} catch (e) {
  const ersatz = join(root, 'dist', 'Schul-Apps Online-neu.exe')
  copyFileSync(exe, ersatz)
  console.log(`\n${ziel} ist gesperrt (${e instanceof Error ? e.message.split(',')[0] : e}) – der neue Bau liegt als ${ersatz}.`)
}
