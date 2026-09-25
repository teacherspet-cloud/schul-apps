import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

/*
 * Wache über die mitgelieferten Lehrwerksdaten.
 *
 * Anlass: Die Regel „kein Beispielsatz → grau" (scripts/grey-without-example.mjs) hat auch
 * die Kasten-Vokabeln erfasst – zu denen steht in den Verlagslisten fast nie ein
 * Kontextsatz. Da graue Vokabeln standardmäßig nicht übernommen werden, war der Schalter
 * „Vokabeln aus Kästen einbeziehen" damit wirkungslos: Green Line 1, Unit 1 lieferte mit und
 * ohne Kästen dieselben 134 Wörter. Der Fehler war von außen nicht zu sehen – die Zahlen
 * wirkten plausibel.
 *
 * Geprüft werden deshalb die DATEN, nicht der Code: Ob die Regel je wieder über die Kästen
 * läuft, zeigt sich nur hier.
 */
const dir = join('resources', 'lehrwerke')

interface Eintrag {
  term: string
  inBox?: boolean
  grey?: boolean
  greyBy?: string
}
interface Buch {
  name: string
  units: { name: string; sections: { name: string; entries: Eintrag[] }[] }[]
}

const buecher = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ datei: f, buch: JSON.parse(readFileSync(join(dir, f), 'utf8')) as Buch }))

const alleEintraege = (b: Buch): Eintrag[] => b.units.flatMap((u) => u.sections.flatMap((s) => s.entries))

describe('Markierungen in den mitgelieferten Lehrwerken', () => {
  it('findet überhaupt Lehrwerke', () => {
    expect(buecher.length).toBeGreaterThan(0)
  })

  it('färbt kein Kastenwort über die Beispielsatz-Regel grau', () => {
    for (const { datei, buch } of buecher) {
      const falsch = alleEintraege(buch).filter((e) => e.inBox && e.greyBy === 'ohne-beispiel')
      expect(falsch.map((e) => e.term).slice(0, 5), `${datei}: ${falsch.length} Kastenwörter grau durch die Regel`).toEqual([])
    }
  })

  it('lässt den Kästen-Schalter etwas bewirken – der gemeldete Fall', () => {
    /*
     * Die eigentliche Wirkung, um die es geht: Wer die Kästen zuschaltet, muss MEHR
     * Vokabeln bekommen. Geprüft an Green Line 1, Unit 1 – dort ist der Fehler aufgefallen.
     */
    const gl1 = buecher.find((b) => b.datei === 'green-line-1.json')
    expect(gl1, 'Green Line 1 fehlt').toBeTruthy()
    const unit = gl1!.buch.units.find((u) => u.name === 'Unit 1')
    expect(unit, 'Unit 1 fehlt').toBeTruthy()
    const eintraege = unit!.sections.flatMap((s) => s.entries)
    const ohneKaesten = eintraege.filter((e) => !e.grey && !e.inBox).length
    const mitKaesten = eintraege.filter((e) => !e.grey).length
    expect(mitKaesten).toBeGreaterThan(ohneKaesten)
  })

  it('behält die von Hand gesetzten Graumarkierungen', () => {
    // Die Reparatur durfte NUR die Regel zurücknehmen, nicht die Markierungen der Lehrkraft
    const gl1 = buecher.find((b) => b.datei === 'green-line-1.json')!
    const handgesetzt = alleEintraege(gl1.buch).filter((e) => e.grey && e.greyBy !== 'ohne-beispiel')
    expect(handgesetzt.length).toBeGreaterThan(100)
  })
})
