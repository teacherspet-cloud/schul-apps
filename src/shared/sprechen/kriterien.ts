/**
 * Bewertungsbogen der Sprechprüfung (19.10.2026, abgestimmt mit der Lehrkraft) – Niedersachsen, „Überprüfung der
 * Kompetenz Sprechen anstelle einer Klassenarbeit/Klausur“ (Erlasse 15.07.2014, 02.11.2015, 26.04.2017).
 *
 * Belegt (Recherche 19.10.2026, Materialband MK 2012/2014 S. 35–39 und Erlass-Anlagen):
 *  - vier analytische Kategorien (Protokollant) je 0–5, Deskriptoren nur bei 5/3/1 (4 und 2 = dazwischen, 0 = nicht
 *    bewertbar); Gesamteindruck (Prüfer) 0–5 × 2 → zusammen 30 Punkte (Abschlussprüfung Jg 10: × 4 → 40 Punkte);
 *  - Notenschlüssel Sek I und Notenpunkte der Oberstufe.
 * Die Deskriptoren gelten für alle Sprachen und Niveaus; das Niveau verschiebt nur die ERWARTUNG (Jahrgangsziel).
 * In der App ist alles eine Einschätzung zum Üben – keine Note.
 */
export type KriteriumId = 'handeln' | 'flexibilitaet' | 'wortschatz' | 'aussprache' | 'gesamt'

export interface Kriterium {
  id: KriteriumId
  name: string
  kurz: string
  /** Deskriptoren (deutsch) für 5, 3 und 1 Punkt */
  stufen: Record<5 | 3 | 1, string>
}

export const KRITERIEN: Kriterium[] = [
  {
    id: 'handeln',
    name: 'Kommunikatives Handeln',
    kurz: 'Gesprächsführung',
    stufen: {
      5: 'spricht fließend, nur natürliche Sprechpausen · braucht keine Einhilfen · liefert relevante Beiträge · nutzt durchgehend Strategien, um das Gespräch in Gang zu halten',
      3: 'zögert bei der Suche nach Redemitteln · braucht gelegentlich Einhilfen · liefert im Allgemeinen relevante Beiträge · nutzt einige Strategien',
      1: 'spricht häufig mit längeren Verzögerungen · braucht erhebliche Einhilfen · liefert wenige relevante Beiträge · nutzt kaum Strategien'
    }
  },
  {
    id: 'flexibilitaet',
    name: 'Sprachliche Flexibilität und Kohärenz',
    kurz: 'Satzbau & Zusammenhang',
    stufen: {
      5: 'großes Spektrum an Satzstrukturen · richtige Strukturen · durchgehend zusammenhängende Beiträge',
      3: 'insgesamt angemessene Satzstrukturen · überwiegend richtig · meistens zusammenhängend',
      1: 'sehr begrenztes Spektrum · gravierende Unsicherheiten · kaum zusammenhängende Beiträge'
    }
  },
  {
    id: 'wortschatz',
    name: 'Wortschatz',
    kurz: 'Wortschatz',
    stufen: {
      5: 'umfangreich · durchgängig angemessen verwendet',
      3: 'hinreichend umfangreich · im Allgemeinen angemessen, gelegentlich unpassende Wortwahl',
      1: 'sehr begrenzt · überwiegend unangemessen verwendet'
    }
  },
  {
    id: 'aussprache',
    name: 'Aussprache, Betonung, Satzmelodie',
    kurz: 'Aussprache',
    stufen: {
      5: 'wird problemlos verstanden · richtige Aussprache und Betonung · Satzmelodie macht die Absicht deutlich',
      3: 'wird mit geringer Anstrengung verstanden · hinreichend richtige Aussprache · Satzmelodie nicht immer passend',
      1: 'wird nur mit Mühe verstanden · Aussprache erschwert das Verständnis · kaum Satzmelodie'
    }
  },
  {
    id: 'gesamt',
    name: 'Gesamteindruck',
    kurz: 'Gesamteindruck',
    stufen: {
      5: 'reagiert zügig und bewältigt die Aufgaben problemlos · kommuniziert natürlich · viele relevante Beiträge · hält die Kommunikation problemlos aufrecht',
      3: 'bewältigt die meisten Aufgaben · kommuniziert mit gewissen Einschränkungen · meist relevante Beiträge · hält die Kommunikation im Allgemeinen aufrecht',
      1: 'große Probleme mit den Aufgaben · durchgehend Probleme im Gespräch · kaum relevante Beiträge · trägt kaum zur Kommunikation bei'
    }
  }
]

export const ANALYTISCH: KriteriumId[] = ['handeln', 'flexibilitaet', 'wortschatz', 'aussprache']

export type Wertung = Partial<Record<KriteriumId, number>>

/** Punkte der Sprechprüfung statt Klassenarbeit: 4 × 0–5 + Gesamteindruck × 2 = 30 */
export function punkteVon(w: Wertung): number {
  const a = ANALYTISCH.reduce((s, k) => s + Math.max(0, Math.min(5, Math.round(w[k] ?? 0))), 0)
  return a + 2 * Math.max(0, Math.min(5, Math.round(w.gesamt ?? 0)))
}

/** Notenspanne Sek I (Erlass): 1 = 30–28 · 2 = 27–23 · 3 = 22–18 · 4 = 17–14 · 5 = 13–6 · 6 = 5–0 */
export function noteSekI(punkte: number): number {
  if (punkte >= 28) return 1
  if (punkte >= 23) return 2
  if (punkte >= 18) return 3
  if (punkte >= 14) return 4
  if (punkte >= 6) return 5
  return 6
}

/** Notenpunkte der Oberstufe (Erlass-Tabelle, 30 Punkte → 15–0) */
export function notenpunkteOberstufe(punkte: number): number {
  const grenzen: [number, number][] = [
    [30, 15], [29, 14], [28, 13], [27, 12], [25, 11], [23, 10], [22, 9], [20, 8], [18, 7], [17, 6], [16, 5], [14, 4], [12, 3], [9, 2], [6, 1]
  ]
  for (const [ab, np] of grenzen) if (punkte >= ab) return np
  return 0
}

/** Stufen für die Anzeige (ohne Punkte) */
export const STUFEN = ['noch am Anfang', 'mit viel Hilfe', 'auf dem Weg', 'sicher', 'sehr sicher', 'souverän'] as const
export const stufeVon = (p: number): string => STUFEN[Math.max(0, Math.min(5, Math.round(p)))]

/**
 * Fortschritt je Kriterium (Faustregel, Recherche „bewertung.md"): gleitender Mittelwert der letzten Übungen;
 * Veränderungen unter 0,4 Punkten gelten als „stabil" (Messrauschen der KI-Einschätzung). Ab 2 Übungen.
 */
export function verlauf(werte: number[], fenster = 3): { aktuell: number; vorher: number | null; trend: 'besser' | 'stabil' | 'schwaecher' | null } {
  const mittel = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
  const aktuell = mittel(werte.slice(-fenster))
  if (werte.length < 2) return { aktuell, vorher: null, trend: null }
  const vorher = mittel(werte.slice(-fenster - 1, -1))
  const d = aktuell - vorher
  return { aktuell, vorher, trend: d >= 0.4 ? 'besser' : d <= -0.4 ? 'schwaecher' : 'stabil' }
}
