// Einmalig: Zwei Maskottchen mit der hinterlegten Bild-KI zeichnen lassen (26.09.2026).
// Läuft mit dem ECHTEN Profil (Schlüssel/Abo der Lehrkraft) – die App darf dabei nicht offen sein.
// Aufruf: node tests/e2e/_maskottchen-zeichnen.mjs <Ausgabeordner>
import { _electron as electron } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/maskottchen')
mkdirSync(out, { recursive: true })
const ziel = join(process.env.APPDATA, 'schul-apps', 'maskottchen')
mkdirSync(ziel, { recursive: true })

const FIGUREN = [
  {
    datei: 'professor-pengu',
    name: 'Professor Pengu',
    wer: 'ein freundlicher, etwas älterer Pinguin als Professor: kleine runde Brille, dunkelblaue Fliege, weißer Bauch, unter dem Flügel ein Buch'
  },
  {
    datei: 'fiona-fuchs',
    name: 'Forscherin Fiona Fuchs',
    wer: 'eine neugierige junge Füchsin als Forscherin: rotes Fell, weiße Schnauze, grünes Halstuch, eine Lupe in der Pfote'
  }
]

const prompt = (f) =>
  [
    `Maskottchen für Unterrichtsmaterialien der Klassen 1 bis 6: ${f.wer}, leicht vermenschlicht, aufrecht stehend, freundlich winkend.`,
    'Ganzfigur, kindgerecht, klare Vektorgrafik-Anmutung mit wenigen Flächen, kräftigen Konturen und weichen Farben.',
    'Reinweißer, einfarbiger Hintergrund ohne Schatten, ohne Text und ohne Schrift im Bild.',
    'Keine realistische Fotografie, keine Marken, keine realen Personen.'
  ].join(' ')

// Eigenes Profil mit den Einstellungen und Schlüsseln der Lehrkraft – ihre App darf offen bleiben
import { copyFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
const userData = mkdtempSync(join(tmpdir(), 'schulapps-maskottchen-'))
for (const f of ['settings.json', 'secrets.json']) copyFileSync(join(process.env.APPDATA, 'schul-apps', f), join(userData, f))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
app.process().stderr?.on('data', (d) => console.log('[main-stderr]', String(d).slice(0, 400)))
app.process().stdout?.on('data', (d) => console.log('[main-stdout]', String(d).slice(0, 400)))
app.on('close', () => console.log('[app] geschlossen'))
const page = await app.firstWindow()
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log(`[renderer ${m.type()}] ${m.text().slice(0, 300)}`))
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
page.on('close', () => console.log('[page] geschlossen'))
await warteAufOberflaeche(page)

for (const f of FIGUREN) {
  console.log(`Zeichne ${f.name} …`)
  const t0 = Date.now()
  const roh = await page.evaluate((p) => window.api.ai.image(p), prompt(f))
  const sauber = await page.evaluate((d) => window.__selftest.clean(d), roh)
  const dataUrl = typeof sauber === 'string' ? sauber : (sauber?.dataUrl ?? roh)
  const bytes = Buffer.from(dataUrl.split(',')[1], 'base64')
  writeFileSync(join(out, `${f.datei}.png`), bytes)
  writeFileSync(join(ziel, `${f.datei}.png`), bytes)
  writeFileSync(join(ziel, `${f.datei}.json`), JSON.stringify({ name: f.name, beschreibung: f.wer, pose: 'winkend', quelle: 'ki', erstellt: new Date().toISOString() }, null, 2))
  console.log(`  fertig in ${Math.round((Date.now() - t0) / 1000)} s, ${Math.round(bytes.length / 1024)} KB → ${join(ziel, f.datei + '.png')}`)
}

await app.close()
