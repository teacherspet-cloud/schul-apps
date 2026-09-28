import { describe, expect, it } from 'vitest'
import {
  formateFuer,
  geschaetzteMinuten,
  KURZTEST_FORMATE,
  NICHT_ERMITTELT,
  standardFormat,
  standardMinuten,
  zeitWarnung
} from '../src/renderer/src/modules/lernzielkontrolle/didactics/formate'
import { STATES } from '../src/renderer/src/modules/arbeitsblatt/didactics/states'

/*
 * Diese Tests bewachen RECHERCHIERTE DATEN, nicht Rechenlogik. Sie schlagen an, wenn jemand
 * eine Zahl ändert, ohne die Fundstelle mitzuändern – der Fehler, der in einer solchen
 * Tabelle am leichtesten passiert und am schwersten auffällt.
 */
describe('Länderformate des kurzen Leistungsnachweises', () => {
  it('trägt zu jedem Format eine Fundstelle und eine Adresse', () => {
    for (const f of KURZTEST_FORMATE) {
      expect(f.fundstelle, f.id).not.toBe('')
      expect(f.url, f.id).toMatch(/^https?:\/\//)
      expect(f.bezeichnung, f.id).not.toBe('')
    }
  })

  it('nennt nur Länder, die es gibt', () => {
    const ids = STATES.map((s) => s.id)
    for (const f of KURZTEST_FORMATE) expect(ids, f.id).toContain(f.stateId)
    for (const id of NICHT_ERMITTELT) expect(ids).toContain(id)
  })

  it('führt kein Land doppelt in „ermittelt" und „nicht ermittelt"', () => {
    for (const id of NICHT_ERMITTELT) expect(formateFuer(id), id).toEqual([])
  })

  it('kennzeichnet private Spiegel als nicht amtlich', () => {
    /*
     * landesrecht.online und schulgesetz-berlin.de sind private Spiegel. Der Inhalt wirkte
     * konsistent, aber er stammt nicht aus einer amtlichen Verkündung. Wer sich darauf
     * verlässt, soll das wissen.
     */
    for (const f of KURZTEST_FORMATE) {
      const spiegel = /landesrecht\.online|schulgesetz-berlin\.de|smv-bw\.de/.test(f.url)
      expect(f.amtlich, `${f.id} (${f.url})`).toBe(!spiegel)
    }
  })
})

describe('Bayern hat zwei Formate', () => {
  it('unterscheidet Stegreifaufgabe und Kurzarbeit', () => {
    // GSO § 23 Abs. 2: Stegreifaufgabe „soll höchstens 20 Minuten", Kurzarbeit „höchstens 30"
    const [stegreif, kurzarbeit] = ['BY-stegreif', 'BY-kurzarbeit'].map((id) => KURZTEST_FORMATE.find((f) => f.id === id)!)
    expect(stegreif.maxMinuten).toBe(20)
    expect(stegreif.ankuendigung).toBe('unangekuendigt')
    expect(stegreif.stoffStunden).toBe(2)
    expect(kurzarbeit.maxMinuten).toBe(30)
    expect(kurzarbeit.ankuendigung).toBe('pflicht')
    expect(kurzarbeit.stoffStunden).toBe(10)
  })

  it('nimmt die unangekündigte Form als Regelfall', () => {
    expect(standardFormat('BY')?.id).toBe('BY-stegreif')
  })
})

describe('Die Falle in Niedersachsen', () => {
  it('warnt davor, „schriftliche Lernkontrolle" für einen Kurztest zu benutzen', () => {
    /*
     * In Niedersachsen ist die „schriftliche Lernkontrolle" die KLASSENARBEIT
     * (RdErl. MK v. 01.08.2025, Nr. 6.4/6.5). Ein Kurztest, der so heißt, behauptet ein
     * Format, das er nicht ist.
     */
    const ni = standardFormat('NI')!
    expect(ni.bezeichnung).not.toMatch(/schriftliche Lernkontrolle/)
    expect(ni.hinweis).toMatch(/KLASSENARBEIT/)
  })
})

describe('Ankündigungspflicht', () => {
  it('kennt die belegten Fristen', () => {
    const frist = (id: string): number | null => KURZTEST_FORMATE.find((f) => f.id === id)!.fristTage
    expect(frist('HE-lernkontrolle')).toBe(5) // VOGSV § 33 Abs. 1: fünf Unterrichtstage
    expect(frist('MV-lernerfolg')).toBe(3) // LeistBewVO § 8 Abs. 2: drei Unterrichtstage
    expect(frist('RP-ueberpruefung')).toBe(7) // SchulO § 52 Abs. 8: mindestens eine Woche
  })

  it('gibt keine Frist an, wo keine gilt', () => {
    for (const f of KURZTEST_FORMATE) {
      if (f.ankuendigung !== 'pflicht') expect(f.fristTage, f.id).toBeNull()
      // Bremen nennt keine Frist, das Saarland zählt Kalendertage (Feld = Unterrichtstage) – dann steht es im Hinweis
      else if (f.fristTage === null) expect(f.hinweis ?? '', f.id).toMatch(/frist|kalendertage/i)
      else expect(f.fristTage, f.id).toBeGreaterThan(0)
    }
  })
})

describe('Zeitgrenze: warnen, nicht blockieren', () => {
  it('schweigt innerhalb der Grenze', () => {
    expect(zeitWarnung(20, standardFormat('BY'))).toBeNull()
  })

  it('meldet die Überschreitung mit der Fundstelle', () => {
    const w = zeitWarnung(45, standardFormat('BY'))!
    expect(w.ueberschritten).toBe(true)
    expect(w.message).toMatch(/20 Minuten/)
    expect(w.message).toMatch(/GSO/)
  })

  it('sagt ehrlich, wo keine Grenze normiert ist', () => {
    // NRW regelt weder Dauer noch Anzahl – das ist keine Erlaubnis für 45 Minuten,
    // aber die App darf auch keine Zahl erfinden.
    const w = zeitWarnung(45, standardFormat('NW'))!
    expect(w.ueberschritten).toBe(false)
    expect(w.message).toMatch(/keine Höchstdauer normiert/)
  })

  it('schweigt ohne Format', () => {
    expect(zeitWarnung(45, undefined)).toBeNull()
  })
})

describe('Voreinstellungen', () => {
  it('nimmt 20 Minuten, wo nichts anderes belegt ist', () => {
    expect(standardMinuten(undefined)).toBe(20)
    expect(standardMinuten(standardFormat('NW'))).toBe(20)
  })

  it('geht nie über die Landesgrenze hinaus', () => {
    for (const f of KURZTEST_FORMATE) {
      if (f.maxMinuten) expect(standardMinuten(f), f.id).toBeLessThanOrEqual(f.maxMinuten)
    }
  })
})

describe('Zeitschätzung, kalibriert an echten Vorlagen', () => {
  it('bleibt bei den bayerischen Stegreifaufgaben im Rahmen', () => {
    /*
     * GM_STA003: 4 Teilaufgaben mit Rechenweg. GM_STA005: 9 Teilaufgaben ohne.
     * Beide sind für eine 20-Minuten-Stegreifaufgabe gedacht.
     */
    expect(geschaetzteMinuten(4, true)).toBeLessThanOrEqual(20)
    expect(geschaetzteMinuten(9, false)).toBeLessThanOrEqual(20)
  })

  it('erkennt den Umfang aus der Lernzielkontrolle zu den Potenzgesetzen als zu groß', () => {
    // 10 Aufgaben über drei Seiten, mit Rechenweg – das war der Anlass
    expect(geschaetzteMinuten(10, true)).toBeGreaterThan(20)
  })

  it('hat für jedes Land mindestens ein belegtes Format (seit 28.09.2026)', () => {
    for (const land of ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH']) {
      const f = formateFuer(land)
      expect(f.length, land).toBeGreaterThan(0)
      for (const e of f) expect(e.fundstelle && e.url, e.id).toBeTruthy()
    }
    // Die Saarländer „Schriftliche Überprüfung" ist kein Kurztest – das muss dranstehen
    expect(formateFuer('SL').find((e) => e.id === 'SL-schriftliche-ueberpruefung')?.beschreibung).toMatch(/GROSSER Leistungsnachweis/)
  })
})
