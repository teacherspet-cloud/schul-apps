/**
 * Tempo von „Fallende Wörter" (09.10.2026, Befund der Lehrkraft: „Der Start ist selbst für Klasse 10 noch zu
 * schnell"). Gilt für alle Sprachen.
 *  - Start deutlich langsamer, nach Klasse gestuft: Klasse 5 am langsamsten, ab Klasse 11 am schnellsten.
 *  - Anpassend: Jeder Treffer hebt die Stufe um 1 (Fallzeit 6 % kürzer), jeder Fehler (Wort unten angekommen oder
 *    „Lösung zeigen") nimmt 3 Stufen zurück – nach Fehlern wird es spürbar ruhiger.
 *  - Höchsttempo begrenzt (kürzeste Fallzeit je Klasse).
 * Ohne Zeitdruck (Einstellung der Lernenden) gibt es das Spiel wie bisher gar nicht (Spiele.tsx `MIT_ZEITDRUCK`).
 * Fallzeit in Sekunden für die ganze Höhe, Abstand neuer Wörter in ms.
 */

/** Fallzeit zu Beginn und kürzeste Fallzeit je Klasse [Start, Höchsttempo] */
export function fallGrenzen(klasse: number | null | undefined): { start: number; schnellstens: number } {
  const k = Math.round(klasse ?? 6)
  if (k <= 5) return { start: 30, schnellstens: 13 }
  if (k <= 6) return { start: 28, schnellstens: 12 }
  if (k <= 7) return { start: 26, schnellstens: 11 }
  if (k <= 8) return { start: 24, schnellstens: 10 }
  if (k <= 9) return { start: 22, schnellstens: 9 }
  if (k <= 10) return { start: 21, schnellstens: 8 }
  return { start: 20, schnellstens: 7 }
}

/** Je Stufe wird die Fallzeit um diesen Faktor kürzer */
export const FALL_FAKTOR = 0.94
/** So viele Stufen nimmt ein Fehler zurück */
export const FEHLER_STUFEN = 3

export function fallTempo(klasse: number | null | undefined, stufe: number): { fallzeit: number; abstand: number } {
  const { start, schnellstens } = fallGrenzen(klasse)
  const fallzeit = Math.max(schnellstens, start * Math.pow(FALL_FAKTOR, Math.max(0, stufe)))
  // Neue Wörter etwa im Abstand einer halben Fallzeit – so stehen höchstens zwei bis drei Wörter gleichzeitig da
  return { fallzeit, abstand: Math.max(2500, fallzeit * 500) }
}

/** Stufe, ab der das Höchsttempo erreicht ist – darüber zählt nichts mehr (sonst wirkten Fehler danach nicht) */
export function hoechsteStufe(klasse: number | null | undefined): number {
  const { start, schnellstens } = fallGrenzen(klasse)
  return Math.ceil(Math.log(schnellstens / start) / Math.log(FALL_FAKTOR))
}

/** Nächste Stufe: Treffer +1 (bis zum Höchsttempo), Fehler −3 (nie unter 0) */
export function naechsteStufe(stufe: number, ereignis: 'treffer' | 'fehler', klasse?: number | null): number {
  return ereignis === 'treffer' ? Math.min(hoechsteStufe(klasse), stufe + 1) : Math.max(0, stufe - FEHLER_STUFEN)
}
