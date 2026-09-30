/**
 * Unregelmäßige Verben im Arbeitsblatt (30.09.2026).
 *
 * Zwei Wege, beide mit demselben Erzeuger wie Grammatiktest und Vokabeltest (shared/verben):
 * - Bei den Angaben (Schwerpunkt Grammatik) gewählt: Die APP hängt die Aufgaben nach dem
 *   Ausformulieren an jedes Blatt an – nicht die KI. So stehen die Formen genau wie in der Liste.
 * - Im Editor über „Darüber/Darunter einfügen → Unregelmäßige Verben …" an beliebiger Stelle.
 */
import type { Sheet, Worksheet, WsBlock } from '../model/types'
import { anredeFuerMeta } from '../didactics/anrede'
import { erzeugeVerbBloecke } from '../../../shared/verben/aufgaben'
import type { AiCall } from '../../../shared/verben/kontext'
import { newId } from '../../vokabeltest/model/random'

/** Hilfsblatt und Selbsteinschätzung bleiben der Abschluss des Blattes */
const SCHLUSS = new Set(['phrases', 'selfCheck'])

export function fuegeVorSchlussEin(sheet: Sheet, neu: WsBlock[]): Sheet {
  let stelle = sheet.blocks.length
  while (stelle > 0 && SCHLUSS.has(sheet.blocks[stelle - 1].type)) stelle--
  return { ...sheet, blocks: [...sheet.blocks.slice(0, stelle), ...neu, ...sheet.blocks.slice(stelle)] }
}

/** Nach dem Ausformulieren: die gewählten Verb-Aufgaben an jedes Blatt (jede Niveaustufe) anhängen */
export async function mitVerbAufgabe(ws: Worksheet, ai: AiCall): Promise<Worksheet> {
  const a = ws.meta.verbAufgabe
  if (!a?.verben.length || !a.formate.length) return ws
  const bloecke = await erzeugeVerbBloecke(a, anredeFuerMeta(ws.meta), ai)
  return {
    ...ws,
    // Jedes Blatt bekommt eigene Kennungen – dieselbe Kennung auf zwei Blättern verwirrte den Editor
    sheets: ws.sheets.map((s) => fuegeVorSchlussEin(s, bloecke.map((b) => ({ ...structuredClone(b), id: newId() }))))
  }
}
