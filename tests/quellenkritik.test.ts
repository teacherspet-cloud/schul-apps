import { describe, expect, it } from 'vitest'
import { brauchtQuellenkritik, niveaustufe, quellenkritik, quellenkritikRegeln } from '../src/renderer/src/modules/arbeitsblatt/didactics/quellenkritik'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Wunsch der Lehrkraft (25.09.2026): ein Bewertungsmaßstab mit „abstufende[n] Anforderungen je
 * Jahrgang … für die Erwartungshorizonte neuer Materialien, die quellenkritisch eingeleitet
 * werden müssen." Entschieden wurde die feine Stufung nach den Niveaustufen des
 * Rahmenlehrplans Berlin/Brandenburg.
 */
const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'geschichte',
  subjectLabel: 'Geschichte',
  grade: 9,
  ...patch
})

describe('Wann überhaupt quellenkritisch eingeleitet wird', () => {
  it('gilt in Geschichte und Politik', () => {
    expect(brauchtQuellenkritik(meta({ subjectId: 'geschichte' }))).toBe(true)
    expect(brauchtQuellenkritik(meta({ subjectId: 'politik' }))).toBe(true)
  })

  it('gilt nicht in Fächern ohne Quellenarbeit', () => {
    for (const fach of ['mathematik', 'englisch', 'sport', 'kunst']) {
      expect(brauchtQuellenkritik(meta({ subjectId: fach })), fach).toBe(false)
    }
  })

  it('gilt nicht unterhalb von Klasse 5', () => {
    // Dort gibt es das Fach Geschichte in der Regel noch nicht
    expect(brauchtQuellenkritik(meta({ grade: 4 }))).toBe(false)
    expect(brauchtQuellenkritik(meta({ grade: 5 }))).toBe(true)
  })
})

describe('Die Stufe hängt an Jahrgang UND Schulform', () => {
  /*
   * Rahmenlehrplan Berlin/Brandenburg, Teil C Geschichte (10.11.2015). Am Gymnasium ist jeder
   * Jahrgang einzeln zugeordnet, an integrierten Formen gilt 7–8 → D und 9–10 → D/E.
   */
  it('folgt am Gymnasium der jahrgangsscharfen Zuordnung', () => {
    expect(niveaustufe(meta({ grade: 7 }))).toBe('E')
    expect(niveaustufe(meta({ grade: 8 }))).toBe('F')
    expect(niveaustufe(meta({ grade: 9 }))).toBe('G')
    expect(niveaustufe(meta({ grade: 10 }))).toBe('H')
  })

  it('setzt integrierte Schulformen deutlich niedriger an', () => {
    // Was das Gymnasium in Klasse 7 verlangt (E), ist hier das Ziel von Klasse 10
    const gesamt = (grade: number): WorksheetMeta => meta({ grade, schoolTypeId: 'integrierte-gesamtschule' })
    expect(niveaustufe(gesamt(7))).toBe('D')
    expect(niveaustufe(gesamt(8))).toBe('D')
    expect(niveaustufe(gesamt(9))).toBe('E')
    expect(niveaustufe(gesamt(10))).toBe('E')
  })

  it('führt die Unterstufe und die Oberstufe für alle gleich', () => {
    expect(niveaustufe(meta({ grade: 5 }))).toBe('D')
    expect(niveaustufe(meta({ grade: 6, schoolTypeId: 'hauptschule' }))).toBe('D')
    expect(niveaustufe(meta({ grade: 11 }))).toBe('SekII')
    expect(niveaustufe(meta({ grade: 12, schoolTypeId: 'integrierte-gesamtschule' }))).toBe('SekII')
  })
})

describe('Was auf der jeweiligen Stufe verlangt wird', () => {
  it('fragt in der Unterstufe nur ab, was dasteht', () => {
    const q = quellenkritik(meta({ grade: 5 }))!
    expect(q.tiefe).toBe('ablesen')
    expect(q.bestandteile).toHaveLength(3)
    expect(q.hilfe).toContain('Materialkopf')
  })

  it('führt die Perspektive des Verfassers in Klasse 8 ein', () => {
    // Niveaustufe F: „die Perspektive der Quellenautorin oder des -autors beschreiben"
    const q = quellenkritik(meta({ grade: 8 }))!
    expect(q.stufe).toBe('F')
    expect(q.bestandteile.join(' ')).toContain('Sicht, aus der der Verfasser schreibt')
  })

  it('verlangt die verdeckten Absichten erst in Klasse 10', () => {
    // Niveaustufe H: „die (verdeckten/offenen) Absichten … erklären und beurteilen"
    expect(quellenkritik(meta({ grade: 9 }))!.bestandteile.join(' ')).not.toContain('verdeckten')
    expect(quellenkritik(meta({ grade: 10 }))!.bestandteile.join(' ')).toContain('verdeckten')
  })

  it('steigert die Selbstständigkeit, nicht nur die Menge', () => {
    /*
     * Der Kernbefund der Recherche: Die Progression läuft über Hilfestellung, Tiefe und
     * Darstellung – am klarsten in den Fachanforderungen Schleswig-Holstein ablesbar
     * („auf der Basis von bereitgestellten Informationen" → „größtenteils selbstständig" →
     * „selbstständig").
     */
    expect(quellenkritik(meta({ grade: 5 }))!.hilfe).toContain('Materialkopf')
    expect(quellenkritik(meta({ grade: 10 }))!.hilfe).toBe('keine')
    expect(quellenkritik(meta({ grade: 12 }))!.hilfe).toContain('selbstständig')
  })

  it('erhöht die Punktspanne mit der Stufe', () => {
    const unten = quellenkritik(meta({ grade: 5 }))!.punkte
    const oben = quellenkritik(meta({ grade: 12 }))!.punkte
    expect(unten.bis).toBeLessThan(oben.von)
    // Die Spanne folgt der NRW-Rechnung: Basiswert 2, höchstens das Vierfache
    expect(unten.von).toBeGreaterThanOrEqual(2)
    expect(oben.bis).toBeLessThanOrEqual(8)
  })
})

describe('Was im Prompt landet', () => {
  it('sagt, dass die Einleitung keine eigene Teilaufgabe ist', () => {
    // Die Lehrkraft formuliert: „Fasse das Material nach einer quellenkritischen Einleitung zusammen."
    const text = quellenkritikRegeln(meta())
    expect(text).toContain('KEINE eigene Teilaufgabe')
    expect(text).toContain('den bestimmt der Operator der Aufgabe')
  })

  it('hält den groben Kontext vom Operator „einordnen" getrennt', () => {
    // Ausdrücklicher Hinweis der Lehrkraft (25.09.2026)
    const text = quellenkritikRegeln(meta({ grade: 12 }))
    expect(text).toContain('bleibt GROB')
    expect(text).toContain('ersetzt NICHT den Operator')
  })

  it('unterscheidet Quelle und Darstellung', () => {
    const text = quellenkritikRegeln(meta())
    expect(text).toContain('textbeschreibende Charakterisierung')
    expect(text).toContain('THEMA des Textes')
    // Bei einer Darstellung ist die Frage nach Standortgebundenheit verfehlt
    expect(text).toContain('wird bei einer Darstellung NICHT gefragt')
  })

  it('nennt die Punktspanne der Stufe', () => {
    expect(quellenkritikRegeln(meta({ grade: 5 }))).toContain('2 bis 3 Punkten')
    expect(quellenkritikRegeln(meta({ grade: 12 }))).toContain('6 bis 8 Punkten')
  })

  it('verlangt die Gegenregel zu abweichenden Lösungswegen', () => {
    // Wörtlich in der KMK-EPA und im Leitfaden Schleswig-Holstein
    expect(quellenkritikRegeln(meta())).toContain('sinnvoll und begründet vom Erwartungshorizont abweichen')
  })

  it('unterscheidet Geschichte von den übrigen Fächern', () => {
    // Standortgebundenheit gibt es so nur in Geschichte – in Politik zählt die Interessenbindung
    expect(quellenkritikRegeln(meta({ subjectId: 'geschichte' }))).toContain('Standortgebundenheit')
    expect(quellenkritikRegeln(meta({ subjectId: 'politik' }))).toContain('Interessenbindung')
  })

  it('schweigt in Fächern ohne Quellenarbeit', () => {
    expect(quellenkritikRegeln(meta({ subjectId: 'biologie' }))).toBe('')
  })
})
