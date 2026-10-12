/**
 * Grammatik „sicher" nach dem ersten Versuch (12.10.2026, Entscheidung der Lehrkraft – shared/grammatikSicher.ts) und
 * die Ampel der Lehrkraft (shared/grammatikBereiche.ts `ampelVon` übernimmt die Ampel des Servers).
 */
import { describe, expect, it } from 'vitest'
import { ersterVersuch, formBefund, formSicher, mitErstemVersuch, nachSpielfehlerGrammatik } from '../src/shared/grammatikSicher'
import { ampelVon } from '../src/shared/grammatikBereiche'
import { nachAbfrage, neuerStand, type WortStand } from '../src/shared/vokabeltrainer'

const stand = (versuche: number, falsch: number, extra: Partial<WortStand> = {}): WortStand => ({ ...neuerStand(), fach: 1, versuche, falsch, ...extra })
const reihe = (n: number, stufe?: number): { id: string; stufe?: number }[] =>
  Array.from({ length: n }, (_, i) => ({ id: `a${i}`, ...(stufe ? { stufe } : {}) }))

describe('erster Versuch', () => {
  it('ältere Stände: nie falsch → richtig, sonst vorsichtig falsch', () => {
    expect(ersterVersuch(stand(3, 0))).toBe('r')
    expect(ersterVersuch(stand(3, 1))).toBe('f')
    expect(ersterVersuch(stand(0, 0))).toBeNull()
    expect(ersterVersuch(stand(3, 2, { erster: 'r' }))).toBe('r')
  })

  it('Antworten im Trainer: erster Versuch bleibt, spätere Fehler werden gemerkt und ausgeglichen', () => {
    let s = mitErstemVersuch(undefined, nachAbfrage(neuerStand(), 'frei', 'richtig', 'x', 1), 'richtig')
    expect(s.erster).toBe('r')
    expect(s.nachFehler).toBe(false)
    s = mitErstemVersuch(s, nachAbfrage(s, 'frei', 'falsch', 'y', 2), 'falsch')
    expect(s.erster).toBe('r')
    expect(s.nachFehler).toBe(true)
    s = mitErstemVersuch(s, nachAbfrage(s, 'frei', 'richtig', 'x', 3), 'richtig')
    expect(s.nachFehler).toBe(false)
    const f = mitErstemVersuch(neuerStand(), nachAbfrage(neuerStand(), 'frei', 'falsch', 'y', 1), 'falsch')
    expect(f.erster).toBe('f')
  })
})

describe('Form sicher', () => {
  it('mindestens 5 Aufgaben (bzw. alle) und 80 % beim ersten Versuch', () => {
    const st: Record<string, WortStand> = { a0: stand(1, 0), a1: stand(1, 0), a2: stand(1, 0), a3: stand(1, 0) }
    expect(formBefund(reihe(8), st).ampel).toBe('wenig')
    st.a4 = stand(2, 1)
    expect(formBefund(reihe(8), st).ampel).toBe('sicher') // 4 von 5 = 80 %
    st.a5 = stand(2, 1)
    expect(formBefund(reihe(8), st).ampel).toBe('aufbau') // 4 von 6
    // weniger als 5 Aufgaben in der Reihe: alle nötig
    expect(formBefund(reihe(3), { a0: stand(1, 0), a1: stand(1, 0) }).ampel).toBe('wenig')
    expect(formSicher(reihe(3), { a0: stand(1, 0), a1: stand(1, 0), a2: stand(1, 0) })).toBe(true)
  })

  it('Wiederholungen zählen nicht: viele Versuche, aber der erste falsch', () => {
    const st = Object.fromEntries(reihe(5).map((a) => [a.id, stand(6, 1)]))
    expect(formBefund(reihe(5), st).ampel).toBe('schwaeche')
  })

  it('Bilden-Aufgaben: auch davon 80 %', () => {
    const r = [...reihe(5), { id: 'b0', stufe: 2 }, { id: 'b1', stufe: 3 }]
    const st: Record<string, WortStand> = Object.fromEntries(reihe(5).map((a) => [a.id, stand(1, 0)]))
    expect(formBefund(r, st).ampel).toBe('aufbau') // noch keine Bilden-Aufgabe bearbeitet
    st.b0 = stand(2, 1)
    expect(formBefund(r, st).ampel).toBe('aufbau') // 0 % der Bilden-Aufgaben
    st.b0 = stand(1, 0)
    expect(formBefund(r, st).ampel).toBe('sicher')
  })

  it('spätere Fehler (Spiel, Wiederholung) stufen auf „im Aufbau" zurück', () => {
    const st: Record<string, WortStand> = Object.fromEntries(reihe(5).map((a) => [a.id, stand(1, 0, { erster: 'r' })]))
    expect(formSicher(reihe(5), st)).toBe(true)
    st.a2 = nachSpielfehlerGrammatik(st.a2)
    expect(formBefund(reihe(5), st).ampel).toBe('aufbau')
  })

  it('Ampel der Lehrkraft übernimmt den Befund des Servers', () => {
    expect(ampelVon({ versuche: 30, quote: 0.95, fach: 4, ampel: 'aufbau' })).toBe('aufbau')
    expect(ampelVon({ versuche: 2, quote: 0.4 })).toBe('wenig')
  })
})
