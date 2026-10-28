/** Grundbestand der Grammatik-Aufgabenbank (19.10.2026): neuer Server mit leerer Bank spielt ihn einmal ein */
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbankFuerTests } from '../src/server/datenbank'
import { bankEintraege, bankGrundbestand } from '../src/server/grammatikBank'
import { bankFortschritt, geplanteAnfragen } from '../src/renderer/src/modules/grammatikformen/bank'

describe('Grammatik-Aufgabenbank: Grundbestand', () => {
  // Grammatik-Neubeginn (28.10.2026): der Grundbestand vom 19.10.2026 ist nicht mehr dabei – neue Server starten leer
  it('ohne mitgelieferte Bank bleibt eine neue Datenbank leer', () => {
    setzeSchluesselFuerTests(randomBytes(32))
    const d = datenbankFuerTests()
    expect(bankGrundbestand()).toBe(0)
    expect((d.prepare('SELECT COUNT(*) AS n FROM gram_bank').get() as { n: number }).n).toBe(0)
    expect(bankEintraege(['en.verb.modals_basic/can'])).toEqual([])
  })
})

describe('Restzeit der Grammatikaufgaben (19.10.2026): Fortschritt in KI-Anfragen', () => {
  it('plant je drei fehlende Übungsarten eine Anfrage', () => {
    expect(geplanteAnfragen({ uebungen: ['erkennen'] })).toBe(1)
    expect(geplanteAnfragen({ uebungen: ['erkennen', 'bilden', 'anwenden', 'unterscheiden', 'fehler'] })).toBe(2)
  })
  it('zu Beginn: alle geplanten Anfragen offen', () => {
    expect(bankFortschritt({ plan: [2, 1, 2], i: 0, imSchritt: 0, anfragen: 0, planFertig: 0, istFertig: 0 })).toEqual({ fertig: 0, gesamt: 5 })
  })
  it('musste die KI nachlegen, rechnet der Rest mit diesem Verhältnis', () => {
    // Schritt 1 brauchte 4 statt 2 Anfragen → Faktor 2 für die übrigen
    expect(bankFortschritt({ plan: [2, 1, 2], i: 1, imSchritt: 0, anfragen: 4, planFertig: 2, istFertig: 4 })).toEqual({ fertig: 4, gesamt: 10 })
  })
  it('nie weniger als eine Anfrage über dem Erledigten', () => {
    expect(bankFortschritt({ plan: [1], i: 0, imSchritt: 3, anfragen: 3, planFertig: 0, istFertig: 0 }).gesamt).toBe(4)
  })
})
