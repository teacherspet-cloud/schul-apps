/**
 * Überträgt die Kennzeichnungen aus einer selbst bearbeiteten Lehrwerksfassung in das
 * mitgelieferte Lehrwerk.
 *
 * Hintergrund: Die Excel-Listen des Verlags tragen für Green Line 1 keinerlei Formatierung –
 * grau gedruckte Vokabeln ließen sich beim Import also nicht erkennen. Die Lehrkraft hat sie
 * in der App von Hand markiert. Damit jede Neuinstallation davon profitiert, wandern diese
 * Markierungen hier in die mitgelieferte Datei.
 *
 * Übertragen werden NUR die Kennzeichnungen `grey` und `inBox`, niemals Wörter, Übersetzungen
 * oder Beispielsätze: Der Verlagsbestand bleibt unangetastet.
 *
 * Aufruf:  node scripts/apply-textbook-marks.mjs green-line-1
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const id = process.argv[2]
if (!id) {
  console.error('Aufruf: node scripts/apply-textbook-marks.mjs <lehrwerk-id>')
  process.exit(1)
}

const ownPath = join(process.env.APPDATA ?? '', 'schul-apps', 'lehrwerke', `${id}.json`)
const shipPath = join('resources', 'lehrwerke', `${id}.json`)

const own = JSON.parse(readFileSync(ownPath, 'utf8'))
const ship = JSON.parse(readFileSync(shipPath, 'utf8'))

/**
 * Abgeglichen wird POSITIONSGENAU, nicht über das Wort.
 *
 * In Green Line 1 kommen 65 Wörter innerhalb desselben Abschnitts doppelt vor (etwa in
 * verschiedenen Bedeutungen). Ein Abgleich über den Wortlaut würde solchen Paaren dieselbe
 * Markierung geben und damit falsche Kennzeichnungen erzeugen. Beide Dateien stammen aus
 * derselben Verlagsliste und haben dieselbe Reihenfolge – zur Sicherheit wird das geprüft.
 */
const flatten = (book) => book.units.flatMap((u) => u.sections.flatMap((s) => s.entries))
const ownEntries = flatten(own)
const shipEntries = flatten(ship)

if (ownEntries.length !== shipEntries.length) {
  console.error(`Abbruch: unterschiedlich viele Einträge (${ownEntries.length} zu ${shipEntries.length}).`)
  process.exit(1)
}
const mismatch = shipEntries.findIndex((e, i) => e.term !== ownEntries[i].term)
if (mismatch >= 0) {
  console.error(`Abbruch: Eintrag ${mismatch + 1} unterscheidet sich („${shipEntries[mismatch].term}" statt „${ownEntries[mismatch].term}").`)
  process.exit(1)
}

let grey = 0
let box = 0
const missing = 0
shipEntries.forEach((entry, i) => {
  const source = ownEntries[i]
  if (Boolean(source.grey) !== Boolean(entry.grey)) {
    grey++
    if (source.grey) entry.grey = true
    else delete entry.grey
  }
  if (Boolean(source.inBox) !== Boolean(entry.inBox)) {
    box++
    if (source.inBox) entry.inBox = true
    else delete entry.inBox
  }
})

writeFileSync(shipPath, `${JSON.stringify(ship, null, 2)}\n`, 'utf8')
const all = ship.units.flatMap((u) => u.sections.flatMap((s) => s.entries))
console.log(`${id}: ${grey} Änderungen an „grau", ${box} an „Kasten"${missing ? `, ${missing} Einträge ohne Entsprechung` : ''}`)
console.log(`Jetzt mitgeliefert: ${all.filter((e) => e.grey).length} grau, ${all.filter((e) => e.inBox).length} aus Kästen, ${all.length} insgesamt`)
