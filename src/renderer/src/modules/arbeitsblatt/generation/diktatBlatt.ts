/**
 * Diktatblatt erzeugen (26.11.2026) – eigener Weg wie die Sprechprüfung: EINE Anfrage für Text,
 * Zielwörter und nur die gewählten Zusatzaufgaben; Diktat-Baustein und Niederschrift setzt die App
 * selbst zusammen (didactics/diktat.ts). Niveaufassungen gibt es hier nicht – ein Diktat für alle.
 */
import { createRng, newId, randomSeed } from '../../vokabeltest/model/random'
import { anredeFuerMeta } from '../didactics/anrede'
import { DIKTAT_SCHEMA, diktatBaustein, diktatRegeln, niederschrift, STANDARD_DIKTAT, type DiktatAntwort } from '../didactics/diktat'
import type { LearnerProfile } from '../didactics/profile'
import type { Worksheet, WsBlock } from '../model/types'
import { convertBlock } from './convert'
import type { AiCall } from './generate'
import { systemPrompt } from './prompts'
import { FLAT_BLOCK } from './schemas'

type Antwort = DiktatAntwort & { vorbereitung?: unknown[]; nachbereitung?: unknown[]; pruefung?: unknown[]; teacherNote?: string }

export async function diktatBlattErzeugen(ws: Worksheet, profile: LearnerProfile, ai: AiCall, melde?: (t: string) => void, wunsch = ''): Promise<Worksheet> {
  const setup = ws.meta.diktat ?? STANDARD_DIKTAT
  melde?.('Die KI schreibt den Diktattext …')
  const d = await ai<Antwort>({
    system: systemPrompt(ws.meta, profile),
    user: [
      `Erstelle ein Diktat zum Thema „${ws.meta.topic}".`,
      diktatRegeln(ws.meta, setup),
      wunsch.trim() ? `Änderungswunsch der Lehrkraft (hat Vorrang): ${wunsch.trim()}` : ''
    ]
      .filter(Boolean)
      .join('\n\n'),
    schemaName: 'diktat',
    schema: DIKTAT_SCHEMA(FLAT_BLOCK)
  })
  return diktatBlattAus(ws, d)
}

/** Antwort → Blatt (rein, ohne KI) */
export function diktatBlattAus(ws: Worksheet, d: Antwort): Worksheet {
  const setup = ws.meta.diktat ?? STANDARD_DIKTAT
  const anrede = anredeFuerMeta(ws.meta)
  const rng = createRng(randomSeed())
  const bausteine = (liste: unknown[] | undefined): WsBlock[] =>
    (liste ?? []).map((b) => convertBlock(b as Record<string, unknown>, rng, [], anrede)).filter((b): b is WsBlock => Boolean(b))
  const diktat = diktatBaustein(d, setup, ws.meta.topic)
  const blocks: WsBlock[] = [...bausteine(d.vorbereitung), diktat, niederschrift(diktat), ...bausteine(d.pruefung), ...bausteine(d.nachbereitung)]
  return {
    ...ws,
    meta: { ...ws.meta, title: ws.meta.title || diktat.title, ...(d.teacherNote?.trim() ? { teacherNote: d.teacherNote.trim() } : {}) },
    sheets: [{ id: newId(), label: 'Diktat', blocks }]
  }
}
