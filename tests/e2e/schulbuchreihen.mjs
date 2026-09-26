// Wache für Paket 15 C (Schulbuchreihen) – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/schulbuchreihen.mjs <Ausgabeordner>
//
// Wünsche der Lehrkraft vom 26.09.2026:
//  - Vokabellisten: je Reihe + Landesausgabe + Ausgabe + Verlag eine aufklappbare Karte
//    („Green Line · Niedersachsen · Ausgabe ab 2021 · Klett – 7 Bände"), anfangs zugeklappt.
//  - Filterzeile Fach – Verlag – Reihe – Landesausgabe – Ausgabe; ein Filter erscheint nur, wenn
//    er etwas unterscheidet; eine gemerkte Wahl eines ausgeblendeten Filters filtert nicht weiter.
//  - Sortierung wählbar und gemerkt; „Klassenstufe" = flache Liste mit Reihen-Kennzeichen.
//  - Import eigener Lehrwerke: Reihe/Band aus dem Namen vorgeschlagen, Verlag usw. eintragbar;
//    im Buch-Editor änderbar.
//  - Vokabeltest-Picker gruppiert nach Reihe.
// Bildschirmfotos: paket15-reihen-*.png
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/schulbuchreihen')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-reihen-'))
const csv = join(userData, 'Camden Town 2.csv')
writeFileSync(csv, 'Unit;Abschnitt;Englisch;Deutsch\nUnit 1;Station 1;dog;Hund\nUnit 1;Station 1;cat;Katze\n', 'utf8')

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await app.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1500, 1000)
    win.center()
  }
})

const sichtbar = (loc) => loc.filter({ visible: true })
const shot = (name) => page.screenshot({ path: join(out, `paket15-reihen-${name}.png`), fullPage: true })
const karten = () => sichtbar(page.locator('[data-reihe]'))
const filter = () => sichtbar(page.locator('[data-reihen-filter]'))
const GL = 'Green Line · Niedersachsen · Ausgabe ab 2021 · Klett'

async function vokabellisten() {
  await page.click('[aria-label="Vokabellisten"]')
  await page.waitForSelector('text=Für welche Lerngruppe?')
  await page.waitForTimeout(500)
}
const sortiere = async (label) => {
  await sichtbar(page.getByLabel('Schulbücher sortieren', { exact: true })).click()
  await page.getByRole('option', { name: label, exact: true }).click()
  await page.waitForTimeout(400)
}

try {
  await warteAufOberflaeche(page)

  // ---------- Übersicht mit nur einer Reihe
  console.log('\nNur Green Line')
  await vokabellisten()
  pruefe((await karten().count()) === 1 && (await karten().first().getAttribute('data-reihe')) === GL, `Eine Karte „${GL}"`)
  pruefe((await karten().first().innerText()).includes('7 Bände'), '… mit „7 Bände"')
  pruefe((await karten().first().getAttribute('data-offen')) === 'false', '… anfangs zugeklappt')
  pruefe((await filter().count()) === 0, 'Nur Green Line/Klett/Niedersachsen: kein Filter außer dem Fach')
  await sichtbar(page.getByLabel('Schulbücher sortieren', { exact: true })).click()
  const sortOptionen = await sichtbar(page.getByRole('option')).allTextContents()
  await page.keyboard.press('Escape')
  pruefe(sortOptionen.join('|') === 'Reihe A–Z|Klassenstufe', `Sortierung bietet nur, was etwas bewirkt (${sortOptionen.join(', ')})`)
  await shot('eine-reihe')
  await page.getByRole('button', { name: `${GL} aufklappen` }).click()
  await page.waitForTimeout(400)
  const baende = await sichtbar(page.locator('[data-band]')).evaluateAll((els) => els.map((e) => e.getAttribute('data-band')))
  pruefe(
    baende.join('|') === 'Green Line 1|Green Line 2|Green Line 3|Green Line 4|Green Line 5|Green Line 6|Green Line Transition',
    `Aufgeklappt: die Bände in Reihenfolge (${baende.length})`
  )
  await sortiere('Klassenstufe')
  pruefe((await sichtbar(page.locator('[data-reihen-flach]')).count()) === 1 && (await karten().count()) === 0, '„Klassenstufe": flache Liste')
  pruefe((await sichtbar(page.locator('[data-reihen-kennzeichen]')).count()) === 7, '… jeder Band mit Reihen-Kennzeichen')
  await shot('klassenstufe')

  // ---------- Import einer zweiten Reihe über den Vokabeltest-Picker
  console.log('\nImport')
  await page.click('[aria-label="Vokabeltest"]')
  await page.waitForSelector('text=Vokabelliste')
  await page.getByRole('tab', { name: 'Schulbuch' }).click()
  await page.getByRole('combobox', { name: 'Lehrwerk' }).click()
  const gruppen = await sichtbar(page.locator('[class*="groupLabel"]')).allTextContents()
  pruefe(gruppen.includes(GL), `Vokabeltest: Lehrwerke nach Reihe gruppiert (${gruppen.join(' | ')})`)
  await page.keyboard.press('Escape')
  await sichtbar(page.getByRole('button', { name: 'Lehrwerke verwalten' }))
    .first()
    .click()
  await page.getByRole('menuitem', { name: /Vokabelliste eines Lehrwerks importieren/ }).click()
  await page.waitForTimeout(400)
  await sichtbar(page.locator('.mantine-Modal-content input[type=file]'))
    .first()
    .setInputFiles(csv)
    .catch(async () => page.locator('.mantine-Modal-content input[type=file]').first().setInputFiles(csv))
  await page.waitForTimeout(800)
  const angaben = sichtbar(page.locator('[data-lehrwerk-angaben]'))
  const reihe = await angaben.getByLabel('Reihe', { exact: true }).inputValue()
  const band = await angaben.getByLabel('Band', { exact: true }).inputValue()
  pruefe(reihe === 'Camden Town' && band === '2', `Vorschlag aus dem Namen: Reihe „${reihe}", Band „${band}"`)
  await angaben.getByLabel('Verlag', { exact: true }).fill('Westermann')
  await angaben.getByLabel('Landesausgabe', { exact: true }).fill('Bayern')
  await page.keyboard.press('Escape').catch(() => undefined)
  await angaben.getByLabel('Ausgabe', { exact: true }).fill('ab 2019')
  await page.waitForTimeout(300)
  await shot('import')
  await sichtbar(page.getByRole('button', { name: /Lehrwerk\(e\) speichern/ })).click()
  await page.waitForTimeout(800)
  const gespeichert = await page.evaluate(async () => (await window.api.textbooks.list()).find((b) => b.name === 'Camden Town 2'))
  pruefe(
    gespeichert?.reihe === 'Camden Town' &&
      gespeichert?.band === '2' &&
      gespeichert?.publisher === 'Westermann' &&
      gespeichert?.edition === 'Bayern' &&
      gespeichert?.ausgabe === 'ab 2019',
    `Gespeichert mit Reihe, Band, Verlag, Landesausgabe, Ausgabe (${JSON.stringify(gespeichert && [gespeichert.reihe, gespeichert.band, gespeichert.publisher, gespeichert.edition, gespeichert.ausgabe])})`
  )

  // ---------- Filter erscheinen, Sortierung gemerkt
  console.log('\nFilter')
  await vokabellisten()
  pruefe((await sichtbar(page.locator('[data-reihen-flach]')).count()) === 1, 'Sortierung „Klassenstufe" ist gemerkt')
  await sortiere('Reihe A–Z')
  const titel = await karten().evaluateAll((els) => els.map((e) => e.getAttribute('data-reihe')))
  pruefe(titel.join('|') === `Camden Town · Bayern · Ausgabe ab 2019 · Westermann|${GL}`, `Zwei Karten, A–Z (${titel.join(' / ')})`)
  const felder = await filter().evaluateAll((els) => els.map((e) => e.getAttribute('data-reihen-filter')))
  pruefe(felder.join('|') === 'verlag|reihe|land|ausgabe', `Filterzeile nach dem Fach: Verlag – Reihe – Landesausgabe – Ausgabe (${felder.join(', ')})`)
  await sichtbar(page.getByLabel('Verlag', { exact: true })).click()
  await page.getByRole('option', { name: 'Westermann', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  pruefe(
    (await karten().count()) === 1 && (await karten().first().getAttribute('data-reihe')).startsWith('Camden Town'),
    'Verlag „Westermann": nur Camden Town'
  )
  await shot('filter')

  // ---------- Buch-Editor: Ausgabe ändern
  await page.getByRole('button', { name: /^Camden Town .* aufklappen$/ }).click()
  await sichtbar(page.getByRole('button', { name: 'Vokabeln bearbeiten' }))
    .first()
    .click()
  await page.waitForSelector('text=Unit und Abschnitt wählen')
  await page.getByRole('button', { name: /Reihe und Ausgabe/ }).click()
  await page.waitForTimeout(300)
  await sichtbar(page.locator('[data-lehrwerk-angaben]')).getByLabel('Ausgabe', { exact: true }).fill('ab 2020')
  await page.waitForTimeout(300)
  await shot('editor')
  await page.getByRole('button', { name: 'Zurück zur Übersicht' }).click()
  await page.waitForTimeout(800)
  const nachEditor = await page.evaluate(async () => (await window.api.textbooks.list()).find((b) => b.name === 'Camden Town 2')?.ausgabe)
  pruefe(nachEditor === 'ab 2020', `Im Buch-Editor geänderte Ausgabe gespeichert (${nachEditor})`)

  // ---------- Gemerkte Wahl eines verschwundenen Filters filtert nicht still weiter
  await page.evaluate(async () => {
    const id = (await window.api.textbooks.list()).find((b) => b.name === 'Camden Town 2')?.id
    if (id) await window.api.textbooks.delete(id)
  })
  await page.reload()
  await warteAufOberflaeche(page)
  await vokabellisten()
  pruefe((await filter().count()) === 0, 'Nach dem Entfernen der zweiten Reihe: Filter wieder ausgeblendet')
  pruefe(
    (await karten().count()) === 1 && (await karten().first().getAttribute('data-reihe')) === GL,
    'Die gemerkte Wahl „Westermann" filtert nicht still weiter'
  )
} catch (e) {
  problems.push(`Abbruch der Wache: ${e.message}`)
  await page.screenshot({ path: join(out, 'paket15-reihen-fehler.png') }).catch(() => undefined)
} finally {
  await Promise.race([app.close().catch(() => undefined), new Promise((r) => setTimeout(r, 10000))])
  try {
    app.process().kill()
  } catch {
    // schon beendet
  }
  await new Promise((r) => setTimeout(r, 500))
  rmSync(userData, { recursive: true, force: true, maxRetries: 5 })
}

const echteFehler = errors.filter((e) => !/ResizeObserver/.test(e))
if (echteFehler.length) problems.push(`Fehler in der Konsole: ${echteFehler.slice(0, 3).join(' | ')}`)
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
