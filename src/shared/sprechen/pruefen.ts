/**
 * Zweite KI-Anfrage für Sprechkarten (21.10.2026, Wunsch der Lehrkraft): Jede erzeugte Karte wird gegen die Vorgaben
 * geprüft, die schon der Erzeuger bekommt (erstellen.ts `kartenAnfrage`) – wie `gepruefterPool` bei der Grammatik: je
 * Karte ok/false, korrigierte Felder und ein Grund. Karten mit ok = false fallen weg. Rein rechnend, für Tests.
 *
 * Geprüfte Regeln (aus kartenAnfrage):
 *  1. Zielsprache, kurz und klar; Schwierigkeit passend zu Jahrgang und GER-Ziel.
 *  2. Wortschatz: bekannte Wörter bevorzugt, bis Klasse 6 keine unbekannten; nur bekannte bzw. gerade gelernte Grammatik.
 *  3. Lehrplan-Themen des Jahrgangs aufgegriffen.
 *  4. Prüfungsform je Teil: Interview 5–8 Fragen, offene zuerst, keine persönlichen Daten (Adresse, Telefon …);
 *     Bildkarte mit Titel, Bildbeschreibung (2–3 Sätze, passend zum Bild-Prompt), Bild-Prompt (realistisch, freundlich,
 *     kein Text im Bild, keine realen Personen), 3–5 Leitfragen, Oberstufe vergleichen und verallgemeinern, keine
 *     Gewalt, Tod, Sexualität, Mobbing, nichts Surreales; Dialog in der für den Jahrgang erlaubten Form, Situation,
 *     Rollen, 3–6 Punkte, Ziel; beim Info-Gap hat die Partnerrolle alle Informationen zu den Punkten.
 *  5. Altersgerecht, inklusiv, ohne Stereotype; keine realen Personen und Marken.
 *  6. Keine Wiederholung vorhandener Karten.
 */
import type { StructuredRequest } from '../types'
import { SPRACHNAME } from './anweisungen'
import { erlaubteDialogFormen, KARTEN_SCHEMA, type Grundlage, type KartenTeil } from './erstellen'

/** Regeln der Prüfung je Teil (Englisch, wie die Anfrage des Erzeugers) */
export function pruefRegeln(teil: KartenTeil, g: Grundlage): string[] {
  const oberstufe = g.jahrgang >= 11
  return [
    `- Target language ${SPRACHNAME[g.sprache]} for all card texts; short and clear; difficulty fits year ${g.jahrgang} (CEFR target ${
      g.niveau
    }) – neither far above nor trivially below.`,
    g.woerter.length
      ? `- Vocabulary: mainly the known words${g.jahrgang <= 6 ? '; NO unknown words (year 5–6)' : '; few unknown words'}.`
      : '- Vocabulary: typical for the year and level.',
    g.grammatikBekannt.length || g.grammatikNeu.length
      ? '- Grammar: only the known grammar and the grammar currently being learnt (listed below) is needed to do the task.'
      : '',
    g.themen.length ? '- Topic: fits one of the curriculum topics of the year (listed below).' : '',
    teil === 'interview'
      ? '- Interview: a topic and 5–8 questions, open ones first, then more specific ones; no questions about address, phone number or other personal data.'
      : '',
    teil === 'monolog'
      ? `- Picture card: title; bildBeschreibung (2–3 sentences, for the examiner) matches bildPrompt; bildPrompt describes ONE realistic, friendly everyday scene, no text in the image, no real persons, no brands, no violence, death, sexuality, bullying, nothing surreal; 3–5 guiding questions (describe, speculate, personal opinion)${
          oberstufe ? '; upper secondary: questions ask to compare and generalise' : ''
        }.`
      : '',
    teil === 'dialog'
      ? `- Dialogue card: form must be ${erlaubteDialogFormen(g.jahrgang).join(
          ' or '
        )}; a clear situation, the student role and the partner role; 3–6 points/options; a goal (how the talk ends).${
          erlaubteDialogFormen(g.jahrgang).includes('infogap') ? ' For infogap the partner role contains the full information for every point.' : ''
        }`
      : '',
    '- Age-appropriate, inclusive, free of stereotypes; no real persons, no brands.',
    '- Not a repetition of a card already in the pool (listed below).'
  ].filter(Boolean)
}

/** Felder, die die Prüfung korrigiert zurückgibt (die des Erzeugers ohne die Hilfen – geprüft wird der Kerninhalt, 24.10.2026) */
const FELDER = (teil: KartenTeil): Record<string, unknown> =>
  Object.fromEntries(Object.entries((KARTEN_SCHEMA[teil].properties ?? {}) as Record<string, unknown>).filter(([f]) => f !== 'hilfen'))

/** Die Prüfanfrage: Karten nummeriert, Regeln, Grundlage; Antwort je Karte ok, Grund und korrigierte Felder */
export function pruefAnfrage(teil: KartenTeil, karten: Record<string, unknown>[], g: Grundlage, vorhanden: string[]): StructuredRequest {
  const felder = FELDER(teil)
  return {
    system:
      'You are an experienced foreign-language teacher in Lower Saxony (Germany) who reviews speaking-exam cards written by a colleague, carefully and strictly.',
    user: [
      `Review these ${karten.length} ${teil} cards for an oral exam in ${SPRACHNAME[g.sprache]}, year ${g.jahrgang} (CEFR target ${
        g.niveau
      }). For each card: does it meet ALL rules?`,
      'Rules:',
      ...pruefRegeln(teil, g),
      g.quelle ? `Basis: ${g.quelle}.` : '',
      g.woerter.length ? `Known vocabulary: ${g.woerter.slice(-350).join(', ')}` : '',
      g.grammatikBekannt.length ? `Known grammar: ${g.grammatikBekannt.join('; ')}` : '',
      g.grammatikNeu.length ? `Currently learning: ${g.grammatikNeu.join('; ')}` : '',
      g.themen.length ? `Curriculum topics: ${g.themen.slice(0, 20).join('; ')}` : '',
      vorhanden.length ? `Already in the pool: ${vorhanden.slice(0, 40).join(' | ')}` : '',
      'If a card can be fixed by small changes, return ok = true with the corrected fields. If it breaks a rule that cannot be fixed (wrong form, unsuitable topic, far too difficult, a repetition), return ok = false. Always return all fields (unchanged if correct). grund: short, in German.',
      '',
      ...karten.map((k, i) => `${i + 1}. ${JSON.stringify(Object.fromEntries(Object.keys(felder).map((f) => [f, k[f]])))}`)
    ]
      .filter((z) => z !== '')
      .join('\n'),
    schemaName: `sprechkarten_pruefung_${teil}`,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['urteile'],
      properties: {
        urteile: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['nr', 'ok', 'grund', ...Object.keys(felder)],
            properties: { nr: { type: 'integer' }, ok: { type: 'boolean' }, grund: { type: 'string' }, ...felder }
          }
        }
      }
    }
  }
}

export interface PruefErgebnis {
  bestanden: Record<string, unknown>[]
  gestrichen: { titel: string; grund: string }[]
}

const titelVon = (k: Record<string, unknown>): string => String(k.titel ?? k.thema ?? '').trim()
const leer = (x: unknown): boolean => x === undefined || x === null || (typeof x === 'string' && !x.trim()) || (Array.isArray(x) && !x.length)

/**
 * Urteile anwenden: ok = false streicht, sonst ersetzen korrigierte Felder die alten (leere Felder bleiben, wie sie
 * waren). Ohne Urteil bleibt die Karte. Karten mit dem Titel einer vorhandenen fallen zusätzlich weg.
 */
export function pruefErgebnisAnwenden(
  teil: KartenTeil,
  karten: Record<string, unknown>[],
  antwort: { urteile?: (Record<string, unknown> & { nr?: number; ok?: boolean; grund?: string })[] } | null | undefined,
  vorhanden: string[] = []
): PruefErgebnis {
  const felder = Object.keys(FELDER(teil))
  const nachNr = new Map((antwort?.urteile ?? []).map((u) => [Number(u.nr), u]))
  const schon = new Set(vorhanden.map((t) => t.trim().toLowerCase()).filter(Boolean))
  const aus: PruefErgebnis = { bestanden: [], gestrichen: [] }
  karten.forEach((k, i) => {
    const u = nachNr.get(i + 1)
    if (u && u.ok === false) {
      aus.gestrichen.push({ titel: titelVon(k), grund: String(u.grund ?? '').trim() || 'ohne Angabe' })
      return
    }
    const neu = { ...k }
    if (u) for (const f of felder) if (!leer(u[f])) neu[f] = u[f]
    const t = titelVon(neu).toLowerCase()
    if (t && schon.has(t)) {
      aus.gestrichen.push({ titel: titelVon(neu), grund: 'gibt es schon im Pool' })
      return
    }
    if (t) schon.add(t)
    aus.bestanden.push(neu)
  })
  return aus
}

/** „x von y Karten bestanden die Prüfung" mit bis zu drei Gründen */
export function pruefBerichtText(b: { geprueft: number; bestanden: number; gruende: string[] }): string {
  const gruende = [...new Set(b.gruende)].slice(0, 3)
  return `${b.bestanden} von ${b.geprueft} Karten bestanden die Prüfung${gruende.length ? ` – gestrichen u. a.: ${gruende.join('; ')}` : ''}`
}
