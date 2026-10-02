import { describe, expect, it } from 'vitest'
import { eintraegeFuer, spaltenAngleichen, zeilenAngleichen } from '../src/renderer/src/modules/arbeitsblatt/render/tabellenAuswahl'
import { zugUebernehmen, type HandMasse } from '../src/renderer/src/modules/arbeitsblatt/render/tabelleMasse'

/*
 * Tabellen angleichen (02.10.2026): Nur die markierten Spalten/Zeilen ändern sich – Wunsch der
 * Lehrkraft „Dabei sollen immer nur die markierten Zellen / Zeilen / Spalten angeglichen werden".
 */
describe('Spaltenbreite angleichen', () => {
  it('teilt die Gesamtbreite der markierten Spalten gleich auf, die übrigen bleiben', () => {
    const neu = spaltenAngleichen([10, 30, 20, 40], [1, 2])
    expect(neu).toEqual([10, 25, 25, 40])
  })
  it('Summe bleibt 100, markierte Spalten sind exakt gleich (Rundungsrest auf eine unmarkierte)', () => {
    const neu = spaltenAngleichen([33.3, 33.3, 33.4], [0, 2])
    expect(neu[0]).toBe(neu[2])
    expect(Math.round(neu.reduce((a, b) => a + b, 0) * 10) / 10).toBe(100)
    const alle = spaltenAngleichen([10, 20, 70], [0, 1, 2])
    expect(Math.round(alle.reduce((a, b) => a + b, 0) * 10) / 10).toBe(100)
    expect(Math.abs(alle[0] - alle[1])).toBeLessThanOrEqual(0.1)
  })
  it('eine einzelne Spalte: nichts zu tun', () => {
    expect(spaltenAngleichen([20, 80], [1])).toEqual([20, 80])
  })
})

describe('Zeilenhöhe angleichen', () => {
  it('alle markierten so hoch wie die höchste (aufgerundet auf 0,5 mm)', () => {
    expect(
      zeilenAngleichen([
        { index: 0, mm: 7.2 },
        { index: 3, mm: 12.1 },
        { index: 'kopf', mm: 6 }
      ])
    ).toEqual([
      { index: 0, mm: 12.5 },
      { index: 3, mm: 12.5 },
      { index: 'kopf', mm: 12.5 }
    ])
  })
  it('eine Zeile: nichts', () => {
    expect(zeilenAngleichen([{ index: 0, mm: 9 }])).toEqual([])
  })
})

describe('Speichern über den Zug „angleichen" – ein Schritt, nur markierte Zeilen', () => {
  it('setzt Breiten und nur die genannten Zeilen, Kopfzeile eigens', () => {
    const d: HandMasse = { rowHeightsMm: [0, 8, 0, 0] }
    zugUebernehmen(
      d,
      {
        art: 'angleichen',
        index: 0,
        colWidths: [50, 50],
        zeilen: [
          { index: 2, mm: 11 },
          { index: 'kopf', mm: 11 }
        ]
      },
      4
    )
    expect(d).toEqual({ colWidths: [50, 50], rowHeightsMm: [0, 8, 11, 0], headerHeightMm: 11 })
  })
  it('„nach Inhalt" (0) entfernt die Maße wieder', () => {
    const d: HandMasse = { rowHeightsMm: [0, 8] }
    zugUebernehmen(d, { art: 'angleichen', index: 0, zeilen: [{ index: 1, mm: 0 }] }, 2)
    expect(d.rowHeightsMm).toBeUndefined()
  })
})

describe('Einträge des Kreismenüs', () => {
  it('nur, was zur Markierung passt', () => {
    expect(eintraegeFuer(2, 1, true).map((e) => e.id)).toEqual(['spalten', 'automatisch'])
    expect(eintraegeFuer(1, 3, true).map((e) => e.id)).toEqual(['zeilen', 'automatisch'])
    expect(eintraegeFuer(3, 2, true).map((e) => e.id)).toEqual(['spalten', 'zeilen', 'beides', 'automatisch'])
    expect(eintraegeFuer(3, 0, false).map((e) => e.id)).toEqual(['spalten'])
  })
})
