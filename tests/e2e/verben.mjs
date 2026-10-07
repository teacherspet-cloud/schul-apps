// Wache „Unregelmäßige Verben" (30.09.2026) – mit KI-Attrappe, ohne echte KI (vorher: npm run build).
// Aufruf: node tests/e2e/verben.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft: Die Liste der unregelmäßigen Verben aus Green Line wird als Scan
// eingefügt, je Band gespeichert und im Grammatiktest abgefragt – auch im Arbeitsblatt.
// Geprüft wird der ganze Weg:
//   1. Grammatiktest → „Unregelmäßige Verben" → Liste einpflegen → Scan (Attrappe) ablegen
//   2. Die KI-Attrappe liefert die Tabelle; Band „Green Line 3" wird aus dem Scan erkannt,
//      unsichere Zellen sind markiert → Liste speichern (Datei im Ordner der Lehrwerke)
//   3. Tabellenformat + Gruppe A/B → Test erstellen → Editor mit Formentabelle, Lösungen aus
//      der Liste (auch „burnt/burned"), Gruppenumschalter
//   4. Arbeitsblatt (Englisch): „Darunter einfügen → Unregelmäßige Verben …" fügt eine Tabelle ein
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/verben')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-verben-'))

// Scan-Attrappe: ein kleines PNG – den Inhalt „liest" die KI-Attrappe
const scan = join(userData, 'green-line-3-verben.png')
writeFileSync(
  scan,
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
)
const attrappe = join(userData, 'ki-attrappe.json')
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 300,
    antworten: {
      verbliste: {
        band: 'Green Line 3',
        seite: 'S. 212',
        zeilen: [
          { inf: 'go', past: 'went', pp: 'gone', de: 'gehen', hinweis: '', unsicher: [] },
          { inf: 'bring', past: 'brought', pp: 'brought', de: 'bringen', hinweis: '', unsicher: [] },
          { inf: 'burn', past: 'burnt / burned', pp: 'burnt/burned', de: 'brennen', hinweis: 'AE: burned', unsicher: ['de'] },
          { inf: 'sing', past: 'sang', pp: 'sung', de: 'singen', hinweis: '', unsicher: [] },
          { inf: 'cut', past: 'cut', pp: 'cut', de: 'schneiden', hinweis: '', unsicher: [] },
          { inf: 'choose', past: 'chose', pp: 'chosen', de: 'wählen', hinweis: '', unsicher: [] }
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
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1050))
  await warteAufOberflaeche(page)

  // ---------- 1. Grammatiktest: Art „Unregelmäßige Verben"
  await page.click('[aria-label="Grammatiktest"]')
  await page.waitForTimeout(800)
  const neu = page.getByRole('button', { name: 'Neuer Test' })
  if (await neu.count()) await neu.first().click()
  await page.locator('[data-testart]').getByText('Unregelmäßige Verben').click()
  await page.waitForSelector('[data-verbaufgabe]')
  pruefe((await page.locator('[data-verb]').count()) > 10, 'Ohne Lehrwerksliste steht die Standardliste zur Auswahl')
  await page.screenshot({ path: join(out, '1-standardliste.png') })

  // ---------- 2. Liste einpflegen: Scan ablegen
  await page.click('[data-verbliste-oeffnen]')
  const dialog = page.locator('.mantine-Modal-content', { hasText: 'Liste einpflegen' })
  await dialog.waitFor()
  await dialog.locator('input[type=file]').setInputFiles(scan)
  const hinweis = page.locator('.mantine-Modal-content', { hasText: 'Vor dem Hochladen' })
  try {
    await hinweis.waitFor({ timeout: 5000 })
    await hinweis.locator('[data-datenschutz-ok]').click()
  } catch {
    // Hinweis schon bestätigt – dann kommt kein Dialog
  }
  await page.waitForSelector('[data-verbliste-reihe="5"]', { timeout: 20000 })
  const reihen = await page.locator('[data-verbliste-reihe]').count()
  pruefe(reihen === 6, `Sechs Zeilen aus dem Scan übertragen (${reihen})`)
  const past = await dialog.getByLabel('simple past, Zeile 3').inputValue()
  pruefe(past === 'burnt/burned', `Variante wörtlich übernommen („${past}")`)
  pruefe((await dialog.getByText(/unsicher übertragen/).count()) > 0, 'Unsichere Zellen sind markiert')
  const band = await dialog.locator('input[data-verbliste-band]').first().inputValue()
  pruefe(band === 'Green Line 3', `Band aus dem Scan erkannt („${band}")`)
  await page.screenshot({ path: join(out, '2-scan-tabelle.png') })
  // Zeile von Hand ergänzen
  await dialog.locator('[data-verbliste-zeile]').click()
  await dialog.getByLabel('infinitive, Zeile 7').fill('write')
  await dialog.getByLabel('simple past, Zeile 7').fill('wrote')
  await dialog.getByLabel('past participle, Zeile 7').fill('written')
  await dialog.getByLabel('German, Zeile 7').fill('schreiben')
  await dialog.locator('[data-verbliste-speichern]').click()
  await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined)
  const datei = join(userData, 'lehrwerke', 'verben', 'green-line-3.json')
  pruefe(existsSync(datei), 'Liste als eigene Datei neben den Lehrwerken gespeichert')
  if (existsSync(datei)) {
    const liste = JSON.parse(readFileSync(datei, 'utf8'))
    pruefe(liste.eintraege.length === 7 && liste.reihe === 'Green Line' && liste.band === '3', 'Liste trägt Reihe, Band und alle Zeilen')
  }
  await page.waitForTimeout(800)
  const bandWahl = await page.locator('input[data-verbaufgabe-band]').first().inputValue()
  pruefe(/Green Line 3/.test(bandWahl), `Die neue Liste ist als Quelle gewählt („${bandWahl}")`)

  // ---------- 3. Tabellenformat, Gruppe A/B, erstellen
  const format = async (id, an) => {
    const box = page.locator(`input[data-verbformat="${id}"]`)
    if ((await box.isChecked()) !== an) await box.click()
  }
  await format('tabelle', true)
  await format('tabelleGemischt', false)
  await format('lueckensatz', false)
  await format('auswahl', true)
  await page.locator('[data-fassungen]').first().getByText('A / B').first().click()
  await page.screenshot({ path: join(out, '3-einstellungen.png') })
  await page.getByRole('button', { name: 'Test erstellen' }).click()
  await page.waitForSelector('.ws-editor-pages:visible', { timeout: 30000 })
  await page.waitForTimeout(1500)
  pruefe((await page.locator('.ws-editor-pages .ws-table-fill').count()) > 0, 'Der Test enthält die Formentabelle')
  const kopf = await page.locator('.ws-editor-pages .ws-table-fill th').allTextContents()
  pruefe(kopf.join('|').includes('simple past'), `Spalten wie im Schulbuch (${kopf.join(' | ')})`)
  pruefe((await page.getByRole('radio', { name: 'Gruppe B' }).count()) + (await page.getByText('Gruppe B', { exact: true }).count()) > 0, 'Umschalter Gruppe A/B')
  const test = await page.evaluate(() => window.__selftest?.grammarTestJetzt?.() ?? null)
  if (test) pruefe(Array.isArray(test.weitereFassungen?.[0]) && test.weitereFassungen[0].length > 0, 'Gruppe B ist erzeugt')
  await page.screenshot({ path: join(out, '4-test.png') })
  await page.getByText('Lösungen', { exact: true }).first().click()
  await page.waitForTimeout(1200)
  const loesung = (await page.locator('.ws-editor-pages').textContent()) ?? ''
  pruefe(/went|brought|burnt\/burned|sang|chose|wrote|cut/.test(loesung), 'Lösungen stehen aus der Liste in den Lücken')
  pruefe(/Je Form 1 Punkt/.test(loesung), 'Bewertungshinweis im Lösungsteil')
  await page.screenshot({ path: join(out, '5-loesungen.png') })

  // ---------- 4. Arbeitsblatt: Verben an beliebiger Stelle einfügen
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__selftest.wsMaterialtext(3))
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    const ws = structuredClone(window.__selftest.worksheetJetzt())
    ws.meta.subjectId = 'englisch'
    ws.meta.subjectLabel = 'Englisch'
    ws.meta.grade = 7
    window.__selftest.setWorksheet(ws)
  })
  await page.waitForTimeout(1500)
  const vorher = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.length)
  const rahmen = page.locator('.ws-editor-pages .editor-block').first()
  await rahmen.hover()
  await page.waitForTimeout(300)
  await rahmen.locator('[aria-label="Weitere Aktionen"]').first().click()
  await page.getByText('Darunter einfügen').hover()
  await page.waitForTimeout(300)
  await page.locator('[data-menue-verben]').last().click()
  const einfuegen = page.locator('.mantine-Modal-content', { hasText: 'Unregelmäßige Verben einfügen' })
  await einfuegen.waitFor()
  await page.waitForTimeout(800)
  await einfuegen.locator('input[data-verbformat="lueckensatz"]').isChecked().then((an) => an && einfuegen.locator('input[data-verbformat="lueckensatz"]').click())
  await page.screenshot({ path: join(out, '6-arbeitsblatt-dialog.png') })
  await einfuegen.locator('[data-verben-einfuegen-ok]').click()
  await einfuegen.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined)
  await page.waitForTimeout(1500)
  const bloecke = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.map((b) => (b.type === 'task' ? b.answer.kind : b.type)))
  pruefe(bloecke.length > vorher && bloecke.includes('tableFill'), `Verb-Aufgaben ins Arbeitsblatt eingefügt (${bloecke.join(', ')})`)
  await page.screenshot({ path: join(out, '7-arbeitsblatt.png') })
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true })
}

if (problems.length) {
  console.error('\nProbleme:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log('\nUnregelmäßige Verben: Scan → Liste → Grammatiktest und Arbeitsblatt funktionieren. Bilder in', out)
