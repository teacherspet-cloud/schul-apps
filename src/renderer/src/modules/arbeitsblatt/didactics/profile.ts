import type { CefrLevel } from '@shared/types'
import { AfbMix, AgeBand, ageBandForGrade, SelfAssessmentFormat } from './ageBands'
import { foreignLanguageRules, LanguageMode, languageModeRules, modeMaxSentenceWords, needsLargeType } from './language'
import { operatorsFor, OperatorList } from './operators'
import { CourseLevel, profileForCourseLevel, SCHOOL_PROFILES, SchoolProfile, schoolProfileFor } from './schoolProfiles'
import { stateInfo } from './states'
import { subjectById } from '../model/subjects'

export interface LearnerInput {
  stateId: string
  schoolTypeId: string
  schoolTypeName: string
  grade: number
  courseLevel: CourseLevel
  subjectId: string
  subjectLabel: string
  languageMode: LanguageMode
  cefrLevel?: CefrLevel
  instructionsInGerman?: boolean
}

/** Von der Lehrkraft überschreibbare Werte */
export interface ProfileOverrides {
  afbMix?: AfbMix
  fontPt?: number
  scaffolding?: AgeBand['scaffolding']
}

export interface LearnerProfile {
  grade: number
  stage: 'primar' | 'sek1' | 'sek2'
  ageBand: AgeBand
  schoolProfile: SchoolProfile
  /** Profil, das die Anforderungen bestimmt (bei Kursniveau z. B. Hauptschule für G-Kurs) */
  effectiveProfile: SchoolProfile
  targetDegree: string
  curriculumName: string
  gymnasiumTiming: string
  afbMix: AfbMix
  operators: OperatorList
  typography: { fontPt: number; lineHeight: number }
  language: { avgSentenceWords: number; maxSentenceWords: number; lixMax: number }
  tasks: { perPage: [number, number]; minutes: [number, number]; exampleFirst: boolean; instructionSymbols: boolean; formats: string }
  scaffolding: AgeBand['scaffolding']
  selfAssessment: SelfAssessmentFormat
  suggestDifferentiation: boolean
  topicTimingHint: string
  promptRules: string[]
  summary: string[]
  /** Dieselben Angaben wie `summary`, gegliedert für die Anzeige im Formular (Paket 7) */
  kennwerte: ProfilGruppe[]
  /** Orientierung an Bildungsstandards und Lehrplan – steht in der Anzeige hinter „Mehr" */
  orientierung: string
}

/** Eine Gruppe der Profilanzeige: kurze Kennwerte als Chips, dazu ein erläuternder Satz */
export interface ProfilGruppe {
  titel: 'Lerngruppe' | 'Anforderungen' | 'Schrift & Satz' | 'Aufgaben & Hilfen'
  werte: { text: string; angepasst?: boolean }[]
  hinweis?: string
}

export const clampMix = (mix: AfbMix): AfbMix => {
  const I = Math.max(0, mix.I)
  const III = Math.max(0, mix.III)
  const II = Math.max(0, 100 - I - III)
  return { I, II, III }
}

/*
 * Die drei Regeln, die eine Schwierigkeitsstufe verschiebt (didactics/schwierigkeit.ts). Als
 * eigene Funktionen, damit `profilFuerStufe` genau diese Sätze im fertigen Profil erkennt und
 * durch die Fassung mit den verschobenen Werten ersetzt.
 */
export const afbRegel = (afbMix: AfbMix): string =>
  `Verteile die Aufgaben auf die Anforderungsbereiche mit ungefähr ${afbMix.I} % AFB I, ${afbMix.II} % AFB II und ${afbMix.III} % AFB III (±10 %). Der Schwerpunkt liegt auf AFB II; differenziere nach unten über Komplexität, Textmenge, Hilfen und Kontextnähe, nicht durch Weglassen von AFB III.`

export const spracheRegel = (language: LearnerProfile['language']): string =>
  `Sprache: durchschnittlich etwa ${language.avgSentenceWords} Wörter pro Satz, höchstens ${language.maxSentenceWords}; Lesbarkeitsindex LIX höchstens ${language.lixMax}.`

export const hilfenRegel = (scaffolding: AgeBand['scaffolding']): string =>
  scaffolding === 'hoch'
    ? 'Hilfen: umfangreich (Wortspeicher, Satzanfänge, Teilschritte, gestufte Hilfekarten).'
    : scaffolding === 'mittel'
      ? 'Hilfen: gezielt (Tipp-Kästen oder Hilfekarten zu den schwierigeren Aufgaben).'
      : 'Hilfen: nur optional, da ausführliche Anleitungen fortgeschrittene Lernende behindern.'

export function stageForGrade(grade: number, schoolTypeId: string): LearnerProfile['stage'] {
  if (schoolTypeId === 'grundschule') return 'primar'
  if (grade <= 4) return 'primar'
  return grade >= 11 ? 'sek2' : 'sek1'
}

const SELF_ASSESSMENT_LABEL: Record<SelfAssessmentFormat, string> = {
  smileys: 'Selbsteinschätzung mit drei Smileys',
  ichKannSmileys: 'Ich-kann-Sätze mit Smileys',
  ichKann: 'Ich-kann-Checkliste',
  kompetenzraster: 'Kompetenzraster',
  erwartungshorizont: 'Erwartungshorizont / Bewertungsraster'
}

/**
 * Berechnet regelbasiert das Lerngruppen-Profil aus Jahrgang, Schulform, Bundesland und Sprachniveau.
 * Grundlage: KMK-Bildungsstandards, Lesbarkeitsforschung, Differenzierungs- und Sprachbildungsdidaktik.
 */
export function buildLearnerProfile(input: LearnerInput, overrides: ProfileOverrides = {}): LearnerProfile {
  const state = stateInfo(input.stateId)
  const subject = subjectById(input.subjectId)
  const stage = stageForGrade(input.grade, input.schoolTypeId)
  // In Berlin/Brandenburg gehören Kl. 5–6 zur Grundschule: dort Grundschulformate beibehalten
  const bandGrade = input.schoolTypeId === 'grundschule' && input.grade > 4 ? 4 : input.grade
  const ageBand = ageBandForGrade(bandGrade)
  const schoolProfile = schoolProfileFor(input.schoolTypeId)
  const courseProfileId = schoolProfile.id === 'integriert' || input.schoolTypeId === 'realschule' ? profileForCourseLevel(input.courseLevel) : null
  const effectiveProfile = courseProfileId ? SCHOOL_PROFILES[courseProfileId] : schoolProfile
  const foerder = schoolProfile.id === 'foerderLernen'

  // Anforderungsbereiche: Altersband + Verschiebung der Schulform; Förderschule wie Kl. 1–2
  let afbMix: AfbMix = foerder ? { I: 60, II: 35, III: 5 } : { ...ageBand.afbMix }
  if (!foerder && stage !== 'primar') {
    afbMix = clampMix({
      I: afbMix.I + (effectiveProfile.afbShift.I ?? 0),
      II: afbMix.II,
      III: afbMix.III + (effectiveProfile.afbShift.III ?? 0)
    })
  }
  if (overrides.afbMix) afbMix = clampMix(overrides.afbMix)

  // Typografie
  const largeType = foerder || needsLargeType(input.languageMode)
  const typography = {
    fontPt: overrides.fontPt ?? (largeType ? Math.max(14, ageBand.typography.fontPt) : ageBand.typography.fontPt),
    lineHeight: largeType ? Math.max(1.5, ageBand.typography.lineHeight) : ageBand.typography.lineHeight
  }

  // Sprache
  const modeMax = subject.foreignLanguage ? null : modeMaxSentenceWords(input.languageMode)
  const language = {
    avgSentenceWords: modeMax ? Math.min(ageBand.language.avgSentenceWords, modeMax - 3) : ageBand.language.avgSentenceWords,
    maxSentenceWords: modeMax ? Math.min(ageBand.language.maxSentenceWords, modeMax) : ageBand.language.maxSentenceWords,
    lixMax: modeMax ? Math.min(ageBand.language.lixMax, 35) : ageBand.language.lixMax
  }

  const scaffolding: AgeBand['scaffolding'] =
    overrides.scaffolding ??
    (foerder || effectiveProfile.id === 'hauptschule'
      ? 'hoch'
      : effectiveProfile.id === 'gymnasium' && ageBand.scaffolding === 'mittel'
        ? 'gering'
        : ageBand.scaffolding)

  const operators = operatorsFor(stage, input.grade)
  const suggestDifferentiation = schoolProfile.id === 'integriert' && input.courseLevel === 'mixed'

  const gymTiming =
    input.schoolTypeId === 'gymnasium'
      ? state.gymnasium === 'G8'
        ? 'G8 (Abitur nach Kl. 12): Themen liegen oft etwa ein Jahr früher als in G9-Ländern.'
        : state.gymnasium === 'G9'
          ? 'G9 (Abitur nach Kl. 13).'
          : 'G9 im Aufbau: je nach Jahrgang noch G8-Zeitplan.'
      : ''
  const spanFrom = input.schoolTypeId === 'gymnasium' && state.gymnasium === 'G8' ? input.grade - 1 : input.grade
  const topicTimingHint = `typischerweise Klasse ${Math.max(1, spanFrom)}–${input.grade + 1}`

  const targetDegree = courseProfileId ? `${effectiveProfile.targetDegree} (Kursniveau)` : schoolProfile.targetDegree

  // ---------- Regeln für die KI ----------
  const rules: string[] = []
  rules.push(
    `Lerngruppe: Klasse ${input.grade}, ${input.schoolTypeName} in ${state.name}${courseProfileId ? `, Kursniveau ${input.courseLevel.replace('BB-', 'Niveaustufe ')}` : ''}. Abschlussorientierung: ${targetDegree}.`
  )
  rules.push(
    `Orientiere dich an den KMK-Bildungsstandards und an typischen Inhalten des ${state.curriculumName}s (${state.name}) für diese Lerngruppe (${topicTimingHint}). Zitiere keine Lehrplanstellen, Kapitel- oder Kompetenznummern. Passt das Thema nicht gut zum Jahrgang, gib dazu einen Hinweis im Feld „teacherNote“.`
  )
  if (gymTiming) rules.push(gymTiming)
  rules.push(afbRegel(afbMix))
  if (stage === 'primar') {
    rules.push(
      `Nutze kindgerechte Handlungsverben: ${[...operators.I, ...operators.II].join(', ')}. Abstrakte Operatoren (z. B. erörtern, analysieren) sind nicht erlaubt.`
    )
  } else {
    rules.push(
      `Beginne jede (Teil-)Aufgabe mit einem Operator in **Fettschrift**. Geeignete Operatoren – AFB I: ${operators.I.join(', ')}; AFB II: ${operators.II.join(', ')}; AFB III: ${operators.III.join(', ')}. Ordne jeder Aufgabe ihren Anforderungsbereich begründet zu (die Zuordnung ist fachspezifisch).`
    )
  }
  rules.push(spracheRegel(language))
  rules.push(
    `Umfang: ${ageBand.tasksPerPage[0]}–${ageBand.tasksPerPage[1]} Aufgaben pro Seite, etwa ${ageBand.minutesPerTask[0]}–${ageBand.minutesPerTask[1]} Minuten pro Aufgabe. Aufgabenformate: ${ageBand.formats}.`
  )
  if (ageBand.exampleFirst || foerder || effectiveProfile.id === 'hauptschule') rules.push('Stelle bei Übungsaufgaben ein gelöstes Beispiel an den Anfang.')
  if (ageBand.instructionSymbols) rules.push('Jede Arbeitsanweisung enthält nur eine Handlung.')
  rules.push(hilfenRegel(scaffolding))
  rules.push(...effectiveProfile.rules)
  if (effectiveProfile !== schoolProfile) rules.push(...schoolProfile.rules)
  if (subject.foreignLanguage && input.cefrLevel) {
    rules.push(...foreignLanguageRules(subject.label, input.cefrLevel, Boolean(input.instructionsInGerman)))
  } else {
    rules.push(...languageModeRules(foerder && input.languageMode === 'standard' ? 'simple' : input.languageMode))
  }
  rules.push(`Selbsteinschätzung am Ende: ${SELF_ASSESSMENT_LABEL[ageBand.selfAssessment]}.`)
  rules.push(
    'Gestaltung: nur Fettdruck zur Hervorhebung, keine Kursivschrift, keine Blöcke in Großbuchstaben; Informationen nie nur über Farbe; zu jedem Bild eine kurze Beschreibung (Alternativtext).'
  )
  if (suggestDifferentiation) rules.push('Die Lerngruppe ist gemischt: Plane Aufgaben mit niedrigschwelligem Einstieg und optionaler Vertiefung.')

  // ---------- Zusammenfassung für die Anzeige ----------
  const summary = [
    `Klasse ${input.grade} · ${input.schoolTypeName} · ${state.name}${courseProfileId ? ` · ${input.courseLevel.replace('BB-', 'Niveaustufe ')}` : ''}`,
    `Abschlussorientierung: ${targetDegree}${gymTiming ? ` · ${gymTiming}` : ''}`,
    `Anforderungsbereiche ca. ${afbMix.I} / ${afbMix.II} / ${afbMix.III} % (I / II / III)`,
    `Schrift ${typography.fontPt.toString().replace('.', ',')} pt, Zeilenabstand ${typography.lineHeight.toString().replace('.', ',')} · Sätze ≈ ${Math.round(language.avgSentenceWords)} Wörter · LIX ≤ ${language.lixMax}`,
    `${ageBand.tasksPerPage[0]}–${ageBand.tasksPerPage[1]} Aufgaben pro Seite · Hilfen: ${scaffolding}`,
    stage === 'primar'
      ? `Handlungsverben: ${operators.I.slice(0, 5).join(', ')} …`
      : `Operatoren z. B.: ${[operators.I[0], operators.II[0], operators.II[2], operators.III[0]].join(', ')} …`,
    `Orientierung: KMK-Bildungsstandards und ${state.curriculumName} (${topicTimingHint}) – bitte mit dem schulinternen Curriculum abgleichen.`,
    ...(suggestDifferentiation ? ['Gemischte Lerngruppe: Differenzierung in 2–3 Niveaustufen empfohlen (★ = G, ★★ = M, ★★★ = E).'] : [])
  ]

  /*
   * Gegliederte Anzeige (Paket 7, Wunsch der Lehrkraft): Die Aufzählung war eine lange grüne
   * Liste. Jetzt kurze Kennwerte in vier Gruppen – inhaltlich dieselben Angaben wie `summary`,
   * nichts fällt weg. Überschriebene Werte sind markiert, damit man sieht, was von Hand kommt.
   */
  const hilfenText = scaffolding === 'hoch' ? 'umfangreich' : scaffolding === 'mittel' ? 'gezielt' : 'nur optional'
  const kennwerte: ProfilGruppe[] = [
    {
      titel: 'Lerngruppe',
      werte: [
        { text: `Klasse ${input.grade}` },
        { text: input.schoolTypeName },
        { text: state.name },
        ...(courseProfileId ? [{ text: input.courseLevel.replace('BB-', 'Niveaustufe ') }] : [])
      ],
      hinweis: `Abschlussorientierung: ${targetDegree}${gymTiming ? ` · ${gymTiming}` : ''}`
    },
    {
      titel: 'Anforderungen',
      werte: [
        { text: `AFB I ${afbMix.I} %`, angepasst: Boolean(overrides.afbMix) },
        { text: `AFB II ${afbMix.II} %`, angepasst: Boolean(overrides.afbMix) },
        { text: `AFB III ${afbMix.III} %`, angepasst: Boolean(overrides.afbMix) }
      ],
      hinweis:
        stage === 'primar'
          ? `Handlungsverben: ${operators.I.slice(0, 5).join(', ')} …`
          : `Operatoren z. B.: ${[operators.I[0], operators.II[0], operators.II[2], operators.III[0]].join(', ')} …`
    },
    {
      titel: 'Schrift & Satz',
      werte: [
        { text: `Schrift ${typography.fontPt.toString().replace('.', ',')} pt`, angepasst: Boolean(overrides.fontPt) },
        { text: `Zeilenabstand ${typography.lineHeight.toString().replace('.', ',')}` },
        { text: `Sätze ≈ ${Math.round(language.avgSentenceWords)} Wörter` },
        { text: `LIX ≤ ${language.lixMax}` }
      ]
    },
    {
      titel: 'Aufgaben & Hilfen',
      werte: [
        { text: `${ageBand.tasksPerPage[0]}–${ageBand.tasksPerPage[1]} Aufgaben pro Seite` },
        { text: `Hilfen ${hilfenText}`, angepasst: Boolean(overrides.scaffolding) }
      ],
      hinweis: suggestDifferentiation ? 'Gemischte Lerngruppe: Differenzierung in 2–3 Niveaustufen empfohlen (★ = G, ★★ = M, ★★★ = E).' : undefined
    }
  ]
  const orientierung = `Orientierung: KMK-Bildungsstandards und ${state.curriculumName} (${topicTimingHint}) – bitte mit dem schulinternen Curriculum abgleichen.`

  return {
    grade: input.grade,
    stage,
    ageBand,
    schoolProfile,
    effectiveProfile,
    targetDegree,
    curriculumName: state.curriculumName,
    gymnasiumTiming: gymTiming,
    afbMix,
    operators,
    typography,
    language,
    tasks: {
      perPage: ageBand.tasksPerPage,
      minutes: ageBand.minutesPerTask,
      exampleFirst: ageBand.exampleFirst || foerder || effectiveProfile.id === 'hauptschule',
      instructionSymbols: ageBand.instructionSymbols,
      formats: ageBand.formats
    },
    scaffolding,
    selfAssessment: ageBand.selfAssessment,
    suggestDifferentiation,
    topicTimingHint,
    promptRules: rules,
    summary,
    kennwerte,
    orientierung
  }
}
