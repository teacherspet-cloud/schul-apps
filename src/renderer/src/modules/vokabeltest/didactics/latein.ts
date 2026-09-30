import { istVerbSprache } from '@shared/verben'
import type { LatinWordClass, TaskTypeId } from '../model/types'
import type { VocabEntry } from '../model/types'
import { GRIECHISCH_NENNFORM_LABEL, griechischRegeln, istGriechisch } from './griechisch'
import { sprachAufgabePasst } from './sprachAufgaben'

/**
 * Vokabeltests im Fach Latein.
 *
 * Latein arbeitet anders als die modernen Fremdsprachen. Belegt (Recherche 24.09.2026):
 *
 * - Zu jeder Vokabel gehört das „grammatische Beiwerk": Der amtliche Muster-Vokabeltest im
 *   Leitfaden Latein (IQSH Schleswig-Holstein 2016, S. 25) hat die Spalten
 *   „Vokabeln | Formen | Bedeutungen" und fragt je Wortart Genitiv+Genus, Stammformen,
 *   f./n. bzw. den Kasus einer Präposition mit ab.
 * - „Für eine korrekte Lösung müssen jeweils alle Bedeutungen und notwendige grammatische
 *   Angaben genannt werden." (ebd., S. 21)
 * - „Grammatische Aufgaben sind nicht Teil des Vokabeltests." (ebd., S. 21) – Formenbestimmung
 *   und Konstruktionen gehören in den Grammatiktest, den es in dieser App bereits gibt.
 * - „Latein ist keine Sprache, die Schülerinnen und Schüler aktiv beherrschen sollen."
 *   (ebd., S. 14) – daher nur Lateinisch → Deutsch und keine Sprech- oder Schreibformate.
 * - Wortschatzarbeit heißt im Lehrplan: Wortbildung, Wortfamilien, Lehn- und Fremdwörter,
 *   Sprachvergleich, Monosemieren (Kernlehrplan Latein NRW G9 2019; LehrplanPLUS Bayern).
 *
 * NICHT belegt und deshalb hier auch nicht behauptet: ein amtlicher Punkteschlüssel. Schleswig-
 * Holstein überlässt die Gewichtung ausdrücklich der Fachkonferenz; die Voreinstellungen unten
 * sind daher als Vorschlag gedacht und in den Einstellungen änderbar.
 */

export const LATEIN = 'la'

export const istLatein = (targetLanguage: string): boolean => targetLanguage === 'la'

/**
 * Alte Sprache (Latein, Altgriechisch, 30.09.2026): deutsches Schülermaterial, nur Übersetzen ins
 * Deutsche, Nennformen – der Sonderweg dieser Datei gilt für beide (didactics/griechisch.ts).
 */
export const istAlteSprache = (targetLanguage: string): boolean => istLatein(targetLanguage) || istGriechisch(targetLanguage)

/** „lateinisch" bzw. „griechisch" für KI-Aufträge und Beschreibungen */
export const alteSpracheAdjektiv = (targetLanguage: string): string => (istGriechisch(targetLanguage) ? 'altgriechisch' : 'lateinisch')

/** Anzeigename einer Aufgabenart: „(Latein)" wird im Griechischen zu „(Griechisch)" */
export const aufgabenLabel = (def: { label: string }, targetLanguage: string): string =>
  istGriechisch(targetLanguage) ? def.label.replace('(Latein)', '(Griechisch)') : def.label

/**
 * Welche Nennform bei welcher Wortart verlangt wird – Wortlaut wie im Mustertest.
 *
 * Ohne diese Ansage wäre bei „servus" unklar, ob Genitiv oder Akkusativ gemeint ist: Beides
 * steht je nach Lehrwerk und Lernstand in der Vokabelliste (belegt für Pontes, wo die
 * Anfangslektionen den Akkusativ angeben und später auf den Genitiv umgestellt wird).
 */
export const NENNFORM_LABEL: Record<LatinWordClass, string> = {
  substantiv: 'Genitiv, Genus:',
  verb: 'Stammformen:',
  adjektiv: 'f., n.:',
  praeposition: 'mit Kasus:',
  pronomen: 'Formen:',
  adverb: '—',
  sonstiges: '—'
}

/** Wortarten ohne eigene Nennform – dort bleibt die Formspalte leer, wie im Mustertest. */
export const OHNE_NENNFORM: LatinWordClass[] = ['adverb', 'sonstiges']

export const nennformLabel = (v: VocabEntry, targetLanguage = 'la'): string =>
  (istGriechisch(targetLanguage) ? GRIECHISCH_NENNFORM_LABEL : NENNFORM_LABEL)[v.wordClass ?? 'sonstiges']

/**
 * Aufgabenarten, die es im Lateinischen NICHT gibt.
 *
 * Alles, was aktiven Sprachgebrauch verlangt (selbst formulieren, Dialog, Sprachmittlung)
 * oder einsprachig in der Zielsprache arbeitet. Der Lateinunterricht zielt auf das Verstehen
 * und Übersetzen, nicht auf das Sprechen und Schreiben.
 */
export const NICHT_IN_LATEIN: TaskTypeId[] = ['dialogue', 'writeSentences', 'mediation', 'twoSentences', 'writeDefinitions', 'freeText']

/** Aufgabenarten, die es NUR im Lateinischen gibt. */
export const NUR_LATEIN: TaskTypeId[] = ['latinForms', 'latinLoanWords', 'latinWordFormation', 'latinContext']

/** Passt diese Aufgabenart zur gewählten Sprache? */
export function passtZurSprache(id: TaskTypeId, targetLanguage: string): boolean {
  // Unregelmäßige Verben (30.09.2026): nur in Sprachen mit Verbliste (nicht Niederländisch)
  if (id === 'irregularVerbs') return istVerbSprache(targetLanguage)
  // Sprachbesondere Aufgaben (Aspektpaare, Lesung, Wurzel …) und Schriftgrenzen (30.09.2026)
  const besonders = sprachAufgabePasst(id, targetLanguage)
  if (besonders !== undefined) return besonders
  if (istAlteSprache(targetLanguage)) return !NICHT_IN_LATEIN.includes(id)
  return !NUR_LATEIN.includes(id)
}

/**
 * Vorschlag für die Bewertung eines Nennform-Blocks.
 *
 * Getrennte Punkte für Form und Bedeutungen. Wer alle Bedeutungen kann und nur das Genus
 * vergisst, hat nicht nichts gewusst – eine Ja/Nein-Wertung könnte das nicht abbilden.
 * Es gibt dazu keine Landesvorgabe; die Werte sind änderbar.
 */
export const NENNFORM_PUNKTE = { form: 1, bedeutung: 1 }

/**
 * Regeln für die KI, wenn die Zielsprache Latein ist.
 *
 * Sie stehen zusätzlich zu den allgemeinen Vorgaben und schneiden ab, was im
 * Lateinunterricht nicht vorkommt.
 */
export function lateinRegeln(targetLanguage = 'la'): string {
  if (istGriechisch(targetLanguage)) return griechischRegeln()
  return [
    'LATEIN – dieses Fach arbeitet anders als die modernen Fremdsprachen:',
    '- Abgefragt wird ausschließlich Lateinisch → Deutsch. Keine Aufgabe verlangt, etwas auf Latein zu formulieren, zu sprechen oder zu schreiben.',
    '- Zu jeder Vokabel gehört ihr grammatisches Beiwerk: Substantiv mit Genitiv und Genus, Verb mit den Stammformen, Adjektiv mit den Endungen für f. und n., Präposition mit ihrem Kasus.',
    '- Gib zu jeder Vokabel ALLE im Lehrwerk üblichen Bedeutungen an, nicht nur eine. Ein lateinisches Wort ist keine Gleichung mit einem deutschen Wort.',
    '- KEINE Formenbestimmung, kein AcI, kein Ablativus absolutus, kein Participium coniunctum: Das gehört in den Grammatiktest, nicht in den Vokabeltest.',
    '- Setze Längenzeichen (Makra) nur, wenn sie in der Vorlage stehen.',
    '- Sinnvoll sind stattdessen: deutsche Lehn- und Fremdwörter auf das lateinische Wort zurückführen, Wortbildung (Präfix, Suffix, Kompositum), Wortfamilien, und die passende Bedeutung im Satzzusammenhang wählen.'
  ].join('\n')
}
