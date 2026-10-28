import { describe, expect, it } from 'vitest'
import { aufgabeMangel, aufgabeNormalisiert, aufgabenGeprueft, wahlAusAnweisung, wahlAusVorgabe } from '../src/shared/grammatikAufgabenRegeln'
import { bankPaket, UEBUNG_ARTEN, type BankAufgabe } from '../src/shared/grammatikBank'

const auf = (x: Partial<BankAufgabe>): BankAufgabe => ({
  id: 'b000000000001',
  art: 'luecke',
  regelId: 'r',
  anweisung: 'Setze die passende Form ein.',
  satz: 'She ___ to school every day.',
  vorgabe: '(go)',
  loesungen: ['goes'],
  uebung: 'bilden',
  niveau: 'm',
  ...x
})

describe('Regeln für Grammatikaufgaben (28.10.2026)', () => {
  it('Erkennen und Unterscheiden gibt es nicht mehr als freie Lücke', () => {
    expect(UEBUNG_ARTEN.erkennen).not.toContain('luecke')
    expect(UEBUNG_ARTEN.unterscheiden).not.toContain('luecke')
  })

  it('liest eine Wahl aus Vorgabe und Anweisung', () => {
    expect(wahlAusVorgabe('(since / for)')).toEqual(['since', 'for'])
    expect(wahlAusVorgabe('(who oder which)')).toEqual(['who', 'which'])
    expect(wahlAusVorgabe('(go)')).toEqual([])
    expect(wahlAusAnweisung('Setze despite, in spite of oder because of ein.')).toEqual(['despite', 'in spite of', 'because of'])
  })

  it('macht aus einer Erkennen-Lücke mit Wahl eine Auswahl', () => {
    const a = aufgabeNormalisiert(auf({ uebung: 'erkennen', anweisung: 'Wähle die richtige Form.', satz: 'I have lived here ___ 2020.', vorgabe: '(since / for)', loesungen: ['since'] }))
    expect(a.art).toBe('auswahl')
    expect(a.optionen).toEqual(['since', 'for'])
    expect(a.vorgabe).toBeUndefined()
    expect(aufgabeMangel(a)).toBe('')
  })

  it('stuft eine Erkennen-Lücke mit Grundform als Bilden ein und berichtigt „Wähle“', () => {
    const a = aufgabeNormalisiert(auf({ uebung: 'erkennen', anweisung: 'Wähle die passende Form.', satz: 'Did Ben ___ his bike?', vorgabe: '(clean)', loesungen: ['clean'] }))
    // Grundform gleich Lösung: bleibt Erkennen und ist ein Mangel
    expect(aufgabeMangel(a)).toBe('Vorgabe ist schon die Lösung')
    const b = aufgabeNormalisiert(auf({ uebung: 'unterscheiden', anweisung: 'Wähle die passende Form.', satz: 'Yesterday she ___ home.', vorgabe: '(walk)', loesungen: ['walked'] }))
    expect(b.uebung).toBe('bilden')
    expect(b.anweisung).toBe('Setze die passende Form ein.')
    expect(aufgabeMangel(b)).toBe('')
  })

  it('erkennt die Mängel aus der Prüfung', () => {
    expect(aufgabeMangel(auf({ uebung: 'erkennen', satz: 'Leo often ___ his room.', vorgabe: undefined, loesungen: ['tidies'] }))).toMatch(/Erkennen/)
    expect(aufgabeMangel(auf({ satz: 'The pupil ___ sits there.', vorgabe: undefined, loesungen: ['who'] }))).toBe('Lücke ohne Grundwort beim Bilden')
    expect(aufgabeMangel(auf({ satz: 'Why ___ this ___ like a message?', vorgabe: '(sound like)', loesungen: ['does / sound like'] }))).toBe('mehrere Lücken in einem Satz')
    expect(aufgabeMangel(auf({ satz: 'I ___ the concert.', vorgabe: '(look forward to)', loesungen: ['look forward to'] }))).toBe('Vorgabe ist schon die Lösung')
    expect(aufgabeMangel(auf({ art: 'fehler', satz: 'Although it rains, but we go.', fehlerWort: 'but', loesungen: ['but streichen'] }))).toBe('Lösung nicht tippbar')
    expect(aufgabeMangel(auf({ art: 'fehler', satz: 'This is most unusual animal.', fehlerWort: 'most', loesungen: ['the most unusual'] }))).toMatch(/ein Wort/)
    expect(aufgabeMangel(auf({ art: 'fehler', satz: 'Firstly the teacher explains.', fehlerWort: 'Firstly', loesungen: ['Firstly,'] }))).toBe('Korrektur gleich Fehlerwort')
    expect(aufgabeMangel(auf({ art: 'umformen', satz: 'We put on our boots.', loesungen: ['We put on our boots.'] }))).toBe('Lösung gleich Ausgangssatz')
  })

  it('lässt gute Aufgaben in allen Sprachen durch', () => {
    // Englisch, Französisch, Spanisch, Deutsch („nichts“ ist dort ein Wort)
    expect(aufgabeMangel(auf({}))).toBe('')
    expect(aufgabeMangel(auf({ satz: 'Hier, nous ___ au cinéma.', vorgabe: '(aller)', loesungen: ['sommes allés', 'sommes allées'] }))).toBe('')
    expect(aufgabeMangel(auf({ art: 'auswahl', uebung: 'unterscheiden', satz: 'Mi hermano ___ cansado hoy.', optionen: ['está', 'es', 'son'], loesungen: ['está'] }))).toBe('')
    expect(aufgabeMangel(auf({ art: 'umformen', satz: 'Er hat etwas gesagt.', vorgabe: 'Verneine mit „nichts“.', loesungen: ['Er hat nichts gesagt.'] }))).toBe('')
  })

  it('streicht neue Aufgaben mit Mangel und nennt den Grund', () => {
    const r = aufgabenGeprueft([auf({}), auf({ id: 'b000000000002', uebung: 'erkennen', satz: 'Leo ___ his room.', vorgabe: undefined, loesungen: ['tidies'] })])
    expect(r.aufgaben).toHaveLength(1)
    expect(r.gestrichen[0].grund).toMatch(/Erkennen/)
  })

  it('zurückgestellte Aufgaben kommen nicht ins Paket der Kurse', () => {
    const p = bankPaket('t', [
      {
        schluessel: 'en.verb.modals_basic/can',
        regel: { titel: 'can', erklaerung: 'x', beispiele: [] },
        aufgaben: [auf({}), auf({ id: 'b000000000003', pruefen: 'Befund: falsche Lösung' })]
      }
    ])
    expect(p.aufgaben.map((a) => a.id)).toEqual(['b000000000001'])
  })
})

describe('Grundwort nicht doppelt (Probelauf 28.10.2026)', () => {
  it('nimmt die Vorgabe aus dem Satz', () => {
    const a = aufgabeNormalisiert(auf({ uebung: 'bilden', anweisung: 'Setze ein.', satz: 'We ___ (have) this computer for three years.', vorgabe: '(have)', loesungen: ['have had'] }))
    expect(a.satz).toBe('We ___ this computer for three years.')
    expect(a.vorgabe).toBe('(have)')
  })
})
