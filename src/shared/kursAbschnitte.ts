/**
 * Vokabelkurs nach Abschnitten (09.10.2026, Wunsch der Lehrkraft für „Meine Klassen" → Reiter „Vokabeln"): Die Karte
 * hieß bisher nach den ersten freigegebenen Abschnitten („Green Line 1 - Unit 1: Check-in, Station 1, Station 2"),
 * obwohl im Lauf des Jahres viele dazukommen. Jetzt:
 *  - Name nach Kurs: „Vokabeln Englisch · Green Line 1" (mehrere Bände: „Green Line 1–2"), `kursName`.
 *  - Übersicht wie die Grammatik-Liste: je Unit gruppiert, je Abschnitt Wörter, Freigabedatum, Anteile sicher / im
 *    Aufbau / neu über alle Lernenden, Zahl der Lernenden mit Schwierigkeiten (unter 30 % sicher nach mindestens
 *    14 Tagen), schwierigste Wörter und je Person ein kleiner Balken – `abschnittStatistik`.
 * Die Abschnitte (`teile`) stehen in Freigabe-Reihenfolge hintereinander in der Wortliste (server/vokabeln.ts `teileVon`).
 * Rein rechnend, ohne Datenbank – der Server reicht Wörter und Lernstände herein.
 */
import { istSicher, type Vokabel, type WortStand } from './vokabeltrainer'
import { quelleUnits, type Quelle } from './vokabelLaufbahn'

export interface KursTeil {
  titel: string
  anzahl: number
  zeit: number
}

export interface AbschnittEinordnung {
  /** Unit (Gruppe), '' = keine erkennbar */
  unit: string
  /** Name des Abschnitts in der Gruppe, z. B. „Station 1" oder „Check-in, Station 1" */
  name: string
  /** Band, falls der Titel ihn nennt („Green Line 1 - Unit 1 - Station 1") */
  buch?: string
}

const TAG = 86_400_000
/** Ab wann ein Abschnitt als „lange genug geübt" gilt (sicher braucht zwei Treffer im Abstand einer Woche) */
export const REIF_TAGE = 14
/** Unter diesem Anteil sicherer Wörter gilt jemand nach REIF_TAGE als „hat Schwierigkeiten" */
export const SCHWACH_UNTER = 0.3

/** „Band - Unit - Abschnitte" oder „Band - Unit 1: … - Unit 2: …" (ein Listentitel mit Bindestrich ist keins) */
const istBuchTitel = (teile: string[]): boolean =>
  (teile.length >= 3 && !teile[1].includes(':')) || (teile.length >= 2 && teile.slice(1).every((x) => x.includes(':')))

/**
 * Unit und Name je Abschnitt. Titelformen (VokabelQuelle.tsx, server/vokabeln.ts):
 *  - „Green Line 1 - Unit 1 - Check-in, Station 1" (eine Freigabe, ein Abschnitt; ältere Kurse: die ganze Erstfreigabe)
 *  - „Green Line 1 - Unit 1: Check-in - Unit 2: Station 1" (mehrere Units in einem Teil)
 *  - „Unit 1 · Station 1" (mehrere Units, je Abschnitt ein Teil)
 *  - „Station 1" (eine Unit, je Abschnitt ein Teil) – die Unit kommt aus der Herkunft des Kurses (in Buchreihenfolge)
 *  - Listentitel ohne Lehrwerk („Weather") – ohne Unit
 */
export function abschnitteEinordnen(teile: Pick<KursTeil, 'titel'>[], quelle: Partial<Quelle> | null | undefined): AbschnittEinordnung[] {
  const folge = quelleUnits(quelle).flatMap((u) => u.abschnitte.map((a) => ({ unit: u.unit, a: a.trim().toLowerCase() })))
  let zeiger = 0
  let letzte = ''
  const suche = (abschnitt: string, unit?: string): string | undefined => {
    const a = abschnitt.trim().toLowerCase()
    const passt = (f: { unit: string; a: string }): boolean => f.a === a && (!unit || f.unit === unit)
    for (let j = zeiger; j < folge.length; j++)
      if (passt(folge[j])) {
        zeiger = j + 1
        return folge[j].unit
      }
    return folge.find(passt)?.unit
  }
  return teile.map((t) => {
    const titel = t.titel.trim()
    const teile = titel.split(' - ').map((x) => x.trim())
    let e: AbschnittEinordnung
    if (istBuchTitel(teile) && !teile[1].includes(':')) {
      // Band - Unit - Abschnitte
      e = { buch: teile[0], unit: teile[1], name: teile.slice(2).join(' - ') }
    } else if (istBuchTitel(teile)) {
      // Band - Unit 1: … - Unit 2: …
      const units = teile.slice(1).map((x) => x.split(':')[0].trim())
      e = { buch: teile[0], unit: units[0], name: teile.slice(1).join(' · ') }
    } else if (titel.includes(' · ')) {
      const [unit, ...rest] = titel.split(' · ').map((x) => x.trim())
      e = { unit, name: rest.join(' · ') }
    } else {
      e = { unit: suche(titel) ?? (folge.length ? letzte : ''), name: titel }
    }
    // Zeiger hinter die Abschnitte dieses Teils (für die folgenden „Station 1" ohne Unit)
    if (e.unit) for (const a of e.name.split(/,\s*|\s·\s/)) suche(a, e.unit)
    letzte = e.unit
    return e
  })
}

/** „green-line-1" / „green-line-1-nds" → „Green Line 1" (Rückfall, wenn kein Titel den Band nennt) */
export function buchAusKennung(kennung: string): string {
  const w = kennung.split(/[-_\s]+/).filter(Boolean)
  // Land/Schulform hinter der Bandnummer weglassen
  while (w.length > 1 && /^\d+$/.test(w[w.length - 2] ?? '') && /^(?:[a-z]{2,3}|g8|g9)$/i.test(w[w.length - 1])) w.pop()
  return w.map((x) => (/^\d+$/.test(x) ? x : x[0].toUpperCase() + x.slice(1))).join(' ')
}

/** Vergleichsform: ohne Akzente („Découvertes" = „decouvertes"), nur Buchstaben und Ziffern */
const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** Bände des Kurses in Freigabe-Reihenfolge: aus Kurstitel, Abschnittstiteln und der Herkunft */
export function baendeVon(titel: string, einordnung: AbschnittEinordnung[], quelle: Partial<Quelle> | null | undefined): string[] {
  const namen: string[] = []
  const dazu = (n: string | undefined): void => {
    if (n && !namen.some((x) => norm(x) === norm(n))) namen.push(n)
  }
  const kopf = titel.split(' - ').map((x) => x.trim())
  if (istBuchTitel(kopf)) dazu(kopf[0])
  for (const e of einordnung) dazu(e.buch)
  const kennung = quelle?.lehrwerk ?? ''
  if (kennung && !namen.some((n) => norm(kennung).startsWith(norm(n)) || norm(n).startsWith(norm(buchAusKennung(kennung))))) dazu(buchAusKennung(kennung))
  return namen
}

/** „Green Line 1", „Green Line 2" → „Green Line 1–2"; verschiedene Reihen mit „ / " */
export function baendeText(namen: string[]): string {
  if (namen.length <= 1) return namen[0] ?? ''
  const teile = namen.map((n) => /^(.*?)\s*(\d+)$/.exec(n))
  if (teile.every((t) => t && norm(t[1]) === norm(teile[0]![1]))) {
    const zahlen = teile.map((t) => Number(t![2]))
    const min = Math.min(...zahlen)
    const max = Math.max(...zahlen)
    return min === max ? namen[0] : `${teile[0]![1]} ${min}–${max}`
  }
  return namen.join(' / ')
}

/** Kursname für die Lehrkraft: „Vokabeln Englisch · Green Line 1–2" (ohne Lehrwerk: „Vokabeln Englisch") */
export function kursName(fach: string, baende: string[], titel = ''): string {
  const b = baendeText(baende)
  if (!fach) return b ? `Vokabeln · ${b}` : titel || 'Vokabeln'
  return b ? `Vokabeln ${fach} · ${b}` : `Vokabeln ${fach}`
}

export interface AbschnittStatistik {
  /** Stelle in `teile` (für „Abschnitt entfernen" u. ä.) */
  index: number
  unit: string
  name: string
  woerter: number
  /** Freigegeben (ms) */
  zeit: number
  /** Anteile über alle Lernenden und Wörter des Abschnitts (Summe 1) */
  sicher: number
  aufbau: number
  neu: number
  /** Lernende unter 30 % sicher, wenn der Abschnitt mindestens 14 Tage alt ist; null = noch zu jung */
  schwach: number | null
  /** Schwierigste Wörter (mindestens 3 Versuche über alle, mit Fehlern) */
  probleme: { term: string; translation: string; quote: number }[]
  /** Je Lernende(r) in der Reihenfolge der Namen: [Anteil sicher, Anteil im Aufbau], auf zwei Stellen */
  jeLernende: [number, number][]
}

const zwei = (x: number): number => Math.round(x * 100) / 100

/**
 * Statistik je Abschnitt. Laufzeit: jede Person einmal über alle Wörter (30 Lernende × 500 Wörter = 15 000 Schritte).
 * `staende` je Person die Wortstände des Kurses (Reihenfolge = Reihenfolge der Namen beim Aufrufer).
 */
export function abschnittStatistik(
  teile: KursTeil[],
  woerter: Pick<Vokabel, 'id' | 'term' | 'translation'>[],
  staende: Record<string, WortStand>[],
  einordnung: AbschnittEinordnung[],
  jetzt = Date.now()
): AbschnittStatistik[] {
  // Wortbereiche der Abschnitte (der letzte nimmt den Rest, falls die Zahlen nicht genau passen)
  const bereiche: [number, number][] = []
  let start = 0
  for (const [i, t] of teile.entries()) {
    const ende = i === teile.length - 1 ? woerter.length : Math.min(woerter.length, start + Math.max(0, t.anzahl))
    bereiche.push([start, ende])
    start = ende
  }
  return teile.map((t, i) => {
    const [von, bis] = bereiche[i]
    const liste = woerter.slice(von, bis)
    let sicher = 0
    let aufbau = 0
    let neu = 0
    const jeLernende: [number, number][] = []
    const jeWort = new Map<string, { versuche: number; falsch: number }>()
    const reif = Boolean(t.zeit) && jetzt - t.zeit >= REIF_TAGE * TAG
    let schwach = 0
    for (const st of staende) {
      let s = 0
      let a = 0
      for (const v of liste) {
        const w = st[v.id]
        if (w && istSicher(w)) s++
        else if (w && (w.fach > 0 || w.versuche > 0)) a++
        if (w?.versuche) {
          const j = jeWort.get(v.id) ?? { versuche: 0, falsch: 0 }
          j.versuche += w.versuche
          j.falsch += w.falsch
          jeWort.set(v.id, j)
        }
      }
      const n = liste.length
      sicher += s
      aufbau += a
      neu += n - s - a
      jeLernende.push(n ? [zwei(s / n), zwei(a / n)] : [0, 0])
      if (reif && n && s / n < SCHWACH_UNTER) schwach++
    }
    const ges = sicher + aufbau + neu
    const nachId = new Map(liste.map((v) => [v.id, v]))
    return {
      index: i,
      unit: einordnung[i]?.unit ?? '',
      name: einordnung[i]?.name || t.titel,
      woerter: liste.length,
      zeit: t.zeit,
      sicher: ges ? sicher / ges : 0,
      aufbau: ges ? aufbau / ges : 0,
      neu: ges ? neu / ges : 1,
      schwach: reif ? schwach : null,
      probleme: [...jeWort.entries()]
        .filter(([, j]) => j.versuche >= 3 && j.falsch > 0)
        .sort((x, y) => y[1].falsch / y[1].versuche - x[1].falsch / x[1].versuche)
        .slice(0, 5)
        .map(([id, j]) => ({ term: nachId.get(id)!.term, translation: nachId.get(id)!.translation, quote: j.falsch / j.versuche })),
      jeLernende
    }
  })
}

/** Gruppen für die Anzeige: je Unit in Freigabe-Reihenfolge, die neueste zuerst (sie steht offen) */
export function nachUnits<T extends Pick<AbschnittStatistik, 'unit' | 'zeit'>>(zeilen: T[]): { unit: string; zeilen: T[]; neueste: number }[] {
  const gruppen = new Map<string, T[]>()
  for (const z of zeilen) gruppen.set(z.unit, [...(gruppen.get(z.unit) ?? []), z])
  return [...gruppen.entries()]
    .map(([unit, l]) => ({ unit, zeilen: l, neueste: Math.max(0, ...l.map((x) => x.zeit)) }))
    .sort((a, b) => b.neueste - a.neueste)
}
