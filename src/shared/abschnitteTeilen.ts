/**
 * Zusammengefasste Vokabel-Abschnitte teilen (09.10.2026, Befund der Lehrkraft in „Meine Klassen" → Reiter „Vokabeln"):
 * Ältere Kurse führen EINEN Abschnitt (`teile`-Eintrag) für mehrere Abschnitte des Lehrwerks – etwa „Green Line 1 -
 * Unit 1 - Check-in, Station 1, Station 2" (vor dem Patch gemeinsam freigegeben, oder der Titel-Teil ohne `teile`).
 * Daraus werden Abschnitte in Buchreihenfolge: „Unit 1 · Check-in", „Unit 1 · Station 1", „Unit 1 · Station 2" – je
 * mit ihren Wörtern. Kennungen der Wörter, Freigabezeit (`zeit`, auch geplante Felder) und damit der Lernstand der
 * Lernenden bleiben; nur die Reihenfolge der Wörter IM geteilten Bereich ändert sich (jeder Abschnitt zusammenhängend).
 *
 * Zuordnung je Wort über die Wortliste des Lehrwerks: Begriff + Übersetzung, sonst nur der Begriff, bei mehreren
 * Treffern hilft die Kennung der Erstfreigabe („b<Abschnitt>-<Nr>", VokabelQuelle.tsx) bzw. der erste Treffer (Doppeltes
 * wird beim Freigeben übersprungen – das Wort steht beim ersten Vorkommen). Nicht zuzuordnende Wörter bleiben im ersten
 * Teil. Geteilt wird nur, wenn mindestens die Hälfte der Wörter im Lehrwerk gefunden wird (sonst passt das Buch nicht).
 * Rein rechnend: Lehrwerke reicht der Aufrufer herein.
 */
import { quelleUnits, type Quelle } from './vokabelLaufbahn'

export interface BuchFuerTeilen {
  id?: string
  name: string
  units: { name: string; sections: { name: string; entries: { term: string; translation: string; explained?: boolean }[] }[] }[]
}

export interface TeilBasis {
  titel: string
  anzahl: number
  zeit: number
}

export interface WortBasis {
  id: string
  term: string
  translation: string
}

export interface AbschnittPaar {
  unit: string
  abschnitt: string
}

/** Vergleichsform für Namen und Wörter: Kleinbuchstaben, gerade Apostrophe, einfache Leerzeichen */
export const vergleich = (s: string): string =>
  String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * „a, b, c" in Abschnittsnamen der Unit zerlegen – Namen mit Komma („Racial, ethnic and gender identity") werden
 * wieder zusammengesetzt. null, wenn ein Stück zu keinem Abschnitt passt.
 */
function abschnitteAus(rest: string, namen: string[]): string[] | null {
  const bekannt = new Map(namen.map((n) => [vergleich(n), n]))
  const stuecke = rest.split(/\s*,\s*/).filter((x) => x.trim())
  const aus: string[] = []
  let i = 0
  while (i < stuecke.length) {
    let treffer = 0
    // Längsten passenden Namen zuerst
    for (let j = stuecke.length; j > i; j--) {
      const n = bekannt.get(vergleich(stuecke.slice(i, j).join(', ')))
      if (n) {
        aus.push(n)
        treffer = j
        break
      }
    }
    if (!treffer) return null
    i = treffer
  }
  return aus.length ? aus : null
}

/** Band im Titel („Green Line 1 - …"), sonst '' */
export function bandImTitel(titel: string): string {
  const t = titel.split(' - ').map((x) => x.trim())
  return (t.length >= 3 && !t[1].includes(':')) || (t.length >= 2 && t.slice(1).every((x) => x.includes(':'))) ? t[0] : ''
}

/**
 * Lehrwerk-Abschnitte, die ein Abschnittstitel nennt (in Titel-Reihenfolge). Titelformen (VokabelQuelle.tsx):
 *  „Band - Unit - a, b", „Band - U1: a, b - U2: c", „U1: a, b", „Unit · a, b", „a, b" (Unit aus der Herkunft).
 * null, wenn der Titel nicht zum Lehrwerk passt.
 */
export function abschnitteImTitel(titel: string, buch: BuchFuerTeilen, quelle?: Partial<Quelle> | null): AbschnittPaar[] | null {
  const unitVon = (name: string) => buch.units.find((u) => vergleich(u.name) === vergleich(name))
  const paare = (unit: string, rest: string): AbschnittPaar[] | null => {
    const u = unitVon(unit)
    if (!u) return null
    const a = abschnitteAus(rest, u.sections.map((s) => s.name))
    return a ? a.map((abschnitt) => ({ unit: u.name, abschnitt })) : null
  }
  const t = titel.trim()
  const teile = t.split(' - ').map((x) => x.trim())
  if (teile.length >= 3 && !teile[1].includes(':')) return paare(teile[1], teile.slice(2).join(' - '))
  const mitDoppelpunkt = teile.length >= 2 && teile.slice(1).every((x) => x.includes(':')) ? teile.slice(1) : !t.includes(' - ') && t.includes(':') ? [t] : null
  if (mitDoppelpunkt) {
    const aus: AbschnittPaar[] = []
    for (const x of mitDoppelpunkt) {
      const k = x.indexOf(':')
      const p = paare(x.slice(0, k).trim(), x.slice(k + 1).trim())
      if (!p) return null
      aus.push(...p)
    }
    return aus
  }
  if (t.includes(' · ')) {
    const [unit, ...rest] = t.split(' · ')
    return paare(unit.trim(), rest.join(' · '))
  }
  // Nur Abschnittsnamen: die Unit der Herkunft, die alle nennt (sonst die einzige)
  const units = quelleUnits(quelle)
  const stuecke = t.split(/\s*,\s*/).map(vergleich)
  const passend = units.filter((u) => stuecke.every((s) => u.abschnitte.some((a) => vergleich(a) === s || vergleich(a).includes(s))))
  const unit = passend.length === 1 ? passend[0].unit : units.length === 1 ? units[0].unit : ''
  return unit ? paare(unit, t) : null
}

/**
 * Einen Abschnitt teilen. `woerter` sind GENAU die Wörter dieses Abschnitts. null = nichts zu teilen
 * (nur ein Abschnitt im Titel, Titel/Lehrwerk passen nicht, zu wenige Wörter gefunden, am Ende nur ein Teil mit Wörtern).
 */
export function teilAufteilen<T extends TeilBasis, W extends WortBasis>(
  teil: T,
  woerter: W[],
  buch: BuchFuerTeilen,
  quelle?: Partial<Quelle> | null
): { teile: T[]; woerter: W[] } | null {
  const paare = abschnitteImTitel(teil.titel, buch, quelle)
  if (!paare || paare.length < 2 || !woerter.length) return null
  const beide = new Map<string, number[]>()
  const nurBegriff = new Map<string, number[]>()
  const dazu = (m: Map<string, number[]>, k: string, i: number): void => {
    const l = m.get(k) ?? []
    if (!l.includes(i)) m.set(k, [...l, i])
  }
  for (const [i, p] of paare.entries()) {
    const s = buch.units.find((u) => u.name === p.unit)?.sections.find((x) => x.name === p.abschnitt)
    for (const e of s?.entries ?? []) {
      if (!e.term) continue
      dazu(beide, `${vergleich(e.term)}|${vergleich(e.translation)}`, i)
      dazu(nurBegriff, vergleich(e.term), i)
    }
  }
  let gefunden = 0
  const ziel = woerter.map((w) => {
    const kandidaten = beide.get(`${vergleich(w.term)}|${vergleich(w.translation)}`) ?? nurBegriff.get(vergleich(w.term)) ?? []
    const hinweis = /^b(\d+)-\d+$/.exec(w.id)
    const si = hinweis ? Number(hinweis[1]) : -1
    if (kandidaten.length) {
      gefunden++
      return kandidaten.includes(si) ? si : kandidaten[0]
    }
    return 0
  })
  if (gefunden * 2 < woerter.length) return null
  const neueTeile: T[] = []
  const neueWoerter: W[] = []
  for (const [i, p] of paare.entries()) {
    const liste = woerter.filter((_, j) => ziel[j] === i)
    if (!liste.length) continue
    neueTeile.push({ ...teil, titel: `${p.unit} · ${p.abschnitt}`, anzahl: liste.length })
    neueWoerter.push(...liste)
  }
  return neueTeile.length >= 2 ? { teile: neueTeile, woerter: neueWoerter } : null
}

/**
 * Alle zusammengefassten Abschnitte eines Kurses teilen. `teile` deckt die Wörter in Reihenfolge ab (der letzte nimmt
 * den Rest, wie in kursAbschnitte.ts). `buchVon` liefert das Lehrwerk zur Kennung der Herkunft bzw. zum Band im Titel.
 * null = nichts geändert.
 */
export function kursAbschnitteTeilen<T extends TeilBasis, W extends WortBasis>(
  teile: T[],
  woerter: W[],
  quelle: Partial<Quelle> | null | undefined,
  buchVon: (kennung: string, bandName: string) => BuchFuerTeilen | null
): { teile: T[]; woerter: W[]; geteilt: number } | null {
  if (!teile.length || !woerter.length) return null
  // Schnell vorab: nur Titel mit Komma oder mehreren Units kommen infrage (kein Lehrwerk laden)
  if (!teile.some((t) => /,|:/.test(t.titel))) return null
  const neuT: T[] = []
  const neuW: W[] = []
  let start = 0
  let geteilt = 0
  for (const [i, t] of teile.entries()) {
    const ende = i === teile.length - 1 ? woerter.length : Math.min(woerter.length, start + Math.max(0, t.anzahl))
    const bereich = woerter.slice(start, ende)
    start = ende
    let r: { teile: T[]; woerter: W[] } | null = null
    if (/,|:/.test(t.titel) && bereich.length > 1) {
      const buch = buchVon(quelle?.lehrwerk ?? '', bandImTitel(t.titel))
      if (buch) r = teilAufteilen({ ...t, anzahl: bereich.length }, bereich, buch, quelle)
    }
    if (r) {
      geteilt++
      neuT.push(...r.teile)
      neuW.push(...r.woerter)
    } else {
      neuT.push(t)
      neuW.push(...bereich)
    }
  }
  return geteilt ? { teile: neuT, woerter: neuW, geteilt } : null
}
