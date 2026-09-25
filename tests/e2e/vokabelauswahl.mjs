// Sichtprüfung der Vokabelauswahl für Fremdsprachen-Arbeitsblätter – OHNE KI.
// Aufruf: node tests/e2e/vokabelauswahl.mjs <Ausgabeordner>
//
// Geprüft wird die ganze Kette: Der Knopf erscheint nur bei Fremdsprachen, das Pop-up holt
// Wörter aus dem Schulbuch, die Auswahl landet im Blatt – und mit dem Schulbuchabschnitt
// kommt die Obergrenze des Wortschatzes mit, damit in jungen Jahrgängen keine Wörter aus
// späteren Units vorausgesetzt werden.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/vokabelauswahl')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-vokabeln-'))

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

const feld = (name) => page.getByLabel(name).filter({ visible: true }).first()
const waehle = async (label, option) => {
  await feld(label).click()
  await page.getByRole('option', { name: option, exact: true }).click()
  await page.waitForTimeout(300)
}

// Erst ein Fach OHNE Fremdsprache: Der Knopf darf dort gar nicht erscheinen
await waehle('Fach', 'Mathematik')
await page.waitForTimeout(600)
const beiMathe = await page.getByRole('button', { name: /Vokabellisten und Wörter wählen/ }).count()
console.log('Knopf bei Mathematik:', beiMathe === 0 ? 'nicht vorhanden (richtig)' : 'VORHANDEN (falsch)')

await waehle('Fach', 'Englisch')
await waehle('Jahrgang', 'Klasse 6')
await page.waitForTimeout(800)

const knopf = page
  .getByRole('button', { name: /Vokabellisten und Wörter wählen/ })
  .filter({ visible: true })
  .first()
const daVorhanden = await knopf.count()
console.log('Knopf bei Englisch:', daVorhanden ? 'vorhanden' : 'FEHLT')
if (!daVorhanden) {
  await page.screenshot({ path: join(out, 'kein-knopf.png') })
  await app.close()
  rmSync(userData, { recursive: true, force: true })
  console.error('\nProbleme:\n- Der Knopf erscheint nicht, obwohl Lehrwerke mitgeliefert sind')
  process.exit(1)
}

await knopf.click()
await page.waitForSelector('text=Vokabeln für dieses Arbeitsblatt', { timeout: 15000 })
await page.waitForTimeout(600)
await page.screenshot({ path: join(out, '1-popup-leer.png') })

// Schulbuch: Das Lehrwerk ist nach Lerngruppe vorbelegt – nur die Units fehlen.
// ZWEI Units wählen: Das ist der eigentliche Prüfpunkt der Mehrfachauswahl.
const unit = page.getByLabel('Units').filter({ visible: true }).first()
await unit.click()
// Nur SICHTBARE Optionen: Die geschlossenen Auswahlfelder des Formulars halten hunderte
// weitere im Baum, und der Selektor stolperte über die erste unsichtbare davon.
await page.waitForSelector('[role="option"]:visible', { timeout: 10000 })
const optionen = page.locator('[role="option"]:visible')
const wieviele = await optionen.count()
await optionen.nth(0).click()
await page.waitForTimeout(400)
if (wieviele > 1) {
  await optionen.nth(1).click()
  await page.waitForTimeout(400)
}
await page.keyboard.press('Escape')
await page.waitForTimeout(600)
const gewaehlteUnits = await page.evaluate(() => {
  const feld = [...document.querySelectorAll('[role="dialog"] label')].find((l) => l.textContent.trim() === 'Units')
  const box = feld?.parentElement
  return [...(box?.querySelectorAll('[data-with-remove], .mantine-Pill-root') ?? [])].map((p) => p.textContent.replace(/×$/, '').trim()).filter(Boolean)
})
console.log('Gewählte Units:', gewaehlteUnits.join(' + ') || 'keine erkannt')

// Je Unit ein eigener Abschnittsblock – das ist der Prüfpunkt der Teilabschnitte
const bloecke = await page.evaluate(() =>
  [...document.querySelectorAll('[role="dialog"] div')]
    .map((d) => d.firstElementChild?.firstElementChild?.textContent?.trim() ?? '')
    .filter((t) => t.startsWith('Abschnitte'))
)
console.log('Abschnittsblöcke:', bloecke.join(' | ') || 'keine')

// Ein Abschnitt abwählen: Die Zahl im Knopf muss sinken
const vorher = await page
  .getByRole('button', { name: /Vokabeln anzeigen und auswählen/ })
  .first()
  .textContent()
const chip = page.locator('[role="dialog"] .mantine-Chip-root input:checked').first()
if (await chip.count()) {
  await chip.locator('xpath=..').click()
  await page.waitForTimeout(500)
}
const nachDemAbwaehlen = await page
  .getByRole('button', { name: /Vokabeln anzeigen und auswählen/ })
  .first()
  .textContent()
const zahl = (t) => Number((t ?? '').match(/(\d+)/)?.[1] ?? 0)
console.log(`Abschnitt abgewählt: ${zahl(vorher)} → ${zahl(nachDemAbwaehlen)} Vokabeln`)
const abwahlWirkt = zahl(nachDemAbwaehlen) > 0 && zahl(nachDemAbwaehlen) < zahl(vorher)
const holen = page
  .getByRole('button', { name: /Vokabeln anzeigen und auswählen/ })
  .filter({ visible: true })
  .first()
console.log('Knopf „Vokabeln anzeigen":', (await holen.count()) ? 'aktiv' : 'FEHLT')
await holen.click()
await page.waitForTimeout(1200)

const stand = await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]')
  return {
    zeilen: dialog?.querySelectorAll('tbody tr').length ?? 0,
    // Nur die Häkchen der Wortliste – die Abschnitts-Chips sind ebenfalls Kontrollkästchen
    angehakt: [...(dialog?.querySelectorAll('tbody input[type="checkbox"]') ?? [])].filter((c) => c.checked).length,
    hinweis: dialog?.textContent.match(/Bekannter Wortschatz:[^.]*\./)?.[0] ?? ''
  }
})
console.log('Wörter im Pop-up:', stand.zeilen, '· angehakt:', stand.angehakt)
console.log('Obergrenze:', stand.hinweis || 'keine gesetzt')
await page.screenshot({ path: join(out, '2-popup-woerter.png') })

// Zweck-Auswahl: Enthält sie das Abprüfen?
const zweck = page.getByLabel('Was mit diesen Wörtern geschehen soll').filter({ visible: true }).first()
await zweck.scrollIntoViewIfNeeded()
await zweck.click()
await page.waitForTimeout(500)
const zwecke = await page.locator('[role="option"]:visible').allTextContents()
console.log('Zweck-Auswahl:', zwecke.map((z) => z.split('\n')[0]).join(' | '))
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// Übernehmen
const nehmen = page
  .getByRole('button', { name: /Wörter übernehmen|Ohne Vokabeln fortfahren/ })
  .filter({ visible: true })
  .first()
await nehmen.click()
await page.waitForTimeout(900)
await page.screenshot({ path: join(out, '3-schritt1.png') })

const nachher = await page.evaluate(() => document.body.innerText)
// Das Abzeichen wird in Großbuchstaben gesetzt – deshalb schreibungsunabhängig prüfen
const badge = nachher.match(/(\d+) gewählt/i)
console.log('Im Formular vermerkt:', badge ? `${badge[1]} Wörter` : 'NICHTS')

const probleme = []
if (beiMathe !== 0) probleme.push('Der Knopf erscheint auch bei Mathematik')
if (stand.zeilen === 0) probleme.push('Das Pop-up hat keine Wörter geholt')
if (gewaehlteUnits.length < 2) probleme.push(`Es ließen sich keine zwei Units zugleich wählen (${gewaehlteUnits.length})`)
if (bloecke.length < 2) probleme.push(`Es gibt nicht je Unit einen Abschnittsblock (${bloecke.length})`)
if (!abwahlWirkt) probleme.push('Das Abwählen eines Teilabschnitts ändert die Vokabelzahl nicht')
if (stand.angehakt === 0) probleme.push('Geholte Wörter sind nicht vorausgewählt')
if (!stand.hinweis) probleme.push('Mit dem Schulbuchabschnitt kam keine Wortschatz-Obergrenze')
if (!zwecke.some((z) => /Abprüfen/.test(z))) probleme.push('In der Zweck-Auswahl fehlt „Abprüfen"')
if (!badge) probleme.push('Die Auswahl ist im Formular nicht vermerkt')
if (!/bevorzugt vor/.test(nachher)) probleme.push('Im Formular fehlt der Hinweis, dass die Wörter bevorzugt vorkommen')
if (!/vorausgesetzt/.test(nachher)) probleme.push('Im Formular fehlt der Hinweis auf die Wortschatz-Obergrenze')
const react = errors.filter((e) => /Maximum update depth|error #\d+/i.test(e))
if (react.length) probleme.push(`Fehler im Fenster: ${react[0].slice(0, 120)}`)
if (errors.length) console.log('Meldungen im Fenster:\n- ' + errors.slice(0, 3).join('\n- '))

await app.close()
rmSync(userData, { recursive: true, force: true })

if (probleme.length) {
  console.error('\nProbleme:\n- ' + probleme.join('\n- '))
  process.exit(1)
}
console.log('\nDie Vokabelauswahl trägt. Bilder in', out)
