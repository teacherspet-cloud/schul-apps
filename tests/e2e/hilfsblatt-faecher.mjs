// Wache für die AUSWAHL DES HILFSBLATTS je Fach (vorher: npm run build).
// Aufruf: node tests/e2e/hilfsblatt-faecher.mjs <Ausgabeordner>
//
// Rückfrage der Lehrkraft (25.09.2026): „mach das ebenso für die anderen fächer, insb. die
// fremdsprachen." Latein bekam bis dahin gar kein Hilfsblatt, weil die Auswahl an
// `foreignLanguage` hing – und das trägt Latein bewusst nicht (daran hängen Hörverstehen,
// Sprachmittlung und Arbeitsanweisungen in der Zielsprache).
//
// Geprüft wird die Oberfläche, nicht die Regel: Erscheint die Auswahl im richtigen Fach, mit
// der richtigen Beschriftung, und bleibt sie in den Sachfächern aus? Genau an dieser Stelle
// war heute früh schon eine Option gesetzt, aber wirkungslos.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/hilfsblatt-faecher')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-hilfsblatt-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
await app.evaluate(async ({ BrowserWindow }) => {
  BrowserWindow.getAllWindows()[0]?.setSize(1600, 1050)
})
await warteAufOberflaeche(page)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}

await page.click('[aria-label="Arbeitsblatt"]')
await page.waitForTimeout(600)
await page.evaluate(() => window.__selftest.wsMaterialtext(4))
await page.waitForTimeout(2000)

/**
 * Fach setzen und in Schritt 1 nachsehen, welche Hilfsblatt-Auswahl erscheint.
 *
 * Das Fach wird im Zustand gesetzt statt über das Aufklappmenü: Der Weg über die Maus führt
 * durch mehrere verschachtelte Bereiche und bricht bei jeder Umgestaltung von Schritt 1. Was
 * hier zählt, ist die BEDINGUNG – welche Auswahl bei welchem Fach steht.
 */
const beschriftung = async (fachId, label) => {
  await page.evaluate(
    ([id, name]) => {
      const ws = window.__selftest.worksheetJetzt()
      ws.meta.subjectId = id
      ws.meta.subjectLabel = name
      window.__selftest.setWorksheet(ws, 0)
    },
    [fachId, label]
  )
  await page.waitForTimeout(1500)
  return page.evaluate(() => [...document.querySelectorAll('label')].map((l) => l.textContent?.trim() ?? '').find((t) => t.startsWith('Hilfsblatt')))
}

const englisch = await beschriftung('englisch', 'Englisch')
console.log(`Englisch: „${englisch}"`)
pruefe(englisch === 'Hilfsblatt mit nützlichen Ausdrücken', `Englisch: „${englisch}"`)

const franzoesisch = await beschriftung('franzoesisch', 'Französisch')
pruefe(franzoesisch === 'Hilfsblatt mit nützlichen Ausdrücken', `Französisch bekommt dieselbe Auswahl („${franzoesisch}")`)

const latein = await beschriftung('latein', 'Latein')
console.log(`Latein: „${latein}"`)
pruefe(latein === 'Hilfsblatt mit Übersetzungshilfen', `Latein bekommt die Übersetzungshilfen („${latein}")`)

const geschichte = await beschriftung('geschichte', 'Geschichte')
pruefe(geschichte === undefined, `In Geschichte gibt es kein Hilfsblatt (${geschichte ?? 'keines'})`)

await page.screenshot({ path: join(out, 'hilfsblatt.png') })
await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.log('\nProbleme:')
  for (const p of problems) console.log(`- ${p}`)
  process.exit(1)
}
console.log(`\nJedes Fach bekommt die Hilfen, die zu ihm passen. Bild in ${out}`)
