// Wache für das RECHTSPAKET (Großprogramm 0.4): Datenschutzhinweis vor dem Hochladen,
// Namen ersetzen, KI-Kennzeichnung im PDF. Ohne KI-Aufruf (vorher: npm run build).
// Aufruf: node tests/e2e/datenschutz-ki.mjs <Ausgabeordner>
//
// 1. Klassenarbeit: Datei mit „Name: Lea Schmidt" hochladen → Hinweis erscheint (erstes Mal),
//    der Name aus der Kopfzeile ist vorbelegt, danach steht S1 statt des Namens in der Unterlage.
// 2. Zweites Hochladen ohne Namen → kein Dialog mehr.
// 3. PDF mit KI-Herkunft im HTML → Betreff, Stichwörter und KI-Einträge im Info-Verzeichnis.
//
// Alles in einem WEGWERF-Profil.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { PDFDocument, PDFName } from 'pdf-lib'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/datenschutz-ki')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-datenschutz-'))
const dateien = mkdtempSync(join(tmpdir(), 'schulapps-datenschutz-dateien-'))
const mitName = join(dateien, 'aufsatz-lea.txt')
writeFileSync(mitName, 'Name: Lea Schmidt\nKlasse: 7b\n\nLea schreibt über ihren Ausflug in den Zoo. Frau Schmidt hat sie begleitet.')
const ohneName = join(dateien, 'sachtext.txt')
writeFileSync(ohneName, 'Die Fotosynthese findet in den Chloroplasten statt.')

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
try {
  const page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1050))
  await warteAufOberflaeche(page, 3, { assistent: true })
  const assistent = page.locator('.mantine-Modal-content', { hasText: 'Willkommen bei Schul-Apps' })
  await page.waitForTimeout(2000)
  if (await assistent.count()) await assistent.getByRole('button', { name: 'Später einrichten' }).click()

  await page.click('[aria-label="Klassenarbeiten"]')
  await page.waitForSelector('text=Rahmen der Arbeit')
  const feld = page.locator('.mantine-Dropzone-root', { hasText: 'Material aus dem Unterricht' }).locator('input[type=file]')

  // ---------- 1. Erstes Hochladen mit Namen
  await feld.setInputFiles(mitName)
  const dialog = page.locator('.mantine-Modal-content', { hasText: 'Vor dem Hochladen' })
  await dialog.waitFor({ timeout: 10000 })
  pruefe((await dialog.getByText('Was mit hochgeladenen Dateien geschieht').count()) === 1, 'Beim ersten Hochladen steht der Datenschutzhinweis')
  const lea = dialog.getByLabel(/Lea Schmidt \(Kopfzeile\)/)
  pruefe(await lea.isChecked(), 'Der Name aus der Kopfzeile ist zum Ersetzen vorbelegt')
  await page.screenshot({ path: join(out, 'hinweis.png') })
  await dialog.locator('[data-datenschutz-ok]').click()
  await page.getByText('aufsatz-lea.txt', { exact: true }).waitFor({ timeout: 10000 })
  const quelle = await page.evaluate(() => window.__selftest.kaJetzt().meta.materialQuellen?.[0])
  pruefe(
    Boolean(quelle) && !quelle.text.includes('Lea') && !quelle.text.includes('Schmidt') && quelle.text.includes('S1'),
    'In der Unterlage steht S1 statt des Namens'
  )

  // ---------- 2. Zweites Hochladen ohne Namen: kein Dialog
  await feld.setInputFiles(ohneName)
  await page.getByText('sachtext.txt', { exact: true }).waitFor({ timeout: 10000 })
  pruefe((await dialog.count()) === 0, 'Ohne Namen und nach bestätigtem Hinweis erscheint kein Dialog')
  const einstellungen = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
  pruefe(Boolean(einstellungen.datenschutz?.hinweisBestaetigt), 'Die Bestätigung ist in den Einstellungen gemerkt')

  // ---------- 3. PDF-Kennzeichnung
  const ki = { anbieter: 'OpenAI', modell: 'gpt-test', am: '2026-09-28' }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Wache KI</title><meta name="schulapps-ki" content="${JSON.stringify(ki).replace(/"/g, '&quot;')}"></head><body><p>Probe</p></body></html>`
  const pfad = await page.evaluate(([o, h]) => window.api.exporter.pdfInFolder(o, h, 'wache-ki.pdf'), [out, html])
  const pdf = await PDFDocument.load(readFileSync(pfad), { updateMetadata: false })
  pruefe(pdf.getTitle() === 'Wache KI', `Titel im PDF (${pdf.getTitle()})`)
  pruefe((pdf.getSubject() ?? '').startsWith('Mit KI-Unterstützung erstellt (OpenAI · gpt-test'), `Betreff mit Vermerk (${pdf.getSubject()})`)
  pruefe((pdf.getKeywords() ?? '').includes('KI-generiert'), `Stichwörter (${pdf.getKeywords()})`)
  const info = pdf.context.lookup(pdf.context.trailerInfo.Info)
  pruefe(String(info.get(PDFName.of('KI-Anbieter')) ?? '').includes('OpenAI'), 'Eigener Eintrag KI-Anbieter')
  pruefe(pdf.getCreator() === 'Schul-Apps', 'Erzeuger Schul-Apps')
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true })
  rmSync(dateien, { recursive: true, force: true })
}

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
