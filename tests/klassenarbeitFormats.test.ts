import { describe, expect, it } from 'vitest'
import { EXAM_FORMATS, formatById, formatsFor, suggestParts, writingWeightFor } from '../src/renderer/src/modules/klassenarbeit/model/formats'
import { distribute, examGrades, examWeight } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { curriculumSource, curriculumTopics, hasCurriculum } from '../src/renderer/src/modules/klassenarbeit/model/curriculumGeschichte'
import { examWarnings, gradeScaleLine } from '../src/renderer/src/modules/klassenarbeit/model/examRules'

describe('Formatkatalog für Klassenarbeiten', () => {
  it('kennt Formate für Englisch und Geschichte', () => {
    expect(EXAM_FORMATS.some((f) => f.subject === 'englisch')).toBe(true)
    expect(EXAM_FORMATS.some((f) => f.subject === 'geschichte')).toBe(true)
    // Jedes Format nennt Kompetenzbereich und Anforderungsbereiche
    for (const f of EXAM_FORMATS) {
      expect(f.competence.length).toBeGreaterThan(3)
      expect(f.afb.length).toBeGreaterThan(0)
    }
  })

  it('filtert nach Jahrgang', () => {
    // Sprachmittlung ist erst ab Klasse 6 vorgesehen
    expect(formatsFor('englisch', 5).some((f) => f.id === 'en-mediation')).toBe(false)
    expect(formatsFor('englisch', 8).some((f) => f.id === 'en-mediation')).toBe(true)
    // Vergleich (AFB III) erst in der Mittelstufe
    expect(formatsFor('geschichte', 6).some((f) => f.id === 'ge-comparison')).toBe(false)
    expect(formatsFor('geschichte', 9).some((f) => f.id === 'ge-comparison')).toBe(true)
  })

  it('schlägt in Englisch genau zwei Kompetenzen mit der Gewichtung des Landes vor', () => {
    // Klasse 5: Schreiben 60 %, weitere Kompetenz 40 %
    const kl5 = suggestParts('englisch', 5, 60, 90)
    expect(kl5).toHaveLength(2)
    expect(kl5.find((p) => p.formatId === 'en-writing')?.weight).toBe(60)
    expect(kl5.find((p) => p.gradeGroup === 'other')?.weight).toBe(40)
    // Ab Klasse 6: 70 / 30
    const kl9 = suggestParts('englisch', 9, 60, 90)
    expect(kl9).toHaveLength(2)
    expect(kl9.find((p) => p.formatId === 'en-writing')?.weight).toBe(70)
    expect(kl9.find((p) => p.gradeGroup === 'other')?.formatId).toBe('en-mediation')
    expect(writingWeightFor(5)).toBe(60)
    expect(writingWeightFor(10)).toBe(70)
  })

  it('gibt Lese- und Hörverstehen eigene 21 Punkte', () => {
    // Die Punkte hängen nicht an einer Gesamtpunktzahl: 999 als Vorgabe ändert nichts
    const kl6 = suggestParts('englisch', 6, 999, 90)
    expect(kl6.find((p) => p.formatId === 'en-reading')?.points).toBe(21)
    expect(formatById('en-listening')?.defaultPoints).toBe(21)
    expect(formatById('en-reading')?.defaultPoints).toBe(21)
    // Schreiben und Sprachmittlung werden nicht über Punkte bewertet, sondern über Inhalt und Sprache
    expect(kl6.find((p) => p.formatId === 'en-writing')?.points).toBe(0)
    expect(suggestParts('englisch', 9, 999, 90).find((p) => p.formatId === 'en-mediation')?.points).toBe(0)
  })

  it('teilt produktive Teile in Inhalt und Sprache', () => {
    // Schreiben und Sprachmittlung: 40 % Inhalt, 60 % Sprache
    for (const p of suggestParts('englisch', 9, 60, 90)) expect(p.contentShare).toBe(40)
    // Ein rezeptiver Teil bekommt keine Aufteilung
    expect(suggestParts('englisch', 6, 60, 90).find((p) => p.formatId === 'en-reading')?.contentShare).toBeUndefined()
  })

  it('rechnet die beiden Noten aus den Anteilen', () => {
    const parts = suggestParts('englisch', 9, 60, 90).map((p, i) => ({
      id: `p${i}`,
      formatId: p.formatId,
      label: '',
      competence: '',
      weight: p.weight,
      points: p.points,
      minutes: p.minutes,
      gradeGroup: p.gradeGroup,
      ...(p.contentShare ? { contentShare: p.contentShare } : {}),
      afbMix: { I: 30, II: 45, III: 25 },
      blocks: []
    }))
    const exam = { version: 1, meta: {}, design: {}, parts, createdAt: '' } as unknown as Parameters<typeof examGrades>[0]
    const grades = examGrades(exam)
    expect(grades.map((g) => g.label)).toEqual(['Weitere Kompetenzen', 'Schreiben'])
    expect(grades.find((g) => g.group === 'writing')?.weight).toBe(70)
    const writing = grades.find((g) => g.group === 'writing')!
    // Der Schreibteil hat keine Punkte – die Note kommt aus Inhalt und Sprache
    expect(writing.points).toBe(0)
    expect(writing.content).toBeUndefined()
    expect(examWeight(exam)).toBe(100)
  })

  it('verteilt Zeit genau und in Geschichte auch die Punkte', () => {
    for (const [subject, grade] of [
      ['englisch', 9],
      ['englisch', 6],
      ['geschichte', 9],
      ['geschichte', 6]
    ] as const) {
      const parts = suggestParts(subject, grade, 60, 90)
      expect(parts.length).toBeGreaterThan(1)
      expect(parts.reduce((n, p) => n + p.minutes, 0)).toBe(90)
      expect(parts.reduce((n, p) => n + p.weight, 0)).toBe(100)
      // In Geschichte gibt es eine Note aus der Gesamtpunktzahl
      if (subject === 'geschichte') expect(parts.reduce((n, p) => n + p.points, 0)).toBe(60)
      for (const p of parts) expect(formatById(p.formatId)).toBeTruthy()
    }
  })

  it('schlägt in Englisch ab Klasse 8 Sprachmittlung und Schreiben vor', () => {
    const ids = suggestParts('englisch', 9, 60, 90).map((p) => p.formatId)
    expect(ids).toContain('en-mediation')
    expect(ids).toContain('en-writing')
  })
})

describe('Lehrplanthemen Geschichte', () => {
  it('kennt Themen für die recherchierten Länder', () => {
    for (const state of ['NI', 'NW', 'BY', 'BW', 'HE']) expect(hasCurriculum(state)).toBe(true)
  })

  it('unterscheidet Schulformen und Jahrgänge', () => {
    // NRW Gymnasium: Inhaltsfelder mit Nummer
    const nwGym = curriculumTopics('NW', 'gymnasium', 9)
    expect(nwGym.some((t) => t.code === 'IF 8' && t.label.includes('Nationalsozialismus'))).toBe(true)
    // Erprobungsstufe hat andere Inhaltsfelder
    expect(curriculumTopics('NW', 'gymnasium', 5).some((t) => t.code === 'IF 1')).toBe(true)
    expect(curriculumTopics('NW', 'gymnasium', 5).some((t) => t.code === 'IF 8')).toBe(false)
    // Bayern: Lernbereiche je Einzeljahrgang, Mittelschule liegt vorn
    expect(curriculumTopics('BY', 'gymnasium', 9).some((t) => t.label.includes('Weimarer Republik'))).toBe(true)
    expect(curriculumTopics('BY', 'mittelschule', 8).some((t) => t.label.includes('Weimarer Republik'))).toBe(true)
    // Niedersachsen: Doppeljahrgänge
    expect(curriculumTopics('NI', 'gymnasium', 7).some((t) => t.label.includes('Industrialisierung'))).toBe(true)
  })

  it('markiert Längsschnitte', () => {
    const ni = curriculumTopics('NI', 'gymnasium', 8)
    expect(ni.some((t) => t.structure === 'laengsschnitt' && t.label.includes('Energie'))).toBe(true)
  })

  it('nennt zu jeder Themenliste die Quelle', () => {
    const source = curriculumSource(curriculumTopics('BW', 'gymnasium', 10))
    expect(source?.url).toContain('bildungsplaene-bw.de')
  })

  it('gibt Hessen ohne Jahrgangszuordnung für alle Klassen aus', () => {
    expect(curriculumTopics('HE', 'gymnasium', 5).length).toBeGreaterThan(10)
    expect(curriculumTopics('HE', 'gymnasium', 10).length).toBeGreaterThan(10)
    expect(curriculumTopics('HE', 'gymnasium', 8)[0].gradeLabel).toContain('keinem Jahrgang')
  })
})

describe('Ländervorgaben für Klassenarbeiten', () => {
  it('warnt, dass es in NRW in Geschichte keine Klassenarbeiten gibt', () => {
    expect(examWarnings('NW', 'geschichte', 9, ['ge-source']).some((w) => w.includes('keine Klassenarbeiten'))).toBe(true)
    expect(examWarnings('NI', 'geschichte', 9, ['ge-source'])).toEqual([])
  })

  it('verlangt in NRW einen Schreibteil in jeder Englischarbeit', () => {
    expect(examWarnings('NW', 'englisch', 9, ['en-reading']).some((w) => w.includes('Schreiben Bestandteil jeder Klassenarbeit'))).toBe(true)
    expect(examWarnings('NW', 'englisch', 9, ['en-reading', 'en-writing'])).toEqual([])
  })

  it('meldet in Niedersachsen die isolierte Grammatikprüfung', () => {
    expect(examWarnings('NI', 'englisch', 9, ['en-grammar']).some((w) => w.includes('nicht isoliert'))).toBe(true)
  })
})

describe('Notenschlüssel', () => {
  it('schreibt den Schlüssel als eine Zeile ohne die Sechs', () => {
    // 21 Punkte: 1 ab 91 % = 19,11 → 19; 4 ab 50 % = 10,5 → 11
    const line = gradeScaleLine(21)
    expect(line).toContain('1 ab 19')
    expect(line).toContain('4 ab 11')
    expect(line).not.toContain('6 ab')
  })

  it('folgt eigenen Schwellen, wenn die Lehrkraft welche gesetzt hat', () => {
    expect(gradeScaleLine(100, [95, 80, 65, 50, 25, 0])).toContain('1 ab 95')
  })
})

describe('Die Arbeit prüft genau die eingestellten Punkte', () => {
  it('verteilt Punkte und Minuten ohne Rest auf die Teile', () => {
    // Genau die Fälle, in denen einzelnes Runden danebenliegt
    for (const total of [30, 45, 50, 60, 63, 75, 90, 100]) {
      for (const shares of [
        [30, 70],
        [40, 60],
        [33, 33, 34],
        [25, 25, 50],
        [20, 30, 50],
        [1, 1, 1]
      ]) {
        const parts = distribute(shares, total)
        expect(
          parts.reduce((a, b) => a + b, 0),
          `${total} auf ${shares.join('/')}`
        ).toBe(total)
        expect(parts.every((p) => p >= 0)).toBe(true)
      }
    }
    expect(distribute([], 30)).toEqual([])
    expect(distribute([0, 0], 30)).toEqual([0, 0])
  })

  it('verteilt den Vorschlag für Geschichte genau auf die Gesamtpunktzahl', () => {
    for (const grade of [6, 7, 8, 9, 10]) {
      for (const points of [30, 42, 50, 63]) {
        const parts = suggestParts('geschichte', grade, points, 90)
        expect(
          parts.reduce((n, p) => n + p.points, 0),
          `Kl. ${grade}, ${points} Punkte`
        ).toBe(points)
        expect(parts.reduce((n, p) => n + p.minutes, 0)).toBe(90)
        expect(parts.reduce((n, p) => n + p.weight, 0)).toBe(100)
      }
    }
  })

  it('gibt Lese- und Hörverstehen in Englisch ihre eigenen Punkte', () => {
    const parts = suggestParts('englisch', 7, 0, 90)
    // Der Schreibteil wird nicht über Punkte bewertet, der andere Teil hat 21 Punkte
    expect(parts.find((p) => p.gradeGroup === 'writing')?.points).toBe(0)
    expect(parts.find((p) => p.gradeGroup === 'other')?.points).toBe(21)
    expect(parts.reduce((n, p) => n + p.weight, 0)).toBe(100)
    expect(parts.reduce((n, p) => n + p.minutes, 0)).toBe(90)
  })
})
