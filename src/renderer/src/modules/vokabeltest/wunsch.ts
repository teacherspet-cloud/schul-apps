/**
 * Zauberstab „Überarbeiten" und Kreis „Neu erzeugen" im Vokabeltest (30.09.2026).
 *
 * Der Kreis „Ganze Aufgabe neu generieren" stand hier schon – die Lehrkraft wünschte sich dazu
 * einen Änderungswunsch. Beide Knöpfe teilen jetzt das Wunschfeld aller Programme
 * (shared/components/KiWunschKnoepfe.tsx). Die Aufgabe entsteht wie bisher über
 * `regenerateBlock` (generation/edit.ts) mit denselben Vokabeln; der Wunsch geht als Hinweis mit.
 */
import { stateInfo } from '../arbeitsblatt/didactics/states'
import type { WunschArt, WunschKontext } from '../../shared/kiWunsch'
import { describeBlock } from './generation/quality'
import { TASK_TYPES } from './generation/taskTypes'
import { LANGUAGES, type Block, type TestDocument } from './model/types'

/** Was die Vorschläge über Aufgabe und Lerngruppe wissen. */
export function vokabelWunschKontext(block: Block, doc: TestDocument): WunschKontext {
  const s = doc.settings
  const sprache = LANGUAGES.find((l) => l.value === s.targetLanguage)?.label ?? s.targetLanguage
  return {
    typ: 'vokabel',
    typLabel: TASK_TYPES[block.taskType]?.label ?? block.kind,
    material: 'Vokabeltest',
    fachId: sprache.toLowerCase(),
    fachLabel: sprache,
    klasse: s.grade,
    bundesland: s.stateId ? stateInfo(s.stateId).name : undefined,
    niveau: s.level,
    thema: s.topic,
    inhalt: [block.title, block.instruction, describeBlock(block)].filter(Boolean).join('\n')
  }
}

/** Der Hinweis an die Erzeugung – ohne KI prüfbar (tests/kiWunsch.test.ts). */
export function vokabelWunschHinweis(block: Block, art: WunschArt, wunsch: string): string {
  const w = wunsch.trim()
  if (art === 'neu')
    return [
      'Create a completely NEW version of this task: same task type and the same vocabulary, but new sentences and items – not just reworded.',
      w ? `The teacher's wish for the new version (follow it exactly): ${w}` : ''
    ]
      .filter(Boolean)
      .join('\n')
  return [
    'Revise the EXISTING task below. It must stay recognisable: keep items, sentences and order wherever the wish does not ask for a change.',
    `Current task: ${describeBlock(block)}`,
    w ? `The teacher's wish for this task (follow it exactly, keep everything else): ${w}` : 'Improve it didactically and linguistically.'
  ].join('\n')
}
