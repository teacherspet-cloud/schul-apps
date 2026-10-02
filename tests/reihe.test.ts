import { describe, expect, it } from 'vitest'
import { berechneWeg, diagnoseProzent, leererInhalt, standardErfolg, type Reihe, type Schritt, type SchrittArt } from '../src/shared/reihe'

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
