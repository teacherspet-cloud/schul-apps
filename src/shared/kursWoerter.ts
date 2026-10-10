/**
 * Kasten „Abschnitte & Wörter" der Kursseite (10.10.2026, Entscheidung der Lehrkraft: „Abschnitte und Stand der
 * Lernenden" und die Wortliste „X Wörter" zeigten doppelt dasselbe – jetzt EIN Kasten Band › Unit › Abschnitt › Wörter).
 * Rein rechnend: Stand der Klasse je Wort, wer mit einem Problemwort kämpft, Suche über die Wörter.
 */
import { istSicher, type Vokabel, type WortStand } from './vokabeltrainer'
import { abschnitteEinordnen, wortBereiche, type AbschnittStatistik, type KursTeil } from './kursAbschnitte'
import type { Quelle } from './vokabelLaufbahn'

const zwei = (x: number): number => Math.round(x * 100) / 100

/** Je Wort der Anteil der Lernenden, für die es sicher ist (zwei Stellen); ohne Lernende leer */
export function wortSicherAnteile(woerter: Pick<Vokabel, 'id'>[], staende: Record<string, WortStand>[]): Record<string, number> {
  if (!staende.length) return {}
  const aus: Record<string, number> = {}
  for (const v of woerter) {
    let n = 0
    for (const st of staende) if (st[v.id] && istSicher(st[v.id])) n++
    aus[v.id] = zwei(n / staende.length)
  }
  return aus
}

export interface ProblemPerson {
  name: string
  falsch: number
  versuche: number
}

/** Wer mit den Wörtern Schwierigkeiten hat: Lernende mit Fehlern, die meisten Fehler zuerst (bei Gleichstand nach Name) */
export function problemLernende(
  wortIds: string[],
  lernende: { name: string; stand: Record<string, WortStand> }[]
): Record<string, ProblemPerson[]> {
  const aus: Record<string, ProblemPerson[]> = {}
  for (const id of wortIds) {
    aus[id] = lernende
      .map((l) => ({ name: l.name, falsch: l.stand[id]?.falsch ?? 0, versuche: l.stand[id]?.versuche ?? 0 }))
      .filter((p) => p.falsch > 0)
      .sort((a, b) => b.falsch - a.falsch || a.name.localeCompare(b.name, 'de'))
  }
  return aus
}

/** Vergleichsform für die Suche: klein, ohne Akzente */
const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/** Passt das Wort zur Suche? (Begriff, Übersetzung, „auch richtig"; ohne Akzente, Groß/klein egal) */
export function wortPasst(v: Pick<Vokabel, 'term' | 'translation' | 'auchRichtig'>, suche: string): boolean {
  const q = norm(suche)
  if (!q) return true
  return [v.term, v.translation, ...(v.auchRichtig ?? [])].some((t) => norm(t).includes(q))
}

/** „auch richtig" aus dem Eingabefeld: durch Semikolon getrennt (wie in der Vokabeltabelle), ohne Leeres und Doppeltes, höchstens 10 */
export function auchRichtigAusText(text: string): string[] {
  const aus: string[] = []
  for (const t of text.split(';').map((x) => x.trim()))
    if (t && !aus.some((a) => a.toLowerCase() === t.toLowerCase())) aus.push(t.slice(0, 200))
  return aus.slice(0, 10)
}

export interface AbschnittsZeile<W, S> {
  /** Stelle in `teile` (für „Entfernen" u. ä.) */
  index: number
  titel: string
  anzahl: number
  zeit: number
  buch: string
  unit: string
  name: string
  /** Statistik des Abschnitts – nur, wenn sie zu den Abschnitten passt */
  stat?: S
  woerter: W[]
}

/**
 * Zeilen des Kastens: je Abschnitt Band, Unit, Name, Statistik (falls da) und seine Wörter. Band und Unit kommen vom Server
 * (`teile` mit buch/unit, sonst aus der Statistik), der Name aus der Statistik bzw. der Einordnung des Titels.
 */
export function abschnittsZeilen<W, S extends Pick<AbschnittStatistik, 'name' | 'unit' | 'buch'>>(
  teile: (Pick<KursTeil, 'titel' | 'anzahl' | 'zeit'> & { buch?: string; unit?: string })[],
  woerter: W[],
  quelle: Partial<Quelle> | null | undefined,
  statistik?: S[]
): AbschnittsZeile<W, S>[] {
  // Ohne Abschnitte (eigene Liste): ein Abschnitt mit allen Wörtern
  const tl = teile.length ? teile : woerter.length ? [{ titel: 'Wörter', anzahl: woerter.length, zeit: 0 }] : []
  const passt = statistik?.length === tl.length ? statistik : undefined
  const einordnung = abschnitteEinordnen(tl, quelle)
  return wortBereiche(tl, woerter.length).map(([von, bis], i) => {
    const t = tl[i]
    const st = passt?.[i]
    return {
      index: i,
      titel: t.titel,
      anzahl: bis - von,
      zeit: t.zeit,
      buch: t.buch ?? st?.buch ?? einordnung[i]?.buch ?? '',
      unit: t.unit ?? st?.unit ?? einordnung[i]?.unit ?? '',
      name: st?.name || einordnung[i]?.name || t.titel,
      ...(st ? { stat: st } : {}),
      woerter: woerter.slice(von, bis)
    }
  })
}

/**
 * Suche und „Nur Problemwörter": je Abschnitt nur die passenden Wörter, Abschnitte ohne Treffer fallen weg. Passt der
 * Name des Abschnitts (bzw. seine Unit) zur Suche, bleiben alle seine Wörter. Ohne Filter unverändert.
 */
export function zeilenFiltern<W extends Pick<Vokabel, 'id' | 'term' | 'translation' | 'auchRichtig'>, S>(
  zeilen: AbschnittsZeile<W, S>[],
  suche: string,
  nurProbleme: Set<string> | null
): AbschnittsZeile<W, S>[] {
  const q = norm(suche)
  if (!q && !nurProbleme) return zeilen
  return zeilen
    .map((z) => {
      const ganz = Boolean(q) && [z.name, z.unit, z.titel].some((t) => norm(t).includes(q))
      const woerter = z.woerter.filter((v) => (ganz || wortPasst(v, q)) && (!nurProbleme || nurProbleme.has(v.id)))
      return { ...z, woerter }
    })
    .filter((z) => z.woerter.length > 0)
}
