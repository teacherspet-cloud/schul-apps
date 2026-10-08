/**
 * Diagnose-Schritt auswerten (08.10.2026, Wunsch der Lehrkraft): Nach dem Abschicken sehen die Lernenden je Frage ✓/✗
 * mit der richtigen Antwort. Auswahlfragen und wortgleiche Kurzantworten prüft der Server selbst; abweichende freie
 * Antworten beurteilt die KI kurz (eine Anfrage, Kontingent der Lehrkraft). Prozent aus beidem.
 * Reine Rechnungen (Tests: tests/diagnoseAuswertung.test.ts).
 */
import type { StructuredRequest } from './types'
import type { DiagnoseFrage } from './reihe'
import { normLuecke } from './blattPruefung'

export interface DiagnoseErgebnis {
  richtig: boolean
  /** Antwort der Person */
  antwort: string
  /** Richtige Antwort zum Anzeigen (mehrere mit „oder") */
  loesung: string
  /** Kurzer Hinweis der KI zu einer freien Antwort */
  hinweis?: string
  /** Von der KI beurteilt */
  ki?: boolean
}

const varianten = (richtig: string): string[] =>
  richtig
    .split('/')
    .map((r) => r.trim())
    .filter(Boolean)

export const diagnoseLoesung = (f: DiagnoseFrage): string => varianten(f.richtig).join(' oder ')

/** Stimmt die Antwort wortgleich (ohne Groß-/Kleinschreibung, Leerraum, Satzzeichen am Ende)? */
export const diagnoseGleich = (f: DiagnoseFrage, antwort: string): boolean => {
  const a = normLuecke(antwort)
  return Boolean(a) && varianten(f.richtig).some((r) => normLuecke(r) === a)
}

/**
 * Erster Durchgang ohne KI: Auswahl und wortgleiche Antworten entschieden, leere falsch. `offen` = Nummern freier
 * Antworten, die nicht wortgleich sind – sie gehen an die KI.
 */
export function diagnoseVorpruefen(fragen: DiagnoseFrage[], antworten: Record<string, string>): { ergebnis: (DiagnoseErgebnis | null)[]; offen: number[] } {
  const offen: number[] = []
  const ergebnis = fragen.map((f, i): DiagnoseErgebnis | null => {
    const antwort = (antworten[String(i)] ?? '').trim()
    const basis = { antwort, loesung: diagnoseLoesung(f) }
    if (!antwort) return { ...basis, richtig: false }
    if (diagnoseGleich(f, antwort)) return { ...basis, richtig: true }
    if (f.optionen.length) return { ...basis, richtig: false }
    offen.push(i)
    return null
  })
  return { ergebnis, offen }
}

/** Freie Antworten kurz prüfen lassen: richtig/falsch und ein Satz – ohne Note */
export function diagnoseAnfrage(
  fragen: DiagnoseFrage[],
  antworten: Record<string, string>,
  offen: number[],
  kontext: { fach?: string; jahrgang?: number } = {}
): StructuredRequest {
  return {
    system:
      'Du prüfst kurze Antworten einer Eingangsdiagnose. Du entscheidest je Antwort, ob sie inhaltlich richtig ist, und gibst einen sehr kurzen Hinweis. Sprich die Person mit „du" an.',
    user: [
      kontext.fach ? `FACH: ${kontext.fach}${kontext.jahrgang ? ` · JAHRGANG: ${kontext.jahrgang}` : ''}` : '',
      'REGELN:',
      '- richtig = true, wenn die Antwort inhaltlich der erwarteten entspricht (andere Worte, Synonyme, kleine Rechtschreibfehler sind in Ordnung, solange der Inhalt stimmt); sonst false.',
      '- hinweis: EIN kurzer Satz (höchstens 20 Wörter), warum es passt bzw. was nicht stimmt. Keine Note.',
      '- Gib für JEDE Frage genau einen Eintrag mit ihrer Nummer zurück.',
      ...offen.map((i) =>
        [`FRAGE ${i + 1}: ${fragen[i].frage}`, `ERWARTET: ${diagnoseLoesung(fragen[i])}`, `ANTWORT: <<<${(antworten[String(i)] ?? '').trim()}>>>`].join('\n')
      )
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'reihe_diagnose_pruefung',
    schema: {
      type: 'object',
      properties: {
        antworten: {
          type: 'array',
          items: {
            type: 'object',
            properties: { nr: { type: 'integer' }, richtig: { type: 'boolean' }, hinweis: { type: 'string' } },
            required: ['nr', 'richtig', 'hinweis'],
            additionalProperties: false
          }
        }
      },
      required: ['antworten'],
      additionalProperties: false
    }
  }
}

/**
 * Ergebnis zusammensetzen: Vorprüfung + KI-Urteile (Nummern wie in der Anfrage, ab 1). Ohne KI-Urteil (Fehler, fehlt)
 * gilt eine nicht wortgleiche Antwort als falsch.
 */
export function diagnoseAbschliessen(
  fragen: DiagnoseFrage[],
  antworten: Record<string, string>,
  vor: { ergebnis: (DiagnoseErgebnis | null)[] },
  kiRoh?: unknown
): { prozent: number; ergebnis: DiagnoseErgebnis[] } {
  const urteile = new Map<number, { richtig: boolean; hinweis: string }>()
  const liste = ((kiRoh ?? {}) as { antworten?: unknown }).antworten
  for (const x of Array.isArray(liste) ? liste : []) {
    const r = (x ?? {}) as Record<string, unknown>
    const i = Number(r.nr) - 1
    if (Number.isInteger(i) && !urteile.has(i))
      urteile.set(i, {
        richtig: r.richtig === true,
        hinweis: String(r.hinweis ?? '')
          .trim()
          .slice(0, 300)
      })
  }
  const ergebnis = fragen.map((f, i): DiagnoseErgebnis => {
    const schon = vor.ergebnis[i]
    if (schon) return schon
    const antwort = (antworten[String(i)] ?? '').trim()
    const u = urteile.get(i)
    return { antwort, loesung: diagnoseLoesung(f), richtig: Boolean(u?.richtig), ...(u ? { ki: true, ...(u.hinweis ? { hinweis: u.hinweis } : {}) } : {}) }
  })
  const prozent = fragen.length ? Math.round((ergebnis.filter((e) => e.richtig).length / fragen.length) * 100) : 0
  return { prozent, ergebnis }
}
