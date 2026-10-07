/**
 * Unregelmäßige Verben für Lernende (07.10.2026, im Plan-Modus mit der Lehrkraft abgestimmt): Lernkarten aus der
 * Verbliste eines Bandes – im Grammatiktraining als eigene Freigabe und automatisch im Vokabeltraining. Formen werden
 * fest geprüft (ohne KI): Varianten wie „burnt/burned" zählen alle, Längenzeichen nicht.
 *
 * Bild und Aussprache liegen in der Medienbank unter der Grundform (`medienSchluesselVerb`); die Formen als
 * „Sätze" mit dem gesprochenen Text (`sprechtext`) – so teilen alle Bände und die Vokabellisten dieselben Medien.
 */
import { grundformVon, varianten, VERB_SPALTEN, type VerbEintrag, type VerbSprache } from './verben'
import type { GrammatikAufgabe } from './grammatiktrainer'

export interface VerbKarte {
  id: string
  /** Formen je Spalte (ohne die deutsche), wörtlich aus der Liste */
  formen: Record<string, string>
  /** Deutsche Bedeutung */
  de: string
  /** Schlüssel der Medienbank (Grundform) */
  schluessel: string
}

export interface VerbSpalteKurz {
  id: string
  label: string
}

/** Spalten mit Formen (ohne die deutsche Bedeutung) */
export const formSpalten = (sprache: VerbSprache): VerbSpalteKurz[] =>
  VERB_SPALTEN[sprache].filter((s) => !s.deutsch).map((s) => ({ id: s.id, label: s.label }))

/** Medienbank-Schlüssel eines Verbs: Grundform ohne „(to)"/„to" und ohne Klammerzusätze („go") */
export function medienSchluesselVerb(e: VerbEintrag, sprache: VerbSprache): string {
  return grundformVon(e, sprache)
    .replace(/^\s*\(to\)\s*|^\s*to\s+/i, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .split('/')[0]
    .trim()
}

/** Schlüssel einer Vokabel, die ein Verb ist („(to) go" → „go") – zum Abgleich mit `VerbKarte.schluessel` */
export const verbSchluesselVonWort = (term: string): string =>
  term
    .replace(/^\s*\(to\)\s*|^\s*to\s+/i, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .split('/')[0]
    .trim()
    .toLowerCase()

/** So wird eine Zelle gesprochen: „burnt/burned" → „burnt, burned", Klammern ohne Klammerzeichen */
export const sprechtext = (s: string): string =>
  s
    .replace(/\s*\/\s*/g, ', ')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Karten aus den Einträgen einer Verbliste (nur Verben mit mindestens zwei Formen) */
export function verbKarten(eintraege: VerbEintrag[], sprache: VerbSprache): VerbKarte[] {
  const spalten = formSpalten(sprache)
  const de = VERB_SPALTEN[sprache].find((s) => s.deutsch)
  return eintraege
    .map((e) => ({
      id: e.id,
      formen: Object.fromEntries(spalten.filter((s) => e.formen[s.id]?.trim()).map((s) => [s.id, e.formen[s.id].trim()])),
      de: (de && e.formen[de.id]) || '',
      schluessel: medienSchluesselVerb(e, sprache)
    }))
    .filter((k) => Object.keys(k.formen).length >= 2 && k.schluessel)
}

/** Karten aus fremder Hand (Server: Paket, Freigabe) prüfen und kürzen */
export function bereinigeVerbKarten(roh: unknown): VerbKarte[] {
  const t = (x: unknown, n: number): string =>
    String(x ?? '')
      .trim()
      .slice(0, n)
  return (Array.isArray(roh) ? roh : []).slice(0, 300).flatMap((x) => {
    const y = (x ?? {}) as Record<string, unknown>
    const formen = Object.fromEntries(
      Object.entries((y.formen ?? {}) as Record<string, unknown>)
        .slice(0, 8)
        .map(([k, v]) => [k.slice(0, 12), t(v, 80)])
        .filter(([, v]) => v)
    )
    const schluessel = t(y.schluessel, 80)
    return Object.keys(formen).length >= 2 && schluessel ? [{ id: t(y.id, 60) || schluessel, formen, de: t(y.de, 120), schluessel }] : []
  })
}

/** Zurück zur Verbliste (für Muster und Fehlformen) */
export const alsEintrag = (k: VerbKarte): VerbEintrag => ({ id: k.id, formen: { ...k.formen } })

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̄̆]/g, '')
    .normalize('NFC')
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
/** Englisch: „(to) go" bzw. „to go" = „go" */
const ohneTo = (s: string): string => s.replace(/^\(?to\)?\s+/, '')

/** Passt die Antwort zu einer Zelle? Jede Variante zählt, Längenzeichen und „to" nicht */
export function formPasst(antwort: string, zelle: string): boolean {
  const a = ohneTo(norm(antwort))
  if (!a) return false
  const alle = varianten(zelle).map((v) => ohneTo(norm(v.replace(/\([^)]*\)/g, ''))))
  return alle.includes(a) || ohneTo(norm(zelle.replace(/\([^)]*\)/g, ''))) === a
}

/** In welchen Spalten steht diese Form? (cut – cut – cut: alle drei) */
export function spaltenDerForm(k: VerbKarte, form: string): string[] {
  return Object.entries(k.formen)
    .filter(([, zelle]) => formPasst(form, zelle))
    .map(([id]) => id)
}

/**
 * Lernkarten für den Kasten im Grammatiktraining: je Verb eine Tabellenzeile – Grundform vorgegeben, die übrigen
 * Formen ausfüllen; Zeilenname ist die deutsche Bedeutung.
 */
export function verbAufgaben(karten: VerbKarte[], sprache: VerbSprache): GrammatikAufgabe[] {
  const spalten = formSpalten(sprache)
  const grund = VERB_SPALTEN[sprache].find((s) => s.grundform)?.id ?? spalten[0]?.id
  return karten.map((k, i) => ({
    id: `v${i + 1}`,
    art: 'tabelle',
    regelId: 'verben',
    anweisung: 'Ergänze die Formen.',
    satz: k.de ? `${k.de}` : '',
    spalten: spalten.map((s) => s.label),
    zeilen: [
      {
        name: k.de || k.schluessel,
        loesungen: spalten.map((s) => k.formen[s.id] ?? ''),
        vorgabe: spalten.map((s) => s.id === grund)
      }
    ],
    loesungen: [spalten.map((s) => k.formen[s.id] ?? '').join(' | ')],
    erklaerung: `${spalten
      .map((s) => k.formen[s.id])
      .filter(Boolean)
      .join(' – ')}${k.de ? ` (${k.de})` : ''}`
  }))
}
