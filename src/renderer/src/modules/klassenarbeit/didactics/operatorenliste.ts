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
import type { InfoBoxBlock, TaskBlock, WsBlock } from '../../arbeitsblatt/model/types'
import type { AnlageWunsch } from '@shared/operatoren/zugriff'
import { anlageFuer } from '@shared/operatoren/zugriff'
import type { OperatorDefinition, Operatorenliste } from '@shared/operatoren/typen'
import { upperSecondary } from '../generation/generateExam'
import { alleFassungen } from '../model/fassungen'
import type { Exam } from '../model/types'
import { OPERATORENLISTEN } from './operatorenlistenDaten'

/*
 * Die Typen stehen seit dem gemeinsamen Operatoren-Bestand (Großprogramm 0.4, D3) in
 * `shared/operatoren/typen.ts`; hier nur weitergereicht, damit bestehende Importe gelten.
 */
export type { OperatorDefinition, Operatorenliste } from '@shared/operatoren/typen'

/**
 * Welcher Kompetenzbereich einer Liste zu welchem Teil der Arbeit gehört. Die Erläuterung eines
 * Operators unterscheidet sich je Bereich („explain" in der Sprachmittlung: „… taking into account
 * culture-related differences"). Ohne Zuordnung gilt der erste passende Eintrag.
 */
export const KOMPETENZBEREICH_JE_FORMAT: Record<string, string> = {
  'en-mediation': 'Sprachmittlung',
  'en-speaking': 'Sprechen',
  'en-listening': 'Hör-/Hörsehverstehen',
  'en-writing': 'Schreiben',
  'en-reading': 'Schreiben',
  'en-language': 'Schreiben',
  'en-grammar': 'Schreiben'
}

export const OPERATOREN_BLOCK_ID = 'exam-operatoren'

/** Ist der Baustein für diese Arbeit vorgesehen? Fehlt die Wahl, entscheidet die Stufe. */
export const operatorenlisteAktiv = (exam: Exam): boolean => exam.meta.operatorenliste ?? upperSecondary(exam.meta)

/**
 * Die amtliche Liste des Landes für das Fach – oder null, wenn keine hinterlegt ist.
 * Niedersachsen: von Hand erfasste Listen mit Vorbemerkungen (`operatorenlistenDaten.ts`).
 * Alle anderen Länder: gemeinsamer Bestand aus der Recherche vom 28.09.2026, nur Listen aus
 * Dokumenten des Landes selbst.
 */
export function amtlicheListe(stateId: string, subjectId: string, wunsch: AnlageWunsch = {}): Operatorenliste | null {
  return OPERATORENLISTEN[stateId]?.[subjectId] ?? anlageFuer(stateId, subjectId, wunsch)
}

/** Sprache und Stufe der Arbeit für die Wahl der Liste */
export function anlageWunsch(meta: Exam['meta']): AnlageWunsch {
  const fach: string = meta.subjectId
  const sprache = fach === 'englisch' || meta.bilingual ? 'en' : fach === 'franzoesisch' ? 'fr' : fach === 'spanisch' ? 'es' : 'de'
  return { sprache, stufe: upperSecondary(meta) ? 'sek2' : 'sek1' }
}

const normal = (s: string): string => s.toLocaleLowerCase('de').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim()

/**
 * Der Operator einer Arbeitsanweisung: die fett gesetzten Teile des ersten Satzes
 * („**Outline** the …" → „Outline"; „**Stelle** die Entwicklung **dar**" → „Stelle dar";
 * „**Setze** die Quellen **in Beziehung**" → „Setze in Beziehung").
 */
export function operatorAusAnweisung(instruction: string): string {
  const satz = (instruction ?? '').split(/(?<=[.!?])\s/)[0] ?? ''
  const teile = [...satz.matchAll(/\*\*([^*]{1,40})\*\*/g)].map((m) => m[1].trim()).filter(Boolean)
  return teile.slice(0, 3).join(' ')
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

/** Jeder Operator mit dem Teil, in dem er zuerst vorkommt (für den Kompetenzbereich) */
export function operatorVorkommen(exam: Exam): { op: string; formatId: string }[] {
  const out: { op: string; formatId: string }[] = []
  const gesehen = new Set<string>()
  for (const part of exam.parts)
    for (const liste of alleFassungen(part))
      for (const b of liste) {
        if (b.type !== 'task') continue
        const t = b as TaskBlock
        for (const roh of [operatorAusAnweisung(t.instruction) || t.operator, ...t.parts.map((x) => operatorAusAnweisung(x.instruction))]) {
          const op = normal(roh ?? '')
          const bereich = KOMPETENZBEREICH_JE_FORMAT[part.formatId] ?? ''
          const k = `${op}|${bereich}`
          if (!op || gesehen.has(k)) continue
          gesehen.add(k)
          out.push({ op, formatId: part.formatId })
        }
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
  const liste = amtlicheListe(exam.meta.stateId, exam.meta.subjectId, anlageWunsch(exam.meta))
  if (!liste) return { gefunden: [], fehlend: operatorenDerArbeit(exam), liste: null }
  const fach = exam.meta.subjectId
  // Einträge, die nur für andere Fächer gelten („darstellen" nur Erdkunde/Politik), zählen nicht
  const gueltig = liste.operatoren.filter((d) => !d.nurFaecher?.length || d.nurFaecher.includes(fach))
  const gefunden: OperatorDefinition[] = []
  const fehlend: string[] = []
  for (const { op, formatId } of operatorVorkommen(exam)) {
    const bereich = KOMPETENZBEREICH_JE_FORMAT[formatId]
    // Zuerst im Kompetenzbereich des Teils, sonst irgendwo in der Liste
    const treffer =
      gueltig.find((d) => passt(op, d) && (!bereich || !d.kompetenzbereich || d.kompetenzbereich === bereich)) ?? gueltig.find((d) => passt(op, d))
    if (!treffer) {
      if (!fehlend.includes(op)) fehlend.push(op)
    } else if ((treffer.definition || treffer.beispiele?.length) && !gefunden.includes(treffer)) gefunden.push(treffer)
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
  const en = liste.sprache !== 'de'
  // Nach Kompetenzbereich gruppiert, wenn die Liste danach gliedert – mit der Vorbemerkung des Bereichs
  const bereiche = [...new Set(gefunden.map((d) => d.kompetenzbereich ?? ''))]
  const zeilen: string[] = []
  for (const bereich of bereiche) {
    if (bereich && bereiche.length > 1) zeilen.push(`**${bereich}**`)
    // Vorbemerkung der Liste zum Bereich (bzw. zur ganzen Liste) im Wortlaut
    if (liste.hinweise?.[bereich]) zeilen.push(`_${liste.hinweise[bereich]}_`)
    for (const d of gefunden.filter((x) => (x.kompetenzbereich ?? '') === bereich)) zeilen.push(...operatorZeilen(d, en))
  }
  const block: InfoBoxBlock = {
    id: OPERATOREN_BLOCK_ID,
    type: 'infoBox',
    variant: 'definition',
    title: en ? 'Operators used in this test' : 'Operatoren dieser Arbeit',
    body: [...zeilen, '', `${en ? 'Source' : 'Quelle'}: ${liste.quelle}`].join('\n')
  }
  return block
}

/** Ein Operator mit allem, was die Liste angibt: Erläuterung, AFB, Beispiele, weitere Spalten */
export function operatorZeilen(d: OperatorDefinition, en: boolean): string[] {
  const kopf = `**${d.operator}**${d.afb ? ` (${en ? 'level' : 'AFB'} ${d.afb})` : ''}${d.definition ? `: ${d.definition}` : ''}`
  const out = [kopf]
  for (const [spalte, inhalt] of Object.entries(d.zusatz ?? {})) if (inhalt) out.push(`${spalte}: ${inhalt}`)
  if (d.beispiele?.length)
    out.push(
      `${en ? (d.beispiele.length > 1 ? 'Examples' : 'Example') : d.beispiele.length > 1 ? 'Beispiele' : 'Beispiel'}: ${d.beispiele.map((b) => (en ? `“${b}”` : `„${b}“`)).join(' · ')}`
    )
  return out
}
