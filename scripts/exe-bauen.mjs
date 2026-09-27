/**
 * Portable .exe bauen – vollständig außerhalb von Dropbox.
 *
 * Anlass (27.09.2026): Eine frisch gebaute exe blieb beim Start weiß. Im Paket lag zwar
 * `out/renderer/index.html`, der Ordner `out/renderer/assets` aber fehlte komplett: Dropbox
 * hatte ihn zwischen `electron-vite build` und dem Verpacken weggeräumt – dieselbe Ursache,
 * gegen die `bauen.mjs` beim Entwicklungsbau nachprüft. Beim Verpacken gab es diese Prüfung
 * nicht, und electron-builder verpackt stumm, was da ist.
 *
 * Deshalb hier: `electron-vite build --outDir` in einen Ordner außerhalb von Dropbox, eine
 * abgeleitete Bau-Konfiguration, die von dort verpackt (absolute Pfade), danach Kontrolle des
 * Pakets (alle von index.html verlangten Dateien im asar) – und erst dann die Kopie nach
 * `dist/`, die bisherige exe bleibt als `Schul-Apps-alt.exe` liegen.
 *
 * Aufruf: node scripts/exe-bauen.mjs [Arbeitsordner]
 * Ohne Angabe: ein Ordner unter dem Temp-Verzeichnis des Benutzers.
 */
import { execSync } from 'child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const root = process.cwd()
const arbeit = resolve(process.argv[2] ?? join(tmpdir(), 'schul-apps-exe'))
const out = join(arbeit, 'out')
const slash = (p) => p.replace(/\\/g, '/')

mkdirSync(arbeit, { recursive: true })
for (const alt of ['out', 'win-unpacked', 'Schul-Apps.exe']) rmSync(join(arbeit, alt), { recursive: true, force: true })

console.log(`\n1/4 Bauen nach ${out} …`)
execSync('node scripts/prepare-openmoji.mjs', { stdio: 'inherit' })
execSync(`npx electron-vite build --outDir "${out}"`, { stdio: 'inherit' })
const html = readFileSync(join(out, 'renderer/index.html'), 'utf8')
const verlangt = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => m[1])
const fehlt = verlangt.filter((f) => !existsSync(join(out, 'renderer', f)))
if (fehlt.length) {
  console.error(`Nach dem Bauen fehlen Dateien: ${fehlt.join(', ')}`)
  process.exit(1)
}

console.log('\n2/4 Bau-Konfiguration mit absoluten Pfaden …')
let konfig = readFileSync(join(root, 'electron-builder.yml'), 'utf8')
// Die Vorlage hat Windows-Zeilenenden (CRLF) – ohne \r? griffe die Ersetzung nicht, und verpackt würde der (leere) Projektordner out/
const vorher = konfig
konfig = konfig.replace(/files:\r?\n(  - .*\r?\n)+/, `files:\n  - from: ${slash(out)}\n    to: out\n    filter: ['**/*', '!**/*.map']\n  - package.json\n`)
if (konfig === vorher) {
  console.error('Der files-Block in electron-builder.yml wurde nicht gefunden – Skript an die Vorlage anpassen.')
  process.exit(1)
}
konfig = konfig
  .replace('  output: dist', `  output: ${slash(arbeit)}`)
  .replace('  - from: resources/', `  - from: ${slash(join(root, 'resources'))}/`)
  .replace('icon: build/icon.ico', `icon: ${slash(join(root, 'build/icon.ico'))}`)
  .replace('splashImage: build/splash.bmp', `splashImage: ${slash(join(root, 'build/splash.bmp'))}`)
const konfigDatei = join(arbeit, 'builder.yml')
writeFileSync(konfigDatei, konfig, 'utf8')

console.log('\n3/4 Verpacken …')
execSync(`npx electron-builder --win --config "${konfigDatei}"`, { stdio: 'inherit' })

// Kontrolle: Liegt im Paket wirklich alles, was index.html verlangt?
const asar = createRequire(import.meta.url)('@electron/asar')
const inhalt = new Set(asar.listPackage(join(arbeit, 'win-unpacked/resources/app.asar')).map((f) => slash(f).replace(/^\//, '')))
const fehltImPaket = verlangt.filter((f) => !inhalt.has(`out/renderer/${f}`))
if (fehltImPaket.length) {
  console.error(`Im Paket fehlen Dateien: ${fehltImPaket.join(', ')}`)
  process.exit(1)
}
const exe = join(arbeit, 'Schul-Apps.exe')
if (!existsSync(exe)) {
  console.error('Die exe wurde nicht erzeugt.')
  process.exit(1)
}

console.log('\n4/4 Nach dist kopieren …')
mkdirSync(join(root, 'dist'), { recursive: true })
const ziel = join(root, 'dist/Schul-Apps.exe')
if (existsSync(ziel)) copyFileSync(ziel, join(root, 'dist/Schul-Apps-alt.exe'))
try {
  copyFileSync(exe, ziel)
  console.log(`\nFertig: ${ziel} (Paket geprüft, ${verlangt.length} Renderer-Dateien vorhanden). Die bisherige exe liegt als dist/Schul-Apps-alt.exe.`)
} catch (e) {
  /*
   * EBUSY: Die exe in dist läuft gerade (oder Dropbox lädt sie hoch) – eine laufende exe lässt
   * sich unter Windows nicht überschreiben (27.09.2026). Dann liegt der neue Bau daneben.
   */
  const ersatz = join(root, 'dist/Schul-Apps-neu.exe')
  copyFileSync(exe, ersatz)
  console.log(`\ndist/Schul-Apps.exe ist gesperrt (${e instanceof Error ? e.message.split(',')[0] : e}) – läuft das Programm gerade? Der neue Bau liegt als ${ersatz}. Nach dem Beenden umbenennen.`)
}
