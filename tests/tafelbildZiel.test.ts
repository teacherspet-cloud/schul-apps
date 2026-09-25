import { describe, expect, it } from 'vitest'
import { tafelbildHinweis, tafelbildZiel } from '../src/renderer/src/modules/arbeitsblatt/export/tafelbildZiel'

/*
 * Gemeldet von der Lehrkraft (24.09.2026): „Wenn ich die Schüleraufgaben mit Material
 * speichere ist das Tafelbild dort mit dran, wenn es ausgewählt ist. Füge das Tafelbild
 * stattdessen entweder an die Lösungen oder als eigene Datei […] hinzu."
 *
 * Das Tafelbild nimmt die Ergebnisse der Stunde vorweg. Landet es in der Datei, die die
 * Klasse bekommt, ist die Stunde verdorben – und zwar unbemerkt, weil die Lehrkraft die
 * letzte Seite der Schülerdatei nicht noch einmal ansieht.
 */
const ziel = (o: Partial<Parameters<typeof tafelbildZiel>[0]> = {}): ReturnType<typeof tafelbildZiel> =>
  tafelbildZiel({ tafelbild: true, blaetter: 1, loesungen: 'none', ausgabe: 'pdf', ...o })

describe('Tafelbild beim Speichern', () => {
  it('kommt nicht in die Schülerdatei, wenn es keine Lösungen gibt', () => {
    const z = ziel({ loesungen: 'none' })
    expect(z.hauptdokument).toBe(false)
    expect(z.eigeneDatei).toBe(true)
  })

  it('kommt in die getrennte Lösungsdatei', () => {
    // Dort sieht ohnehin nur die Lehrkraft hinein – und es entsteht keine dritte Datei
    const z = ziel({ loesungen: 'separate' })
    expect(z.loesungsdatei).toBe(true)
    expect(z.hauptdokument).toBe(false)
    expect(z.eigeneDatei).toBe(false)
  })

  it('bleibt im Hauptdokument, wenn die Lösungen dort ohnehin angehängt sind', () => {
    /*
     * Diese Datei ist durch die Lösungsseiten schon keine Schülerdatei mehr. Eine zweite
     * Datei aufzumachen, wäre hier nur lästig.
     */
    const z = ziel({ loesungen: 'append' })
    expect(z.hauptdokument).toBe(true)
    expect(z.eigeneDatei).toBe(false)
  })

  it('ist das Dokument selbst, wenn kein Arbeitsblatt gewählt ist', () => {
    expect(ziel({ blaetter: 0 }).hauptdokument).toBe(true)
  })

  it('bleibt beim Drucken am Ende des Stapels', () => {
    // Beim Drucken entsteht Papier und keine zweite Datei
    for (const loesungen of ['none', 'append', 'separate'] as const) {
      const z = ziel({ ausgabe: 'print', loesungen })
      expect(z.hauptdokument).toBe(true)
      expect(z.eigeneDatei).toBe(false)
      expect(z.loesungsdatei).toBe(false)
    }
  })

  it('erzeugt ohne Häkchen gar nichts', () => {
    const z = ziel({ tafelbild: false, loesungen: 'separate' })
    expect(z).toEqual({ hauptdokument: false, loesungsdatei: false, eigeneDatei: false })
  })

  it('landet in Word wie in PDF an derselben Stelle', () => {
    // Getrennte Erzeugungswege sind in dieser App die häufigste Fehlerquelle
    for (const loesungen of ['none', 'append', 'separate'] as const) {
      expect(ziel({ ausgabe: 'docx', loesungen })).toEqual(ziel({ ausgabe: 'pdf', loesungen }))
    }
  })
})

describe('Hinweis im Speichern-Dialog', () => {
  it('sagt bei jeder Lösungswahl, wohin das Tafelbild geht', () => {
    /*
     * Ohne diesen Satz sucht die Lehrkraft die Tafelanschrift später in der falschen Datei.
     * Besonders wichtig bei „ohne Lösungen": Dort kommt ein zweiter Speichern-Dialog.
     */
    expect(tafelbildHinweis({ blaetter: 1, loesungen: 'none', ausgabe: 'pdf' })).toContain('eigene Datei')
    expect(tafelbildHinweis({ blaetter: 1, loesungen: 'separate', ausgabe: 'pdf' })).toContain('Lösungsdatei')
    expect(tafelbildHinweis({ blaetter: 1, loesungen: 'append', ausgabe: 'pdf' })).toContain('Lösungsseiten')
    expect(tafelbildHinweis({ blaetter: 1, loesungen: 'none', ausgabe: 'print' })).toContain('Ausdrucks')
    expect(tafelbildHinweis({ blaetter: 0, loesungen: 'none', ausgabe: 'pdf' })).toBeUndefined()
  })

  it('verspricht nur, was das Speichern auch tut', () => {
    // Dialogtext und Speicherweg stammen aus derselben Quelle – hier wird das nachgemessen
    for (const loesungen of ['none', 'append', 'separate'] as const) {
      const z = tafelbildZiel({ tafelbild: true, blaetter: 1, loesungen, ausgabe: 'pdf' })
      const text = tafelbildHinweis({ blaetter: 1, loesungen, ausgabe: 'pdf' }) ?? ''
      if (z.eigeneDatei) expect(text).toContain('eigene Datei')
      if (z.loesungsdatei) expect(text).toContain('Lösungsdatei')
      if (z.hauptdokument) expect(text).toContain('Lösungsseiten')
    }
  })
})
