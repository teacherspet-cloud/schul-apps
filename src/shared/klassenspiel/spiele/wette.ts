/**
 * Wett-Quiz (jede:r für sich, 02.11.2026): Vor jeder Frage setzt man 1, 2 oder 3 Punkte darauf, wie sicher man ist.
 * Richtig: Einsatz dazu, falsch: Einsatz weg. Am Ende sieht jede:r privat, wie gut die eigene Einschätzung war
 * (Treffsicherheit je Einsatz) – Selbsteinschätzung (Metakognition) wird geübt. Der Beamer zeigt nur die Klasse.
 *
 * BELEGT (allgemein): Rückmeldung zur eigenen Sicherheit verbessert die Selbsteinschätzung (Kalibrierung).
 * FAUSTREGEL: Grenzen für die Tipps (3er-Einsätze unter 60 % = zu sicher; 1er-Einsätze über 85 % = trau dir mehr zu).
 */
import { klassenwertVon, type BBlock, type KBasis, type KlassenRegeln } from '../kern'
import { kt } from '../texte'

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
      {
        typ: 'treffsicherheit',
        titel: kt(z.sprache, 'weTitel'),
        erklaerung: kt(z.sprache, 'weErklaerung'),
        stufen: k.map((x) => ({
          ...x,
          name: kt(z.sprache, (['we1', 'we2', 'we3'] as const)[x.einsatz - 1]),
          text: x.anzahl ? kt(z.sprache, 'weRichtigProzent', Math.round((x.richtig / x.anzahl) * 100), x.anzahl) : '–'
        }))
      },
      {
        typ: 'zahlen',
        eintraege: [
          { titel: kt(z.sprache, 'weAntworten'), wert: String(n) },
          { titel: kt(z.sprache, 'weSchnitt'), wert: n ? schnitt.toFixed(1) : '–' },
          { titel: kt(z.sprache, 'zDabei'), wert: String(Object.keys(z.personen).length) }
        ]
      }
    ]
    return aus
  },
  geraet(z, wer) {
    const konto = z.konto[wer] ?? 0
    const kopf = { typ: 'text' as const, text: kt(z.sprache, 'weKonto', konto), gross: false }
    if (z.einsatz[wer]) return [kopf, { typ: 'text', text: kt(z.sprache, 'weEinsatz', '●'.repeat(z.einsatz[wer]!)), ton: 'leise' }]
    return [
      kopf,
      { typ: 'text', text: kt(z.sprache, 'weFrage'), gross: true },
      {
        typ: 'knoepfe',
        knoepfe: [
          { text: kt(z.sprache, 'we1'), aktion: 'einsatz', wert: '1', farbe: 'gray' },
          { text: kt(z.sprache, 'we2'), aktion: 'einsatz', wert: '2', farbe: 'blue' },
          { text: kt(z.sprache, 'we3'), aktion: 'einsatz', wert: '3', farbe: 'grape' }
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
    const teile = STUFEN.filter((e) => j[e]?.[0]).map((e) => kt(z.sprache, 'weStufe', e, j[e][1], j[e][0], Math.round((j[e][1] / j[e][0]) * 100)))
    let tipp = ''
    const drei = j[3]
    const eins = j[1]
    if (drei && drei[0] >= 3 && drei[1] / drei[0] < 0.6) tipp = kt(z.sprache, 'weZuSicher')
    else if (eins && eins[0] >= 3 && eins[1] / eins[0] > 0.85) tipp = kt(z.sprache, 'weMehrZutrauen')
    else if (teile.length) tipp = kt(z.sprache, 'wePasst')
    return [kt(z.sprache, 'weKontoKurz', z.konto[wer] ?? 0), ...teile, tipp].filter(Boolean).join(' · ')
  },
  ergebnis(z) {
    const k = klasse(z)
    const drei = k[2]
    const text = drei.anzahl ? kt(z.sprache, 'weErgebnis', Math.round((drei.richtig / drei.anzahl) * 100)) : kt(z.sprache, 'weKeiner')
    const w = klassenwertVon(z)
    return { text, klassenwert: w, klassenwertText: kt(z.sprache, 'wePunkte', w) }
  }
}
