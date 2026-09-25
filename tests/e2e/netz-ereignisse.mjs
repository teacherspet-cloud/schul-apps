// Wache für Fortschritt, Warteplatz und Abbruch IM BROWSER – mit KI-ATTRAPPE, ohne echte KI.
// Aufruf: node tests/e2e/netz-ereignisse.mjs <Ausgabeordner> [Ordner für Bildschirmfotos]  (vorher: npm run build)
//
// Anlass (Paket 3b, Nachtrag der Lehrkraft): Am Tablet kam weder Fortschritt noch Warteplatz
// an – der Balken stand, ein wartender Auftrag sah aus wie ein hängender. Dazu: Die Bild-KI von
// OpenAI überhört den Abbruch; für die Lehrkraft muss der Auftrag trotzdem sofort abgebrochen
// sein, und wer deshalb warten muss, soll erfahren, warum.
//
// Die Attrappe (SCHULAPPS_KI_ATTRAPPE) antwortet nach 25 s und überhört – wie die Bild-KI von
// OpenAI – den Abbruch (`abbruchTaub`). Geprüft wird in einem Fenster OHNE Electron-Brücke,
// also genau so, wie ein Browser die Oberfläche sieht:
//  1. Fortschritt einer Anfrage aus dem Browser erscheint in der Auftragsleiste des Browsers.
//  2. Gleichzeitig arbeitet der Rechner: Keines der beiden sieht die Ereignisse des anderen.
//  3. Abbrechen im Browser wirkt sofort, ohne Fehlerhinweis – obwohl die Anfrage weiterläuft.
//  4. Ein Auftrag, der deshalb warten muss, nennt den Grund.
//  5. Er wird danach fertig; das abgebrochene Blatt bekommt nichts ab.
//  6. „Drucken" mit Lösungen öffnet im Browser genau EINEN Tab.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/netz-ereignisse')
const shots = resolve(process.argv[3] ?? out)
mkdirSync(out, { recursive: true })
mkdirSync(shots, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-netz-ereignisse-'))

const attrappe = join(userData, 'ki-attrappe.json')
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 25000,
    abbruchTaub: true,
    antworten: {
      worksheet_outline: {
        title: 'Der Igel',
        learningGoals: ['Ich kann beschreiben, wie der Igel überwintert.'],
        minutes: 30,
        teacherNote: '',
        items: [
          { type: 'learningGoals', purpose: 'Lernziele', afb: '', operator: '', socialForm: 'EA', stars: 0, answerKind: 'none' },
          { type: 'task', purpose: 'Informationen entnehmen', afb: 'I', operator: 'nennen', socialForm: 'EA', stars: 0, answerKind: 'lines' }
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
const page = await app.firstWindow()
page.on('pageerror', (e) => problems.push(`Fehler im Fenster am Rechner: ${e.message}`))
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1000))
await warteAufOberflaeche(page)

const status = await page.evaluate(() => window.api.lan.start())
const pin = await page.evaluate(async () => (await window.api.settings.get()).lan?.pin ?? '')
const basis = `http://127.0.0.1:${status.port}`
const { token } = await (
  await fetch(`${basis}/anmelden`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) })
).json()

// Das Fenster ohne Brücke – der Token steht vor dem Start der Oberfläche (siehe netz-tablet.mjs)
await app.evaluate(
  async ({ BrowserWindow }, { adresse, token }) => {
    // Ohne Drosselung: Ein unsichtbares Fenster bekäme Zeitgeber sonst nur einmal je Sekunde
    const win = new BrowserWindow({
      width: 1400,
      height: 950,
      show: false,
      webPreferences: { preload: undefined, sandbox: false, backgroundThrottling: false }
    })
    await win.loadURL(`${adresse}/gesundheit`)
    await win.webContents.executeJavaScript(`localStorage.setItem('schulapps-netz-token', ${JSON.stringify(token)})`)
    await win.loadURL(`${adresse}/?selftest`)
  },
  { adresse: basis, token }
)
const netz = (await app.windows()).find((w) => w !== page)
if (!netz) throw new Error('Das Fenster ohne Brücke ließ sich nicht öffnen')
netz.on('pageerror', (e) => problems.push(`Fehler im Browser: ${e.message}`))
await warteAufOberflaeche(netz)

// Welche Fortschritts-Kennungen kommen wo an? (Zuordnung: keine Vermischung)
const mitschreiben = (p) =>
  p.evaluate(() => {
    window.__gesehen = []
    window.api.ai.onProgress(({ id }) => window.__gesehen.push(id))
    window.__platz = []
    window.api.ai.onPlatz((p) => window.__platz.push(p))
  })
await mitschreiben(page)
await mitschreiben(netz)

const sichtbar = (loc) => loc.filter({ visible: true }).first()
const zeile = (p, text) => p.locator('.auftrags-zeile', { hasText: text })
const wert = async (p, text, attr) => ((await zeile(p, text).count()) ? zeile(p, text).first().getAttribute(attr) : null)
async function warteBis(fn, ms = 20000) {
  const ende = Date.now() + ms
  while (Date.now() < ende) {
    if (await fn()) return true
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}
async function oeffneLeiste(p) {
  if (await p.locator('.auftrags-liste').isVisible()) return
  await p.locator('.auftrags-pille').click()
  await p.locator('.auftrags-liste').waitFor({ timeout: 3000 })
}
async function schliesseLeiste(p) {
  if (!(await p.locator('.auftrags-liste').isVisible())) return
  await p.getByRole('button', { name: 'Aufträge einklappen' }).click()
  await p.locator('.auftrags-pille').waitFor({ timeout: 3000 })
}
async function plane(p, thema, neu = true) {
  // Die ausgeklappte Leiste liegt über dem Hauptknopf unten rechts
  await schliesseLeiste(p)
  if (neu) await sichtbar(p.getByRole('button', { name: 'Neues Arbeitsblatt' })).click()
  const feld = sichtbar(p.getByRole('textbox', { name: 'Thema' }))
  await feld.waitFor({ timeout: 15000 })
  await feld.fill(thema)
  await sichtbar(p.getByRole('button', { name: 'Gliederung planen' })).click()
  await sichtbar(p.locator('[data-auftrag-hinweis]')).waitFor({ timeout: 5000 })
}
const blaetter = () => page.evaluate(() => window.api.sheets.list())

try {
  // ---------- 1. Fortschritt im Browser
  await netz.click('[aria-label="Arbeitsblatt"]')
  await plane(netz, 'Netz Igel', false)
  await oeffneLeiste(netz)
  // Gleichzeitig arbeitet der Rechner
  await page.click('[aria-label="Arbeitsblatt"]')
  await plane(page, 'Rechner Dachs', false)
  await oeffneLeiste(page)

  const fortschritt = await warteBis(async () => Number(await wert(netz, 'Netz Igel', 'data-anteil')) > 0, 6000)
  pruefe(fortschritt, `Fortschritt kommt im Browser an (${await wert(netz, 'Netz Igel', 'data-anteil')} %)`)
  pruefe(await warteBis(async () => Number(await wert(page, 'Rechner Dachs', 'data-anteil')) > 0, 6000), 'Fortschritt kommt auch am Rechner an')
  await netz.screenshot({ path: join(shots, 'paket3b-browser-fortschritt.png') })

  // ---------- 2. Keine Vermischung
  const imBrowser = await netz.evaluate(() => [...new Set(window.__gesehen)])
  const amRechner = await page.evaluate(() => [...new Set(window.__gesehen)])
  pruefe(imBrowser.length > 0 && amRechner.length > 0, `Beide bekommen Fortschritt (Browser ${imBrowser.length}, Rechner ${amRechner.length} Kennungen)`)
  pruefe(!imBrowser.some((id) => amRechner.includes(id)), 'Keine Kennung kommt an beiden Stellen an')
  pruefe(!amRechner.some((id) => id.startsWith('netz-')) && !imBrowser.some((id) => id.startsWith('netz-')), 'Die Kennzeichnung der Sitzung bleibt im Server')

  // ---------- 3. Abbrechen wirkt sofort – obwohl die Attrappe weiterrechnet
  // Gemessen IN der Seite: vom Klick bis zur Anzeige – ohne die Wartezeiten der Teststeuerung
  const dauer = await netz.evaluate(
    () =>
      new Promise((fertig) => {
        const zeile = [...document.querySelectorAll('.auftrags-zeile')].find((z) => z.textContent.includes('Netz Igel'))
        const knopf = [...(zeile?.querySelectorAll('button') ?? [])].find((b) => b.textContent.includes('Abbrechen'))
        if (!knopf) return fertig(-1)
        /*
         * Beobachtet wird die Änderung selbst (MutationObserver). Zeitgeber und
         * requestAnimationFrame laufen im unsichtbaren Fenster gedrosselt, etwa einmal je
         * Sekunde – damit hätte die Wache ihre eigene Trägheit gemessen.
         */
        const start = performance.now()
        const beobachter = new MutationObserver(() => {
          const jetzt = [...document.querySelectorAll('.auftrags-zeile')].find((z) => z.textContent.includes('Netz Igel'))
          if (jetzt?.getAttribute('data-status') !== 'abgebrochen') return
          beobachter.disconnect()
          fertig(Math.round(performance.now() - start))
        })
        beobachter.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-status'], childList: true })
        knopf.click()
      })
  )
  pruefe(dauer >= 0 && dauer < 500, `Abgebrochen nach ${dauer} ms (höchstens 0,5 s; die Anfrage selbst läuft noch Sekunden)`)
  pruefe(
    Number(await wert(netz, 'Rechner Dachs', 'data-anteil')) >= 0 && (await page.locator('.auftrags-zeile').count()) === 1,
    'Am Rechner erscheint nur der eigene Auftrag'
  )
  pruefe((await netz.locator('.mantine-Notification-root').filter({ visible: true }).count()) === 0, 'Kein Fehlerhinweis im Browser')

  // ---------- 4. Warten mit Grund: 3 Plätze = abgebrochenes Igel + Dachs + Fuchs → Hase wartet
  await plane(netz, 'Netz Fuchs')
  await plane(netz, 'Netz Hase')
  await oeffneLeiste(netz)
  const grund = await warteBis(async () => (await wert(netz, 'Netz Hase', 'data-status')) === 'wartend', 5000)
  const text = (await zeile(netz, 'Netz Hase').first().textContent()) ?? ''
  pruefe(grund, 'Der vierte Auftrag wartet auf einen freien Platz')
  if (!grund)
    console.log(
      '   Warteplatz-Meldungen im Browser:',
      JSON.stringify(await netz.evaluate(() => window.__platz)),
      'am Rechner:',
      JSON.stringify(await page.evaluate(() => window.__platz))
    )
  pruefe(/abgebrochener Auftrag gibt seinen Platz gleich frei/.test(text), `Der Grund steht dabei („${text.match(/Wartet[^0-9]*/)?.[0] ?? text}")`)
  await netz.screenshot({ path: join(shots, 'paket3b-browser-wartet.png') })

  // ---------- 5. Danach geht es weiter; das abgebrochene Blatt bekommt nichts
  pruefe(await warteBis(async () => (await wert(netz, 'Netz Hase', 'data-status')) === 'fertig', 60000), 'Der wartende Auftrag wird fertig')
  pruefe(await warteBis(async () => (await wert(page, 'Rechner Dachs', 'data-status')) === 'fertig', 30000), 'Der Auftrag am Rechner wird fertig')
  pruefe((await wert(netz, 'Netz Igel', 'data-status')) === 'abgebrochen', 'Der abgebrochene bleibt abgebrochen, auch nach dem späten Ergebnis')
  const liste = await blaetter()
  const igel = liste.find((b) => b.topic === 'Netz Igel')
  const igelVoll = igel ? await page.evaluate((id) => window.api.sheets.get(id), igel.id) : null
  pruefe(!igelVoll?.payload?.outline, 'Das abgebrochene Blatt bekam keine Gliederung')

  // ---------- 6. Drucken mit Lösungen: EIN Tab
  await sichtbar(netz.getByRole('button', { name: 'Neues Arbeitsblatt' })).click()
  await netz.waitForTimeout(600)
  await netz.evaluate(() => window.__selftest.wsMaterialtext(6))
  await netz.waitForTimeout(2500)
  const fensterVorher = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
  await netz.getByRole('button', { name: 'Drucken', exact: true }).first().click()
  const weiter = netz.locator('.mantine-Modal-content').getByRole('button', { name: 'Weiter zur Druckvorschau', exact: true }).first()
  await weiter.waitFor({ timeout: 15000 })
  await weiter.click()
  const drucken = netz.locator('.pv-drucken')
  await warteBis(async () => (await drucken.count()) > 0 && (await drucken.isEnabled()), 40000)
  const mitLoesung = (await netz.locator('[data-loesung-trenner]').count()) > 0
  pruefe(mitLoesung, 'Die Vorschau zeigt Blatt und Lösungen als getrennte Teile')
  pruefe((await netz.locator('.pv-systemdialog').count()) === 0, 'Im Browser kein Knopf für den Druckdialog des Rechners')
  await drucken.click()
  await warteBis(async () => (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) > fensterVorher, 20000)
  await netz.waitForTimeout(4000)
  const neu = (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) - fensterVorher
  pruefe(neu === 1, `„Drucken" öffnet genau einen Tab (${neu})`)
} catch (e) {
  problems.push(`Abbruch der Wache: ${e.message}`)
  await netz.screenshot({ path: join(out, 'fehler-browser.png') }).catch(() => undefined)
  await page.screenshot({ path: join(out, 'fehler-rechner.png') }).catch(() => undefined)
} finally {
  await page.evaluate(() => window.api.lan.stop()).catch(() => undefined)
  // Die Rückfrage beim Schließen (laufende Aufträge) darf die Wache nicht aufhalten
  await Promise.race([app.close().catch(() => undefined), new Promise((r) => setTimeout(r, 10000))])
  try {
    app.process().kill()
  } catch {
    // schon beendet
  }
  await new Promise((r) => setTimeout(r, 500))
  rmSync(userData, { recursive: true, force: true, maxRetries: 5 })
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
