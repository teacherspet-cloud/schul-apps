import { afterEach, describe, expect, it, vi } from 'vitest'
import { kopieName, passtZurSuche } from '../src/renderer/src/shared/bibliothek'
import { freierDateiname } from '../src/shared/dateiname'
import { loesungsTexte, loesungsVorgabe, merkeLoesungsWahl } from '../src/renderer/src/shared/loesungen'

/*
 * Bibliotheken und Ausgabe (Paket 4, 25.09.2026): Suche und Kopie in allen fünf
 * Bibliotheken, mehrere Dateien in einen Ordner, Lösungswahl in allen Programmen.
 */

describe('Suche in den Bibliotheken', () => {
  const blatt = ['Bruchrechnen', 'Brüche addieren', 'Mathematik', 'Klasse 6', 6]

  it('findet über Name, Thema, Fach und Jahrgang – in beliebiger Reihenfolge', () => {
    expect(passtZurSuche(blatt, 'mathe 6')).toBe(true)
    expect(passtZurSuche(blatt, 'klasse 6 brüche')).toBe(true)
    expect(passtZurSuche(blatt, 'BRUCH')).toBe(true)
  })

  it('verlangt jedes Wort – ein Treffer in nur einem Wort reicht nicht', () => {
    expect(passtZurSuche(blatt, 'mathe 7')).toBe(false)
    expect(passtZurSuche(blatt, 'englisch')).toBe(false)
  })

  it('zeigt ohne Eingabe alles', () => {
    expect(passtZurSuche(blatt, '   ')).toBe(true)
  })

  it('stolpert nicht über leere Felder', () => {
    expect(passtZurSuche(['Test', undefined, null, ''], 'test')).toBe(true)
  })
})

describe('Kopie anlegen', () => {
  it('hängt „(Kopie)" an und zählt bei der Kopie einer Kopie weiter', () => {
    expect(kopieName('Bruchrechnen')).toBe('Bruchrechnen (Kopie)')
    expect(kopieName('Bruchrechnen (Kopie)')).toBe('Bruchrechnen (Kopie 2)')
    expect(kopieName('Bruchrechnen (Kopie 2)')).toBe('Bruchrechnen (Kopie 3)')
  })
})

describe('Mehrere Dateien in einen Ordner', () => {
  it('überschreibt nie stumm, sondern hängt „(2)", „(3)" an', () => {
    /*
     * Ohne Speichern-Dialog fehlt die Rückfrage von Windows „Datei ersetzen?". Die Fassung von
     * letzter Woche soll nicht still verschwinden.
     */
    const da = new Set(['Blatt.pdf', 'Blatt (2).pdf'])
    expect(freierDateiname('Neu.pdf', (n) => da.has(n))).toBe('Neu.pdf')
    expect(freierDateiname('Blatt.pdf', (n) => da.has(n))).toBe('Blatt (3).pdf')
  })

  it('setzt die Nummer vor die Endung, auch bei Punkten im Namen', () => {
    const da = new Set(['Englisch - Unit 2.1 - Lösungen.docx'])
    expect(freierDateiname('Englisch - Unit 2.1 - Lösungen.docx', (n) => da.has(n))).toBe('Englisch - Unit 2.1 - Lösungen (2).docx')
  })
})

describe('Lösungswahl beim Ausgeben', () => {
  const speicher = new Map<string, string>()
  const localStorage = {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => void speicher.set(k, v)
  }
  afterEach(() => {
    speicher.clear()
    vi.unstubAllGlobals()
  })

  it('schlägt beim ersten Mal „als eigene Datei" vor – ohne Lösungen im Dokument „ohne"', () => {
    vi.stubGlobal('localStorage', localStorage)
    expect(loesungsVorgabe('lernzielkontrolle', true)).toBe('separate')
    expect(loesungsVorgabe('lernzielkontrolle', false)).toBe('none')
  })

  it('merkt die letzte Wahl je Programm', () => {
    vi.stubGlobal('localStorage', localStorage)
    merkeLoesungsWahl('grammatiktest', 'append')
    expect(loesungsVorgabe('grammatiktest', true)).toBe('append')
    // Ein anderes Programm bleibt bei seiner eigenen Vorgabe
    expect(loesungsVorgabe('klassenarbeit', true)).toBe('separate')
  })

  it('kommt ohne lokalen Speicher aus', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(loesungsVorgabe('arbeitsblatt', true)).toBe('separate')
    expect(() => merkeLoesungsWahl('arbeitsblatt', 'none')).not.toThrow()
  })

  it('bietet beim Drucken „separat drucken" statt einer Datei an', () => {
    expect(loesungsTexte('print').separate).toBe('Lösungen separat drucken')
    expect(loesungsTexte('pdf').separate).toBe('Lösungen als eigene Datei')
  })

  it('sagt bei der Klassenarbeit „Erwartungshorizont"', () => {
    const t = loesungsTexte('docx', true)
    expect(Object.values(t).every((x) => x.includes('Erwartungshorizont'))).toBe(true)
  })
})
