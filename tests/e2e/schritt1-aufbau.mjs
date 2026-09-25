// Wache für den AUFBAU von „Thema & Lerngruppe" (vorher: npm run build).
// Aufruf: node tests/e2e/schritt1-aufbau.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (24.09.2026): „Verschiebe bei der Erstellung von Arbeitsblättern
// ‚Lernziele (optional)' und ‚Vorwissen der Lerngruppe (optional)' nach unten unter den
// Lerngruppenkasten."
//
// Fachlich einleuchtend: Beide Angaben hängen an der Lerngruppe, nicht am Thema. Wer sie
// ausfüllt, bevor Jahrgang, Schulform und Niveau feststehen, schreibt Ziele, die nachher
// nicht passen. Geprüft wird deshalb die REIHENFOLGE auf dem Bildschirm.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/schritt1-aufbau')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-schritt1-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1600, 1050)
    win.center()
  }
})
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(1200)

/** Senkrechte Lage einer Beschriftung auf dem Bildschirm. */
const lage = async (text) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll('label, .mantine-Title-root')].find((x) => x.textContent?.trim().startsWith(t))
    return el ? Math.round(el.getBoundingClientRect().top) : -1
  }, text)

const thema = await lage('Thema')
const lerngruppe = await lage('Lerngruppe')
const lernziele = await lage('Lernziele')
const vorwissen = await lage('Vorwissen der Lerngruppe')
console.log(`Reihenfolge (y): Thema ${thema} · Lerngruppe ${lerngruppe} · Lernziele ${lernziele} · Vorwissen ${vorwissen}`)

pruefe(lernziele > 0 && vorwissen > 0, 'Beide Felder sind vorhanden')
pruefe(lernziele > lerngruppe, `„Lernziele" steht unter dem Lerngruppenkasten (${lernziele} > ${lerngruppe})`)
pruefe(vorwissen > lerngruppe, `„Vorwissen der Lerngruppe" steht unter dem Lerngruppenkasten (${vorwissen} > ${lerngruppe})`)
pruefe(lernziele < vorwissen, 'Die Reihenfolge der beiden Felder bleibt erhalten')

/*
 * Und die Umfangsangaben müssen als Richtwert erkennbar sein – sonst hält die Lehrkraft sie
 * für eine feste Obergrenze und wundert sich über ein Blatt mit einer Seite mehr.
 */
// Seit Paket 7 ist die Seitenzahl standardmäßig automatisch; eine eingestellte Zahl gilt als Richtwert
const seitenHinweis = page.locator('[data-testid="seiten-hinweis"]').filter({ visible: true }).first()
pruefe((await seitenHinweis.innerText()).includes('legt die Seitenzahl selbst fest'), 'Ohne Vorgabe legt die KI die Seitenzahl selbst fest')
await page.getByText('genau', { exact: true }).filter({ visible: true }).first().click()
await page.waitForTimeout(300)
const richtwert = await seitenHinweis.innerText()
pruefe(richtwert.startsWith('Richtwert'), 'Die eingestellte Seitenzahl ist als Richtwert beschriftet')
pruefe(richtwert.includes('eine Seite mehr oder weniger'), 'Der Hinweis zum Abweichen steht dabei')

await page.screenshot({ path: join(out, 'schritt1.png') })
await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nSchritt 1 ist wie gewünscht aufgebaut. Bild in ${out}`)
