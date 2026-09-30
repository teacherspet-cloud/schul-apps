import { describe, expect, it } from 'vitest'
import { nachweisFuer } from '../src/renderer/src/modules/klassenarbeit/model/nachweise'
import { schulformVon } from '../src/shared/schulformen'

/*
 * Klassenarbeitsregeln der neuen Schulformen (30.09.2026, Audit Länder/Schulformen/Fächer):
 * eigens belegt statt „Bezugsform, nicht gesichert".
 * - BY Wirtschaftsschule: WSO §§ 12, 13 (Fassung 01.07.2026)
 * - BY FOS/BOS: FOBOSO §§ 14, 15, 18 und Anlage 3 (Fassung 19.06.2026)
 * - NI KGS: RdErl. vom 01.06.2023 Nr. 7.4–7.6
 * - HE KGS, Mittelstufenschule, Förderstufe: VOGSV Anlage 2 Nr. 7.1 (schulformübergreifend)
 */
const n = (stateId: string, schoolTypeId: string, subjectId: string, grade: number) => nachweisFuer({ stateId, schoolTypeId, subjectId, grade })

describe('Bayern, Wirtschaftsschule (WSO)', () => {
  it('Schulaufgaben in den Prüfungsfächern und Ökonomischer Bildung, mindestens 3', () => {
    for (const fach of ['deutsch', 'englisch', 'mathematik', 'wirtschaft']) {
      const r = n('BY', 'wirtschaftsschule', fach, 8)
      expect(r.bezeichnung, fach).toBe('Schulaufgabe')
      expect(r.anzahl, fach).toBe('mindestens 3 im Schuljahr')
      expect(r.quelle).toMatch(/^WSO/)
      expect(r.nichtGesichert).toBeFalsy()
    }
    expect(n('BY', 'wirtschaftsschule', 'mathematik', 9).anzahl).toMatch(/mindestens 2/)
  })

  it('Vorklasse ohne Schulaufgaben in Ökonomischer Bildung; übrige Fächer nach Lehrerkonferenz', () => {
    expect(n('BY', 'wirtschaftsschule', 'wirtschaft', 6).bezeichnung).toBe('Kurzarbeit')
    const ge = n('BY', 'wirtschaftsschule', 'geschichte', 8)
    expect(ge.bezeichnung).toBe('Kurzarbeit')
    expect(ge.anzahl).toMatch(/Lehrerkonferenz/)
  })

  it('Jahrgangsspanne 6–11 (Vorklasse bis zweistufige Form)', () => {
    const s = schulformVon('BY', 'wirtschaftsschule')!
    expect([s.von, s.bis]).toEqual([6, 11])
    expect(s.nichtGesichert).toBeFalsy()
  })
})

describe('Bayern, FOS/BOS (FOBOSO)', () => {
  it('Deutsch, Englisch, Mathematik: eine Schulaufgabe je Halbjahr – nicht die GSO des Gymnasiums', () => {
    for (const [form, grade] of [
      ['fos', 11],
      ['fos', 12],
      ['bos', 13]
    ] as const) {
      const r = n('BY', form, 'englisch', grade)
      expect(r.bezeichnung).toBe('Schulaufgabe')
      expect(r.anzahl).toMatch(/^1 je Schulhalbjahr/)
      expect(r.quelle).toMatch(/^FOBOSO/)
      expect(r.nichtGesichert).toBeFalsy()
    }
  })

  it('Profilfach 1 nur je Ausbildungsrichtung; zweite Fremdsprache ab 12; sonst keine Schulaufgaben', () => {
    expect(n('BY', 'fos', 'physik', 11).anzahl).toMatch(/Profilfach 1 \(Ausbildungsrichtung Technik\)/)
    expect(n('BY', 'fos', 'franzoesisch', 12).bezeichnung).toBe('Schulaufgabe')
    expect(n('BY', 'fos', 'franzoesisch', 11).bezeichnung).toBe('Kurzarbeit')
    const ge = n('BY', 'bos', 'geschichte', 12)
    expect(ge.keineKlassenarbeit).toBe(true)
    expect(ge.hinweis).toMatch(/Stegreifaufgabe höchstens 20 min/)
  })
})

describe('Niedersachsen, Kooperative Gesamtschule (KGS-Erlass 2023)', () => {
  it('Zahl nach Wochenstunden, Dauer nach Jahrgang', () => {
    const d = n('NI', 'kooperative-gesamtschule', 'deutsch', 9)
    expect(d.bezeichnung).toBe('Klassenarbeit')
    expect(d.anzahl).toMatch(/vierstündig 4–6/)
    expect(d.dauer).toBe('höchstens drei Unterrichtsstunden')
    expect(d.quelle).toMatch(/Kooperativen Gesamtschule/)
    expect(d.nichtGesichert).toBeFalsy()
    expect(n('NI', 'kooperative-gesamtschule', 'englisch', 5).dauer).toBe('höchstens eine Unterrichtsstunde')
    expect(n('NI', 'kooperative-gesamtschule', 'englisch', 7).hinweis).toMatch(/Sprechens/)
    expect(n('NI', 'kooperative-gesamtschule', 'geschichte', 7).bezeichnung).toBe('schriftliche Lernkontrolle')
    expect(n('NI', 'kooperative-gesamtschule', 'sport', 7).keineKlassenarbeit).toBe(true)
  })

  it('Oberstufe der KGS: Klausur', () => {
    expect(n('NI', 'kooperative-gesamtschule', 'deutsch', 12).bezeichnung).toBe('Klausur')
  })
})

describe('Hessen: KGS, Mittelstufenschule, Förderstufe (VOGSV)', () => {
  it('dieselben Zahlen wie in den übrigen Schulformen, ohne „nicht gesichert"', () => {
    for (const form of ['kooperative-gesamtschule', 'mittelstufenschule', 'foerderstufe']) {
      const r = n('HE', form, 'mathematik', 6)
      expect(r.bezeichnung, form).toBe('Klassenarbeit')
      expect(r.anzahl).toBe(n('HE', 'realschule', 'mathematik', 6).anzahl)
      expect(r.nichtGesichert, form).toBeFalsy()
      expect(r.hinweis).toMatch(/schulformübergreifend/)
    }
  })
})

describe('Übrige neue Schulformen bleiben bei der Bezugsform', () => {
  it('berufliches Gymnasium, MV-KGS, SN-Gemeinschaftsschule: „nicht gesichert"', () => {
    expect(n('HE', 'berufliches-gymnasium', 'deutsch', 12).nichtGesichert).toBe(true)
    expect(n('MV', 'kooperative-gesamtschule', 'deutsch', 7).nichtGesichert).toBe(true)
    expect(n('SN', 'gemeinschaftsschule', 'deutsch', 7).nichtGesichert).toBe(true)
  })

  it('SN Gemeinschaftsschule: Spanne 1–12 nach SächsSchulG § 7a', () => {
    const s = schulformVon('SN', 'gemeinschaftsschule')!
    expect([s.von, s.bis]).toEqual([1, 12])
    expect(s.nichtGesichert).toBeFalsy()
  })
})
