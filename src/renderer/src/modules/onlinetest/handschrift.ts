/**
 * Handschrift im Onlinetest – Erkennung (02.10.2026, gemeinsam für Server und Oberfläche).
 *
 * Abgestimmt mit der Lehrkraft:
 *  - Lernende schreiben mit Stift oder Finger in eine eigene Schreibfläche; die Tinte bleibt
 *    gespeichert und die Lehrkraft sieht sie neben dem erkannten Text.
 *  - Die Erkennung läuft, sobald kurz abgesetzt wird, damit die Lernenden schnell prüfen können,
 *    ob richtig erkannt wurde („erkannt als …").
 *  - KEINE Rechtschreibkorrektur: Die KI schreibt Buchstabe für Buchstabe ab, Fehler bleiben
 *    stehen. Recherche (02.10.2026): Systemerkennungen (Apple Scribble u. a.) und KI-Bildmodelle
 *    glätten Schreibfehler nachweislich – deshalb die ausdrückliche Vorgabe, die unsichere
 *    Stellen meldet, und die aufbewahrte Tinte als Beleg.
 *  - Die Anfrage stellen Lernende: nur mit API-Schlüssel der Lehrkraft (eigener oder von der
 *    Verwaltung freigegeben), nie über ein persönliches Abo.
 */
import type { StructuredRequest } from '@shared/types'

export interface Erkennung {
  /** Buchstabengetreu erkannter Text */
  text: string
  /** Stellen, die die KI nicht sicher lesen konnte */
  unsicher: boolean
}

const SPRACHE: Record<string, string> = { en: 'Englisch', fr: 'Französisch', es: 'Spanisch', it: 'Italienisch', la: 'Latein', de: 'Deutsch', nl: 'Niederländisch', ru: 'Russisch', pl: 'Polnisch', pt: 'Portugiesisch', tr: 'Türkisch' }

export function erkennungsAnfrage(png: string, zielsprache: string, kontext: string): StructuredRequest {
  return {
    schemaName: 'onlinetest_handschrift',
    system: [
      'Du liest Handschrift von Schülerinnen und Schülern aus einem Vokabeltest und schreibst sie EXAKT ab.',
      'Buchstabe für Buchstabe, genau so, wie es geschrieben steht. Rechtschreibfehler, falsche Endungen, fehlende oder zusätzliche Buchstaben, Groß- und Kleinschreibung und Satzzeichen bleiben GENAU so stehen.',
      'Verbessere NICHTS, ergänze nichts, rate kein „gemeintes“ Wort. Der Zusammenhang der Aufgabe dient nur dazu, unleserliche Buchstaben einzugrenzen – niemals, um eine Schreibweise zu korrigieren.',
      'Durchgestrichenes oder Weggekritzeltes gehört nicht dazu.',
      'Ist ein Buchstabe nicht sicher lesbar, nimm die wahrscheinlichste Lesart und setze unsicher = true.',
      'Leere Fläche: text = "".'
    ].join('\n'),
    user: `Sprache der Antwort: ${SPRACHE[zielsprache] ?? zielsprache}.\nAufgabe (nur zur Orientierung): ${kontext.slice(0, 600)}\nSchreibe die Handschrift im Bild exakt ab.`,
    images: [png],
    schema: {
      type: 'object',
      properties: { text: { type: 'string' }, unsicher: { type: 'boolean' } },
      required: ['text', 'unsicher'],
      additionalProperties: false
    }
  }
}

export function erkennungAus(antwort: unknown): Erkennung {
  const a = (antwort ?? {}) as { text?: unknown; unsicher?: unknown }
  return { text: String(a.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 1000), unsicher: a.unsicher === true }
}

/** Satz ↔ Wortkärtchen */
export const woerterVon = (text: string): string[] => text.split(/\s+/).filter(Boolean)
