/**
 * Sprechkarten mit der KI erstellen (19.10.2026, App „Sprechprüfungen", abgestimmt): je Teil auf Knopfdruck, Grundlage
 * wählbar – Lehrwerk bis Unit (Wortschatz, Grammatik) oder Stand einer Klasse – dazu die Lehrplan-Themen des Jahrgangs.
 * Form und Schwierigkeit orientieren sich an den Materialien der Lehrkraft (Prüfungssets Jg 5, Rollenspiele Jg 7,
 * Info-Gap/Paired discussion Jg 9, Oral Exam Jg 10 – Typen beschrieben, keine wörtlichen Inhalte; teils gekauftes
 * Material) und an den Materialbänden des Landes (belegt: Interview zu Family/Free time/School, Monolog zu Foto,
 * Info-Gap mit Info- und Prompt-Karte, Diskussion „choose two of six", Oberstufe Bilder vergleichen + abstrahieren).
 */
import type { StructuredRequest } from '../types'
import { SPRACHNAME } from './anweisungen'
import type { Niveau, SprechSprache } from './niveaus'

export type KartenTeil = 'interview' | 'monolog' | 'dialog'

export interface Grundlage {
  sprache: SprechSprache
  jahrgang: number
  niveau: Niveau
  /** z. B. „Green Line 2, bis Unit 3" */
  quelle: string
  woerter: string[]
  grammatikBekannt: string[]
  grammatikNeu: string[]
  themen: string[]
}

const VORBILD: Record<KartenTeil, string> = {
  interview:
    'Like teacher-made exam sets: a warm-up, then questions about personal life, family and home, free time, school, holidays, plans; in higher years opinions, media, the future, the world of work. Open questions first, then more guided follow-ups.',
  monolog:
    'Like "describing pictures" cards: one everyday photo-like scene for the student to describe (who, where, what is happening), speculate about and give a personal opinion on. Upper secondary: 2–3 pictures on one topic to compare and go beyond the description. No violence, death, sexuality, bullying; no surreal pictures.',
  dialog:
    'Like teacher-made role plays and paired tasks: years 5–6 "talk about these six ideas – which two are best?" (presents, weekend plans) or simple role plays (at the restaurant, a birthday present, at the doctor\'s, a bad mark); years 7–8 role plays and information-gap cards (one partner has an info card, the other asks with prompts: Where? When? Cost? …); years 9–10 paired discussions with a decision (school projects, clubs, trips); upper secondary: discussion, negotiating a compromise, no role play.'
}

const SCHEMA: Record<KartenTeil, Record<string, unknown>> = {
  interview: {
    type: 'object',
    additionalProperties: false,
    required: ['thema', 'fragen'],
    properties: { thema: { type: 'string' }, fragen: { type: 'array', minItems: 5, maxItems: 8, items: { type: 'string' } } }
  },
  monolog: {
    type: 'object',
    additionalProperties: false,
    required: ['titel', 'bildBeschreibung', 'bildPrompt', 'leitfragen'],
    properties: {
      titel: { type: 'string' },
      bildBeschreibung: { type: 'string' },
      bildPrompt: { type: 'string' },
      leitfragen: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'string' } }
    }
  },
  dialog: {
    type: 'object',
    additionalProperties: false,
    required: ['form', 'titel', 'situation', 'rolleSchueler', 'rolleKi', 'punkte', 'ziel'],
    properties: {
      form: { type: 'string', enum: ['rollenspiel', 'infogap', 'diskussion'] },
      titel: { type: 'string' },
      situation: { type: 'string' },
      rolleSchueler: { type: 'string' },
      rolleKi: { type: 'string' },
      punkte: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'string' } },
      ziel: { type: 'string' }
    }
  }
}

export function kartenAnfrage(teil: KartenTeil, anzahl: number, g: Grundlage, vorhanden: string[]): StructuredRequest {
  const oberstufe = g.jahrgang >= 11
  return {
    system:
      'You are an experienced foreign-language teacher in Lower Saxony (Germany) who writes speaking-exam materials. You write in the target language, at the right level, age-appropriate, inclusive and free of stereotypes.',
    user: [
      `Write ${anzahl} ${teil} cards for an oral exam in ${SPRACHNAME[g.sprache]}, year ${g.jahrgang} (CEFR target ${g.niveau}).`,
      `MODEL (form and difficulty, do NOT copy existing published material): ${VORBILD[teil]}`,
      g.themen.length ? `Curriculum topics of this year (use them): ${g.themen.slice(0, 20).join('; ')}` : '',
      g.quelle ? `Basis: ${g.quelle}.` : '',
      g.woerter.length
        ? `Known vocabulary (prefer these words; avoid unknown words${g.jahrgang <= 6 ? ' strictly' : ' where possible'}): ${g.woerter.slice(-350).join(', ')}`
        : '',
      g.grammatikBekannt.length ? `Known grammar the students can use: ${g.grammatikBekannt.join('; ')}` : '',
      g.grammatikNeu.length ? `Currently learning: ${g.grammatikNeu.join('; ')} (good to elicit).` : '',
      vorhanden.length ? `Already in the pool (do not repeat these): ${vorhanden.slice(0, 40).join(' | ')}` : '',
      teil === 'interview' ? '- Each card: a topic and 5–8 questions, open ones first, then more specific ones. No questions about address, phone number or other personal data.' : '',
      teil === 'monolog'
        ? `- Each card: title, what is on the picture (bildBeschreibung, 2–3 sentences, for the examiner), an English image prompt for an illustration (bildPrompt: realistic, friendly, no text in the image, no real persons), and 3–5 guiding questions.${oberstufe ? ' Upper secondary: the prompt describes one picture of a pair on the same topic; questions ask to compare and generalise.' : ''}`
        : '',
      teil === 'dialog'
        ? `- Each card: form (${g.jahrgang <= 8 ? 'rollenspiel or infogap; for years 5–6 also diskussion with six options' : oberstufe ? 'diskussion only' : 'diskussion or infogap'}), title, situation (what the card says), student role, the AI partner's role (for infogap: the full information the partner has), 3–6 points/options, goal.`
        : '',
      '- All card texts in the target language; keep them short and clear for the level.'
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: `sprechkarten_${teil}`,
    schema: { type: 'object', additionalProperties: false, required: ['karten'], properties: { karten: { type: 'array', minItems: 1, maxItems: 8, items: SCHEMA[teil] } } }
  }
}
