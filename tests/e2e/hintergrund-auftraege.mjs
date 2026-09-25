// Wache für die Hintergrund-Aufträge – mit KI-ATTRAPPE, ohne echte KI (vorher: npm run build).
// Aufruf: node tests/e2e/hintergrund-auftraege.mjs <Ausgabeordner> [Ordner für Bildschirmfotos]
//
// Anlass (25.09.2026), Wunsch der Lehrkraft: „dass man in der Hauptapp und den Unterapps
// weiterarbeiten kann während Material erzeugt wird. Paralleles Erzeugen von Material soll nach
// Möglichkeit möglich sein. Ein Fortschritt soll unten rechts in der Hauptapp sichtbar sein als
// Layer über den anderen Apps (aus- und einklappbar)."
//
// Die KI ist durch eine Attrappe ersetzt (SCHULAPPS_KI_ATTRAPPE, services/ai/attrappe.ts): Sie
// antwortet nach einigen Sekunden mit festen Daten und lässt sich abbrechen wie eine echte Anfrage.
//
// Geprüft wird:
//  1. Zwei Arbeitsblätter nacheinander „Gliederung planen" – statt eines gesperrten Fensters
//     ein Hinweis im Programm, „Neues Arbeitsblatt" geht sofort.
//  2. Die Auftragsleiste zeigt beide; ein- und ausklappbar; Punkt am Programmsymbol.
//  3. Währenddessen im anderen Programm arbeiten (Lernzielkontrolle).
//  4. Einen Auftrag abbrechen: kein roter Fehlerhinweis, nichts abgelegt.
//  5. Der andere wird fertig: Die Gliederung steht in der Bibliothek beim RICHTIGEN Blatt; das
//     gerade offene andere Blatt bleibt unberührt; „Öffnen" öffnet das fertige.
//  6. Ausformulieren im Hintergrund, Ergebnis im offenen Blatt (Strg+Z führt zurück).
//  7. Fenster schließen mit laufendem Auftrag: Rückfrage; „Weiterarbeiten" lässt es offen.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/hintergrund-auftraege')
const shots = resolve(process.argv[3] ?? out)
mkdirSync(out, { recursive: true })
mkdirSync(shots, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-auftraege-'))

// ---------- Die Attrappe: feste Antworten je Auftragsart
const leer = { kind: 'none', lines: 0, gapText: '', options: [], correctIndex: -1, pairs: [], items: [], rows: [], statements: [], labels: [] }
const baustein = (patch) => ({
  outlineIndex: 0,
  type: 'task',
  title: '',
  body: '',
  lineNumbers: false,
  items: [],
  imageDescription: '',
  sourceImageIndex: -1,
  instruction: '',
  operator: '',
  afb: '',
  afbReason: '',
  socialForm: 'EA',
  minutes: 5,
  points: 0,
  solution: '',
  answer: leer,
  parts: [],
  headers: [],
  rows: [],
  heightMm: 0,
  ...patch
})
const attrappe = join(userData, 'ki-attrappe.json')
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 5000,
    antworten: {
      worksheet_outline: {
        title: 'Der Igel',
        learningGoals: ['Ich kann beschreiben, wie der Igel überwintert.'],
        minutes: 30,
        teacherNote: '',
        items: [
          { type: 'learningGoals', purpose: 'Lernziele', afb: '', operator: '', socialForm: 'EA', stars: 0, answerKind: 'none' },
          { type: 'text', purpose: 'Sachtext Winterschlaf', afb: '', operator: '', socialForm: 'EA', stars: 0, answerKind: 'none' },
          { type: 'task', purpose: 'Informationen entnehmen', afb: 'I', operator: 'nennen', socialForm: 'EA', stars: 0, answerKind: 'lines' }
        ]
      },
      worksheet: {
        blocks: [
          baustein({ type: 'learningGoals', title: 'Das lernst du', items: ['Ich kann den Winterschlaf beschreiben.'] }),
          baustein({
            outlineIndex: 1,
            type: 'text',
            title: 'Der Igel im Winter',
            body: 'Der Igel schläft im Winter.\n\nEr frisst vorher viel.',
            lineNumbers: true
          }),
          baustein({
            outlineIndex: 2,
            instruction: '**Nenne** zwei Dinge, die der Igel frisst.',
            operator: 'nennen',
            afb: 'I',
            solution: 'Käfer, Würmer',
            answer: { ...leer, kind: 'lines', lines: 3 }
          })
        ]
      },
      worksheet_review: { problems: [] }
    }
  })
)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappe }
})
const page = await app.firstWindow()
page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1000))
await warteAufOberflaeche(page)

const sichtbar = (loc) => loc.filter({ visible: true }).first()
const zeile = (text) => page.locator('.auftrags-zeile', { hasText: text })
const status = async (text) => ((await zeile(text).count()) ? zeile(text).first().getAttribute('data-status') : null)
async function warteStatus(text, wert, ms = 30000) {
  const ende = Date.now() + ms
  while (Date.now() < ende) {
    if ((await status(text)) === wert) return true
    await page.waitForTimeout(250)
  }
  return false
}
const blaetter = () => page.evaluate(() => window.api.sheets.list())
// Die Leiste ist anfangs eingeklappt; ausgeklappt liegt sie über dem Inhalt unten rechts
async function oeffneLeiste() {
  if (await page.locator('.auftrags-liste').isVisible()) return
  await page.locator('.auftrags-pille').click()
  await page.locator('.auftrags-liste').waitFor({ timeout: 3000 })
}
async function schliesseLeiste() {
  if (!(await page.locator('.auftrags-liste').isVisible())) return
  await page.getByRole('button', { name: 'Aufträge einklappen' }).click()
  await page.locator('.auftrags-pille').waitFor({ timeout: 3000 })
}

try {
  // ---------- 1. Zwei Blätter nacheinander planen lassen
  await page.click('[aria-label="Arbeitsblatt"]')
  const thema = sichtbar(page.getByRole('textbox', { name: 'Thema' }))
  await thema.waitFor({ timeout: 15000 })
  await thema.fill('Wache Auftrag Igel')
  await sichtbar(page.getByRole('button', { name: 'Gliederung planen' })).click()
  const hinweis = sichtbar(page.locator('[data-auftrag-hinweis]'))
  await hinweis.waitFor({ timeout: 5000 })
  pruefe(await hinweis.isVisible(), 'Statt eines gesperrten Fensters steht ein Hinweis im Programm')
  pruefe((await page.locator('.mantine-Modal-root').filter({ visible: true }).count()) === 0, 'Kein Fenster blockiert das Programm')

  await sichtbar(page.getByRole('button', { name: 'Neues Arbeitsblatt' })).click()
  const thema2 = sichtbar(page.getByRole('textbox', { name: 'Thema' }))
  await thema2.waitFor({ timeout: 5000 })
  pruefe((await thema2.inputValue()) === '', '„Neues Arbeitsblatt" geht während des Auftrags sofort')
  await thema2.fill('Wache Auftrag Fuchs')
  await sichtbar(page.getByRole('button', { name: 'Gliederung planen' })).click()
  await page.waitForTimeout(400)

  // ---------- 2. Die Auftragsleiste
  const pille = page.locator('.auftrags-pille')
  pruefe(await pille.isVisible(), 'Anfangs eingeklappt: kleine Pille unten rechts')
  pruefe(/2 laufen/.test((await pille.textContent()) ?? ''), `Pille nennt „2 laufen" (${await pille.textContent()})`)
  await page.screenshot({ path: join(shots, 'paket3-eingeklappt.png') })
  await oeffneLeiste()
  pruefe((await page.locator('.auftrags-zeile').count()) === 2, `Die Leiste zeigt zwei Aufträge (${await page.locator('.auftrags-zeile').count()})`)
  pruefe(Boolean(await page.locator('[aria-label="Arbeitsblatt"] .mantine-Indicator-indicator').count()), 'Punkt am Symbol des Arbeitsblatts')
  await page.screenshot({ path: join(shots, 'paket3-ausgeklappt.png') })
  await schliesseLeiste()

  // ---------- 3. Währenddessen im anderen Programm arbeiten
  await page.click('[aria-label="Lernzielkontrolle"]')
  const lzkThema = sichtbar(page.locator('.mantine-TagsInput-inputField'))
  await lzkThema.waitFor({ timeout: 15000 })
  await lzkThema.fill('Wache nebenbei Potenzgesetze')
  await lzkThema.press('Enter')
  pruefe(await pille.isVisible(), 'Die Leiste liegt auch über dem anderen Programm')

  // ---------- 4. Einen Auftrag abbrechen
  await oeffneLeiste()
  await zeile('Fuchs').getByRole('button', { name: 'Abbrechen' }).click()
  pruefe(await warteStatus('Fuchs', 'abgebrochen', 5000), 'Abgebrochener Auftrag steht als „abgebrochen" da')
  await page.waitForTimeout(500)
  const rot = await page
    .locator('.mantine-Notification-root')
    .filter({ hasText: /abgebrochen|fehlgeschlagen/i })
    .count()
  pruefe(rot === 0, 'Der Abbruch erscheint nicht als Fehlerhinweis')

  // ---------- 5. Der andere wird fertig – im richtigen Blatt
  pruefe(await warteStatus('Igel', 'fertig', 30000), 'Der erste Auftrag wird fertig')
  const liste = await blaetter()
  const igel = liste.find((b) => b.topic === 'Wache Auftrag Igel')
  const fuchs = liste.find((b) => b.topic === 'Wache Auftrag Fuchs')
  const igelVoll = igel ? await page.evaluate((id) => window.api.sheets.get(id), igel.id) : null
  pruefe(Boolean(igelVoll?.payload?.outline?.items?.length), 'Die Gliederung liegt in der Bibliothek beim Blatt „Igel"')
  const fuchsVoll = fuchs ? await page.evaluate((id) => window.api.sheets.get(id), fuchs.id) : null
  pruefe(!fuchsVoll?.payload?.outline, 'Das abgebrochene Blatt „Fuchs" bekam keine Gliederung')

  await page.click('[aria-label="Arbeitsblatt"]')
  const offen = sichtbar(page.getByRole('textbox', { name: 'Thema' }))
  await offen.waitFor({ timeout: 5000 })
  pruefe((await offen.inputValue()) === 'Wache Auftrag Fuchs', 'Das gerade offene Blatt („Fuchs") ist unberührt – nichts ist umgesprungen')

  await zeile('Igel').getByRole('button', { name: 'Öffnen' }).click()
  await schliesseLeiste()
  await sichtbar(page.getByText('Gliederung prüfen')).waitFor({ timeout: 10000 })
  pruefe(true, '„Öffnen" öffnet das fertige Blatt bei der Gliederung')

  // ---------- 6. Ausformulieren im Hintergrund – Ergebnis im offenen Blatt
  await sichtbar(page.getByRole('button', { name: 'Arbeitsblatt ausformulieren' })).click()
  await sichtbar(page.locator('[data-auftrag-hinweis]')).waitFor({ timeout: 5000 })
  await page.click('[aria-label="Vokabellisten"]')
  await oeffneLeiste()
  pruefe(await warteStatus('Arbeitsblatt ausformulieren', 'fertig', 40000), 'Ausformulieren wird fertig, während ein anderes Programm vorn ist')
  pruefe(
    (await page.evaluate(() => document.querySelector('[aria-label="Vokabellisten"]')?.getAttribute('data-active'))) === 'true',
    'Es wird nicht ungefragt umgeschaltet'
  )
  const nachher = (await blaetter()).find((b) => b.topic === 'Wache Auftrag Igel')
  pruefe((nachher?.sheetCount ?? 0) > 0, `Das ausformulierte Blatt ist gespeichert (${nachher?.sheetCount ?? 0} Blatt)`)
  await page.click('[aria-label="Arbeitsblatt"]')
  await sichtbar(page.getByText('Bearbeiten & Export')).waitFor({ timeout: 5000 })
  const editor = await page.locator('.ws-page').filter({ visible: true }).count()
  pruefe(editor > 0, 'Im offenen Blatt steht das Ergebnis im Editor')

  // ---------- 7. Schließen mit laufendem Auftrag: Rückfrage
  await schliesseLeiste()
  await sichtbar(page.getByRole('button', { name: 'Neues Arbeitsblatt' })).click()
  const thema3 = sichtbar(page.getByRole('textbox', { name: 'Thema' }))
  await thema3.waitFor({ timeout: 5000 })
  await thema3.fill('Wache Auftrag Dachs')
  await sichtbar(page.getByRole('button', { name: 'Gliederung planen' })).click()
  await page.waitForTimeout(300)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  const frage = page.getByText('Aufträge laufen noch')
  await frage.waitFor({ timeout: 3000 })
  await page.waitForTimeout(3500)
  pruefe(await frage.isVisible(), 'Rückfrage beim Schließen – und das Fenster wartet länger als drei Sekunden')
  await page.getByRole('button', { name: 'Weiterarbeiten' }).click()
  await page.waitForTimeout(500)
  await oeffneLeiste()
  pruefe(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length === 1), '„Weiterarbeiten" lässt das Fenster offen')
  pruefe(await warteStatus('Dachs', 'fertig', 30000), 'Der Auftrag läuft danach weiter und wird fertig')
} catch (e) {
  problems.push(`Abbruch der Wache: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  // Hängt das Schließen (etwa an einer offenen Rückfrage), wird das Programm nach 10 s beendet
  await Promise.race([app.close().catch(() => undefined), new Promise((r) => setTimeout(r, 10000))])
  try {
    app.process().kill()
  } catch {
    // schon beendet
  }
  await new Promise((r) => setTimeout(r, 500))
  rmSync(userData, { recursive: true, force: true, maxRetries: 5 })
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
