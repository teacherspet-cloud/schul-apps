import { afterEach, describe, expect, it, vi } from 'vitest'

/*
 * Leere Klassenarbeiten in der Bibliothek (08.10.2026).
 *
 * Befund auf dem Server: Mehrfach am Tag (auch nachts) tauchten Einträge „Klassenarbeit Englisch"
 * ohne Titel, ohne Thema und ohne Aufgaben auf, je mit zwei Teilen. Ursache: Im Standardmodus
 * füllt der Rahmenschritt den Aufbau beim Öffnen selbst (FrameStep, `fuelleAufbau`), und
 * `lohntSicherung` hielt schon einen Aufbau für sicherungswürdig. Jede frisch geöffnete – oder
 * nach dem Löschen neu angelegte – Arbeit wurde so automatisch abgelegt.
 */

vi.mock('../src/renderer/src/shared/themenbereiche', () => ({ einsortierenNachSpeichern: async () => undefined }))

const { presetDesigns } = await import('../src/shared/design')
const { defaultExamMeta } = await import('../src/renderer/src/modules/klassenarbeit/model/defaults')
const { lohntSicherung } = await import('../src/renderer/src/modules/klassenarbeit/library')
const { erzeugeBibliothek } = await import('../src/renderer/src/shared/testmodul/bibliothek')
const { useKlassenarbeit } = await import('../src/renderer/src/modules/klassenarbeit/store')
const { examStats, defaultExamName } = await import('../src/renderer/src/modules/klassenarbeit/library')
type Exam = import('../src/renderer/src/modules/klassenarbeit/model/types').Exam
type ExamPart = import('../src/renderer/src/modules/klassenarbeit/model/types').ExamPart

const teil = (formatId: string, extra: Partial<ExamPart> = {}): ExamPart =>
  ({ id: `p-${formatId}`, formatId, label: formatId, competence: '', minutes: 45, points: 20, weight: 50, blocks: [], ...extra }) as ExamPart

/** Wie der Standardmodus sie beim Öffnen anlegt: Fach Englisch, zwei vorgeschlagene Teile, sonst nichts */
const automatischerAufbau = (meta: Partial<Exam['meta']> = {}, parts: ExamPart[] = [teil('reading'), teil('writing')]): Exam =>
  ({
    version: 1,
    meta: { ...defaultExamMeta('NI', 'gymnasium', 'Gymnasium', 8), subjectId: 'englisch', subjectLabel: 'Englisch', ...meta },
    design: presetDesigns()[0],
    parts,
    createdAt: ''
  }) as unknown as Exam

describe('Klassenarbeit: lohnt sich das Sichern?', () => {
  it('ein vom Standardmodus vorgeschlagener Aufbau ohne Titel, Thema und Aufgaben lohnt nicht', () => {
    const exam = automatischerAufbau()
    expect(defaultExamName(exam)).toBe('Klassenarbeit Englisch')
    expect(lohntSicherung(exam)).toBe(false)
    expect(lohntSicherung(automatischerAufbau({}, []))).toBe(false)
    expect(lohntSicherung(null)).toBe(false)
  })

  it('Leerzeichen im Thema oder Titel zählen nicht', () => {
    expect(lohntSicherung(automatischerAufbau({ topic: '   ', title: ' ' }))).toBe(false)
  })

  it('Thema, Titel, Aufgaben oder Vorgaben zu einem Teil lohnen weiterhin – schon als Entwurf', () => {
    expect(lohntSicherung(automatischerAufbau({ topic: 'Australia' }))).toBe(true)
    expect(lohntSicherung(automatischerAufbau({ title: 'Erste Klassenarbeit' }))).toBe(true)
    expect(lohntSicherung(automatischerAufbau({}, [teil('reading', { blocks: [{ id: 'b1' } as ExamPart['blocks'][number]] })]))).toBe(true)
    expect(lohntSicherung(automatischerAufbau({}, [teil('writing', { notes: 'Aufgabe zum past perfect' })]))).toBe(true)
    expect(lohntSicherung(automatischerAufbau({}, [teil('writing', { notes: '  ' })]))).toBe(false)
  })
})

describe('Klassenarbeit: Bibliothek legt keine leere Arbeit ab', () => {
  const gespeichert: string[] = []
  const bib = erzeugeBibliothek({
    store: useKlassenarbeit,
    dokument: (s) => s.exam,
    setzeDokument: (s, d) => s.setExam(d),
    api: {
      save: async (i) => {
        gespeichert.push(i.name)
        return { id: i.id, name: i.name, updatedAt: '2026-10-08T00:00:00.000Z' }
      },
      get: async () => {
        throw new Error('nicht gebraucht')
      }
    },
    stats: examStats,
    standardName: defaultExamName,
    lohntSicherung
  })

  afterEach(() => {
    gespeichert.length = 0
    useKlassenarbeit.getState().reset()
  })

  it('weder Speichern noch „Neu“ (sichereAlles) legt den automatischen Aufbau ab', async () => {
    useKlassenarbeit.getState().setExam(automatischerAufbau())
    await bib.speichern()
    await bib.neuSicher()
    expect(gespeichert).toEqual([])
    expect(useKlassenarbeit.getState().exam).toBeNull()
  })

  it('mit Thema wird wie bisher gespeichert', async () => {
    useKlassenarbeit.getState().setExam(automatischerAufbau({ topic: 'Australia' }))
    await bib.speichern()
    expect(gespeichert).toEqual(['Englisch – Australia'])
  })
})
