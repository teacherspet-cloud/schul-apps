// Oberflächentest „Vokabellisten": Lerngruppe wählen, Schulbuch-Vokabeln bearbeiten,
// als Zusatzwortschatz (grau) kennzeichnen, speichern – und der Wizard für neue Listen.
// Seit Paket 7 dieselbe Tabelle wie im Vokabeltest: „grau“ ist ein Kennzeichen, umgeschaltet über das ⋯-Menü der Zeile.
// Vorher: npm run build. Aufruf: node tests/e2e/vocablist.mjs <Ausgabeordner>
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/vokabellisten')
mkdirSync(out, { recursive: true })
// Eigener Datenordner: Die Tests dürfen nichts in den Daten des Nutzers hinterlassen.
const userData = mkdtempSync(join(tmpdir(), 'schulapps-vokabellisten-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
/**
 * Meldungen wegräumen: Sie erscheinen verzögert und legen sich über die Knöpfe.
 * Erst auf die Meldung warten, dann ihren Schließen-Knopf drücken.
 */
const quiet = async () => {
  await page
    .locator('.mantine-Notification-root')
    .first()
    .waitFor({ timeout: 10000 })
    .catch(() => undefined)
  await page.evaluate(() => document.querySelectorAll('.mantine-Notification-root button').forEach((b) => b.click()))
  await page.waitForFunction(() => document.querySelectorAll('.mantine-Notification-root').length === 0, { timeout: 20000 }).catch(() => undefined)
}

await page.setViewportSize({ width: 1500, height: 1100 })
// Wartet auf die Oberfläche und schließt den Einrichtungsassistenten, der im leeren Profil erscheint
await warteAufOberflaeche(page)
await page.click('[aria-label="Vokabellisten"]')
await page.waitForSelector('text=Für welche Lerngruppe?')

/*
 * Vorgabe: Niedersachsen, Gymnasium, Englisch.
 *
 * Bundesland und Schulform stehen nicht mehr als Auswahlfelder da, sondern als Zeile –
 * sie kommen aus den Einstellungen und werden hier nicht erneut abgefragt. Geprüft wird
 * deshalb die Zeile; das Fach bleibt ein Auswahlfeld dieses Programms.
 */
const value = async (name) => (await page.getByRole('combobox', { name }).inputValue()).trim()
const lerngruppe =
  (await page
    .locator('text=Niedersachsen · Gymnasium')
    .first()
    .textContent()
    .catch(() => '')) ?? ''
console.log(`Vorgabe: ${lerngruppe.trim()} · ${await value('Fach')}`)
if (!lerngruppe.includes('Niedersachsen')) throw new Error('Bundesland ist nicht auf Niedersachsen voreingestellt')
if (!lerngruppe.includes('Gymnasium')) throw new Error('Schulform ist nicht auf Gymnasium voreingestellt')
if ((await value('Fach')) !== 'Englisch') throw new Error('Fach ist nicht auf Englisch voreingestellt')

const books = await page.getByRole('button', { name: 'Vokabeln bearbeiten' }).count()
console.log(`Schulbücher für diese Lerngruppe: ${books}`)
if (books < 7) throw new Error(`Es fehlen Lehrwerke (gefunden: ${books})`)
await page.screenshot({ path: join(out, '1-uebersicht.png'), fullPage: true })

// Ein anderes Fach zeigt keine englischen Lehrwerke
await page.getByRole('combobox', { name: 'Fach' }).click()
await page.getByRole('option', { name: 'Französisch', exact: true }).click()
await page.waitForTimeout(400)
if (
  !(await page
    .getByText(/ist noch kein Lehrwerk hinterlegt/)
    .first()
    .isVisible())
)
  throw new Error('Für Französisch dürfen keine englischen Lehrwerke erscheinen')
await page.getByRole('combobox', { name: 'Fach' }).click()
await page.getByRole('option', { name: 'Englisch', exact: true }).click()
await page.waitForTimeout(400)

// Schulbuch bearbeiten: Vokabel ändern und grau markieren
await page.getByRole('button', { name: 'Vokabeln bearbeiten' }).first().click()
await page.waitForSelector('text=Unit und Abschnitt wählen')
// Der Beispielsatz des Schulbuchs steht in einem eigenen Feld und muss sichtbar sein
const beispiele = page.getByRole('textbox', { name: /^Beispielsatz in Zeile/ })
const mitBeispiel = await beispiele.evaluateAll((els) => els.filter((e) => e.value.trim()).length)
console.log('Zeilen mit Beispielsatz:', mitBeispiel, 'von', await beispiele.count())
if (!mitBeispiel) throw new Error('Im Schulbuch-Editor werden die Beispielsätze nicht angezeigt')
const ersterSatz = await beispiele.first().inputValue()
const graueVorher = await page.locator('tr[data-zusatz]').count()
const ersteZeile = page.locator('table.vokabel-tabelle tbody tr').first()
const warGrau = (await ersteZeile.getAttribute('data-zusatz')) !== null
await ersteZeile.getByRole('button', { name: /^Weitere Aktionen für/ }).click()
await page.getByRole('menuitem', { name: warGrau ? /Nicht mehr als Zusatzwortschatz/ : /Als Zusatzwortschatz/ }).click()
await page.waitForTimeout(200)
if ((await page.locator('tr[data-zusatz]').count()) === graueVorher)
  throw new Error('Das Kennzeichen „Zusatzwortschatz (im Buch grau)“ ließ sich nicht umschalten')
const grauSoll = !warGrau
await page.getByRole('textbox', { name: /^Wort in Zeile 1$/ }).fill('bearbeitet')
await page.waitForTimeout(300)
await page.screenshot({ path: join(out, '2-schulbuch.png'), fullPage: true })
// Kein Klick auf „Speichern" mehr (seit 25.09.2026): Gespeichert wird von selbst, und
// „Zurück zur Übersicht" sichert Anstehendes sofort. Genau das prüft der direkte Rückweg.
await quiet()
await page.getByRole('button', { name: 'Zurück zur Übersicht' }).click()
await page.getByRole('button', { name: 'Neue Liste' }).waitFor()
await page
  .getByText('eigene Fassung')
  .first()
  .waitFor({ timeout: 5000 })
  .catch(() => undefined)
if (!(await page.getByText('eigene Fassung').first().isVisible())) throw new Error('Die bearbeitete Fassung wird in der Übersicht nicht angezeigt')
console.log('Schulbuch bearbeitet und gespeichert (eigene Fassung)')

// Die Änderung steht beim erneuten Öffnen da
await page.getByRole('button', { name: 'Vokabeln bearbeiten' }).first().click()
await page.waitForSelector('text=Unit und Abschnitt wählen')
const again = await page.getByRole('textbox', { name: /^Wort in Zeile 1$/ }).inputValue()
console.log('nach erneutem Öffnen steht dort:', again)
if (again !== 'bearbeitet') throw new Error(`Die Änderung wurde nicht gespeichert (gelesen: ${again})`)
// Beim Speichern dürfen weder die Beispielsätze noch die graue Markierung verlorengehen
const satzDanach = await page
  .getByRole('textbox', { name: /^Beispielsatz in Zeile/ })
  .first()
  .inputValue()
if (satzDanach !== ersterSatz) throw new Error(`Der Beispielsatz ging beim Speichern verloren (vorher „${ersterSatz}", jetzt „${satzDanach}")`)
if (((await page.locator('table.vokabel-tabelle tbody tr').first().getAttribute('data-zusatz')) !== null) !== grauSoll)
  throw new Error('Das Kennzeichen „grau“ wurde nicht gespeichert')
console.log('Beispielsatz und graue Markierung bleiben erhalten')
await page.getByRole('button', { name: 'Zurück zur Übersicht' }).click()
await page.getByRole('button', { name: 'Neue Liste' }).waitFor()

// Wizard für neue Listen
await page.getByRole('button', { name: 'Neue Liste' }).click()
await page.waitForSelector('text=Neue Vokabelliste anlegen')
if (!(await page.getByText(/Eine oder mehrere Dateien hierher ziehen/).isVisible())) throw new Error('Im Wizard fehlt der Einfügebereich')
await page.screenshot({ path: join(out, '3-wizard.png'), fullPage: true })
await page.getByRole('button', { name: 'Abbrechen' }).click()
console.log('Wizard öffnet mit Einfügebereich')

console.log('Konsolenfehler:', errors.length ? errors.join(' | ') : 'keine')
await app.close()
if (errors.length) throw new Error('Fehler in der Konsole')
// Temporären Datenordner wegräumen – nichts bleibt liegen
rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
