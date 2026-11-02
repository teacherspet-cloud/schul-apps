/**
 * Kern der Klassenspiele (02.11.2026): Zustand im Speicher des Servers, ein eigener Aufgabenstrom je Person (eigenes
 * Niveau), Prüfen der Antworten, Elo-Nachführung, Verbesserungspunkte, Sicht am Gerät (Bausteine aus
 * mehrspieler/kern.ts) und am Beamer (eigene Bausteine `BBlock` – nie Fragen oder Lösungen).
 *
 * Die Spiele selbst sind Regelmodule (`KlassenRegeln`, spiele/*.ts): Sie bekommen jede Antwort mitgeteilt und zeichnen
 * Beamer und Kopf des Geräts.
 */
import { antwortRichtig, frageAus, frageBlock, mischen, zufall, type Basis, type Block, type FragenArt } from '../mehrspieler/kern'
import { istFrageItem } from '../mehrspieler/inhalt'
import type { Band, Frage, SpielInhalt, SpielItem } from '../mehrspieler/typen'
import { spielText } from '../spielSprache'
import { eloSchritt, schwierigkeitVon, startTheta, stufenFuer, wahrscheinlichkeit, BAND_FEST, ZIEL_P, type Stufe } from './adaptiv'
import { kleineTeams, teamFuerNeue, teamsBilden, tischeBilden, type Team } from './teams'
import { klassenspielInfo, type KlassenEinstellungen, type KlassenspielId } from './typen'

// ---------------------------------------------------------------- Inhalt

/**
 * Inhalt eines Klassenspiels: Vokabeln und Grammatik getrennt (Ablenker kommen nur aus demselben Bereich). Kennungen
 * der Items: „v:<Wort>" bzw. „g:<Form>:<Aufgabe>" – so findet das Eintragen nach dem Spiel Kurs und Form wieder.
 */
export interface KInhalt {
  sprache: string
  vok: SpielInhalt
  gram: SpielInhalt
  /** Schwächen der Klasse (Items, die bevorzugt drankommen) */
  vorrang: string[]
}

export const vokKennung = (wortId: string): string => `v:${wortId}`
export const gramKennung = (form: string, aufgabeId: string): string => `g:${form}:${aufgabeId}`
/** Kennung zurück: Bereich, Form (Grammatik) und ursprüngliche Kennung */
export function kennungAus(id: string): { bereich: 'vok' | 'gram'; form?: string; orig: string } | null {
  if (id.startsWith('v:')) return { bereich: 'vok', orig: id.slice(2) }
  const m = /^g:([^:]+):(.+)$/.exec(id)
  return m ? { bereich: 'gram', form: m[1], orig: m[2] } : null
}

export const alleItems = (i: KInhalt): SpielItem[] => [...i.vok.items, ...i.gram.items]

// ---------------------------------------------------------------- Zustand

export interface KAufgabe {
  nr: number
  item: string
  bereich: 'vok' | 'gram'
  stufe: Stufe
  frage: Frage
  b: number
  seit: number
}

export interface KPerson {
  id: string
  name: string
  /** Team (Index in `teams`), -1 = ohne */
  team: number
  theta: number
  theta0: number
  /** Antworten in diesem Spiel */
  n: number
  richtig: number
  falsch: number
  /** Verbesserungspunkte (gegen das eigene Niveau, Slavin) */
  punkte: number
  /** Falsch beantwortete Items (Kennungen) – für den Kasten und die Auswertung */
  fehler: string[]
  aufgabe: KAufgabe | null
  rueck: { nr: number; richtig: boolean; loesung?: string } | null
  zuletzt: string[]
  /** Fehler kommen nach 3–5 anderen Aufgaben wieder (Abruf in der Sitzung) */
  wieder: { item: string; ab: number }[]
  serie: number
  beitritt: number
}

export interface BBlockTeam {
  name: string
  farbe: string
  symbol: string
}

/** Bausteine des Beamers – nie Fragen, Lösungen oder Einzelergebnisse mit Namen (außer Top 3 am Ende) */
export type BBlock =
  | { typ: 'kopf'; titel: string; untertitel?: string; level?: { nr: number; von: number } }
  | { typ: 'berg'; lager: number; von: number; anteil: number; quote: number | null; zielQuote: number; namen: string[]; hinweis?: string }
  | { typ: 'boss'; name: string; symbol: string; hp: number; max: number; phase: number; ruestung: boolean; treffer: number; angriffe: number }
  | { typ: 'bahnen'; teams: (BBlockTeam & { wert: number; ziel: number; n: number })[]; seil: boolean }
  | { typ: 'teams'; teams: (BBlockTeam & { mitglieder: string[] })[] }
  | { typ: 'ticker'; eintraege: { text: string; ton: 'gut' | 'info' | 'warn' }[] }
  | { typ: 'zahlen'; eintraege: { titel: string; wert: string }[] }
  | { typ: 'podest'; titel: string; plaetze: { name: string; wert: string }[] }
  | { typ: 'text'; text: string; gross?: boolean; ton?: 'gut' | 'info' | 'warn' }
  /** Gebietseroberung: Felder (Sterne 1–3, Team oder frei) und Stand je Team (je Mitglied) */
  | { typ: 'karte'; spalten: number; felder: { sterne: number; team: number | null; neu?: boolean }[]; teams: (BBlockTeam & { wert: number })[] }
  /** Klasse gegen Rekord: jetzt gegen bisher */
  | { typ: 'rekord'; jetzt: number; bisher: number | null; richtig: number; quote: number | null }
  /** Wett-Quiz: Treffsicherheit der Klasse je Einsatz (ohne Namen) */
  | { typ: 'treffsicherheit'; stufen: { einsatz: number; anzahl: number; richtig: number }[] }
  /** Turnier: Runde und Fortschritt der Tische (ohne Namen – die Tische sind nach Stärke gebildet) */
  | { typ: 'tische'; runde: number; von: number; tische: { name: string; fertig: number; gesamt: number }[] }

export interface KBasis {
  spiel: KlassenspielId
  einst: KlassenEinstellungen
  jahrgang: number | null
  sprache: string
  inhalt: KInhalt
  /** Band je Person und Item (null = nie geübt) */
  band: Record<string, Record<string, Band | null>>
  saat: number
  start: number
  /** Ende der Spielzeit (verschiebt sich um Pausen) */
  bis: number
  pause: number | null
  ende: boolean
  /** Koop: Ziel erreicht */
  sieg: boolean
  personen: Record<string, KPerson>
  teams: Team[]
  /** Tische (Turnier): Kennungen je Tisch, stark → schwach */
  tische: string[][]
  /** Level 1–6 (Modus „level", sonst nur zur Anzeige) */
  level: number
  /** Letzte Antworten der Klasse (für Quote und Tempo) */
  verlauf: { zeit: number; richtig: boolean; wer: string }[]
  /** Je Item: richtig/falsch in diesem Spiel (Klassenauswertung) */
  stat: Record<string, { r: number; f: number }>
  ticker: { nr: number; text: string; ton: 'gut' | 'info' | 'warn' }[]
  nr: number
  /** Bisheriger Klassenrekord dieses Spiels (vom Server beim Start gesetzt) */
  rekordBisher: { wert: number; text: string } | null
}

export interface KErgebnis {
  text: string
  /** Koop: Ziel erreicht */
  sieg?: boolean
  /** Teamspiele: Wert je Team und Sieger (Index) */
  teams?: { nr: number; name: string; farbe: string; symbol: string; wert: number }[]
  siegerTeams?: number[]
  /** Wert für das Klassenrekord-Buch (höher = besser) */
  klassenwert: number
  klassenwertText: string
}

export interface KlassenRegeln<Z extends KBasis = KBasis> {
  id: KlassenspielId
  /** Zusatzzustand anlegen (nach dem Losen, beim Start) */
  start(z: KBasis, jetzt: number): Z
  /** Bevorzugtes Item für diese Person (z. B. Boss-Angriff) – null = freie Wahl */
  vorschlag?(z: Z, wer: string): string | null
  nachAntwort(z: Z, wer: string, a: KAufgabe, richtig: boolean, p: number, jetzt: number): void
  /** Eigene Aufgabe (Tisch, Team) statt der freien Wahl – null = freie Wahl */
  aufgabeFuer?(z: Z, wer: string, jetzt: number): KAufgabe | null
  /** Ziel-Wahrscheinlichkeit für diese Person (★ leichter, ★★★ schwerer) – null = ZIEL_P */
  zielP?(z: Z, wer: string): number | null
  /** false = noch keine Frage (erst eine Wahl im Kopf, z. B. Einsatz oder Sterne) */
  frageZeigen?(z: Z, wer: string): boolean
  /** Eigene Frage-Bausteine (Team-Puzzle: geteilte Karten) – null = Standard */
  geraetFrage?(z: Z, wer: string, jetzt: number): Block[] | null
  /** Ganze Antwort selbst werten (Team-Puzzle) – sonst `antworten` */
  antwort?(z: Z, wer: string, wert: unknown, jetzt: number): { richtig: boolean } | null
  /** Zug außerhalb der Antwort (Einsatz, Sterne) – true = angenommen */
  zug?(z: Z, wer: string, aktion: string, wert: unknown, jetzt: number): boolean
  /** Private Rückmeldung am Ende (nur für diese Person) */
  eigenText?(z: Z, wer: string): string | null
  /** Besonderes für Achievements (Tischsiege, gute Einschätzung) */
  auszeichnung?(z: Z, wer: string): { tischSiege?: number; einschaetzung?: boolean }
  tick?(z: Z, jetzt: number): boolean
  beamer(z: Z, jetzt: number): BBlock[]
  /** Kopf am Gerät (Stand des Spiels, eigenes Team) */
  geraet(z: Z, wer: string, jetzt: number): Block[]
  ergebnis(z: Z): KErgebnis
}

// ---------------------------------------------------------------- Anlegen, Personen, Teams

export function kNeu(k: {
  spiel: KlassenspielId
  einst: KlassenEinstellungen
  jahrgang: number | null
  inhalt: KInhalt
  saat: number
  jetzt: number
}): KBasis {
  return {
    spiel: k.spiel,
    einst: k.einst,
    jahrgang: k.jahrgang,
    sprache: k.inhalt.sprache,
    inhalt: k.inhalt,
    band: {},
    saat: k.saat >>> 0 || 1,
    start: k.jetzt,
    bis: k.jetzt + k.einst.dauer * 60_000,
    pause: null,
    ende: false,
    sieg: false,
    personen: {},
    teams: [],
    tische: [],
    level: 1,
    verlauf: [],
    stat: {},
    ticker: [],
    nr: 0,
    rekordBisher: null
  }
}

/** Person aufnehmen (Band je Item aus ihrem Lernstand); später Dazukommende landen im kleinsten/schwächsten Team */
export function personDazu(z: KBasis, id: string, name: string, band: Record<string, Band | null>, jetzt: number): KPerson {
  const alt = z.personen[id]
  if (alt) return alt
  z.band[id] = band
  const theta = startTheta(Object.values(band))
  const p: KPerson = {
    id,
    name,
    team: -1,
    theta,
    theta0: theta,
    n: 0,
    richtig: 0,
    falsch: 0,
    punkte: 0,
    fehler: [],
    aufgabe: null,
    rueck: null,
    zuletzt: [],
    wieder: [],
    serie: 0,
    beitritt: jetzt
  }
  z.personen[id] = p
  if (z.teams.length) {
    const nr = teamFuerNeue(z.teams, (x) => z.personen[x]?.theta ?? 0.7)
    z.teams[nr].mitglieder.push(id)
    p.team = nr
  }
  return p
}

/** Teams losen (ausgeglichen, wirkt zufällig) – je nach Spiel große Teams, kleine Teams oder Tische + Stammteams */
export function teamsLosen(z: KBasis): void {
  const info = klassenspielInfo(z.spiel)
  const leute = Object.values(z.personen).map((p) => ({ id: p.id, theta: p.theta }))
  if (!info || info.teams === 'keine' || !leute.length) {
    z.teams = []
    for (const p of Object.values(z.personen)) p.team = -1
    return
  }
  z.teams =
    info.teams === 'klein'
      ? kleineTeams(leute, z)
      : info.teams === 'tische'
      ? teamsBilden(leute, Math.max(2, Math.min(6, Math.round(leute.length / 4))), z)
      : teamsBilden(leute, z.einst.teams, z)
  for (const p of Object.values(z.personen)) p.team = -1
  z.teams.forEach((t, i) => t.mitglieder.forEach((id) => z.personen[id] && (z.personen[id].team = i)))
  if (info.teams === 'tische') z.tische = tischeBilden(leute, z)
}

export const meldung = (z: KBasis, text: string, ton: 'gut' | 'info' | 'warn' = 'info'): void => {
  z.ticker = [...z.ticker, { nr: ++z.nr, text, ton }].slice(-6)
}

export const aktivePersonen = (z: KBasis): KPerson[] => Object.values(z.personen)
export const teamGroesse = (z: KBasis, nr: number): number => Math.max(1, z.teams[nr]?.mitglieder.filter((id) => z.personen[id]).length ?? 1)

// ---------------------------------------------------------------- Aufgaben wählen

const LANG_ZUM_SCHREIBEN = 40

/** Welche Stufen taugen für das Item? (Schreiben nur bei kurzer Lösung, Lücke nur mit Beispielsatz) */
function stufenDesItems(i: SpielItem): Stufe[] {
  if (i.vok) return i.vok.luecke ? [1, 2, 3, 4] : [1, 2, 3]
  if (!istFrageItem(i)) return []
  return i.loesung.length <= LANG_ZUM_SCHREIBEN ? [1, 2, 3, 4] : [1, 2]
}

/** Erlaubte Stufen für die Person (Modus, Level, Regeln) */
export function erlaubteStufen(z: KBasis): Stufe[] {
  return stufenFuer(z.einst.schwierigkeit, z.einst.feste, z.level)
}

const pseudoBasis = (z: KBasis, inhalt: SpielInhalt): Basis =>
  ({ saat: z.saat, inhalt, jahrgang: z.jahrgang, tippen: false }) as unknown as Basis

/** Frage zu Item und Stufe bauen (Antwortform: Stufe 1–2 auswählen, 3–4 schreiben – abgestimmt) */
export function frageFuer(z: KBasis, item: SpielItem, bereich: 'vok' | 'gram', stufe: Stufe, optionenZahl?: number): Frage {
  const inhalt = bereich === 'vok' ? z.inhalt.vok : z.inhalt.gram
  const pb = pseudoBasis(z, inhalt)
  let art: FragenArt = 'standard'
  if (bereich === 'vok') art = stufe === 1 ? 'erkennen' : stufe === 4 && item.vok?.luecke ? 'luecke' : 'abrufen'
  const tippen = stufe >= 3
  const optionen = optionenZahl ?? (stufe === 1 ? 3 : 4)
  const f = frageAus(pb, item, art, optionen, tippen)
  z.saat = (pb as unknown as { saat: number }).saat
  return f
}

const itemSuchen = (z: KBasis, id: string): { item: SpielItem; bereich: 'vok' | 'gram' } | null => {
  const v = z.inhalt.vok.items.find((i) => i.id === id)
  if (v) return { item: v, bereich: 'vok' }
  const g = z.inhalt.gram.items.find((i) => i.id === id)
  return g ? { item: g, bereich: 'gram' } : null
}

/**
 * Nächste Aufgabe für eine Person:
 *  1. fällige Wiederholung eines eigenen Fehlers (eine Stufe leichter, wenn erlaubt),
 *  2. Vorschlag des Spiels (Boss-Angriff),
 *  3. sonst: adaptiv/level → Item und Stufe mit P(richtig) nahe ZIEL_P; fest → Bänder der Stufe zuerst.
 *  Kürzlich Gesehenes wird gemieden, Schwächen der Klasse (Vorrang) leicht bevorzugt.
 */
export function naechsteAufgabe(
  z: KBasis,
  wer: string,
  jetzt: number,
  vorschlag?: string | null,
  opt: { stufen?: Stufe[]; zielP?: number | null; optionen?: number; meiden?: string[] } = {}
): KAufgabe | null {
  const p = z.personen[wer]
  if (!p) return null
  const ziel = opt.zielP ?? ZIEL_P
  const erlaubt = opt.stufen?.length ? opt.stufen : erlaubteStufen(z)
  const band = z.band[wer] ?? {}
  const vorrang = new Set(z.inhalt.vorrang)
  const zuletzt = new Set([...p.zuletzt, ...(opt.meiden ?? [])])

  const bauen = (id: string, wunsch?: Stufe): KAufgabe | null => {
    const g = itemSuchen(z, id)
    if (!g) return null
    const moeglich = stufenDesItems(g.item).filter((s) => erlaubt.includes(s))
    const stufen = moeglich.length ? moeglich : stufenDesItems(g.item)
    if (!stufen.length) return null
    let stufe = wunsch && stufen.includes(wunsch) ? wunsch : stufen[0]
    if (!wunsch) {
      // Stufe mit P nahe am Ziel
      stufe = [...stufen].sort(
        (a, b) => Math.abs(wahrscheinlichkeit(p.theta, schwierigkeitVon(band[id], a)) - ziel) - Math.abs(wahrscheinlichkeit(p.theta, schwierigkeitVon(band[id], b)) - ziel)
      )[0]
    }
    return { nr: ++z.nr, item: id, bereich: g.bereich, stufe, frage: frageFuer(z, g.item, g.bereich, stufe, opt.optionen), b: schwierigkeitVon(band[id], stufe), seit: jetzt }
  }

  // 1. Wiederholung
  // Nur die letzten zwei Aufgaben sperren – „kürzlich gesehen" (8) hielte die Wiederholung sonst zu lange zurück
  const ganzKurz = new Set(p.zuletzt.slice(-2))
  const faellig = p.wieder.findIndex((w) => w.ab <= p.n && !ganzKurz.has(w.item))
  if (faellig >= 0) {
    const w = p.wieder[faellig]
    const leichter = Math.max(1, Math.min(...erlaubt)) as Stufe
    const a = bauen(w.item, leichter)
    if (a) return a
  }
  // 2. Vorschlag des Spiels
  if (vorschlag && !zuletzt.has(vorschlag)) {
    const a = bauen(vorschlag)
    if (a) return a
  }
  // 3. Wahl – bei Vokabeln UND Grammatik erst den Bereich losen (je mindestens 30 %, sonst nach Anteil), damit geübte
  // Vokabeln die neue Grammatik nicht verdrängen (Befund e2e 02.11.2026: „feste Stufe" brachte nur Vokabeln)
  const vokItems = z.einst.vok ? z.inhalt.vok.items : []
  const gramItems = z.einst.gram ? z.inhalt.gram.items : []
  let items = [...vokItems, ...gramItems]
  if (vokItems.length && gramItems.length) {
    const anteilGram = Math.max(0.3, Math.min(0.7, gramItems.length / items.length))
    items = zufall(z) < anteilGram ? gramItems : vokItems
  }
  let best: { id: string; stufe: Stufe; wert: number } | null = null
  for (const i of items) {
    const stufen = stufenDesItems(i).filter((s) => erlaubt.includes(s))
    if (!stufen.length) continue
    const neu = zuletzt.has(i.id) ? 5 : 0
    const vor = vorrang.has(i.id) ? -0.12 : 0
    for (const s of stufen) {
      let wert: number
      if (z.einst.schwierigkeit === 'fest') {
        const ord = BAND_FEST[z.einst.feste]
        const bnd = band[i.id]
        wert = (bnd ? (ord.indexOf(bnd) < 0 ? 3 : ord.indexOf(bnd)) : 1) * 0.3
      } else wert = Math.abs(wahrscheinlichkeit(p.theta, schwierigkeitVon(band[i.id], s)) - ziel)
      wert += neu + vor + zufall(z) * 0.12
      if (!best || wert < best.wert) best = { id: i.id, stufe: s, wert }
    }
  }
  if (best) return bauen(best.id, best.stufe)
  // Nichts in den erlaubten Stufen: irgendein Item
  const irgend = mischen(z, items)[0]
  return irgend ? bauen(irgend.id) : null
}

/** Aufgabe zu einem bestimmten Item und einer Stufe (Tisch: alle bekommen dasselbe; Optionen je Gerät neu gemischt) */
export function aufgabeBauen(z: KBasis, wer: string, id: string, stufe: Stufe, jetzt: number, optionen?: number): KAufgabe | null {
  const g = itemSuchen(z, id)
  if (!g) return null
  return { nr: ++z.nr, item: id, bereich: g.bereich, stufe, frage: frageFuer(z, g.item, g.bereich, stufe, optionen), b: schwierigkeitVon(z.band[wer]?.[id], stufe), seit: jetzt }
}

/** Nächste Aufgabe nach den Regeln (eigene Aufgabe des Spiels, sonst freie Wahl mit Vorschlag und Ziel-P) */
export function neueAufgabe<Z extends KBasis>(z: Z, regeln: KlassenRegeln<Z>, wer: string, jetzt: number): KAufgabe | null {
  if (regeln.aufgabeFuer) {
    const a = regeln.aufgabeFuer(z, wer, jetzt)
    if (a) return a
  }
  return naechsteAufgabe(z, wer, jetzt, regeln.vorschlag?.(z, wer), { zielP: regeln.zielP?.(z, wer) ?? null })
}

// ---------------------------------------------------------------- Antworten

/** FAUSTREGEL: Verbesserungspunkte = 4 + 8 · (1 − P) – wer gegen das eigene Niveau Schweres schafft, bekommt mehr */
export const punkteFuer = (p: number): number => Math.round(4 + 8 * (1 - p))

export function antworten<Z extends KBasis>(z: Z, regeln: KlassenRegeln<Z>, wer: string, wert: unknown, jetzt: number): { richtig: boolean } | null {
  if (z.ende || z.pause !== null) return null
  if (regeln.antwort) return regeln.antwort(z, wer, wert, jetzt)
  const p = z.personen[wer]
  const a = p?.aufgabe
  if (!p || !a) return null
  if (regeln.frageZeigen && !regeln.frageZeigen(z, wer)) return null
  const richtig = antwortRichtig(a.frage, wert)
  verbuchen(z, regeln, wer, a, richtig, jetzt)
  p.aufgabe = z.ende ? null : neueAufgabe(z, regeln, wer, jetzt)
  return { richtig }
}

/** Eine gewertete Antwort verbuchen: Elo, Punkte, Fehler, Wiederholung, Statistik, Regeln */
export function verbuchen<Z extends KBasis>(z: Z, regeln: KlassenRegeln<Z>, wer: string, a: KAufgabe, richtig: boolean, jetzt: number): void {
  const p = z.personen[wer]
  if (!p) return
  const prob = wahrscheinlichkeit(p.theta, a.b)
  p.theta = eloSchritt(p.theta, a.b, richtig, p.n)
  p.n++
  const s = (z.stat[a.item] ??= { r: 0, f: 0 })
  if (richtig) {
    p.richtig++
    p.serie++
    p.punkte += punkteFuer(prob)
    s.r++
    p.wieder = p.wieder.filter((w) => w.item !== a.item)
  } else {
    p.falsch++
    p.serie = 0
    s.f++
    if (!p.fehler.includes(a.item)) p.fehler.push(a.item)
    if (!p.wieder.some((w) => w.item === a.item)) p.wieder.push({ item: a.item, ab: p.n + 3 + Math.floor(zufall(z) * 3) })
  }
  p.rueck = { nr: a.nr, richtig, ...(richtig ? {} : { loesung: a.frage.loesung }) }
  p.zuletzt = [...p.zuletzt, a.item].slice(-8)
  z.verlauf = [...z.verlauf, { zeit: jetzt, richtig, wer }].slice(-300)
  regeln.nachAntwort(z, wer, a, richtig, prob, jetzt)
}

/** Quote der letzten `n` Antworten der Klasse (null = zu wenige) */
export function klassenQuote(z: KBasis, n = 30, mindestens = 10): number | null {
  const l = z.verlauf.slice(-n)
  if (l.length < mindestens) return null
  return l.filter((x) => x.richtig).length / l.length
}

// ---------------------------------------------------------------- Uhr und Pause

export function pausieren(z: KBasis, an: boolean, jetzt: number): void {
  if (an && z.pause === null) z.pause = jetzt
  if (!an && z.pause !== null) {
    z.bis += jetzt - z.pause
    z.pause = null
  }
}

/** Gemeinsamer Takt: Zeit abgelaufen → Ende; Regeln-Takt */
export function kTakt<Z extends KBasis>(z: Z, regeln: KlassenRegeln<Z>, jetzt: number): boolean {
  if (z.ende || z.pause !== null) return false
  let geaendert = regeln.tick?.(z, jetzt) ?? false
  if (!z.ende && jetzt >= z.bis) {
    z.ende = true
    geaendert = true
  }
  return geaendert
}

/** Level nach der Zeit (für Spiele ohne eigene Stufen): sechs gleich lange Abschnitte */
export const levelNachZeit = (z: KBasis, jetzt: number): number => {
  const dauer = Math.max(1, z.bis - z.start)
  return Math.max(1, Math.min(6, 1 + Math.floor(((jetzt - z.start) / dauer) * 6)))
}

// ---------------------------------------------------------------- Sicht am Gerät

export const tx = (z: KBasis, k: Parameters<typeof spielText>[2], ...w: (string | number)[]): string => spielText(z.sprache, z.jahrgang, k, ...w)

export function geraetSicht<Z extends KBasis>(z: Z, regeln: KlassenRegeln<Z>, wer: string, jetzt: number): Block[] {
  const p = z.personen[wer]
  if (!p) return []
  const aus: Block[] = [...regeln.geraet(z, wer, jetzt)]
  if (z.pause !== null) return [...aus, { typ: 'text', text: '⏸', gross: true }]
  if (p.rueck) aus.push({ typ: 'text', text: p.rueck.richtig ? tx(z, 'richtig') : tx(z, 'richtigIst', p.rueck.loesung ?? ''), ton: p.rueck.richtig ? 'gut' : 'schlecht' })
  if (z.ende) return aus
  const eigene = regeln.geraetFrage?.(z, wer, jetzt)
  if (eigene) return [...aus, ...eigene]
  if (regeln.frageZeigen && !regeln.frageZeigen(z, wer)) return aus
  if (!p.aufgabe) p.aufgabe = neueAufgabe(z, regeln, wer, jetzt)
  if (p.aufgabe && !z.ende) aus.push(frageBlock(p.aufgabe.frage, 'antwort', false, p.aufgabe.bereich === 'vok' && p.aufgabe.stufe !== 1 ? z.sprache : undefined))
  return aus
}

// ---------------------------------------------------------------- Ergebnis und Top 3

/** Top 3 nach Verbesserungspunkten (nur mit mindestens 3 Antworten, nur ab 4 Personen – nie ein letzter Platz) */
export function top3(z: KBasis): { id: string; name: string; punkte: number }[] {
  const l = Object.values(z.personen).filter((p) => p.n >= 3)
  if (!z.einst.top3 || Object.keys(z.personen).length < 4) return []
  return l
    .sort((a, b) => b.punkte - a.punkte || b.richtig - a.richtig)
    .slice(0, 3)
    .map((p) => ({ id: p.id, name: p.name, punkte: p.punkte }))
}

/** Teamwert normiert auf die Teamgröße (kleine Teams nicht im Nachteil) */
export const teamWert = (z: KBasis, nr: number, wert: (p: KPerson) => number): number =>
  (z.teams[nr]?.mitglieder ?? []).reduce((s, id) => s + (z.personen[id] ? wert(z.personen[id]) : 0), 0) / teamGroesse(z, nr)

/** Klassenwert (Rekordbuch): richtige Antworten × Quote – Sorgfalt zählt so viel wie Tempo */
export function klassenwertVon(z: KBasis): number {
  const r = Object.values(z.personen).reduce((s, p) => s + p.richtig, 0)
  const n = Object.values(z.personen).reduce((s, p) => s + p.n, 0)
  return n ? Math.round(r * (r / n)) : 0
}
