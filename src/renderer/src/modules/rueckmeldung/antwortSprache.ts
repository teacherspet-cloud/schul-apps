/**
 * In welcher Sprache die Antwort verlangt ist (29.09.2026, Wunsch der Lehrkraft: „automatisches
 * Erkennen der Zielsprache – schon direkt nach Auswahl der Aufgabe –, um korrekt einzuschätzen, in
 * welcher Sprache die Schülerantworten in welcher Teilaufgabe verwendet werden müssen").
 *
 * Ohne KI, aus dem Aufgabentext:
 * - „auf Deutsch", „ins Deutsche", „into German" … → Deutsch;
 * - Adressat, der nur Deutsch versteht (deine Eltern, your German grandparents …) → Deutsch;
 * - Adressat, der nur die Fremdsprache versteht (British partner school, exchange partner,
 *   correspondant, intercambio …) → Zielsprache;
 * - Arbeitsanweisung in der Zielsprache (Write …, Écris …, Escribe …, Scrivi …, Напиши …) →
 *   Zielsprache.
 * Die KI (Teile erkennen, Aufgabe aus Datei) liefert dasselbe je Teil; die Lehrkraft kann es in
 * „Bewertung nach Teilen" bzw. unter der Aufgabe ändern.
 */
import { deutschVerlangt } from './sprachErkennung'

export type AntwortSprache = 'deutsch' | 'zielsprache'

/** Adressaten, die nur Deutsch verstehen */
const ADRESSAT_DEUTSCH =
  /\b(deine[nmr]?|ihre[nmr]?)\s+(eltern|oma|opa|großeltern|mutter|vater|tante|onkel|geschwister|klasse|mitschüler(in(nen)?)?)\b|\byour\s+(german|parents|grandparents|grandma|grandpa|mum|mom|dad|little (brother|sister))\b|\bwho\s+(doesn['’]t|does not|don['’]t|do not)\s+speak\s+(english|french|spanish|italian|russian)\b|\bqui ne parle pas (français|francais)\b|\bque no habla español\b/i

/** Adressaten, die nur die Fremdsprache verstehen */
const ADRESSAT_ZIEL =
  /\b(british|english|american|australian|irish|scottish|canadian|new zealand)\s+(partner|friend|pen ?friend|school|student|teacher|exchange|host|coordinator|colleague|family)|\bpartner\s+school\b|\bexchange\s+(student|partner|pupil)\b|\bhost\s+(family|brother|sister)\b|\bpen ?friend\b|\bwho\s+(doesn['’]t|does not|don['’]t|do not)\s+(speak|understand)\s+german\b|\bcorres(pondant)?e?\b|\bpartenaire\b|\bton ami(e)? (français|francaise|française)\b|\bintercambio\b|\bamig[oa] (español|española|mexican[oa])\b|\bscambio\b|\bamic[oa] italian[oa]\b|\bпо[- ]?русски\b/i

/** Arbeitsanweisungen in der Zielsprache am Satzanfang */
const ANWEISUNG_ZIEL: Record<string, RegExp> = {
  englisch: /(^|[\n.:)]\s*)(write|describe|explain|summari[sz]e|comment|discuss|compose|create|tell|answer|imagine|outline|present|argue|evaluate)\b/i,
  franzoesisch: /(^|[\n.:)]\s*)(écris|ecris|rédige|redige|décris|decris|explique|résume|resume|réponds|reponds|imagine|présente|presente|raconte|commente)\b/i,
  spanisch: /(^|[\n.:)]\s*)(escribe|redacta|describe|explica|resume|responde|imagina|presenta|cuenta|comenta)\b/i,
  italienisch: /(^|[\n.:)]\s*)(scrivi|descrivi|spiega|riassumi|rispondi|immagina|presenta|racconta|commenta)\b/i,
  russisch: /(^|[\n.:)]\s*)(напиши|напишите|опиши|опишите|объясни|объясните|ответь|ответьте|расскажи|расскажите)\b/i
}

/** Antwortsprache aus einem Aufgabentext; undefined, wenn nichts Eindeutiges zu erkennen ist */
export function antwortSpracheAus(text: string, subjectId: string): AntwortSprache | undefined {
  if (!text.trim()) return undefined
  if (deutschVerlangt(text)) return 'deutsch'
  const deutsch = ADRESSAT_DEUTSCH.test(text)
  const ziel = ADRESSAT_ZIEL.test(text)
  if (ziel && !deutsch) return 'zielsprache'
  if (deutsch && !ziel) return 'deutsch'
  if (ANWEISUNG_ZIEL[subjectId]?.test(text)) return 'zielsprache'
  return undefined
}

/** Anzeige: „Englisch" bzw. „Deutsch" */
export const spracheName = (s: AntwortSprache | undefined, fach: string): string => (s === 'deutsch' ? 'Deutsch' : s === 'zielsprache' ? fach || 'Zielsprache' : 'unklar')

/** Alle Zeichenketten eines Objekts (Bausteine einer Klassenarbeit) als Text */
export function textAus(x: unknown): string {
  const teile: string[] = []
  const lauf = (v: unknown): void => {
    if (typeof v === 'string') {
      if (v.length > 2 && !v.startsWith('data:')) teile.push(v)
    } else if (Array.isArray(v)) v.forEach(lauf)
    else if (v && typeof v === 'object') Object.values(v).forEach(lauf)
  }
  lauf(x)
  return teile.join('\n')
}
