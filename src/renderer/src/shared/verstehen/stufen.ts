/**
 * Schwierigkeitsraster für Verstehensaufgaben (Hören, Lesen, Hör-Seh-Verstehen) – fünf Stufen
 * je Item. Gemeinsam für Arbeitsblatt und Klassenarbeit.
 *
 * Entscheidung der Lehrkraft (29.09.2026, Multiple Choice): fünf Stufen wie im Bericht
 * `recherche/hoerverstehen-schwierigkeit-2026-09-29.md` (Abschnitt 2) vorgeschlagen. Maßgeblich
 * ist der WEG vom Text zur Lösung, nicht das Thema:
 *
 * 1 sehr leicht – Antwort bzw. richtige Option steht 1:1 im Text, die Distraktoren kommen nicht vor.
 * 2 leicht      – explizit, leicht umgeformt (Wortform, Satzbau, Zahl als Ziffer).
 * 3 mittel      – Paraphrase/Synonym; Distraktoren dürfen Textwörter enthalten.
 * 4 schwer      – mehrere Stellen, Verneinung/Korrektur, genannte Meinung; Distraktoren teilen mehr
 *                 Wörter mit dem Text als die richtige Option.
 * 5 sehr schwer – implizit (Absicht, Haltung), global.
 *
 * Belege: Kostin (2004, ETS RR-04-11) zur Wortgleichheit von richtiger Option und Distraktoren;
 * KMK-Bildungsstandards 2023 und IQB 2014 zu den Niveaus. Die Verteilungen je Jahrgang sind
 * EIGENE Setzungen (Bericht, Abschnitt 2.4) und von der Lehrkraft änderbar.
 *
 * Die Stufe ist NUR für die Lehrkraft sichtbar (Editor, Erwartungshorizont), nie auf dem
 * Schülerblatt – ebenfalls Entscheidung vom 29.09.2026.
 */

export type VerstehensStufe = 1 | 2 | 3 | 4 | 5

export const STUFEN_WERTE: VerstehensStufe[] = [1, 2, 3, 4, 5]

export interface StufenBeschreibung {
  stufe: VerstehensStufe
  /** Kurzname, z. B. „sehr leicht" */
  name: string
  /** Kernmerkmal (Textbezug) */
  merkmal: string
  /** Weitere Merkmale, vor allem zu den Distraktoren */
  distraktoren: string
  /** Orientierung Anforderungsbereich */
  afb: string
  /** GER-Bezug */
  ger: string
}

export const STUFEN: Record<VerstehensStufe, StufenBeschreibung> = {
  1: {
    stufe: 1,
    name: 'sehr leicht',
    merkmal: 'Die Antwort ist 1:1 aus dem Text übernehmbar; bei Auswahlaufgaben steht die richtige Option wörtlich im Text.',
    distraktoren: 'Die Distraktoren kommen im Text nicht vor. Die Frage nutzt dieselben Wörter wie der Text.',
    afb: 'I',
    ger: 'A1–A2'
  },
  2: {
    stufe: 2,
    name: 'leicht',
    merkmal: 'Explizite Einzelinformation, leicht umgeformt (Wortform, Satzbau, Pronomen, Zahl als Ziffer); der Kern des Wortlauts bleibt erkennbar.',
    distraktoren: 'Distraktoren plausibel, aber nicht wörtlich im Text.',
    afb: 'I',
    ger: 'A2'
  },
  3: {
    stufe: 3,
    name: 'mittel',
    merkmal: 'Explizite Information, aber paraphrasiert oder mit Synonym („cheap" ↔ „it didn\'t cost much"); oder Hauptaussage eines Abschnitts.',
    distraktoren: 'Distraktoren dürfen einzelne Textwörter enthalten (Word-Spotting-Falle), sind aber eindeutig falsch.',
    afb: 'I–II',
    ger: 'A2+–B1'
  },
  4: {
    stufe: 4,
    name: 'schwer',
    merkmal: 'Information aus zwei oder mehr Stellen zusammenführen, aus einer Korrektur oder Verneinung erschließen, oder eine ausdrücklich genannte Meinung erfassen.',
    distraktoren: 'Distraktoren teilen MEHR Wörter mit dem Text als die richtige Option; die Information steht nur einmal.',
    afb: 'II',
    ger: 'B1–B2'
  },
  5: {
    stufe: 5,
    name: 'sehr schwer',
    merkmal: 'Implizites erschließen (Absicht, Haltung, Ironie, Schlussfolgerung) oder globales Verstehen des ganzen Textes (Zweck, Hauptthese).',
    distraktoren: 'Keine Wortgleichheit der richtigen Lösung; sie ergibt sich aus Ton oder Zusammenhang.',
    afb: 'II–III',
    ger: 'B2'
  }
}

/** Ist der Wert eine gültige Stufe? (Gespeicherte Daten und KI-Antworten sind ungeprüft.) */
export const istStufe = (v: unknown): v is VerstehensStufe => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5

/** Stufe aus einer ungeprüften Angabe; alles andere ergibt `undefined`. */
export function stufeAus(v: unknown): VerstehensStufe | undefined {
  const n = typeof v === 'string' ? Number(v.trim()) : v
  return istStufe(n) ? n : undefined
}

/** Anzeige für die Lehrkraft, z. B. „Stufe 3 (mittel)". */
export const stufenLabel = (s: VerstehensStufe): string => `Stufe ${s} (${STUFEN[s].name})`

/** Anteile in Prozent je Stufe [1, 2, 3, 4, 5] */
export type StufenAnteile = [number, number, number, number, number]

export type StufenEinsatz = 'klassenarbeit' | 'uebung'

export interface StufenVerteilung {
  id: string
  label: string
  ger: string
  anteile: StufenAnteile
}

/**
 * Verteilungsvorschläge (Bericht, Abschnitt 2.4 – eigene Setzungen, nicht normativ).
 * Die Übung steigt auf: Einstieg mit leichten Items, dann steigern.
 */
export const STUFEN_VERTEILUNGEN: StufenVerteilung[] = [
  { id: 'ka-5-6', label: 'Klassenarbeit Kl. 5–6', ger: 'A1–A2', anteile: [30, 40, 25, 5, 0] },
  { id: 'ka-7-8', label: 'Klassenarbeit Kl. 7–8', ger: 'A2–A2+', anteile: [15, 35, 35, 15, 0] },
  { id: 'ka-9-10-msa', label: 'Klassenarbeit Kl. 9–10 (MSA)', ger: 'B1', anteile: [5, 25, 40, 25, 5] },
  { id: 'ka-9-10-esa', label: 'Klassenarbeit Kl. 9–10 (ESA)', ger: 'A2', anteile: [15, 40, 35, 10, 0] },
  { id: 'sek2', label: 'Sek II (Einführungs-/Qualifikationsphase)', ger: 'B1+–B2', anteile: [0, 10, 35, 35, 20] },
  { id: 'uebung', label: 'Übungs-Arbeitsblatt', ger: 'beliebig', anteile: [25, 30, 25, 15, 5] }
]

/**
 * Höchstanteil „sehr leicht" in Klassenarbeiten (Entscheidung der Lehrkraft 29.09.2026:
 * „gedeckelt, z. B. höchstens ein Viertel"). Stufe 1 sichert die Ausreichend-Grenze, trennt
 * aber nicht zwischen gut und befriedigend.
 */
export const SEHR_LEICHT_DECKEL = 0.25

const verteilungById = (id: string): StufenVerteilung => STUFEN_VERTEILUNGEN.find((v) => v.id === id) ?? STUFEN_VERTEILUNGEN[1]

/** Stufe des GER-Niveaus grob einordnen (A1 = 0 … C2 = 5; Zwischenstufen wie „A2+" zählen zum Grundniveau). */
function gerRang(level: string | undefined): number {
  const m = /^([ABC])([12])/.exec(String(level ?? '').toUpperCase())
  if (!m) return -1
  return (m[1] === 'A' ? 0 : m[1] === 'B' ? 2 : 4) + (Number(m[2]) - 1)
}

/**
 * Der Vorschlag je Jahrgang bzw. GER-Niveau.
 *
 * Maßgeblich ist zuerst der Jahrgang (Kl. 5–6, 7–8, 9–10, Oberstufe); in 9–10 entscheidet das
 * Niveau zwischen MSA (B1) und ESA (A2). Ohne Jahrgang entscheidet das Niveau allein.
 */
export function stufenVorschlag(opts: { grade?: number; cefrLevel?: string; einsatz?: StufenEinsatz }): StufenVerteilung {
  if (opts.einsatz === 'uebung') return verteilungById('uebung')
  const grade = Number(opts.grade) || 0
  const rang = gerRang(opts.cefrLevel)
  if (grade >= 11 || (!grade && rang >= 3)) return verteilungById('sek2')
  if (grade >= 9) return verteilungById(rang >= 2 ? 'ka-9-10-msa' : 'ka-9-10-esa')
  if (grade >= 7) return verteilungById('ka-7-8')
  if (grade >= 1) return verteilungById('ka-5-6')
  if (rang >= 2) return verteilungById('ka-9-10-msa')
  if (rang === 1) return verteilungById('ka-7-8')
  return verteilungById(rang === 0 ? 'ka-5-6' : 'ka-7-8')
}

/**
 * Eine Anzahl nach Anteilen auf die Stufen verteilen (größte Reste), Summe = `anzahl`.
 *
 * Mit `deckel` wird „sehr leicht" auf höchstens diesen Anteil der GESAMTEN Items begrenzt –
 * `vorhanden` sind die schon vorhandenen Items (davon `vorhandenSehrLeicht` auf Stufe 1).
 * Was über den Deckel ginge, wandert auf Stufe 2.
 */
export function verteileAufStufen(
  anzahl: number,
  anteile: StufenAnteile,
  opts: { deckel?: number; vorhanden?: number; vorhandenSehrLeicht?: number } = {}
): [number, number, number, number, number] {
  const n = Math.max(0, Math.round(anzahl))
  const summe = anteile.reduce((a, b) => a + Math.max(0, b), 0)
  const out: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  if (!n) return out
  if (!summe) {
    out[2] = n
    return out
  }
  const roh = anteile.map((a) => (Math.max(0, a) / summe) * n)
  roh.forEach((r, i) => (out[i] = Math.floor(r)))
  let rest = n - out.reduce((a, b) => a + b, 0)
  const reihenfolge = roh.map((r, i) => ({ i, rest: r - Math.floor(r) })).sort((a, b) => b.rest - a.rest || a.i - b.i)
  for (const { i } of reihenfolge) {
    if (rest <= 0) break
    out[i]++
    rest--
  }
  if (opts.deckel !== undefined) {
    const gesamt = n + Math.max(0, opts.vorhanden ?? 0)
    const erlaubt = Math.max(0, Math.floor(gesamt * opts.deckel) - Math.max(0, opts.vorhandenSehrLeicht ?? 0))
    if (out[0] > erlaubt) {
      out[1] += out[0] - erlaubt
      out[0] = erlaubt
    }
  }
  return out
}

/**
 * Prüft eine Stufenverteilung gegen den Deckel für „sehr leicht" (nur Klassenarbeit).
 * Items ohne Stufe zählen nicht mit. Liefert eine Meldung oder `null`.
 */
export function pruefeDeckel(stufen: (VerstehensStufe | undefined)[], einsatz: StufenEinsatz = 'klassenarbeit'): string | null {
  if (einsatz !== 'klassenarbeit') return null
  const eingestuft = stufen.filter(istStufe)
  if (eingestuft.length < 4) return null
  const leicht = eingestuft.filter((s) => s === 1).length
  if (leicht / eingestuft.length <= SEHR_LEICHT_DECKEL) return null
  return `${leicht} von ${eingestuft.length} eingestuften Items sind „sehr leicht" (Stufe 1). In einer Klassenarbeit höchstens ein Viertel – Stufe 1 sichert die Ausreichend-Grenze, trennt aber nicht zwischen den oberen Noten.`
}

/** Anzahl je Stufe als kurzer Text, z. B. „2 × Stufe 2, 1 × Stufe 3". */
export function stufenMixText(anzahl: readonly number[]): string {
  return anzahl
    .map((n, i) => (n > 0 ? `${n} × Stufe ${i + 1} (${STUFEN[(i + 1) as VerstehensStufe].name})` : ''))
    .filter(Boolean)
    .join(', ')
}
