/**
 * Kursseite im Sprachenlernen (08.10.2026, abgestimmt mit der Lehrkraft): reine Helfer für die zugeklappten Kästen –
 * Kurzinfo im Kopf des Kastens „Vokabeln" und die Grammatik nach Schuljahren (wie im Ordner der Lernenden: das neueste
 * Jahr oben, nur Jahre mit Inhalt, ohne bekannten Jahrgang ganz unten; die Reihenfolge der Tabelle bleibt im Jahr).
 */
import type { JahrgangsGruppe } from '../regal/grammatikJahrgaenge'
import { bandRang } from '@shared/lehrwerkBand'
import { abschnittStelle } from '@shared/kursAbschnitte'

/** „20.12." – Tag und Monat, zweistellig */
export const tagMonat = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`
}

/** Kurzinfo im Kopf des Kastens „Vokabeln", etwa „120 Wörter · 10 pro Tag · bis 20.12. · Test 14.11." */
export function vokabelKurzinfo(k: { anzahl: number; tagesziel?: number; bis: number | null; testTermin: number | null }): string {
  if (!k.anzahl) return 'noch keine Vokabeln'
  return [
    `${k.anzahl} ${k.anzahl === 1 ? 'Wort' : 'Wörter'}`,
    `${k.tagesziel ?? 10} pro Tag`,
    k.bis ? `bis ${tagMonat(k.bis)}` : '',
    k.testTermin ? `Test ${tagMonat(k.testTermin)}` : ''
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Zeilen nach Schuljahr gruppieren: Jahre absteigend, null (ohne Jahrgang) zuletzt; die Reihenfolge innerhalb eines
 * Jahres bleibt wie übergeben (die Tabelle sortiert vorher).
 */
export function nachJahrGruppiert<T>(zeilen: T[], jahrVon: (t: T) => number | null | undefined): JahrgangsGruppe<T>[] {
  const gruppen = new Map<number | null, T[]>()
  for (const z of zeilen) {
    const j = jahrVon(z)
    const k = typeof j === 'number' && Number.isFinite(j) ? j : null
    gruppen.set(k, [...(gruppen.get(k) ?? []), z])
  }
  return [...gruppen.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : b - a))
    .map(([jahrgang, eintraege]) => ({ jahrgang, eintraege }))
}

/** Suche über mehrere Texte (Titel, Thema, Regeln): alle Wörter der Suche müssen vorkommen, ohne Groß/klein */
export function passtSuche(texte: (string | undefined)[], suche: string): boolean {
  const woerter = suche.toLowerCase().split(/\s+/).filter(Boolean)
  if (!woerter.length) return true
  const alles = texte.filter(Boolean).join(' ').toLowerCase()
  return woerter.every((w) => alles.includes(w))
}

/** Gruppe der Kurs-Grammatik: Band und Unit (Lehrwerk bekannt) oder Schuljahr */
export interface KursGruppe<T> {
  /** Schlüssel für „offen/zu" („b:Green Line 6|Unit 2", „j:7", „j:ohne") */
  schluessel: string
  buch?: string
  unit?: string
  jahrgang: number | null
  eintraege: T[]
}

/**
 * Grammatik nach Lehrwerk gliedern (09.10.2026, Wunsch der Lehrkraft): wo Band und Unit bekannt sind, je Band und Unit –
 * neuester Band oben, im Band die spätere Unit oben (Reihenfolge `unitFolge`, sonst nach Nummer), Band ohne Unit unter
 * seinen Units. Ohne Lehrwerk wie bisher nach Schuljahr (neuestes oben, ohne Jahrgang ganz unten), unter den Bänden.
 * Die Reihenfolge innerhalb einer Gruppe bleibt wie übergeben (die Tabelle sortiert vorher).
 */
export function nachLehrwerkGruppiert<T>(
  zeilen: T[],
  stelleVon: (t: T) => { buch?: string; unit?: string } | null | undefined,
  jahrVon: (t: T) => number | null | undefined,
  unitFolge: (buch: string) => string[] = () => []
): KursGruppe<T>[] {
  const gruppen = new Map<string, KursGruppe<T>>()
  for (const z of zeilen) {
    const s = stelleVon(z)
    const j = jahrVon(z)
    const jahrgang = typeof j === 'number' && Number.isFinite(j) ? j : null
    const schluessel = s?.buch ? `b:${s.buch}|${s.unit ?? ''}` : `j:${jahrgang ?? 'ohne'}`
    const g = gruppen.get(schluessel) ?? { schluessel, ...(s?.buch ? { buch: s.buch, ...(s.unit ? { unit: s.unit } : {}) } : {}), jahrgang, eintraege: [] }
    g.eintraege.push(z)
    gruppen.set(schluessel, g)
  }
  const unitRang = (g: KursGruppe<T>): number => {
    if (!g.unit) return -1
    const i = unitFolge(g.buch ?? '').indexOf(g.unit)
    if (i >= 0) return 1000 + i
    const n = /(\d+)\s*$/.exec(g.unit)
    return n ? 500 + Number(n[1]) : 0
  }
  return [...gruppen.values()].sort((a, b) => {
    if (a.buch && b.buch)
      return bandRang(b.buch) - bandRang(a.buch) || (a.buch === b.buch ? unitRang(b) - unitRang(a) : a.buch.localeCompare(b.buch, 'de'))
    if (a.buch || b.buch) return a.buch ? -1 : 1
    return a.jahrgang === null ? 1 : b.jahrgang === null ? -1 : b.jahrgang - a.jahrgang
  })
}

/** Freigegebener Abschnitt des Vokabelkurses – Bezug für die Grammatik-Gliederung (shared/kursAbschnitte.ts) */
export interface KursAbschnittBezug {
  buch?: string
  unit: string
  name?: string
  /** Freigegeben (ms) */
  zeit: number
  /** Stelle im Lehrwerk laut Gliederung (server/wartungAbschnitteTeilen.ts `lehrwerkGliederung`) */
  unitRang?: number
  abschnittRang?: number
}

export interface GrammatikStationGruppe<T> {
  /** '' = in der Unit freigegeben, ohne bekannte Station */
  station: string
  eintraege: T[]
}
export interface GrammatikUnitGruppe<T> {
  /** Schlüssel für „offen/zu" („u:Green Line 1|Unit 1") */
  schluessel: string
  unit: string
  stationen: GrammatikStationGruppe<T>[]
  anzahl: number
}
export interface GrammatikBandGruppe<T> {
  /** Schlüssel für „offen/zu" („b:Green Line 1"); '' = ohne Band */
  schluessel: string
  buch: string
  units: GrammatikUnitGruppe<T>[]
  anzahl: number
}

const vergleich = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** „Green Line 1" = „Green Line 1 (Niedersachsen)", aber nicht = „Green Line 10" */
export function bandGleich(a: string, b: string): boolean {
  const x = vergleich(a)
  const y = vergleich(b)
  if (!x || !y) return false
  if (x === y) return true
  const [kurz, lang] = x.length < y.length ? [x, y] : [y, x]
  return lang.startsWith(kurz) && /\d$/.test(kurz) && !/\d/.test(lang[kurz.length])
}

/** Unit-Nummer im Namen („Unit 3" → 3) */
const unitNummer = (unit: string): number | null => {
  const m = /(\d+)\s*$/.exec(unit)
  return m ? Number(m[1]) : null
}

/**
 * Grammatik wie die Vokabeln gliedern (10.10.2026, Entscheidung der Lehrkraft): Band (mit Cover) › Unit › Station ›
 * Grammatikthemen. Reihenfolge wie bei den Vokabeln auf der Seite der Lehrkraft: Späteres oben – neuester Band oben, im
 * Band Unit 2 über Unit 1, in der Unit Station 3 über Station 1.
 *
 * Einordnung je Eintrag:
 *  1. Stelle im Lehrwerk (Freigabe bzw. Katalog, `stelleVon`) – wenn der Kurs Bände hat, nur in einem dieser Bände
 *     (eine Wiederholung aus Band 1 in einer Klasse mit Band 3 gehört zu Band 3). Namen von Band und Unit wie bei den
 *     Vokabeln, damit beide Listen gleich heißen.
 *  2. Sonst die Unit, in der sie freigegeben wurde: der zuletzt vor ihr freigegebene Vokabel-Abschnitt (vor allen
 *     Abschnitten freigegeben: der erste). Ohne Station.
 *  3. Kurs ohne Lehrwerk: Stelle aus dem Katalog, sonst `ohne` („Weitere Grammatik").
 * Die Reihenfolge innerhalb einer Station bleibt wie übergeben (die Tabelle sortiert vorher).
 */
export function grammatikNachLehrwerk<T>(
  zeilen: T[],
  stelleVon: (t: T) => { buch?: string; unit?: string; station?: string } | null | undefined,
  zeitVon: (t: T) => number,
  abschnitte: KursAbschnittBezug[],
  unitFolge: (buch: string) => string[] = () => []
): { baende: GrammatikBandGruppe<T>[]; ohne: T[] } {
  const frei = abschnitte.filter((a) => a.unit || a.buch).sort((a, b) => a.zeit - b.zeit)
  const kursBaende = [...new Set(frei.map((a) => a.buch ?? '').filter(Boolean))]
  const ohne: T[] = []
  const plaetze: { z: T; buch: string; unit: string; station: string }[] = []
  for (const z of zeilen) {
    const s = stelleVon(z)
    const imKurs = s?.buch ? kursBaende.find((b) => bandGleich(b, s.buch!)) : undefined
    if (s?.buch && (imKurs || !frei.length || !kursBaende.length) && (s.unit || !frei.length)) {
      const buch = imKurs ?? s.buch
      const unit = s.unit ? frei.find((a) => bandGleich(a.buch ?? '', buch) && vergleich(a.unit) === vergleich(s.unit!))?.unit ?? s.unit : ''
      plaetze.push({ z, buch, unit, station: s.station ?? '' })
      continue
    }
    if (frei.length) {
      const t = zeitVon(z)
      const a = [...frei].reverse().find((x) => x.zeit <= t) ?? frei[0]
      plaetze.push({ z, buch: a.buch ?? '', unit: a.unit, station: '' })
      continue
    }
    ohne.push(z)
  }
  const baende = new Map<string, Map<string, Map<string, T[]>>>()
  for (const p of plaetze) {
    const b = baende.get(p.buch) ?? new Map<string, Map<string, T[]>>()
    const u = b.get(p.unit) ?? new Map<string, T[]>()
    u.set(p.station, [...(u.get(p.station) ?? []), p.z])
    b.set(p.unit, u)
    baende.set(p.buch, b)
  }
  // Unit-Rang im Band: Gliederung des Lehrwerks (wie die Vokabeln), Units ohne Gliederung über den Katalog dazwischen
  const unitRaenge = (buch: string, units: string[]): Map<string, number> => {
    const gliederung = new Map<string, number>()
    for (const a of frei)
      if (bandGleich(a.buch ?? '', buch) || (!buch && !a.buch)) if (a.unitRang !== undefined && !gliederung.has(vergleich(a.unit))) gliederung.set(vergleich(a.unit), a.unitRang)
    const katalog = unitFolge(buch).map(vergleich)
    const zuerst = new Map<string, number>()
    frei.forEach((a, i) => !zuerst.has(vergleich(a.unit)) && (bandGleich(a.buch ?? '', buch) || (!buch && !a.buch)) && zuerst.set(vergleich(a.unit), i))
    const rang = new Map<string, number>()
    for (const u of units) {
      const k = vergleich(u)
      if (!u) rang.set(u, -Infinity)
      else if (gliederung.has(k)) rang.set(u, gliederung.get(k)!)
      else if (katalog.includes(k)) {
        const ci = katalog.indexOf(k)
        if (!gliederung.size) rang.set(u, ci)
        else {
          const davor = katalog.slice(0, ci).filter((x) => gliederung.has(x)).map((x) => gliederung.get(x)!)
          rang.set(u, (davor.length ? Math.max(...davor) : -1) + 0.5)
        }
      } else if (unitNummer(u) !== null && !gliederung.size) rang.set(u, unitNummer(u)!)
      else rang.set(u, zuerst.has(k) ? -1 + zuerst.get(k)! / 1000 : -1)
    }
    return rang
  }
  const stationRang = (s: string): number => (s ? (abschnittStelle(s) ?? -1) : -Infinity)
  const ergebnis: GrammatikBandGruppe<T>[] = [...baende.entries()].map(([buch, units]) => {
    const rang = unitRaenge(buch, [...units.keys()])
    const ug: GrammatikUnitGruppe<T>[] = [...units.entries()]
      .map(([unit, stationen]) => {
        const sg = [...stationen.entries()]
          .map(([station, eintraege]) => ({ station, eintraege }))
          .sort((a, b) => stationRang(b.station) - stationRang(a.station) || a.station.localeCompare(b.station, 'de'))
        return { schluessel: `u:${buch}|${unit}`, unit, stationen: sg, anzahl: sg.reduce((n, s) => n + s.eintraege.length, 0) }
      })
      .sort((a, b) => (rang.get(b.unit) ?? -1) - (rang.get(a.unit) ?? -1) || a.unit.localeCompare(b.unit, 'de'))
    return { schluessel: `b:${buch}`, buch, units: ug, anzahl: ug.reduce((n, u) => n + u.anzahl, 0) }
  })
  ergebnis.sort((a, b) => Number(!a.buch) - Number(!b.buch) || bandRang(b.buch) - bandRang(a.buch) || a.buch.localeCompare(b.buch, 'de'))
  return { baende: ergebnis, ohne }
}

/** Grammatik eines Kurses mit Lernstand (Durchschnitt aller Lernenden) – für den Kasten „Units" */
export interface GrammatikStandKurz {
  id: string
  titel: string
  buch?: string
  unit?: string
  station?: string
  aufgaben: number
  /** Anteile 0–1: bearbeitet bzw. sicher */
  bearbeitet: number
  sicher: number
}
export type UnitZeile<T> = { art: 'vok'; z: T } | { art: 'gram'; g: GrammatikStandKurz }
export interface UnitMitGrammatik<T> {
  unit: string
  zeilen: UnitZeile<T>[]
  vok: T[]
  gram: GrammatikStandKurz[]
}

/**
 * Units mit Grammatik (17.10.2026, abgestimmt mit der Lehrkraft): Die Grammatik des Kurses kommt in die Units der
 * Vokabeln – nach Band (`bandGleich`), Unit und Station (Stelle im Lehrwerk, server `lehrwerkDerGrammatik`). In der Unit
 * steht sie hinter den Vokabel-Abschnitten derselben Station; Units und Bände nur mit Grammatik kommen an ihre Stelle im
 * Buch (Grammatik-Katalog `unitFolge`), Grammatik ohne Band unter „ohne Band". Reihenfolge wie bei den Vokabeln: Späteres oben.
 */
export function unitsMitGrammatik<T extends { name: string }>(
  baende: { buch: string; units: { unit: string; zeilen: T[] }[] }[],
  grammatik: GrammatikStandKurz[],
  unitFolge: (buch: string) => string[] = () => []
): { buch: string; units: UnitMitGrammatik<T>[] }[] {
  const aus: { buch: string; units: UnitMitGrammatik<T>[] }[] = baende.map((b) => ({
    buch: b.buch,
    units: b.units.map((u): UnitMitGrammatik<T> => ({ unit: u.unit, zeilen: u.zeilen.map((z) => ({ art: 'vok' as const, z })), vok: u.zeilen, gram: [] }))
  }))
  const katalogIndex = (buch: string, unit: string): number => unitFolge(buch).findIndex((u) => vergleich(u) === vergleich(unit))
  for (const g of grammatik) {
    let band = aus.find((b) => (g.buch ? b.buch && bandGleich(b.buch, g.buch) : !b.buch))
    if (!band) {
      band = { buch: g.buch ?? '', units: [] }
      aus.push(band)
    }
    const unitName = g.unit ?? ''
    let u = band.units.find((x) => vergleich(x.unit) === vergleich(unitName))
    if (!u) {
      u = { unit: unitName, zeilen: [], vok: [], gram: [] } as UnitMitGrammatik<T>
      // An die Stelle im Buch: vor die erste Unit, die im Katalog davor liegt (Liste absteigend); ohne Stelle ans Ende
      const ci = unitName ? katalogIndex(band.buch, unitName) : -1
      const vor = ci < 0 ? -1 : band.units.findIndex((x) => x.unit && katalogIndex(band!.buch, x.unit) >= 0 && katalogIndex(band!.buch, x.unit) < ci)
      band.units.splice(vor < 0 ? band.units.length : vor, 0, u)
    }
    u.gram.push(g)
    const stelle = g.station ? abschnittStelle(g.station) : null
    const zeile = { art: 'gram' as const, g }
    if (stelle === null) {
      u.zeilen.push(zeile)
      continue
    }
    const stelleVon = (x: UnitZeile<T>): number | null => (x.art === 'vok' ? abschnittStelle(x.z.name) : x.g.station ? abschnittStelle(x.g.station) : null)
    const gleich = u.zeilen.map(stelleVon).lastIndexOf(stelle)
    if (gleich >= 0) {
      u.zeilen.splice(gleich + 1, 0, zeile)
      continue
    }
    const davor = u.zeilen.findIndex((x) => {
      const s = stelleVon(x)
      return s !== null && s < stelle
    })
    u.zeilen.splice(davor < 0 ? u.zeilen.length : davor, 0, zeile)
  }
  aus.sort((a, b) => Number(!a.buch) - Number(!b.buch) || bandRang(b.buch) - bandRang(a.buch))
  return aus.filter((b) => b.units.length)
}
