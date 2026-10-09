/**
 * Vokabelweg – laufbahnbegleitendes Lernen (03.10.2026, mit der Lehrkraft abgestimmt):
 *
 *  - Die Leiter sind die Abschnitte des Lehrwerks der Klasse (z. B. Green Line 2) in Buchreihenfolge.
 *  - Frei ist, was die Klasse schon hatte: alles bis zum zuletzt zugewiesenen Abschnitt. Zugewiesene
 *    Abschnitte zählen dazu.
 *  - Dahinter schaltet Lernen frei: Sind 80 % der Wörter eines Abschnitts mindestens in Fach 2, wird
 *    der nächste frei – Abschnitt für Abschnitt bis zum Ende des Bandes. Der nächste Band kommt erst,
 *    wenn die Lerngruppe dort ist (eine Zuweisung daraus).
 *  - Ein gemeinsamer Kasten: zugewiesene Listen zuerst, Neues nur aus dem aktuellen Abschnitt,
 *    Gelerntes aus allem Freien als Wiederholung (die Tagesobergrenze setzt sitzungsWoerter).
 *
 * Hier die reinen Regeln – Server (src/server/vokabeln.ts) und Tests teilen sie.
 */
import type { Vokabel } from './vokabeltrainer'

export const SCHWELLE = 0.8
/** Ab Fach 2 gilt ein Wort als eingeübt */
export const EINGEUEBT_AB = 2

export interface BuchEintrag {
  term: string
  translation: string
  example?: string
  exampleTranslation?: string
  pos?: string
}
export interface Buch {
  id: string
  name: string
  language: string
  reihe?: string
  band?: string
  edition?: string
  units: { name: string; sections: { name: string; entries: BuchEintrag[] }[] }[]
}

export interface Abschnitt {
  /** Kennung: Band, Unit- und Abschnittsnummer */
  key: string
  band: string
  unit: string
  section: string
  woerter: Vokabel[]
}

/** Die Abschnitte eines Bandes in Buchreihenfolge; Wörter mit stabilen Kennungen „b:<band>:<u>:<s>:<i>" */
export function abschnitteAus(buch: Buch): Abschnitt[] {
  return buch.units.flatMap((u, ui) =>
    u.sections
      .filter((s) => s.entries.length)
      .map((s, si) => {
        const key = `${buch.id}:${ui}:${si}`
        return {
          key,
          band: buch.id,
          unit: u.name,
          section: s.name,
          woerter: s.entries.map((e, i) => ({
            id: `b:${key}:${i}`,
            term: e.term,
            translation: e.translation,
            ...(e.example ? { example: e.example } : {}),
            ...(e.exampleTranslation ? { exampleTranslation: e.exampleTranslation } : {}),
            ...(e.pos ? { pos: e.pos } : {})
          }))
        }
      })
  )
}

/** Eine Unit mit ihren gewählten Abschnitten */
export interface QuelleUnit {
  unit: string
  abschnitte: string[]
}

/**
 * Herkunft einer Zuweisung aus dem Lehrwerk. Mehrere Units (08.10.2026): `units` in Buchreihenfolge; `unit` ist dann die
 * höchste davon und `abschnitte` alle Abschnitte hintereinander (für ältere Leser).
 */
export interface Quelle {
  lehrwerk: string
  unit: string
  abschnitte: string[]
  units?: QuelleUnit[]
}

/** Units einer Herkunft – neue mit `units`, ältere mit einer Unit */
export function quelleUnits(q: Partial<Quelle> | null | undefined): QuelleUnit[] {
  if (!q) return []
  if (Array.isArray(q.units) && q.units.length)
    return q.units.filter((u) => u && typeof u.unit === 'string' && u.unit).map((u) => ({ unit: u.unit, abschnitte: Array.isArray(u.abschnitte) ? u.abschnitte : [] }))
  return typeof q.unit === 'string' && q.unit ? [{ unit: q.unit, abschnitte: Array.isArray(q.abschnitte) ? q.abschnitte : [] }] : []
}

/** Kurztext der Herkunft: „green-line-1 · Unit 1: Station 1, Station 2 · Unit 2: Station 1" */
export function quelleText(q: Partial<Quelle> | null | undefined): string {
  if (!q) return ''
  const units = quelleUnits(q)
  if (units.length <= 1)
    return [q.lehrwerk, units[0]?.unit, units[0]?.abschnitte.length ? units[0].abschnitte.join(', ') : ''].filter(Boolean).join(' · ')
  return [q.lehrwerk, ...units.map((u) => (u.abschnitte.length ? `${u.unit}: ${u.abschnitte.join(', ')}` : u.unit))].filter(Boolean).join(' · ')
}

/**
 * Herkunft aus dem Titel („Green Line 2 - Unit 1 - Station 1, Station 2") – für Zuweisungen von vor
 * dem 03.10.2026, die sie noch nicht gespeichert haben. `buecher`: Name → Kennung.
 */
export function quelleAusTitel(titel: string, buecher: { id: string; name: string }[]): Quelle | null {
  const teile = titel.split(' - ')
  if (teile.length < 3) return null
  const buch = buecher.find((b) => b.name === teile[0].trim())
  if (!buch) return null
  return { lehrwerk: buch.id, unit: teile[1].trim(), abschnitte: teile.slice(2).join(' - ').split(/,\s*/).filter(Boolean) }
}

export type StufenGrund = 'klasse' | 'zugewiesen' | 'gelernt' | 'start'

export interface Stufe {
  key: string
  unit: string
  section: string
  woerter: number
  /** Anteil der Wörter ab Fach 2 (0–1) */
  anteil: number
  zugewiesen: boolean
  frei: boolean
  /** Warum frei: Klassenstand, zugewiesen, durch Lernen freigeschaltet, erster Abschnitt */
  grund: StufenGrund | null
  gelernt: boolean
  /** Der Abschnitt, an dem gerade gelernt wird (erster freier, noch nicht gelernter) */
  aktuell: boolean
  /** Fortschrittspfad (09.10.2026, vom Server ergänzt): Wörter ab Fach 1 (einmal kennengelernt) bzw. ab Fach 2 */
  kennengelernt?: number
  fach2plus?: number
}

/**
 * Die Leiter eines Bandes. `zugewiesen`: Kennungen der zugewiesenen Abschnitte; `anteil(key)`: Anteil
 * eingeübter Wörter eines Abschnitts.
 */
export function leiter(abschnitte: Abschnitt[], zugewiesen: Set<string>, anteil: (key: string) => number): Stufe[] {
  const letzte = abschnitte.reduce((m, a, i) => (zugewiesen.has(a.key) ? i : m), -1)
  const stufen: Stufe[] = []
  abschnitte.forEach((a, i) => {
    const an = anteil(a.key)
    const gelernt = an >= SCHWELLE
    const vorher = stufen[i - 1]
    const grund: StufenGrund | null = zugewiesen.has(a.key)
      ? 'zugewiesen'
      : i <= letzte
        ? 'klasse'
        : i === 0
          ? 'start'
          : vorher?.frei && vorher.gelernt
            ? 'gelernt'
            : null
    stufen.push({
      key: a.key,
      unit: a.unit,
      section: a.section,
      woerter: a.woerter.length,
      anteil: an,
      zugewiesen: zugewiesen.has(a.key),
      frei: grund !== null,
      grund,
      gelernt,
      aktuell: false
    })
  })
  const aktuell = stufen.find((s) => s.frei && !s.gelernt) ?? null
  if (aktuell) aktuell.aktuell = true
  return stufen
}

/** Wie viele Wörter fehlen bis zur Schwelle? */
export const fehlenBis = (s: Pick<Stufe, 'woerter' | 'anteil'>): number => Math.max(0, Math.ceil(s.woerter * SCHWELLE - s.anteil * s.woerter - 1e-9))

/** Schlüssel einer Lehrwerksreihe über die Bände hinweg (Green Line 1–6 derselben Ausgabe) */
export const reiheVon = (b: Pick<Buch, 'reihe' | 'edition' | 'language' | 'name'>): string =>
  `${b.reihe || b.name.replace(/\s*\d+\s*$/, '')}|${b.edition ?? ''}|${b.language}`.toLowerCase().replace(/[^a-z0-9|]+/g, '-')

/*
 * Fortschrittspfad „Mein Vokabelweg" (09.10.2026, Entscheidung der Lehrkraft): statt eines zweiten Karteikastens ein
 * Pfad je Unit mit einem Wegpunkt je Abschnitt – nur zum Ansehen, geübt wird im Kurs. Zwei Stufen:
 *  - „gelernt": alle Wörter des Abschnitts einmal kennengelernt (Fach ≥ 1) → halber Stern,
 *  - „abgeschlossen": 80 % der Wörter mindestens in Fach 2 (dieselbe Regel wie das Freischalten) → Stern und Fähnchen.
 * Dazwischen füllt sich das Wegstück: zur Hälfte über das Kennenlernen, zur anderen Hälfte über den Weg zur Schwelle.
 */
export type WegStufe = 'offen' | 'gelernt' | 'abgeschlossen'

export interface StationZahlen {
  gesamt: number
  kennengelernt: number
  fach2plus: number
}

export function stationStand(z: StationZahlen): { stufe: WegStufe; fuellung: number } {
  const gesamt = Math.max(0, z.gesamt)
  if (!gesamt) return { stufe: 'offen', fuellung: 0 }
  const kennen = Math.min(1, Math.max(0, z.kennengelernt) / gesamt)
  const sicher = Math.min(1, Math.max(0, z.fach2plus) / gesamt)
  if (sicher >= SCHWELLE) return { stufe: 'abgeschlossen', fuellung: 1 }
  // Ab Fach 2 ist ein Wort auch kennengelernt – das Kennenlernen zählt mindestens so weit
  const fuellung = 0.5 * Math.max(kennen, sicher) + 0.5 * Math.min(1, sicher / SCHWELLE)
  return { stufe: kennen >= 1 ? 'gelernt' : 'offen', fuellung: Math.min(0.99, fuellung) }
}

/** Zahlen eines Wegpunkts; ältere Antworten ohne die Felder: aus dem Anteil ab Fach 2 geschätzt */
export const stationZahlen = (s: Stufe): StationZahlen => {
  const fach2plus = s.fach2plus ?? Math.round(s.anteil * s.woerter)
  return { gesamt: s.woerter, kennengelernt: Math.max(s.kennengelernt ?? 0, fach2plus), fach2plus }
}

export type UnitLage = 'fertig' | 'aktuell' | 'davor' | 'spaeter'

export interface WegUnit {
  unit: string
  stufen: { s: Stufe; i: number; stufe: WegStufe; fuellung: number }[]
  /** fertig = alle Abschnitte abgeschlossen (zusammengeklappt), aktuell = hier steht die Figur, spaeter = gedimmt */
  lage: UnitLage
}

/**
 * Units in Buchreihenfolge mit Lage, dazu der Wegpunkt der Figur: der aktuelle Abschnitt (erster freier, noch nicht
 * abgeschlossener); ist alles Freie abgeschlossen, der letzte freie Abschnitt.
 */
export function wegUnits(stufen: Stufe[]): { units: WegUnit[]; figur: number } {
  let figur = stufen.findIndex((s) => s.aktuell)
  if (figur < 0) figur = stufen.reduce((m, s, i) => (s.frei ? i : m), stufen.length ? 0 : -1)
  const units: WegUnit[] = []
  stufen.forEach((s, i) => {
    const st = stationStand(stationZahlen(s))
    const letzte = units[units.length - 1]
    const eintrag = { s, i, ...st }
    if (letzte && letzte.unit === s.unit) letzte.stufen.push(eintrag)
    else units.push({ unit: s.unit, stufen: [eintrag], lage: 'davor' })
  })
  const figurUnit = units.findIndex((u) => u.stufen.some((x) => x.i === figur))
  units.forEach((u, ui) => {
    const fertig = u.stufen.every((x) => x.stufe === 'abgeschlossen')
    u.lage = ui === figurUnit ? 'aktuell' : fertig ? 'fertig' : ui > figurUnit ? 'spaeter' : 'davor'
  })
  return { units, figur }
}
