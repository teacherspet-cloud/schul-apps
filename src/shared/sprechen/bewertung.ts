/**
 * Einschätzung einer Sprechübung (19.10.2026, abgestimmt mit der Lehrkraft): nach dem Gespräch schätzt die Text-KI der
 * Lehrkraft das Transkript nach dem Bogen der Sprechprüfung ein (shared/sprechen/kriterien.ts) – Punkte 0–5 je
 * Kriterium, eine Stärke, 1–2 Tipps mit eigenem Satz → besserer Fassung, im Dialog Hinweise zu proaktivem
 * Gesprächsverhalten. Ausdrücklich eine Einschätzung zum Üben; Aussprache ohne Audio-Messung nur „unsicher".
 *
 * Belegt (Recherche „bewertung.md"): LLM-Bewertung mit fester Rubrik und Checkliste ist brauchbar, neigt aber zu
 * Milde und bevorzugt lange Antworten; Flüssigkeit kommt verlässlicher aus Zeitmaßen; Transkripte glätten Fehler.
 * Faustregel: Gesamteindruck nie mehr als 1 Punkt über dem Schnitt der vier Kriterien.
 */
import type { StructuredRequest } from '../types'
import { KRITERIEN, type KriteriumId, type Wertung } from './kriterien'
import { SPRACHNAME } from './anweisungen'
import type { Niveau, SprechSprache, Teil } from './niveaus'

export interface Kennzahlen {
  /** Sprechzeit der/des Lernenden (ms, aus dem Pegel im Browser) */
  sprechzeitMs: number
  /** Gesprächsdauer (ms) */
  dauerMs: number
  /** Pausen über 3 s, während die/der Lernende dran war */
  langePausen: number
}

export interface Tipp {
  /** Worum es geht (kurz, deutsch) */
  titel: string
  /** Eigener Satz aus dem Gespräch (Zielsprache) – leer, wenn es nicht um einen Satz geht */
  eigen: string
  /** Bessere Fassung (Zielsprache) */
  besser: string
  /** Kurze Erklärung (deutsch) */
  warum: string
}

export interface Einschaetzung {
  wertung: Wertung
  staerke: string
  tipps: Tipp[]
  /** Dialog: wie man das Gespräch selbst am Laufen hält */
  proaktiv?: string
  /** Hinweis, dass die Aussprache nur grob eingeschätzt ist */
  ausspracheUnsicher: boolean
}

export interface TranskriptZeile {
  rolle: 'ki' | 'schueler'
  text: string
}

/** Kennzahlen aus Transkript und Zeiten (pur) */
export function kennzahlenText(t: TranskriptZeile[], k: Kennzahlen): string {
  const eigene = t.filter((z) => z.rolle === 'schueler')
  const woerter = eigene.reduce((n, z) => n + z.text.split(/\s+/).filter(Boolean).length, 0)
  const ki = t.filter((z) => z.rolle === 'ki').reduce((n, z) => n + z.text.split(/\s+/).filter(Boolean).length, 0)
  const minuten = Math.max(0.1, k.sprechzeitMs / 60000)
  return [
    `Words spoken by the student: ${woerter} (AI partner/examiner: ${ki}; share of talk ${woerter + ki ? Math.round((woerter / (woerter + ki)) * 100) : 0} %).`,
    `Student turns: ${eigene.length}, mean length ${eigene.length ? Math.round(woerter / eigene.length) : 0} words.`,
    `Speaking time measured in the browser: ${Math.round(k.sprechzeitMs / 1000)} s of ${Math.round(k.dauerMs / 1000)} s; speech rate about ${Math.round(woerter / minuten)} words per minute; long pauses (> 3 s) during the student's turns: ${k.langePausen}.`
  ].join('\n')
}

export function bewertungsAnfrage(p: {
  sprache: SprechSprache
  teil: Teil
  niveau: Niveau
  transkript: TranskriptZeile[]
  kennzahlen: Kennzahlen
  aussprache?: { genauigkeit: number; fluessigkeit: number } | null
}): StructuredRequest {
  const kriterien = KRITERIEN.map((k) => `- ${k.id} (${k.name}): 5 = ${k.stufen[5]}; 3 = ${k.stufen[3]}; 1 = ${k.stufen[1]}`).join('\n')
  return {
    system:
      'Du bist eine erfahrene Fremdsprachenlehrkraft in Niedersachsen und schätzt Sprechübungen nach dem Bewertungsbogen der Sprechprüfung ein. Du bist fair, eher streng als mild, und lernförderlich. Sprich die Person mit „du" an.',
    user: [
      `Sprache: ${SPRACHNAME[p.sprache]} · Teil: ${p.teil} · Ziel-Niveau des Jahrgangs: GER ${p.niveau}. Miss die Leistung an diesem Ziel (3 Punkte = erwartbar für den Jahrgang).`,
      'KRITERIEN (je 0–5; 4 und 2 für Leistungen zwischen den Beschreibungen; 0 nur ohne bewertbare Äußerung):',
      kriterien,
      'REGELN:',
      '- Bewerte NUR die Äußerungen der/des Lernenden. Lange Antworten sind nicht automatisch besser; wiederholte Phrasen der KI zählen nicht.',
      '- Das Transkript stammt aus einer Spracherkennung und glättet Fehler und Füllwörter: sei bei Grammatik und Wortschatz vorsichtig, bei Flüssigkeit stütze dich auf die Zeitmaße.',
      p.aussprache
        ? `- Aussprache wurde gemessen: Genauigkeit ${Math.round(p.aussprache.genauigkeit)}/100, Flüssigkeit ${Math.round(p.aussprache.fluessigkeit)}/100 (Maßstab Muttersprachler – für Lernende milder auslegen).`
        : '- Aussprache: kein Audio gemessen. Schätze sie nur grob (meist 3) und setze ausspracheUnsicher = true.',
      '- gesamt (Gesamteindruck) höchstens 1 Punkt über dem Schnitt der vier anderen.',
      '- staerke: EINE konkrete Stärke mit kurzem Zitat.',
      '- tipps: 1–2 Tipps. Wo es um einen Satz geht: eigen = Satz der/des Lernenden (wörtlich), besser = verbesserte Fassung in der Zielsprache, warum = kurz auf Deutsch. Sonst eigen leer und besser = eine nützliche Wendung.',
      p.teil === 'dialog' || p.teil === 'simulation'
        ? '- proaktiv: 1–2 Sätze auf Deutsch, wie die/der Lernende das Gespräch selbst am Laufen halten kann (Rückfragen stellen, Vorschläge machen, auf den Partner eingehen) – mit einer Beispiel-Wendung in der Zielsprache.'
        : '- proaktiv: leer lassen.',
      '- Keine Note nennen. Das ist eine Einschätzung zum Üben.',
      '',
      'KENNZAHLEN:',
      kennzahlenText(p.transkript, p.kennzahlen),
      '',
      'TRANSKRIPT:',
      ...p.transkript.map((z) => `${z.rolle === 'ki' ? 'AI' : 'STUDENT'}: ${z.text}`)
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'sprechuebung_einschaetzung',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['handeln', 'flexibilitaet', 'wortschatz', 'aussprache', 'gesamt', 'staerke', 'tipps', 'proaktiv', 'ausspracheUnsicher'],
      properties: {
        handeln: { type: 'integer', minimum: 0, maximum: 5 },
        flexibilitaet: { type: 'integer', minimum: 0, maximum: 5 },
        wortschatz: { type: 'integer', minimum: 0, maximum: 5 },
        aussprache: { type: 'integer', minimum: 0, maximum: 5 },
        gesamt: { type: 'integer', minimum: 0, maximum: 5 },
        staerke: { type: 'string' },
        tipps: {
          type: 'array',
          maxItems: 2,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['titel', 'eigen', 'besser', 'warum'],
            properties: { titel: { type: 'string' }, eigen: { type: 'string' }, besser: { type: 'string' }, warum: { type: 'string' } }
          }
        },
        proaktiv: { type: 'string' },
        ausspracheUnsicher: { type: 'boolean' }
      }
    }
  }
}

const zahl = (x: unknown): number => Math.max(0, Math.min(5, Math.round(Number(x) || 0)))
const text = (x: unknown, max = 400): string => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** KI-Antwort prüfen und begrenzen (Gesamteindruck höchstens 1 über dem Schnitt) */
export function einschaetzungAus(roh: unknown, ohneAudio: boolean): Einschaetzung {
  const r = (roh ?? {}) as Record<string, unknown>
  const w: Wertung = {}
  for (const k of ['handeln', 'flexibilitaet', 'wortschatz', 'aussprache'] as KriteriumId[]) w[k] = zahl(r[k])
  const schnitt = (w.handeln! + w.flexibilitaet! + w.wortschatz! + w.aussprache!) / 4
  w.gesamt = Math.min(zahl(r.gesamt), Math.ceil(schnitt + 1))
  const tipps = (Array.isArray(r.tipps) ? r.tipps : [])
    .slice(0, 2)
    .map((t) => {
      const x = (t ?? {}) as Record<string, unknown>
      return { titel: text(x.titel, 80), eigen: text(x.eigen, 300), besser: text(x.besser, 300), warum: text(x.warum, 300) }
    })
    .filter((t) => t.titel && (t.besser || t.warum))
  return {
    wertung: w,
    staerke: text(r.staerke),
    tipps,
    ...(text(r.proaktiv) ? { proaktiv: text(r.proaktiv, 500) } : {}),
    ausspracheUnsicher: ohneAudio || r.ausspracheUnsicher === true
  }
}

/** Einschätzung der Attrappe (Browsertests ohne KI) */
export const ATTRAPPE_EINSCHAETZUNG: Einschaetzung = {
  wertung: { handeln: 3, flexibilitaet: 3, wortschatz: 3, aussprache: 3, gesamt: 3 },
  staerke: 'Du hast auf jede Frage geantwortet („I have two brothers").',
  tipps: [{ titel: 'Begründen', eigen: 'I like football.', besser: 'I like football because I can play with my friends.', warum: 'Mit „because" zeigst du mehr.' }],
  ausspracheUnsicher: true
}

/** Deutliche Versuche, die KI umzuprogrammieren oder zweckfremd zu nutzen (zusätzlich zur Erkennung durch die KI) */
export function istUmgehung(satz: string): boolean {
  return /\b(ignore|forget|disregard)\b.{0,30}\b(instructions?|rules?|prompt)\b|\bsystem ?prompt\b|\bjailbreak\b|\bpretend (you are|to be)\b|\b(do|write|solve) my homework\b|\bvergiss (deine|alle) (anweisungen|regeln)\b|\bignorier\w* (deine|alle) (anweisungen|regeln)\b/i.test(
    satz
  )
}
