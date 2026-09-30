/**
 * Änderungswunsch an einem Arbeitsblatt-Baustein (Zauberstab „Überarbeiten", Kreis „Neu
 * erzeugen", 30.09.2026) – für alle Programme, deren Material aus diesen Bausteinen besteht.
 *
 * Arbeitsblatt und Klassenarbeit erzeugen über `regenerateBlock` (generate.ts) mit dem vollen
 * Blattzusammenhang. Lernzielkontrolle und Grammatiktest haben eigene Systemaufträge (Landesformat,
 * Operatoren, geprüfte Form) – sie nehmen `bausteinNachWunsch`, das den Systemauftrag des
 * Programms mitnimmt, statt ihn durch den des Arbeitsblatts zu ersetzen.
 */
import type { StructuredRequest } from '@shared/types'
import { obj } from '../../../shared/aiSchema'
import type { Anrede } from '../../../shared/anrede'
import { wunschAuftrag, type WunschArt, type WunschKontext } from '../../../shared/kiWunsch'
import { plainText } from '../../../shared/richtext/parse'
import { createRng, randomSeed } from '../../vokabeltest/model/random'
import { verschluesseleMaterialverweise } from '../didactics/integrity'
import { stateInfo } from '../didactics/states'
import { BLOCK_LABELS } from '../model/factory'
import type { WorksheetMeta, WsBlock } from '../model/types'
import { convertBlock } from './convert'
import { describeBlock } from './describe'
import { FLAT_BLOCK } from './schemas'

type AiCall = <T>(req: StructuredRequest) => Promise<T>

const AFB_ZAHL: Record<string, number> = { I: 1, II: 2, III: 3 }

/** Was die Vorschläge über Baustein und Lerngruppe wissen – aus Baustein und Blattangaben. */
export function wunschKontextFuer(
  block: WsBlock,
  meta: Pick<WorksheetMeta, 'subjectId' | 'subjectLabel' | 'grade' | 'stateId' | 'schoolTypeName' | 'topic' | 'learningGoals' | 'cefrLevel'> &
    Partial<Pick<WorksheetMeta, 'courseLevel'>>,
  material: string
): WunschKontext {
  const sprache = meta.cefrLevel && /englisch|franz|spanisch|latein|italien|russisch|niederl/i.test(meta.subjectId) ? meta.cefrLevel : ''
  const kurs = meta.courseLevel && meta.courseLevel !== 'mixed' ? `Kurs ${meta.courseLevel}` : ''
  return {
    typ: block.type,
    typLabel: BLOCK_LABELS[block.type],
    material,
    fachId: meta.subjectId,
    fachLabel: meta.subjectLabel,
    klasse: meta.grade,
    bundesland: meta.stateId ? stateInfo(meta.stateId).name : undefined,
    schulform: meta.schoolTypeName,
    niveau: sprache || kurs || undefined,
    thema: meta.topic,
    lernziel: meta.learningGoals,
    inhalt: describeBlock(block),
    ...(block.type === 'task'
      ? {
          afb: block.afb ? AFB_ZAHL[block.afb] : undefined,
          antwortArt: block.parts[0]?.answer.kind ?? block.answer.kind,
          teilaufgaben: block.parts.length,
          inhalt: `${describeBlock(block)}\n${plainText(block.instruction)}`.trim()
        }
      : {})
  }
}

export interface WunschAnfrage {
  /** Das Material in Dokumentreihenfolge (Zusammenhang für die KI) */
  bloecke: WsBlock[]
  blockId: string
  art: WunschArt
  wunsch: string
  /** Systemauftrag des Programms */
  system: string
  /** Lerngruppe, Thema, Anrede – je ein Satz */
  zusammenhang: string[]
  anrede: Anrede
  /** Punkte des alten Bausteins behalten (Kontrollen, Tests) */
  punkteBehalten: boolean
}

/** Der Nutzerauftrag für `bausteinNachWunsch` – ohne KI prüfbar. */
export function wunschNutzerauftrag(a: WunschAnfrage): string {
  const i = a.bloecke.findIndex((b) => b.id === a.blockId)
  const alt = a.bloecke[i]
  return [
    wunschAuftrag(a.art, a.wunsch, i + 1),
    `Typ (${alt?.type ?? '?'}) und Stelle im Material bleiben; Punkte vergibt die App.`,
    ...a.zusammenhang,
    `Material, nummeriert:\n${a.bloecke.map((b, k) => `(${k + 1}) ${describeBlock(b)}`).join('\n\n')}`,
    a.art === 'neu' ? `Bisheriger Baustein (nur zur Orientierung, nicht übernehmen):\n${alt ? describeBlock(alt) : ''}` : `Zu überarbeitender Baustein:\n${alt ? describeBlock(alt) : ''}`,
    'Liefere den Baustein VOLLSTÄNDIG. Für nicht benötigte Felder leere Werte verwenden.'
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Einen Baustein nach Wunsch überarbeiten oder neu erzeugen – mit dem Systemauftrag des
 * Programms. Kennung, Sterne und (auf Wunsch) Punkte bleiben; Materialverweise werden wie
 * überall zu Kennungen.
 */
export async function bausteinNachWunsch(a: WunschAnfrage, ai: AiCall): Promise<WsBlock> {
  const alt = a.bloecke.find((b) => b.id === a.blockId)
  if (!alt) throw new Error('Der Baustein ist nicht mehr vorhanden.')
  const data = await ai<{ block?: Record<string, unknown> }>({
    system: a.system,
    user: wunschNutzerauftrag(a),
    schemaName: 'worksheet_block',
    schema: obj({ block: FLAT_BLOCK })
  })
  const roh = convertBlock({ ...data?.block, type: alt.type }, createRng(randomSeed()), [], a.anrede)
  if (!roh) throw new Error('Die KI hat keinen Baustein geliefert.')
  const punkte = alt.type === 'task' && roh.type === 'task' ? (a.punkteBehalten ? alt.points : Math.max(0, Math.round(roh.points ?? 0))) : undefined
  const neu: WsBlock = { ...roh, id: alt.id, ...(alt.stars ? { stars: alt.stars } : {}), ...(punkte !== undefined ? { points: punkte } : {}) } as WsBlock
  const [aufgeloest] = verschluesseleMaterialverweise(
    [neu],
    a.bloecke.map((b) => (b.id === alt.id ? neu : b))
  )
  return aufgeloest
}
