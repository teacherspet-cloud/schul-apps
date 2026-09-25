// Wache: Keine Arbeit geht beim Neuanfang oder Schließen verloren; Strg+Z holt einen
// entfernten Gliederungsbaustein zurück – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/sofort-sichern.mjs <Ausgabeordner>
//
// Anlass (25.09.2026): Die Programme sicherten mit ein bis zweieinhalb Sekunden Verzögerung –
// und erst, wenn ein Blatt ausformuliert war. Wer ein Thema eintrug und gleich „Neues
// Arbeitsblatt" drückte, hatte nichts in der Bibliothek; wer das Fenster schloss, verlor die
// letzte Änderung. In der Gliederung war ein entfernter Baustein endgültig weg.
//
// Geprüft wird:
//  1. Arbeitsblatt: Thema eintippen, SOFORT „Neues Arbeitsblatt" → der Entwurf liegt in der Bibliothek.
//  2. Lernzielkontrolle: dasselbe mit „Neue Kontrolle".
//  3. Gliederung: Baustein entfernen, Strg+Z → er ist wieder da; Strg+Y → wieder weg.
//  4. Fenster schließen direkt nach einer Änderung → nach dem Neustart ist sie gesichert.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/sofort-sichern')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-sofort-'))

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

async function starte() {
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
  const page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1500, 1000)
  })
  await warteAufOberflaeche(page)
  return { app, page }
}

let { app, page } = await starte()

// ---------- 1. Arbeitsblatt: Thema tippen, sofort neu anfangen
await page.click('[aria-label="Arbeitsblatt"]')
const thema = page.getByRole('textbox', { name: 'Thema' }).filter({ visible: true }).first()
await thema.waitFor({ timeout: 15000 })
await thema.fill('Wache Sofortsichern Photosynthese')
// Ohne jede Wartezeit – genau das war der Fall, in dem die Änderung verloren ging
await page.getByRole('button', { name: 'Neues Arbeitsblatt' }).filter({ visible: true }).first().click()
await page.waitForTimeout(800)
const blaetter = await page.evaluate(() => window.api.sheets.list())
const entwurf = blaetter.find((b) => b.topic === 'Wache Sofortsichern Photosynthese')
pruefe(Boolean(entwurf), `Der Entwurf liegt nach „Neues Arbeitsblatt" in der Bibliothek (${blaetter.length} Einträge)`)
pruefe(entwurf?.sheetCount === 0, 'Er ist als Entwurf ohne ausformuliertes Blatt gesichert')
const feldLeer = await page.getByRole('textbox', { name: 'Thema' }).filter({ visible: true }).first().inputValue()
pruefe(feldLeer === '', 'Danach steht ein frisches, leeres Formular da')

// ---------- 2. Lernzielkontrolle: dasselbe mit „Neue Kontrolle"
await page.click('[aria-label="Lernzielkontrolle"]')
const lzkThema = page.locator('.mantine-TagsInput-inputField').filter({ visible: true }).first()
await lzkThema.waitFor({ timeout: 15000 })
await lzkThema.fill('Wache Potenzgesetze')
await lzkThema.press('Enter')
await page.getByRole('button', { name: 'Neue Kontrolle' }).filter({ visible: true }).first().click()
await page.waitForTimeout(800)
const kontrollen = await page.evaluate(() => window.api.kurztests.list())
pruefe(
  kontrollen.some((k) => k.thema === 'Wache Potenzgesetze'),
  `Die Kontrolle liegt nach „Neue Kontrolle" in der Bibliothek (${kontrollen.length} Einträge)`
)

// ---------- 3. Gliederung: entfernen und mit Strg+Z zurückholen
await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
await page.evaluate(() => {
  const ws = structuredClone(window.__selftest.worksheetJetzt())
  ws.meta.topic = 'Wache Gliederung'
  const punkt = (id, purpose) => ({ id, type: 'task', purpose, operator: 'Beschreibe', socialForm: 'EA', answerKind: 'lines', afb: 'II' })
  ws.outline = {
    title: 'Wache Gliederung',
    learningGoals: ['Ziel'],
    minutes: 20,
    teacherNote: '',
    items: [punkt('g1', 'ERSTER Baustein'), punkt('g2', 'ZWEITER Baustein'), punkt('g3', 'DRITTER Baustein')]
  }
  window.__selftest.setWorksheet(ws, 1)
})
await page.waitForTimeout(800)
const zweckTexte = () => page.evaluate(() => [...document.querySelectorAll('textarea')].map((t) => t.value).filter((v) => v.includes('Baustein')))
pruefe((await zweckTexte()).length === 3, 'Die Gliederung zeigt drei Bausteine')
await page.locator('[aria-label="Baustein entfernen"]').first().click()
await page.waitForTimeout(400)
pruefe((await zweckTexte()).length === 2 && !(await zweckTexte()).includes('ERSTER Baustein'), 'Nach dem Entfernen sind es zwei')
// Der Fokus steht nicht in einem Textfeld – Strg+Z gehört dem Blatt
await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
await page.keyboard.press('Control+z')
await page.waitForTimeout(400)
const nachZurueck = await zweckTexte()
pruefe(nachZurueck.length === 3 && nachZurueck[0] === 'ERSTER Baustein', 'Strg+Z holt den entfernten Baustein an seine Stelle zurück')
await page.keyboard.press('Control+y')
await page.waitForTimeout(400)
pruefe((await zweckTexte()).length === 2, 'Strg+Y entfernt ihn wieder')
await page.keyboard.press('Control+z')
await page.waitForTimeout(400)
await page.keyboard.press('Control+Shift+Z')
await page.waitForTimeout(400)
pruefe((await zweckTexte()).length === 2, 'Strg+Umschalt+Z wiederholt ebenfalls')
const knopf = page.locator('[aria-label="Rückgängig"]').filter({ visible: true }).first()
pruefe((await knopf.count()) > 0, 'In der Gliederung steht ein Rückgängig-Knopf')
await page.screenshot({ path: join(out, 'gliederung.png') })

// ---------- 4. Fenster schließen direkt nach einer Änderung
await page.evaluate(() => {
  const ws = structuredClone(window.__selftest.worksheetJetzt())
  ws.meta.topic = 'Wache Beim Schliessen'
  window.__selftest.setWorksheet(ws, 0)
})
// Sofort schließen – die verzögerte Sicherung (1,5 s) wäre dann noch nicht gelaufen
await app.close()
;({ app, page } = await starte())
const nachNeustart = await page.evaluate(() => window.api.sheets.list())
pruefe(
  nachNeustart.some((b) => b.topic === 'Wache Beim Schliessen'),
  `Die Änderung direkt vor dem Schließen ist gesichert (${nachNeustart.map((b) => b.topic).join(', ')})`
)
await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nNichts geht beim Neuanfang oder Schließen verloren; Strg+Z holt Gliederungsbausteine zurück.')
