import { describe, expect, it } from 'vitest'
import {
  ampelAbweichungen,
  berechneWeg,
  diagnoseProzent,
  leererInhalt,
  niveauEmpfehlung,
  standardErfolg,
  type Reihe,
  type Schritt,
  type SchrittArt
} from '../src/shared/reihe'

/* Unterrichtsreihe (02.10.2026): Freischalten, Haltepunkte, Wahl, Förderung, Diagnose, Abzeichen */
const schritt = (id: string, art: SchrittArt, mehr: Partial<Schritt> = {}): Schritt => ({
  id,
  titel: id,
  lernziele: [],
  rolle: 'pflicht',
  erfolg: standardErfolg(art),
  inhalt: leererInhalt(art),
  ...mehr
})
const reihe = (schritte: Schritt[]): Reihe => ({
  id: 'r',
  titel: 'R',
  fachId: 'englisch',
  fachLabel: 'Englisch',
  stateId: 'NI',
  schoolTypeId: 'gymnasium',
  grade: 7,
  oberthema: 'X',
  lernziele: [],
  schritte
})

describe('Unterrichtsreihe', () => {
  it('schaltet nach KI-Erfolg frei; „noch nicht" nach allen Runden öffnet den Förderschritt', () => {
    const r = reihe([
      schritt('a', 'arbeitsblatt', { abschnitt: 'Teil 1' }),
      schritt('f', 'aufgabe', { rolle: 'foerder', foerderFuer: 'a' }),
      schritt('b', 'aufgabe')
    ])
    let w = berechneWeg(r, { schritte: {} }, {}, [])
    expect(w.schritte.map((s) => s.status)).toEqual(['offen', 'gesperrt', 'gesperrt'])
    w = berechneWeg(r, { schritte: {} }, { a: { eingereicht: 1, runden: 2, kriterien: ['teilweise', 'sicher'] } }, [])
    expect(w.schritte.map((s) => s.status)).toEqual(['geschafft', 'gesperrt', 'offen'])
    expect(w.abzeichen).toEqual(['Teil 1'])
    w = berechneWeg(r, { schritte: {} }, { a: { eingereicht: 2, runden: 2, kriterien: ['noch nicht'] } }, [])
    expect(w.schritte.map((s) => s.status)).toEqual(['nicht_geschafft', 'offen', 'gesperrt'])
    // Förderschritt geschafft → weiter
    w = berechneWeg(r, { schritte: { f: { eingereicht: 1 } } }, { a: { eingereicht: 2, runden: 2, kriterien: ['noch nicht'] } }, [])
    expect(w.schritte[2].status).toBe('offen')
  })
  it('Haltepunkt und Freischalten von Hand', () => {
    const r = reihe([schritt('a', 'lernkarten'), schritt('b', 'aufgabe', { halt: { art: 'freigabe' } })])
    const st = { schritte: { a: { gewusst: true } } }
    expect(berechneWeg(r, st, {}, []).schritte[1].status).toBe('gesperrt')
    expect(berechneWeg(r, st, {}, ['b']).schritte[1].status).toBe('offen')
    expect(berechneWeg(r, { schritte: { b: { hand: 'offen' } } }, {}, []).schritte[1].status).toBe('offen')
  })
  it('Wahl: 2 von 3 nötig, danach geht es weiter', () => {
    const w3 = (id: string): Schritt => schritt(id, 'aufgabe', { rolle: 'wahl', wahlGruppe: 'g', wahlMindestens: 2 })
    const r = reihe([w3('x'), w3('y'), w3('z'), schritt('n', 'aufgabe')])
    expect(berechneWeg(r, { schritte: { x: { eingereicht: 1 } } }, {}, []).schritte[3].status).toBe('gesperrt')
    const w = berechneWeg(r, { schritte: { x: { eingereicht: 1 }, z: { eingereicht: 1 } } }, {}, [])
    expect(w.schritte[3].status).toBe('offen')
    expect(w.fortschritt).toBeCloseTo(2 / 3)
  })
  it('Diagnose bestanden → Schritte übersprungen; Prozent ohne Groß-/Kleinschreibung', () => {
    const d = schritt('d', 'diagnose')
    d.inhalt = {
      art: 'diagnose',
      fragen: [
        { frage: 'go – past?', optionen: [], richtig: 'went' },
        { frage: '2+2', optionen: ['3', '4'], richtig: '4' }
      ],
      schwelle: 50,
      ueberspringen: ['a']
    }
    expect(diagnoseProzent(d.inhalt.fragen, { '0': ' Went ', '1': '3' })).toBe(50)
    const r = reihe([d, schritt('a', 'aufgabe'), schritt('b', 'aufgabe')])
    const w = berechneWeg(r, { schritte: { d: { diagnose: { prozent: 50, zeit: 1 } } } }, {}, [])
    expect(w.schritte.map((s) => s.status)).toEqual(['geschafft', 'uebersprungen', 'offen'])
  })
  it('Lehrkraft bestätigt: eingereicht wartet; Onlinetest nach Mindestpunkten', () => {
    const r = reihe([schritt('p', 'abschluss'), schritt('t', 'onlinetest')])
    expect(berechneWeg(r, { schritte: { p: { eingereicht: 1 } } }, {}, []).schritte[0]).toMatchObject({ status: 'eingereicht', wartet: true })
    const st = { schritte: { p: { eingereicht: 1, bewertung: { text: 'gut', geschafft: true, zeit: 1 } } } }
    expect(berechneWeg(r, st, { t: { eingereicht: 1, runden: 1, prozent: 55 } }, []).schritte[1].status).toBe('nicht_geschafft')
    expect(berechneWeg(r, st, { t: { eingereicht: 1, runden: 1, prozent: 75 } }, []).fertig).toBe(true)
  })
})

/* LearningView-Ideen (03.10.2026): Überarbeitung, Niveau-Empfehlung, Ampel-Abweichung */
describe('Unterrichtsreihe – Überarbeitung, Niveau, Ampeln', () => {
  it('„Zur Überarbeitung" öffnet den Schritt wieder, bis neu eingereicht ist', () => {
    const r = reihe([schritt('a', 'aufgabe', { erfolg: { art: 'lehrkraft' } }), schritt('b', 'hefter')])
    const offen = berechneWeg(r, { schritte: { a: { eingereicht: 1, ueberarbeiten: { text: 'Mehr Details', zeit: 1, bei: 1 } } } }, {}, [])
    expect(offen.schritte[0].status).toBe('offen')
    expect(offen.schritte[0].hinweis).toBe('Zur Überarbeitung: Mehr Details')
    const neu = berechneWeg(r, { schritte: { a: { eingereicht: 2, ueberarbeiten: { text: 'Mehr Details', zeit: 1, bei: 1 } } } }, {}, [])
    expect(neu.schritte[0].status).toBe('eingereicht')
  })
  it('empfiehlt die Niveaustufe nach dem Ergebnis der Eingangsdiagnose', () => {
    const r = reihe([schritt('d', 'diagnose'), schritt('a', 'arbeitsblatt')])
    const mit = (prozent: number) => ({ schritte: { d: { diagnose: { prozent, zeit: 1, antworten: {} } } } })
    expect(niveauEmpfehlung(r, { schritte: {} }, 3)).toBeNull()
    expect(niveauEmpfehlung(r, mit(30), 3)).toBe(0)
    expect(niveauEmpfehlung(r, mit(60), 3)).toBe(1)
    expect(niveauEmpfehlung(r, mit(95), 3)).toBe(2)
    expect(niveauEmpfehlung(r, mit(60), 2)).toBe(1)
  })
  it('meldet nur deutliche Abweichungen zwischen Selbst- und Lehrkraft-Ampel', () => {
    const stand = {
      schritte: { x: { ampel: { '0': 'gruen' as const, '1': 'gelb' as const, '2': 'rot' as const } } },
      lehrkraftAmpel: { '0': 'rot' as const, '1': 'rot' as const, '2': 'gruen' as const }
    }
    expect(ampelAbweichungen(stand)).toEqual([0, 2])
  })
})

/* Optionale Schritte (06.10.2026): in der Reihenfolge freigeschaltet, nie Voraussetzung, „mindestens X" für den Abschluss */
describe('Unterrichtsreihe – optionale Schritte', () => {
  const opt = (id: string): Schritt => schritt(id, 'aufgabe', { rolle: 'optional' })
  it('optionaler Schritt blockiert den nächsten Schritt nie', () => {
    const r = reihe([schritt('a', 'aufgabe'), opt('o'), schritt('b', 'aufgabe')])
    // a offen → o und b gesperrt (Reihenfolge gilt auch für optionale Schritte)
    expect(berechneWeg(r, { schritte: {} }, {}, []).schritte.map((s) => s.status)).toEqual(['offen', 'gesperrt', 'gesperrt'])
    // a geschafft → o UND b offen, obwohl o nicht erledigt ist
    const w = berechneWeg(r, { schritte: { a: { eingereicht: 1 } } }, {}, [])
    expect(w.schritte.map((s) => s.status)).toEqual(['geschafft', 'offen', 'offen'])
  })
  it('ohne Mindestzahl: Reihe fertig ohne optionale Schritte, Zähler trotzdem da', () => {
    const r = reihe([schritt('a', 'aufgabe'), opt('o1'), opt('o2')])
    const w = berechneWeg(r, { schritte: { a: { eingereicht: 1 }, o1: { eingereicht: 1 } } }, {}, [])
    expect(w.fertig).toBe(true)
    expect(w.fortschritt).toBe(1)
    expect(w.optional).toEqual({ geschafft: 1, gesamt: 2, noetig: 0 })
  })
  it('mit Mindestzahl: fertig erst mit genug optionalen; Fortschritt zählt sie bis zur Mindestzahl', () => {
    const r = { ...reihe([schritt('a', 'aufgabe'), opt('o1'), opt('o2'), opt('o3'), schritt('b', 'aufgabe')]), optionalMindestens: 2 }
    let w = berechneWeg(r, { schritte: { a: { eingereicht: 1 }, b: { eingereicht: 1 } } }, {}, [])
    expect(w.fertig).toBe(false)
    expect(w.fortschritt).toBeCloseTo(2 / 4)
    expect(w.optional).toEqual({ geschafft: 0, gesamt: 3, noetig: 2 })
    w = berechneWeg(r, { schritte: { a: { eingereicht: 1 }, b: { eingereicht: 1 }, o1: { eingereicht: 1 }, o3: { eingereicht: 1 } } }, {}, [])
    expect(w.fertig).toBe(true)
    expect(w.fortschritt).toBe(1)
    // mehr als nötig zählt nicht über 100 %
    w = berechneWeg(
      r,
      { schritte: { a: { eingereicht: 1 }, b: { eingereicht: 1 }, o1: { eingereicht: 1 }, o2: { eingereicht: 1 }, o3: { eingereicht: 1 } } },
      {},
      []
    )
    expect(w.fortschritt).toBe(1)
    expect(w.optional?.geschafft).toBe(3)
  })
  it('Mindestzahl über der Zahl der optionalen Schritte wird gekappt; Abzeichen nur aus Pflichtschritten', () => {
    const r = { ...reihe([schritt('a', 'aufgabe', { abschnitt: 'T' }), schritt('o', 'aufgabe', { rolle: 'optional', abschnitt: 'T' })]), optionalMindestens: 5 }
    let w = berechneWeg(r, { schritte: { a: { eingereicht: 1 } } }, {}, [])
    expect(w.abzeichen).toEqual(['T'])
    expect(w.fertig).toBe(false)
    expect(w.optional?.noetig).toBe(1)
    w = berechneWeg(r, { schritte: { a: { eingereicht: 1 }, o: { hand: 'geschafft' } } }, {}, [])
    expect(w.fertig).toBe(true)
  })
  it('nur optionale Schritte: Reihe zählt sie nur bei Mindestzahl', () => {
    const r = reihe([opt('o1'), opt('o2')])
    expect(berechneWeg(r, { schritte: {} }, {}, []).schritte.map((s) => s.status)).toEqual(['offen', 'offen'])
    expect(berechneWeg({ ...r, optionalMindestens: 1 }, { schritte: { o2: { eingereicht: 1 } } }, {}, []).fertig).toBe(true)
  })
  it('Haltepunkt an einem optionalen Schritt hält nur ihn selbst', () => {
    const r = reihe([schritt('a', 'aufgabe'), schritt('o', 'aufgabe', { rolle: 'optional', halt: { art: 'freigabe' } }), schritt('b', 'aufgabe')])
    const w = berechneWeg(r, { schritte: { a: { eingereicht: 1 } } }, {}, [])
    expect(w.schritte.map((s) => s.status)).toEqual(['geschafft', 'gesperrt', 'offen'])
  })
})
