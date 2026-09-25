// Wache für die Darstellung einer Reihe von Ankreuzfragen – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/mc-darstellung.mjs <Ausgabeordner>
//
// Vorlage ist die Klassenarbeit der Lehrkraft („Exam no 1", Aufgabe 1b):
//   1. Frage?                         3. Frage?
//      a) ☐ …                            a) ☐ …
// Geprüft wird, was sich von außen sehen lässt: zwei Spalten, spaltenweise nummeriert,
// Buchstaben und Kästchen an den Möglichkeiten, ein angekreuztes Kästchen an der
// Arbeitsanweisung, KEIN sichtbarer Rahmen – und dass das wiederholte „Tick" verschwindet.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/mc-darstellung')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-mc-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1500, 1000)
    win.center()
  }
})
await warteAufOberflaeche(page)

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
const info = await page.evaluate(() => window.__selftest.mcSheet())
console.log('Fragen gesetzt:', info.fragen)
await page.waitForSelector('.ws-editor-pages:visible', { timeout: 30000 })
await page.waitForTimeout(1500)

const seen = await page.evaluate(() => {
  /*
   * NUR innerhalb der sichtbaren Seiten zählen. Zum Messen der Seitenaufteilung rendert die
   * App dasselbe Blatt zusätzlich unsichtbar – über `document` gezählt kommt daher ein
   * Vielfaches heraus, und die Wache schlüge grundlos an.
   */
  const wurzel = document.querySelector('.ws-editor-pages') ?? document
  const gitter = wurzel.querySelector('.ws-mc-grid')
  const zeilen = [...(gitter?.querySelectorAll('tr') ?? [])]
  const zellen = zeilen.map((z) => [...z.querySelectorAll('td')].map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim()))
  const ersteZelle = gitter?.querySelector('td')
  const rahmen = ersteZelle ? getComputedStyle(ersteZelle).borderBottomWidth : 'kein Gitter'
  return {
    gitterDa: Boolean(gitter),
    zeilen: zellen,
    spalten: zeilen[0]?.querySelectorAll('td').length ?? 0,
    rahmen,
    // Ohne das gelöste Beispiel – dessen Kästchen werden eigens geprüft
    kaestchen: [...wurzel.querySelectorAll('.ws-mc-option .ws-check')].filter((c) => !c.closest('.ws-example')).length,
    buchstaben: [...wurzel.querySelectorAll('.ws-mc-letter')].map((e) => e.textContent),
    demoKaestchen: wurzel.querySelectorAll('.ws-task-instruction .ws-check-demo').length,
    anweisung: (wurzel.querySelector('.ws-task-instruction')?.textContent ?? '').trim(),
    // Zweiter Fall: einzelne Frage mit acht kurzen Möglichkeiten – zweispaltig, untereinander
    einzelfrage: (() => {
      const alle = [...wurzel.querySelectorAll('.ws-mc-options')]
      const liste = alle[alle.length - 1]
      return {
        moeglichkeiten: liste?.querySelectorAll('.ws-mc-option').length ?? 0,
        spalten: liste ? getComputedStyle(liste).columnCount : '-',
        untereinander: liste ? getComputedStyle(liste.querySelector('.ws-mc-option')).display : '-'
      }
    })(),
    // Gelöstes Beispiel (Punkt 0): steht VOR den Möglichkeiten und trägt die Lösung schon
    beispiel: (() => {
      const b = wurzel.querySelector('.ws-example')
      if (!b) return null
      return {
        nummer: b.querySelector('.ws-mc-num')?.textContent ?? '',
        text: (b.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
        angekreuzt: b.querySelectorAll('.ws-check').length ? [...b.querySelectorAll('.ws-check')].filter((c) => c.textContent?.trim()).length : 0
      }
    })(),
    // Der Hinweis auf das Beispiel steht an der Arbeitsanweisung der BETROFFENEN Aufgabe
    beispielHinweis: [...wurzel.querySelectorAll('.ws-task')].map((t) => ({
      hatBeispiel: Boolean(t.querySelector('.ws-example')),
      hinweis: t.querySelector('.ws-example-note')?.textContent?.trim() ?? ''
    })),
    tickImFragetext: wurzel.querySelectorAll('.ws-mc-question').length
      ? [...wurzel.querySelectorAll('.ws-mc-question')].filter((e) => /tick/i.test(e.textContent ?? '')).length
      : -1
  }
})
console.log('Spalten:', seen.spalten, '· Zeilen:', seen.zeilen.length, '· Rahmen:', seen.rahmen)
for (const z of seen.zeilen) console.log('  |', z.map((c) => c.slice(0, 40) || '(leer)').join(' | '))
console.log('Kästchen:', seen.kaestchen, '· Buchstaben:', [...new Set(seen.buchstaben)].join(' '))
console.log('Anweisung:', seen.anweisung.slice(0, 60), '· Demo-Kästchen:', seen.demoKaestchen)

await page.screenshot({ path: join(out, 'mc.png'), fullPage: false })

const problems = []
if (!seen.gitterDa) problems.push('Keine Gitterdarstellung – die Fragen stehen noch als Liste')
if (seen.spalten !== 2) problems.push(`${seen.spalten} Spalte(n) statt 2`)
// Spaltenweise: erste Zeile trägt Frage 1 und Frage 3
if (!/^1\./.test(seen.zeilen[0]?.[0] ?? '')) problems.push(`Links oben steht nicht Frage 1: „${seen.zeilen[0]?.[0]?.slice(0, 30)}"`)
if (!/^3\./.test(seen.zeilen[0]?.[1] ?? '')) problems.push(`Rechts oben steht nicht Frage 3: „${seen.zeilen[0]?.[1]?.slice(0, 30)}"`)
// Der Rahmen darf nicht zu sehen sein – die Tabelle ordnet nur an
if (!/^0/.test(seen.rahmen)) problems.push(`Die Tabelle hat einen sichtbaren Rahmen (${seen.rahmen})`)
// 4 Fragen x 3 Möglichkeiten + die Einzelfrage mit 8 Möglichkeiten
if (seen.kaestchen !== 20) problems.push(`${seen.kaestchen} Kästchen statt 20`)
if (!seen.buchstaben.includes('a)') || !seen.buchstaben.includes('c)')) problems.push('Die Möglichkeiten tragen keine Buchstaben a) b) c)')
// Beide Ankreuzaufgaben tragen das Kästchen an der Anweisung – auch die Einzelfrage
if (seen.demoKaestchen !== 2) problems.push(`${seen.demoKaestchen} angekreuzte Kästchen an den Anweisungen statt 2`)
// Der Kern der Beschwerde
if (seen.tickImFragetext !== 0) problems.push(`„Tick" steht noch in ${seen.tickImFragetext} Fragetext(en)`)
if (!/Tick/i.test(seen.anweisung)) problems.push('Der Operator fehlt jetzt auch in der Arbeitsanweisung')

// Einzelne Frage mit vielen kurzen Möglichkeiten: zweispaltig, aber jede Möglichkeit
// in eigener Zeile (Haladyna u. a. 2002, Guideline 10 – nicht nebeneinander)
console.log('Einzelfrage:', JSON.stringify(seen.einzelfrage))
if (seen.einzelfrage.moeglichkeiten !== 8) problems.push(`Einzelfrage zeigt ${seen.einzelfrage.moeglichkeiten} statt 8 Möglichkeiten`)
if (seen.einzelfrage.spalten !== '2') problems.push(`Acht kurze Möglichkeiten stehen in ${seen.einzelfrage.spalten} Spalte(n) statt 2`)
if (seen.einzelfrage.untereinander !== 'flex') problems.push('Die Möglichkeiten stehen nicht je in eigener Zeile')

// Das gelöste Beispiel: Punkt 0, mit schon eingetragener Lösung, vor den echten Items
console.log('Beispiel:', JSON.stringify(seen.beispiel))
if (!seen.beispiel) problems.push('Das gelöste Beispiel wird nicht dargestellt')
else {
  if (seen.beispiel.nummer !== '0.') problems.push(`Das Beispiel trägt „${seen.beispiel.nummer}" statt „0."`)
  // Ohne eingetragene Lösung wäre es keine Hilfe, sondern eine zusätzliche Aufgabe
  if (seen.beispiel.angekreuzt !== 1) problems.push(`Im Beispiel sind ${seen.beispiel.angekreuzt} Kästchen angekreuzt statt 1`)
}

// Der Hinweis erscheint NUR dort, wo auch ein Beispiel steht
console.log('Hinweis je Aufgabe:', JSON.stringify(seen.beispielHinweis))
for (const [i, t] of seen.beispielHinweis.entries()) {
  if (t.hatBeispiel && t.hinweis !== 'There is one example.')
    problems.push(`Aufgabe ${i + 1} hat ein Beispiel, aber den Hinweis „${t.hinweis}" statt „There is one example."`)
  if (!t.hatBeispiel && t.hinweis) problems.push(`Aufgabe ${i + 1} hat kein Beispiel, trägt aber den Hinweis „${t.hinweis}"`)
}

const react = errors.filter((e) => /Maximum update depth|Minified React error|#185|#310/i.test(e))
if (react.length) problems.push(`React-Fehler: ${react[0].slice(0, 140)}`)
if (errors.length) console.log('Meldungen im Fenster:\n- ' + errors.slice(0, 4).join('\n- '))

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.error('\nProbleme:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log('\nDie Ankreuzfragen stehen zweispaltig und rahmenlos. Bild in', out)
