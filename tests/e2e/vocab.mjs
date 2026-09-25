// Oberflächentest Vokabeltest: Schulbuch-Auswahl, „abfragen“ und „Test automatisch erstellen“.
// Seit Paket 7: Zusatzwortschatz (im Buch grau) wird übernommen, gekennzeichnet und NICHT abgefragt.
// Vorher: npm run build. Aufruf: node tests/e2e/vocab.mjs <Ausgabeordner>
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/vokabeltest')
mkdirSync(out, { recursive: true })
// Eigener Datenordner: Die Tests dürfen nichts in den gespeicherten Tests,
// Arbeitsblättern und Klassenarbeiten des Nutzers hinterlassen.
const userData = mkdtempSync(join(tmpdir(), 'schulapps-vokabeltest-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.setViewportSize({ width: 1500, height: 1100 })
// Wartet auf die Oberfläche und schließt den Einrichtungsassistenten, der im leeren Profil erscheint
await warteAufOberflaeche(page)
await page.click('[aria-label="Vokabeltest"]')
await page.waitForSelector('text=Vokabelliste')

const auto = page.getByRole('button', { name: 'Test automatisch erstellen' })
if (await auto.isEnabled()) throw new Error('Ohne Vokabeln darf „Test automatisch erstellen" nicht anklickbar sein')

// Schulbuch wählen: Green Line 4 → Klasse 8 (Quellen stehen seit Paket 7 in Reitern)
await page.getByRole('tab', { name: 'Schulbuch' }).click()
await page.getByRole('combobox', { name: 'Lehrwerk' }).click()
await page.getByRole('option', { name: 'Green Line 4', exact: true }).click()
await page.getByRole('combobox', { name: 'Unit', exact: true }).click()
await page.getByRole('option', { name: 'Unit 1', exact: true }).click()
await page.waitForTimeout(400)
// Abschnitte sind zunächst abgewählt – für den Test alle nehmen
await page.getByRole('button', { name: 'alle' }).click()
await page.waitForTimeout(300)

// Allein mit der Auswahl im Schulbuch ist der Knopf schon nutzbar
if (!(await auto.isEnabled())) throw new Error('Mit Auswahl im Schulbuch muss „Test automatisch erstellen" anklickbar sein')
console.log('„Test automatisch erstellen" wird durch die Schulbuch-Auswahl freigeschaltet')

// Der Hinweis nennt den Zusatzwortschatz, bevor übernommen wird
const hinweis = page.locator('[data-testid="zusatzwortschatz-hinweis"]')
if (!(await hinweis.count())) throw new Error('Hinweis auf den Zusatzwortschatz (grau) fehlt im Reiter „Schulbuch“')
console.log('Hinweis:', (await hinweis.innerText()).trim())

// Vokabeln übernehmen: Alles außer dem Zusatzwortschatz wird abgefragt
await page.getByRole('button', { name: /Vokabeln anzeigen und auswählen/ }).click()
await page.waitForSelector('text=Vokabeln prüfen und festlegen, was abgefragt wird')
await page.screenshot({ path: join(out, '1-uebernahme.png'), fullPage: true })
await page.getByRole('button', { name: 'Bisherige Liste ersetzen' }).click()
await page.waitForTimeout(600)
const zaehler = page.locator('[data-testid="abfrage-zaehler"]')
const badge = await zaehler.innerText()
console.log('nach dem Übernehmen:', badge.trim())
if (/^0 von/.test(badge.trim())) throw new Error('Übernommene Vokabeln müssen abgefragt werden (außer dem Zusatzwortschatz)')
if (!(await auto.isEnabled())) throw new Error('Mit abgefragten Vokabeln muss der Knopf anklickbar sein')

// Paket 7: Die grauen Wörter sind DA, gekennzeichnet und NICHT abgefragt
const grau = page.locator('tr[data-zusatz]')
const grauZahl = await grau.count()
if (!grauZahl) throw new Error('Zusatzwortschatz (grau) wurde nicht übernommen')
if ((await grau.first().locator('[data-testid="zusatz-kennzeichen"]').count()) !== 1) throw new Error('Graues Wort ist nicht gekennzeichnet')
for (let i = 0; i < grauZahl; i++) {
  if (await grau.nth(i).getByRole('checkbox').isChecked()) throw new Error('Ein graues Wort wird abgefragt – es sollte standardmäßig aus sein')
}
const [abgefragt, gesamt] = badge.match(/\d+/g).map(Number)
if (abgefragt !== gesamt - grauZahl) throw new Error(`Zähler passt nicht: ${abgefragt} abgefragt, ${gesamt} gesamt, ${grauZahl} grau`)
console.log(`${grauZahl} graue Wörter übernommen, gekennzeichnet, nicht abgefragt`)
// Einzeln einschaltbar
await grau.first().getByRole('checkbox').check()
await page.waitForTimeout(200)
if (!(await grau.first().getByRole('checkbox').isChecked())) throw new Error('Graues Wort lässt sich nicht einzeln abfragen')
await grau.first().getByRole('checkbox').uncheck()
await grau.first().scrollIntoViewIfNeeded()
await page.screenshot({ path: join(out, 'paket7-zusatzwortschatz.png') })

// Keine abfragen und wieder alle: Der Knopf folgt der Wahl
await page.getByRole('button', { name: 'Keine abfragen' }).click()
await page.waitForTimeout(400)
if (await auto.isEnabled()) throw new Error('Ohne abgefragte Vokabeln darf der Knopf nicht anklickbar sein')
if (!(await page.getByRole('button', { name: /Weiter zu den Testeinstellungen/ }).isDisabled()))
  throw new Error('„Weiter“ muss ohne abgefragte Vokabeln gesperrt sein')
await page.getByRole('button', { name: 'Alle abfragen' }).click()
await page.waitForTimeout(400)
const marked = await zaehler.innerText()
console.log('nach „Alle abfragen":', marked.trim())
if (/^0 von/.test(marked.trim())) throw new Error('„Alle abfragen" hat nichts eingeschaltet')
if (!(await auto.isEnabled())) throw new Error('Mit abgefragten Vokabeln muss der Knopf anklickbar sein')
// Zähler auch in der Fußleiste neben „Weiter“
if (!(await page.locator('[data-testid="abfrage-fuss"]').innerText()).includes('werden abgefragt')) throw new Error('Zähler in der Fußleiste fehlt')

// Testeinstellungen: Klasse und Niveau kommen aus dem Schulbuch
await page.getByRole('button', { name: /Weiter zu den Testeinstellungen/ }).click()
await page.waitForSelector('text=Test einstellen')
await page.waitForTimeout(600)
const grade = await page.getByRole('combobox', { name: 'Klasse' }).inputValue()
const level = await page.getByRole('combobox', { name: 'GER-Niveau' }).inputValue()
/*
 * Bundesland und Schulform kommen aus dem Schulbuch. Entsprechen sie den Einstellungen,
 * stehen sie nur als Zeile da – deshalb wird beides dort gelesen, nicht im Auswahlfeld.
 */
const lerngruppe = (
  (await page
    .locator('text=Niedersachsen · Gymnasium')
    .first()
    .textContent()
    .catch(() => '')) ?? ''
).trim()
console.log(`aus dem Schulbuch übernommen: ${lerngruppe} · Klasse ${grade} · Niveau ${level}`)
await page.screenshot({ path: join(out, '2-einstellungen.png'), fullPage: true })
if (!grade.includes('8')) throw new Error(`Green Line 4 muss Klasse 8 vorschlagen (war: ${grade})`)
if (!lerngruppe.includes('Niedersachsen')) throw new Error(`Bundesland aus dem Buch fehlt (war: ${lerngruppe})`)
if (!lerngruppe.includes('Gymnasium')) throw new Error(`Schulform aus dem Buch fehlt (war: ${lerngruppe})`)
if (!level.trim()) throw new Error('Kein GER-Niveau gesetzt')

console.log('Konsolenfehler:', errors.length ? errors.join(' | ') : 'keine')
await app.close()
// Temporären Datenordner wegräumen – nichts bleibt liegen
rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
if (errors.length) throw new Error('Fehler in der Konsole')
