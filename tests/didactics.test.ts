import { describe, expect, it } from 'vitest'
import type { CefrTable } from '../src/shared/types'
import levels from '../resources/cefr/levels.json'
import { actualAfbMix, checkAfbMix, checkOperators, checkText, readability } from '../src/renderer/src/modules/arbeitsblatt/didactics/checks'
import { buildLearnerProfile, LearnerInput } from '../src/renderer/src/modules/arbeitsblatt/didactics/profile'
import { courseLevelOptions, FOERDERSCHULE_ID, gradeRange, schoolTypesForState } from '../src/renderer/src/modules/arbeitsblatt/didactics/schoolProfiles'

const table = levels as unknown as CefrTable

const input = (patch: Partial<LearnerInput>): LearnerInput => ({
  stateId: 'NI',
  schoolTypeId: 'gymnasium',
  schoolTypeName: 'Gymnasium',
  grade: 7,
  courseLevel: 'mixed',
  subjectId: 'biologie',
  subjectLabel: 'Biologie',
  languageMode: 'standard',
  ...patch
})

describe('Lerngruppen-Profil', () => {
  it('Grundschule Kl. 2: große Schrift, Handlungsverben, viel AFB I', () => {
    const p = buildLearnerProfile(input({ schoolTypeId: 'grundschule', schoolTypeName: 'Grundschule', grade: 2, subjectId: 'sachunterricht' }))
    expect(p.stage).toBe('primar')
    expect(p.typography.fontPt).toBeGreaterThanOrEqual(16)
    expect(p.afbMix).toEqual({ I: 60, II: 35, III: 5 })
    expect(p.operators.I).toContain('kreise ein')
    expect(p.promptRules.join(' ')).toContain('Abstrakte Operatoren')
    expect(p.selfAssessment).toBe('smileys')
  })

  it('Gymnasium NI Kl. 12: Sek-II-Operatoren, G9, mehr AFB III', () => {
    const p = buildLearnerProfile(input({ grade: 12, subjectId: 'geschichte' }))
    expect(p.stage).toBe('sek2')
    expect(p.operators.III).toContain('erörtern')
    expect(p.gymnasiumTiming).toContain('G9')
    expect(p.afbMix.III).toBe(35)
    expect(p.afbMix.I + p.afbMix.II + p.afbMix.III).toBe(100)
    expect(p.curriculumName).toBe('Kerncurriculum')
  })

  it('Gymnasium Sachsen Kl. 8: G8-Hinweis mit Themenspanne', () => {
    const p = buildLearnerProfile(input({ stateId: 'SN', grade: 8 }))
    expect(p.gymnasiumTiming).toContain('G8')
    expect(p.topicTimingHint).toBe('typischerweise Klasse 7–9')
    expect(p.promptRules.join(' ')).toContain('Lehrplans (Sachsen)')
  })

  it('IGS Niedersachsen Kl. 7 Grundkurs: Abschlussorientierung ESA, kleinschrittig', () => {
    const p = buildLearnerProfile(input({ schoolTypeId: 'integrierte-gesamtschule', schoolTypeName: 'Integrierte Gesamtschule', courseLevel: 'G' }))
    expect(p.schoolProfile.id).toBe('integriert')
    expect(p.effectiveProfile.id).toBe('hauptschule')
    expect(p.targetDegree).toContain('ESA')
    expect(p.scaffolding).toBe('hoch')
    expect(p.afbMix).toEqual({ I: 35, II: 45, III: 20 })
    expect(p.suggestDifferentiation).toBe(false)
  })

  it('gemischte Lerngruppe an integrierter Schulform schlägt Differenzierung vor', () => {
    const p = buildLearnerProfile(input({ schoolTypeId: 'oberschule', schoolTypeName: 'Oberschule' }))
    expect(p.suggestDifferentiation).toBe(true)
    expect(p.summary.join(' ')).toContain('★★★ = E')
  })

  it('BW Gemeinschaftsschule Niveau E verhält sich wie Gymnasium', () => {
    const p = buildLearnerProfile(input({ stateId: 'BW', schoolTypeId: 'gemeinschaftsschule', schoolTypeName: 'Gemeinschaftsschule', courseLevel: 'E' }))
    expect(p.effectiveProfile.id).toBe('gymnasium')
    expect(p.afbMix.III).toBe(30)
  })

  it('Berlin Grundschule Kl. 6 bleibt bei Grundschulformaten', () => {
    const p = buildLearnerProfile(input({ stateId: 'BE', schoolTypeId: 'grundschule', schoolTypeName: 'Grundschule', grade: 6 }))
    expect(p.stage).toBe('primar')
    expect(p.ageBand.id).toBe('k34')
  })

  it('Förderschule: mindestens 14 pt, Einfache Sprache', () => {
    const p = buildLearnerProfile(input({ schoolTypeId: FOERDERSCHULE_ID, schoolTypeName: 'Förderschule', grade: 8 }))
    expect(p.typography.fontPt).toBeGreaterThanOrEqual(14)
    expect(p.typography.lineHeight).toBe(1.5)
    expect(p.promptRules.join(' ')).toContain('Einfacher Sprache')
    expect(p.afbMix.I).toBe(60)
  })

  it('Fremdsprache nutzt das GER-Niveau statt des Sprachmodus', () => {
    const p = buildLearnerProfile(input({ subjectId: 'englisch', subjectLabel: 'Englisch', cefrLevel: 'A2', instructionsInGerman: false }))
    const rules = p.promptRules.join(' ')
    expect(rules).toContain('Niveau A2 (GER)')
    expect(rules).toContain('Beispiel')
  })

  it('Prompt-Regeln verbieten erfundene Lehrplanstellen', () => {
    const rules = buildLearnerProfile(input({})).promptRules.join(' ')
    expect(rules).toContain('Zitiere keine Lehrplanstellen')
    expect(rules).toMatch(/ungefähr \d+ % AFB I/)
  })
})

describe('Jahrgänge und Kursniveaus', () => {
  it('Jahrgangsbereiche passen zu Schulform und Land', () => {
    expect(gradeRange(table, 'NI', 'grundschule')).toEqual({ min: 1, max: 4 })
    expect(gradeRange(table, 'BE', 'grundschule')).toEqual({ min: 1, max: 6 })
    expect(gradeRange(table, 'BB', 'oberschule')).toEqual({ min: 7, max: 10 })
    expect(gradeRange(table, 'NI', 'gymnasium')).toEqual({ min: 5, max: 13 })
    expect(gradeRange(table, 'SN', 'gymnasium').max).toBe(12)
    expect(gradeRange(table, 'BE', 'gymnasium').note).toContain('grundständig')
    expect(gradeRange(table, 'HE', 'hauptschule').max).toBe(9)
  })

  it('Förderschule steht in jedem Land zur Auswahl', () => {
    expect(schoolTypesForState(table, 'HB').map((s) => s.value)).toContain(FOERDERSCHULE_ID)
  })

  it('Kursniveaus nur bei passenden Schulformen, mit Landesbezeichnungen', () => {
    expect(courseLevelOptions('NI', 'gymnasium', 7)).toBeNull()
    expect(courseLevelOptions('BW', 'gemeinschaftsschule', 7)!.map((o) => o.value)).toEqual(['mixed', 'G', 'M', 'E'])
    expect(courseLevelOptions('BW', 'realschule', 7)!.map((o) => o.value)).toEqual(['mixed', 'G', 'M'])
    expect(courseLevelOptions('NW', 'gesamtschule', 8)!.map((o) => o.label)).toContain('Erweiterungskurs (E)')
    const bb = courseLevelOptions('BE', 'integrierte-sekundarschule', 9)!
    expect(bb.find((o) => o.value === 'BB-G')!.label).toContain('typisch für Kl. 9')
  })
})

describe('Automatische didaktische Prüfungen', () => {
  const simple =
    'Der Igel schläft im Winter. Er frisst viele Käfer. Im Herbst sucht er ein Nest. Das Nest ist aus Laub. Dort ist es warm. Im Frühling wacht er auf. Dann hat er großen Hunger. Er sucht Würmer und Schnecken.'
  const hard =
    'Die Photosynthese bezeichnet einen biochemischen Stoffwechselprozess, bei dem Pflanzen unter Verwendung von Lichtenergie aus Kohlenstoffdioxid und Wasser energiereiche organische Verbindungen synthetisieren, wobei Sauerstoff als Nebenprodukt freigesetzt wird. Chlorophyllmoleküle absorbieren dabei insbesondere elektromagnetische Strahlung im blauen und roten Wellenlängenbereich, wodurch Elektronenübertragungsketten innerhalb der Thylakoidmembranen angetrieben werden.'

  it('berechnet den LIX', () => {
    const r = readability(simple)
    expect(r.sentences).toBe(8)
    expect(r.lix).toBeLessThan(30)
    expect(readability(hard).lix).toBeGreaterThan(60)
  })

  it('warnt bei zu schweren Texten für den Jahrgang', () => {
    const p5 = buildLearnerProfile(input({ grade: 5 }))
    expect(checkText(hard, p5, 'Text 1').map((w) => w.kind)).toEqual(['readability', 'sentence'])
    expect(checkText(simple + ' ' + simple, p5, 'Text 2')).toEqual([])
  })

  it('prüft die Mischung der Anforderungsbereiche', () => {
    expect(actualAfbMix(['I', 'I', 'II', 'III'])).toEqual({ I: 50, II: 25, III: 25 })
    expect(checkAfbMix(['I', 'I', 'I', 'I', 'II'], { I: 30, II: 45, III: 25 })[0].message).toContain('weichen vom Soll')
    expect(checkAfbMix(['I', 'II', 'II', 'III'], { I: 30, II: 45, III: 25 })).toEqual([])
  })

  it('meldet zu anspruchsvolle Operatoren', () => {
    const p3 = buildLearnerProfile(input({ schoolTypeId: 'grundschule', schoolTypeName: 'Grundschule', grade: 3 }))
    expect(checkOperators('**Erörtere**, ob Igel Haustiere sein sollten.', p3, 'Aufgabe 2')).toHaveLength(1)
    expect(checkOperators('**Kreise** die Tiere **ein**.', p3, 'Aufgabe 1')).toEqual([])
    const p12 = buildLearnerProfile(input({ grade: 12 }))
    expect(checkOperators('**Erörtern** Sie die These.', p12, 'Aufgabe 3')).toEqual([])
  })
})
