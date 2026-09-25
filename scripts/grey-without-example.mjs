/**
 * Markiert in den mitgelieferten Lehrwerken alle Vokabeln ohne Beispielsatz als grau.
 *
 * Hintergrund: In den Verlagslisten steht zu den Vokabeln des laufenden Wortschatzes ein
 * Kontextsatz; bei Wörtern, die im Buch grau gedruckt sind und nicht zwingend gelernt werden
 * müssen, fehlt er. Das fehlende Beispiel ist damit ein brauchbares Kennzeichen – nicht mehr,
 * aber auch nicht weniger.
 *
 * Bestehende Markierungen bleiben erhalten: Wer von Hand etwas als grau gekennzeichnet hat,
 * behält es, auch wenn zu dem Wort ein Beispielsatz vorliegt.
 *
 * KASTEN-VOKABELN SIND AUSGENOMMEN.
 *
 * Das war der Fehler in der ersten Fassung: Zu Wörtern aus den Kästen steht in den
 * Verlagslisten fast nie ein Kontextsatz – die Regel hat sie deshalb fast vollständig grau
 * gefärbt (280 von 414 in Green Line 1). Da graue Vokabeln standardmäßig nicht übernommen
 * werden, blieb der Schalter „Vokabeln aus Kästen einbeziehen" wirkungslos: Unit 1 lieferte
 * mit und ohne Kästen dieselben 134 Wörter. Ein fehlender Beispielsatz ist bei einem
 * Kastenwort eben kein Hinweis auf Graudruck, sondern der Normalfall.
 *
 * Aufruf:  node scripts/grey-without-example.mjs              (alle Bände)
 *          node scripts/grey-without-example.mjs --undo       (alle so gesetzten zurücknehmen)
 *          node scripts/grey-without-example.mjs --kaesten    (nur bei Kasten-Vokabeln zurücknehmen)
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const dir = join('resources', 'lehrwerke')
const undo = process.argv.includes('--undo')
// Reparaturlauf: nimmt die Regel NUR bei Kasten-Vokabeln zurück
const nurKaesten = process.argv.includes('--kaesten')

const hasExample = (entry) => Boolean(entry.example && entry.example.trim())

let totalChanged = 0
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const path = join(dir, file)
  const book = JSON.parse(readFileSync(path, 'utf8'))
  const entries = book.units.flatMap((u) => u.sections.flatMap((s) => s.entries))
  let changed = 0

  for (const entry of entries) {
    if (undo || nurKaesten) {
      // Nur zurücknehmen, was diese Regel gesetzt hat: grau ohne Beispielsatz.
      // Mit --kaesten zusätzlich eingeschränkt auf Wörter aus den Kästen.
      if (entry.grey && entry.greyBy === 'ohne-beispiel' && (!nurKaesten || entry.inBox)) {
        delete entry.grey
        delete entry.greyBy
        changed++
      }
      continue
    }
    // Kastenwörter haben von Haus aus keinen Kontextsatz – bei ihnen sagt das Fehlen nichts
    if (!hasExample(entry) && !entry.grey && !entry.inBox) {
      entry.grey = true
      // Merken, woher die Markierung stammt – damit sie sich einzeln zurücknehmen lässt
      entry.greyBy = 'ohne-beispiel'
      changed++
    }
  }

  if (changed) writeFileSync(path, `${JSON.stringify(book, null, 2)}\n`, 'utf8')
  totalChanged += changed
  const grey = entries.filter((e) => e.grey).length
  console.log(`${file.padEnd(26)} ${String(changed).padStart(5)} geändert · jetzt ${String(grey).padStart(5)} von ${entries.length} grau`)
}
console.log(`\n${undo || nurKaesten ? 'Zurückgenommen' : 'Neu als grau markiert'}: ${totalChanged}`)
