// IServ per WebDAV in der iPad-App – im Browser gegen einen nachgebauten IServ (01.10.2026).
//
// Vorher: SCHULAPPS_MOBIL_TEST=1 npm run build:mobil  (Prüf-Build: biegt https://webdav.<domain>
//         auf den Fake-Server um, siehe src/mobil/netz/davAbruf.ts)
// Aufruf: node tests/e2e/mobil-iserv.mjs <Ausgabeordner> [chromium|webkit|beide]
//
// Geprüft wird:
//  1. Einstellungen › Material › IServ: falsches Passwort → „Anmeldung fehlgeschlagen",
//     richtiges → „verbunden"; das Passwort liegt im eigenen Schlüsselbund-Eintrag
//     (Web-Ersatz: localStorage „schulapps.secrets.iserv"), NICHT in den Einstellungen.
//  2. Ordner wählen: Eigene Dateien › Unterricht › (Schulmaterial) – das Ziel steht danach da.
//  3. Speichern mit Ablageziel fragt nach dem Ort; „IServ" legt die Datei unter
//     Ziel/Fach/Themenbereich ab (Ordner per MKCOL angelegt, Bytes unverändert, kein Überschreiben).
//  4. Abbrechen speichert nichts; „Auf dem iPad" wie bisher unter /documents/Schulmaterial;
//     „Auswahl merken" fragt beim nächsten Mal nicht mehr.
//  5. Trennen löscht das Passwort aus dem Schlüsselbund.
import { chromium, webkit } from 'playwright-core'
import { createServer } from 'http'
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { extname, join, resolve } from 'path'
import { fakeWebdav } from '../support/fakeWebdav.mjs'

const out = resolve(process.argv[2] ?? 'test-results/mobil-iserv')
const welche = process.argv[3] ?? 'chromium'
mkdirSync(out, { recursive: true })
const wurzel = resolve(process.env.SCHULAPPS_MOBIL_OUT ?? 'out/mobil')
if (!existsSync(join(wurzel, 'index.html'))) throw new Error('out/mobil fehlt – vorher: SCHULAPPS_MOBIL_TEST=1 npm run build:mobil')

const TYPEN = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp' }
const server = createServer((req, res) => {
  const pfad = decodeURIComponent((req.url ?? '/').split('?')[0])
  let datei = join(wurzel, pfad === '/' ? 'index.html' : pfad)
  if (!datei.startsWith(wurzel) || !existsSync(datei) || statSync(datei).isDirectory()) datei = join(wurzel, 'index.html')
  res.setHeader('content-type', TYPEN[extname(datei)] ?? 'application/octet-stream')
  res.end(readFileSync(datei))
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const adresse = `http://127.0.0.1:${server.address().port}/`

const problems = []
const pruefe = (ok, text) => {
  console.log(`${ok ? '✓' : '✗'} ${text}`)
  if (!ok) problems.push(text)
}

async function lauf(name, typ, optionen) {
  const fake = fakeWebdav()
  const davAdresse = await fake.starten()
  const browser = await typ.launch(optionen)
  const kontext = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true })
  await kontext.addInitScript((a) => localStorage.setItem('schulapps-iserv-test', a), davAdresse)
  const page = await kontext.newPage()
  const fehler = []
  page.on('pageerror', (e) => fehler.push(`Fehler im Fenster: ${e.message}`))
  page.on('console', (m) => {
    // 401 des Fake-Servers erscheint als Ladefehler – gewollt
    if (m.type() === 'error' && !/favicon|Failed to load resource|401|Unauthorized/i.test(m.text())) fehler.push(`Konsole: ${m.text()}`)
  })
  const sichtbar = (loc) => loc.filter({ visible: true }).first()
  try {
    await page.goto(adresse)
    await page.waitForSelector('text=Schul-Apps', { timeout: 30000 })
    await page.evaluate(() => window.api.settings.set({ schoolName: 'IServ-Probe' }))
    const spaeter = page.getByRole('button', { name: 'Später einrichten' })
    await spaeter.waitFor({ state: 'visible', timeout: 4000 }).catch(() => undefined)
    if (await spaeter.isVisible().catch(() => false)) await spaeter.click()

    // ---------- 1. Verbinden
    await sichtbar(page.getByRole('button', { name: /Einstellungen/ })).click()
    await page.getByRole('tab', { name: 'Material' }).click()
    const karte = page.locator('[data-iserv-karte]')
    await karte.waitFor({ timeout: 10000 })
    pruefe(await karte.isVisible(), `${name}: Karte „IServ" in Einstellungen › Material`)
    await karte.locator('[data-iserv-schule]').fill('meineschule.de')
    await karte.locator('[data-iserv-benutzer]').fill(fake.benutzer)
    await karte.locator('[data-iserv-passwort]').fill('falsch')
    await karte.locator('[data-iserv-testen]').click()
    const fehlerText = await karte
      .locator('[data-iserv-fehler]')
      .innerText({ timeout: 10000 })
      .catch(() => '')
    pruefe(/Anmeldung fehlgeschlagen/.test(fehlerText), `${name}: falsches Passwort → „Anmeldung fehlgeschlagen" (${fehlerText.slice(0, 60)})`)
    pruefe((await page.evaluate(() => localStorage.getItem('schulapps.secrets.iserv'))) === null, `${name}: falsches Passwort wird nicht gespeichert`)
    await karte.locator('[data-iserv-passwort]').fill(fake.passwort)
    await karte.locator('[data-iserv-testen]').click()
    const verbunden = await karte
      .locator('[data-iserv-verbunden]')
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false
      )
    pruefe(verbunden, `${name}: verbunden`)
    const imBund = await page.evaluate(() => localStorage.getItem('schulapps.secrets.iserv'))
    pruefe(imBund === fake.passwort, `${name}: Passwort im eigenen Schlüsselbund-Eintrag`)
    const einst = await page.evaluate(() => window.api.settings.get())
    pruefe(einst.iserv?.basis === 'https://webdav.meineschule.de/' && !JSON.stringify(einst).includes(fake.passwort), `${name}: Einstellungen ohne Passwort, Basis gefunden`)
    const geheimnisse = await page.evaluate(() => localStorage.getItem('schulapps.secrets') ?? '')
    pruefe(!geheimnisse.includes(fake.passwort), `${name}: Passwort nicht im Eintrag der API-Schlüssel`)
    await page.screenshot({ path: join(out, `${name}-1-verbunden.png`) })

    // ---------- 2. Ordner wählen
    await karte.locator('[data-iserv-ordner-waehlen]').click()
    await karte.locator('[data-iserv-eintrag="Unterricht"]').click({ timeout: 10000 })
    await karte.locator('[data-iserv-hier]').click({ timeout: 10000 })
    await page.waitForTimeout(500)
    const zielText = await karte.locator('[data-iserv-ziel]').innerText()
    pruefe(/IServ › Eigene Dateien › Unterricht › Schulmaterial/.test(zielText), `${name}: Ziel gewählt (${zielText})`)
    await page.screenshot({ path: join(out, `${name}-2-ordner.png`) })

    // ---------- 3. Speichern auf IServ
    const pdf = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0xff, 0x80]
    const ziel = { programm: 'vokabeltest', fach: 'Englisch', themenbereich: ['Unit 1'] }
    const speichern = () => page.evaluate(([b, z]) => window.api.files.save('Vokabeltest.pdf', [], new Uint8Array(b), z), [pdf, ziel])
    let laeuft = speichern()
    const dialog = page.locator('[data-ausgabe-ort]')
    await page.locator('button[data-ort="iserv"]').waitFor({ timeout: 10000 })
    pruefe((await page.locator('button[data-ort]').count()) === 4, `${name}: Dialog bietet vier Orte (iPad, IServ, Dateien-App, Teilen)`)
    await page.screenshot({ path: join(out, `${name}-3-ortwahl.png`) })
    await page.locator('button[data-ort="iserv"]').click()
    const p1 = await laeuft
    pruefe(p1 === 'iserv:Home/Unterricht/Schulmaterial/Englisch/Unit 1/Vokabeltest.pdf', `${name}: auf IServ gespeichert (${p1})`)
    const datei = fake.baum.get('/Home/Unterricht/Schulmaterial/Englisch/Unit 1/Vokabeltest.pdf')
    pruefe(Boolean(datei) && JSON.stringify([...datei.daten]) === JSON.stringify(pdf), `${name}: Bytes unverändert angekommen`)
    pruefe(datei?.typ === 'application/pdf', `${name}: Inhaltstyp PDF`)

    laeuft = speichern()
    await page.locator('button[data-ort="iserv"]').click({ timeout: 10000 })
    const p2 = await laeuft
    pruefe(p2 === 'iserv:Home/Unterricht/Schulmaterial/Englisch/Unit 1/Vokabeltest (2).pdf', `${name}: kein Überschreiben auf IServ (${p2})`)

    // ---------- 4. Abbrechen, aufs iPad, merken
    laeuft = speichern()
    await dialog.getByRole('button', { name: 'Abbrechen' }).click({ timeout: 10000 })
    pruefe((await laeuft) === null, `${name}: Abbrechen speichert nichts`)
    laeuft = speichern()
    await page.locator('button[data-ort="geraet"]').click({ timeout: 10000 })
    const p3 = await laeuft
    pruefe(p3 === '/documents/Schulmaterial/Englisch/Unit 1/Vokabeltest.pdf', `${name}: „Auf dem iPad" wie bisher (${p3})`)
    laeuft = speichern()
    await page.locator('[data-ausgabe-ort] input[type="checkbox"]').check({ timeout: 10000 })
    await page.locator('button[data-ort="iserv"]').click()
    await laeuft
    await page.waitForTimeout(500)
    const p4 = await speichern()
    pruefe(p4 === 'iserv:Home/Unterricht/Schulmaterial/Englisch/Unit 1/Vokabeltest (4).pdf', `${name}: gemerkte Auswahl ohne Rückfrage (${p4})`)

    // ---------- 5. Trennen
    await sichtbar(karte.locator('[data-iserv-trennen]')).click()
    await page.waitForTimeout(800)
    pruefe((await page.evaluate(() => localStorage.getItem('schulapps.secrets.iserv'))) === null, `${name}: Trennen löscht das Passwort`)
    pruefe(!(await karte.locator('[data-iserv-verbunden]').count()), `${name}: danach „nicht verbunden"`)

    for (const f of fehler) console.log(`   (${f})`)
    pruefe(fehler.length === 0, `${name}: keine Fehler im Fenster (${fehler.length})`)
  } catch (e) {
    await page.screenshot({ path: join(out, `${name}-fehler.png`) }).catch(() => undefined)
    pruefe(false, `${name}: Ablauf abgebrochen – ${e.message.split('\n')[0]}`)
  } finally {
    await browser.close()
    await fake.beenden()
  }
}

try {
  if (welche !== 'webkit') await lauf('chromium', chromium, { channel: 'msedge' })
  if (welche !== 'chromium') {
    try {
      await lauf('webkit', webkit, {})
    } catch (e) {
      console.log(`WebKit nicht verfügbar: ${e.message.split('\n')[0]}`)
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
