// „Abo über den PC" von Anfang bis Ende (30.09.2026): die iPad-App reicht KI-Aufrufe an die App am PC weiter.
//
// Vorher: npm run build  UND  SCHULAPPS_MOBIL_TEST=1 npm run build:mobil
// Aufruf: node tests/e2e/mobil-pc-ki.mjs <Ausgabeordner>
//
// Aufbau wie in echt, nur auf einem Rechner:
//  - die App am PC (Electron) mit KI-Attrappe (nie echte KI) und eingeschaltetem Netzzugang
//  - die iPad-App (out/mobil) in Edge, von einer ANDEREN Herkunft ausgeliefert – wie
//    capacitor://localhost auf dem iPad; damit ist auch CORS mitgeprüft
// Geprüft wird:
//  1. „Verbindung testen" meldet Fassung und KI-Zugang des PCs (Oberfläche und Schnittstelle)
//  2. ohne eigenen Schlüssel gilt die KI auf dem iPad als eingerichtet
//  3. eine Textanfrage läuft am PC (Attrappe antwortet), Fortschritt kommt auf dem iPad an
//  4. ein Abbruch auf dem iPad beendet den Auftrag
//  5. ein nicht erreichbarer PC ergibt eine verständliche Meldung
import { _electron as electron, chromium } from 'playwright-core'
import { createServer } from 'http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { extname, join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/mobil-pc-ki')
mkdirSync(out, { recursive: true })
const wurzel = resolve('out/mobil')
if (!existsSync(join(wurzel, 'index.html'))) throw new Error('out/mobil fehlt – vorher: SCHULAPPS_MOBIL_TEST=1 npm run build:mobil')

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

// ---------- Die App am PC mit KI-Attrappe
const userData = mkdtempSync(join(tmpdir(), 'schulapps-pcki-'))
const attrappeDatei = join(userData, 'attrappe.json')
writeFileSync(attrappeDatei, JSON.stringify({ verzoegerungMs: 1500, antworten: { probe: { ok: true, von: 'pc' }, lang: { ok: true } } }))
const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappeDatei }
})
const pc = await app.firstWindow()
await warteAufOberflaeche(pc)
const lan = await pc.evaluate(() => window.api.lan.start())
const pin = await pc.evaluate(async () => (await window.api.settings.get()).lan?.pin ?? '')
console.log(`Netzzugang am PC: ${lan.adresse} (Port ${lan.port}) · PIN ${pin}`)

// ---------- Die iPad-App von einer anderen Herkunft
const TYPEN = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp' }
const server = createServer((req, res) => {
  const pfad = decodeURIComponent((req.url ?? '/').split('?')[0])
  let datei = join(wurzel, pfad === '/' ? 'index.html' : pfad)
  if (!datei.startsWith(wurzel) || !existsSync(datei) || statSync(datei).isDirectory()) datei = join(wurzel, 'index.html')
  res.setHeader('content-type', TYPEN[extname(datei)] ?? 'application/octet-stream')
  res.end(readFileSync(datei))
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const ipadAdresse = `http://127.0.0.1:${server.address().port}/`

const browser = await chromium.launch({ channel: 'msedge' })
const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage()
const fehler = []
page.on('pageerror', (e) => fehler.push(`Fehler im Fenster: ${e.message}`))
try {
  await page.goto(ipadAdresse)
  await page.waitForSelector('text=Schul-Apps', { timeout: 30000 })
  const spaeter = page.getByRole('button', { name: 'Später einrichten' })
  await spaeter.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined)
  if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
  const vorher = await page.evaluate(() => window.api.ai.status())
  pruefe(vorher.hasTextKey === false, 'iPad ohne eigenen Zugang: KI nicht eingerichtet')

  // ---------- 1. In der Oberfläche: KI-Zugang › Abo über den PC › Verbindung testen
  await page.evaluate(() => window.api.settings.set({ schoolName: 'PC-KI-Probe' }))
  await page.getByRole('button', { name: /Einstellungen/ }).filter({ visible: true }).first().click()
  await page.getByRole('tab', { name: 'KI-Zugang' }).click()
  await page.getByText('Abo über den PC (WLAN)').first().click()
  await page.getByLabel('Adresse des PCs').first().fill(`127.0.0.1:${lan.port}`)
  await page.getByLabel('PIN').first().fill(pin)
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Verbindung testen' }).first().click()
  const steht = await page
    .getByText('Verbindung zum PC steht')
    .first()
    .waitFor({ timeout: 15000 })
    .then(
      () => true,
      () => false
    )
  await page.screenshot({ path: join(out, 'pcki-1-verbindung.png') })
  pruefe(steht, '„Verbindung testen" meldet: Verbindung zum PC steht')
  const test = await page.evaluate((p) => window.api.pcKi.testen(p.a, p.pin), { a: `127.0.0.1:${lan.port}`, pin })
  pruefe(/^\d+\.\d+/.test(test.fassung) && test.status.hasTextKey === true, `Schnittstelle: Fassung ${test.fassung}, KI am PC eingerichtet`)
  const gespeichert = await page.evaluate(async () => (await window.api.settings.get()).pcKi)
  pruefe(gespeichert?.texte === true && gespeichert?.pin === pin, 'Wahl, Adresse und PIN sind gespeichert')

  // ---------- 2. Stand der KI auf dem iPad
  const nachher = await page.evaluate(() => window.api.ai.status())
  pruefe(nachher.hasTextKey === true, 'Mit „Abo über den PC" gilt die KI auf dem iPad als eingerichtet')

  // ---------- 3. Eine Anfrage am PC, Fortschritt auf dem iPad
  const lauf = await page.evaluate(async () => {
    const fortschritt = []
    const ab = window.api.ai.onProgress((p) => fortschritt.push(p))
    const anfang = Date.now()
    const wert = await window.api.ai.structured({ system: 'x', user: 'y', schemaName: 'probe', schema: {}, progressId: 'e2e-probe' })
    ab()
    return { wert, fortschritt, dauer: Date.now() - anfang }
  })
  pruefe(lauf.wert?.von === 'pc', `Die Antwort kommt vom PC (${JSON.stringify(lauf.wert)}, ${lauf.dauer} ms)`)
  pruefe(
    lauf.fortschritt.some((p) => p.id === 'e2e-probe'),
    `Fortschritt kommt mit der eigenen Kennung an (${lauf.fortschritt.length} Meldungen)`
  )

  // ---------- 4. Abbrechen
  const abbruch = await page.evaluate(async () => {
    const laeuft = window.api.ai.structured({ system: 'x', user: 'y', schemaName: 'lang', schema: {}, progressId: 'e2e-lang' }).then(
      () => 'fertig',
      (e) => String(e)
    )
    await new Promise((r) => setTimeout(r, 400))
    await window.api.ai.cancel('e2e-lang')
    return laeuft
  })
  pruefe(/abgebrochen/i.test(abbruch), `Abbruch auf dem iPad beendet den Auftrag (${abbruch.slice(0, 60)})`)

  // ---------- 5. PC nicht erreichbar
  await page.evaluate(() => window.api.settings.set({ pcKi: { adresse: '127.0.0.1:1' } }))
  const weg = await page.evaluate(() =>
    window.api.ai.structured({ system: 'x', user: 'y', schemaName: 'probe', schema: {} }).then(
      () => 'kam durch',
      (e) => String(e)
    )
  )
  pruefe(/PC nicht erreichbar/.test(weg) && /Netzzugang/.test(weg), `Verständliche Meldung, wenn der PC fehlt: ${weg.slice(0, 90)}`)
} catch (e) {
  problems.push(`Abbruch – ${e.message.split('\n')[0]}`)
  await page.screenshot({ path: join(out, 'pcki-fehler.png') }).catch(() => undefined)
} finally {
  for (const f of fehler) console.log(`   (${f})`)
  pruefe(fehler.length === 0, `keine Fehler im Fenster (${fehler.length})`)
  await browser.close()
  server.close()
  await pc.evaluate(() => window.api.lan.stop()).catch(() => undefined)
  await app.close()
  rmSync(userData, { recursive: true, force: true })
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\n„Abo über den PC" funktioniert von Anfang bis Ende.')
