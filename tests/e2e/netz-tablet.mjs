// Wache für die DARSTELLUNG im Browser eines Tablets (vorher: npm run build).
// Aufruf: node tests/e2e/netz-tablet.mjs
//
// Anlass (Lehrkraft, 23.09.2026): „im browser sind die blätter kaum sichtbar und nur sehr
// schwer scrollbar, da die leisten oben viel platz einnehmen".
//
// Am Rechner mit 1050 Punkten Höhe fällt das nicht auf. Ein Tablet hat quer 768 Punkte,
// abzüglich der Browserleiste bleiben rund 690 – und davon nehmen zwei gestapelte
// Bedienleisten einen erheblichen Teil weg. Deshalb wird hier in Tablet-Größe GEMESSEN
// statt geschätzt.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

/** Tablet quer (iPad 1024×768) abzüglich der Adressleiste des Browsers */
const BREITE = 1024
const HOEHE = 690

const userData = mkdtempSync(join(tmpdir(), 'schulapps-tablet-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

const status = await page.evaluate(() => window.api.lan.start())
const pin = await page.evaluate(async () => (await window.api.settings.get()).lan?.pin ?? '')
const basis = `http://127.0.0.1:${status.port}`
const { token } = await (
  await fetch(`${basis}/anmelden`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) })
).json()

/*
 * Ein Fenster OHNE Brücke, in Tablet-Größe – also genau das, was der Browser sieht.
 * `?selftest` schaltet die Prüfhilfen frei, mit denen ein fertiges Blatt geladen wird,
 * ohne die KI zu bemühen.
 */
await app.evaluate(
  async ({ BrowserWindow }, { adresse, token, breite, hoehe }) => {
    const win = new BrowserWindow({ width: breite, height: hoehe, show: false, useContentSize: true, webPreferences: { preload: undefined, sandbox: false } })
    /*
     * Der Token muss stehen, BEVOR die Oberfläche startet. Lädt man sie zuerst, läuft ihr
     * erster Aufruf ins Leere, sie verwirft den Token als abgelaufen – und die Anmeldung
     * ist wieder weg. Deshalb wird er auf einer reinen JSON-Seite derselben Herkunft
     * abgelegt und erst danach die Oberfläche geladen.
     */
    await win.loadURL(`${adresse}/gesundheit`)
    await win.webContents.executeJavaScript(`localStorage.setItem('schulapps-netz-token', ${JSON.stringify(token)})`)
    await win.loadURL(`${adresse}/?selftest`)
  },
  { adresse: basis, token, breite: BREITE, hoehe: HOEHE }
)
const netz = (await app.windows()).find((w) => w !== page)
if (!netz) throw new Error('Das Fenster ohne Brücke ließ sich nicht öffnen')
// Abgelehnte Aufrufe prüft `netz-abgelehnt.mjs` – hier geht es allein um die Darstellung.
await netz.waitForTimeout(3000)
// Ein fertiges Blatt laden – über die Prüfhilfen, damit keine KI bemüht wird
await netz.evaluate(() => document.querySelector('[aria-label="Arbeitsblatt"]')?.click())
await netz.waitForTimeout(900)
await netz.evaluate(() => window.__selftest.wsGeteilteAufgabe(0))
await netz.waitForTimeout(3000)

/** Die Geometrie, auf die es ankommt. */
const mass = await netz.evaluate(() => {
  const h = window.innerHeight
  const leisten = [...document.querySelectorAll('.app-toolbar')].map((el) => Math.round(el.getBoundingClientRect().height))
  const canvas = document.querySelector('.editor-canvas')
  const seite = [...document.querySelectorAll('.ws-page')].filter((el) => !el.closest('.ws-measure') && el.getBoundingClientRect().height > 0)[0]
  const c = canvas?.getBoundingClientRect()
  const s = seite?.getBoundingClientRect()
  // Der Bereich, in dem wirklich gerollt wird (Mantine legt eine eigene Ebene darunter)
  const roller = canvas?.querySelector('.mantine-ScrollArea-viewport') ?? canvas
  return {
    fenster: h,
    leisten,
    leistenSumme: leisten.reduce((a, b) => a + b, 0),
    canvasHoehe: Math.round(c?.height ?? 0),
    seiteHoehe: Math.round(s?.height ?? 0),
    // Wie viel der A4-Seite gleichzeitig zu sehen ist
    sichtbar: s && c ? Math.round(Math.max(0, Math.min(s.bottom, c.bottom) - Math.max(s.top, c.top))) : 0,
    rollbar: roller ? roller.scrollHeight > roller.clientHeight + 4 : false,
    rollHoehe: roller?.scrollHeight ?? 0
  }
})
console.log(`Fenster ${BREITE}×${mass.fenster} · Leisten ${mass.leisten.join(' + ')} = ${mass.leistenSumme} · Blattbereich ${mass.canvasHoehe}`)
console.log(`A4-Seite ${mass.seiteHoehe} hoch, davon ${mass.sichtbar} sichtbar · rollbar: ${mass.rollbar}`)

/*
 * Die Messlatten.
 *
 * Leisten: Zwei gestapelte Leisten dürfen zusammen höchstens ein Sechstel der Höhe
 * beanspruchen. Alles darüber geht sichtbar vom Blatt ab.
 */
pruefe(
  mass.leistenSumme <= Math.round(mass.fenster / 6),
  `Die Bedienleisten nehmen ${mass.leistenSumme} von ${mass.fenster} Punkten (erlaubt: ${Math.round(mass.fenster / 6)})`
)
pruefe(mass.canvasHoehe >= mass.fenster * 0.8, `Für das Blatt bleiben ${mass.canvasHoehe} von ${mass.fenster} Punkten (mindestens 80 %)`)
// Vom Blatt muss genug auf einmal zu sehen sein, sonst rollt man sich durch Streifen
pruefe(mass.sichtbar >= 450, `Von der Seite sind ${mass.sichtbar} Punkte gleichzeitig sichtbar (mindestens 450)`)
pruefe(mass.rollbar, 'Der Blattbereich lässt sich rollen')

/*
 * Rollen muss auch WIRKLICH gehen. Die Seite ist voller anklickbarer Textfelder – wischt
 * man darüber, darf das kein Markieren auslösen, sondern muss rollen.
 */
const gerollt = await netz.evaluate(async () => {
  const roller = document.querySelector('.editor-canvas .mantine-ScrollArea-viewport') ?? document.querySelector('.editor-canvas')
  if (!roller) return -1
  roller.scrollTop = 400
  await new Promise((r) => setTimeout(r, 300))
  return roller.scrollTop
})
pruefe(gerollt > 300, `Nach dem Rollen steht der Bereich bei ${gerollt} (erwartet: über 300)`)

await netz.screenshot({ path: 'test-results/netz-tablet.png' }).catch(() => undefined)
await page.evaluate(() => window.api.lan.stop())
await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log('\nIm Browser eines Tablets bleibt genug Platz für das Blatt.')
