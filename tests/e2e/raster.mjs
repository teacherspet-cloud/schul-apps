// Wache für das BEWERTUNGSRASTER (Großprogramm 0.4, F2) – mit KI-ATTRAPPE (vorher: npm run build).
// Aufruf: node tests/e2e/raster.mjs <Ausgabeordner>
//
// Übungsklausur mit einer Aufgabe: „KI › Bewertungsraster erstellen" setzt eine Tabelle hinter
// die Aufgabe, nur im Lösungsteil; das Schülerblatt bleibt ohne Raster. Alles im WEGWERF-Profil.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/raster')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-raster-'))
const protokoll = join(userData, 'ki-protokoll.jsonl')
const attrappe = join(userData, 'ki-attrappe.json')
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 200,
    protokoll,
    antworten: {
      bewertungsraster: {
        stufen: [
          { name: 'voll erfüllt', punkte: 100 },
          { name: 'teilweise erfüllt', punkte: 50 },
          { name: 'nicht erfüllt', punkte: 0 }
        ],
        kriterien: [
          { name: 'Quelle eingeordnet', bereich: 'inhalt', beschreibungen: ['Verfasser, Zeit, Anlass', 'zwei davon', 'fehlt'], punkte: 4 },
          { name: 'Inhalt wiedergegeben', bereich: 'inhalt', beschreibungen: ['alle Kernaussagen', 'einige', 'keine'], punkte: 6 }
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
const anfragen = () =>
  existsSync(protokoll)
    ? readFileSync(protokoll, 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((z) => JSON.parse(z))
    : []

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappe }
})
const page = await app.firstWindow()
page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1050))
await warteAufOberflaeche(page)
try {
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__selftest.wsMaterialtext(3, 'klausur'))
  await page.waitForTimeout(1000)
  const aufgabeId = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.type === 'task')?.id)
  pruefe(Boolean(aufgabeId), 'Das Blatt hat eine Aufgabe')
  const aufgabe = page.locator('.editor-block', { has: page.locator('.ws-task') }).first()
  await aufgabe.hover()
  await page.waitForTimeout(300)
  await aufgabe.getByRole('button', { name: 'KI-Aktionen' }).click()
  await page.locator('[data-raster-erstellen]').filter({ visible: true }).click()

  const ende = Date.now() + 20000
  let tabelle = null
  while (Date.now() < ende) {
    tabelle = await page.evaluate((id) => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === `raster-${id}`) ?? null, aufgabeId)
    if (tabelle) break
    await page.waitForTimeout(300)
  }
  pruefe(tabelle?.type === 'table', 'Das Raster steht als Tabelle im Blatt')
  pruefe(tabelle?.nurLoesung === true, 'Nur im Lösungsteil')
  pruefe(JSON.stringify(tabelle?.headers) === JSON.stringify(['Kriterium', 'voll erfüllt', 'teilweise erfüllt', 'nicht erfüllt']), 'Kopf mit den Stufen')
  const reihenfolge = await page.evaluate((id) => {
    const b = window.__selftest.worksheetJetzt().sheets[0].blocks
    return b.findIndex((x) => x.id === `raster-${id}`) - b.findIndex((x) => x.id === id)
  }, aufgabeId)
  pruefe(reihenfolge === 1, 'Direkt hinter der Aufgabe')
  const a = anfragen().filter((z) => z.schemaName === 'bewertungsraster')
  pruefe(a.length === 1, 'Eine Anfrage an die KI')
  // Schülerblatt ohne Raster, Lösungen mit
  const markiert = await page.locator('[data-nur-loesung]', { hasText: 'Quelle eingeordnet' }).count()
  pruefe(markiert >= 1, 'Im Editor als Lösungsbaustein gekennzeichnet („nur im Lösungsteil")')
  await page.getByText('Lösungen', { exact: true }).filter({ visible: true }).first().click()
  await page.waitForTimeout(800)
  const loesung = await page.locator('.ws-editor-pages').first().innerText()
  pruefe(loesung.includes('Quelle eingeordnet'), 'In der Lösungsansicht steht das Raster')
  await page.screenshot({ path: join(out, 'loesung.png') })
} catch (e) {
  problems.push(`Abbruch: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
