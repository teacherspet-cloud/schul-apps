import { describe, expect, it } from 'vitest'
import { WORTZAHL_GRUND, wortzahlErlaubt } from '../src/renderer/src/modules/klassenarbeit/model/examRules'
import { worksheetMetaFor } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import { presetDesigns } from '../src/shared/design'
import { writingWords } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { Exam } from '../src/renderer/src/modules/klassenarbeit/model/types'

const arbeit = (stateId: string, subjectId: 'englisch' | 'geschichte', wordLimit?: boolean): Exam => ({
  version: 1,
  meta: {
    ...defaultExamMeta(stateId, 'integrierte-gesamtschule', 'Integrierte Gesamtschule', 10),
    subjectId,
    subjectLabel: subjectId === 'englisch' ? 'Englisch' : 'Geschichte',
    wordLimit
  },
  design: presetDesigns()[0],
  parts: [],
  createdAt: '2026-09-23'
})

describe('Niedersachsen: keine Wortzahl in Klassenarbeiten', () => {
  /*
   * Angabe der Lehrkraft (23.09.2026): In Niedersachsen dürfen in den Fremdsprachen bei
   * Schreib- und Sprachmittlungsaufgaben in Klassenarbeiten keine Wortzahlen mehr
   * vorgegeben werden. Die App erzwingt das, statt nur zu warnen – eine Wortzahl auf dem
   * ausgeteilten Blatt ließe sich nicht mehr zurücknehmen.
   */
  it('verbietet die Wortzahl in Englisch', () => {
    expect(wortzahlErlaubt('NI', 'englisch')).toBe(false)
  })

  it('lässt sie in anderen Ländern und Fächern zu', () => {
    expect(wortzahlErlaubt('NW', 'englisch')).toBe(true)
    expect(wortzahlErlaubt('BY', 'englisch')).toBe(true)
    expect(wortzahlErlaubt('NI', 'geschichte')).toBe(true)
  })

  it('setzt die Wortvorgabe auch dann ab, wenn sie in der Arbeit gespeichert ist', () => {
    /*
     * Der entscheidende Fall: eine ältere Arbeit, die mit eingeschalteter Wortvorgabe
     * gespeichert wurde. Beim erneuten Erzeugen darf sie keine Wortzahl mehr nennen –
     * sonst hinge die Landesvorgabe allein an der Oberfläche.
     */
    expect(worksheetMetaFor(arbeit('NI', 'englisch', true)).wordLimit).toBe(false)
  })

  it('lässt die Wortvorgabe dort stehen, wo sie erlaubt ist', () => {
    expect(worksheetMetaFor(arbeit('NW', 'englisch', true)).wordLimit).toBe(true)
    expect(worksheetMetaFor(arbeit('NW', 'englisch', false)).wordLimit).toBe(false)
  })

  it('nennt den Grund, damit die Oberfläche ihn zeigen kann', () => {
    expect(WORTZAHL_GRUND).toMatch(/Niedersachsen/)
    expect(WORTZAHL_GRUND).toMatch(/Schreibraum und Erwartungshorizont/)
  })
})

describe('Umfang des Schülertextes', () => {
  const blatt = (patch: Record<string, unknown> = {}) => ({
    ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
    subjectId: 'englisch',
    subjectLabel: 'Englisch',
    grade: 10,
    ...patch
  })

  it('folgt ohne Vorgabe dem GER-Niveau', () => {
    expect(writingWords(blatt({ cefrLevel: 'A2' }))).toBe(90)
    expect(writingWords(blatt({ cefrLevel: 'B1' }))).toBe(140)
  })

  it('nimmt die Vorgabe der Lehrkraft', () => {
    /*
     * B1 ergibt automatisch 140 Wörter. Eine Abschlussaufgabe der Klasse 10 verlangt aber
     * eher 250–300 – dafür gibt es jetzt einen eigenen Regler.
     */
    expect(writingWords(blatt({ cefrLevel: 'B1', studentWords: 275 }))).toBe(275)
  })

  it('fällt bei 0 auf den Wert des Niveaus zurück', () => {
    expect(writingWords(blatt({ cefrLevel: 'B1', studentWords: 0 }))).toBe(140)
  })
})
