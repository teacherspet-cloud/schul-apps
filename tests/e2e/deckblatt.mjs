// Wache für das DECKBLATT mit einzelnen Materialseiten (vorher: npm run build).
// Aufruf: node tests/e2e/deckblatt.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (24.09.2026): „Aktuell werden alle Seiten des Materials untereinander
// angezeigt. Trenne auf dem Deckblatt die Seiten voneinander und nutze 4-6 repräsentative
// Seiten des Materials einzeln angeordnet in ein ästhetisch ansprechenden Positionierungen."
//
// Vorher rendert jede Vorschau ein GANZES Blatt – alle Seiten untereinander in einem
// Daumennagel, von dem man nichts erkannte. Geprüft wird deshalb: Wie viele Kacheln gibt es,
// zeigt jede genau EINE Seite, und stehen sie nebeneinander statt untereinander?
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/deckblatt')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-deckblatt-'))
const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1' }
})
const page = await app.firstWindow()
await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) win.setSize(1600, 1050)
})
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
// Ein Blatt mit genug Seiten, damit die Auswahl überhaupt etwas auszuwählen hat
await page.evaluate(() => window.__selftest.wsMaterialtext(30))
await page.waitForTimeout(2500)

// Deckblatt einschalten
const schalter = page.locator('label', { hasText: 'Deckblatt' }).first()
pruefe((await schalter.count()) > 0, 'Der Schalter „Deckblatt" ist da')
await schalter.click()
await page.waitForTimeout(2500)

const befund = await page.evaluate(() => {
  const deckblatt = document.querySelector('.ws-cover')
  const kacheln = [...(deckblatt?.querySelectorAll('.ws-cover-thumb') ?? [])]
  return {
    deckblatt: Boolean(deckblatt),
    kacheln: kacheln.length,
    // Wie viele Seiten steckt jede Kachel? Vorher waren es alle auf einmal.
    seitenJeKachel: kacheln.map((k) => k.querySelectorAll('.ws-page').length),
    // Nebeneinander statt untereinander: unterschiedliche linke Kanten
    linkeKanten: new Set(kacheln.map((k) => Math.round(k.getBoundingClientRect().left))).size,
    // Gefächert: nicht alle gleich gedreht
    drehungen: new Set(kacheln.map((k) => getComputedStyle(k).transform)).size,
    /*
     * Liegen die Kacheln INNERHALB der Deckblattseite? Ohne diese Messung sieht die Wache
     * Kacheln, die unten aus der Seite herausragen und im Druck fehlen – genau das ist beim
     * ersten Versuch passiert.
     */
    seiteUnten: Math.round(deckblatt?.getBoundingClientRect().bottom ?? 0),
    seiteLinks: Math.round(deckblatt?.getBoundingClientRect().left ?? 0),
    seiteRechts: Math.round(deckblatt?.getBoundingClientRect().right ?? 0),
    kachelUnten: Math.round(Math.max(0, ...kacheln.map((k) => k.getBoundingClientRect().bottom))),
    kachelLinks: Math.round(Math.min(...kacheln.map((k) => k.getBoundingClientRect().left))),
    kachelRechts: Math.round(Math.max(...kacheln.map((k) => k.getBoundingClientRect().right))),
    // Wie gross ist eine Kachel gemessen an der Seitenbreite? Zu kleine Kacheln sind unlesbar.
    kachelAnteil: kacheln[0] ? kacheln[0].getBoundingClientRect().width / (deckblatt.getBoundingClientRect().width || 1) : 0,
    aufbau: [...(deckblatt?.children ?? [])].map((k) => `${k.className}:${Math.round(k.getBoundingClientRect().height)}`)
  }
})

console.log(`Kacheln: ${befund.kacheln} · Seiten je Kachel: ${befund.seitenJeKachel.join(', ')} · linke Kanten: ${befund.linkeKanten}`)
pruefe(befund.deckblatt, 'Das Deckblatt wird gezeigt')
pruefe(befund.kacheln >= 4 && befund.kacheln <= 6, `Es sind vier bis sechs Seiten (${befund.kacheln})`)
pruefe(
  befund.seitenJeKachel.every((n) => n === 1),
  `Jede Kachel zeigt genau EINE Seite (${befund.seitenJeKachel.join(', ')})`
)
pruefe(befund.linkeKanten > 1, `Die Kacheln stehen nebeneinander (${befund.linkeKanten} verschiedene linke Kanten)`)
pruefe(befund.drehungen > 1, `Sie sind gefächert, nicht gleich ausgerichtet (${befund.drehungen} Drehungen)`)
console.log(`Aufbau: ${befund.aufbau.join(' | ')}`)
/*
 * Die Lage im Blatt. Ohne diese Messungen sieht die Wache Kacheln, die unten oder seitlich aus
 * der Seite herausragen und im Druck abgeschnitten sind – genau das ist beim ersten Versuch
 * passiert, waehrend Zahl, Drehung und linke Kanten laengst stimmten.
 */
pruefe(
  befund.kachelUnten > 0 && befund.kachelUnten <= befund.seiteUnten,
  `Die Kacheln bleiben oben im Blatt (Unterkante ${befund.kachelUnten}, Seitenende ${befund.seiteUnten})`
)
pruefe(
  befund.kachelLinks >= befund.seiteLinks && befund.kachelRechts <= befund.seiteRechts,
  `Die Kacheln bleiben seitlich im Blatt (${befund.kachelLinks}–${befund.kachelRechts} in ${befund.seiteLinks}–${befund.seiteRechts})`
)
// Eine Kachel soll erkennbar sein, nicht nur vorhanden: mindestens ein Achtel der Blattbreite
pruefe(befund.kachelAnteil >= 0.125, `Die Kacheln sind gross genug zum Erkennen (${Math.round(befund.kachelAnteil * 100)} % der Blattbreite)`)

/*
 * Vor dem Bild in den Blick scrollen: Liegt die Kachelflaeche unter dem Sichtfenster, malt
 * Chromium die verkleinerten Seiten nicht – das Bild zeigte dann eine leere Flaeche, obwohl
 * alles an seinem Platz war (24.09.2026).
 */
await page.locator('.ws-cover-previews').first().scrollIntoViewIfNeeded()
await page.waitForTimeout(600)
await page
  .locator('.ws-cover')
  .first()
  .screenshot({ path: join(out, 'deckblatt.png') })
await page
  .locator('.ws-cover-previews')
  .first()
  .screenshot({ path: join(out, 'kacheln.png') })

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nDas Deckblatt zeigt einzelne Materialseiten. Bild in ${out}`)
