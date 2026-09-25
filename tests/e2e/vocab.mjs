// Oberflächentest Vokabeltest: Schulbuch-Auswahl, Markierung und „Test automatisch erstellen".
// Vorher: npm run build. Aufruf: node tests/e2e/vocab.mjs <Ausgabeordner>
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

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
await page.waitForSelector('text=Schul-Apps')
await page.click('[aria-label="Vokabeltest"]')
await page.waitForSelector('text=Vokabelliste')

const auto = page.getByRole('button', { name: 'Test automatisch erstellen' })
if (await auto.isEnabled()) throw new Error('Ohne Vokabeln darf „Test automatisch erstellen" nicht anklickbar sein')

// Schulbuch wählen: Green Line 4 → Klasse 8
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

// Vokabeln übernehmen: Alles außer den grau gedruckten ist markiert
await page.getByRole('button', { name: /Vokabeln anzeigen und auswählen/ }).click()
await page.waitForSelector('text=Erkannte Vokabeln prüfen')
await page.screenshot({ path: join(out, '1-uebernahme.png'), fullPage: true })
await page.getByRole('button', { name: 'Bisherige Liste ersetzen' }).click()
await page.waitForTimeout(600)
const badge = await page.getByText(/\d+ \/ \d+ im Test/).innerText()
console.log('nach dem Übernehmen:', badge.trim())
if (/^0 \//.test(badge.trim())) throw new Error('Übernommene Vokabeln müssen markiert sein (außer den grau gedruckten)')
if (!(await auto.isEnabled())) throw new Error('Mit markierten Vokabeln muss der Knopf anklickbar sein')

// Abwählen und wieder markieren: Der Knopf folgt der Markierung
await page.getByRole('button', { name: 'Alle entmarkieren' }).click()
await page.waitForTimeout(400)
if (await auto.isEnabled()) throw new Error('Ohne Markierung darf der Knopf nicht anklickbar sein')
await page.getByRole('button', { name: 'Alle markieren' }).click()
await page.waitForTimeout(400)
const marked = await page.getByText(/\d+ \/ \d+ im Test/).innerText()
console.log('nach „Alle markieren":', marked.trim())
if (/^0 \//.test(marked.trim())) throw new Error('„Alle markieren" hat nichts markiert')
if (!(await auto.isEnabled())) throw new Error('Mit markierten Vokabeln muss der Knopf anklickbar sein')

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
if (errors.length) throw new Error('Fehler in der Konsole')
