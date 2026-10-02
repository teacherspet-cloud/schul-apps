/**
 * Freigegebene Arbeitsblätter (Etappe 5, 02.10.2026): gemeinsame Teile für Lehrkraft-Seite,
 * Lernenden-Seite und Server.
 *
 *  - `BlattAufgabe`: was der Server je Aufgabe kennt (Anweisung für die Lernenden, Erwartung samt
 *    Lösung NUR für die KI).
 *  - `BlattFeld`: ein Eingabefeld, gemessen auf dem Gerät der Lernenden (Linie, Lücke, Kästchen …),
 *    mit der Aufgabennummer, zu der es gehört.
 *  - `blattAbgabeText`: macht aus den Feldern einen lesbaren Text je Aufgabe (für Bogen und KI).
 *  - `aufgabenFeedbackAnfrage`: kurzes Feedback zu EINER Aufgabe, ohne die Lösung zu verraten.
 */
import type { StructuredRequest } from './types'

export interface BlattAufgabe {
  nr: number
  /** Arbeitsanweisung (wie auf dem Blatt) */
  anweisung: string
  /** Erwartung und Lösung – nur für die KI, nie an die Lernenden */
  erwartung: string
}

export type BlattFeldArt = 'text' | 'zeilen' | 'luecke' | 'flaeche' | 'kreuz'

export interface BlattFeld {
  id: string
  /** Aufgabennummer (0 = außerhalb einer nummerierten Aufgabe) */
  nr: number
  art: BlattFeldArt | string
  /** Seite (0-basiert) */
  seite: number
}

/** Antworten je Aufgabe als Text: „Aufgabe 2 (Anweisung): 1) … 2) …" – leere Felder fallen weg */
export function blattAbgabeText(aufgaben: BlattAufgabe[], felder: BlattFeld[], antworten: Record<string, string>): string {
  const nummern = [...new Set([...aufgaben.map((a) => a.nr), ...felder.map((f) => f.nr)])].sort((x, y) => x - y)
  const teile: string[] = []
  for (const nr of nummern) {
    const eigene = felder.filter((f) => f.nr === nr)
    const eintraege = eigene
      .map((f, i) => {
        const w = (antworten[f.id] ?? '').trim()
        if (!w) return ''
        return f.art === 'kreuz' ? `Kästchen ${i + 1}: angekreuzt` : `${i + 1}) ${w}`
      })
      .filter(Boolean)
    if (!eintraege.length) continue
    const a = aufgaben.find((x) => x.nr === nr)
    teile.push(
      `${nr ? `Aufgabe ${nr}` : 'Weitere Einträge'}${a?.anweisung ? ` (${a.anweisung.replace(/\s+/g, ' ').slice(0, 300)})` : ''}:\n${eintraege.join('\n')}`
    )
  }
  return teile.join('\n\n')
}

export interface AufgabenFeedback {
  einschaetzung: 'sicher' | 'teilweise' | 'noch nicht'
  text: string
}

/** Kurzes Feedback zu einer Aufgabe – lernförderlich, ohne Note und ohne die Lösung zu verraten */
export function aufgabenFeedbackAnfrage(a: BlattAufgabe, antwort: string, bilder: string[], sprache?: string): StructuredRequest {
  return {
    system:
      'Du bist eine erfahrene, freundliche Lehrkraft. Du gibst Lernenden während der Bearbeitung eines Arbeitsblatts ein kurzes, lernförderliches Feedback zu EINER Aufgabe. Sprich die Person mit „du" an.',
    user: [
      'REGELN:',
      '- Höchstens drei kurze Sätze: was schon gelingt, und EIN konkreter Hinweis, wo die Person noch einmal hinsehen sollte.',
      '- Verrate die Lösung NICHT – weder wörtlich noch umschrieben. Nenne bei Fehlern die Stelle (z. B. „Lücke 3"), nicht das richtige Wort. Gib Denkanstöße statt Antworten.',
      '- Keine Note, keine Punkte.',
      '- einschaetzung: „sicher" = alles richtig, „teilweise" = Ansätze richtig, „noch nicht" = überwiegend falsch oder leer.',
      sprache && sprache !== 'de' ? `- Schreibe das Feedback auf Deutsch; Zitate aus der Antwort bleiben in der Originalsprache (${sprache}).` : '',
      bilder.length ? '- Mit dem Stift Eingetragenes steht auf den beigefügten Seitenbildern; beziehe nur ein, was zu dieser Aufgabe gehört.' : '',
      `AUFGABE ${a.nr}: ${a.anweisung}`,
      `ERWARTUNG UND LÖSUNG (nur für dich, nicht verraten):\n${a.erwartung}`,
      'ANTWORT DER PERSON (zwischen <<< und >>>):',
      `<<<\n${antwort.trim() || '(nur handschriftlich, siehe Bild)'}\n>>>`
    ]
      .filter(Boolean)
      .join('\n'),
    ...(bilder.length ? { images: bilder.slice(0, 4) } : {}),
    schemaName: 'blatt_aufgabe_feedback',
    schema: {
      type: 'object',
      properties: { einschaetzung: { type: 'string', enum: ['sicher', 'teilweise', 'noch nicht'] }, text: { type: 'string' } },
      required: ['einschaetzung', 'text'],
      additionalProperties: false
    }
  }
}

export function aufgabenFeedbackAus(roh: unknown): AufgabenFeedback {
  const r = (roh ?? {}) as Record<string, unknown>
  const e = String(r.einschaetzung ?? '')
  return {
    einschaetzung: e === 'sicher' || e === 'teilweise' ? e : 'noch nicht',
    text: String(r.text ?? '')
      .trim()
      .slice(0, 1200)
  }
}
