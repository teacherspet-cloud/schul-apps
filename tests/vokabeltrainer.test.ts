import { describe, expect, it } from 'vitest'
import {
  bewerte,
  istSicher,
  nachAbfrage,
  neuerStand,
  satzMitLuecke,
  sitzungsWoerter,
  TAG,
  uebersicht,
  varianten,
  type Vokabel
} from '../src/shared/vokabeltrainer'

/* Vokabeltrainer (03.10.2026): tolerant bewerten, Karteikasten, „sicher" */
describe('Vokabeltrainer', () => {
  it('bewertet tolerant mit Hinweis', () => {
    expect(bewerte('go', '(to) go').urteil).toBe('richtig')
    expect(bewerte('to go', '(to) go').urteil).toBe('richtig')
    expect(bewerte('Dog', 'dog').urteil).toBe('richtig')
    expect(bewerte('cafe', 'café').urteil).toBe('fast')
    expect(bewerte('beatiful', 'beautiful').urteil).toBe('fast')
    expect(bewerte('cat', 'car').urteil).toBe('falsch')
    expect(bewerte('groß', 'groß; großartig').urteil).toBe('richtig')
    expect(bewerte('großartig', 'groß; großartig').urteil).toBe('richtig')
    expect(varianten('(to) go / walk')).toContain('walk')
  })
  it('Karteikasten: richtig weiter, falsch zwei zurück, Erkennen nur bis Fach 2', () => {
    const t0 = Date.UTC(2026, 9, 1)
    let s = nachAbfrage(neuerStand(), 'karte', 'richtig', '', t0)
    expect(s.fach).toBe(1)
    s = nachAbfrage(s, 'auswahl', 'richtig', '', t0 + TAG)
    s = nachAbfrage(s, 'auswahl', 'richtig', '', t0 + 2 * TAG)
    expect(s.fach).toBe(2)
    s = nachAbfrage(s, 'frei', 'richtig', '', t0 + 5 * TAG)
    s = nachAbfrage(s, 'frei', 'richtig', '', t0 + 12 * TAG)
    expect(s.fach).toBe(4)
    expect(s.faellig).toBe(t0 + 12 * TAG + 16 * TAG)
    expect(istSicher(s)).toBe(true)
    const f = nachAbfrage(s, 'frei', 'falsch', 'goed', t0 + 30 * TAG)
    expect(f.fach).toBe(2)
    expect(f.fehlerTexte).toEqual(['goed'])
  })
  it('sicher erst mit zwei freien Abrufen im Abstand von 7 Tagen', () => {
    expect(istSicher({ ...neuerStand(), frei: [0, 3 * TAG] })).toBe(false)
    expect(istSicher({ ...neuerStand(), frei: [0, 8 * TAG] })).toBe(true)
  })
  it('Termin-Anker zieht die Fälligkeit vor den Test', () => {
    const t0 = Date.UTC(2026, 9, 1)
    const s = nachAbfrage({ ...neuerStand(), fach: 3 }, 'frei', 'richtig', '', t0, t0 + 10 * TAG)
    expect(s.faellig).toBe(t0 + 8 * TAG)
  })
  it('Sitzung: Fälliges zuerst, dann neue Wörter; Übersicht', () => {
    const liste: Vokabel[] = ['a', 'b', 'c'].map((id) => ({ id, term: id, translation: id }))
    const st = { a: { ...neuerStand(), fach: 2, faellig: 0 }, b: { ...neuerStand(), fach: 3, faellig: Date.now() + TAG } }
    expect(sitzungsWoerter(liste, st).map((v) => v.id)).toEqual(['a', 'c'])
    const u = uebersicht(liste, st)
    expect(u.neu).toBe(1)
    expect(u.faellig).toBe(1)
  })
  it('Lückensatz aus dem Beispielsatz (gebeugte Form)', () => {
    expect(satzMitLuecke('We played football yesterday.', '(to) play')).toEqual({ vor: 'We ', nach: ' football yesterday.', loesung: 'played' })
  })
})
