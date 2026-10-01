import { describe, expect, it } from 'vitest'
import { presetDesigns } from '../src/shared/design'
import { BESTAND, anlageFuer, laenderImBestand, listenFuer } from '../src/shared/operatoren/zugriff'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { InfoBoxBlock, TaskBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { amtlicheListe, operatorenBlock } from '../src/renderer/src/modules/klassenarbeit/didactics/operatorenliste'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'

/*
 * Gemeinsamer Operatoren-Bestand (Großprogramm 0.4, D3): die amtlichen Listen aller Länder aus
 * der Recherche vom 28.09.2026. Regeln: nur Wortlaut mit Fundstelle; auf die Klausur kommen nur
 * Listen aus Dokumenten des Landes selbst („Immer nur die amtlichen Listen des Landes").
 */
describe('Bestand', () => {
  it('enthält alle 16 Länder und den KMK-Grundstock', () => {
    // Niedersachsen seit 30.09.2026 auch im Bestand (alle Abiturlisten und Kerncurricula)
    expect(laenderImBestand()).toEqual(['BB', 'BE', 'BW', 'BY', 'HB', 'HE', 'HH', 'MV', 'NI', 'NW', 'RP', 'SH', 'SL', 'SN', 'ST', 'TH'])
    expect(BESTAND.KMK).toBeDefined()
  })

  it('jede Liste hat Fundstelle, Stufe, Sprache und Operatoren mit Wortlaut', () => {
    for (const land of Object.values(BESTAND))
      for (const l of land.listen) {
        expect(l.quelle.length, `${land.stateId}: Quelle`).toBeGreaterThan(10)
        // Zwei Dokumente (HH Gesellschaftswissenschaften 2020, TH Festlegungen 2025) haben keine auffindbare Online-Adresse; die Fundstelle steht vollständig im Titel
        expect(l.url, `${land.stateId}: URL`).toMatch(/^(https?:\/\/|$)/)
        expect(['sek1', 'sek2']).toContain(l.stufe)
        expect(['de', 'en', 'fr', 'es', 'it', 'ru']).toContain(l.sprache)
        expect(l.operatoren.length).toBeGreaterThan(0)
        for (const o of l.operatoren) {
          expect(o.operator.trim(), `${land.stateId}: Operator ohne Wortlaut`).not.toBe('')
          if (o.afb) expect(['I', 'II', 'III', 'I–II', 'II–III', 'I–III']).toContain(o.afb)
          // Aufbauspalten der Recherche gehören nicht auf die Klausur
          for (const k of Object.keys(o.zusatz ?? {})) expect(['Operator', 'Seite im IQB-Original', 'Druck', 'Kompetenzbereich']).not.toContain(k)
        }
      }
  })
})

describe('Anlage je Land und Fach', () => {
  it('NRW Englisch: alle Kompetenzbereiche mit illustrierenden Beispielen, zusammengeführt', () => {
    const l = anlageFuer('NW', 'englisch', { sprache: 'en', stufe: 'sek2' })!
    expect(l.sprache).toBe('en')
    const analyse = l.operatoren.find((o) => o.operator === 'analyse')!
    expect(analyse.definition).toBe('describe and explain in detail')
    expect(analyse.beispiele?.[0]).toMatch(/^Analyse the way/)
    expect(new Set(l.operatoren.map((o) => o.kompetenzbereich))).toContain('Sprachmittlung')
    expect(l.quelle).toMatch(/Englisch/)
  })

  it('bilinguales Sachfach bekommt die englische, das deutsche Sachfach die deutsche Liste', () => {
    expect(anlageFuer('NW', 'geschichte', { sprache: 'en' })!.sprache).toBe('en')
    expect(anlageFuer('NW', 'geschichte', { sprache: 'de' })!.sprache).toBe('de')
    expect(listenFuer('NW', 'geschichte', { sprache: 'de' }).every((x) => x.sprache === 'de')).toBe(true)
  })

  it('nur aus Dokumenten des Landes – Verweise auf KMK/IQB/EPA zählen nicht', () => {
    // Berlin verweist für die Oberstufe auf die Bildungsstandards; eigene Liste nur für die Sek I
    expect(anlageFuer('BE', 'englisch', { sprache: 'en', stufe: 'sek2' })).toBeNull()
    expect(anlageFuer('BE', 'geschichte', { stufe: 'sek1' })).not.toBeNull()
    expect(listenFuer('SN', 'geschichte').every((x) => x.belegt === 'volltext')).toBe(true)
  })

  it('Sek I nutzt die Sek-I-Liste, fehlt sie, die der Oberstufe', () => {
    expect(listenFuer('BY', 'geschichte', { stufe: 'sek1' }).every((x) => x.stufe === 'sek1')).toBe(true)
    expect(listenFuer('NW', 'geschichte', { stufe: 'sek1' }).every((x) => x.stufe === 'sek2')).toBe(true)
  })

  it('unbekanntes Land oder Fach: keine Liste', () => {
    expect(anlageFuer('XX', 'englisch')).toBeNull()
    expect(anlageFuer('NW', 'mathematik')).toBeNull()
  })
})

describe('Klausur-Anlage außerhalb Niedersachsens', () => {
  const aufgabe = (instruction: string): TaskBlock => ({
    ...(newBlock('task') as TaskBlock),
    id: `t-${instruction.slice(2, 8)}`,
    instruction,
    operator: '',
    parts: []
  })
  const arbeit = (stateId: string, blocks: TaskBlock[]): Exam =>
    ({
      version: 1,
      meta: {
        ...defaultExamMeta(stateId, 'gymnasium', 'Gymnasium'),
        subjectId: 'englisch',
        subjectLabel: 'Englisch',
        topic: 'Macbeth',
        grade: 12,
        courseLevel: 'eA'
      },
      parts: [
        {
          id: 'p1',
          formatId: 'en-writing',
          label: 'Writing',
          competence: 'Schreiben',
          minutes: 45,
          points: 0,
          weight: 100,
          contentShare: 60,
          blocks
        } as ExamPart
      ],
      design: presetDesigns()[0],
      createdAt: ''
    }) as unknown as Exam

  it('NRW-Klausur Englisch erhält die NRW-Liste – ohne Aufgabenbeispiel', () => {
    const e = arbeit('NW', [aufgabe('**Analyse** the way the atmosphere is created.')])
    expect(amtlicheListe('NW', 'englisch')).not.toBeNull()
    const b = operatorenBlock(e) as InfoBoxBlock
    expect(b.body).toMatch(/\*\*analyse\*\*: describe and explain in detail/)
    // Aufgabenbeispiele sind keine Definitionen – nicht auf dem Schülerblatt (01.10.2026)
    expect(b.body).not.toMatch(/Example/)
    expect(b.body).toMatch(/Source: .*Englisch/)
  })

  it('Niedersachsen bleibt bei der von Hand erfassten Liste', () => {
    expect(amtlicheListe('NI', 'englisch')!.quelle).toMatch(/Niedersächsisches Kultusministerium/)
  })
})
