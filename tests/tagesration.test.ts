import { describe, expect, it } from 'vitest'
import { nachAbfrage, neuerStand, sitzungsWoerter, weitereNeue, type WortStand } from '../src/shared/vokabeltrainer'

/** Tagesration (08.10.2026): höchstens `ziel` neue Wörter je Tag, zufällig, Spiele erst danach, morgen die nächsten */
const liste = Array.from({ length: 127 }, (_, i) => ({ id: `w${i}`, term: `word${i}`, translation: `Wort${i}` }))
const MORGENS = new Date('2026-10-08T08:00:00+02:00').getTime()

const ueben = (ids: string[], staende: Record<string, WortStand>, jetzt: number, richtig = true): void => {
  for (const id of ids) {
    staende[id] = nachAbfrage(staende[id] ?? neuerStand(), 'karte', richtig ? 'richtig' : 'falsch', '', jetzt)
  }
}

describe('Tagesration', () => {
  it('bietet am ersten Tag nur das Tagesziel an, in zufälliger Reihenfolge', () => {
    const heute = sitzungsWoerter(liste, {}, MORGENS, 10)
    expect(heute).toHaveLength(10)
    expect(heute.map((v) => v.id)).not.toEqual(liste.slice(0, 10).map((v) => v.id))
    expect(sitzungsWoerter(liste, {}, MORGENS, 48, 73)).toHaveLength(48)
  })
  it('ist nach der Ration leer (Spiele frei) – auch wenn Wörter nicht gewusst wurden; weitere nur freiwillig', () => {
    const st: Record<string, WortStand> = {}
    const heute = sitzungsWoerter(liste, st, MORGENS, 10)
    ueben(
      heute.slice(0, 5).map((v) => v.id),
      st,
      MORGENS + 1000
    )
    ueben(
      heute.slice(5).map((v) => v.id),
      st,
      MORGENS + 2000,
      false
    )
    expect(sitzungsWoerter(liste, st, MORGENS + 3000, 10)).toHaveLength(0)
    const mehr = weitereNeue(liste, st, MORGENS + 3000)
    expect(mehr).toHaveLength(10)
    expect(mehr.some((v) => heute.includes(v))).toBe(false)
  })
  it('bringt am nächsten Tag Wiederholungen und die nächsten neuen', () => {
    const st: Record<string, WortStand> = {}
    const heute = sitzungsWoerter(liste, st, MORGENS, 10)
    ueben(
      heute.map((v) => v.id),
      st,
      MORGENS + 1000
    )
    const morgen = sitzungsWoerter(liste, st, MORGENS + 864e5 + 5000, 10)
    expect(morgen.filter((v) => heute.includes(v))).toHaveLength(10)
    expect(morgen.filter((v) => !heute.includes(v))).toHaveLength(10)
  })
})
