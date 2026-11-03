/**
 * „Right / Wrong / Not in the text" mit Textbeleg (03.11.2026, abgestimmt mit der Lehrkraft).
 *
 * Befund: Die Bauanleitung ließ bei Items mit der Lösung „nicht im Text" die Belegzeile weg – das verriet die Lösung,
 * und die Anweisung „For right and wrong, give evidence" ließ offen, was in die Belegspalte gehört.
 * Entscheidung: JEDE Zeile hat eine leere Belegzelle; Spaltenkopf „Evidence (only for right/wrong)"; die Anweisung sagt
 * ausdrücklich „If the statement is not in the text, leave the evidence box empty." Bewertung nach KMK (2012, S. 124):
 * bei „nicht im Text" volle Punkte fürs richtige Kreuz, ein eingetragener Beleg wird nicht gewertet.
 *
 * Rein rechnend: bereinigt Kopf, Zeilen (Platzhalter wie „—", „n/a" in der Belegzelle verraten die Lösung) und Anweisung.
 */
const NIT = /not in the text|not given|nicht im text|n\.?\s?i\.?\s?t\.?$/i
const BELEG = /evidence|quot|beleg|zitat|textstelle|line|zeile/i
const PLATZHALTER = /^[\s\-–—\/x·.]*$|^(n\/?a|none|no evidence|kein beleg|entfällt|not in the text)$/i

export const istNichtImTextTabelle = (headers: string[]): boolean => headers.some((h) => NIT.test(h.trim())) && headers.some((h) => BELEG.test(h))

/** Deutsch (Kopf/Anweisung auf Deutsch) oder Englisch – nach dem Spaltenkopf „nicht im Text" */
const deutsch = (headers: string[]): boolean => headers.some((h) => /nicht im text/i.test(h))

export function nichtImTextBereinigen<A extends { headers: string[]; rows: string[][] }>(answer: A, anweisung: string): { answer: A; anweisung: string } {
  if (!istNichtImTextTabelle(answer.headers)) return { answer, anweisung }
  const de = deutsch(answer.headers)
  const b = answer.headers.findIndex((h) => BELEG.test(h) && !NIT.test(h))
  if (b < 0) return { answer, anweisung }
  const headers = answer.headers.map((h, i) =>
    i === b && !/only|nur/i.test(h) ? `${h.trim()} ${de ? '(nur bei richtig/falsch)' : '(only for right/wrong)'}` : h
  )
  // Jede Zeile gleich lang; Platzhalter in der Belegzelle weg (sie verrieten „nicht im Text")
  const rows = answer.rows.map((r) => {
    const z = [...r]
    while (z.length < headers.length) z.push('')
    if (PLATZHALTER.test((z[b] ?? '').trim())) z[b] = ''
    return z
  })
  const leer = /leave .*(empty|blank)|leer lassen|bleibt leer/i.test(anweisung)
  const satz = de ? 'Steht die Aussage nicht im Text, bleibt das Belegfeld leer.' : 'If the statement is not in the text, leave the evidence box empty.'
  return { answer: { ...answer, headers, rows }, anweisung: leer ? anweisung : `${anweisung.trim()} ${satz}` }
}

export { NICHT_IM_TEXT_REGEL } from '../../../../../shared/nichtImTextRegel'
