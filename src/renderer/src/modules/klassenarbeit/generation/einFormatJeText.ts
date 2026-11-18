/**
 * Prüfung „ein Aufgabenformat je Hör-/Lesetext" für Verstehensteile der Klassenarbeit (18.11.2026, Vorgabe der
 * Lehrkraft: für andere Aufgabenformate sind neue Hör-/Lesetexte nötig).
 *
 * Zugeordnet wird eine Aufgabe ihrem Hörtext über `audioId` (linkListeningTasks), sonst dem letzten Lesetext
 * (Baustein „text") davor. Verglichen wird die Antwortform (answer.kind der Aufgabe und ihrer Teilaufgaben) – zwei
 * Formate mit derselben Antwortform (etwa Tabelle) sind so nicht zu unterscheiden, gemischte Formate wie
 * Ankreuzen + Zuordnen aber schon. Befunde sind „hoch": Die Prüfkette lässt den Teil nachbessern.
 */
import type { WsBlock } from '../../arbeitsblatt/model/types'
import type { IntegrityFinding } from '../../arbeitsblatt/didactics/integrity'

const FORM: Record<string, string> = {
  multipleChoice: 'Ankreuzen',
  trueFalse: 'Richtig/Falsch',
  tableFill: 'Tabelle',
  matching: 'Zuordnen',
  gapText: 'Lücken',
  lines: 'Kurzantworten',
  ordering: 'Reihenfolge'
}

export function pruefeEinFormatJeText(blocks: WsBlock[]): IntegrityFinding[] {
  const gruppen = new Map<string, { titel: string; formen: Set<string>; aufgabe: string }>()
  let letzterText: { id: string; titel: string } | null = null
  const titelVon = new Map<string, string>()
  for (const b of blocks) {
    if (b.type === 'audio') titelVon.set(b.id, b.title || 'Hörtext')
    if (b.type === 'text') {
      letzterText = { id: b.id, titel: b.title || 'Lesetext' }
      continue
    }
    if (b.type !== 'task') continue
    if (b.skill && b.skill !== 'listening' && b.skill !== 'reading') continue
    const textId = b.audioId ?? letzterText?.id
    if (!textId) continue
    const formen = [b.answer?.kind, ...(b.parts ?? []).map((p) => p.answer?.kind)].filter((k): k is NonNullable<typeof k> => Boolean(k) && k !== 'none')
    if (!formen.length) continue
    const g = gruppen.get(textId) ?? { titel: titelVon.get(textId) ?? letzterText?.titel ?? 'Text', formen: new Set<string>(), aufgabe: b.id }
    for (const f of formen) g.formen.add(f)
    gruppen.set(textId, g)
  }
  return [...gruppen.values()]
    .filter((g) => g.formen.size > 1)
    .map((g) => ({
      blockId: g.aufgabe,
      severity: 'hoch' as const,
      message: `Zu „${g.titel}" gibt es mehrere Aufgabenformate (${[...g.formen].map((f) => FORM[f] ?? f).join(', ')}). Je Hör-/Lesetext ist nur EIN Format erlaubt – für jedes weitere Format einen eigenen, neuen Text anlegen.`
    }))
}
