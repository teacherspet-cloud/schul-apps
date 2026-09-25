// Wache für den NOTIZRAND neben Materialtexten (vorher: npm run build).
// Aufruf: node tests/e2e/notizrand.mjs <Ausgabeordner>
//
// Wunsch der Lehrkraft (24.09.2026): „füge oben außerdem eine option (wie beim korrekturrand)
// hinzu, mit der man neben den materialien (texten) einen geeigneten rand für notizen
// hinzufügen kann. beachte dadurch entstehende seitenumbrüche dynamisch."
//
// Der zweite Satz ist der schwierige. Ein Rand macht den Text schmaler und damit HÖHER –
// wenn die Seitenaufteilung das nicht mitrechnet, läuft der Text unten aus der Seite heraus.
// Deshalb wird hier nicht geprüft, ob eine Linie da ist, sondern GEMESSEN: Wird der Text
// schmaler, und verschiebt sich der Umbruch?
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/notizrand')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-notizrand-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
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
await page.evaluate(() => window.__selftest.wsMaterialtext(14))
await page.waitForTimeout(2500)

/** Breite eines Materialabsatzes, Zahl der Seiten und der Rand-Schalter. */
const messen = async () =>
  page.evaluate(() => {
    const seitenListe = [...document.querySelectorAll('.ws-editor-pages .ws-page')]
    const absatz = seitenListe[0]?.querySelector('.ws-text .ws-paragraph')
    const rand = absatz ? getComputedStyle(absatz).paddingRight : '0px'
    /*
     * Die INHALTSbreite messen, nicht die Box: `getBoundingClientRect` schliesst das Padding
     * ein, die Box bleibt also gleich breit, waehrend der Text schmaler wird.
     */
    const zeile = absatz?.querySelector('.rt-p')
    // Traegt auch die versteckte Messkopie den Rand? Sonst rechnet der Umbruch mit der falschen Hoehe.
    const messkopie = Boolean(document.querySelector('.ws-measure .ws-text.ws-notizrand'))
    const gemessen = document.querySelector('.ws-measure .ws-text .ws-paragraph .rt-p')
    return {
      breite: zeile ? Math.round(zeile.getBoundingClientRect().width) : 0,
      messbreite: gemessen ? Math.round(gemessen.getBoundingClientRect().width) : 0,
      messkopie,
      hoehe: absatz ? Math.round(absatz.getBoundingClientRect().height) : 0,
      randPx: Math.round(parseFloat(rand)),
      seiten: seitenListe.length,
      // Absaetze auf der ERSTEN Seite – der direkte Nachweis, dass neu verteilt wurde
      ersteSeite: seitenListe[0]?.querySelectorAll('.ws-paragraph').length ?? 0,
      // Läuft Inhalt unten aus einer Seite heraus? Das wäre der eigentliche Schaden.
      ueberlauf: seitenListe.filter((p) => {
        const inhalt = p.querySelector('.ws-content') ?? p
        return inhalt.scrollHeight > inhalt.clientHeight + 2
      }).length
    }
  })

const ohne = await messen()
console.log(`ohne Rand: Zeile ${ohne.breite} px · Absatzhöhe ${ohne.hoehe} px · ${ohne.ersteSeite} Absätze auf Seite 1 · ${ohne.seiten} Seite(n)`)
pruefe(ohne.breite > 0, 'Es gibt einen Materialtext zum Messen')
pruefe(ohne.randPx < 5, 'Ohne Schalter ist kein Rand gesetzt')

// --- Notizrand einschalten
const schalter = page.locator('label', { hasText: 'Notizrand' }).first()
pruefe((await schalter.count()) > 0, 'Der Schalter „Notizrand" ist da')
await schalter.click()
await page.waitForTimeout(2000)

const mit = await messen()
console.log(`mit Rand:  Zeile ${mit.breite} px · Absatzhöhe ${mit.hoehe} px · ${mit.ersteSeite} Absätze auf Seite 1 · ${mit.seiten} Seite(n)`)
pruefe(mit.randPx > 100, `Der Rand ist gesetzt (${mit.randPx} px ≈ 42 mm)`)
pruefe(mit.breite < ohne.breite, `Der Text wird schmaler (${mit.breite} statt ${ohne.breite} px)`)
pruefe(mit.hoehe > ohne.hoehe, `Der Absatz wird dadurch höher (${mit.hoehe} statt ${ohne.hoehe} px)`)
/*
 * Der entscheidende Punkt: Die Seitenaufteilung misst in einer versteckten Kopie. Trägt die
 * den Rand nicht, rechnet sie mit der Höhe des BREITEN Textes – und der Umbruch sitzt falsch.
 */
pruefe(mit.messkopie, 'Auch die versteckte Messkopie trägt den Rand')
pruefe(mit.messbreite > 0 && mit.messbreite < ohne.messbreite, `Gemessen wird der schmalere Text (${mit.messbreite} statt ${ohne.messbreite} px)`)
/*
 * Das Entscheidende: Der schmalere Text ist höher. Die Seitenaufteilung muss das mitrechnen –
 * entweder passt es weiterhin, oder es kommt eine Seite dazu. Was NICHT passieren darf: dass
 * Inhalt unten aus der Seite herausläuft.
 */
pruefe(mit.ueberlauf === 0, `Kein Inhalt läuft aus einer Seite heraus (${mit.ueberlauf} Seiten mit Überlauf)`)
/*
 * Der direkte Nachweis: Auf die erste Seite passen weniger Absätze als vorher. Die
 * Seitenzahl allein ist zu grob – sie ändert sich erst, wenn die Verschiebung über eine
 * ganze Seite hinausläuft.
 */
pruefe(mit.ersteSeite < ohne.ersteSeite, `Auf die erste Seite passen weniger Absätze (${mit.ersteSeite} statt ${ohne.ersteSeite})`)
pruefe(mit.seiten >= ohne.seiten, `Die Seitenzahl wurde neu berechnet (${ohne.seiten} → ${mit.seiten})`)

await page.screenshot({ path: join(out, 'notizrand.png') })

// --- und wieder aus: der Rand muss verschwinden
await schalter.click()
await page.waitForTimeout(2000)
const zurueck = await messen()
pruefe(zurueck.randPx < 5, 'Ausgeschaltet ist der Rand wieder weg')
pruefe(zurueck.seiten === ohne.seiten, `Die Seitenzahl ist wieder wie vorher (${zurueck.seiten})`)

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nDer Notizrand sitzt und der Seitenumbruch rechnet ihn mit. Bild in ${out}`)
