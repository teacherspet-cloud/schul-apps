/**
 * Reiseplaner (Kooperativ, Kl. 7–10 ±1), neu gestaltet am 09.10.2026 mit der Lehrkraft („unverständlich, die Hinweise
 * passten zu keiner Karte"). Info-Lücke: Alle sehen dieselben 3–5 Reisekarten (Ziel, Verkehrsmittel, Wetter,
 * Aktivitäten, Preis, Tage – mit Symbolen und kurzen Texten in der Zielsprache). Jede Person bekommt privat 2–3
 * Hinweise („We want to go by train.", „Mia can't swim."). Nur alle Hinweise zusammen passen zu genau EINER Reise.
 *
 * Erzeugung durch Konstruktion: Zielreise wählen; je Person eine „Schlüssel-Reise", die nur ihre Hinweise ausschließen
 * (so ist jede Person nötig und niemand löst allein); weitere Reisen schließt mindestens ein Hinweis aus. Danach wird
 * alles programmatisch geprüft (eindeutige Lösung, jede Person nötig) – sonst neuer Versuch.
 *
 * Klasse 5–6: einfache Aussagen und Symbole; 7–8: Verneinungen, Vergleiche („cheaper than"), Tage; ab 9: indirekte
 * Hinweise, Bedingungen („If it rains, …"), keine Symbole. Schwierigkeit: leicht 3 Reisen/wenige Merkmale … unmöglich
 * 5 sehr ähnliche Reisen, mehr Hinweise je Person. Uhr nur ab „schwer" (nie in Klasse 5–6). 3–4 Runden, jede etwas
 * schwerer. Gemeinsame Wahl: jemand schlägt eine Karte vor, die Mehrheit stimmt zu. Nach einer falschen Wahl zeigt das
 * Spiel, welcher Hinweis die Reise ausschließt. Der Server schickt nie, welche Reise richtig ist.
 */
import { aktive, basisNeu, gut, koopErgebnis, melde, name, rueckBlock, tx, zufall, type Basis, type Block, type Regeln } from '../kern'
import { kernform } from '../../vokabeltrainer'
import { lexikonFuer, type Begriff, type Lexikon, type Merkmal } from '../reiseLexikon'
import type { SpielInhalt } from '../typen'

export type Feld = Merkmal | 'preis' | 'tage'
export interface Reise {
  ziel?: string
  verkehr?: string
  wetter?: string
  akt?: string[]
  preis?: number
  tage?: number
}
export type Hinweis =
  | { art: 'gleich' | 'nicht'; m: 'ziel' | 'verkehr' | 'wetter'; wert: string; text: string }
  | { art: 'aktJa' | 'aktNein'; wert: string; text: string }
  | { art: 'preisMax'; n: number; strikt: boolean; text: string }
  | { art: 'tageMax' | 'tageMin'; n: number; text: string }
  | { art: 'wenn'; wetter: string; akt: string; text: string }
export interface ReiseRunde {
  reisen: Reise[]
  ziel: number
  hinweise: Record<string, Hinweis[]>
}
export type Stufe = 5 | 7 | 9
export const stufeVon = (jahrgang: number | null): Stufe => (jahrgang !== null && jahrgang <= 6 ? 5 : jahrgang !== null && jahrgang >= 9 ? 9 : 7)

/** Erfüllt eine Reise den Hinweis? */
export function erfuellt(h: Hinweis, r: Reise): boolean {
  switch (h.art) {
    case 'gleich':
      return r[h.m] === h.wert
    case 'nicht':
      return r[h.m] !== h.wert
    case 'aktJa':
      return Boolean(r.akt?.includes(h.wert))
    case 'aktNein':
      return !r.akt?.includes(h.wert)
    case 'preisMax':
      return r.preis === undefined || (h.strikt ? r.preis < h.n : r.preis <= h.n)
    case 'tageMax':
      return r.tage === undefined || r.tage <= h.n
    case 'tageMin':
      return r.tage === undefined || r.tage >= h.n
    case 'wenn':
      return r.wetter !== h.wetter || Boolean(r.akt?.includes(h.akt))
  }
}
const schluessel = (h: Hinweis): string => JSON.stringify({ ...h, text: '' })
const fuell = (s: string, n: number): string => s.replace('{0}', String(n))

interface Erzeugung {
  lex: Lexikon
  stufe: Stufe
  schwierigkeit: string
  runde: number
  spieler: string[]
  /** Wörter aus Lehrwerk und Kurs (klein, Kernform) – solche Begriffe kommen bevorzugt vor */
  /** Wörter (Kernform, klein) → Vorrang: 0 im Kurs bzw. von allen im Vokabelweg kennengelernt, 1 im Lehrwerk bis zum Stand */
  bekannt: Map<string, number>
  zufall: () => number
}

const BASIS_MERKMALE: Record<string, Feld[]> = {
  leicht: ['ziel', 'verkehr', 'akt'],
  mittel: ['ziel', 'verkehr', 'wetter', 'akt', 'preis'],
  schwer: ['ziel', 'verkehr', 'wetter', 'akt', 'preis', 'tage'],
  unmoeglich: ['ziel', 'verkehr', 'wetter', 'akt', 'preis', 'tage']
}
const ALLE: Feld[] = ['ziel', 'verkehr', 'akt', 'wetter', 'preis', 'tage']
const REISEN: Record<string, number> = { leicht: 3, mittel: 4, schwer: 4, unmoeglich: 5 }

export const rundenZahl = (schwierigkeit: string): number => (schwierigkeit === 'leicht' ? 3 : 4)
export const reisenZahl = (schwierigkeit: string, runde: number, personen: number): number =>
  Math.min(5, Math.max((REISEN[schwierigkeit] ?? 4) + (runde >= 2 ? 1 : 0), personen + 1))
export const hinweiseJePerson = (schwierigkeit: string, runde: number): number =>
  schwierigkeit === 'unmoeglich' || (schwierigkeit === 'schwer' && runde >= 2) ? 3 : 2

function mischenMit<T>(zf: () => number, l: readonly T[]): T[] {
  const a = [...l]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(zf() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const eines = <T>(zf: () => number, l: readonly T[]): T => l[Math.floor(zf() * l.length)]

/**
 * Begriffe einer Gruppe in Vorrang-Reihenfolge (09.10.2026, Lehrkraft): zuerst, was alle schon kennen (Kurs, gemeinsam
 * im Vokabelweg kennengelernt), dann Wörter des Lehrwerks bis zum Stand der Klasse, zuletzt der eingebaute
 * Grundwortschatz. Klasse 5–6 nur Begriffe des Grundwortschatzes.
 */
function vorrat(e: Erzeugung, m: Merkmal): Begriff[] {
  const alle = e.lex.begriffe[m].filter((x) => e.stufe !== 5 || x.basis)
  const woerter = [...e.bekannt]
  const rang = (x: Begriff): number => {
    const w = x.wort.toLowerCase()
    const r = woerter.filter(([k]) => k === w || k.startsWith(w)).map(([, v]) => v)
    return r.length ? Math.min(...r) : 2
  }
  const gemischt = mischenMit(e.zufall, alle).map((x) => ({ x, r: rang(x) }))
  return [0, 1, 2].flatMap((n) => gemischt.filter((y) => y.r === n).map((y) => y.x))
}

/**
 * Alle Hinweise, die für die Zielreise stimmen (je nach Klassenstufe): „so soll es sein" zu den Werten der Zielreise,
 * „so nicht" bzw. indirekt zu allen anderen Begriffen (auch solchen, die auf keiner Karte stehen – harmlose Hinweise
 * zum Auffüllen), Preis, Tage und ab Klasse 9 Bedingungen.
 */
function hinweisVorrat(e: Erzeugung, ziel: Reise, reisen: Reise[], felder: Feld[]): Hinweis[] {
  const aus: Hinweis[] = []
  const lex = e.lex
  const begriff = (m: Merkmal, id: string): Begriff => lex.begriffe[m].find((x) => x.id === id)!
  for (const m of ['ziel', 'verkehr', 'wetter'] as const) {
    if (!felder.includes(m) || !ziel[m]) continue
    const t = begriff(m, ziel[m]!)
    if (t.ja && !(e.stufe === 9 && m === 'wetter')) aus.push({ art: 'gleich', m, wert: t.id, text: t.ja })
    if (e.stufe >= 7)
      for (const d of lex.begriffe[m].filter((x) => x.id !== ziel[m])) aus.push({ art: 'nicht', m, wert: d.id, text: e.stufe === 9 ? d.nein9 : d.nein })
  }
  if (felder.includes('akt')) {
    for (const a of ziel.akt ?? []) aus.push({ art: 'aktJa', wert: a, text: begriff('akt', a).ja! })
    // alle Aktivitäten des Lexikons (auch ohne Karte: harmlose, wahre Hinweise zum Auffüllen)
    for (const d of lex.begriffe.akt.filter((x) => !ziel.akt?.includes(x.id))) aus.push({ art: 'aktNein', wert: d.id, text: e.stufe === 9 ? d.nein9 : d.nein })
    // Bedingungen ab Klasse 9: „If it rains, we want to visit a museum."
    if (e.stufe === 9 && felder.includes('wetter'))
      for (const w of new Set(reisen.map((r) => r.wetter).filter((x): x is string => Boolean(x))))
        for (const a of new Set(reisen.flatMap((r) => r.akt ?? []))) {
          const bw = begriff('wetter', w)
          const ba = begriff('akt', a)
          if (!bw.wenn || !ba.wollen) continue
          // Chinesisch/Japanisch: ohne Leerzeichen nach dem vollbreiten Komma
          const text = /[　-ヿ一-鿿＀-￯]$/.test(bw.wenn) ? `${bw.wenn}${ba.wollen}` : `${bw.wenn} ${ba.wollen}`
          const h: Hinweis = { art: 'wenn', wetter: w, akt: a, text }
          if (erfuellt(h, ziel)) aus.push(h)
        }
  }
  const z = lex.zahlen
  if (felder.includes('preis') && ziel.preis !== undefined) {
    if (e.stufe === 7) aus.push({ art: 'preisMax', n: ziel.preis + 50, strikt: true, text: fuell(z.preis7, ziel.preis + 50) })
    else aus.push({ art: 'preisMax', n: ziel.preis, strikt: false, text: fuell(e.stufe === 5 ? z.preis5 : z.preis9, ziel.preis) })
  }
  if (felder.includes('tage') && ziel.tage !== undefined) {
    aus.push({ art: 'tageMax', n: ziel.tage, text: fuell(e.stufe === 9 ? z.tage9 : z.tage5, ziel.tage) })
    if (e.stufe >= 7) aus.push({ art: 'tageMin', n: ziel.tage, text: fuell(z.tage7, ziel.tage) })
  }
  return aus.filter((h) => erfuellt(h, ziel))
}

const kopie = (r: Reise): Reise => ({ ...r, ...(r.akt ? { akt: [...r.akt] } : {}) })

/** Eine Reise verändern: `n` Merkmale bekommen einen anderen Wert (Preis teurer, Tage mehr bzw. weniger) */
function veraendert(e: Erzeugung, ziel: Reise, felder: Feld[], werte: Record<Merkmal, Begriff[]>, n: number): Reise {
  const r = kopie(ziel)
  for (const f of mischenMit(e.zufall, felder).slice(0, n)) {
    if (f === 'preis') r.preis = (ziel.preis ?? 200) + 50 * (2 + Math.floor(e.zufall() * 4))
    else if (f === 'tage') r.tage = Math.max(1, (ziel.tage ?? 5) + (e.stufe === 5 || e.zufall() < 0.5 ? 1 : -1) * (2 + Math.floor(e.zufall() * 2)))
    else if (f === 'akt') {
      const andere = werte.akt.filter((x) => !ziel.akt?.includes(x.id))
      if (andere.length && r.akt?.length) r.akt[Math.floor(e.zufall() * r.akt.length)] = eines(e.zufall, andere).id
    } else {
      const andere = werte[f].filter((x) => x.id !== ziel[f])
      if (andere.length) r[f] = eines(e.zufall, andere).id
    }
  }
  return r
}

const gleicheReise = (a: Reise, b: Reise): boolean =>
  JSON.stringify({ ...a, akt: [...(a.akt ?? [])].sort() }) === JSON.stringify({ ...b, akt: [...(b.akt ?? [])].sort() })

/** Prüfung: genau eine Reise passt zu allen Hinweisen; ohne die Hinweise einer Person bzw. mit nur ihren passen mehrere */
export function pruefeRunde(r: ReiseRunde): { eindeutig: boolean; alleNoetig: boolean; keinerAllein: boolean } {
  const passend = (hs: Hinweis[]): number[] => r.reisen.map((x, i) => (hs.every((h) => erfuellt(h, x)) ? i : -1)).filter((i) => i >= 0)
  const alle = Object.values(r.hinweise).flat()
  const p = passend(alle)
  const leute = Object.keys(r.hinweise)
  return {
    eindeutig: p.length === 1 && p[0] === r.ziel,
    alleNoetig: leute.every((id) => passend(leute.filter((x) => x !== id).flatMap((x) => r.hinweise[x])).length >= 2),
    keinerAllein: leute.every((id) => passend(r.hinweise[id]).length >= 2)
  }
}

/**
 * Wie viele Schlüssel-Reisen ein Merkmal tragen kann (jede braucht einen eigenen Hinweis, der keine andere ausschließt):
 * Klasse 5–6 nur „so soll es sein" → je Begriffsmerkmal eine; ab Klasse 7 „so nicht" → mehrere mit verschiedenen
 * Werten; Aktivitäten immer mehrere („Mia can't swim."); Preis eine; Tage eine bzw. zwei (mehr/weniger).
 */
function kapazitaet(e: Erzeugung, f: Feld, ziel: Reise, werte: Record<Merkmal, Begriff[]>): number {
  if (f === 'preis') return 1
  if (f === 'tage') return e.stufe === 5 ? 1 : 2
  if (f === 'akt') return werte.akt.length - (ziel.akt?.length ?? 0)
  const zahl = werte[f].length - 1
  if (e.stufe === 5) return f === 'wetter' && !e.lex.begriffe.wetter.find((x) => x.id === ziel.wetter)?.ja ? 0 : Math.min(1, zahl)
  return zahl
}

/** Eine Runde erzeugen (null, wenn es nach vielen Versuchen nicht gelingt) */
export function reiseRunde(e: Erzeugung): ReiseRunde | null {
  const basis = BASIS_MERKMALE[e.schwierigkeit] ?? BASIS_MERKMALE.mittel
  let felder: Feld[] = [...basis]
  if (e.runde >= 2 && felder.length < ALLE.length) felder.push(ALLE.find((f) => !felder.includes(f))!)
  const n = reisenZahl(e.schwierigkeit, e.runde, e.spieler.length)
  // Klasse 5–6: zwei Hinweise je Person genügen (kurze, einfache Sätze)
  const cpp = e.stufe === 5 ? 2 : hinweiseJePerson(e.schwierigkeit, e.runde)
  const aehnlich = e.schwierigkeit === 'unmoeglich' || (e.runde >= 2 && e.schwierigkeit !== 'leicht')
  const aktZahl = e.schwierigkeit === 'schwer' || e.schwierigkeit === 'unmoeglich' ? 2 : 1
  const mehr = (): boolean => {
    const f = ALLE.find((x) => !felder.includes(x))
    if (f) felder = [...felder, f]
    return Boolean(f)
  }
  for (let versuch = 0; versuch < 300; versuch++) {
    if (versuch > 0 && versuch % 60 === 0) mehr()
    const werte = { ziel: vorrat(e, 'ziel'), verkehr: vorrat(e, 'verkehr'), wetter: vorrat(e, 'wetter'), akt: vorrat(e, 'akt') } as Record<Merkmal, Begriff[]>
    const ziel: Reise = {}
    for (const f of felder) {
      if (f === 'preis') ziel.preis = 150 + 50 * Math.floor(e.zufall() * 6)
      else if (f === 'tage') ziel.tage = 3 + Math.floor(e.zufall() * 5)
      else if (f === 'akt') ziel.akt = mischenMit(e.zufall, werte.akt.slice(0, 4)).slice(0, aktZahl).map((x) => x.id)
      else ziel[f] = eines(e.zufall, werte[f].slice(0, 4)).id
    }
    // Merkmale der Schlüssel-Reisen planen (reihum, nach Kapazität)
    const plan: Feld[] = []
    const reihe = mischenMit(e.zufall, felder)
    for (let weiter = true; weiter && plan.length < e.spieler.length; ) {
      weiter = false
      for (const f of reihe)
        if (plan.length < e.spieler.length && plan.filter((x) => x === f).length < kapazitaet(e, f, ziel, werte)) {
          plan.push(f)
          weiter = true
        }
    }
    if (plan.length < e.spieler.length) {
      mehr()
      continue
    }
    // Schlüssel-Reisen: genau ein Merkmal anders, Werte untereinander verschieden
    const reisen: Reise[] = [ziel]
    const schluesselVon: number[] = []
    const genutzt: Record<string, string[]> = {}
    let tageRichtung = e.stufe === 5 || e.zufall() < 0.5 ? 1 : -1
    for (const f of plan) {
      const r = kopie(ziel)
      const frei = (m: Merkmal, ids: string[]): string[] => ids.filter((id) => !(genutzt[m] ?? []).includes(id))
      if (f === 'preis') r.preis = (ziel.preis ?? 200) + 50 * (2 + Math.floor(e.zufall() * 4))
      else if (f === 'tage') {
        r.tage = Math.max(1, (ziel.tage ?? 5) + tageRichtung * (2 + Math.floor(e.zufall() * 2)))
        tageRichtung = -tageRichtung
      } else if (f === 'akt') {
        const id = eines(e.zufall, frei('akt', werte.akt.filter((x) => !ziel.akt?.includes(x.id)).map((x) => x.id)))
        r.akt![Math.floor(e.zufall() * r.akt!.length)] = id
        ;(genutzt.akt ??= []).push(id)
      } else {
        const id = eines(e.zufall, frei(f, werte[f].filter((x) => x.id !== ziel[f]).map((x) => x.id)))
        r[f] = id
        ;(genutzt[f] ??= []).push(id)
      }
      schluesselVon.push(reisen.length)
      reisen.push(r)
    }
    let ok = reisen.every((r, i) => reisen.findIndex((x) => gleicheReise(x, r)) === i)
    while (ok && reisen.length < n) {
      let neu: Reise | null = null
      for (let v = 0; v < 30 && !neu; v++) {
        const r = veraendert(e, ziel, felder, werte, aehnlich ? 1 : 1 + Math.floor(e.zufall() * 2))
        if (!reisen.some((x) => gleicheReise(x, r))) neu = r
      }
      if (!neu) ok = false
      else reisen.push(neu)
    }
    if (!ok) continue
    const vorr = mischenMit(e.zufall, hinweisVorrat(e, ziel, reisen, felder))
    const schliesstAus = (h: Hinweis, i: number): boolean => !erfuellt(h, reisen[i])
    const hinweise: Record<string, Hinweis[]> = Object.fromEntries(e.spieler.map((s) => [s, [] as Hinweis[]]))
    const benutzt = new Set<string>()
    // Darf Person p diesen Hinweis bekommen? Er darf keine Schlüssel-Reise einer anderen Person ausschließen
    const erlaubt = (h: Hinweis, p: number): boolean => !benutzt.has(schluessel(h)) && schluesselVon.every((k, q) => q === p || !schliesstAus(h, k))
    const geben = (h: Hinweis, p: number): void => {
      hinweise[e.spieler[p]].push(h)
      benutzt.add(schluessel(h))
    }
    // 1. je Person ein Hinweis gegen ihre Schlüssel-Reise
    for (let p = 0; p < e.spieler.length && ok; p++) {
      const h = vorr.find((x) => schliesstAus(x, schluesselVon[p]) && erlaubt(x, p))
      if (!h) ok = false
      else geben(h, p)
    }
    if (!ok) continue
    // 2. weitere Reisen: mindestens ein Hinweis schließt sie aus
    for (let i = 1; i < reisen.length && ok; i++) {
      if (schluesselVon.includes(i) || Object.values(hinweise).flat().some((h) => schliesstAus(h, i))) continue
      const p = e.spieler
        .map((_, q) => q)
        .sort((a, b) => hinweise[e.spieler[a]].length - hinweise[e.spieler[b]].length)
        .find((q) => vorr.some((h) => schliesstAus(h, i) && erlaubt(h, q)))
      if (p === undefined) ok = false
      else geben(vorr.find((h) => schliesstAus(h, i) && erlaubt(h, p))!, p)
    }
    if (!ok) continue
    // 3. auffüllen auf 2–3 Hinweise je Person (zuerst solche, die etwas ausschließen)
    for (let p = 0; p < e.spieler.length; p++)
      while (hinweise[e.spieler[p]].length < cpp) {
        const h = vorr.find((x) => erlaubt(x, p) && reisen.some((_, i) => i > 0 && schliesstAus(x, i))) ?? vorr.find((x) => erlaubt(x, p))
        if (!h) break
        geben(h, p)
      }
    if (Object.values(hinweise).some((l) => l.length < 2)) continue
    // Karten mischen (die Reihenfolge verrät nichts)
    const ordnung = mischenMit(
      e.zufall,
      reisen.map((_, i) => i)
    )
    const runde: ReiseRunde = {
      reisen: ordnung.map((i) => reisen[i]),
      ziel: ordnung.indexOf(0),
      hinweise: Object.fromEntries(Object.entries(hinweise).map(([k, l]) => [k, mischenMit(e.zufall, l)]))
    }
    const pr = pruefeRunde(runde)
    if (pr.eindeutig && pr.alleNoetig && pr.keinerAllein) return runde
  }
  return null
}

/** Kartentext in der Zielsprache (Symbole bis Klasse 8) */
export function kartenText(lex: Lexikon, r: Reise, stufe: Stufe): string {
  const sym = stufe !== 9
  const teil = (m: Merkmal, id: string): string => {
    const x = lex.begriffe[m].find((y) => y.id === id)
    return x ? `${sym ? `${x.icon} ` : ''}${x.karte}` : id
  }
  const aus: string[] = []
  if (r.ziel) aus.push(teil('ziel', r.ziel))
  if (r.verkehr) aus.push(teil('verkehr', r.verkehr))
  if (r.wetter) aus.push(teil('wetter', r.wetter))
  if (r.akt) aus.push(r.akt.map((a) => teil('akt', a)).join(' + '))
  if (r.preis !== undefined) aus.push(`${sym ? '💶 ' : ''}${fuell(lex.zahlen.preisKarte, r.preis)}`)
  if (r.tage !== undefined) aus.push(`${sym ? '📅 ' : ''}${fuell(lex.zahlen.tageKarte, r.tage)}`)
  return aus.join(' · ')
}

/** Bekannte Wörter (Kernform, klein) mit Vorrang: 0 = Kurs bzw. von allen kennengelernt, 1 = Lehrwerk bis zum Stand */
export function bekannteWoerter(inhalt: SpielInhalt): Map<string, number> {
  const aus = new Map<string, number>()
  const dazu = (t: string, r: number): void => {
    for (const w of kernform(t).toLowerCase().split(/[^\p{L}]+/u)) if (w.length >= 2 && (aus.get(w) ?? 9) > r) aus.set(w, r)
  }
  for (const t of inhalt.lehrwerk ?? []) dazu(t, 1)
  for (const t of [...(inhalt.lehrwerkGemeinsam ?? []), ...inhalt.items.map((i) => i.vok?.term ?? '')]) dazu(t, 0)
  return aus
}

// ---------------------------------------------------------------- Regelmodul

interface Z extends Basis {
  runden: ReiseRunde[]
  r: number
  raus: number[]
  vorschlag: { k: number; von: string; ja: string[] } | null
  fehlerZahl: number
  bis: number | null
  stufe: Stufe
}
const ZEIT_MS = 4 * 60_000
const mitUhr = (z: Z): boolean => z.zeitdruck && (z.schwierigkeit === 'schwer' || z.schwierigkeit === 'unmoeglich')
const noetigeZustimmung = (z: Z): number => Math.floor(aktive(z).length / 2) + 1

function naechsteRunde(z: Z, jetzt: number): void {
  z.r++
  z.raus = []
  z.vorschlag = null
  if (z.r >= z.runden.length) z.ende = true
  else z.bis = mitUhr(z) ? jetzt + ZEIT_MS : null
}

function auswerten(z: Z, jetzt: number): void {
  const v = z.vorschlag
  if (!v || v.ja.length < noetigeZustimmung(z)) return
  const runde = z.runden[z.r]
  z.vorschlag = null
  if (v.k === runde.ziel) {
    for (const id of v.ja) gut(z, id)
    melde(z, v.von, true, tx(z, 'eureReise'))
    return naechsteRunde(z, jetzt)
  }
  z.fehlerZahl++
  z.raus.push(v.k)
  // Welcher Hinweis schließt die Reise aus? (Text und wem er gehört)
  const treffer = Object.entries(runde.hinweise)
    .flatMap(([id, l]) => l.map((h) => ({ id, h })))
    .find(({ h }) => !erfuellt(h, runde.reisen[v.k]))
  melde(z, '', false, tx(z, 'rpPasstNichtWeil', v.k + 1, treffer?.h.text ?? '', treffer ? name(z, treffer.id) : ''))
}

export const reiseplaner: Regeln<Z> = {
  id: 'reiseplaner',
  // Eingebauter Grundwortschatz je Sprache – spielbar mit jedem Vokabelkurs
  passt: (i) => (i.bereich === 'vok' ? null : 'Nur mit Vokabeln.'),
  start(k) {
    const b = basisNeu(k)
    const stufe = stufeVon(k.jahrgang)
    const z: Z = { ...b, runden: [], r: 0, raus: [], vorschlag: null, fehlerZahl: 0, bis: null, stufe }
    const lex = lexikonFuer(k.inhalt.sprache)
    const bekannt = bekannteWoerter(k.inhalt)
    const spieler = k.spieler.map((s) => s.id)
    for (let r = 0; r < rundenZahl(b.schwierigkeit); r++) {
      const runde = reiseRunde({ lex, stufe, schwierigkeit: b.schwierigkeit, runde: r, spieler, bekannt, zufall: () => zufall(z) })
      if (runde) z.runden.push(runde)
    }
    if (!z.runden.length) z.ende = true
    z.bis = mitUhr(z) ? k.jetzt + ZEIT_MS : null
    return z
  },
  zug(z, wer, zug, jetzt) {
    if (z.ende) return
    const runde = z.runden[z.r]
    if (zug.aktion === 'reise') {
      const k = Number(zug.wert)
      if (!Number.isInteger(k) || k < 0 || k >= runde.reisen.length || z.raus.includes(k)) return
      z.vorschlag = { k, von: wer, ja: [wer] }
      return auswerten(z, jetzt)
    }
    if (zug.aktion === 'zustimmen' && z.vorschlag && !z.vorschlag.ja.includes(wer)) {
      z.vorschlag.ja.push(wer)
      return auswerten(z, jetzt)
    }
  },
  tick(z, jetzt) {
    if (z.ende || !z.bis || jetzt < z.bis) return false
    z.fehlerZahl++
    melde(z, '', false, tx(z, 'rpZeitAus', z.runden[z.r].ziel + 1))
    naechsteRunde(z, jetzt)
    return true
  },
  sicht(z, wer) {
    const b: Block[] = [{ typ: 'fortschritt', titel: tx(z, 'reiseVon', Math.min(z.r + 1, z.runden.length), z.runden.length), wert: z.r, max: z.runden.length }]
    if (z.bis && !z.ende) b.push({ typ: 'uhr', bis: z.bis })
    b.push(...rueckBlock(z))
    if (z.ende) return b
    const runde = z.runden[z.r]
    const lex = lexikonFuer(z.inhalt.sprache)
    b.push({ typ: 'text', text: tx(z, 'rpZusammen'), ton: 'leise' })
    b.push({ typ: 'kacheln', titel: tx(z, 'deineHinweise'), spalten: 1, kacheln: (runde.hinweise[wer] ?? []).map((h, i) => ({ id: `h${i}`, text: h.text })) })
    b.push({
      typ: 'kacheln',
      titel: tx(z, 'welcheReise'),
      spalten: 1,
      kacheln: runde.reisen.map((r, k) => ({
        id: String(k),
        text: `${tx(z, 'rpReiseN', k + 1)}: ${kartenText(lex, r, z.stufe)}`,
        ...(z.raus.includes(k) ? { status: 'aus' as const } : z.vorschlag?.k === k ? { status: 'markiert' as const } : {})
      })),
      aktion: 'reise'
    })
    const v = z.vorschlag
    if (!v) b.push({ typ: 'text', text: tx(z, 'rpTippen'), ton: 'info' })
    else {
      b.push({ typ: 'text', text: `${tx(z, 'rpVorschlag', name(z, v.von), v.k + 1)} ${tx(z, 'rpZustimmungen', v.ja.length, noetigeZustimmung(z))}`, ton: 'info' })
      if (v.ja.includes(wer)) b.push({ typ: 'text', text: tx(z, 'rpWarteZustimmung'), ton: 'leise' })
      else b.push({ typ: 'knoepfe', knoepfe: [{ text: tx(z, 'rpZustimmen'), aktion: 'zustimmen', farbe: 'green' }] })
    }
    return b
  },
  weg(z, wer) {
    // Hinweise der Person, die geht, an die anderen (sonst wäre die Reise nicht mehr eindeutig)
    const rest = aktive(z).map((s) => s.id)
    if (!rest.length) return
    for (const r of z.runden) {
      const seine = r.hinweise[wer] ?? []
      r.hinweise[wer] = []
      seine.forEach((h, k) => r.hinweise[rest[k % rest.length]].push(h))
    }
    if (z.vorschlag) z.vorschlag.ja = z.vorschlag.ja.filter((id) => id !== wer)
  },
  ergebnis: (z) => koopErgebnis(z, z.fehlerZahl <= 1, z.fehlerZahl, tx(z, 'reiseErgebnis', z.runden.length, z.fehlerZahl), z.fehlerZahl === 0)
}

