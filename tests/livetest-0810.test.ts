import { describe, expect, it } from 'vitest'
import { freiwilligeWoerter, nachAbfrage, nachFreiwillig, neuerStand, TAG, type WortStand } from '../src/shared/vokabeltrainer'
import { fallTempo } from '../src/renderer/src/modules/lernen/spiele/SpieleSchreiben'
import { rekordeBereinigt } from '../src/server/wartung'
import { schuljahrVon } from '../src/server/rekordbuch'

/** Nachbesserungen nach dem Livetest mit Fünftklässlern (08.10.2026) */
const MORGEN = new Date('2026-10-08T09:00:00+02:00').getTime()
const liste = Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, term: `word${i}`, translation: `Wort${i}` }))

describe('Freiwillig weiter üben', () => {
  it('die heute falsch angeklickte neue Vokabel darf mit „Wusste ich" vorrücken', () => {
    const falsch = nachAbfrage(neuerStand(), 'karte', 'falsch', '', MORGEN)
    expect(falsch.fach).toBe(0)
    const frei = nachFreiwillig(falsch, 'karte', 'richtig', '', MORGEN + 60_000)
    expect(frei.fach).toBe(1)
  })
  it('heute schon vorgerückt oder nicht fällig: nur Übung', () => {
    const vor = nachAbfrage(neuerStand(), 'karte', 'richtig', '', MORGEN)
    expect(vor.fach).toBe(1)
    const nochmal = nachFreiwillig({ ...vor, faellig: MORGEN }, 'auswahl', 'richtig', '', MORGEN + 60_000)
    expect(nochmal.fach).toBe(1)
    expect(nochmal.versuche).toBe(vor.versuche + 1)
  })
  it('falsch stuft nicht zurück, kommt aber spätestens morgen wieder', () => {
    const st: WortStand = { ...neuerStand(), fach: 4, versuche: 5, faellig: MORGEN + 10 * TAG, zuletzt: MORGEN - 5 * TAG }
    const f = nachFreiwillig(st, 'frei', 'falsch', 'wrod', MORGEN)
    expect(f.fach).toBe(4)
    expect(f.falsch).toBe(1)
    expect(f.fehlerTexte).toEqual(['wrod'])
    expect(f.faellig).toBe(MORGEN + TAG)
  })
  it('Reihenfolge: heutige Fehler, dann wackelige, dann übrige geübte; nie geübte nicht', () => {
    const staende: Record<string, WortStand> = {
      w0: { ...neuerStand(), fach: 0, versuche: 1, faellig: MORGEN, zuletzt: MORGEN },
      w1: { ...neuerStand(), fach: 2, versuche: 3, faellig: MORGEN + 2 * TAG, zuletzt: MORGEN - 2 * TAG },
      w2: { ...neuerStand(), fach: 5, versuche: 9, faellig: MORGEN + 20 * TAG, zuletzt: MORGEN - 9 * TAG },
      // heute richtig (Lernkarte gewusst): erst morgen wieder – kein „heute daneben"
      w3: { ...neuerStand(), fach: 1, versuche: 1, faellig: MORGEN + TAG, zuletzt: MORGEN }
    }
    const ids = freiwilligeWoerter(liste, staende, MORGEN + 1000).map((v) => v.id)
    expect(ids[0]).toBe('w0')
    expect(ids.slice(1, 3).sort()).toEqual(['w1', 'w3'])
    expect(ids[3]).toBe('w2')
  })
})

describe('Fallende Wörter: Tempo nach Klasse', () => {
  it('Klasse 5 sehr langsam, wird mit Treffern schneller, nie unter das Minimum', () => {
    // 09.10.2026: Start deutlich langsamer (spiele/fallTempo.ts, weitere Fälle in fallendeWoerter.test.ts)
    expect(fallTempo(5, 0).fallzeit).toBe(30)
    expect(fallTempo(5, 10).fallzeit).toBeLessThan(30)
    expect(fallTempo(5, 200).fallzeit).toBe(13)
    expect(fallTempo(11, 0).fallzeit).toBeLessThan(fallTempo(7, 0).fallzeit)
    expect(fallTempo(null, 0).fallzeit).toBe(28)
  })
})

describe('Bestwerte und Rekordbuch', () => {
  it('unnatürlich hohe Bestwerte in Zeitspielen werden entfernt, andere bleiben', () => {
    expect(rekordeBereinigt({ blitz: 85, richtiggehoert: 22, memory: 9, zuordnen: 14, formenblitz: 31 })).toEqual({
      rekorde: { richtiggehoert: 22, memory: 9, zuordnen: 14 },
      entfernt: 2
    })
  })
  it('Schuljahr wechselt am 1. August', () => {
    expect(schuljahrVon(new Date('2026-10-08').getTime())).toBe('2026/27')
    expect(schuljahrVon(new Date('2027-07-31T12:00').getTime())).toBe('2026/27')
    expect(schuljahrVon(new Date('2027-08-01T12:00').getTime())).toBe('2027/28')
  })
})
