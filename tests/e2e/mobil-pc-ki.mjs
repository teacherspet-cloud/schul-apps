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
// Wiederanknüpfen (30.09.2026) – zwischen iPad und PC steht ein Vermittler, dessen Leitung sich kappen lässt:
//  6. Verbindung während eines Elternbriefs gekappt: Die Leiste meldet es, der PC rechnet weiter, nach der
//     Rückkehr steht der Brief im Dokument – ohne zweite Anfrage an den PC
//  7. App im „Hintergrund" (Seite verborgen, Netz weg): zurück im Vordergrund kommt das Ergebnis sofort
//  8. App neu geladen, während ein Brief entsteht: Der Auftrag wird fortgesetzt, übernimmt den Auftrag am
//     PC und legt im selben Dokument ab
//  9. Tailscale: eine 100.x-Adresse wird durch den gemerkten Namen auf „.ts.net" ersetzt
import { _electron as electron, chromium } from 'playwright-core'
import { createServer } from 'http'
import { createServer as tcpServer, connect as tcpVerbinden } from 'net'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { extname, join, resolve } from 'path'
import { kartenAuf, leisteAuf, warteAufOberflaeche } from './warten.mjs'

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

// ---------- Vermittler zwischen iPad und PC (wie WLAN bzw. Tailscale): kappen = jede Leitung reißt ab, neue werden abgewiesen
const leitungen = new Set()
let leitungOffen = true
const vermittler = tcpServer((ein) => {
  if (!leitungOffen) return void ein.destroy()
  const aus = tcpVerbinden(lan.port, '127.0.0.1')
  leitungen.add(ein)
  leitungen.add(aus)
  const weg = () => {
    ein.destroy()
    aus.destroy()
    leitungen.delete(ein)
    leitungen.delete(aus)
  }
  ein.on('error', weg).on('close', weg)
  aus.on('error', weg).on('close', weg)
  ein.pipe(aus)
  aus.pipe(ein)
})
await new Promise((ok) => vermittler.listen(0, '127.0.0.1', ok))
const vermittlerPort = vermittler.address().port
const kappen = () => {
  leitungOffen = false
  for (const l of leitungen) l.destroy()
}
const oeffnen = () => void (leitungOffen = true)
const protokoll = join(userData, 'ki-protokoll.jsonl')
const briefAnfragen = () =>
  existsSync(protokoll)
    ? readFileSync(protokoll, 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((z) => JSON.parse(z))
        .filter((z) => z.schemaName === 'elternbrief_text')
    : []
const brief = (betreff) => ({
  betreff,
  anrede: 'Liebe Eltern der Klasse 7b,',
  absaetze: ['am 12. Oktober wandern wir in den Wildpark.', 'Bitte geben Sie Ihrem Kind 5 € mit.'],
  gruss: 'Mit freundlichen Grüßen',
  ruecklaufTitel: 'Rückmeldung',
  ruecklaufZeilen: ['Unterschrift: ______']
})

const browser = await chromium.launch({ channel: 'msedge' })
const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage()
const fehler = []
page.on('pageerror', (e) => fehler.push(`Fehler im Fenster: ${e.message}`))
// Zur Fehlersuche: E2E_LOG=1 zeigt die Konsole der Seite
if (process.env.E2E_LOG) page.on('console', (m) => console.log(`   [seite] ${m.text().slice(0, 300)}`))
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
  await kartenAuf(page, 'ki-text')
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

  // ---------- 6. Verbindung während eines Auftrags gekappt
  writeFileSync(
    attrappeDatei,
    JSON.stringify({ verzoegerungMs: 4000, protokoll, antworten: { probe: { ok: true, von: 'pc' }, lang: { ok: true }, elternbrief_text: brief('Wandertag am 12. Oktober') } })
  )
  // Ab jetzt über den Vermittler
  await page.evaluate((p) => window.api.settings.set({ pcKi: { adresse: `127.0.0.1:${p}` } }), vermittlerPort)
  const sichtbar = (l) => l.filter({ visible: true }).first()
  // Elternbriefe über die Leiste (Strg+7 ist seit der Leisten-Ordnung Tafelbilder); erstes Öffnen in der Sitzung zeigt
  // die Übersicht (09.10.2026, shared/sitzung.ts) – von dort ein neuer Brief
  await leisteAuf(page)
  await sichtbar(page.locator('[aria-label="Elternbriefe"]')).click()
  const neuerBrief = sichtbar(page.getByRole('button', { name: 'Neuer Elternbrief' }))
  if (await neuerBrief.waitFor({ timeout: 8000 }).then(() => true, () => false)) await neuerBrief.click()
  await sichtbar(page.locator('[data-eb-stichpunkte]')).waitFor({ timeout: 15000 })
  await sichtbar(page.locator('[data-eb-stichpunkte]')).fill('Wandertag am 12.10., Treffpunkt 8:00 Schulhof, Wildpark, 5 €')
  await page.waitForTimeout(600)
  await sichtbar(page.locator('[data-eb-schreiben]')).click()
  // Der Auftrag ist am PC angekommen – dann reißt die Leitung
  const bisAnfragen = async (n, ms = 10000) => {
    const ende = Date.now() + ms
    while (briefAnfragen().length < n && Date.now() < ende) await page.waitForTimeout(100)
    return briefAnfragen().length
  }
  await bisAnfragen(1)
  // Die Auftragsleiste ausklappen – dort steht der Hinweis
  const pille = page.locator('.auftrags-pille').first()
  if (await pille.isVisible().catch(() => false)) await pille.click()
  await page.waitForTimeout(400)
  kappen()
  const hinweis = await page
    .locator('[data-verbindung="unterbrochen"]')
    .first()
    .waitFor({ timeout: 15000 })
    .then(
      () => true,
      () => false
    )
  await page.screenshot({ path: join(out, 'pcki-6-unterbrochen.png') })
  pruefe(hinweis, 'Die Auftragsleiste meldet: Verbindung unterbrochen – Auftrag läuft am PC weiter')
  // Der PC rechnet währenddessen fertig; dann ist das Netz wieder da
  await page.waitForTimeout(4500)
  oeffnen()
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  const briefDa = await page
    .getByText('Wandertag am 12. Oktober', { exact: true })
    .first()
    .waitFor({ timeout: 20000 })
    .then(
      () => true,
      () => false
    )
  await page.screenshot({ path: join(out, 'pcki-6-wieder-da.png') })
  pruefe(briefDa, 'Nach der Rückkehr der Verbindung steht der Brief im Dokument')
  pruefe(briefAnfragen().length === 1, `Der PC hat den Brief nur einmal geschrieben (${briefAnfragen().length} Anfrage/n)`)

  // ---------- 7. App im Hintergrund: Seite verborgen, Netz weg – zurück im Vordergrund kommt das Ergebnis
  const hintergrund = page.evaluate(() =>
    window.api.ai.structured({ system: 'x', user: 'hintergrund', schemaName: 'lang', schema: {}, progressId: 'e2e-hintergrund' }).then(
      (w) => ({ ok: true, w }),
      (e) => ({ ok: false, e: String(e) })
    )
  )
  await page.waitForTimeout(800)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  kappen()
  await page.waitForTimeout(5000)
  oeffnen()
  const zurueck = Date.now()
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const ausDemHintergrund = await hintergrund
  pruefe(
    ausDemHintergrund.ok && ausDemHintergrund.w?.ok === true,
    `Nach der Rückkehr in den Vordergrund kommt das Ergebnis (${Date.now() - zurueck} ms, ${JSON.stringify(ausDemHintergrund).slice(0, 80)})`
  )

  // ---------- 8. App neu geladen, während ein Brief entsteht
  writeFileSync(
    attrappeDatei,
    JSON.stringify({ verzoegerungMs: 5000, protokoll, antworten: { probe: { ok: true, von: 'pc' }, lang: { ok: true }, elternbrief_text: brief('Wandertag – neu geschrieben') } })
  )
  // Erledigtes aus der Leiste räumen (sie läge über dem Knopf), zurück zum ersten Schritt, andere Stichpunkte
  const raeumen = page.getByRole('button', { name: 'Erledigte entfernen' }).first()
  if (await raeumen.isVisible().catch(() => false)) await raeumen.click()
  await sichtbar(page.locator('.mantine-Stepper-step')).click()
  await sichtbar(page.locator('[data-eb-stichpunkte]')).waitFor({ timeout: 10000 })
  await sichtbar(page.locator('[data-eb-stichpunkte]')).fill('Wandertag am 12.10., Treffpunkt 8:30 Bushaltestelle, Wildpark, 5 €')
  await page.waitForTimeout(600)
  await sichtbar(page.locator('[data-eb-schreiben]')).click()
  await bisAnfragen(2)
  const gemerkt = await page.evaluate(() => JSON.parse(localStorage.getItem('schul-apps-auftraege-unterbrochen') ?? '[]'))
  const docId = gemerkt.find((a) => a.moduleId === 'elternbrief')?.docId
  pruefe(Boolean(docId) && gemerkt.some((a) => a.fortsetzen?.art === 'elternbrief.schreiben'), `Der laufende Auftrag ist gemerkt (${docId})`)
  const pcAuftraege = await page.evaluate(() => JSON.parse(localStorage.getItem('schulapps.pcKi.auftraege') ?? '[]'))
  pruefe(pcAuftraege.length >= 1, `Die ID des Auftrags am PC ist gemerkt (${pcAuftraege.length})`)
  // Wie auf dem iPad: erst in den Hintergrund (die App sichert), dann beendet iOS sie
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(1500)
  await page.reload()
  await page.waitForSelector('text=Schul-Apps', { timeout: 30000 })
  const ende = Date.now() + 30000
  let abgelegt = ''
  while (Date.now() < ende) {
    abgelegt = await page
      .evaluate(async (id) => {
        const d = await window.api.elternbriefe.get(id).catch(() => null)
        return d?.payload?.text?.betreff ?? ''
      }, docId)
      .catch(() => '')
    if (abgelegt === 'Wandertag – neu geschrieben') break
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: join(out, 'pcki-8-nach-neustart.png') })
  pruefe(abgelegt === 'Wandertag – neu geschrieben', `Nach dem Neuladen liegt der neue Brief im selben Dokument (${abgelegt || 'nichts'})`)
  pruefe(briefAnfragen().length === 2, `Der fortgesetzte Auftrag hat am PC keinen zweiten Brief bestellt (${briefAnfragen().length} Anfragen insgesamt)`)

  // ---------- 9. Tailscale: 100.x wird durch den gemerkten Namen ersetzt
  await page.evaluate(() => window.api.settings.set({ pcKi: { tailscaleAdresse: 'http://home-pc.tailae2351.ts.net:8420' } }))
  await page.getByRole('button', { name: /Einstellungen/ }).filter({ visible: true }).first().click()
  await page.getByRole('tab', { name: 'KI-Zugang' }).click()
  await kartenAuf(page, 'ki-text')
  const feld = page.getByLabel('Adresse des PCs').first()
  await feld.fill('100.101.181.79:8420')
  const warnung = await page.getByText(/Tailscale-IP-Adressen \(100\.x\) lässt iOS nicht zu/).first().isVisible().catch(() => false)
  await feld.blur()
  await page.waitForTimeout(500)
  const ersetzt = await page.evaluate(async () => (await window.api.settings.get()).pcKi?.adresse)
  await page.screenshot({ path: join(out, 'pcki-9-tailscale.png') })
  pruefe(warnung, 'Eine 100.x-Adresse wird als für iOS ungeeignet markiert')
  pruefe(ersetzt === 'http://home-pc.tailae2351.ts.net:8420', `…und durch den Namen auf „.ts.net" ersetzt (${ersetzt})`)
  await page.keyboard.press('Escape')

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
  kappen()
  vermittler.close()
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
