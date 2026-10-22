/**
 * Kontrollkanal des Sprechtrainings – Entscheidung je Ereignis (22.10.2026, KI-Sicherheitsprüfung), pur und testbar.
 *
 * Der Browser hält den Datenkanal `oai-events` und kann damit eigene Ereignisse an die Gesprächs-KI schicken. Der Server
 * sieht davon nur die Antworten der KI (Server-Ereignisse) im Kontrollkanal. Darum prüft er JEDES Ereignis:
 *  - conversation.item.created/added mit Text von der/dem Lernenden (input_text), mit Rolle system/developer oder mit
 *    gefälschter KI-Antwort als Text → Auflegen (zählt als „manipulation“). Gesprochenes kommt nur als input_audio.
 *  - response.created/done mit abweichenden Anweisungen, Werkzeugen, Ausgabearten, Tokengrenze oder außerhalb des
 *    Gesprächs (conversation „none“) → Antwort abbrechen und auflegen
 *  - Textausgabe der KI (response.output_text.* / response.text.*): die Sitzung ist auf Audio festgelegt → auflegen
 *  - session.updated → alle festgelegten Felder vergleichen; abweichend → zurücksetzen (Vorfall); Transkription aus →
 *    auflegen (ohne Transkript keine Moderation und keine Prüfung)
 * Belegt: Feldnamen wie in der Sitzungsbeschreibung beim Anmelden (POST /v1/realtime/calls, `type: 'realtime'`).
 * Faustregel: Felder, die das Ereignis nicht mitliefert, gelten als unverändert – lieber kein Fehlalarm, der ein Kind
 * zu Unrecht aus der Übung wirft. Nur ausdrücklich abgeschaltete Transkription (null) zählt als „aus“.
 */

/** Die beim Anmelden festgelegte Sitzung (Auszug, den der Kontrollkanal vergleicht) */
export interface FesteSitzung {
  instructions: string
  tools: { name: string }[]
  tool_choice: string
  output_modalities: string[]
  max_output_tokens: number
  audio: {
    input: {
      transcription: { model: string; language: string }
      turn_detection: { type: string; eagerness?: string }
    }
    output?: { voice?: string }
  }
}

export type KontrollEntscheidung =
  | { art: 'ok' }
  /** Sitzung auf die festgelegte Fassung zurücksetzen (Vorfall „manipulation“) */
  | { art: 'zuruecksetzen'; felder: string[] }
  /** Auflegen (Vorfall „manipulation“); `antwortId` = laufende Antwort, die vorher abgebrochen wird */
  | { art: 'auflegen'; felder: string[]; antwortId?: string }

type Obj = Record<string, unknown>
const obj = (x: unknown): Obj | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Obj) : null)
const gleicheListe = (a: unknown, b: string[]): boolean =>
  Array.isArray(a) && a.length === b.length && [...a].map(String).sort().join('|') === [...b].sort().join('|')
const werkzeugNamen = (t: unknown): string[] | null =>
  Array.isArray(t) ? t.map((x) => String(obj(x)?.name ?? obj(x)?.type ?? '?')) : null

/** Abweichende Felder einer Sitzungs- oder Antwortbeschreibung (nur die mitgelieferten Felder zählen) */
function abweichungen(s: Obj, fest: FesteSitzung, antwort: boolean): string[] {
  const f: string[] = []
  if (s.instructions !== undefined && s.instructions !== fest.instructions) f.push('instructions')
  if (s.tools !== undefined) {
    const n = werkzeugNamen(s.tools)
    if (!n || !gleicheListe(n, fest.tools.map((t) => t.name))) f.push('tools')
  }
  if (s.tool_choice !== undefined && JSON.stringify(s.tool_choice) !== JSON.stringify(fest.tool_choice)) f.push('tool_choice')
  // Beta-Name `modalities` wie GA-Name `output_modalities`
  for (const k of ['output_modalities', 'modalities'] as const)
    if (s[k] !== undefined && !gleicheListe(s[k], fest.output_modalities)) f.push(k)
  for (const k of ['max_output_tokens', 'max_response_output_tokens'] as const)
    if (s[k] !== undefined && s[k] !== fest.max_output_tokens) f.push(k)
  if (!antwort) {
    const ein = obj(obj(s.audio)?.input)
    if (ein) {
      if (ein.transcription !== undefined) {
        const tr = obj(ein.transcription)
        if (!tr) f.push('transcription_aus')
        else if ((tr.model !== undefined && tr.model !== fest.audio.input.transcription.model) || (tr.language !== undefined && tr.language !== fest.audio.input.transcription.language))
          f.push('transcription')
      }
      if (ein.turn_detection !== undefined) {
        const td = obj(ein.turn_detection)
        if (!td || td.type !== fest.audio.input.turn_detection.type || (td.eagerness !== undefined && td.eagerness !== fest.audio.input.turn_detection.eagerness))
          f.push('turn_detection')
      }
    }
    // Beta-Form (input_audio_transcription auf oberster Ebene)
    if (s.input_audio_transcription === null) f.push('transcription_aus')
  } else {
    // Antwort außerhalb des Gesprächs (eigene Anfrage am Gespräch vorbei)
    if (s.conversation === 'none' || s.conversation_id === 'none') f.push('conversation')
    if (Array.isArray(s.input)) f.push('input')
  }
  return f
}

/** Text in einem Gesprächseintrag, der nicht vom Mikrofon kommt */
function eintragManipuliert(item: Obj): string[] {
  const rolle = String(item.role ?? '')
  const typ = String(item.type ?? 'message')
  if (typ === 'function_call_output') return ['function_call_output']
  if (typ !== 'message') return []
  if (rolle === 'system' || rolle === 'developer') return [`rolle_${rolle}`]
  const inhalte = Array.isArray(item.content) ? item.content.map(obj).filter((x): x is Obj => Boolean(x)) : []
  if (rolle === 'user' && inhalte.some((c) => c.type === 'input_text' || c.type === 'text')) return ['input_text']
  if (rolle === 'assistant' && inhalte.some((c) => c.type === 'output_text' || c.type === 'text')) return ['assistant_text']
  return []
}

/** Entscheidung für EIN Ereignis aus dem Kontrollkanal */
export function kontrollEreignis(e: unknown, fest: FesteSitzung): KontrollEntscheidung {
  const ev = obj(e)
  if (!ev) return { art: 'ok' }
  const typ = String(ev.type ?? '')
  if (typ === 'conversation.item.created' || typ === 'conversation.item.added' || typ === 'conversation.item.done') {
    const item = obj(ev.item)
    const f = item ? eintragManipuliert(item) : []
    return f.length ? { art: 'auflegen', felder: f } : { art: 'ok' }
  }
  if (typ === 'response.created' || typ === 'response.done') {
    const r = obj(ev.response)
    const f = r ? abweichungen(r, fest, true) : []
    return f.length ? { art: 'auflegen', felder: f, ...(typeof r?.id === 'string' ? { antwortId: r.id } : {}) } : { art: 'ok' }
  }
  if (/^response\.(output_)?text\.(delta|done)$/.test(typ))
    return { art: 'auflegen', felder: ['text_ausgabe'], ...(typeof ev.response_id === 'string' ? { antwortId: ev.response_id } : {}) }
  if (typ === 'session.updated' || typ === 'session.created') {
    const s = obj(ev.session)
    const f = s ? abweichungen(s, fest, false) : []
    if (!f.length) return { art: 'ok' }
    return f.includes('transcription_aus') ? { art: 'auflegen', felder: f } : { art: 'zuruecksetzen', felder: f }
  }
  return { art: 'ok' }
}

/** Moderationsergebnis getrennt nach Kategorien: Selbstgefährdung ist Krise (nie Vorfall), sonst unangemessen */
export function moderationsUrteil(r: unknown): 'krise' | 'unangemessen' | null {
  const x = obj(Array.isArray(obj(r)?.results) ? (obj(r)!.results as unknown[])[0] : null)
  if (!x) return null
  const kat = obj(x.categories) ?? {}
  const an = Object.entries(kat).filter(([, v]) => v === true).map(([k]) => k)
  if (an.some((k) => k.startsWith('self-harm') || k.startsWith('self_harm'))) return 'krise'
  if (x.flagged === true) return 'unangemessen'
  return null
}
