// Wache für die Blindprobe der Ankreuzfragen zu Texten (01.10.2026) – mit KI-ATTRAPPE.
// (vorher: npm run build)
// Aufruf: node tests/e2e/mc-blindprobe.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft: Lernende dürfen keine Antwortmöglichkeit ausschließen können, ohne den Text
// gelesen zu haben. Geprüft über die Oberfläche (Arbeitsblatt, älteres Blatt ohne Blindprobe):
//  - der Hinweis „MC-Frage ohne Text lösbar?" steht über dem Blatt,
//  - „Vorschlag der App umsetzen" fragt die KI OHNE den Text (Protokoll), fasst die lösbare Frage
//    neu (mit dem Text) und lässt die nicht lösbare stehen,
//  - danach ist der Hinweis weg, die neue Frage steht auf dem Blatt, Rückgängig holt die alte zurück,
//  - in den Einstellungen gibt es den Schalter „Blindprobe für Ankreuzfragen zu Texten".
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/mc-blindprobe')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-mc-blind-'))
const protokoll = join(userData, 'ki-protokoll.jsonl')
const attrappe = join(userData, 'ki-attrappe.json')
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 150,
    protokoll,
    antworten: {
      // 1. Runde: Frage 1 ohne Text sicher gelöst, Frage 2 geraten; 2. Runde (nur die neue Frage): geraten
      mc_blindprobe: {
        folge: [
          {
            antworten: [
              { nr: 1, antwort: 0, sicherheit: 97, ausgeschlossen: [{ option: 1, grund: 'kein Ort' }, { option: 2, grund: 'kein Ort' }] },
              { nr: 2, antwort: 2, sicherheit: 25, ausgeschlossen: [] }
            ]
          },
          { antworten: [{ nr: 1, antwort: 0, sicherheit: 30, ausgeschlossen: [] }] }
        ]
      },
      mc_neufassung: { fragen: [{ nr: 1, frage: 'What do the fishermen order?', optionen: ['tea with milk', 'tea with lemon', 'coffee with sugar'], richtig: 1 }] }
    }
  })
)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

let app = null
try {
  app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappe } })
  const page = await app.firstWindow()
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.setSize(1500, 1000)
      win.center()
    }
  })
  await warteAufOberflaeche(page)

  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__selftest.mcBlindSheet())
  await page.waitForSelector('.ws-editor-pages:visible', { timeout: 30000 })
  const hinweis = page.getByTestId('mc-blind-hinweis')
  await hinweis.waitFor({ timeout: 15000 }).catch(() => undefined)
  pruefe(await hinweis.isVisible(), 'Hinweis „MC-Frage ohne Text lösbar?" steht über dem älteren Blatt')
  pruefe((await hinweis.innerText().catch(() => '')).includes('noch keine Blindprobe'), 'Der Hinweis nennt die fehlende Blindprobe')
  await page.screenshot({ path: join(out, '1-hinweis.png') })

  await page.getByTestId('mc-blind-umsetzen').click()
  await hinweis.waitFor({ state: 'detached', timeout: 30000 }).catch(() => undefined)
  pruefe(!(await hinweis.isVisible().catch(() => false)), 'Nach der Blindprobe ist der Hinweis weg')
  await page.waitForTimeout(800)
  const blatt = await page.locator('.ws-editor-pages').first().innerText()
  pruefe(blatt.includes('What do the fishermen order?'), 'Die ohne Text lösbare Frage ist neu gefasst')
  pruefe(!blatt.includes('capital of France'), 'Die alte Frage steht nicht mehr auf dem Blatt')
  pruefe(blatt.includes('When does the café close?'), 'Die nicht lösbare Frage bleibt')
  await page.screenshot({ path: join(out, '2-neu-gefasst.png') })

  const ki = existsSync(protokoll)
    ? readFileSync(protokoll, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((z) => JSON.parse(z))
    : []
  const blind = ki.filter((z) => z.schemaName === 'mc_blindprobe')
  const neu = ki.filter((z) => z.schemaName === 'mc_neufassung')
  pruefe(blind.length === 2, `Zwei Blindanfragen (Probe, Nachprobe der neuen Frage): ${blind.length}`)
  pruefe(blind.every((z) => !z.user.includes('harbour café') && !z.user.includes('[richtig]')), 'Die Blindprobe bekommt weder den Text noch die Lösung')
  pruefe(neu.length === 1 && neu[0].user.includes('harbour café'), 'Die Neufassung bekommt den Text')

  // Rückgängig: die alte Frage kommt zurück (ein Schritt)
  await page.locator('[aria-label="Rückgängig"]').filter({ visible: true }).first().click()
  await page.waitForTimeout(800)
  const zurueck = await page.locator('.ws-editor-pages').first().innerText()
  pruefe(zurueck.includes('capital of France'), 'Rückgängig holt die alte Frage zurück')

  // Schalter in den Einstellungen
  await page.click('[aria-label="Einstellungen"]').catch(() => undefined)
  await page.waitForTimeout(800)
  const reiter = page.getByRole('tab', { name: /KI/ }).first()
  if (await reiter.count()) await reiter.click().catch(() => undefined)
  await page.waitForTimeout(500)
  const schalter = page.getByTestId('einstellung-mc-blindprobe')
  pruefe((await schalter.count()) > 0, 'Einstellungen: Schalter „Blindprobe für Ankreuzfragen zu Texten"')
  if (await schalter.count()) {
    await schalter.first().scrollIntoViewIfNeeded()
    pruefe(await schalter.first().isChecked(), 'Die Blindprobe ist voreingestellt an')
    await page.screenshot({ path: join(out, '3-einstellung.png') })
  }
} catch (e) {
  problems.push(`Abbruch: ${e instanceof Error ? e.message : String(e)}`)
  console.error(e)
} finally {
  await app?.close().catch(() => undefined)
  try {
    rmSync(userData, { recursive: true, force: true })
  } catch {
    // Electron hält Dateien noch kurz offen
  }
}

console.log(problems.length ? `\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}` : '\nAlles in Ordnung.')
process.exit(problems.length ? 1 : 0)
