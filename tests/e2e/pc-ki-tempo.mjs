// Tempo von „Abo über den PC" messen (30.09.2026): dieselben KI-Anfragen am PC direkt und von der iPad-App über den PC.
//
// Vorher: npm run build  UND  SCHULAPPS_MOBIL_TEST=1 npm run build:mobil
// Aufruf: node tests/e2e/pc-ki-tempo.mjs [Verzögerung je Richtung in ms, Vorgabe 40]
//
// Anlass: Die Lehrkraft meldete, ein Vokabeltest dauere auf dem iPad über den PC deutlich länger
// als am PC selbst – im schnellen WLAN zu Hause, über Tailscale. Gemessen wird mit der KI-Attrappe
// (feste Rechenzeit je Anfrage), damit nur der Weg zählt, nicht die KI:
//  - eine Anfrage allein, sechs zugleich (wie ein Vokabeltest mit mehreren Aufgaben), eine mit Bild
//  - einmal direkt zum PC (Rückschleife), einmal über einen Zwischenhalt, der jede Richtung um
//    die angegebene Zeit verzögert – so ungefähr wie Tailscale über ein Relais
// Ausgabe: Zeiten je Fall und der Aufschlag gegenüber dem PC.
import { _electron as electron, chromium } from 'playwright-core'
import { createServer } from 'http'
import { createServer as tcpServer, connect } from 'net'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { extname, join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const VERZOEGERUNG = Number(process.argv[2] ?? 40)
const RECHENZEIT = 2000
const wurzel = resolve('out/mobil')
if (!existsSync(join(wurzel, 'index.html'))) throw new Error('out/mobil fehlt – vorher: SCHULAPPS_MOBIL_TEST=1 npm run build:mobil')

const userData = mkdtempSync(join(tmpdir(), 'schulapps-tempo-'))
const attrappeDatei = join(userData, 'attrappe.json')
const protokoll = join(userData, 'protokoll.jsonl')
const AUFGABEN =
  'gapSentences gapText dialogue matchDefinitions writeDefinitions pictureLabel multipleChoice synonymsAntonyms collocations wordFormation wordFamily mindmap oddOneOut categorize writeSentences mediation crossword scrambled wrongWord twoSentences trueFalse freeText'
writeFileSync(
  attrappeDatei,
  JSON.stringify({
    verzoegerungMs: RECHENZEIT,
    protokoll,
    antworten: {
      probe: { ok: true, text: 'x'.repeat(20000) },
      // Vokabeltest wie in tests/e2e/mobil.mjs
      vocabulary_test: {},
      review: { problems: [] },
      vocab_analysis: { entries: [] },
      testplan: { tasks: [] },
      ...Object.fromEntries(AUFGABEN.split(' ').map((t) => [t, { instruction: 'Tempo', items: [] }]))
    }
  })
)
const anfragenSeit = (n) => (existsSync(protokoll) ? readFileSync(protokoll, 'utf8').split(String.fromCharCode(10)).map((z) => z.trim()).filter(Boolean).slice(n) : [])
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappeDatei } })
const pc = await app.firstWindow()
await warteAufOberflaeche(pc)
const lan = await pc.evaluate(() => window.api.lan.start())
// Wie bei der Lehrkraft: Abo am PC, also Sparmodus (alle Aufgaben einer Fassung in einer Anfrage)
await pc.evaluate(() => window.api.settings.set({ ai: { economy: 'on' } }))
const pin = await pc.evaluate(async () => (await window.api.settings.get()).lan?.pin ?? '')

// Zwischenhalt mit fester Verzögerung je Richtung (Reihenfolge der Stücke bleibt erhalten)
const halt = tcpServer((ein) => {
  const aus = connect(lan.port, '127.0.0.1')
  const weiter = (von, nach) => {
    let kette = Promise.resolve()
    von.on('data', (stueck) => {
      const faellig = Date.now() + VERZOEGERUNG
      kette = kette.then(() => new Promise((r) => setTimeout(r, Math.max(0, faellig - Date.now())))).then(() => void nach.write(stueck))
    })
    von.on('end', () => void kette.then(() => nach.end()))
    von.on('error', () => nach.destroy())
  }
  weiter(ein, aus)
  weiter(aus, ein)
})
await new Promise((ok) => halt.listen(0, '127.0.0.1', ok))
const haltPort = halt.address().port

const TYPEN = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  const pfad = decodeURIComponent((req.url ?? '/').split('?')[0])
  let datei = join(wurzel, pfad === '/' ? 'index.html' : pfad)
  if (!datei.startsWith(wurzel) || !existsSync(datei) || statSync(datei).isDirectory()) datei = join(wurzel, 'index.html')
  res.setHeader('content-type', TYPEN[extname(datei)] ?? 'application/octet-stream')
  res.end(readFileSync(datei))
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))

// Ein Bild wie beim Einlesen einer fotografierten Vokabelliste (~600 KB als data:-URL)
const BILD = `data:image/jpeg;base64,${Buffer.alloc(450_000, 7).toString('base64')}`

/** Die Messreihe im jeweiligen Fenster: window.api ist am PC und auf dem iPad dieselbe Schnittstelle */
async function reihe(seite) {
  return seite.evaluate(async (bild) => {
    const zeit = async (fn) => {
      const a = performance.now()
      await fn()
      return Math.round(performance.now() - a)
    }
    const eine = (n, mitBild) =>
      window.api.ai.structured({ system: 'x', user: 'y', schemaName: 'probe', schema: {}, progressId: `tempo-${n}-${Math.random()}`, ...(mitBild ? { images: [bild] } : {}) })
    const ergebnis = {}
    // Aufwärmen (Anmeldung, erste Verbindung) zählt extra
    ergebnis.erste = await zeit(() => eine(0))
    ergebnis.einzeln = await zeit(() => eine(1))
    ergebnis.status = await zeit(() => window.api.ai.status())
    ergebnis.sechsZugleich = await zeit(() => Promise.all([1, 2, 3, 4, 5, 6].map((n) => eine(n))))
    ergebnis.mitBild = await zeit(() => eine(7, true))
    return ergebnis
  }, BILD)
}

/** Ein Vokabeltest über die Oberfläche (wie tests/e2e/mobil.mjs): Dauer und Zahl der KI-Anfragen */
async function vokabeltest(page) {
  try {
    return await vokabeltestLauf(page)
  } catch (e) {
    await page.screenshot({ path: join(process.env.TEMPO_BILDER ?? tmpdir(), "tempo-fehler.png") }).catch(() => undefined)
    throw e
  }
}

async function vokabeltestLauf(page) {
  const sichtbar = (loc) => loc.filter({ visible: true }).first()
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
  await ersetzen.click({ timeout: 15000 })
  await page.getByRole('button', { name: /Weiter zu den Testeinstellungen/ }).click()
  await page.waitForSelector('text=Test einstellen', { timeout: 15000 })
  await page.waitForTimeout(3000)
  const vorher = anfragenSeit(0).length
  const a = Date.now()
  await sichtbar(page.getByRole('button', { name: /Test erstellen|erstellen/ })).click()
  const fertig = await Promise.race([
    page.getByText('Vocabulary test', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 180000 }).then(() => 'fertig', () => 'zeit'),
    page.getByText(/mit Fehler/).filter({ visible: true }).first().waitFor({ timeout: 180000 }).then(() => 'fehler', () => 'zeit')
  ])
  if (fertig !== 'fertig') {
    await page.screenshot({ path: join(process.env.TEMPO_BILDER ?? tmpdir(), 'tempo-fehler.png') })
    throw new Error(`Vokabeltest: ${fertig} – Anfragen: ${anfragenSeit(vorher).map((z) => JSON.parse(z).schemaName).join(',')}`)
  }
  const neu = anfragenSeit(vorher).map((z) => JSON.parse(z).schemaName)
  return { vokabeltest: Date.now() - a, anfragen: neu.length, arten: [...new Set(neu)].join(',') }
}

const browser = await chromium.launch({ channel: 'msedge' })
const ergebnisse = { pc: { ...(await reihe(pc)), ...(await vokabeltest(pc)) } }
try {
  for (const [name, port] of [
    ['iPad direkt', lan.port],
    [`iPad +${VERZOEGERUNG} ms`, haltPort]
  ]) {
    const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.waitForSelector('text=Schul-Apps', { timeout: 30000 })
    await page.evaluate((p) => window.api.settings.set({ pcKi: { adresse: `127.0.0.1:${p.port}`, pin: p.pin, texte: true, bilder: true, hoertexte: true } }), { port, pin })
    const spaeter = page.getByRole('button', { name: 'Später einrichten' })
    await spaeter.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined)
    if (await spaeter.isVisible().catch(() => false)) await spaeter.click()
    ergebnisse[name] = { ...(await reihe(page)), ...(await vokabeltest(page)) }
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
  halt.close()
  await pc.evaluate(() => window.api.lan.stop()).catch(() => undefined)
  await app.close()
  rmSync(userData, { recursive: true, force: true })
}

console.log(`Rechenzeit der Attrappe je Anfrage: ${RECHENZEIT} ms, höchstens drei zugleich am PC\n`)
const faelle = Object.keys(ergebnisse.pc)
console.log(['Fall'.padEnd(16), ...Object.keys(ergebnisse).map((k) => k.padStart(16))].join(''))
for (const f of faelle) {
  console.log([f.padEnd(16), ...Object.values(ergebnisse).map((e) => `${e[f]}${typeof e[f] === 'number' && f !== 'anfragen' ? ' ms' : ''}`.padStart(16))].join(''))
}
