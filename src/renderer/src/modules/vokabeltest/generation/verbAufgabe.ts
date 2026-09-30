/**
 * Aufgabe „Unregelmäßige Verben" im Vokabeltest (30.09.2026, Erweiterung der Lehrkraft).
 *
 * Derselbe Erzeuger wie im Grammatiktest und im Arbeitsblatt (shared/verben/erzeugen.ts); hier nur
 * die Übersetzung in die Blöcke des Vokabeltests. Der Vokabeltest nimmt die Formate, die OHNE KI
 * aus der Liste entstehen – je Aufgabe eines (Tabelle, Ankreuzen, Fehler finden, Zuordnen).
 *
 * Woher die Verben kommen: die Einstellung der Aufgabe (Liste des Lehrwerk-Bandes oder
 * Standardliste); ohne Einstellung die unregelmäßigen Verben, die in der Vokabelliste stehen.
 *
 * Vorwissen (formVorwissen.ts): Ist die einfache Vergangenheit im Lernjahr noch nicht sicher
 * eingeführt, trägt der Block einen Hinweis – die Lehrkraft entscheidet.
 */
import { istVerbSprache, VERB_SPALTEN, type VerbSprache } from '@shared/verben'
import { anredeFuer } from '../../arbeitsblatt/didactics/anrede'
import { erzeugeOhneKi, type VerbTask } from '../../../shared/verben/erzeugen'
import { formatVon, OHNE_KI, TITEL, type VerbAufgabe, type VerbFormatId } from '../../../shared/verben/formate'
import { neueVerbAufgabe, verbenAusVokabeln } from '../../../shared/verben/quellen'
import { formVorwissen, lernjahrVon } from '../didactics/formVorwissen'
import type { KnownVocab } from '../../../shared/knownVocab'
import { newId, type Rng } from '../model/random'
import type { Block, TestSettings, VocabEntry } from '../model/types'

/** Die Verb-Aufgabe dieses Tests – eingestellt oder aus der Vokabelliste abgeleitet */
export function verbAufgabeFuer(settings: TestSettings, vokabeln: VocabEntry[], seed: number): VerbAufgabe | null {
  const sprache = settings.targetLanguage
  if (!istVerbSprache(sprache)) return null
  if (settings.verbAufgabe?.sprache === sprache && settings.verbAufgabe.verben.length) return { ...settings.verbAufgabe, seed }
  const a = neueVerbAufgabe(sprache, lernjahrVon(settings), seed)
  const ausListe = verbenAusVokabeln(vokabeln, [], sprache)
  return ausListe.length ? { ...a, verben: ausListe } : a
}

/** Das Format dieser Aufgabe: das erste gewählte ohne KI, sonst nach Lernjahr */
export function verbFormatFuer(a: VerbAufgabe): VerbFormatId {
  return a.formate.find((f) => OHNE_KI.includes(f)) ?? (a.lernjahr <= 2 ? 'tabelle' : 'tabelleGemischt')
}

/** Spalten mit Vergangenheitsformen – für den Hinweis zum Vorwissen */
const VERGANGENHEIT: Record<VerbSprache, string[]> = { en: ['past', 'pp'], fr: ['pc'], es: ['indef', 'part'], it: ['pp'], ru: ['past'], la: ['perf', 'ppp'] }

export function vorwissenHinweis(a: VerbAufgabe, settings: TestSettings, known?: KnownVocab): string | undefined {
  const v = formVorwissen(settings, known)
  if (v.vergangenheit) return undefined
  const spalten = new Set([...a.spalten, a.vorgabe])
  if (!VERGANGENHEIT[a.sprache].some((s) => spalten.has(s))) return undefined
  const namen = VERB_SPALTEN[a.sprache].filter((s) => VERGANGENHEIT[a.sprache].includes(s.id) && spalten.has(s.id)).map((s) => s.label)
  return `Lernjahr ${v.lernjahr}: Die Vergangenheitsformen (${namen.join(', ')}) sind ggf. noch nicht eingeführt – Spalten prüfen oder die Aufgabe später einsetzen.`
}

/** Eine neutrale Verb-Aufgabe als Block des Vokabeltests */
export function alsVokabelBlock(t: VerbTask, basis: Omit<Block, 'kind'> & { taskType: Block['taskType'] }): Block {
  const teil = t.teil
  switch (teil.art) {
    case 'tabelle':
      return { ...basis, kind: 'verbTable', headers: teil.kopf, rows: teil.zeilen.map((z) => ({ id: newId(), cells: z.zellen, solution: z.loesung })) }
    case 'auswahl':
      return {
        ...basis,
        kind: 'choice',
        items: teil.items.map((it) => ({ id: newId(), before: it.frage ? `${it.frage}: ` : '', after: '', options: it.optionen, correct: it.richtig }))
      }
    case 'zuordnung': {
      const rechts = teil.rechts.map((text) => ({ id: newId(), text }))
      return {
        ...basis,
        kind: 'match',
        leftLabel: '',
        rightLabel: '',
        left: teil.links.map((l, i) => ({ id: newId(), text: l.text, answerId: rechts[teil.paare[i]]?.id ?? '' })),
        right: rechts
      }
    }
    case 'lueckentext':
      // Nicht im Vokabeltest (nur Formate ohne KI) – als Tabelle ohne Zeilen, damit nichts verloren geht
      return { ...basis, kind: 'verbTable', headers: [], rows: [] }
  }
}

/** Baut den Block der Aufgabe „Unregelmäßige Verben" */
export function baueVerbBlock(
  settings: TestSettings,
  vokabeln: VocabEntry[],
  rng: Rng,
  basis: Omit<Block, 'kind'> & { taskType: Block['taskType'] },
  known?: KnownVocab
): Block {
  const a = verbAufgabeFuer(settings, vokabeln, Math.floor(rng() * 2 ** 31))
  if (!a) return { ...basis, kind: 'verbTable', headers: [], rows: [], warnings: ['Für diese Sprache gibt es keine Verbliste.'] }
  const format = verbFormatFuer(a)
  const auswahl = settings.tasks.find((t) => t.type === 'irregularVerbs')
  const anzahl = a.anzahl[format] ?? formatVon(format).standardAnzahl
  const [task] = erzeugeOhneKi({ ...a, formate: [format], anzahl: { [format]: anzahl } }, anredeFuer(settings.grade, settings.schoolTypeId, settings.stateId))
  const hinweis = vorwissenHinweis(a, settings, known)
  if (!task) return { ...basis, kind: 'verbTable', headers: [], rows: [], warnings: ['Mit dieser Auswahl entsteht keine Aufgabe – mehr Verben oder ein anderes Format wählen.'] }
  const block = alsVokabelBlock(task, { ...basis, title: TITEL[a.sprache], instruction: task.anweisung, pointsPerItem: auswahl?.pointsPerItem ?? 1 })
  return hinweis ? { ...block, warnings: [...(block.warnings ?? []), hinweis] } : block
}
