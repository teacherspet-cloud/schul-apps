import { describe, expect, it } from 'vitest'
import { bildVersionen, entfalleneBilder, versionenZusammenfuehren, versionHinzu, versionLoeschen, versionWaehlen } from '../src/shared/sprechen/bildVersionen'
import { karteBereinigt } from '../src/shared/sprechen/karten'

/* Bildfassungen der Bildkarten (21.10.2026): neu erzeugen, wählen, löschen – `bilder` bleibt die aktuelle Auswahl */
const A = 'a'.repeat(24) + '.png'
const B = 'b'.repeat(24) + '.png'
const C = 'c'.repeat(24) + '.png'

describe('Bildfassungen', () => {
  it('neue Fassung kommt dazu und wird aktuell; wählen und löschen', () => {
    const k1 = versionHinzu({ bilder: [A] }, B)
    expect(k1).toEqual({ bilder: [B], bildVersionen: [A, B] })
    expect(versionWaehlen(k1, A).bilder).toEqual([A])
    expect(versionWaehlen(k1, C)).toBe(k1)
    // Aktuelle gelöscht: die jüngste übrige wird aktuell
    expect(versionLoeschen(k1, B)).toEqual({ bilder: [A], bildVersionen: [A] })
    expect(versionLoeschen(k1, A)).toEqual({ bilder: [B], bildVersionen: [B] })
    expect(versionLoeschen({ bilder: [A] }, A)).toEqual({ bilder: [], bildVersionen: [] })
  })
  it('Zusammenführen: Hintergrund-Fassung bleibt und wird aktuell, im Fenster gelöschte fallen weg', () => {
    const fenster = versionLoeschen(versionWaehlen({ bilder: [B], bildVersionen: [A, B] }, A), B)
    const server = { bilder: [C], bildVersionen: [A, B, C] }
    expect(versionenZusammenfuehren(fenster, server, [B])).toEqual({ bilder: [C], bildVersionen: [A, C] })
    // Ohne neue Fassung bleibt die Wahl im Fenster
    expect(versionenZusammenfuehren(versionWaehlen({ bilder: [B], bildVersionen: [A, B] }, A), { bilder: [B], bildVersionen: [A, B] }, [])).toEqual({
      bilder: [A],
      bildVersionen: [A, B]
    })
  })
  it('entfallene Dateien zum Aufräumen und Bereinigen der Karte', () => {
    expect(entfalleneBilder({ bilder: [B], bildVersionen: [A, B] }, { bilder: [B], bildVersionen: [B] })).toEqual([A])
    expect(entfalleneBilder(undefined, { bilder: [A] })).toEqual([])
    const k = karteBereinigt(
      { art: 'monolog', titel: 'Park', bilder: [B], bildVersionen: [A, 'kaputt', B], bildBeschreibung: 'A park.', leitfragen: ['What?'] },
      'x'
    )
    expect(k && k.art === 'monolog' && bildVersionen(k)).toEqual([A, B])
    expect(k && k.art === 'monolog' && k.bilder).toEqual([B])
  })
})
