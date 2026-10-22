/**
 * Lösungsfilter für das Feedback an Lernende (22.10.2026, KI-Sicherheitsprüfung; Arbeitsblatt und Rückmeldebogen).
 *
 * Die Erwartung samt Lösung steht in der Anfrage an die KI („nicht verraten"). Ein Kind kann versuchen, sie mit einer
 * Anweisung im eigenen Text herauszulocken. Darum prüft der Server die Ausgabe: Steht in „gelungen", „fehlt", „schritt",
 * einem Randkommentar oder dem kurzen Hinweis eine Wortfolge der Erwartung, die das Kind nicht selbst geschrieben hat
 * (`verraetErwartung`, shared/kiSchutz.ts), wird NUR dieses Feld durch einen neutralen Text ersetzt. Gezählt wird nur
 * die Zahl der ersetzten Felder (kein Wortlaut im Protokoll).
 *
 * Faustregel: Kettenlänge 5 Wörter; bei kurzen Erwartungen (unter 5 Wörtern) die Länge der Erwartung, mindestens 2.
 */
import { verraetErwartung } from './kiSchutz'
import type { AufgabenFeedback } from './blattFreigabe'

export const NEUTRAL = {
  gelungen: 'Du hast an dieser Aufgabe gearbeitet.',
  fehlt: 'Vergleiche deine Antwort noch einmal genau mit der Aufgabenstellung.',
  schritt: 'Lies die Aufgabe und das Material noch einmal und überarbeite deine Antwort Schritt für Schritt.',
  rand: 'Sieh dir diese Stelle noch einmal an.',
  hinweis: 'Sieh dir deine Antwort zu dieser Aufgabe noch einmal genau an.'
} as const

/** Kettenlänge je Erwartung (siehe Kopf) */
export function kettenLaenge(erwartung: string): number {
  const n = String(erwartung ?? '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1).length
  return Math.max(2, Math.min(5, n))
}

/** Verrät dieser Text die Erwartung? (leer → nein) */
export function leck(text: string | undefined, erwartung: string, antwort: string): boolean {
  if (!text || !erwartung?.trim()) return false
  return verraetErwartung(text, erwartung, antwort, kettenLaenge(erwartung))
}

/** Feedback zu EINER Aufgabe filtern; `ersetzt` = Zahl der ersetzten Felder */
export function feedbackOhneLeck(fb: AufgabenFeedback, erwartung: string, antwort: string): { fb: AufgabenFeedback; ersetzt: number } {
  let ersetzt = 0
  const feld = (wert: string | undefined, neutral: string): string | undefined => {
    if (!leck(wert, erwartung, antwort)) return wert
    ersetzt++
    return neutral
  }
  const gelungen = feld(fb.gelungen, NEUTRAL.gelungen)
  const fehlt = feld(fb.fehlt, NEUTRAL.fehlt)
  const schritt = feld(fb.schritt, NEUTRAL.schritt)
  const markierungen = fb.markierungen?.map((m) => ({ ...m, text: feld(m.text, NEUTRAL.rand) ?? '' }))
  const strukturiert = Boolean(fb.gelungen || fb.fehlt || fb.schritt)
  // Zusammengefasster Text: aus den gefilterten Feldern neu, sonst selbst prüfen (ältere Antworten nur mit „text")
  const text = strukturiert
    ? [gelungen && `Gelungen: ${gelungen}`, fehlt && `Noch offen: ${fehlt}`, schritt && `Nächster Schritt: ${schritt}`].filter(Boolean).join('\n')
    : (feld(fb.text, NEUTRAL.hinweis) ?? '')
  return {
    fb: {
      ...fb,
      text,
      ...(gelungen ? { gelungen } : {}),
      ...(fehlt ? { fehlt } : {}),
      ...(schritt ? { schritt } : {}),
      ...(markierungen ? { markierungen } : {})
    },
    ersetzt
  }
}

/** Kurzer Hinweis (Einreichen, Feedback je Aufgabe) */
export function hinweisOhneLeck(hinweis: string, erwartung: string, antwort: string): { hinweis: string; ersetzt: number } {
  return leck(hinweis, erwartung, antwort) ? { hinweis: NEUTRAL.hinweis, ersetzt: 1 } : { hinweis, ersetzt: 0 }
}

/** Teile des Bogens, die Lernende sehen (Fazit je Aufgabe, Randkommentare, Schritte, Stärken, Überarbeitung) */
interface BogenTeile {
  staerken?: string[]
  schritte?: string[]
  schluss?: string
  aufgaben?: { nr: number; gelungen?: string; fehlt?: string; schritt?: string }[]
  rand?: { text: string }[]
  ueberarbeitung?: { zitat: string; auftrag: string }
}

/** Bogen filtern (in place auf einer Kopie); Erwartung = Erwartungshorizont der Rückmeldung */
export function bogenOhneLeck<B extends BogenTeile>(b: B, erwartung: string, antwort: string): { bogen: B; ersetzt: number } {
  let ersetzt = 0
  const feld = (wert: string | undefined, neutral: string): string | undefined => {
    if (!leck(wert, erwartung, antwort)) return wert
    ersetzt++
    return neutral
  }
  const bogen: B = {
    ...b,
    ...(b.staerken ? { staerken: b.staerken.map((s) => feld(s, NEUTRAL.gelungen) ?? '') } : {}),
    ...(b.schritte ? { schritte: b.schritte.map((s) => feld(s, NEUTRAL.schritt) ?? '') } : {}),
    ...(b.schluss ? { schluss: feld(b.schluss, NEUTRAL.hinweis) } : {}),
    ...(b.aufgaben
      ? {
          aufgaben: b.aufgaben.map((a) => ({
            ...a,
            ...(a.gelungen ? { gelungen: feld(a.gelungen, NEUTRAL.gelungen) } : {}),
            ...(a.fehlt ? { fehlt: feld(a.fehlt, NEUTRAL.fehlt) } : {}),
            ...(a.schritt ? { schritt: feld(a.schritt, NEUTRAL.schritt) } : {})
          }))
        }
      : {}),
    ...(b.rand ? { rand: b.rand.map((r) => ({ ...r, text: feld(r.text, NEUTRAL.rand) ?? '' })) } : {}),
    ...(b.ueberarbeitung ? { ueberarbeitung: { ...b.ueberarbeitung, auftrag: feld(b.ueberarbeitung.auftrag, NEUTRAL.schritt) ?? '' } } : {})
  }
  return { bogen, ersetzt }
}

/** Text, der in die Anfrage gehört, aber Teile von Lernenden enthalten kann (Befund mit Zitaten): ohne Trennzeichen */
export function ohneTrenner(text: string, marke: string): string {
  return String(text ?? '')
    .split(marke)
    .join('')
    .replace(/<<<|>>>/g, '')
    .replace(/\[\/?(?:ANFANG|ENDE)[^\]]*\]/gi, '')
}
