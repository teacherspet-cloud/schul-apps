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
 *  - Erkannt wird mit dem KI-Zugang der Lehrkraft, die den Test angelegt und gestartet hat – auch
 *    über ihr Abo (Entscheidung der Lehrkraft, 02.10.2026); gebündelt je Test (server/onlinetest.ts).
 */
import type { StructuredRequest } from '@shared/types'

export interface Erkennung {
  /** Buchstabengetreu erkannter Text */
  text: string
  /** Stellen, die die KI nicht sicher lesen konnte */
  unsicher: boolean
}

const SPRACHE: Record<string, string> = { en: 'Englisch', fr: 'Französisch', es: 'Spanisch', it: 'Italienisch', la: 'Latein', de: 'Deutsch', nl: 'Niederländisch', ru: 'Russisch', pl: 'Polnisch', pt: 'Portugiesisch', tr: 'Türkisch' }

/**
 * Eine Anfrage für mehrere Schriftproben (02.10.2026): Was aus einem Test kurz nacheinander
 * ankommt, geht gebündelt an die KI – über das Abo dauert jede Anfrage einige Sekunden, und der
 * Server lässt nur wenige zugleich laufen. Bild i gehört zu `proben[i]`.
 */
export function erkennungsAnfrage(proben: { png: string; kontext: string }[], zielsprache: string): StructuredRequest {
  return {
    schemaName: 'onlinetest_handschrift',
    system: [
      'Du liest Handschrift von Schülerinnen und Schülern aus einem Vokabeltest und schreibst sie EXAKT ab.',
      'Buchstabe für Buchstabe, genau so, wie es geschrieben steht. Rechtschreibfehler, falsche Endungen, fehlende oder zusätzliche Buchstaben, Groß- und Kleinschreibung und Satzzeichen bleiben GENAU so stehen.',
      'Verbessere NICHTS, ergänze nichts, rate kein „gemeintes“ Wort. Der Zusammenhang der Aufgabe dient nur dazu, unleserliche Buchstaben einzugrenzen – niemals, um eine Schreibweise zu korrigieren.',
      'Durchgestrichenes oder Weggekritzeltes gehört nicht dazu.',
      'Ist ein Buchstabe nicht sicher lesbar, nimm die wahrscheinlichste Lesart und setze unsicher = true.',
      'Jedes Bild ist eine eigene Antwort. Leeres Bild: text = "".'
    ].join('\n'),
    user: [
      `Sprache der Antworten: ${SPRACHE[zielsprache] ?? zielsprache}.`,
      `Es folgen ${proben.length} Bild(er) in dieser Reihenfolge. Gib für jedes Bild (nr 1 bis ${proben.length}) den exakt abgeschriebenen Text an.`,
      ...proben.map((p, i) => `Bild ${i + 1} – Aufgabe (nur zur Orientierung): ${p.kontext.slice(0, 400)}`)
    ].join('\n'),
    images: proben.map((p) => p.png),
    schema: {
      type: 'object',
      properties: {
        ergebnisse: {
          type: 'array',
          items: {
            type: 'object',
            properties: { nr: { type: 'integer' }, text: { type: 'string' }, unsicher: { type: 'boolean' } },
            required: ['nr', 'text', 'unsicher'],
            additionalProperties: false
          }
        }
      },
      required: ['ergebnisse'],
      additionalProperties: false
    }
  }
}

/** Ergebnisse je Bild (fehlt eins, bleibt es leer und unsicher – die Lehrkraft sieht die Tinte) */
export function erkennungenAus(antwort: unknown, anzahl: number): Erkennung[] {
  const liste = (antwort as { ergebnisse?: unknown })?.ergebnisse
  const je = new Map<number, Erkennung>()
  if (Array.isArray(liste))
    for (const e of liste as { nr?: unknown; text?: unknown; unsicher?: unknown }[]) {
      const nr = Number(e?.nr)
      if (Number.isInteger(nr) && nr >= 1 && nr <= anzahl && !je.has(nr))
        je.set(nr, { text: String(e.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 1000), unsicher: e.unsicher === true })
    }
  return Array.from({ length: anzahl }, (_, i) => je.get(i + 1) ?? { text: '', unsicher: true })
}

/** Satz ↔ Wortkärtchen */
export const woerterVon = (text: string): string[] => text.split(/\s+/).filter(Boolean)
