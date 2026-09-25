// Oberflächentest Klassenarbeiten (vorher: npm run build). Aufruf: node tests/e2e/exam.mjs <Ausgabeordner>
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { warteAufOberflaeche } from './warten.mjs'
const out = resolve(process.argv[2] ?? 'test-results/klassenarbeit')
mkdirSync(out, { recursive: true })
// Eigener Datenordner: Die Tests dürfen nichts in den gespeicherten Tests,
// Arbeitsblättern und Klassenarbeiten des Nutzers hinterlassen.
const userData = mkdtempSync(join(tmpdir(), 'schulapps-exam-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.setViewportSize({ width: 1500, height: 1200 })
// Wartet auf die Oberfläche und schließt den Einrichtungsassistenten, der im leeren Profil erscheint
await warteAufOberflaeche(page)
await page.click('[aria-label="Klassenarbeiten"]')
await page.waitForSelector('text=Rahmen der Arbeit')
// Vokabeln aus dem Schulbuch zuordnen: Buch → Unit → Abschnitte, Kästen zuschaltbar
await page.getByRole('combobox', { name: 'Schulbuch' }).click()
await page.getByRole('option', { name: 'Green Line 1' }).click()
await page.getByRole('combobox', { name: 'Unit', exact: true }).click()
await page.getByRole('option', { name: 'Unit 1', exact: true }).click()
// Abschnitte sind zunächst abgewählt – für die Zählprobe alle nehmen
await page.getByRole('button', { name: 'alle' }).click()
await page.waitForTimeout(300)
const boxSwitch = page.getByRole('switch', { name: /Vokabeln aus Kästen einbeziehen/ })
const takeButton = page.getByRole('button', { name: /Vokabeln übernehmen/ })
const n = (s) => Number(s.match(/\d+/)[0])
const withoutBoxes = await takeButton.innerText()
await boxSwitch.click()
const withBoxes = await takeButton.innerText()
console.log(`Unit 1: ${withoutBoxes.trim()} / mit Kästen ${withBoxes.trim()}`)
if (n(withBoxes) <= n(withoutBoxes)) throw new Error('Der Schalter für die Kästen ändert die Zahl der Vokabeln nicht')

// Kästen gehören zu den Abschnitten: Nur Station 1 gewählt → nur deren Kasten-Vokabeln zählen
await page.getByRole('button', { name: 'keine' }).click()
await page.getByText(/^Station 1 \(\d+\)$/).click()
const stationBoxes = n(await page.getByText(/Vokabeln aus Kästen einbeziehen/).innerText())
const stationAll = n(await takeButton.innerText())
await boxSwitch.click()
const stationPlain = n(await takeButton.innerText())
console.log(`Station 1: ${stationPlain} ohne Kästen, ${stationAll} mit, Kasten-Vokabeln ${stationBoxes}`)
if (stationBoxes >= n(withBoxes)) throw new Error('Die Kästen der ganzen Unit werden mitgezählt statt nur die des Abschnitts')
if (stationAll - stationPlain !== stationBoxes) throw new Error('Die Zahl der Kasten-Vokabeln passt nicht zur Auswahl')
await page.getByRole('button', { name: 'alle' }).click()
await boxSwitch.click()
await page.getByRole('button', { name: /Vokabeln übernehmen/ }).click()
await page.waitForSelector('text=/Green Line 1 – Unit 1 \\(mit Kästen\\)/')
await page.screenshot({ path: join(out, 'vokabeln.png'), fullPage: true })

// Fertige Arbeit in den Zustand legen (ohne KI) und anzeigen lassen
const info = await page.evaluate(() => window.__selftest.exam())
await page.waitForTimeout(1500)
const pages = await page.locator('.ws-page').count()
const text = (await page.locator('body').innerText()).trim()
await page.screenshot({ path: join(out, 'arbeit.png'), fullPage: true })
console.log(`Teile: ${info.parts}, Bausteine: ${info.blocks}, Seiten: ${pages}`)
if (text.length < 40) throw new Error('Die Seite ist leer geblieben')
if (pages < 1) throw new Error('Es wurde keine Seite dargestellt')

// Speichern und wieder öffnen: die Arbeit sichert sich selbst und steht in der Bibliothek
await page.waitForTimeout(2000)
await page.getByRole('button', { name: 'Meine Klassenarbeiten' }).click()
await page.waitForSelector('text=Meine Klassenarbeiten')
const saved = await page.getByRole('button', { name: 'Öffnen', exact: true }).count()
await page.screenshot({ path: join(out, 'bibliothek.png'), fullPage: true })
if (saved < 1) throw new Error('Die Arbeit wurde nicht gespeichert')
await page.getByRole('button', { name: 'Öffnen', exact: true }).first().click()
await page.waitForSelector('.ws-page')
console.log(`Bibliothek: ${saved} Arbeit(en), wieder geöffnet`)

// Löschen-Rückfrage mit der Eingabetaste bestätigen
await page.getByRole('button', { name: 'Meine Klassenarbeiten' }).click()
await page.getByRole('button', { name: 'Weitere Aktionen' }).first().click()
await page.getByRole('menuitem', { name: 'Löschen' }).click()
await page.waitForSelector('text=/endgültig löschen/')
await page.keyboard.press('Enter')
await page.waitForTimeout(600)
const left = await page.getByRole('button', { name: 'Öffnen', exact: true }).count()
console.log(`nach Enter im Löschen-Dialog: ${left} Arbeit(en) übrig`)
if (left !== saved - 1) throw new Error('Die Eingabetaste hat die Arbeit nicht gelöscht')
console.log('Konsolenfehler:', errors.length ? errors.join(' | ') : 'keine')
if (errors.length) throw new Error('Fehler in der Konsole')
await app.close()
// Temporären Datenordner wegräumen – nichts bleibt liegen
rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
