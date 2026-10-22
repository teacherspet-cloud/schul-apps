/**
 * Lizenzübersicht erzeugen (22.10.2026, Prüfung des Schulträgers, Punkt 12): liest die Lizenzangaben der direkt
 * eingebundenen npm-Pakete (node_modules/<paket>/package.json) und der mitgelieferten Fremddaten und schreibt
 * src/shared/lizenzListe.json – angezeigt in Verwaltung › Info (LizenzUebersicht.tsx).
 *
 * Aufruf: node scripts/lizenzen-erzeugen.mjs (läuft auch vor `npm run build`, siehe package.json „prebuild“).
 * Ohne Netz, ohne Installation – fehlt ein Paket in node_modules, steht „unbekannt“ da.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const lies = (p) => JSON.parse(readFileSync(p, 'utf8'))

/** Werkzeuge, die nur zum Bauen/Prüfen dienen und nicht im Programm landen */
const NUR_ENTWICKLUNG = /^(@types\/|typescript$|vite$|vitest|electron-vite|electron-builder|@vitejs\/|prettier|eslint|@capacitor\/cli|@capacitor\/assets|playwright|tsx$|esbuild$)/

function lizenzVon(info) {
  if (typeof info.license === 'string') return info.license
  if (info.license && typeof info.license.type === 'string') return info.license.type
  if (Array.isArray(info.licenses)) return info.licenses.map((l) => l.type ?? l).join(' OR ')
  return 'unbekannt'
}

function adresseVon(info) {
  const r = typeof info.repository === 'string' ? info.repository : info.repository?.url
  const roh = info.homepage || r || ''
  return String(roh)
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '')
    .replace(/^github:/, 'https://github.com/')
}

const paket = lies(join(WURZEL, 'package.json'))
const namen = [...Object.keys(paket.dependencies ?? {}), ...Object.keys(paket.devDependencies ?? {})].sort()
const pakete = namen.map((name) => {
  const datei = join(WURZEL, 'node_modules', ...name.split('/'), 'package.json')
  const info = existsSync(datei) ? lies(datei) : {}
  return {
    name,
    version: info.version ?? '',
    lizenz: lizenzVon(info),
    autor: typeof info.author === 'string' ? info.author : info.author?.name ?? '',
    adresse: adresseVon(info),
    ...(NUR_ENTWICKLUNG.test(name) ? { entwicklung: true } : {})
  }
})

const daten = [
  {
    name: 'OpenMoji – Emoji-Symbole (Bildauswahl)',
    lizenz: 'CC BY-SA 4.0',
    autor: 'OpenMoji – HfG Schwäbisch Gmünd',
    adresse: 'https://openmoji.org',
    hinweis: 'Alle Symbole von OpenMoji – das offene Emoji-Projekt. Lizenz: CC BY-SA 4.0.'
  }
]
// Schulverzeichnis: Quellen mit Lizenz stehen in der Datei selbst
const schulen = join(WURZEL, 'resources', 'schulen', 'schulen.json')
if (existsSync(schulen)) {
  try {
    for (const q of lies(schulen).quellen ?? [])
      daten.push({ name: `Schulverzeichnis: ${q.name}`, lizenz: q.lizenz ?? 'siehe Quelle', autor: '', adresse: q.url ?? '', hinweis: q.laender ? `Länder: ${[].concat(q.laender).join(', ')}` : '' })
  } catch {
    /* Datei unlesbar – Eintrag fehlt dann */
  }
}
daten.push({
  name: 'Medienbank (Vokabelbilder)',
  lizenz: 'je Bild',
  autor: '',
  adresse: '',
  hinweis: 'KI-erzeugte Bilder sind als „KI-generiert“ gekennzeichnet; Bilder aus Wikimedia Commons, Openverse und Pixabay tragen ihren Nachweis (Urheber, Lizenz) am Bild. Bilder mit NC- oder ND-Lizenz werden nicht verwendet.'
})

const aus = { erzeugt: new Date().toISOString().slice(0, 10), pakete, daten }
writeFileSync(join(WURZEL, 'src', 'shared', 'lizenzListe.json'), JSON.stringify(aus, null, 1) + '\n')
console.log(`Lizenzübersicht: ${pakete.length} Pakete, ${daten.length} Datenquellen`)
