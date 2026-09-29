// Rauchtest der iPad-App im Browser – ohne Mac, ohne iPad (29.09.2026).
//
// Vorher: SCHULAPPS_MOBIL_TEST=1 npm run build:mobil  (Prüf-Build: KI-Attrappe erlaubt)
// Aufruf: node tests/e2e/mobil.mjs <Ausgabeordner> [chromium|webkit|beide]
//
// Die App aus out/mobil läuft in einem gewöhnlichen Browser: Capacitor fällt dort auf seine
// Web-Fassungen zurück (Dateisystem in IndexedDB, Schlüssel im localStorage), PdfDruck fehlt.
// Geprüft wird, was ohne das native iOS geht:
//  1. Die App startet, die Startseite steht da, keine Fehler im Fenster.
//  2. Einstellungen (Schulname) bleiben nach dem Neuladen erhalten – das Speicher-Dateisystem
//     schreibt über @capacitor/filesystem und lädt beim Start wieder.
//  3. Ein API-Schlüssel landet im „Schlüsselbund" (Web-Ersatz) und nicht im Dateisystem.
//  4. Ein Vokabeltest entsteht mit der KI-Attrappe von Anfang bis Ende und liegt danach in der Bibliothek.
//  5. Die Oberfläche des iPads: kein Netzwerk-Reiter, KI nur über API-Schlüssel.
import { chromium, webkit } from 'playwright-core'
import { createServer } from 'http'
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { extname, join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/mobil')
const welche = process.argv[3] ?? 'beide'
mkdirSync(out, { recursive: true })
const wurzel = resolve('out/mobil')
if (!existsSync(join(wurzel, 'index.html'))) throw new Error('out/mobil fehlt – vorher: SCHULAPPS_MOBIL_TEST=1 npm run build:mobil')

// ---------- Ein schlichter Server für out/mobil (wie capacitor://localhost)
const TYPEN = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain'
}
const server = createServer((req, res) => {
  const pfad = decodeURIComponent((req.url ?? '/').split('?')[0])
  let datei = join(wurzel, pfad === '/' ? 'index.html' : pfad)
  if (!datei.startsWith(wurzel) || !existsSync(datei) || statSync(datei).isDirectory()) datei = join(wurzel, 'index.html')
  res.setHeader('content-type', TYPEN[extname(datei)] ?? 'application/octet-stream')
  res.end(readFileSync(datei))
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const adresse = `http://127.0.0.1:${server.address().port}/`

// ---------- Die Attrappe: feste Antworten je Auftragsart (services/ai/attrappe.ts)
const attrappe = {
  verzoegerungMs: 800,
  antworten: {
    vocabulary_test: {},
    review: { problems: [] },
    vocab_analysis: { entries: [] },
    testplan: { tasks: [] },
    // Einzelne Aufgaben (Wiederholung je Aufgabentyp): leer – die Attrappe kennt die Kennungen der Vokabeln nicht
    ...Object.fromEntries(
      'gapSentences gapText dialogue matchDefinitions writeDefinitions pictureLabel multipleChoice synonymsAntonyms collocations wordFormation wordFamily mindmap oddOneOut categorize writeSentences mediation crossword scrambled wrongWord twoSentences trueFalse freeText'
        .split(' ')
        .map((t) => [t, { instruction: 'Rauchtest', items: [] }])
    )
  }
}

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

async function lauf(name, browserTyp, startOpt) {
  console.log(`\n=== ${name} ===`)
  const browser = await browserTyp.launch(startOpt)
  const kontext = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1 })
  await kontext.addInitScript((a) => localStorage.setItem('schulapps-ki-attrappe', a), JSON.stringify(attrappe))
  const page = await kontext.newPage()
  const fehler = []
  page.on('pageerror', (e) => fehler.push(`Fehler im Fenster: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(m.text())) fehler.push(`Konsole: ${m.text()}`)
  })
  const sichtbar = (loc) => loc.filter({ visible: true }).first()
  try {
    // ---------- 1. Start
    await page.goto(adresse)
    await page.waitForSelector('text=Schul-Apps', { timeout: 30000 })
    pruefe(await page.evaluate(() => window.__plattform === 'ios'), `${name}: Plattform „ios" gemeldet`)
    const spaeter = page.getByRole('button', { name: 'Später einrichten' })
    await spaeter.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined)
    if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
    await page.screenshot({ path: join(out, `${name}-1-start.png`) })
    pruefe(await page.locator('[aria-label="Vokabeltest"]').first().isVisible(), `${name}: Startseite mit den Programmen sichtbar`)

    // ---------- 2. Einstellungen bleiben nach dem Neuladen
    const schule = `Rauchtest-Schule ${name}`
    await page.evaluate((s) => window.api.settings.set({ schoolName: s }), schule)
    // Die Schreibwarteschlange schreibt 300 ms nach der letzten Änderung
    await page.waitForTimeout(1200)
    await page.reload()
    await page.waitForSelector('text=Schul-Apps', { timeout: 30000 })
    const nachher = await page.evaluate(() => window.api.settings.get().then((s) => s.schoolName))
    pruefe(nachher === schule, `${name}: Schulname nach dem Neuladen erhalten („${nachher}")`)

    // ---------- 3. Schlüssel im Schlüsselbund, nicht im Dateisystem
    await page.evaluate(() => window.api.secrets.set('elevenlabs', 'sk_rauchtest'))
    await page.waitForTimeout(800)
    const imBund = await page.evaluate(() => localStorage.getItem('schulapps.secrets'))
    pruefe(Boolean(imBund && imBund.includes('elevenlabs')), `${name}: Schlüssel liegt im Schlüsselbund (Web-Ersatz)`)
    const hat = await page.evaluate(() => window.api.secrets.has('elevenlabs'))
    pruefe(hat === true, `${name}: Schlüssel wird wiedergefunden`)
    await page.reload()
    await page.waitForSelector('text=Schul-Apps', { timeout: 30000 })
    pruefe(await page.evaluate(() => window.api.secrets.has('elevenlabs')), `${name}: Schlüssel auch nach dem Neuladen da`)
    const status = await page.evaluate(() => window.api.ai.status())
    pruefe(status.hasTextKey === true, `${name}: KI gilt mit der Attrappe als eingerichtet`)

    // ---------- 5. Oberfläche des iPads
    await page.evaluate(() => window.api.settings.set({ ai: { access: { openai: 'subscription' } } }))
    await sichtbar(page.getByRole('button', { name: /Einstellungen/ })).click()
    await page.waitForSelector('text=Einstellungen', { timeout: 10000 })
    pruefe((await page.getByRole('tab', { name: 'Netzwerk' }).count()) === 0, `${name}: kein Reiter „Netzwerk"`)
    const kiReiter = page.getByRole('tab', { name: 'KI-Zugang' })
    if (await kiReiter.count()) {
      await kiReiter.click()
      await page.waitForTimeout(500)
      pruefe((await page.getByText(/^Abo \(/).count()) === 0, `${name}: keine Abo-Wahl beim KI-Zugang`)
      pruefe((await page.getByText(/API-Schlüssel für/).count()) > 0, `${name}: Feld für den API-Schlüssel da`)
    } else pruefe(false, `${name}: Reiter „KI-Zugang" fehlt`)
    await page.screenshot({ path: join(out, `${name}-2-einstellungen.png`) })

    // ---------- 4. Vokabeltest mit der Attrappe
    await page.locator('[aria-label="Vokabeltest"]').first().click()
    await page.waitForSelector('text=Vokabelliste', { timeout: 15000 })
    await page.getByRole('tab', { name: 'Schulbuch' }).click()
    await page.getByRole('combobox', { name: 'Lehrwerk' }).click()
    await page.getByRole('option', { name: 'Green Line 4', exact: true }).click()
    await page.getByRole('combobox', { name: 'Unit', exact: true }).click()
    await page.getByRole('option', { name: 'Unit 1', exact: true }).click()
    await page.getByRole('button', { name: 'alle' }).click()
    await page.getByRole('button', { name: /Vokabeln anzeigen und auswählen/ }).click()
    const ersetzen = page.getByRole('button', { name: 'Bisherige Liste ersetzen' })
    if (await ersetzen.isVisible().catch(() => false)) await ersetzen.click()
    await page.getByRole('button', { name: /Weiter zu den Testeinstellungen/ }).click()
    await page.waitForSelector('text=Test einstellen', { timeout: 15000 })
    await page.screenshot({ path: join(out, `${name}-3-testeinstellungen.png`) })
    const erstellen = sichtbar(page.getByRole('button', { name: /Test erstellen|erstellen/ }))
    await erstellen.click()
    // Fertig, wenn der Editor mit Testseiten steht – oder die Auftragsleiste einen Fehler meldet
    const kopf = page.getByText('Vocabulary test', { exact: true }).filter({ visible: true }).first()
    const fertig = await Promise.race([
      kopf.waitFor({ timeout: 90000 }).then(
        () => 'fertig',
        () => 'zeit'
      ),
      page
        .getByText(/mit Fehler/)
        .filter({ visible: true })
        .first()
        .waitFor({ timeout: 90000 })
        .then(
          () => 'fehler',
          () => 'zeit'
        )
    ])
    if (fertig === 'fehler') {
      await page
        .locator('.auftrags-pille')
        .click()
        .catch(() => undefined)
      await page.waitForTimeout(500)
      const text = await page
        .locator('.auftrags-liste')
        .innerText()
        .catch(() => '')
      throw new Error(`Auftrag mit Fehler: ${text.replace(/\s+/g, ' ')}`)
    }
    await page.screenshot({ path: join(out, `${name}-4-test.png`) })
    pruefe(fertig === 'fertig' && (await kopf.isVisible()), `${name}: Vokabeltest erzeugt und im Editor`)
    await page.waitForTimeout(2500)
    const tests = await page.evaluate(() => window.api.tests.list())
    pruefe(tests.length > 0, `${name}: Test in der Bibliothek (${tests.length})`)
  } catch (e) {
    problems.push(`${name}: Abbruch – ${e.message.split('\n')[0]}`)
    await page.screenshot({ path: join(out, `${name}-fehler.png`) }).catch(() => undefined)
  } finally {
    for (const f of fehler) console.log(`   (${f})`)
    const echte = fehler.filter((f) => !/Attrappe: keine Antwort/.test(f))
    pruefe(echte.length === 0, `${name}: keine Fehler im Fenster (${echte.length})`)
    await browser.close()
  }
}

try {
  if (welche !== 'webkit') {
    // Chromium: das auf Windows vorhandene Edge
    await lauf('chromium', chromium, { channel: 'msedge' })
  }
  if (welche !== 'chromium') {
    try {
      await lauf('webkit', webkit, {})
    } catch (e) {
      console.log(`WebKit nicht verfügbar: ${e.message.split('\n')[0]} (npx playwright-core install webkit)`)
    }
  }
} finally {
  server.close()
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
