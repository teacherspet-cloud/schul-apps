// Wache für DYNAMISCHE MATERIALNUMMERN (vorher: npm run build).
// Aufruf: node tests/e2e/materialverweise.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (27.09.2026): „Wenn man M2 nach oben verschiebt und es vor M1 landet,
// soll M2 das neue M1 und das vorherige M1 das neue M2 werden" – und die Aufgaben müssen die
// Nummer automatisch mit anpassen. Geprüft im echten Editor: Badges und Aufgabentext vor und
// nach dem Verschieben, und dass eine getippte Nummer als Kennung gespeichert wird.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/materialverweise-wache')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-materialverweise-'))

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await app.evaluate(async ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0]?.setSize(1600, 1100)
})
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
await page.evaluate(() => window.__selftest.wsMaterialtext(2))
await page.waitForTimeout(1500)

// Zwei Materialien mit Kennung und eine Aufgabe, die beide nennt – gespeichert als Kennung
await page.evaluate(() => {
  const ws = window.__selftest.worksheetJetzt()
  const goals = ws.sheets[0].blocks.filter((b) => b.type === 'learningGoals')
  ws.sheets[0].blocks = [
    ...goals,
    { id: 'rede', type: 'text', ref: 'quelle', title: 'Rede', body: 'Seit der Reichsgründung …', lineNumbers: false, source: '', glossary: [] },
    { id: 'zeit', type: 'table', ref: 'zeitleiste', title: 'Zeitleiste', headers: ['Datum', 'Ereignis'], rows: [['28.6.', 'Attentat']] },
    {
      id: 'auf',
      type: 'task',
      operator: 'Vergleiche',
      instruction: '**Vergleiche** die Rede M{quelle} mit der Zeitleiste M{zeitleiste}.',
      parts: [],
      answer: { kind: 'lines', count: 3 },
      socialForm: 'EA',
      afb: 'II',
      points: 0,
      solution: ''
    }
  ]
  window.__selftest.setWorksheet(structuredClone(ws))
})
await page.waitForTimeout(1500)

const stand = async () => {
  const badges = await page.locator('.ws-editor-pages .ws-material-no').allTextContents()
  const aufgabe = (await page.locator('.ws-editor-pages .ws-task').first().innerText()).replace(/\s+/g, ' ')
  return { badges, aufgabe }
}
let s = await stand()
pruefe(s.badges.join(',') === 'M1,M2', `Vorher: Rede M1, Zeitleiste M2 (${s.badges.join(',')})`)
pruefe(/Rede M1 mit der Zeitleiste M2/.test(s.aufgabe), `Die Aufgabe nennt M1 und M2 (${s.aufgabe.slice(0, 90)})`)
await page.locator('.ws-editor-pages .ws-page').first().screenshot({ path: join(out, 'vorher.png') })

// Zeitleiste vor die Rede schieben – im gespeicherten Blatt bleibt die Aufgabe unverändert
await page.evaluate(() => {
  const ws = window.__selftest.worksheetJetzt()
  const b = ws.sheets[0].blocks
  const i = b.findIndex((x) => x.id === 'zeit')
  const [zeit] = b.splice(i, 1)
  b.splice(b.findIndex((x) => x.id === 'rede'), 0, zeit)
  window.__selftest.setWorksheet(structuredClone(ws))
})
await page.waitForTimeout(1500)
s = await stand()
pruefe(s.badges.join(',') === 'M1,M2', `Nachher: die Badges zählen wieder M1, M2 in neuer Reihenfolge (${s.badges.join(',')})`)
pruefe(/Rede M2 mit der Zeitleiste M1/.test(s.aufgabe), `Die Aufgabe sagt jetzt Rede M2 und Zeitleiste M1 (${s.aufgabe.slice(0, 90)})`)
const gespeichert = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === 'auf').instruction)
pruefe(gespeichert.includes('M{quelle}') && gespeichert.includes('M{zeitleiste}'), `Gespeichert bleiben die Kennungen (${gespeichert})`)
await page.locator('.ws-editor-pages .ws-page').first().screenshot({ path: join(out, 'nachher.png') })

// Tippt die Lehrkraft eine Nummer, wird die Kennung des Materials gespeichert, das jetzt so heißt
// Ein Klick auf den Aufgabentext öffnet das Textfeld (shared/richtext/RichText.tsx); Blur speichert
await page.locator('.ws-editor-pages .ws-task .rt-editable').first().click()
const feld = page.locator('.ws-editor-pages .ws-task textarea.rt-editor').first()
await feld.waitFor({ timeout: 5000 })
await feld.fill('Beurteile mithilfe von M1 die Rede M2.')
await feld.evaluate((el) => el.blur())
await page.waitForTimeout(800)
const getippt = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === 'auf').instruction)
pruefe(getippt.includes('M{zeitleiste}') && getippt.includes('M{quelle}'), `Getippte Nummern werden als Kennung gespeichert (${getippt})`)
s = await stand()
pruefe(/M1 die Rede M2/.test(s.aufgabe), `Und angezeigt wieder als Nummern (${s.aufgabe.slice(0, 90)})`)

await app.close()
rmSync(userData, { recursive: true, force: true })
if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
