/**
 * Hörtexte von der KI schreiben lassen.
 *
 * Der Hörtext entsteht VOR dem übrigen Blatt und in einer eigenen Anfrage. Das hat zwei Gründe:
 * - Die Lehrkraft kann dafür ein stärkeres Modell wählen als für den Rest. Ein Hörtext ist der
 *   anspruchsvollste Teil eines Sprachenblatts: Er muss klingen wie gesprochene Sprache und
 *   trotzdem genau die Informationen tragen, die später abgefragt werden.
 * - Das fertige Skript geht anschließend als Grundlage in die Blatterstellung. So werden die
 *   Aufgaben zum Text gebaut und nicht umgekehrt – genau so, wie eine Lehrkraft es täte.
 *
 * Vertont wird der Text nicht hier, sondern auf Knopfdruck im Reiter „Hörtexte" (ElevenLabs).
 * So kostet ein verworfener Entwurf kein Kontingent.
 */
import type { AiProviderId } from '@shared/types'
import { arr, int, obj, str } from '../../../shared/aiSchema'
import { listeningCount, listeningFormatById, listeningRules, suggestListeningFormat } from '../didactics/listeningFormats'
import type { LearnerProfile } from '../didactics/profile'
import { subjectById } from '../model/subjects'
import type { AudioBlock, WorksheetMeta, WsBlock } from '../model/types'
import { stufenMixHinweis } from '../../../shared/verstehen/regeln'
import { listeningTextRules, systemPrompt } from './prompts'
import { istDeutschZuhoeren } from '../didactics/zuhoeren'
import type { AiCall } from './generate'

export interface ListeningScript {
  /** Textsorte, wie sie auf dem Blatt steht */
  textType: string
  title: string
  /** Skript mit Sprecherzeilen „Name: Text" */
  transcript: string
  speakers: string[]
  /** Hinweis vor dem Hören, auf Deutsch */
  beforeListening: string
  plays: number
}

const SCRIPT_SCHEMA = obj({
  title: str('Kurzer Titel des Hörtextes, in der Zielsprache'),
  textType: str('Textsorte, genau wie vorgegeben'),
  speakers: arr(str('Name der sprechenden Person'), '1 bis 4 Sprechende'),
  transcript: str('Das vollständige Skript. Jede Sprecherzeile als „Name: Text" in einer eigenen Zeile.'),
  beforeListening: str('Ein bis zwei Sätze auf Deutsch: Anlass, Zahl und Rolle der Sprechenden – ohne Lösungen vorwegzunehmen'),
  plays: int('Wie oft der Text gehört wird (in der Regel 2)')
})

/** Braucht dieses Blatt einen Hörtext, den die KI schreiben soll? */
export function wantsListening(meta: WorksheetMeta): boolean {
  if (!meta.audioAi) return false
  // Deutsch hat einen eigenen Hoer-Kompetenzbereich (Verstehend zuhoeren, KMK 2022)
  return Boolean(subjectById(meta.subjectId).foreignLanguage) || istDeutschZuhoeren(meta)
}

/** Der Auftrag an die KI: nur der Hörtext, ohne Aufgaben. */
export function scriptPrompt(meta: WorksheetMeta, index = 0, done: ListeningScript[] = []): string {
  const format =
    meta.audioFormat && meta.audioFormat !== 'auto' ? listeningFormatById(meta.audioFormat) : suggestListeningFormat(meta.cefrLevel, meta.topic.length)
  const count = listeningCount(meta)
  return [
    count > 1
      ? `Schreibe Hörtext ${index + 1} von ${count} für ein Arbeitsblatt im Fach ${meta.subjectLabel}, Klasse ${meta.grade}, Niveau ${meta.cefrLevel}.`
      : `Schreibe den Hörtext für ein Arbeitsblatt im Fach ${meta.subjectLabel}, Klasse ${meta.grade}, Niveau ${meta.cefrLevel}.`,
    `Thema: ${meta.topic}`,
    done.length
      ? [
          'Diese Hörtexte gibt es schon – der neue behandelt einen ANDEREN Aspekt des Themas, hat eine andere Textsorte und andere Sprechende:',
          ...done.map((d, i) => `${i + 1}. ${d.textType}: ${d.title} (${d.speakers.join(', ') || 'eine Person'})`)
        ].join('\n')
      : '',
    meta.priorKnowledge ? `Vorwissen der Lerngruppe: ${meta.priorKnowledge}` : '',
    '',
    'Es geht NUR um den Hörtext – noch keine Aufgaben.',
    listeningTextRules(meta),
    format && (!meta.audioFormat || meta.audioFormat === 'auto') ? `- Vorschlag für die Textsorte: ${format.label}. ${format.construction}` : '',
    '',
    'Das Skript wird von einer Computerstimme vorgelesen. Deshalb:',
    '- Jede Sprecherzeile beginnt mit dem Namen und einem Doppelpunkt: „Anna: …".',
    '- Keine Regieanweisungen in Klammern, keine Geräuschbeschreibungen, keine Zeitangaben.',
    '- Alles, was gehört werden soll, steht als gesprochener Text da.',
    /*
     * Audio-Tags versteht nur das Dialog-Modell (eleven_v3), und nur bei mehreren
     * Sprechenden wird es benutzt. Bei einer einzelnen Stimme würden sie entfernt – dann
     * stünden im Transkript Angaben, die man nirgends hört. Deshalb die Bindung an den
     * Dialog. Sie stehen in ECKIGEN Klammern; runde Klammern bleiben verboten, sonst
     * lassen sich Regieanweisung und Tag nicht auseinanderhalten.
     */
    audioTagRules
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Regel für Audio-Tags im Skript.
 *
 * Tags wie `[laughs]` oder `[excited]` steuern die Betonung – aber nur beim Dialog-Modell
 * eleven_v3, das erst ab zwei Sprechenden zum Einsatz kommt. Bei einer einzelnen Stimme
 * werden sie vor dem Vertonen entfernt (`ohneTags`), weil das ältere Modell sie vorlesen
 * würde; im Skript stünde dann etwas, das man nirgends hört. Darum die Bindung an den
 * Dialog.
 *
 * Sparsamkeit ist hier keine Stilfrage: Jedes Tag ist eine Anweisung, der das Modell folgt.
 * Zu viele davon, und aus einem Schulhof-Gespräch wird ein Hörspiel, in dem die
 * Verstehensfragen untergehen.
 */
export const audioTagRules = [
  'Betonungshinweise sind erlaubt, wenn MEHRERE Personen sprechen – in eckigen Klammern vor der Stelle, z. B. „Anna: [laughs] Are you serious?".',
  '- Nur echte Sprechweisen: [laughs], [sighs], [whispers], [excited], [nervously], [surprised], [curious], [sarcastic].',
  '- KEINE Geräusche und keine Musik: [applause], [door slams] und Ähnliches gehören nicht in einen Hörtext für den Unterricht.',
  '- Höchstens eines je Sprecherzeile und nur dort, wo es die Aussage trägt. Die meisten Zeilen brauchen keines.',
  '- Spricht nur EINE Person, verwende gar keine Betonungshinweise.'
].join('\n')

/**
 * Schreibt den Hörtext. `provider`/`model` schicken genau diese Anfrage an ein anderes
 * (stärkeres) Modell als das eingestellte; ohne Angabe gilt die Voreinstellung.
 */
export async function writeListeningScripts(
  meta: WorksheetMeta,
  profile: LearnerProfile,
  ai: AiCall,
  override?: { provider?: AiProviderId; model?: string },
  onStep?: (done: number, total: number) => void
): Promise<ListeningScript[]> {
  const count = listeningCount(meta)
  const out: ListeningScript[] = []
  // Nacheinander, damit jeder Text die schon geschriebenen kennt und sich von ihnen unterscheidet
  for (let i = 0; i < count; i++) {
    onStep?.(i, count)
    out.push(await writeListeningScript(meta, profile, ai, override, i, out))
  }
  return out
}

export async function writeListeningScript(
  meta: WorksheetMeta,
  profile: LearnerProfile,
  ai: AiCall,
  override?: { provider?: AiProviderId; model?: string },
  index = 0,
  done: ListeningScript[] = []
): Promise<ListeningScript> {
  const data = await ai<Partial<ListeningScript>>({
    system: systemPrompt(meta, profile),
    user: scriptPrompt(meta, index, done),
    schemaName: 'listening_script',
    schema: SCRIPT_SCHEMA,
    ...(override?.provider ? { provider: override.provider } : {}),
    ...(override?.model ? { model: override.model } : {})
  })
  const chosen = meta.audioFormat && meta.audioFormat !== 'auto' ? listeningFormatById(meta.audioFormat) : undefined
  return {
    title: String(data.title ?? '').trim() || 'Listening',
    textType: String(data.textType ?? '').trim() || chosen?.label || 'Hörtext',
    transcript: String(data.transcript ?? '').trim(),
    speakers: (Array.isArray(data.speakers) ? data.speakers : [])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 4),
    beforeListening: String(data.beforeListening ?? '').trim(),
    plays: Math.max(1, Math.min(3, Number(data.plays) || listeningRules(meta.cefrLevel).plays))
  }
}

/**
 * Die fertigen Skripte als Abschnitt für den Auftrag, der das Blatt ausformuliert.
 *
 * Sie sind bereits geschrieben und werden wörtlich übernommen. Damit die Aufgaben wirklich
 * zum Text passen, steht hier auch, dass jede Antwort im Skript stehen muss – und bei mehreren
 * Hörtexten, in welcher Reihenfolge alles auf das Blatt kommt.
 */
export function scriptForSheet(scripts: ListeningScript | ListeningScript[] | null, stufenAnteile?: readonly number[]): string {
  const list = (Array.isArray(scripts) ? scripts : scripts ? [scripts] : []).filter((s) => s.transcript.trim())
  if (!list.length) return ''
  const many = list.length > 1
  const lines: string[] = [
    many
      ? `FERTIGE HÖRTEXTE (${list.length}) – sie sind geschrieben und werden NICHT verändert:`
      : 'FERTIGER HÖRTEXT – er ist bereits geschrieben und wird NICHT verändert:'
  ]
  list.forEach((script, i) => {
    if (many) lines.push(`=== Hörtext ${i + 1} ===`)
    lines.push(
      `Titel: ${script.title}`,
      `Textsorte: ${script.textType}`,
      `Sprechende: ${script.speakers.join(', ') || 'eine Person'}`,
      `Vor dem Hören: ${script.beforeListening}`,
      '--- Skript ---',
      script.transcript,
      '--- Ende des Skripts ---'
    )
  })
  lines.push(
    `- Lege für JEDEN dieser Hörtexte genau einen Baustein "audio" an und übernimm das Skript WÖRTLICH (body = Skript, variant = Textsorte, title = Titel, instruction = Hinweis vor dem Hören, plays = ${list[0].plays}).`,
    '- Kürze, ergänze und glätte nichts am Skript – es wird genau so vertont.',
    '- Baue die Hörverstehensaufgaben genau zu diesen Texten: Jede Antwort steht wörtlich oder sinngemäß im zugehörigen Skript. Prüfe jede Aufgabe daraufhin, bevor du sie schreibst.',
    '- Keine Aufgabe fragt nach etwas, das im Skript nicht vorkommt.',
    // Stufenraster (29.09.2026): wörtlich = „sehr leicht", Paraphrase = mittel – bewusst mischen statt Wortgleichheit zu verbieten
    '- Wörtlich übernehmbare Antworten sind erlaubt, aber nur als „sehr leichte" Items (Stufe 1). Mische die Stufen: Paraphrase, Synonym und das Zusammenführen mehrerer Stellen machen Items schwerer.',
    stufenAnteile ? stufenMixHinweis(stufenAnteile) : '',
    many
      ? '- Reihenfolge auf dem Blatt: Hörtext 1, dann alle Aufgaben zu Hörtext 1, dann Hörtext 2, dann alle Aufgaben zu Hörtext 2 – und so weiter. Jede Aufgabe nennt in der Arbeitsanweisung, zu welchem Hörtext sie gehört.'
      : '- Die Aufgaben stehen unter dem Hörtext.',
    `- Erfinde keine weiteren Hörtexte; es sind genau ${list.length}.`
  )
  return lines.filter(Boolean).join('\n')
}

/**
 * Ein vorhandener Hörtext-Baustein als Skript – etwa wenn die Lehrkraft das Transkript eines
 * Verlagshörtextes eingelesen hat (29.09.2026). Dann schreibt die KI keinen neuen Text; die
 * Aufgaben entstehen zum eingelesenen Transkript, gespielt wird die Originalaufnahme.
 */
export function skriptAusBaustein(block: Pick<AudioBlock, 'title' | 'textType' | 'transcript' | 'plays' | 'beforeListening'>): ListeningScript {
  const namen = [
    ...new Set(
      block.transcript
        .split('\n')
        .map((z) => /^([\p{Lu}][\p{L}\s.'-]{0,24}):/u.exec(z.trim())?.[1]?.trim() ?? '')
        .filter(Boolean)
    )
  ].slice(0, 4)
  return {
    title: block.title.trim() || 'Listening',
    textType: block.textType.trim() || 'Hörtext',
    transcript: block.transcript.trim(),
    speakers: namen,
    beforeListening: block.beforeListening.trim(),
    plays: Math.max(1, Math.min(3, Math.round(block.plays) || 2))
  }
}

/**
 * Ordnet jede Hörverstehensaufgabe ihrem Hörtext zu.
 *
 * Die KI liefert die Aufgaben in der richtigen Reihenfolge – erst der Hörtext, dann die
 * Aufgaben dazu –, aber ohne Verweis darauf, zu welchem Text eine Aufgabe gehört. Ohne diesen
 * Verweis lässt sich nichts prüfen: Bei zwei Hörtexten würde eine Lösung gegen BEIDE Skripte
 * geprüft und käme auch dann durch, wenn sie im falschen steht.
 *
 * Zugeordnet wird deshalb nach der Stellung: Jede Aufgabe gehört zu dem Hörtext, der zuletzt
 * vor ihr stand. Aufgaben vor dem ersten Hörtext bleiben ohne Zuordnung – sie prüfen dann
 * etwas anderes.
 */
export function linkListeningTasks(blocks: WsBlock[]): number {
  let current: string | null = null
  let linked = 0
  for (const block of blocks) {
    if (block.type === 'audio') {
      current = block.id
      continue
    }
    if (block.type !== 'task' || !current) continue
    // Nur Aufgaben, die wirklich Hörverstehen prüfen – ein Schreibauftrag danach gehört nicht dazu
    if (block.skill && block.skill !== 'listening') continue
    block.audioId = current
    linked++
  }
  return linked
}
