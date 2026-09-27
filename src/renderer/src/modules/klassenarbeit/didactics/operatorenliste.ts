/**
 * Operatorenliste als Anlage der Klausur (27.09.2026).
 *
 * Anlass der Lehrkraft: In Niedersachsen müssen den Schülerinnen und Schülern der Sek II die
 * Operatoren zu Klausuren zur Verfügung gestellt werden. Der Baustein listet GENAU die
 * Operatoren auf, die in den Aufgaben der Arbeit vorkommen, und definiert sie – ausschließlich
 * nach der amtlichen Liste des Landes (Entscheidung der Lehrkraft: keine KI-Formulierungen).
 * Fehlt zu einem verwendeten Operator die amtliche Definition, bleibt er weg und die Lehrkraft
 * bekommt einen Hinweis. Entsteht bei Sek II von selbst, in der Sek I per Schalter; steht als
 * eigener Abschnitt am Ende der Arbeit.
 *
 * Die Listen selbst: `operatorenlistenDaten.ts` (Land → Fach → Operatoren mit Quelle).
 */
import type { Afb, InfoBoxBlock, TaskBlock, WsBlock } from '../../arbeitsblatt/model/types'
import { upperSecondary } from '../generation/generateExam'
import { alleFassungen } from '../model/fassungen'
import type { Exam } from '../model/types'
import { OPERATORENLISTEN } from './operatorenlistenDaten'

export interface OperatorDefinition {
  operator: string
  /** Leer = bloße Arbeitsanweisung (tick, match …): bekannt, aber ohne Eintrag in der Anlage */
  definition: string
  afb?: Afb | 'I–II' | 'II–III' | 'I–III'
  /** Weitere Formen, wie sie in Arbeitsanweisungen stehen („Nimm Stellung", „Setze … in Beziehung") */
  formen?: string[]
}

export interface Operatorenliste {
  /** Sprache der Liste – bei Fremdsprachen die Zielsprache */
  sprache: 'de' | 'en'
  quelle: string
  operatoren: OperatorDefinition[]
}

export const OPERATOREN_BLOCK_ID = 'exam-operatoren'

/** Ist der Baustein für diese Arbeit vorgesehen? Fehlt die Wahl, entscheidet die Stufe. */
export const operatorenlisteAktiv = (exam: Exam): boolean => exam.meta.operatorenliste ?? upperSecondary(exam.meta)

/** Die amtliche Liste des Landes für das Fach – oder null, wenn keine hinterlegt ist */
export function amtlicheListe(stateId: string, subjectId: string): Operatorenliste | null {
  return OPERATORENLISTEN[stateId]?.[subjectId] ?? null
}

const normal = (s: string): string => s.toLocaleLowerCase('de').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim()

/** Der Operator einer Arbeitsanweisung: das erste fett gesetzte Wort („**Outline** the …") */
export function operatorAusAnweisung(instruction: string): string {
  const m = /\*\*([^*]{2,40})\*\*/.exec(instruction ?? '')
  return m ? m[1] : ''
}

/** Die Operatoren aller Aufgaben und Teilaufgaben in der Reihenfolge des ersten Vorkommens */
export function operatorenDerArbeit(exam: Exam): string[] {
  const out: string[] = []
  const gesehen = new Set<string>()
  const merke = (op: string | undefined): void => {
    const n = normal(op ?? '')
    if (!n || gesehen.has(n)) return
    gesehen.add(n)
    out.push(n)
  }
  for (const part of exam.parts)
    for (const liste of alleFassungen(part))
      for (const b of liste) {
        if (b.type !== 'task') continue
        const t = b as TaskBlock
        // Der Operator steht fett vorn in der Anweisung; das Feld `operator` ist der Rückfall
        merke(operatorAusAnweisung(t.instruction) || t.operator)
        for (const p of t.parts) merke(operatorAusAnweisung(p.instruction))
      }
  return out
}

export interface OperatorenBefund {
  /** Verwendete Operatoren mit amtlicher Definition, in der Reihenfolge der Arbeit */
  gefunden: OperatorDefinition[]
  /** Verwendete Operatoren ohne amtliche Definition */
  fehlend: string[]
  liste: Operatorenliste | null
}

export function operatorenBefund(exam: Exam): OperatorenBefund {
  const liste = amtlicheListe(exam.meta.stateId, exam.meta.subjectId)
  const verwendet = operatorenDerArbeit(exam)
  if (!liste) return { gefunden: [], fehlend: verwendet, liste: null }
  const gefunden: OperatorDefinition[] = []
  const fehlend: string[] = []
  for (const op of verwendet) {
    const treffer = liste.operatoren.find((d) => passt(op, d))
    if (!treffer) fehlend.push(op)
    else if (treffer.definition && !gefunden.includes(treffer)) gefunden.push(treffer)
  }
  return { gefunden, fehlend, liste }
}

/** Wortstamm eines Verbs: „analysiere" und „analysieren" → „analysier" */
const stamm = (w: string): string => w.replace(/(en|n|e)$/, '')

/**
 * Passt der Operator der Aufgabe zum Eintrag? Gleicher Wortlaut, eine hinterlegte Form
 * („Nimm Stellung") oder derselbe Wortstamm bei einem einzelnen Verb („Erläutere" ↔ „erläutern").
 */
export function passt(op: string, d: OperatorDefinition): boolean {
  const n = normal(d.operator)
  if (n === op) return true
  if ((d.formen ?? []).some((f) => normal(f) === op)) return true
  const w1 = op.split(' ')
  const w2 = n.split(' ')
  return w1.length === 1 && w2.length === 1 && stamm(w1[0]) === stamm(w2[0]) && stamm(w1[0]).length >= 4
}

/**
 * Der Baustein für das Ende der Arbeit – ein Kasten ohne Materialnummer. Null, wenn die Liste
 * nicht vorgesehen ist oder kein verwendeter Operator eine amtliche Definition hat.
 */
export function operatorenBlock(exam: Exam): WsBlock | null {
  if (!operatorenlisteAktiv(exam)) return null
  const { gefunden, liste } = operatorenBefund(exam)
  if (!liste || !gefunden.length) return null
  const en = liste.sprache === 'en'
  const zeilen = gefunden.map((d) => `**${d.operator}**${d.afb ? ` (${en ? 'level' : 'AFB'} ${d.afb})` : ''}: ${d.definition}`)
  const block: InfoBoxBlock = {
    id: OPERATOREN_BLOCK_ID,
    type: 'infoBox',
    variant: 'definition',
    title: en ? 'Operators used in this test' : 'Operatoren dieser Arbeit',
    body: [...zeilen, '', `${en ? 'Source' : 'Quelle'}: ${liste.quelle}`].join('\n')
  }
  return block
}
