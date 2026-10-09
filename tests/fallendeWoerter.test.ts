import { describe, expect, it } from 'vitest'
import { fallGrenzen, fallTempo, FEHLER_STUFEN, hoechsteStufe, naechsteStufe } from '../src/renderer/src/modules/lernen/spiele/fallTempo'

/** „Fallende Wörter": langsamer Start nach Klasse, anpassendes Tempo, begrenztes Höchsttempo (09.10.2026) – alle Sprachen */
describe('Fallende Wörter: Tempo', () => {
  it('startet für alle Klassen deutlich langsamer als bisher (Klasse 10 vorher 10 s)', () => {
    expect(fallTempo(10, 0).fallzeit).toBeGreaterThanOrEqual(20)
    expect(fallTempo(13, 0).fallzeit).toBeGreaterThanOrEqual(18)
  })
  it('Klasse 5 ist am langsamsten, höhere Klassen starten schneller', () => {
    const starts = [5, 6, 7, 8, 9, 10, 11].map((k) => fallTempo(k, 0).fallzeit)
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeLessThan(starts[i - 1])
    expect(fallTempo(null, 0).fallzeit).toBe(fallTempo(6, 0).fallzeit)
  })
  it('wird mit Treffern allmählich schneller, nie schneller als das Höchsttempo', () => {
    const k = 8
    let stufe = 0
    let vorher = fallTempo(k, stufe).fallzeit
    stufe = naechsteStufe(stufe, 'treffer', k)
    const nachEinem = fallTempo(k, stufe).fallzeit
    expect(nachEinem).toBeLessThan(vorher)
    // höchstens 6 % je Treffer – kein Sprung
    expect(nachEinem / vorher).toBeGreaterThanOrEqual(0.94)
    for (let i = 0; i < 500; i++) stufe = naechsteStufe(stufe, 'treffer', k)
    expect(stufe).toBe(hoechsteStufe(k))
    vorher = fallTempo(k, stufe).fallzeit
    expect(vorher).toBe(fallGrenzen(k).schnellstens)
  })
  it('wird nach Fehlern ruhiger – auch nach Erreichen des Höchsttempos', () => {
    const k = 10
    const oben = hoechsteStufe(k)
    const nachFehler = naechsteStufe(oben, 'fehler', k)
    expect(nachFehler).toBe(oben - FEHLER_STUFEN)
    expect(fallTempo(k, nachFehler).fallzeit).toBeGreaterThan(fallTempo(k, oben).fallzeit)
    expect(naechsteStufe(1, 'fehler', k)).toBe(0)
    expect(naechsteStufe(0, 'fehler', k)).toBe(0)
  })
  it('neue Wörter kommen nicht zu dicht hintereinander', () => {
    for (const k of [5, 8, 10, 12]) {
      expect(fallTempo(k, 0).abstand).toBeGreaterThanOrEqual(2500)
      expect(fallTempo(k, hoechsteStufe(k)).abstand).toBeGreaterThanOrEqual(2500)
    }
  })
})
