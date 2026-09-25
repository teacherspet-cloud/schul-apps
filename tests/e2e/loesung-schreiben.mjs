// Wache für das LÖSUNGSBLATT einer Schreibaufgabe (vorher: npm run build).
// Aufruf: node tests/e2e/loesung-schreiben.mjs <Ausgabeordner>
//
// Gemeldet von der Lehrkraft (24.09.2026) anhand eines fertigen Lösungs-PDF:
//   – „hier verschiebt sich die ganze Aufgabe auf eine neue Seite"
//   – „bei den Lösungen sind die Linien nicht notwendig – es könnte aber stattdessen ein
//      ausformulierter Mustertext auf den Linien sein"
// Beim Nachlesen des PDF fiel zusätzlich auf, dass der Mustertext MITTEN IM SATZ abbrach:
// Erwartungshorizont und Mustertext hingen als unteilbarer Anhang an der Aufgabe und wurden
// beim Seitenumbruch nicht mitgerechnet.
//
// Geprüft wird deshalb vor allem eins: Es darf NICHTS mehr unten aus der Seite herauslaufen.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/loesung-schreiben')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-loesung-'))
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
await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
await page.evaluate(() => window.__selftest.wsGeteilteAufgabe(0))
await page.waitForTimeout(2500)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

/** Was auf den gesetzten Seiten steht – und ob etwas über den Rand hinausragt. */
const seiten = async () =>
  page.evaluate(() => {
    const alle = [...document.querySelectorAll('.ws-page')].filter((el) => !el.closest('.ws-measure') && el.getBoundingClientRect().height > 0)
    return alle.map((el) => {
      const body = el.querySelector('.ws-body')
      const grenze = body ? body.getBoundingClientRect().bottom : el.getBoundingClientRect().bottom
      /*
       * Überlauf = Inhalt, dessen Unterkante unter der Inhaltsfläche liegt. Die Seite ist auf
       * `overflow: hidden` gestellt, deshalb SIEHT man davon nichts – es fehlt einfach.
       */
      const ueberlauf = [...el.querySelectorAll('.ws-block, .ws-expectation, .ws-model-text, .ws-lines, .ws-solution, .ws-teacher-note')]
        .map((k) => Math.round(k.getBoundingClientRect().bottom - grenze))
        .filter((d) => d > 2)
      return {
        text: (el.textContent ?? '').replace(/\s+/g, ' '),
        linien: el.querySelectorAll('.ws-line').length,
        muster: el.querySelectorAll('.ws-model-text').length,
        erwartung: el.querySelectorAll('.ws-expectation').length,
        ueberlauf: ueberlauf.length ? Math.max(...ueberlauf) : 0
      }
    })
  })

// ---------------------------------------------------------------- Schülerblatt
const schueler = await seiten()
console.log(`Schülerblatt: ${schueler.length} Seiten · Linien ${schueler.map((s) => s.linien).join('/')}`)
pruefe(schueler.reduce((n, s) => n + s.linien, 0) > 0, 'Auf dem Schülerblatt stehen Schreiblinien')
pruefe(
  schueler.every((s) => s.muster === 0),
  'Auf dem Schülerblatt steht kein Mustertext'
)

// ---------------------------------------------------------------- Lösungsansicht
// Die Umschaltung ist ein SegmentedControl, kein Knopf
await page.evaluate(() => {
  const el = [...document.querySelectorAll('label, button')].find((x) => x.textContent?.trim() === 'Lösungen')
  el?.click()
})
await page.waitForTimeout(2500)
const loesung = await seiten()
console.log(
  `Lösungen: ${loesung.length} Seiten · Linien ${loesung.map((s) => s.linien).join('/')} · Mustertext-Absätze ${loesung.map((s) => s.muster).join('/')} · Erwartungshorizont ${loesung.map((s) => s.erwartung).join('/')}`
)
console.log(`Überlauf je Seite: ${loesung.map((s) => `${s.ueberlauf}px`).join('/')}`)

pruefe(
  loesung.every((s) => s.linien === 0),
  `Auf dem Lösungsblatt stehen keine Schreiblinien (${loesung.reduce((n, s) => n + s.linien, 0)} gefunden)`
)
const musterAbsaetze = loesung.reduce((n, s) => n + s.muster, 0)
pruefe(musterAbsaetze > 0, `An ihrer Stelle steht der Mustertext (${musterAbsaetze} Absätze)`)
pruefe(loesung.reduce((n, s) => n + s.erwartung, 0) > 0, 'Der stichpunktartige Erwartungshorizont steht zusätzlich da')

/*
 * DER KERN: Nichts darf unten aus der Seite herauslaufen. Genau das war der Fehler – der
 * Mustertext brach im PDF mitten im Satz ab, weil die Seite auf `overflow: hidden` steht
 * und den Rest einfach verschluckte.
 */
const schlimmster = Math.max(...loesung.map((s) => s.ueberlauf))
pruefe(schlimmster <= 2, `Kein Inhalt läuft aus der Seite heraus (größter Überlauf: ${schlimmster} px)`)

// Der Mustertext muss VOLLSTÄNDIG dastehen – ein abgeschnittener Satz fällt sonst nicht auf
const ganz = loesung.map((s) => s.text).join(' ')
for (const satz of ['Purpose and programme', 'Future groups should plan a quieter afternoon']) {
  pruefe(ganz.includes(satz), `Der Mustertext ist vollständig: „${satz.slice(0, 40)}…"`)
}

/*
 * „hier verschiebt sich die ganze Aufgabe auf eine neue Seite": Auf keiner Seite vor der
 * letzten darf die untere Hälfte leer bleiben.
 */
const luecken = await page.evaluate(() => {
  const alle = [...document.querySelectorAll('.ws-page')].filter((el) => !el.closest('.ws-measure') && el.getBoundingClientRect().height > 0)
  return alle.slice(0, -1).map((el) => {
    const r = el.getBoundingClientRect()
    // Dieselbe Auswahl wie beim Überlauf – sonst fehlt die Lösungszeile und die Lücke wird zu groß gemessen
    const unterste = [...el.querySelectorAll('.ws-block, .ws-expectation, .ws-model-text, .ws-lines, .ws-solution, .ws-teacher-note')].map(
      (k) => k.getBoundingClientRect().bottom
    )
    const tief = unterste.length ? Math.max(...unterste) : r.top
    return Math.round(((r.bottom - tief) / r.height) * 297)
  })
})
console.log(`Freier Rest je Seite (ohne die letzte): ${luecken.map((l) => `${l}mm`).join(', ') || '–'}`)
/*
 * 40 mm hält den erreichten Stand fest (vorher 58). Wächst die Lücke wieder, stimmt etwas
 * mit der Verteilung nicht.
 */
const grosseLuecke = luecken.find((l) => l > 40)
pruefe(grosseLuecke === undefined, `Keine Seite bleibt größtenteils leer (größte Lücke: ${Math.max(0, ...luecken)} mm)`)

await page.screenshot({ path: join(out, 'loesung.png') })
await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nDas Lösungsblatt zeigt den Mustertext statt Linien und läuft nirgends über. Bilder in ${out}`)
