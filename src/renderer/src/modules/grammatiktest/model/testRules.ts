/**
 * Was beim Prüfen von Grammatik gilt – und was die Lehrkraft wissen sollte, bevor sie benotet.
 *
 * Der Befund, der die Anlage dieses Programms bestimmt: **Grammatik isoliert zu bewerten ist
 * nicht überall zulässig.**
 * - **Niedersachsen** weist Grammatik im Kerncurriculum Englisch rein funktional aus, nennt
 *   bewusst keine Grammatikbegriffe und bewertet das „Verfügen über sprachliche Mittel" nicht
 *   isoliert. Ein reiner Grammatiktest ist dort eine Übungs- oder Diagnoseform.
 * - **Nordrhein-Westfalen** erlaubt bis zum vierten Lernjahr einen isolierten Grammatikteil,
 *   der eine kommunikative Teilkompetenz ersetzen darf; ab dem fünften Lernjahr nur noch
 *   zusätzlich zu ihr.
 *
 * Die App sperrt deshalb nichts, sagt es aber dazu und schlägt die eingebettete Form vor: Statt
 * unverbundener Einzelsätze ein zusammenhängender Text, in dem die Form gebraucht wird. Das ist
 * ohnehin die fachdidaktisch tragfähigere Prüfform.
 */
import { GRAMMAR_FORMATS, chosenGrammarTopics, grammarFormatLabel, learningYear, sequenceOf } from '../../arbeitsblatt/didactics/grammar'
import type { GrammarTopic } from '../../arbeitsblatt/didactics/grammar'
import type { GrammarTestMeta } from './types'
import { formatVon } from '../../../shared/verben/formate'

export interface TestingRule {
  /** Was gilt – in einem Satz für die Lehrkraft */
  text: string
  /** Vorschlag, wie sich das Blatt daran anpassen lässt */
  suggestion?: string
  /** Den Vorschlag setzt die App mit einem Klick um („Vorschlag der App umsetzen", 30.09.2026) */
  aktion?: 'einbetten'
  severity: 'hinweis' | 'wichtig'
}

/**
 * Regelhinweise für Bundesland, Fach und Lernjahr.
 * Bewusst knapp: Die Lehrkraft kennt ihr Land, die App erinnert nur an das, was leicht untergeht.
 */
export function testingRules(meta: GrammarTestMeta): TestingRule[] {
  const out: TestingRule[] = []
  const foreign = meta.subjectId !== 'deutsch' && meta.subjectId !== 'daz'
  const year = learningYear(meta.grade, sequenceOf(meta), meta.stateId)

  /*
   * Unregelmäßige Verben (30.09.2026): Der Schalter „einbetten" gilt hier nicht – im Zusammenhang
   * prüfen die Formate „Lückensätze" und „Text in die Vergangenheit setzen". Belege der Recherche
   * (recherche/unregelmaessige-verben-2026-09-30.md): NI schließt die isolierte Formenabfrage als
   * Leistung aus, NRW erlaubt sie bis Stufe I.
   */
  if (meta.modus === 'verben' && meta.verben) {
    const isoliert = meta.verben.formate.some((f) => !formatVon(f).ki)
    if (meta.stateId === 'NI' && foreign && meta.subjectId !== 'latein' && isoliert) {
      out.push({
        severity: 'wichtig',
        text: 'In Niedersachsen ist eine reine Formenabfrage (Tabelle, Ankreuzen) nicht als Leistungsnachweis vorgesehen – als Übung oder Diagnose ist sie geeignet.',
        suggestion: 'Für eine Bewertung die Formate „Lückensätze im Zusammenhang" oder „Text in die Vergangenheit setzen" wählen.'
      })
    }
    if (meta.stateId === 'NW' && foreign && year > 4 && isoliert) {
      out.push({
        severity: 'hinweis',
        text: `Nordrhein-Westfalen, ${year}. Lernjahr: Eine isolierte Formenabfrage darf eine kommunikative Teilkompetenz nur noch ergänzen.`
      })
    }
    return out
  }

  if (meta.stateId === 'NI' && foreign) {
    out.push({
      severity: 'wichtig',
      text: 'In Niedersachsen wird das Verfügen über sprachliche Mittel nicht isoliert bewertet; das Kerncurriculum weist Grammatik funktional aus.',
      suggestion: meta.embedded
        ? undefined
        : 'Abhilfe: den Schalter „In einen Zusammenhang einbetten" setzen. Der Test prüft die Form dann in einem zusammenhängenden Text statt in Einzelsätzen und lässt sich einer Teilkompetenz zurechnen.',
      ...(meta.embedded ? {} : { aktion: 'einbetten' as const })
    })
  }

  if (meta.stateId === 'NW' && foreign) {
    out.push(
      year <= 4
        ? {
            severity: 'hinweis',
            text: `Nordrhein-Westfalen, ${year}. Lernjahr: Ein isolierter Grammatikteil darf eine kommunikative Teilkompetenz ersetzen.`
          }
        : {
            severity: 'wichtig',
            text: `Nordrhein-Westfalen, ${year}. Lernjahr: Ab dem fünften Lernjahr darf ein Grammatikteil eine kommunikative Teilkompetenz nur noch ergänzen, nicht ersetzen.`,
            suggestion: 'Den Test besser als zusätzlichen Teil einer Arbeit oder als Lernkontrolle ohne eigene Note planen.'
          }
    )
  }

  if (meta.graded && !meta.embedded && foreign) {
    out.push({
      severity: 'hinweis',
      text: 'Ein benoteter Test aus unverbundenen Einzelsätzen misst die Formbeherrschung, nicht den Gebrauch.',
      suggestion: 'Eingebettet in einen Text ist die Aufgabe näher am Sprachgebrauch – und in mehr Ländern als Leistung verwendbar.',
      aktion: 'einbetten'
    })
  }

  return out
}

/**
 * Formate, die zu den gewählten Themen passen.
 *
 * Die Zuordnung stammt aus der Recherche und steht je Thema in den Daten; die Lehrkraft kann
 * sie ändern. Reine Erkennungsthemen bekommen keine offenen Formate: Wer eine Form auf dieser
 * Stufe nur erkennen soll, kann sie noch nicht produzieren.
 */
export function suggestedFormats(topics: GrammarTopic[]): string[] {
  if (!topics.length) return ['luecke', 'umformen', 'fehlerkorrektur']
  const onlyReceptive = topics.every((t) => t.receptive)
  const ids = [...new Set(topics.flatMap((t) => t.formats))]
  const usable = onlyReceptive ? ids.filter((id) => !GRAMMAR_FORMATS.find((f) => f.id === id)?.open) : ids
  // Ohne Angabe im Datensatz bleibt die bewährte Grundausstattung
  return usable.length ? usable : ['luecke', 'zuordnen']
}

/** Fehlerquellen, auf die der Test zielt – Grundlage des Fehlerprofils im Lösungsteil. */
export interface ErrorTarget {
  topicId: string
  topicLabel: string
  /** Stolperstelle im Wortlaut der Recherche */
  error: string
}

export function errorTargets(meta: GrammarTestMeta): ErrorTarget[] {
  return chosenGrammarTopics({ ...meta, grammarTopics: meta.topics } as never)
    .filter((t) => t.errors.trim())
    .flatMap((t) =>
      // Mehrere Stolperstellen je Thema sind mit „;" getrennt notiert
      t.errors
        .split(/\s*;\s*/)
        .map((e) => e.trim())
        .filter(Boolean)
        .map((error) => ({ topicId: t.id, topicLabel: t.label, error }))
    )
}

/** Lesbare Aufzählung der gewählten Formate. */
export const formatSummary = (ids: string[]): string => ids.map(grammarFormatLabel).join(', ')
