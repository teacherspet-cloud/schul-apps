// Erzeugt aus den Excel-Dateien des Lehrwerks Green Line (Klett, Ausgabe Niedersachsen)
// ein mitgeliefertes Lehrwerk unter resources/lehrwerke/.
//
// Aufruf: node scripts/import-greenline.mjs <Wortschatzdatei.xlsx> [Kastendatei.xlsx]
// Beide Dateien haben dieselben Spalten:
//   Englisch | Anmerkung | Deutsch | Vokabellektion | Kontext | Übersetzung | Merkhilfe
// In „Vokabellektion" steckt die Gliederung, z. B. „GL1 - Unit 2 - Station 1"
// und bei den Kästen zusätzlich der Kastenname: „GL1 - Hello - Station 1 - Numbers 0-12".
import readXlsxFile from 'read-excel-file/node'
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { parseGreenLine } from './greenline-parse.mjs'
import { colouredRows } from './xlsx-marks.mjs'

const [vocabFile, boxFile] = process.argv.slice(2)
if (!vocabFile) {
  console.error('Bitte die Wortschatzdatei angeben.')
  process.exit(1)
}

/** Farbig gedruckte Einträge tragen eine Erklärung statt einer Übersetzung. */
const readRows = async (file) => {
  const sheets = await readXlsxFile(file)
  const data = sheets[0].data
  const coloured = await colouredRows(file)
  // Zeile 1 ist die Kopfzeile; in Excel zählt ab 1, deshalb Index + 2
  return data
    .slice(1)
    .map((r, i) => {
      const cells = r.map((c) => (c === null || c === undefined ? '' : String(c).trim()))
      return coloured.has(i + 2) ? { cells, explained: true } : { cells }
    })
}

const rows = await readRows(vocabFile)
const boxRows = boxFile ? await readRows(boxFile) : []
const book = parseGreenLine(rows, boxRows)

const dir = resolve('resources/lehrwerke')
mkdirSync(dir, { recursive: true })
const file = resolve(dir, `${book.id}.json`)
writeFileSync(file, JSON.stringify(book, null, 1), 'utf8')

const entries = book.units.reduce((n, u) => n + u.sections.reduce((m, s) => m + s.entries.length, 0), 0)
const count = (fn) => book.units.reduce((n, u) => n + u.sections.reduce((m, s) => m + s.entries.filter(fn).length, 0), 0)
console.log(
  `${book.name}: ${book.units.length} Units, ${entries} Vokabeln (davon ${count((e) => e.inBox)} aus Kästen, ${count((e) => e.explained)} mit Erklärung statt Übersetzung) → ${file}`
)
