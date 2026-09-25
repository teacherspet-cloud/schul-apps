// Wache für Formeln in den ANTWORTFORMEN – ohne KI (vorher: npm run build).
// Aufruf: node tests/e2e/formeln-in-antworten.mjs <Ausgabeordner>
//
// Anlass ist eine Lernzielkontrolle zu den Potenzgesetzen: In der Arbeitsanweisung stand
// sauber gesetzt „Berechne die Werte der Potenzen (−3)⁴ …", in der Ausfülltabelle darunter
// aber wörtlich `$(-3)^4$`, und in der Zuordnung `$b^4\cdot b^3=b^7$`. Ursache war, dass die
// Zellen der Antwortformen über `Editable` liefen, das reinen Text ausgibt, während die
// Anweisung über `RichText` lief.
//
// Geprüft wird deshalb das Sichtbare: In Ausfülltabelle, Zuordnung und Ankreuzfrage steht
// kein Dollarzeichen mehr, und an ihrer Stelle steht eine gesetzte Formel.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/formeln-in-antworten')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-formeln-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1500, 1000)
    win.center()
  }
})
await warteAufOberflaeche(page)

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
const info = await page.evaluate(() => window.__selftest.mathSheet())
console.log('Aufgaben gesetzt:', info.blocks)
await page.waitForSelector('.ws-editor-pages:visible', { timeout: 30000 })
await page.waitForTimeout(1500)

const seen = await page.evaluate(() => {
  // Nur die sichtbaren Seiten: zum Messen der Seitenaufteilung rendert die App dasselbe
  // Blatt zusätzlich unsichtbar.
  const wurzel = document.querySelector('.ws-editor-pages') ?? document
  const text = (e) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const bereich = (sel) => {
    const e = wurzel.querySelector(sel)
    return e ? { text: text(e), formeln: e.querySelectorAll('.rt-math').length } : null
  }
  return {
    anweisungen: [...wurzel.querySelectorAll('.ws-task-instruction')].map((e) => ({ text: text(e), formeln: e.querySelectorAll('.rt-math').length })),
    tabelle: bereich('.ws-table-fill'),
    zuordnung: bereich('.ws-match'),
    ankreuzen: bereich('.ws-mc-options'),
    // Zweite Fundstelle: die Zeilen einer Materialtabelle liefen richtig, der Kopf nicht
    tabellenkopf: bereich('.ws-table:not(.ws-table-fill) thead'),
    // Dritte Fundstelle: Titel und Kurzbeschreibung des Deckblatts
    deckblattTitel: bereich('.ws-cover-title'),
    deckblattText: bereich('.ws-cover-blurb'),
    // Der Kern der Beschwerde: nirgends auf dem Blatt darf noch ein Dollarzeichen stehen
    dollar: text(wurzel).match(/\$[^$]{1,30}\$/g) ?? []
  }
})

for (const [name, b] of Object.entries({
  Ausfülltabelle: seen.tabelle,
  Zuordnung: seen.zuordnung,
  Ankreuzfrage: seen.ankreuzen,
  Tabellenkopf: seen.tabellenkopf,
  'Deckblatt-Titel': seen.deckblattTitel,
  'Deckblatt-Text': seen.deckblattText
})) {
  console.log(`${name}: ${b ? `${b.formeln} Formel(n) · „${b.text.slice(0, 70)}"` : 'nicht gefunden'}`)
}
console.log('Anweisungen:', seen.anweisungen.map((a) => `${a.formeln} Formel(n)`).join(' · '))

await page.screenshot({ path: join(out, 'formeln.png'), fullPage: false })

const problems = []
if (seen.dollar.length) problems.push(`Dollarzeichen stehen noch auf dem Blatt: ${seen.dollar.slice(0, 4).join(' , ')}`)
// Die Anweisungen liefen schon vorher richtig – sie sind die Vergleichsgröße
if (!seen.anweisungen.some((a) => a.formeln >= 2)) problems.push('Schon die Arbeitsanweisung setzt die Formeln nicht mehr')
const soll = { tabelle: 3, zuordnung: 2, ankreuzen: 3, tabellenkopf: 1, deckblattTitel: 1, deckblattText: 2 }
for (const [teil, n] of Object.entries(soll)) {
  const b = seen[teil]
  if (!b) problems.push(`${teil}: nicht dargestellt`)
  else if (b.formeln < n) problems.push(`${teil}: ${b.formeln} gesetzte Formeln statt ${n}`)
}

const react = errors.filter((e) => /Maximum update depth|Minified React error|#185|#310/i.test(e))
if (react.length) problems.push(`React-Fehler: ${react[0].slice(0, 140)}`)
if (errors.length) console.log('Meldungen im Fenster:\n- ' + errors.slice(0, 4).join('\n- '))

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.error('\nProbleme:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log('\nFormeln werden auch in Tabelle, Zuordnung und Ankreuzfrage gesetzt. Bild in', out)
