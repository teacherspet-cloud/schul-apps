import { describe, expect, it } from 'vitest'
import { gliedereHinweise, hinweisZeilen } from '../src/renderer/src/modules/arbeitsblatt/didactics/hinweise'

/*
 * Der Hinweis, den die Lehrkraft am 26.09.2026 als „unübersichtlich und überfrachtet"
 * zurückgab – ein einziger Absatz, mit Leerzeichen zusammengeklebt (alte Fassung).
 */
const ALT =
  'Die Originalquelle wird von der App direkt nach den Lernzielen als M1 mit Materialkopf, Zeilennummern und Glossar eingesetzt. Die Planung umfasst eine Aufgabenseite sowie eine automatisch ausgelagerte Seite mit Hilfekarten. ' +
  'Originalquelle „Telegramm des österreichisch-ungarischen Botschafters in Berlin an Außenminister Berchtold („Blankoscheck“)": Wortlaut gegen die Fundstelle geprueft. ' +
  'Vorbemerkung der Lehrkraft: „Nach dem Attentat von Sarajevo suchte Österreich-Ungarn die Unterstützung des Deutschen Reiches." ' +
  'Gewählt: Telegramm des österreichisch-ungarischen Botschafters in Berlin an Außenminister Berchtold („Blankoscheck“) (2209 Wörter im Original, 238 auf dem Blatt). ' +
  'Umfang: 236 von 2211 Wörtern (11 % des Originals). Der Text beginnt nicht am Anfang des Originals. Der Text endet vor dem Schluss des Originals. ' +
  'Auslassung 1: 179 Wörter ab „Deutsche Regierung erkenne die Gefahren welche sich für …" Ergänzung in eckigen Klammern: „" Ergänzung in eckigen Klammern: „Reichskanzler ist" ' +
  'Originalquellen (3 Textquelle(n)): Die KI gibt Quellen aus dem Gedächtnis wieder – Wortlaut und Quellenangabe vor dem Einsatz prüfen (Hinweise an den Bausteinen).'

describe('Hinweise der KI – Gliederung', () => {
  it('trennt einen mit Leerzeichen zusammengeklebten Hinweis an den Protokollzeilen', () => {
    const zeilen = hinweisZeilen(ALT)
    expect(zeilen.some((z) => z.startsWith('Umfang: 236'))).toBe(true)
    expect(zeilen.some((z) => z.startsWith('Auslassung 1:'))).toBe(true)
    // Die leere Klammer-Ergänzung fällt weg
    expect(zeilen.filter((z) => z.startsWith('Ergänzung in eckigen Klammern'))).toHaveLength(1)
  })

  it('ordnet den Hinweis in Gruppen: Blatt, Originalquelle, Quellen aus dem Gedächtnis', () => {
    const gruppen = gliedereHinweise(ALT)
    expect(gruppen.map((g) => g.art)).toEqual(['blatt', 'quelle', 'quellen'])

    const blatt = gruppen[0]
    expect(blatt.punkte.join(' ')).toContain('Die Planung umfasst eine Aufgabenseite')

    const quelle = gruppen[1]
    expect(quelle.titel).toContain('Telegramm des österreichisch-ungarischen Botschafters')
    expect(quelle.stand).toBe('Wortlaut gegen die Fundstelle geprüft.')
    expect(quelle.warnung).toBe(false)
    expect(quelle.punkte[0]).toBe('Auszug: 236 von 2211 Wörtern (11 % des Originals)')
    expect(quelle.punkte).toContain('Ausschnitt aus der Mitte: beginnt nicht am Anfang und endet vor dem Schluss des Originals.')
    expect(quelle.punkte.some((p) => p.startsWith('1 Auslassung (179 Wörter), 1 Ergänzung'))).toBe(true)
    expect(quelle.details).toHaveLength(2)
    expect(quelle.details[1]).toBe('Ergänzung in eckigen Klammern: „Reichskanzler ist“')
    // Die Wortzahlen aus „Gewählt: …" stehen nicht doppelt
    expect(quelle.titel).not.toContain('Wörter im Original')

    const quellen = gruppen[2]
    expect(quellen.warnung).toBe(true)
    expect(quellen.stand).toBe('3 Textquellen stammen aus dem Gedächtnis der KI.')
  })

  it('zeilenweise gespeicherte Hinweise (neue Fassung) ergeben dieselbe Gliederung', () => {
    const neu = ALT.replace(/\. (?=Originalquelle|Vorbemerkung|Gewählt|Umfang|Der Text|Auslassung|Ergänzung)/g, '.\n')
    expect(gliedereHinweise(neu).map((g) => g.art)).toEqual(['blatt', 'quelle', 'quellen'])
  })

  it('eine Abweichung beim Abgleich wird als Warnung gezeigt', () => {
    const g = gliedereHinweise('Originalquelle „Rede": ACHTUNG – beim Abgleich mit der Fundstelle gab es Abweichungen. Vor dem Einsatz mit dem Original vergleichen.\nACHTUNG: Ein Satz wurde umformuliert.')
    expect(g).toHaveLength(1)
    expect(g[0].warnung).toBe(true)
    expect(g[0].punkte).toContain('Ein Satz wurde umformuliert.')
  })

  it('eine freie Notiz bleibt im Wortlaut erhalten; leer ergibt nichts', () => {
    const text = 'Thema und Jahrgang passen nur bedingt zusammen; bitte vor dem Einsatz prüfen.'
    const g = gliedereHinweise(text)
    expect(g).toHaveLength(1)
    expect(g[0].art).toBe('blatt')
    expect(g[0].punkte).toEqual([text])
    expect(gliedereHinweise('')).toEqual([])
    expect(gliedereHinweise(undefined)).toEqual([])
  })
})
