import { describe, expect, it } from 'vitest'
import {
  GRUPPEN_FENSTER_MS,
  leererVerlauf,
  merke,
  rueckgaengig,
  schliesseGruppe,
  VERLAUF_GRENZE,
  verlaufsTaste,
  wiederholen
} from '../src/renderer/src/shared/undo'

/*
 * Der gemeinsame Verlauf für Rückgängig/Wiederholen.
 *
 * Anlass (25.09.2026): Rückgängig gab es nur im Arbeitsblatt-Editor und im Vokabeltest. Ein
 * entfernter Gliederungsbaustein oder ein neu erzeugter Test war sonst verloren – und die
 * Lehrkraft hat Rückfragen vor dem Überschreiben bewusst abgewählt. Außerdem legte jedes
 * Mausereignis beim Ziehen einen eigenen Eintrag an: Ein Zug quer übers Blatt füllte den
 * Verlauf, und Strg+Z führte nur Pixel für Pixel zurück.
 */

/** Einen Stand nach dem anderen setzen, wie es ein Store tut. */
function folge(staende: string[], gruppe: (i: number) => string | null = () => null, zeit: (i: number) => number = (i) => i * 10) {
  let v = leererVerlauf<string>()
  let aktuell = staende[0]
  for (let i = 1; i < staende.length; i++) {
    v = merke(v, aktuell, gruppe(i), zeit(i))
    aktuell = staende[i]
  }
  return { v, aktuell }
}

describe('Verlauf', () => {
  it('nimmt Schritte zurück und wiederholt sie', () => {
    const { v, aktuell } = folge(['a', 'b', 'c'])
    const z1 = rueckgaengig(v, aktuell)!
    expect(z1.stand).toBe('b')
    const z2 = rueckgaengig(z1.verlauf, z1.stand)!
    expect(z2.stand).toBe('a')
    expect(rueckgaengig(z2.verlauf, z2.stand)).toBeNull()
    const w1 = wiederholen(z2.verlauf, z2.stand)!
    expect(w1.stand).toBe('b')
    const w2 = wiederholen(w1.verlauf, w1.stand)!
    expect(w2.stand).toBe('c')
    expect(wiederholen(w2.verlauf, w2.stand)).toBeNull()
  })

  it('verwirft das Wiederholbare, sobald etwas Neues geändert wird', () => {
    const { v, aktuell } = folge(['a', 'b', 'c'])
    const z = rueckgaengig(v, aktuell)!
    const neu = merke(z.verlauf, z.stand, null, 1000)
    expect(neu.future).toEqual([])
    expect(neu.past).toEqual(['a', 'b'])
  })

  it('hält die Grenze ein und behält die jüngsten Stände', () => {
    const staende = Array.from({ length: VERLAUF_GRENZE + 20 }, (_, i) => `s${i}`)
    const { v } = folge(staende)
    expect(v.past).toHaveLength(VERLAUF_GRENZE)
    expect(v.past[v.past.length - 1]).toBe(`s${VERLAUF_GRENZE + 18}`)
    expect(v.past[0]).toBe('s19')
  })
})

describe('Zusammenfassen zu einem Schritt', () => {
  it('ein Zug mit vielen Mausbewegungen ist EIN Schritt', () => {
    // Ausgang „start", dann 50 Zwischenlagen desselben Zuges
    const lagen = ['start', ...Array.from({ length: 50 }, (_, i) => `lage${i}`)]
    const { v, aktuell } = folge(lagen, () => 'ziehen:b1:1')
    expect(v.past).toEqual(['start'])
    const z = rueckgaengig(v, aktuell)!
    expect(z.stand).toBe('start')
    // Wiederholen führt an das ENDE des Zuges, nicht in eine Zwischenlage
    expect(wiederholen(z.verlauf, z.stand)!.stand).toBe('lage49')
  })

  it('zwei Züge nacheinander sind zwei Schritte', () => {
    let v = leererVerlauf<string>()
    v = merke(v, 'start', 'ziehen:b1:1', 0)
    v = merke(v, 'zwischen1', 'ziehen:b1:1', 10)
    v = merke(v, 'ende1', 'ziehen:b1:2', 20) // neuer Zug, neue Kennung
    v = merke(v, 'zwischen2', 'ziehen:b1:2', 30)
    expect(v.past).toEqual(['start', 'ende1'])
  })

  it('eine Änderung ohne Gruppe dazwischen beendet die Gruppe', () => {
    let v = leererVerlauf<string>()
    v = merke(v, 'a', 'feld:thema', 0)
    v = merke(v, 'b', null, 10)
    v = merke(v, 'c', 'feld:thema', 20)
    expect(v.past).toEqual(['a', 'b', 'c'])
  })

  it('Tippen im selben Feld ist ein Schritt – nach einer Pause beginnt ein neuer', () => {
    let v = leererVerlauf<string>()
    v = merke(v, '', 'feld:thema', 0)
    v = merke(v, 'P', 'feld:thema', 200)
    v = merke(v, 'Ph', 'feld:thema', 400)
    expect(v.past).toEqual([''])
    v = merke(v, 'Photo', 'feld:thema', 400 + GRUPPEN_FENSTER_MS + 1)
    expect(v.past).toEqual(['', 'Photo'])
  })

  it('das Ende einer Geste (Schieberegler losgelassen) trennt die Schritte', () => {
    let v = leererVerlauf<string>()
    v = merke(v, '50', 'regler:b1:breite', 0)
    v = merke(v, '55', 'regler:b1:breite', 10)
    v = schliesseGruppe(v)
    v = merke(v, '60', 'regler:b1:breite', 20)
    expect(v.past).toEqual(['50', '60'])
  })

  it('nach Rückgängig setzt dieselbe Gruppe den alten Schritt nicht fort', () => {
    let v = leererVerlauf<string>()
    v = merke(v, 'a', 'feld:thema', 0)
    const z = rueckgaengig(v, 'ab')!
    const weiter = merke(z.verlauf, z.stand, 'feld:thema', 10)
    expect(weiter.past).toEqual(['a'])
    expect(rueckgaengig(weiter, 'ax')!.stand).toBe('a')
  })
})

describe('Tasten', () => {
  const taste = (key: string, mit: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {}) =>
    verlaufsTaste({ key, ctrlKey: false, shiftKey: false, altKey: false, ...mit })

  it('Strg+Z zurück, Strg+Y und Strg+Umschalt+Z wiederholen', () => {
    expect(taste('z', { ctrlKey: true })).toBe('undo')
    expect(taste('y', { ctrlKey: true })).toBe('redo')
    // Mit Umschalt kommt „Z" groß an
    expect(taste('Z', { ctrlKey: true, shiftKey: true })).toBe('redo')
  })

  it('ohne Strg oder mit Alt ist es keine Verlaufstaste', () => {
    expect(taste('z')).toBeNull()
    expect(taste('z', { ctrlKey: true, altKey: true })).toBeNull()
    expect(taste('s', { ctrlKey: true })).toBeNull()
  })
})
