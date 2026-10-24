/**
 * Zuteilung der Partnerarbeit (24.10.2026): jede Person genau einmal, Restregeln, „nicht mit", „nicht wie zuletzt",
 * Strategien, Determinismus je Saat, Tauschen, Nachzügler, Einstufungsvorschlag.
 */
import { describe, expect, it } from 'vitest'
import {
  aufloesen,
  aufteilen,
  einstufungVorschlag,
  hinzufuegen,
  tauschen,
  warnungen,
  zusammenlegen,
  zuteilen,
  zuletztFortschreiben,
  type ZuteilungEingabe
} from '../src/shared/partnerarbeit/zuteilung'
import type { PaRegeln } from '../src/shared/partnerarbeit/typen'

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `s${i + 1}`)
const leer: PaRegeln = { einstufung: {}, nichtMit: [], zuletzt: {} }
const eingabe = (t: Partial<ZuteilungEingabe> = {}): ZuteilungEingabe => ({
  anwesend: ids(8),
  groesse: 2,
  strategie: 'zufall',
  regeln: leer,
  nichtWieZuletzt: true,
  saat: 7,
  ...t
})
const flach = (g: string[][]): string[] => g.flat().sort()

describe('Zuteilung', () => {
  it('jede Person genau einmal; Größen nach den Restregeln', () => {
    expect(aufteilen(ids(5), 2).map((g) => g.length)).toEqual([2, 3])
    expect(aufteilen(ids(7), 3).map((g) => g.length)).toEqual([3, 2, 2])
    expect(aufteilen(ids(4), 3).map((g) => g.length)).toEqual([2, 2])
    expect(aufteilen(ids(5), 3).map((g) => g.length)).toEqual([3, 2])
    expect(aufteilen(ids(1), 2)).toEqual([['s1']])
    expect(aufteilen([], 2)).toEqual([])
    for (const n of [2, 3, 6, 9, 11])
      for (const groesse of [2, 3] as const) {
        const g = zuteilen(eingabe({ anwesend: ids(n), groesse }))
        expect(flach(g)).toEqual(ids(n).sort())
        expect(g.every((x) => x.length >= 2 && x.length <= 3)).toBe(true)
      }
  })

  it('„nicht mit" wird vermieden, wenn es geht; sonst Warnung', () => {
    const regeln: PaRegeln = { ...leer, nichtMit: [['s1', 's2']] }
    for (let saat = 1; saat < 30; saat++) {
      const g = zuteilen(eingabe({ anwesend: ids(4), regeln, saat }))
      expect(g.some((x) => x.includes('s1') && x.includes('s2'))).toBe(false)
    }
    // Zu zweit mit Verbot: nur eine Gruppe möglich → Warnung
    const g2 = zuteilen(eingabe({ anwesend: ['s1', 's2'], regeln }))
    const w = warnungen(g2, regeln, true)
    expect(w).toHaveLength(1)
    expect({ ...w[0], ids: [...w[0].ids].sort() }).toEqual({ gruppe: 0, art: 'nichtMit', ids: ['s1', 's2'] })
  })

  it('„nicht wie zuletzt" vermeidet die letzten Partner', () => {
    const regeln: PaRegeln = { ...leer, zuletzt: { s1: ['s2'], s2: ['s1'], s3: ['s4'], s4: ['s3'] } }
    for (let saat = 1; saat < 20; saat++) {
      const g = zuteilen(eingabe({ anwesend: ids(4), regeln, saat }))
      expect(g.some((x) => (x.includes('s1') && x.includes('s2')) || (x.includes('s3') && x.includes('s4')))).toBe(false)
    }
    const alt = zuteilen(eingabe({ anwesend: ids(4), regeln, nichtWieZuletzt: false, saat: 3 }))
    expect(flach(alt)).toEqual(ids(4))
    expect(
      zuletztFortschreiben([
        ['a', 'b'],
        ['c', 'd', 'e']
      ])
    ).toEqual({ a: ['b'], b: ['a'], c: ['d', 'e'], d: ['c', 'e'], e: ['c', 'd'] })
  })

  it('Strategien: gemischt paart stark mit schwach, aehnlich gleiche Stufen', () => {
    const regeln: PaRegeln = { ...leer, einstufung: { s1: 'stark', s2: 'stark', s3: 'schwach', s4: 'schwach', s5: 'mittel', s6: 'mittel' } }
    const gemischt = zuteilen(eingabe({ anwesend: ids(6), regeln, strategie: 'gemischt' }))
    expect(gemischt.some((g) => g.includes('s1') && g.includes('s2'))).toBe(false)
    expect(gemischt.some((g) => g.includes('s3') && g.includes('s4'))).toBe(false)
    const aehnlich = zuteilen(eingabe({ anwesend: ids(6), regeln, strategie: 'aehnlich' }))
    expect(aehnlich.some((g) => g.includes('s1') && g.includes('s2'))).toBe(true)
    expect(aehnlich.some((g) => g.includes('s3') && g.includes('s4'))).toBe(true)
  })

  it('gleiche Saat → gleiches Ergebnis; andere Saat meist anders', () => {
    const a = zuteilen(eingabe({ saat: 11 }))
    const b = zuteilen(eingabe({ saat: 11 }))
    expect(a).toEqual(b)
    const anders = Array.from({ length: 10 }, (_, i) => JSON.stringify(zuteilen(eingabe({ saat: 100 + i }))))
    expect(new Set(anders).size).toBeGreaterThan(1)
  })

  it('tauschen, Nachzügler, auflösen, zusammenlegen', () => {
    const g = [
      ['a', 'b'],
      ['c', 'd']
    ]
    expect(tauschen(g, 'a', 'd')).toEqual([
      ['d', 'b'],
      ['c', 'a']
    ])
    expect(hinzufuegen(g, 'e', leer)).toEqual([
      ['a', 'b', 'e'],
      ['c', 'd']
    ])
    // Verbot: in die andere Gruppe
    expect(hinzufuegen(g, 'e', { ...leer, nichtMit: [['e', 'a']] })).toEqual([
      ['a', 'b'],
      ['c', 'd', 'e']
    ])
    // Alle voll → allein, zweiter Nachzügler dazu
    const voll = [['a', 'b', 'c']]
    const m1 = hinzufuegen(voll, 'd', leer)
    expect(m1).toEqual([['a', 'b', 'c'], ['d']])
    expect(hinzufuegen(m1, 'e', leer)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e']
    ])
    expect(warnungen(m1, leer, true)).toEqual([{ gruppe: 1, art: 'allein', ids: ['d'] }])
    expect(aufloesen(g, 0, leer)).toEqual([['c', 'd', 'a'], ['b']])
    expect(zusammenlegen(g, 0, 1)).toBeNull()
    expect(zusammenlegen([['a'], ['b', 'c']], 0, 1)).toEqual([['a', 'b', 'c']])
    expect(hinzufuegen(g, 'a', leer)).toBe(g)
  })

  it('Einstufungsvorschlag aus dem Lernstand', () => {
    expect(einstufungVorschlag(null, [])).toBe('mittel')
    expect(einstufungVorschlag({ sicher: 80, gesamt: 100 }, [{ ampel: 'sicher' }])).toBe('stark')
    expect(einstufungVorschlag({ sicher: 30, gesamt: 100 }, [])).toBe('schwach')
    expect(einstufungVorschlag({ sicher: 55, gesamt: 100 }, [])).toBe('mittel')
    expect(einstufungVorschlag({ sicher: 80, gesamt: 100 }, [{ ampel: 'schwaeche' }, { ampel: 'schwaeche' }])).toBe('schwach')
    // zu wenige Wörter: nur die Grammatik zählt
    expect(einstufungVorschlag({ sicher: 5, gesamt: 5 }, [{ ampel: 'sicher' }, { ampel: 'sicher' }])).toBe('stark')
  })
})

describe('Bildsymbole', () => {
  it('40 Symbole reichen für Klassen bis 34 – jede Person ein eigenes Bild ohne Zahl', async () => {
    const { symboleVergeben, symboleFuer, SYMBOLE_UNTER, SYMBOLE_MITTEL, SYMBOLE_OBER } = await import('../src/shared/partnerarbeit/symbole')
    for (const l of [SYMBOLE_UNTER, SYMBOLE_MITTEL, SYMBOLE_OBER]) {
      expect(l.length).toBe(40)
      expect(new Set(l.map((x) => x.hex)).size).toBe(40)
    }
    // altersgerecht: 5–7 Tiere/Früchte, 8–10 Sport/Musik, ab 11 neutral
    expect(symboleFuer(5)).toBe(SYMBOLE_UNTER)
    expect(symboleFuer(7)).toBe(SYMBOLE_UNTER)
    expect(symboleFuer(8)).toBe(SYMBOLE_MITTEL)
    expect(symboleFuer(10)).toBe(SYMBOLE_MITTEL)
    expect(symboleFuer(11)).toBe(SYMBOLE_OBER)
    expect(symboleFuer(null)).toBe(SYMBOLE_MITTEL)
    const mischen = (l: string[]): string[] => [...l].reverse()
    const v = symboleVergeben(ids(34), {}, mischen)
    const werte = Object.values(v)
    expect(werte).toHaveLength(34)
    expect(new Set(werte).size).toBe(34)
    expect(werte.some((s) => s.includes('#'))).toBe(false)
    // ab der 41. Person: Wiederholung mit Zahl
    const gross = Object.values(symboleVergeben(ids(45), {}, mischen))
    expect(new Set(gross).size).toBe(45)
    expect(gross.filter((s) => s.endsWith('#2'))).toHaveLength(5)
    // schon vergebene bleiben, neue kommen dazu
    const nach = symboleVergeben(['neu'], v, mischen)
    expect(nach.s1).toBe(v.s1)
    expect(new Set(Object.values(nach)).size).toBe(35)
  })
})
