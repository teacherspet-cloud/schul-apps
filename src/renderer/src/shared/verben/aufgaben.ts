/**
 * Alle Aufgaben einer Verb-Aufgabe in der gewählten Reihenfolge der Formate (30.09.2026):
 * erst ohne KI aus der Liste, dann – nur wenn gewählt – die Sätze im Zusammenhang mit KI.
 */
import type { WsBlock } from '../../modules/arbeitsblatt/model/types'
import type { Anrede } from '../anrede'
import { alsWsBlock, bewertungsBlock, erzeugeOhneKi, type VerbTask } from './erzeugen'
import { formatVon, VERB_FORMATE, type VerbAufgabe } from './formate'
import { erzeugeMitKi, type AiCall } from './kontext'

export const brauchtKi = (a: Pick<VerbAufgabe, 'formate'>): boolean => a.formate.some((f) => formatVon(f).ki)

export async function erzeugeVerbTasks(a: VerbAufgabe, anrede: Anrede, ai: AiCall | null, fassung = 0, anzahlFassungen = 1): Promise<VerbTask[]> {
  const ohne = erzeugeOhneKi(a, anrede, fassung, anzahlFassungen)
  const mit = ai && brauchtKi(a) ? await erzeugeMitKi(a, anrede, ai, fassung, anzahlFassungen) : []
  const alle = [...ohne, ...mit]
  // Reihenfolge wie in der Liste der Formate: erst Tabellen und Erkennen, dann Sätze im Zusammenhang
  return VERB_FORMATE.map((f) => f.id)
    .filter((f) => a.formate.includes(f))
    .flatMap((f) => alle.filter((t) => t.format === f))
}

/**
 * Aufgabenbausteine (Arbeitsblatt, Grammatiktest) samt Bewertungshinweis im Lösungsteil.
 * Wirft, wenn keine Aufgabe entstanden ist – lieber laut als ein leeres Blatt.
 */
export async function erzeugeVerbBloecke(a: VerbAufgabe, anrede: Anrede, ai: AiCall | null, fassung = 0, anzahlFassungen = 1): Promise<WsBlock[]> {
  const tasks = await erzeugeVerbTasks(a, anrede, ai, fassung, anzahlFassungen)
  if (!tasks.length) throw new Error('Mit dieser Auswahl entsteht keine Aufgabe. Bitte mehr Verben oder andere Aufgabenformen wählen.')
  return [...tasks.map(alsWsBlock), bewertungsBlock(a)]
}
