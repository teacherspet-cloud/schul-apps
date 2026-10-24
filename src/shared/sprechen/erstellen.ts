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
import { dialogRollen, hilfenBereinigt, type DialogHilfen, type FehlenderInhalt, type SprechKarte } from './karten'
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

const texte = (min: number, max: number): Record<string, unknown> => ({ type: 'array', minItems: min, maxItems: max, items: { type: 'string' } })
const WORTSCHATZ = (min: number, max: number): Record<string, unknown> => ({
  type: 'array',
  minItems: min,
  maxItems: max,
  items: { type: 'object', additionalProperties: false, required: ['wort', 'deutsch'], properties: { wort: { type: 'string' }, deutsch: { type: 'string' } } }
})
const ROLLE: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'karte', 'vorschlaege', 'wortschatz', 'beispiele'],
  properties: { name: { type: 'string' }, karte: { type: 'string' }, vorschlaege: texte(3, 5), wortschatz: WORTSCHATZ(4, 10), beispiele: texte(2, 3) }
}

/**
 * Hilfen für die Partnerarbeit (24.10.2026, abgestimmt): kommen bei neuen Karten gleich mit und lassen sich für vorhandene
 * Karten nachträglich ergänzen (`ergaenzungsAnfrage`). Knapp gehalten, damit die Antwort nicht abreißt.
 */
export const HILFEN_SCHEMA: Record<KartenTeil, Record<string, unknown>> = {
  interview: {
    type: 'object',
    additionalProperties: false,
    required: ['nachfragen', 'wortschatz', 'beispiele'],
    properties: { nachfragen: texte(3, 10), wortschatz: WORTSCHATZ(5, 12), beispiele: texte(2, 3) }
  },
  monolog: {
    type: 'object',
    additionalProperties: false,
    required: ['auftrag', 'zusatzfragen', 'wortschatz', 'beispiele'],
    properties: { auftrag: { type: 'string' }, zusatzfragen: texte(3, 4), wortschatz: WORTSCHATZ(6, 12), beispiele: texte(2, 3) }
  },
  dialog: { type: 'object', additionalProperties: false, required: ['rollen'], properties: { rollen: { type: 'array', minItems: 2, maxItems: 3, items: ROLLE } } }
}

const SCHEMA: Record<KartenTeil, Record<string, unknown>> = {
  interview: {
    type: 'object',
    additionalProperties: false,
    required: ['thema', 'fragen', 'hilfen'],
    properties: { thema: { type: 'string' }, fragen: { type: 'array', minItems: 5, maxItems: 8, items: { type: 'string' } }, hilfen: HILFEN_SCHEMA.interview }
  },
  monolog: {
    type: 'object',
    additionalProperties: false,
    required: ['titel', 'bildBeschreibung', 'bildPrompt', 'leitfragen', 'hilfen'],
    properties: {
      titel: { type: 'string' },
      bildBeschreibung: { type: 'string' },
      bildPrompt: { type: 'string' },
      leitfragen: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'string' } },
      hilfen: HILFEN_SCHEMA.monolog
    }
  },
  dialog: {
    type: 'object',
    additionalProperties: false,
    required: ['form', 'titel', 'situation', 'rolleSchueler', 'rolleKi', 'punkte', 'ziel', 'hilfen'],
    properties: {
      form: { type: 'string', enum: ['rollenspiel', 'infogap', 'diskussion'] },
      titel: { type: 'string' },
      situation: { type: 'string' },
      rolleSchueler: { type: 'string' },
      rolleKi: { type: 'string' },
      punkte: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'string' } },
      ziel: { type: 'string' },
      hilfen: HILFEN_SCHEMA.dialog
    }
  }
}

/** Anweisungen zu den Hilfen je Teil (Englisch, für Erzeugen und Ergänzen gleich) */
const HILFEN_REGELN: Record<KartenTeil, string> = {
  interview:
    '- hilfen: nachfragen = one short follow-up question per question (same order as fragen); wortschatz = 5–12 useful words or phrases for the answers, each with its German translation; beispiele = 2–3 model answers of one or two sentences.',
  monolog:
    '- hilfen: auftrag = the task the examiner reads out (e.g. "Describe the picture. Say who …"); zusatzfragen = 3–4 extra prompts if the student gets stuck; wortschatz = 6–12 words for the picture with German translation; beispiele = 2–3 model sentences.',
  dialog:
    '- hilfen.rollen = 2 or 3 roles. rollen[0] is the student role (its karte = rolleSchueler), rollen[1] the partner role (its karte = rolleKi); these two MUST form a complete two-person task on their own. rollen[2] is a third participant for groups of three: rollenspiel = a third character in the situation; infogap = a second information holder with its own complementary info card (role 1 asks both); diskussion = a third opinion or third proposer. Each role: name, karte (the role card text, for infogap including all its information), vorschlaege = 3–5 concrete ideas, arguments or questions for this role, wortschatz = 4–10 words with German translation, beispiele = 2–3 model sentences for this role.'
}

/** Kartenfelder je Teil – auch die Prüfung (pruefen.ts) gibt sie korrigiert zurück */
export const KARTEN_SCHEMA = SCHEMA

/** Erlaubte Dialogformen je Jahrgang (wie in der Anfrage unten; 21.10.2026 für die Prüfung herausgezogen) */
export function erlaubteDialogFormen(jahrgang: number): ('rollenspiel' | 'infogap' | 'diskussion')[] {
  if (jahrgang >= 11) return ['diskussion']
  if (jahrgang <= 6) return ['rollenspiel', 'infogap', 'diskussion']
  return jahrgang <= 8 ? ['rollenspiel', 'infogap'] : ['diskussion', 'infogap']
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
      HILFEN_REGELN[teil],
      '- All card texts in the target language (German only in the wortschatz translations); keep them short and clear for the level.'
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: `sprechkarten_${teil}`,
    schema: { type: 'object', additionalProperties: false, required: ['karten'], properties: { karten: { type: 'array', minItems: 1, maxItems: 8, items: SCHEMA[teil] } } }
  }
}

/** Wie die Anfrage die vorhandene Karte beschreibt (ohne Hilfen, Bilder und Stand) */
function kartenKern(k: SprechKarte): Record<string, unknown> {
  if (k.art === 'interview') return { thema: k.thema, fragen: k.fragen }
  if (k.art === 'monolog') return { titel: k.titel, bildBeschreibung: k.bildBeschreibung, leitfragen: k.leitfragen }
  return { form: k.form, titel: k.titel, situation: k.situation, rollen: dialogRollen(k).map((r) => ({ name: r.name, karte: r.karte })), punkte: k.punkte, ziel: k.ziel }
}

/**
 * Fehlende Inhalte einer vorhandenen Karte ergänzen (24.10.2026, Knopf „Fehlende Inhalte ergänzen"): Interview und
 * Bildkarte bekommen nur `hilfen` zurück; die Dialogkarte kommt als ganze überarbeitete Karte zurück, weil die KI das Set
 * für drei Personen umarbeiten darf (Wunsch der Lehrkraft) – Rollen 1 und 2 müssen allein ein Zweier-Set bleiben.
 */
export function ergaenzungsAnfrage(teil: KartenTeil, karte: SprechKarte, fehlt: FehlenderInhalt[], g: Grundlage): StructuredRequest {
  const dialog = teil === 'dialog'
  const was = fehlt.includes('hilfen') ? 'the helps' : fehlt.includes('beispiele') ? 'the model sentences (beispiele)' : 'the third role'
  return {
    system:
      'You are an experienced foreign-language teacher in Lower Saxony (Germany) who completes speaking-exam materials for partner work in class. You write in the target language, at the right level, age-appropriate, inclusive and free of stereotypes.',
    user: [
      `Here is an existing ${teil} card for an oral exam in ${SPRACHNAME[g.sprache]}, year ${g.jahrgang} (CEFR target ${g.niveau})${g.quelle ? `, ${g.quelle}` : ''}:`,
      JSON.stringify(kartenKern(karte)),
      `Add ${was}. In class two (or three) students work with this card without a teacher: one asks or moderates and can unlock helps for the other.`,
      HILFEN_REGELN[teil],
      dialog
        ? `- Return the WHOLE revised card (form stays ${karte.art === 'dialog' ? karte.form : 'the same'}, keep title and topic). You may rephrase, rebalance the roles and redistribute information so the task works for two AND for three speakers. rollen[0] and rollen[1] must remain a complete two-person task; rollen[2] is the third participant. rolleSchueler = rollen[0].karte, rolleKi = rollen[1].karte.`
        : '- Keep the card itself as it is; only the helps are needed.',
      g.themen.length ? `Curriculum topics of this year: ${g.themen.slice(0, 20).join('; ')}` : '',
      g.woerter.length ? `Known vocabulary (prefer these words): ${g.woerter.slice(-250).join(', ')}` : '',
      '- All texts in the target language (German only in the wortschatz translations); short and clear for the level. No personal data (address, phone).'
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: `sprechkarten_ergaenzung_${teil}`,
    schema: dialog ? SCHEMA.dialog : { type: 'object', additionalProperties: false, required: ['hilfen'], properties: { hilfen: HILFEN_SCHEMA[teil] } }
  }
}

/**
 * Antwort der Ergänzung auf die Karte anwenden: Hilfen bereinigt übernehmen, Status 'ki'; bei der Dialogkarte auch
 * die überarbeiteten Felder (Bild, Stand und Kennung bleiben immer die der vorhandenen Karte). null = unbrauchbar.
 */
export function ergaenzungAnwenden(karte: SprechKarte, antwort: unknown): SprechKarte | null {
  const a = (antwort ?? {}) as Record<string, unknown>
  const hilfen = hilfenBereinigt(karte.art, a.hilfen)
  if (!hilfen) return null
  if (karte.art !== 'dialog') return { ...karte, hilfen, hilfenStatus: 'ki' } as SprechKarte
  const rollen = (hilfen as { rollen: { karte: string }[] }).rollen
  const str = (x: unknown, alt: string): string => (typeof x === 'string' && x.trim() ? x.trim() : alt)
  const form = a.form === 'infogap' || a.form === 'diskussion' || a.form === 'rollenspiel' ? a.form : karte.form
  const punkte = Array.isArray(a.punkte) && a.punkte.length >= 2 ? a.punkte.map((x) => String(x)) : karte.punkte
  return {
    ...karte,
    form,
    // Der Titel bleibt – er ist für die Lehrkräfte die Kennung der Karte (Druckset, Freigaben, Suche)
    titel: karte.titel,
    situation: str(a.situation, karte.situation),
    rolleSchueler: rollen[0].karte || str(a.rolleSchueler, karte.rolleSchueler),
    rolleKi: rollen[1].karte || str(a.rolleKi, karte.rolleKi),
    punkte,
    ziel: str(a.ziel, karte.ziel),
    hilfen: hilfen as DialogHilfen,
    hilfenStatus: 'ki'
  }
}
