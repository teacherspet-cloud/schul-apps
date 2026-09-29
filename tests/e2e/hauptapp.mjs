// Wache für die Hauptapp – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/hauptapp.mjs <Ausgabeordner>
//
// Anlass (25.09.2026, Rückmeldungen der Lehrkraft):
//  - Startseite: „Zuletzt bearbeitet" über alle Programme, Klick öffnet das Dokument direkt;
//    Suche über alle Materialien; Hinweise auf fehlenden KI-Zugang und fehlende Sicherung
//    führen per Knopf zum richtigen Reiter der Einstellungen.
//  - Leiste ausklappbar (Symbol + Name), Zustand gemerkt; Fenstergröße gemerkt.
//  - Kein englisches Electron-Menü mehr – Kopieren/Einfügen/Rückgängig in Textfeldern gehen
//    trotzdem.
//  - Strg+1 … 6 / Strg+0 wechseln das Programm, Strg+P druckt im vorderen Programm.
//  - Bild-KI im Reiter „Bilder und Hörtexte"; „Häufig gewählt" in den Auswahllisten.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/hauptapp')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-hauptapp-'))
const fixture = resolve('tests/fixtures/beispiel.vokabeltest')

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

async function starte(args = []) {
  const app = await electron.launch({ args: ['.', ...args, `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
  const page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  await warteAufOberflaeche(page)
  return { app, page }
}

const aktiv = (page, label) => page.locator(`[aria-label="${label}"]`).first().getAttribute('data-active')

let { app, page } = await starte()
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 950))

// ---------- Menü
pruefe(await app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null), 'Kein Electron-Standardmenü mehr')

// ---------- Probe-Einträge: zwei Entwürfe über die Oberfläche, eine Liste über die Schnittstelle
await page.click('[aria-label="Arbeitsblatt"]')
const thema = page.getByRole('textbox', { name: 'Thema' }).filter({ visible: true }).first()
await thema.waitFor({ timeout: 15000 })
await thema.fill('Wache Hauptapp Photosynthese')
await page.getByRole('button', { name: 'Neues Arbeitsblatt' }).filter({ visible: true }).first().click()
await page.waitForTimeout(600)
await page.click('[aria-label="Lernzielkontrolle"]')
const lzkThema = page.locator('.mantine-TagsInput-inputField').filter({ visible: true }).first()
await lzkThema.waitFor({ timeout: 15000 })
await lzkThema.fill('Wache Hauptapp Potenzgesetze')
await lzkThema.press('Enter')
await page.getByRole('button', { name: 'Neue Kontrolle' }).filter({ visible: true }).first().click()
await page.waitForTimeout(600)
await page.evaluate(() =>
  window.api.library.save({
    id: 'wache-hauptapp-liste',
    name: 'Wache Hauptapp Liste',
    updatedAt: new Date().toISOString(),
    language: 'en',
    entries: [{ term: 'castle', translation: 'Burg' }]
  })
)

// ---------- Startseite über Strg+0
await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
await page.keyboard.press('Control+0')
await page.getByText('Zuletzt bearbeitet').waitFor({ timeout: 10000 })
const zuletzt = await page.locator('.home-material').allInnerTexts()
pruefe(zuletzt.length >= 3, `„Zuletzt bearbeitet" zeigt die Probe-Einträge (${zuletzt.length})`)
pruefe(
  zuletzt.some((t) => t.includes('Wache Hauptapp Photosynthese') && /entwurf/i.test(t)),
  'Der Arbeitsblatt-Entwurf steht mit „Entwurf" da'
)
pruefe(zuletzt[0]?.includes('Wache Hauptapp Liste'), 'Der zuletzt gespeicherte Eintrag steht oben')
pruefe((await page.getByText('Weitere Programme folgen').count()) === 0, 'Die Platzhalterkachel ist weg')
pruefe(await page.getByText('Kein KI-Zugang eingerichtet').isVisible(), 'Hinweis auf den fehlenden KI-Zugang')
pruefe(await page.getByText('Noch keine Sicherung', { exact: true }).isVisible(), 'Hinweis auf die fehlende Sicherung')
await page.waitForTimeout(400)
await page.screenshot({ path: join(out, 'paket2-startseite.png') })

// Kacheln per Tastatur
const kachel = page.locator('.home-tile').first()
await kachel.focus()
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
// Erste Kachel seit Paket 12: Arbeitsblatt (Reihenfolge der Leiste)
pruefe((await aktiv(page, 'Arbeitsblatt')) === 'true', 'Eine Kachel lässt sich mit der Tastatur öffnen')
await page.keyboard.press('Control+0')
await page.getByText('Zuletzt bearbeitet').waitFor()

// Hinweise führen zum richtigen Reiter
await page.getByRole('button', { name: 'Zur Sicherung' }).click()
await page.waitForTimeout(300)
pruefe((await page.getByRole('tab', { name: 'Wartung' }).getAttribute('aria-selected')) === 'true', '„Zur Sicherung" öffnet den Reiter Wartung')
await page.keyboard.press('Control+0')
await page.getByRole('button', { name: 'KI-Zugang einrichten' }).click()
await page.waitForTimeout(300)
pruefe((await page.getByRole('tab', { name: 'KI-Zugang' }).getAttribute('aria-selected')) === 'true', '„KI-Zugang einrichten" öffnet den Reiter KI-Zugang')
pruefe((await page.getByLabel('KI für Bilder').count()) === 0, 'Die Bild-KI steht nicht mehr unter KI-Zugang')
await page.getByRole('tab', { name: 'Bilder und Hörtexte' }).click()
await page.waitForTimeout(300)
pruefe((await page.getByLabel('KI für Bilder').count()) > 0, 'Die Bild-KI steht unter „Bilder und Hörtexte"')
// Über die Leiste kommt man beim ersten Reiter an
await page.click('[aria-label="Startseite"]')
await page.click('[aria-label="Einstellungen"]')
await page.waitForTimeout(300)
pruefe(
  (await page.getByRole('tab', { name: 'Schule' }).getAttribute('aria-selected')) === 'true',
  'Über die Leiste öffnen die Einstellungen beim Reiter Schule'
)

// „Häufig gewählt": zweimal Bayern gewählt → nach dem Neuaufbau oben
const bundesland = () => page.getByLabel('Bundesland').filter({ visible: true }).first()
for (const land of ['Bayern', 'Berlin', 'Bayern']) {
  await bundesland().click()
  await page.getByRole('option', { name: land, exact: true }).click()
  await page.waitForTimeout(200)
}
await page.getByRole('tab', { name: 'Material' }).click()
await page.getByRole('tab', { name: 'Schule' }).click()
await bundesland().click()
await page.waitForTimeout(300)
const gruppen = await page.locator('[class*="groupLabel"]').filter({ visible: true }).allInnerTexts()
const ersteOption = await page.getByRole('option').first().innerText()
pruefe(gruppen[0] === 'Häufig gewählt' && ersteOption.trim() === 'Bayern', `Bayern steht unter „Häufig gewählt" oben (${gruppen.join(', ')}; ${ersteOption})`)
const optionen = await page.getByRole('option').allInnerTexts()
pruefe(optionen.filter((o) => o.trim() === 'Bayern').length === 1, 'Bayern steht nicht doppelt in der Liste')
await page.keyboard.press('Escape')

// ---------- Öffnen aus „Zuletzt bearbeitet" und über die Suche
await page.keyboard.press('Control+0')
const suche = page.getByRole('textbox', { name: 'Materialien durchsuchen' })
await suche.fill('photosynthese')
await page.waitForTimeout(200)
pruefe((await page.locator('.home-material').count()) === 1, 'Die Suche findet genau das Arbeitsblatt')
// Kopieren und Einfügen ohne Menü: Text markieren, kopieren, löschen, einfügen, rückgängig
await suche.focus()
await page.keyboard.press('Control+a')
await page.keyboard.press('Control+c')
await page.keyboard.press('Delete')
pruefe((await suche.inputValue()) === '', 'Markieren und Löschen im Suchfeld')
await page.keyboard.press('Control+v')
pruefe((await suche.inputValue()) === 'photosynthese', 'Strg+C / Strg+V funktionieren ohne Menü')
await page.keyboard.press('Control+z')
pruefe((await suche.inputValue()) === '', 'Strg+Z im Textfeld nimmt das Einfügen zurück')
await suche.fill('photosynthese')
await page.waitForTimeout(200)
await page.locator('.home-material').first().click()
await page.waitForTimeout(1200)
pruefe((await aktiv(page, 'Arbeitsblatt')) === 'true', 'Ein Klick auf den Treffer öffnet das Arbeitsblatt-Programm')
const geoeffnet = await page.getByRole('textbox', { name: 'Thema' }).filter({ visible: true }).first().inputValue()
pruefe(geoeffnet === 'Wache Hauptapp Photosynthese', `…und darin den Entwurf („${geoeffnet}")`)

await page.keyboard.press('Control+0')
await page.locator('.home-material', { hasText: 'Wache Hauptapp Potenzgesetze' }).click()
await page.waitForTimeout(1200)
pruefe((await aktiv(page, 'Lernzielkontrolle')) === 'true', 'Die Kontrolle öffnet im Programm Lernzielkontrolle')
pruefe(await page.getByText('Wache Hauptapp Potenzgesetze').filter({ visible: true }).first().isVisible(), '…mit ihrem Thema')

await page.keyboard.press('Control+0')
await page.locator('.home-material', { hasText: 'Wache Hauptapp Liste' }).click()
await page.waitForTimeout(1000)
pruefe((await aktiv(page, 'Vokabellisten')) === 'true', 'Die Vokabelliste öffnet im Programm Vokabellisten')
pruefe((await page.locator('input[value="castle"]').filter({ visible: true }).count()) > 0, '…und zwar die Liste selbst, nicht nur die Übersicht')

// ---------- Strg+1 … 8 (Reihenfolge seit 29.09.2026: Arbeitsblatt, Vokabeltest, Grammatiktest, LZK, Klassenarbeiten, Rückmeldung, Elternbriefe, Vokabellisten)
await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
await page.keyboard.press('Control+8')
await page.waitForTimeout(300)
pruefe((await aktiv(page, 'Vokabellisten')) === 'true', 'Strg+8 öffnet die Vokabellisten')
await page.keyboard.press('Control+5')
await page.waitForTimeout(300)
pruefe((await aktiv(page, 'Klassenarbeiten')) === 'true', 'Strg+5 öffnet die Klassenarbeiten')
await page.keyboard.press('Control+1')
await page.waitForTimeout(300)
pruefe((await aktiv(page, 'Arbeitsblatt')) === 'true', 'Strg+1 öffnet das Arbeitsblatt')

// ---------- Leiste ausklappen, Fenster verkleinern – beides gemerkt
await page.getByRole('button', { name: 'Leiste ausklappen' }).click()
await page.waitForTimeout(400)
const navText = await page.locator('.mantine-AppShell-navbar').innerText()
pruefe(navText.includes('Lernzielkontrolle') && navText.includes('Einstellungen'), 'Die ausgeklappte Leiste zeigt die Namen')
await page.keyboard.press('Control+0')
await page.waitForTimeout(600)
await page.screenshot({ path: join(out, 'paket2-leiste-breit.png') })
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0]
  w.setBounds({ x: 60, y: 40, width: 1240, height: 820 })
})
await page.waitForTimeout(300)
await app.close()

;({ app, page } = await starte([fixture]))
const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
pruefe(bounds.width === 1240 && bounds.height === 820, `Die Fenstergröße ist gemerkt (${bounds.width}×${bounds.height})`)
pruefe((await page.getByRole('button', { name: 'Leiste einklappen' }).count()) === 1, 'Die ausgeklappte Leiste ist gemerkt')

// ---------- Strg+P: nur, wenn im vorderen Programm ein Editor mit Druck offen ist
await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
await page.keyboard.press('Control+p')
await page.waitForTimeout(400)
pruefe((await page.locator('.mantine-Modal-title', { hasText: 'Drucken' }).count()) === 0, 'Strg+P auf der Startseite tut nichts')
await page.keyboard.press('Control+2')
await page.waitForSelector('.editor-sheet .vt-page', { timeout: 15000 })
await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
await page.keyboard.press('Control+p')
await page.waitForTimeout(600)
pruefe((await page.locator('.mantine-Modal-title', { hasText: 'Drucken' }).count()) === 1, 'Strg+P öffnet im Vokabeltest-Editor den Druckdialog')
await app.close()
rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nHauptapp: Startseite, Navigation, Leiste, Fenster, Menü und Tastenkürzel in Ordnung.')
