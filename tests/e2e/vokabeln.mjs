// Wache für „Vokabeln“ (Paket 7) – ohne KI (vorher: npm run build).
// Aufruf: node tests/e2e/vokabeln.mjs <Ausgabeordner> [Ordner für Bildschirmfotos]
//
// Entscheidungen der Lehrkraft (25.09.2026):
//  1. Eine leere Liste lässt sich von Hand anlegen und füllen: Enter legt eine neue Zeile an,
//     „Zeile löschen“ fragt nicht nach – Strg+Z holt sie zurück.
//  2. Zusatzwortschatz (im Buch grau) ist ein Kennzeichen der Zeile, keine zweite Häkchenspalte.
//  3. Listen duplizieren und löschen mit der gemeinsamen Inline-Rückfrage.
//  4. „Test aus dieser Liste“ in der Übersicht führt direkt in einen neuen Vokabeltest –
//     graue Wörter kommen mit, werden aber nicht abgefragt.
//  5. Im Vokabeltest die Quelle „Aus meinen Listen“ (Reiter), beim Anzeigen neu geladen.
//  6. „Als Liste speichern“ überschreibt eine gleichnamige Liste nicht still und speichert
//     Sprache und Jahrgang mit, aber keine Abfrage-Wahl.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/vokabeln')
const shots = resolve(process.argv[3] ?? out)
mkdirSync(out, { recursive: true })
mkdirSync(shots, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-vokabeln-'))

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
await page.setViewportSize({ width: 1400, height: 950 })
await warteAufOberflaeche(page)
const sichtbar = (loc) => loc.filter({ visible: true }).first()
const listen = () => page.evaluate(() => window.api.library.list())
const ruhe = async () => {
  await page.evaluate(() => document.querySelectorAll('.mantine-Notification-root button').forEach((b) => b.click()))
  await page.waitForTimeout(300)
}

// ---------- 1. Leere Liste von Hand anlegen und füllen
await page.click('[aria-label="Vokabellisten"]')
await page.waitForSelector('text=Für welche Lerngruppe?')
await page.getByRole('button', { name: 'Neue Liste' }).click()
await page.waitForSelector('text=Neue Vokabelliste anlegen')
await page.getByRole('textbox', { name: 'Name der Liste' }).fill('Unit 7 – Tiere')
const leer = page.getByRole('button', { name: 'Leere Liste anlegen' })
pruefe(await leer.isEnabled(), 'Neue Liste: „Leere Liste anlegen“ geht ohne Datei')
await leer.click()
await page.waitForSelector('text=Vokabelliste bearbeiten')
const wort = (n) => page.getByRole('textbox', { name: `Wort in Zeile ${n}`, exact: true })
const deutsch = (n) => page.getByRole('textbox', { name: `Deutsch in Zeile ${n}`, exact: true })
const woerter = [
  ['dog', 'Hund'],
  ['cat', 'Katze'],
  ['hamster', 'Hamster'],
  ['guinea pig', 'Meerschweinchen']
]
for (let i = 0; i < woerter.length; i++) {
  await wort(i + 1).fill(woerter[i][0])
  await deutsch(i + 1).fill(woerter[i][1])
  // Enter in der letzten Zeile legt eine neue an – und setzt den Cursor hinein
  if (i < woerter.length - 1) await deutsch(i + 1).press('Enter')
}
pruefe((await page.locator('table.vokabel-tabelle tbody tr').count()) === 4, 'Enter legt jeweils eine neue Zeile an (4 Zeilen)')
// „guinea pig“ als Zusatzwortschatz kennzeichnen – über das ⋯-Menü der Zeile
await page.getByRole('button', { name: 'Weitere Aktionen für „guinea pig“' }).click()
await page.getByRole('menuitem', { name: /Als Zusatzwortschatz \(im Buch grau\) kennzeichnen/ }).click()
await page.waitForTimeout(200)
pruefe((await page.locator('tr[data-zusatz]').count()) === 1, 'Zeile als Zusatzwortschatz (grau) gekennzeichnet – ohne eigene Häkchenspalte')
pruefe((await page.getByRole('checkbox').count()) === 0, 'In der Listen-Tabelle gibt es keine Häkchenspalte (kein „abfragen“, kein „grau“)')
// Zeile löschen ohne Rückfrage, Strg+Z holt sie zurück
await page.getByRole('button', { name: 'Zeile 2 löschen („cat“)' }).click()
await page.waitForTimeout(200)
pruefe((await page.locator('table.vokabel-tabelle tbody tr').count()) === 3, 'Zeile gelöscht – ohne Rückfrage')
await page.locator('body').click({ position: { x: 5, y: 5 } })
await page.keyboard.press('Control+z')
await page.waitForTimeout(300)
pruefe((await wort(2).inputValue()) === 'cat', 'Strg+Z holt die gelöschte Zeile zurück')
await page.screenshot({ path: join(shots, 'paket7-liste-editor.png') })
await ruhe()
await page.getByRole('button', { name: 'Zurück zur Übersicht' }).click()
await page.getByRole('button', { name: 'Neue Liste' }).waitFor()
let gespeichert = (await listen()).find((l) => l.name === 'Unit 7 – Tiere')
pruefe(gespeichert?.entries?.length === 4, `Liste gesichert mit 4 Vokabeln (${gespeichert?.entries?.length})`)
pruefe(
  gespeichert?.entries?.every((e) => !('include' in e)),
  'Die Liste speichert keine Abfrage-Wahl (include)'
)
pruefe(gespeichert?.entries?.find((e) => e.term === 'guinea pig')?.grey === true, 'Kennzeichen „grau“ gespeichert')

// ---------- 2. Duplizieren und Löschen mit Inline-Rückfrage
const karte = (name) => page.locator(`[data-liste="${name}"]`)
await karte('Unit 7 – Tiere')
  .getByRole('button', { name: /^Weitere Aktionen für/ })
  .click()
await page.getByRole('menuitem', { name: 'Kopie anlegen' }).click()
await karte('Unit 7 – Tiere (Kopie)').waitFor({ timeout: 5000 })
pruefe((await karte('Unit 7 – Tiere (Kopie)').count()) === 1, 'Kopie der Liste angelegt')
/*
 * Erst warten, bis das Menü des Originals ganz zu ist (Übergang ~150 ms). Seit die Schulbücher als
 * zugeklappte Reihen-Karte stehen (Paket 15), liegen die Listen ohne Scrollen im Bild; das zweite
 * Menü ging dann auf, solange das erste noch im DOM stand, und „Löschen" traf das Original.
 */
await page.waitForFunction(() => !document.querySelector('[role="menu"]'), null, { timeout: 5000 })
await karte('Unit 7 – Tiere (Kopie)')
  .getByRole('button', { name: /^Weitere Aktionen für/ })
  .click()
await page.getByRole('menuitem', { name: 'Löschen' }).click()
pruefe(
  await karte('Unit 7 – Tiere (Kopie)')
    .getByText(/endgültig löschen\?/)
    .isVisible(),
  'Löschen fragt inline nach (kein Browser-Dialog)'
)
await page.screenshot({ path: join(shots, 'paket7-vokabellisten-uebersicht.png') })
await karte('Unit 7 – Tiere (Kopie)').getByRole('button', { name: 'Löschen', exact: true }).click()
await page.waitForTimeout(500)
pruefe(!(await listen()).some((l) => l.name === 'Unit 7 – Tiere (Kopie)'), 'Kopie gelöscht')

// ---------- 3. „Test aus dieser Liste“
await karte('Unit 7 – Tiere').getByRole('button', { name: 'Test aus dieser Liste' }).click()
await page.waitForSelector('text=Vokabelliste', { timeout: 10000 })
await page.waitForTimeout(800)
const aktiv = await page.evaluate(() => document.querySelector('[aria-label="Vokabeltest"]')?.getAttribute('data-active'))
pruefe(aktiv === 'true', 'Der Vokabeltest ist vorn')
pruefe(
  (await sichtbar(page.getByRole('textbox', { name: 'Name des Vokabeltests' })).inputValue()) === 'Unit 7 – Tiere',
  'Der neue Test trägt den Namen der Liste'
)
const zaehler = (await sichtbar(page.locator('[data-testid="abfrage-zaehler"]')).innerText()).trim()
pruefe(zaehler === '3 von 4 werden abgefragt', `Graues Wort kommt mit, wird aber nicht abgefragt („${zaehler}“)`)
pruefe(!(await sichtbar(page.locator('tr[data-zusatz]')).getByRole('checkbox').isChecked()), 'Die graue Zeile steht auf „nicht abfragen“')
await page.screenshot({ path: join(shots, 'paket7-test-aus-liste.png') })

// ---------- 4. Quelle „Aus meinen Listen“
await ruhe()
await page.getByRole('tab', { name: 'Aus meinen Listen' }).click()
await sichtbar(page.locator('[data-liste="Unit 7 – Tiere"]')).waitFor({ timeout: 5000 })
pruefe(await sichtbar(page.locator('[data-liste="Unit 7 – Tiere"]')).isVisible(), 'Reiter „Aus meinen Listen“ zeigt die Liste')
// Eine neue Liste erscheint beim nächsten Anzeigen, ohne Neustart
await page.evaluate(() =>
  window.api.library.save({ id: 'p7-neu', name: 'Leçon 3', updatedAt: '', language: 'fr', entries: [{ term: 'le chien', translation: 'der Hund' }] })
)
await page.getByRole('tab', { name: 'Datei hineinziehen' }).click()
await page.getByRole('tab', { name: 'Aus meinen Listen' }).click()
await page.waitForTimeout(500)
pruefe(!(await page.locator('[data-liste="Leçon 3"]').filter({ visible: true }).count()), 'Französische Liste ist bei Englisch ausgefiltert')
await sichtbar(page.getByRole('combobox', { name: 'Fach' })).click()
await page.getByRole('option', { name: 'Alle Fächer' }).click()
await page.waitForTimeout(300)
pruefe(
  (await page.locator('[data-liste="Leçon 3"]').filter({ visible: true }).count()) === 1,
  'Mit „Alle Fächer“ erscheint die eben gespeicherte Liste (neu geladen)'
)
await page.screenshot({ path: join(shots, 'paket7-aus-meinen-listen.png') })
await sichtbar(page.locator('[data-liste="Unit 7 – Tiere"]')).getByRole('button', { name: 'Übernehmen' }).click()
await page.waitForSelector('text=Vokabeln prüfen und festlegen, was abgefragt wird')
await page.getByRole('button', { name: 'An Liste anhängen' }).click()
await page.waitForTimeout(400)
const nachAnhaengen = (await sichtbar(page.locator('[data-testid="abfrage-zaehler"]')).innerText()).trim()
pruefe(nachAnhaengen === '6 von 8 werden abgefragt', `Übernehmen aus der Liste hängt an, graue bleiben aus („${nachAnhaengen}“)`)

// ---------- 5. „Als Liste speichern“ überschreibt nicht still
await ruhe()
await page.getByRole('button', { name: 'Als Liste speichern' }).click()
await page.locator('[data-testid="liste-rueckfrage"]').waitFor({ timeout: 5000 })
pruefe(await page.locator('[data-testid="liste-rueckfrage"]').isVisible(), 'Gleichnamige Liste: Rückfrage statt stillem Überschreiben')
await page.screenshot({ path: join(shots, 'paket7-als-liste-speichern.png') })
await page.getByRole('button', { name: 'Als „Unit 7 – Tiere (2)“ speichern' }).click()
await page.waitForTimeout(600)
const alle = await listen()
const zwei = alle.find((l) => l.name === 'Unit 7 – Tiere (2)')
pruefe(Boolean(zwei) && alle.find((l) => l.name === 'Unit 7 – Tiere')?.entries.length === 4, 'Kopie „(2)“ gespeichert, das Original ist unverändert')
pruefe(zwei?.language === 'en' && zwei?.entries?.length === 8, `Mit Sprache gespeichert (${zwei?.language}, ${zwei?.entries?.length} Vokabeln)`)
pruefe(
  zwei?.entries?.every((e) => !('include' in e)),
  'Ohne Abfrage-Wahl gespeichert'
)

await app.close()
rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nAlle Prüfungen bestanden.')
