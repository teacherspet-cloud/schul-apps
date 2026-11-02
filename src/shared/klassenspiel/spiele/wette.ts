/**
 * Wett-Quiz (jede:r für sich, 02.11.2026): Vor jeder Frage setzt man 1, 2 oder 3 Punkte darauf, wie sicher man ist.
 * Richtig: Einsatz dazu, falsch: Einsatz weg. Am Ende sieht jede:r privat, wie gut die eigene Einschätzung war
 * (Treffsicherheit je Einsatz) – Selbsteinschätzung (Metakognition) wird geübt. Der Beamer zeigt nur die Klasse.
 *
 * BELEGT (allgemein): Rückmeldung zur eigenen Sicherheit verbessert die Selbsteinschätzung (Kalibrierung).
 * FAUSTREGEL: Grenzen für die Tipps (3er-Einsätze unter 60 % = zu sicher; 1er-Einsätze über 85 % = trau dir mehr zu).
 */
import { klassenwertVon, type BBlock, type KBasis, type KlassenRegeln } from '../kern'

export interface Wette extends KBasis {
  einsatz: Record<string, number | null>
  konto: Record<string, number>
  /** je Person und Einsatz: [Anzahl, richtig] */
  je: Record<string, Record<number, [number, number]>>
}

const STUFEN = [1, 2, 3]

function klasse(z: Wette): { einsatz: number; anzahl: number; richtig: number }[] {
  return STUFEN.map((e) => {
    let anzahl = 0
    let richtig = 0
    for (const j of Object.values(z.je)) {
      anzahl += j[e]?.[0] ?? 0
      richtig += j[e]?.[1] ?? 0
    }
    return { einsatz: e, anzahl, richtig }
  })
}

export const wette: KlassenRegeln<Wette> = {
  id: 'wette',
  start(z) {
    return Object.assign(z, { einsatz: {}, konto: {}, je: {} })
  },
  frageZeigen(z, wer) {
    return Boolean(z.einsatz[wer])
  },
  zug(z, wer, aktion, wert) {
    if (aktion !== 'einsatz' || z.einsatz[wer]) return false
    const e = Number(wert)
    if (!STUFEN.includes(e)) return false
    z.einsatz[wer] = e
    // Frage erst jetzt ziehen (nach dem Einsatz)
    if (z.personen[wer]) z.personen[wer].aufgabe = null
    return true
  },
  nachAntwort(z, wer, _a, richtig) {
    const e = z.einsatz[wer] ?? 1
    z.konto[wer] = (z.konto[wer] ?? 0) + (richtig ? e : -e)
    const j = (z.je[wer] ??= {})
    const x = (j[e] ??= [0, 0])
    x[0]++
    if (richtig) x[1]++
    z.einsatz[wer] = null
  },
  beamer(z) {
    const k = klasse(z)
    const n = k.reduce((s, x) => s + x.anzahl, 0)
    const schnitt = n ? k.reduce((s, x) => s + x.einsatz * x.anzahl, 0) / n : 0
    const aus: BBlock[] = [
      { typ: 'treffsicherheit', stufen: k },
      {
        typ: 'zahlen',
        eintraege: [
          { titel: 'Antworten', wert: String(n) },
          { titel: 'Ø Einsatz', wert: n ? schnitt.toFixed(1) : '–' },
          { titel: 'Dabei', wert: String(Object.keys(z.personen).length) }
        ]
      }
    ]
    return aus
  },
  geraet(z, wer) {
    const konto = z.konto[wer] ?? 0
    const kopf = { typ: 'text' as const, text: `💰 Dein Konto: ${konto}`, gross: false }
    if (z.einsatz[wer]) return [kopf, { typ: 'text', text: `Einsatz: ${'●'.repeat(z.einsatz[wer]!)}`, ton: 'leise' }]
    return [
      kopf,
      { typ: 'text', text: 'Wie sicher bist du bei der nächsten Frage?', gross: true },
      {
        typ: 'knoepfe',
        knoepfe: [
          { text: '1 – unsicher', aktion: 'einsatz', wert: '1', farbe: 'gray' },
          { text: '2 – ziemlich sicher', aktion: 'einsatz', wert: '2', farbe: 'blue' },
          { text: '3 – ganz sicher', aktion: 'einsatz', wert: '3', farbe: 'grape' }
        ]
      }
    ]
  },
  auszeichnung(z, wer) {
    const j = z.je[wer] ?? {}
    const q = (e: number): number | null => (j[e]?.[0] ? j[e][1] / j[e][0] : null)
    const n = STUFEN.reduce((s, e) => s + (j[e]?.[0] ?? 0), 0)
    const q3 = q(3)
    const q1 = q(1)
    // FAUSTREGEL: mindestens 6 Einsätze, „ganz sicher" mindestens dreimal und zu ≥ 80 % richtig, nicht schlechter als „unsicher"
    const gut = n >= 6 && (j[3]?.[0] ?? 0) >= 3 && q3 !== null && q3 >= 0.8 && (q1 === null || q3 >= q1)
    return { einschaetzung: gut }
  },
  eigenText(z, wer) {
    const j = z.je[wer]
    if (!j) return null
    const teile = STUFEN.filter((e) => j[e]?.[0]).map((e) => `Einsatz ${e}: ${j[e][1]} von ${j[e][0]} richtig (${Math.round((j[e][1] / j[e][0]) * 100)} %)`)
    let tipp = ''
    const drei = j[3]
    const eins = j[1]
    if (drei && drei[0] >= 3 && drei[1] / drei[0] < 0.6) tipp = 'Tipp: Bei „ganz sicher" lagst du oft daneben – prüf dich vorher kurz.'
    else if (eins && eins[0] >= 3 && eins[1] / eins[0] > 0.85) tipp = 'Tipp: Du wusstest mehr, als du dachtest – trau dir mehr zu!'
    else if (teile.length) tipp = 'Deine Einschätzung passt gut zu dem, was du weißt.'
    return [`Konto: ${z.konto[wer] ?? 0}`, ...teile, tipp].filter(Boolean).join(' · ')
  },
  ergebnis(z) {
    const k = klasse(z)
    const drei = k[2]
    const text = drei.anzahl
      ? `Bei „ganz sicher" lag die Klasse zu ${Math.round((drei.richtig / drei.anzahl) * 100)} % richtig.`
      : 'Niemand hat 3 Punkte gesetzt – mehr Mut beim nächsten Mal!'
    const w = klassenwertVon(z)
    return { text, klassenwert: w, klassenwertText: `${w} Punkte (Treffer × Quote)` }
  }
}
