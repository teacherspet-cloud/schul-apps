// Wache für die LIVE-VORSCHAU während der Erzeugung (02.10.2026) – mit KI-ATTRAPPE, ohne echte KI,
// im Wegwerf-Profil (vorher: npm run build).
// Aufruf: node tests/e2e/live-vorschau.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft: „live mitverfolgen, was gerade erstellt und platziert / verschoben /
// geändert wird". Abgestimmt: Zwischenstände nach jedem Schritt, nur zum Ansehen, Neues leuchtet
// kurz auf, dazu eine Laufzeile. Geprüft im laufenden Programm:
//  - Arbeitsblatt: Während „ausformulieren" noch läuft, steht das Blatt schon in der Vorschau –
//    mit Aufleuchten, Laufzeile und ohne Bearbeitungsmöglichkeit. Danach steht es im Editor, und
//    Strg+Z führt in EINEM Schritt zur Gliederung zurück (kein Zwischenstand im Verlauf).
//  - Abbrechen leert die Vorschau; abgelegt wird nichts.
//  - Klassenarbeit: Die Teile erscheinen nacheinander, bevor die Arbeit fertig ist.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/live-vorschau')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-live-vorschau-'))

// ---------- Die Attrappe: feste Antworten je Auftragsart (Arbeitsblatt wie in hintergrund-auftraege.mjs)
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
    // Lang genug, um zwischen zwei Anfragen hinzusehen
    verzoegerungMs: 3000,
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
      worksheet_review: { problems: [] },
      exam_part: {
        blocks: [
          { outlineIndex: 0, type: 'text', title: 'Texte', body: 'Un texte court pour la vérification.', lineNumbers: true },
          {
            outlineIndex: 1,
            type: 'task',
            instruction: '**Résumez** le texte.',
            operator: 'résumer',
            afb: 'I',
            solution: 'Solution',
            points: 5,
            answer: { kind: 'lines', lines: 4 }
          }
        ]
      }
    }
  })
)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

let app = null
let page = null
const sichtbar = (l) => l.filter({ visible: true }).first()
const anzahl = (selektor) => page.locator(selektor).filter({ visible: true }).count()
/** Wartet, bis die Bedingung gilt (oder die Zeit um ist) */
async function warte(bedingung, ms) {
  const ende = Date.now() + ms
  while (Date.now() < ende) {
    if (await bedingung()) return true
    await page.waitForTimeout(200)
  }
  return false
}

try {
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappe } })
  page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1000))
  await warteAufOberflaeche(page)

  // ---------- Arbeitsblatt
  await page.click('[aria-label="Arbeitsblatt"]')
  const thema = sichtbar(page.getByRole('textbox', { name: 'Thema' }))
  await thema.waitFor({ timeout: 15000 })
  await thema.fill('Wache Vorschau Igel')
  await sichtbar(page.getByRole('button', { name: 'Gliederung planen' })).click()
  await sichtbar(page.getByText('Gliederung prüfen')).waitFor({ timeout: 30000 })

  await sichtbar(page.getByRole('button', { name: 'Arbeitsblatt ausformulieren' })).click()
  const kam = await warte(async () => (await anzahl('[data-live-vorschau]')) > 0, 30000)
  pruefe(kam, 'Beim Ausformulieren erscheint eine Live-Vorschau')
  if (kam) {
    // Platzhalter im echten Blatt (02.10.2026): erst alle, dann Baustein für Baustein ersetzt
    const platz = async () => page.locator('[data-live-vorschau] [data-live-platzhalter]').count()
    const anfangs = await platz()
    pruefe(anfangs > 0 && (await page.locator('[data-live-vorschau] .ws-page').count()) > 0, `Sofort ein Blatt mit Platzhaltern (${anfangs}) statt einer Liste`)
    await page.screenshot({ path: join(out, '0-platzhalter.png') })
    const gesehen = new Set([anfangs])
    for (let i = 0; i < 40; i++) {
      gesehen.add(await platz().catch(() => -1))
      if ((await anzahl('[data-live-vorschau]')) === 0) break
      await page.waitForTimeout(150)
    }
    const zwischen = [...gesehen].filter((n) => n > 0 && n < anfangs)
    pruefe(zwischen.length > 0, `Bausteine ersetzen ihre Platzhalter nacheinander (gesehen: ${[...gesehen].sort().join(', ')})`)
  }
  if (kam && (await anzahl('[data-live-vorschau]')) > 0) {
    pruefe((await anzahl('[data-live-kopf]')) > 0, 'Der Auftrag läuft noch, während die Vorschau steht (Kopfzeile)')
    const text = (await sichtbar(page.locator('[data-live-vorschau]')).innerText()).replace(/\u00ad/g, '')
    pruefe(text.includes('Der Igel im Winter'), 'Die Vorschau zeigt das entstehende Blatt')
    pruefe((await page.locator('[data-live-vorschau] .ws-live-neu').count()) > 0, 'Neue Bausteine leuchten auf (ws-live-neu)')
    const laufzeile = (await sichtbar(page.locator('[data-live-laufzeile]')).innerText()).trim()
    pruefe(laufzeile.length > 0, `Laufzeile: „${laufzeile}"`)
    const bearbeitbar = await page
      .locator(
        '[data-live-vorschau] [contenteditable="true"], [data-live-vorschau] [contenteditable="plaintext-only"], [data-live-vorschau] .editor-block-toolbar'
      )
      .count()
    pruefe(bearbeitbar === 0, `Die Vorschau ist nur zum Ansehen (${bearbeitbar} bearbeitbare Stellen)`)
    await page.screenshot({ path: join(out, '1-arbeitsblatt-vorschau.png') })
  }
  const fertig = await warte(async () => (await anzahl('[data-live-vorschau]')) === 0 && (await anzahl('.ws-editor-pages .ws-page')) > 0, 60000)
  pruefe(fertig, 'Nach dem Ende verschwindet die Vorschau, das Blatt steht im Editor')
  await page.screenshot({ path: join(out, '2-arbeitsblatt-fertig.png') })
  await page.mouse.click(5, 300)
  await page.keyboard.press('Control+z')
  pruefe(await warte(async () => (await anzahl('text=Gliederung prüfen')) > 0, 5000), 'Strg+Z führt in einem Schritt zur Gliederung zurück')

  // Abbrechen leert die Vorschau
  await sichtbar(page.getByRole('button', { name: 'Arbeitsblatt ausformulieren' })).click()
  if (await warte(async () => (await anzahl('[data-live-kopf]')) > 0, 30000)) {
    await sichtbar(page.locator('[data-live-kopf]').getByRole('button', { name: 'Abbrechen' })).click()
    pruefe(await warte(async () => (await anzahl('[data-live-vorschau]')) === 0, 5000), 'Abbrechen leert die Vorschau')
    pruefe(await warte(async () => (await anzahl('text=Gliederung prüfen')) > 0, 5000), 'Nach dem Abbruch steht wieder die Gliederung – nichts abgelegt')
  } else pruefe(false, 'Zweite Vorschau zum Abbrechen erschienen')

  // ---------- Klassenarbeit: Teile erscheinen nacheinander
  await page.click('[aria-label="Klassenarbeiten"]')
  await page.waitForTimeout(1200)
  if (!(await anzahl('text=Rahmen der Arbeit'))) await sichtbar(page.getByRole('button', { name: 'Neue Klassenarbeit' })).click()
  await page.waitForSelector('text=Rahmen der Arbeit')
  const waehle = async (label, option) => {
    await sichtbar(page.getByLabel(label, { exact: true })).click()
    await sichtbar(page.getByRole('option', { name: option, exact: true })).click()
    await page.waitForTimeout(300)
  }
  await waehle('Fach', 'Französisch')
  await waehle('Jahrgang', 'Klasse 8')
  await sichtbar(page.getByLabel('Thema', { exact: false })).fill('Les vacances')
  await page.getByRole('button', { name: 'Vorschlag erzeugen' }).click()
  await page.waitForTimeout(500)
  const teile = (await page.evaluate(() => window.__selftest.kaJetzt()))?.parts?.length ?? 0
  await page.getByRole('button', { name: 'Weiter zu den Aufgaben' }).click()
  await page.getByRole('button', { name: 'Arbeit erzeugen' }).first().click()
  // Wie viele Teile stehen schon in der Vorschau? Gezählt am Text der Attrappe
  const gesehen = new Set()
  const ende = Date.now() + 120000
  let foto = false
  while (Date.now() < ende) {
    const v = page.locator('[data-live-vorschau]').filter({ visible: true })
    if (await v.count()) {
      const n = (
        (
          await v
            .first()
            .innerText()
            .catch(() => '')
        ).match(/Un texte court/g) ?? []
      ).length
      gesehen.add(n)
      if (n >= 1 && !foto) {
        await page.screenshot({ path: join(out, '3-klassenarbeit-teil-1.png') })
        foto = true
      }
    } else if (gesehen.size && (await anzahl('.ws-editor-pages .ws-page'))) break
    await page.waitForTimeout(250)
  }
  const stufen = [...gesehen].sort((x, y) => x - y)
  pruefe(stufen.length > 0, `Die Vorschau zeigt die Arbeit, bevor sie fertig ist (Teile mit Inhalt gesehen: ${stufen.join(', ')} von ${teile})`)
  pruefe(teile < 2 || stufen.filter((n) => n > 0 && n < teile).length >= 1, 'Die Teile erscheinen nacheinander, nicht alle auf einmal')
  pruefe(await warte(async () => (await anzahl('.ws-editor-pages .ws-page')) > 0, 30000), 'Danach steht die Arbeit im Editor')
  await page.screenshot({ path: join(out, '4-klassenarbeit-fertig.png') })
} catch (e) {
  problems.push(`Abbruch: ${e instanceof Error ? e.message : String(e)}`)
  console.error(e)
} finally {
  await app?.close().catch(() => undefined)
  try {
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  } catch {
    // Wegwerf-Profil
  }
}

writeFileSync(join(out, 'ergebnis.txt'), problems.length ? problems.join('\n') : 'OK')
if (problems.length) {
  console.error(`\n${problems.length} Problem(e)`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
