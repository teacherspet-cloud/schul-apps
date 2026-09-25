// Sichtprüfung der Aufgabenzahl-Felder – OHNE KI.
// Aufruf: node tests/e2e/aufgabenzahl.mjs
//
// Zwei verschiedene Größen, deshalb zwei Felder: „Zahl der Aufgaben" zählt Aufgabenblöcke,
// „Fragen je Hörtext" die Items innerhalb einer Verstehensaufgabe. Das zweite darf nur bei
// Hör- und Leseverstehen erscheinen – sonst verspricht es etwas, das es nicht steuert.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const userData = mkdtempSync(join(tmpdir(), 'schulapps-aufgaben-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1500, 1000)
    win.center()
  }
})
await warteAufOberflaeche(page)

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(900)

const feld = (name) => page.getByLabel(name, { exact: true }).filter({ visible: true }).first()
const waehle = async (label, option) => {
  await feld(label).click()
  await page.getByRole('option', { name: option, exact: true }).click()
  await page.waitForTimeout(400)
}

await waehle('Fach', 'Englisch')
await page.waitForTimeout(600)

const aufgaben = feld('Zahl der Aufgaben')
const daAufgaben = await aufgaben.count()
const platzhalter = daAufgaben ? await aufgaben.getAttribute('placeholder') : ''
console.log('Feld „Zahl der Aufgaben":', daAufgaben ? `da, Platzhalter „${platzhalter}"` : 'FEHLT')

// Ohne Verstehens-Schwerpunkt darf das Fragen-Feld nicht da sein
const ohne = await page.getByLabel(/Fragen (je Hörtext|zum Text)/).count()
console.log('Fragen-Feld bei „Gemischt":', ohne === 0 ? 'nicht vorhanden (richtig)' : 'VORHANDEN (falsch)')

await waehle('Kompetenzschwerpunkt', 'Hörverstehen (Listening)')
await page.waitForTimeout(700)
const hoeren = page.getByLabel('Fragen je Hörtext', { exact: true }).filter({ visible: true }).first()
const daHoeren = await hoeren.count()
console.log('Fragen-Feld bei Hörverstehen:', daHoeren ? `da, Platzhalter „${await hoeren.getAttribute('placeholder')}"` : 'FEHLT')

// Eine Zahl eintragen: Die Beschreibung muss sie verbindlich nennen
if (daAufgaben) {
  await feld('Zahl der Aufgaben').fill('6')
  await page.waitForTimeout(500)
}
if (daHoeren) {
  await hoeren.fill('7')
  await page.waitForTimeout(500)
}
const texte = await page.evaluate(() => document.body.innerText)
console.log('Rückmeldung Aufgaben:', texte.match(/Es entstehen genau \d+ Aufgaben/)?.[0] ?? 'KEINE')
console.log('Rückmeldung Fragen:', texte.match(/Genau \d+ Fragen[^.]*\./)?.[0] ?? 'KEINE')

await waehle('Kompetenzschwerpunkt', 'Leseverstehen')
await page.waitForTimeout(700)
const lesen = await page.getByLabel('Fragen zum Text', { exact: true }).filter({ visible: true }).count()
console.log('Fragen-Feld bei Leseverstehen:', lesen ? 'da' : 'FEHLT')

const probleme = []
if (!daAufgaben) probleme.push('Das Feld „Zahl der Aufgaben" fehlt')
if (!/automatisch \(\d+–\d+\)/.test(platzhalter ?? '')) probleme.push(`Der Platzhalter nennt den Richtwert nicht: „${platzhalter}"`)
if (ohne !== 0) probleme.push('Das Fragen-Feld erscheint auch ohne Verstehens-Schwerpunkt')
if (!daHoeren) probleme.push('Bei Hörverstehen fehlt „Fragen je Hörtext"')
if (!lesen) probleme.push('Bei Leseverstehen fehlt „Fragen zum Text"')
if (!/Es entstehen genau 6 Aufgaben/.test(texte)) probleme.push('Die eingetragene Aufgabenzahl wird nicht als verbindlich gemeldet')
if (!/Genau 7 Fragen/.test(texte)) probleme.push('Die eingetragene Fragenzahl wird nicht als verbindlich gemeldet')
const react = errors.filter((e) => /Maximum update depth|error #\d+/i.test(e))
if (react.length) probleme.push(`Fehler im Fenster: ${react[0].slice(0, 120)}`)

await app.close()
rmSync(userData, { recursive: true, force: true })

if (probleme.length) {
  console.error('\nProbleme:\n- ' + probleme.join('\n- '))
  process.exit(1)
}
console.log('\nBeide Felder tragen.')
