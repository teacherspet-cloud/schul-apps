// Wache für die SEITENTEILUNG von Aufgaben – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/aufgabe-teilen.mjs <Ausgabeordner>
//
// Anlass: Mit Situierung, Notizentabelle, Inhaltspunkten und Schreibraum wurde eine
// Schreibaufgabe größer als eine Seite. Aufgaben waren unteilbar – die App konnte nur
// warnen („Ein Baustein ist größer als die Seite"), und der Inhalt lief über den Rand.
//
// Geprüft wird an einer bewusst überlangen Aufgabe:
//   – keine Überlaufmeldung mehr
//   – die Aufgabe steht auf zwei Seiten
//   – die Arbeitsanweisung steht nur EINMAL, das Folgestück trägt einen Hinweis
//   – die Notizentabelle wird NICHT zerschnitten
//   – die Schreiblinien beginnen auf DERSELBEN Seite wie die Aufgabe
//   – bei Teilaufgaben läuft die Zählung a) b) c) über den Seitenwechsel weiter
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/aufgabe-teilen')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-teilen-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1600, 1050)
    win.center()
  }
})
await warteAufOberflaeche(page)
await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)

const problems = []

/** Was auf den gesetzten Seiten steht. */
const seiten = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ws-page')]
      // Der Messbereich der App enthält dieselben Seiten noch einmal – er zählt nicht mit
      .filter((el) => !el.closest('.ws-measure') && el.getBoundingClientRect().height > 0)
      .map((el) => ({
        text: (el.textContent ?? '').replace(/\s+/g, ' '),
        anweisungen: el.querySelectorAll('.ws-task-instruction').length,
        fortsetzungen: el.querySelectorAll('.ws-task-continued').length,
        notizen: el.querySelectorAll('.ws-brief-notes').length,
        // Ohne die Auffüllung – die ist bewusst zusätzlich und richtet sich nach dem Platz
        linien: el.querySelectorAll('.ws-lines:not(.ws-lines-fill) .ws-line').length,
        fuellLinien: el.querySelectorAll('.ws-lines-fill .ws-line').length,
        /*
         * Gemessen gegen die INHALTSFLÄCHE, nicht gegen das Blatt: Fußzeile und unterer
         * Rand gehören nicht zum beschreibbaren Bereich. Vorher zählte die Messung sie mit
         * und meldete rund 20 mm Lücke, wo die Seite in Wahrheit voll war.
         */
        restMm: (() => {
          const body = el.querySelector('.ws-body')?.getBoundingClientRect()
          if (!body) return 0
          const inhalt = [...el.querySelectorAll('.ws-block, .ws-lines, .ws-parts')].map((k) => k.getBoundingClientRect().bottom)
          const tief = inhalt.length ? Math.max(...inhalt) : body.top
          return Math.round(((body.bottom - tief) / el.getBoundingClientRect().height) * 297)
        })(),
        teile: [...el.querySelectorAll('.ws-parts')].map((o) => o.getAttribute('start') ?? '1')
      }))
  )

// ---------------------------------------------------------------- Schreibaufgabe
await page.evaluate(() => window.__selftest.wsGeteilteAufgabe(0))
await page.waitForTimeout(2500)
const ohneTeile = await seiten()
const ueberlauf = await page.evaluate(() => (document.body.textContent ?? '').includes('größer als die Seite'))
console.log(
  `Schreibaufgabe: ${ohneTeile.length} Seiten · Anweisungen ${ohneTeile.map((s) => s.anweisungen).join('/')} · Fortsetzungen ${ohneTeile.map((s) => s.fortsetzungen).join('/')}`
)
console.log(`Notizentabellen je Seite: ${ohneTeile.map((s) => s.notizen).join('/')}`)

if (ueberlauf) problems.push('Die Aufgabe meldet weiterhin „größer als die Seite"')
if (ohneTeile.length < 2) problems.push(`Die überlange Aufgabe steht auf ${ohneTeile.length} Seite(n) – erwartet waren mindestens 2`)
const anweisungen = ohneTeile.reduce((n, s) => n + s.anweisungen, 0)
if (anweisungen !== 1) problems.push(`Die Arbeitsanweisung steht ${anweisungen}-mal statt einmal`)
const fortsetzungen = ohneTeile.reduce((n, s) => n + s.fortsetzungen, 0)
if (ohneTeile.length > 1 && fortsetzungen < 1) problems.push('Dem Folgestück fehlt der Hinweis „(Fortsetzung)"')
// Die Notizentabelle gehört auf EINE Seite: Ihre Spalten werden nebeneinander gelesen
const notizen = ohneTeile.reduce((n, s) => n + s.notizen, 0)
if (notizen !== 1) problems.push(`Die Notizentabelle erscheint ${notizen}-mal – sie darf nicht zerschnitten werden`)
/*
 * SCHREIBLINIEN: Sie müssen auf derselben Seite beginnen wie die Aufgabe.
 *
 * Gemeldet von der Lehrkraft (23.09.2026): „linien zum schreiben beginnen auf dem
 * arbeitsblatt auf der seite nach der aufgabe". Der Linienblock war EINE Umbruch-Einheit –
 * passte er nicht mehr, wanderte er ganz auf die nächste Seite und ließ eine Lücke zurück.
 */
console.log(
  `Linien je Seite: ${ohneTeile.map((s) => s.linien).join('/')} (+${ohneTeile.map((s) => s.fuellLinien).join('/')} aufgefüllt) · freier Rest: ${ohneTeile.map((s) => `${s.restMm}mm`).join('/')}`
)
const ersteMitAufgabe = ohneTeile.findIndex((s) => s.anweisungen > 0)
if (ersteMitAufgabe >= 0 && ohneTeile[ersteMitAufgabe].linien === 0) {
  problems.push('Die Schreiblinien beginnen erst auf der Seite NACH der Aufgabe')
}
const summeLinien = ohneTeile.reduce((n, s) => n + s.linien, 0)
if (summeLinien !== 26) problems.push(`Es stehen ${summeLinien} Schreiblinien auf dem Blatt statt der eingestellten 26`)
// Eine große Lücke auf einer nicht-letzten Seite heißt: Etwas Unteilbares ist gesprungen
const luecke = ohneTeile.slice(0, -1).find((s) => s.restMm > 45)
if (luecke) problems.push(`Auf einer Seite bleiben ${luecke.restMm} mm frei – da ist etwas unnötig auf die nächste Seite gesprungen`)
await page.screenshot({ path: join(out, '1-schreibaufgabe.png'), fullPage: false })

// ---------------------------------------------------------------- mit Teilaufgaben
await page.evaluate(() => window.__selftest.wsGeteilteAufgabe(9))
await page.waitForTimeout(2500)
const mitTeilen = await seiten()
const starts = mitTeilen.flatMap((s) => s.teile)
console.log(
  `Mit 9 Teilaufgaben: ${mitTeilen.length} Seiten · Listenanfänge ${starts.join(', ')} · freier Rest ${mitTeilen.map((s) => s.restMm + 'mm').join('/')}`
)
if (mitTeilen.length < 2) problems.push(`Die Aufgabe mit 9 Teilaufgaben steht auf ${mitTeilen.length} Seite(n)`)
/*
 * Der eigentliche Punkt: Beginnt die Liste auf der zweiten Seite wieder bei 1, hieße die
 * fünfte Teilaufgabe dort a) – und die Lernenden fänden ihre Antwort nicht wieder.
 */
if (starts.length > 1 && starts.every((x) => x === '1')) problems.push('Die Teilaufgaben beginnen auf jeder Seite wieder bei a)')
const doppelt = starts.filter((x, i) => starts.indexOf(x) !== i)
if (doppelt.length) problems.push(`Listenanfänge doppelt vergeben: ${doppelt.join(', ')}`)
await page.screenshot({ path: join(out, '2-teilaufgaben.png'), fullPage: false })

// ---------------------------------------------------------------- Ein Schreibbereich, keine zwei
/*
 * Gemeldet von der Lehrkraft (24.09.2026): „einmal linien für die aufgabe und einmal ein
 * neuer linierter bereich für das writing". Es war EIN Schreibbereich, den der Seitenumbruch
 * zerrissen hatte: unten auf Seite 1 ein Stück, oben auf Seite 2 der Rest – und darunter
 * zwei Drittel leeres Papier, weil das Hilfsblatt ohnehin eine eigene Seite bekommt.
 *
 * Zwei getrennte Linienblöcke mit einer großen Lücke dazwischen liest sich wie zwei Aufgaben.
 */
await page.evaluate(() => window.__selftest.wsGeteilteAufgabe(0, true))
await page.waitForTimeout(2500)
const mitHilfsblatt = await seiten()
console.log(
  `Mit Hilfsblatt: ${mitHilfsblatt.length} Seiten · Linien ${mitHilfsblatt.map((s) => s.linien).join('/')} (+${mitHilfsblatt.map((s) => s.fuellLinien).join('/')} aufgefüllt) · freier Rest ${mitHilfsblatt.map((s) => s.restMm + 'mm').join('/')}`
)
// Zum Ansehen: Auf dieses Bild bezieht sich die Meldung „zwei Schreibbereiche"
await page.screenshot({ path: join(out, '3-schreibbereich.png'), fullPage: false })
const schreibSeiten = mitHilfsblatt.filter((s) => s.linien + s.fuellLinien > 0)
for (const s of schreibSeiten) {
  if (s.restMm > 25) problems.push(`Eine Seite mit Schreiblinien lässt ${s.restMm} mm frei – das sieht aus wie ein zweiter, abgebrochener Bereich`)
}

// ---------------------------------------------------------------- Sprache des Hinweises
/*
 * Der Fortsetzungshinweis steht in der Sprache des Faches (Wunsch 24.09.2026). Auf einem
 * englischen Blatt „Task 1 (continued)" – ein deutsches „Aufgabe 1 (Fortsetzung)" mitten im
 * englischen Satz fällt sofort auf.
 */
await page.evaluate(() => window.__selftest.wsGeteilteAufgabe(0))
await page.waitForTimeout(2500)
const hinweis = await page.evaluate(() => document.querySelector('.ws-page:not(.ws-measure *) .ws-task-continued')?.textContent?.trim() ?? '')
console.log(`Fortsetzungshinweis: „${hinweis}"`)
if (hinweis !== 'Task 1 (continued)') problems.push(`Der Fortsetzungshinweis lautet „${hinweis}" statt „Task 1 (continued)"`)

// ---------------------------------------------------------------- Korrekturrand
/*
 * Einstellbar am fertigen Blatt (Wunsch 24.09.2026): Die Schreiblinien enden vor dem rechten
 * Rand, daneben bleibt Platz fürs Korrigieren.
 */
const linienBreite = async () =>
  page.evaluate(() => {
    const l = document.querySelector('.ws-page:not(.ws-measure *) .ws-line')
    const body = l?.closest('.ws-body')?.getBoundingClientRect()
    return l && body ? Math.round((l.getBoundingClientRect().width / body.width) * 100) : 0
  })
const ohneRand = await linienBreite()
await page.evaluate(() => {
  // Mantine setzt die Beschriftung NEBEN das Kästchen – ein Klick auf sie schaltet um
  const el = [...document.querySelectorAll('label')].find((x) => x.textContent?.trim() === 'Korrekturrand')
  el?.click()
})
await page.waitForTimeout(2000)
const mitRand = await linienBreite()
const randLinie = await page.evaluate(() => document.querySelectorAll('.ws-page:not(.ws-measure *) .ws-lines-rand').length)
console.log(`Linienbreite ohne/mit Korrekturrand: ${ohneRand} % / ${mitRand} % · Randpäckchen: ${randLinie}`)
if (!(mitRand > 0 && mitRand < ohneRand - 10)) problems.push(`Der Korrekturrand verkürzt die Linien nicht (${ohneRand} % → ${mitRand} %)`)
if (randLinie === 0) problems.push('Die Trennlinie des Korrekturrands fehlt')

const react = errors.filter((e) => /Maximum update depth|Minified React error|#185|#310/i.test(e))
if (react.length) problems.push(`React-Fehler: ${react[0].slice(0, 140)}`)

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nAufgaben werden sauber über Seiten geteilt. Bilder in ${out}`)
