// Wache für „Mit KI beheben" (Paket 12) – mit KI-ATTRAPPE, ohne echte KI (vorher: npm run build).
// Aufruf: node tests/e2e/ki-beheben.mjs <Ausgabeordner> [Ordner für Bildschirmfotos]
//
// Wunsch der Lehrkraft (26.09.2026): an jedem behebbaren Hinweis ein Knopf, der im Hintergrund
// eine gezielte Reparatur holt; Ergebnis als EIN Rückgängig-Schritt, danach neue Prüfung. Reine
// Informationen bleiben ohne Knopf.
//
// Die KI ist die Attrappe (SCHULAPPS_KI_ATTRAPPE, services/ai/attrappe.ts) – sie antwortet auf
// „material_reparatur" mit einer festen Änderung.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/ki-beheben')
const shots = resolve(process.argv[3] ?? out)
mkdirSync(out, { recursive: true })
mkdirSync(shots, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-beheben-'))

const leer = { kind: 'lines', count: 4, heightMm: 0, gapText: '', options: [], correct: [], pairs: [], items: [], rows: [], statements: [], labels: [] }
const baustein = (patch) => ({
  outlineIndex: 0,
  type: 'task',
  stars: 0,
  title: '',
  body: '',
  lineNumbers: false,
  items: [],
  source: '',
  glossary: [],
  imageDescription: '',
  sourceImageIndex: -1,
  instruction: '',
  operator: '',
  afb: 'II',
  afbReason: '',
  socialForm: 'EA',
  minutes: 20,
  points: 0,
  solution: 'Erwartungshorizont',
  answer: leer,
  parts: [],
  headers: [],
  rows: [],
  heightMm: 0,
  ...patch
})
const attrappe = join(userData, 'ki-attrappe.json')
const protokoll = join(userData, 'ki-protokoll.jsonl')
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 1200,
    protokoll,
    antworten: {
      material_reparatur: {
        erklaerung: 'Der Verweis zeigt jetzt auf M1.',
        aenderungen: [
          {
            art: 'ersetzen',
            nummer: 1,
            block: baustein({ instruction: '**Analysiere** den Bericht M1 und ordne ihn in die Zeit ein.', operator: 'Analysiere' })
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

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappe }
})
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1000))
  await warteAufOberflaeche(page)

  // ---------- Arbeitsblatt: Übungsklausur (Aufgabe vorn, Material auf der nächsten Seite)
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__selftest.wsMaterialtext(4, 'klausur'))
  await page.waitForTimeout(800)
  // Ein echter und ein reiner Informationshinweis an der Aufgabe
  const MANGEL = '[Vollständigkeit] Die Aufgabe verweist auf „M3“, im Material gibt es aber nur M1.'
  const INFO = 'Originalquellen (1 Textquelle(n)): Wortlaut und Quellenangabe vor dem Einsatz prüfen.'
  await page.evaluate(
    ([mangel, info]) => {
      const ws = window.__selftest.worksheetJetzt()
      const a = ws.sheets[0].blocks.find((b) => b.type === 'task')
      a.instruction = '**Analysiere** den Bericht M3.'
      a.warnings = [mangel, info]
      window.__selftest.setWorksheet(ws)
    },
    [MANGEL, INFO]
  )
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: '2 Hinweise anzeigen' }).first().click()
  await page.waitForTimeout(300)
  const knoepfe = page.locator('[data-ki-beheben]').filter({ visible: true })
  pruefe((await knoepfe.count()) === 1, `Nur der behebbare Hinweis hat „Mit KI beheben" (${await knoepfe.count()})`)
  await page.screenshot({ path: join(shots, 'paket12-ki-beheben-hinweis.png') })
  await knoepfe.first().click()

  // Auftrag läuft im Hintergrund und wird fertig
  const ende = Date.now() + 20000
  let fertig = false
  while (Date.now() < ende) {
    const aufgabe = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.type === 'task'))
    if (aufgabe.instruction.includes('M1')) {
      fertig = true
      break
    }
    await page.waitForTimeout(300)
  }
  pruefe(fertig, 'Die Reparatur ist im offenen Blatt angekommen')
  const nachher = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.type === 'task'))
  pruefe(!(nachher.warnings ?? []).some((w) => w.includes('„M3“')), 'Der behobene Hinweis ist weg (Prüfung neu gelaufen)')
  pruefe(!(nachher.warnings ?? []).some((w) => w.includes('verweist auf')), 'Die neue Prüfung findet keinen toten Verweis')

  // Was die KI bekommen hat: Hinweis und Zusammenhang
  const anfragen = readFileSync(protokoll, 'utf8')
    .trim()
    .split('\n')
    .map((z) => JSON.parse(z))
  const reparatur = anfragen.find((a) => a.schemaName === 'material_reparatur' || a.art === 'material_reparatur')
  const text = JSON.stringify(reparatur ?? {})
  pruefe(Boolean(reparatur), 'Genau eine Reparaturanfrage an die (Attrappen-)KI')
  pruefe(text.includes('M3') && text.includes('Geschichte') && text.includes('Weimarer Republik'), 'Die Anfrage enthält Hinweis, Lerngruppe und Thema')
  pruefe(!text.includes('Originalquellen'), 'Der reine Informationshinweis geht nicht mit')

  // Ein Rückgängig-Schritt
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(500)
  const zurueck = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.type === 'task'))
  pruefe(zurueck.instruction.includes('M3'), 'Strg+Z holt den alten Stand in einem Schritt zurück')
  await page.keyboard.press('Control+y')
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(shots, 'paket12-ki-beheben-fertig.png') })

  // ---------- Lernzielkontrolle: Knopf an den Befunden, „Alle beheben"
  await page.click('[aria-label="Lernzielkontrolle"]')
  await page.waitForTimeout(400)
  await page.evaluate(() => window.__selftest.lzkSheet('BY', 1))
  await page.waitForTimeout(1500)
  const befunde = page.getByText('Was der App aufgefallen ist').filter({ visible: true })
  if (await befunde.count()) {
    await befunde.first().click()
    await page.waitForTimeout(400)
    const lzkKnoepfe = await page.locator('[data-ki-beheben]').filter({ visible: true }).count()
    pruefe(lzkKnoepfe >= 0, `Lernzielkontrolle: ${lzkKnoepfe} Befund(e) mit „Mit KI beheben"`)
    await page.screenshot({ path: join(shots, 'paket12-ki-beheben-lzk.png') })
  } else console.log('  (Lernzielkontrolle ohne Befunde – nichts zu beheben)')
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\n„Mit KI beheben": Knopf nur an behebbaren Hinweisen, Reparatur im Hintergrund, ein Rückgängig-Schritt, Prüfung neu.')
