import { describe, expect, it } from 'vitest'
import { verlaufEintragen, type VokStand } from '../src/server/vokabeln'
import { vokabelSchnitt } from '../src/server/klassen'
import { begonnenAnteil } from '../src/renderer/src/shared/components/VokabelBalken'
import { regelAmpel } from '../src/renderer/src/modules/meineklassen/LernendeTabelle'

// Übersicht in „Meine Klassen" und auf der Startseite (28.10.2026, abgestimmt mit der Lehrkraft)
describe('Tagesverlauf je Kind', () => {
  it('zählt geübte Wörter, richtige Antworten und Versuche je Tag', () => {
    const heute = '2026-10-28'
    const t = Date.parse(`${heute}T10:00:00Z`)
    const st: VokStand = {
      woerter: {
        a: { fach: 1, faellig: 0, frei: [], erkannt: 0, erkennenVersuche: 0, versuche: 1, falsch: 0, fehlerTexte: [], zuletzt: t },
        b: { fach: 1, faellig: 0, frei: [], erkannt: 0, erkennenVersuche: 0, versuche: 1, falsch: 1, fehlerTexte: [], zuletzt: t },
        c: { fach: 1, faellig: 0, frei: [], erkannt: 0, erkennenVersuche: 0, versuche: 1, falsch: 0, fehlerTexte: [], zuletzt: t - 864e5 }
      },
      tage: [],
      verlauf: { '2026-09-01': { w: 3, r: 3, v: 3 } }
    }
    verlaufEintragen(st, heute, true)
    verlaufEintragen(st, heute, false)
    expect(st.verlauf![heute]).toEqual({ w: 2, r: 1, v: 2 })
    expect(Object.keys(st.verlauf!)).toHaveLength(2)
  })
})

describe('Ampel nach Regelmäßigkeit', () => {
  it('Tage seit dem Üben und offene Wiederholungen', () => {
    expect(regelAmpel(null)).toBe('gray')
    expect(regelAmpel(1, 0)).toBe('teal')
    expect(regelAmpel(1, 15)).toBe('yellow')
    expect(regelAmpel(1, 30)).toBe('red')
    expect(regelAmpel(5, 0)).toBe('yellow')
    expect(regelAmpel(9, 0)).toBe('red')
  })
})

describe('Balken und Klassenschnitt', () => {
  it('begonnen = sicher + im Aufbau', () => {
    expect(begonnenAnteil({ sicher: 4, aufbau: 28, neu: 28 })).toBeCloseTo(32 / 60)
  })
  it('Schnitt je Kind und aktiv in 7 Tagen', () => {
    const jetzt = Date.parse('2026-10-28T12:00:00Z')
    const s = vokabelSchnitt(
      [
        { vokabeln: { sicher: 2, aufbau: 10, neu: 8 }, zuletztGeuebt: '2026-10-27' },
        { vokabeln: { sicher: 0, aufbau: 0, neu: 20 }, zuletztGeuebt: null },
        { vokabeln: null, zuletztGeuebt: null }
      ],
      jetzt
    )
    expect(s).toEqual({ sicher: 1, aufbau: 5, neu: 14, aktiv7: 1, lernende: 2 })
  })
})
