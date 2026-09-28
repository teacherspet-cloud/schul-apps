// Wache für LEVELN (Großprogramm 0.4, F1) – mit KI-ATTRAPPE, ohne echte KI (vorher: npm run build).
// Aufruf: node tests/e2e/leveln.mjs <Ausgabeordner>
//
// Ein Arbeitsblatt mit Lesetext und Originalquelle: Über „KI › Leveln › In Einfacher Sprache"
// entsteht eine neue Fassung des Lesetextes; die Anfrage nennt die Regeln der Einfachen
// Sprache. Die Originalquelle bietet „Leveln" nicht an. Alles in einem WEGWERF-Profil.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/leveln')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-leveln-'))
const protokoll = join(userData, 'ki-protokoll.jsonl')
const attrappe = join(userData, 'ki-attrappe.json')
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 200,
    protokoll,
    antworten: { worksheet_block: { block: { type: 'text', title: 'Die Fotosynthese', body: 'Pflanzen machen Zucker.\n\nDafür brauchen sie Licht.' } } }
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
  await page.evaluate(() => window.__selftest.wsMaterialtext(2, 'text'))
  await page.waitForTimeout(600)
  // Einen eigenen Lesetext (ohne Quelle) vor die Quelle setzen
  await page.evaluate(() => {
    const ws = window.__selftest.worksheetJetzt()
    const vorlage = ws.sheets[0].blocks.find((b) => b.type === 'text')
    ws.sheets[0].blocks.unshift({
      ...structuredClone(vorlage),
      sourceHeader: undefined,
      id: 'lese1',
      type: 'text',
      title: 'Die Fotosynthese',
      body: 'Die Fotosynthese ist ein biochemischer Prozess, bei dem Pflanzen unter Nutzung von Lichtenergie aus Kohlenstoffdioxid und Wasser Glucose synthetisieren.',
      source: '',
      lineNumbers: false
    })
    window.__selftest.setWorksheet(ws)
  })
  await page.waitForTimeout(1200)

  const lese = page.locator('.editor-block', { hasText: 'biochemischer Prozess' }).first()
  await lese.hover()
  await page.waitForTimeout(300)
  await lese.getByRole('button', { name: 'KI-Aktionen' }).click()
  await page.getByText('Leveln', { exact: true }).filter({ visible: true }).first().hover()
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(out, 'menue.png') })
  await page.locator('[data-leveln="einfach"]').filter({ visible: true }).click()

  const ende = Date.now() + 20000
  let fassungen = 0
  while (Date.now() < ende) {
    fassungen = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === 'lese1')?.versions?.length ?? 0)
    if (fassungen >= 2) break
    await page.waitForTimeout(300)
  }
  pruefe(fassungen >= 2, `Neue Fassung am Lesetext (${fassungen} Fassungen)`)
  const text = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === 'lese1')?.body ?? '')
  pruefe(text.includes('Pflanzen machen Zucker'), 'Die neue Fassung steht im Blatt')
  const a = anfragen().filter((z) => z.schemaName === 'worksheet_block')
  pruefe(a.length === 1 && a[0].user.includes('DIN 8581-1'), 'Genau eine Anfrage mit den Regeln der Einfachen Sprache')
  await page.screenshot({ path: join(out, 'fassung.png') })

  // Originalquelle: „Leveln" ist gesperrt
  await page.keyboard.press('Escape')
  const quelle = page.locator('.editor-block', { hasText: 'Bericht aus der Versammlung' }).first()
  await quelle.hover()
  await page.waitForTimeout(300)
  await quelle.getByRole('button', { name: 'KI-Aktionen' }).click()
  await page.waitForTimeout(300)
  const gesperrt = page.getByRole('menuitem', { name: 'Leveln' }).filter({ visible: true }).first()
  pruefe((await gesperrt.getAttribute('data-disabled')) === 'true' || (await gesperrt.isDisabled()), 'Bei der Originalquelle ist „Leveln" gesperrt')
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
