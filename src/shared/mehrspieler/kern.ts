/**
 * Gerüst der Mehrspieler-Spiele (08.10.2026, Plan Abschnitt D: „jedes Spiel nur als Regelmodul"): Jedes Spiel ist ein
 * Regelmodul mit Zustand (nur im Speicher des Servers), Zugprüfung, Uhr und Sicht je Person. Die Sicht besteht aus
 * Bausteinen (`Block`), die die Oberfläche einheitlich zeichnet – so braucht ein neues Spiel keine eigene Ansicht.
 * Lösungen stehen nie in einer Sicht, bevor der Zug gemacht ist.
 *
 * Zufall: eigener, im Zustand gespeicherter Zufallsgenerator (wiederholbar in Tests).
 */
import { bewerte } from '../vokabeltrainer'
import { normiert } from '../grammatiktrainer'
import { gewichtVon, ziehe } from './schwierigkeit'
import { spielText, wortartVon, type TextSchluessel } from '../spielSprache'
import type { Band, Frage, MehrspielId, Rueckmeldung, Schwierigkeit, SpielErgebnis, SpielInhalt, SpielItem } from './typen'

// ---------------------------------------------------------------- Bausteine der Sicht

export type Ton = 'gut' | 'schlecht' | 'info' | 'leise' | 'warn'
export interface Kachel {
  id: string
  text?: string
  bild?: string
  status?: 'gut' | 'schlecht' | 'aus' | 'markiert' | 'offen' | 'treffer' | 'wasser' | 'schiff'
  klein?: string
}
export type Block =
  | { typ: 'titel'; text: string; klein?: string }
  | { typ: 'text'; text: string; ton?: Ton; gross?: boolean }
  | { typ: 'frage'; frage: string; zusatz?: string; optionen: string[]; tippen?: boolean; aktion: string; gesperrt?: boolean; sprache?: string }
  | { typ: 'kacheln'; titel?: string; kacheln: Kachel[]; aktion?: string; spalten?: number; mehrfach?: number; senden?: string }
  | { typ: 'reihe'; titel?: string; teile: string[]; leer?: number }
  | { typ: 'seil'; wert: number; ziel: number; links: string; rechts: string }
  | { typ: 'fortschritt'; titel: string; wert: number; max: number; ton?: Ton }
  | { typ: 'punkte'; eintraege: { name: string; wert: string; ich?: boolean }[] }
  | { typ: 'uhr'; bis: number; text?: string }
  /**
   * Codewort (Fluchtraum, 09.10.2026): Felder mit den freigeschalteten Buchstaben (null = noch verdeckt) bzw. – ab
   * „schwer" – nur die gefundenen Buchstaben ohne Stelle (`buchstaben`); Beschriftungen in der Zielsprache.
   */
  | { typ: 'codewort'; felder: (string | null)[]; buchstaben?: string[]; aktion: string; titel: string; platzhalter: string; knopf: string; gesperrt?: boolean }
  | { typ: 'vorlesen'; text: string; sprache: string }
  | { typ: 'knoepfe'; knoepfe: { text: string; aktion: string; wert?: string; farbe?: string; gesperrt?: boolean }[] }
  | { typ: 'eingaben'; felder: { id: string; titel: string }[]; aktion: string; gesperrt?: boolean; werte?: Record<string, string> }
  | { typ: 'turm'; hoehe: number; ziel: number; wackeln: number }

/** Ein Zug vom Gerät: Aktion und Wert (Text, Kennung oder Liste) */
export interface Zug {
  aktion: string
  wert?: unknown
}

// ---------------------------------------------------------------- Zustand und Regeln

export interface SpielerKurz {
  id: string
  name: string
}

export interface StartKontext {
  spiel: MehrspielId
  spieler: SpielerKurz[]
  schwierigkeit: Schwierigkeit
  /** Klasse des Kurses (Zeitdruck, Eingabeart); null = unbekannt */
  jahrgang: number | null
  inhalt: SpielInhalt
  /** Band je Item für die Gruppe und je Person */
  band: { gemeinsam: Record<string, Band | null>; je: Record<string, Record<string, Band | null>> }
  saat: number
  jetzt: number
}

export interface Basis {
  spiel: MehrspielId
  spieler: SpielerKurz[]
  /** Personen, die das laufende Spiel verlassen haben (Plätze bleiben, Züge werden übersprungen) */
  weg: string[]
  schwierigkeit: Schwierigkeit
  jahrgang: number | null
  inhalt: SpielInhalt
  band: StartKontext['band']
  saat: number
  start: number
  ende: boolean
  nr: number
  letzte: Rueckmeldung | null
  richtig: Record<string, number>
  fehler: Record<string, string[]>
  punkte: Record<string, number>
  /** Eingabe schreiben statt antippen (schwer/unmöglich ab Klasse 7) */
  tippen: boolean
  /** Uhr erlaubt (nie bei „leicht" und nie in Klasse 5–6) */
  zeitdruck: boolean
}

export interface Regeln<Z extends Basis = Basis> {
  id: MehrspielId
  /** null = genug Inhalt; sonst Grund (Spiel wird für den Kurs ausgeblendet) */
  passt(i: SpielInhalt, stimme?: boolean): string | null
  start(k: StartKontext): Z
  zug(z: Z, wer: string, zug: Zug, jetzt: number): void
  tick?(z: Z, jetzt: number): boolean
  sicht(z: Z, wer: string, jetzt: number): Block[]
  ergebnis(z: Z): SpielErgebnis
  /** Person verlässt das laufende Spiel (z. B. ihre Karten an die anderen verteilen); `z.weg` ist schon ergänzt */
  weg?(z: Z, wer: string): void
}

export function basisNeu(k: StartKontext): Basis {
  const leer = <T>(f: () => T): Record<string, T> => Object.fromEntries(k.spieler.map((s) => [s.id, f()]))
  const kleine = k.jahrgang !== null && k.jahrgang <= 6
  return {
    spiel: k.spiel,
    spieler: k.spieler.map((s) => ({ ...s })),
    weg: [],
    schwierigkeit: k.schwierigkeit,
    jahrgang: k.jahrgang,
    inhalt: k.inhalt,
    band: k.band,
    saat: k.saat >>> 0 || 1,
    start: k.jetzt,
    ende: false,
    nr: 0,
    letzte: null,
    richtig: leer(() => 0),
    fehler: leer(() => [] as string[]),
    punkte: leer(() => 0),
    tippen: (k.schwierigkeit === 'schwer' || k.schwierigkeit === 'unmoeglich') && !kleine,
    zeitdruck: k.schwierigkeit !== 'leicht' && !kleine
  }
}

// ---------------------------------------------------------------- Zufall (mulberry32, Zustand im Spiel)

export function zufall(z: { saat: number }): number {
  z.saat = (z.saat + 0x6d2b79f5) >>> 0
  let t = z.saat
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
export const zufallsQuelle =
  (z: { saat: number }): (() => number) =>
  () =>
    zufall(z)
export function mischen<T>(z: { saat: number }, l: readonly T[]): T[] {
  const a = [...l]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(zufall(z) * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
export const eines = <T>(z: { saat: number }, l: readonly T[]): T => l[Math.floor(zufall(z) * l.length)]

// ---------------------------------------------------------------- Items und Fragen

export const itemVon = (z: Basis, id: string): SpielItem | undefined => z.inhalt.items.find((i) => i.id === id)

/** Items für die Gruppe (gemeinsames Band) bzw. für eine Person (Handicap), optional gefiltert */
export function itemsZiehen(z: Basis, n: number, opt: { fuer?: string; filter?: (i: SpielItem) => boolean } = {}): SpielItem[] {
  const quelle = opt.fuer ? z.band.je[opt.fuer] ?? z.band.gemeinsam : z.band.gemeinsam
  const erlaubt = z.inhalt.items.filter((i) => !opt.filter || opt.filter(i))
  const baender: Record<string, Band | null> = {}
  for (const i of erlaubt) baender[i.id] = quelle[i.id] ?? null
  return ziehe(baender, z.schwierigkeit, n, zufallsQuelle(z))
    .map((id) => erlaubt.find((i) => i.id === id)!)
    .filter(Boolean)
}

/** Punkte eines Items für eine Person (Handicap: nach dem eigenen Band) */
export const gewicht = (z: Basis, wer: string, itemId: string): number => gewichtVon(z.band.je[wer]?.[itemId] ?? z.band.gemeinsam[itemId])

export type FragenArt = 'standard' | 'erkennen' | 'abrufen' | 'luecke'

const gleich = (a: string, b: string): boolean => normiert(a) === normiert(b)

/** Text in der Zielsprache des Kurses (09.10.2026): Klasse 5–6 einfache Sprache, ab Klasse 7 normal */
export const tx = (z: Basis, schluessel: TextSchluessel, ...werte: (string | number)[]): string =>
  spielText(z.inhalt.sprache, z.jahrgang, schluessel, ...werte)

/** Ablenker-Stufe nach Klasse (09.10.2026): 0 zufällig (bis Klasse 6), 1 gleiche Wortart/Länge (7–8), 2 auch ähnliche Schreibung (ab 9) */
export const ablenkerStufe = (z: Basis): 0 | 1 | 2 => (z.jahrgang === null || z.jahrgang <= 6 ? 0 : z.jahrgang <= 8 ? 1 : 2)

/** Abstand zweier Wörter (Levenshtein, klein geschrieben) */
export function abstand(a: string, b: string): number {
  const x = [...a.toLowerCase()]
  const y = [...b.toLowerCase()]
  let vor = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const neu = [i]
    for (let j = 1; j <= y.length; j++) neu[j] = Math.min(vor[j] + 1, neu[j - 1] + 1, vor[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    vor = neu
  }
  return vor[y.length]
}

/** Wie nah ist ein Ablenker an der Lösung? (höher = verwechselbarer) */
function naehe(loesung: string, t: string, stufe: 1 | 2, posL?: string, posT?: string): number {
  let p = 0
  if (posL && posT && wortartVon(posL) && wortartVon(posL) === wortartVon(posT)) p += 2
  if (Math.abs(t.length - loesung.length) <= 2) p += 1
  if (t[0]?.toLowerCase() === loesung[0]?.toLowerCase()) p += 1
  if (stufe === 2) {
    const d = abstand(loesung, t)
    if (d <= Math.max(2, Math.floor(loesung.length / 3))) p += 3
    else if (d <= Math.ceil(loesung.length / 2)) p += 1
  }
  return p
}

/**
 * Ablenker: eigene, dann Antworten anderer Items derselben Art – nie die Lösung. Ab Klasse 7 (Stufe 1/2) zuerst
 * verwechselbare Ablenker (gleiche Wortart, ähnliche Länge, ab Klasse 9 ähnliche Schreibung).
 */
export function ablenkerFuer(
  z: Basis,
  loesung: string,
  eigene: string[],
  feld: (i: SpielItem) => string | undefined,
  n: number,
  opt: { stufe?: 0 | 1 | 2; pos?: string } = {}
): string[] {
  const aus: string[] = []
  const dazu = (t: string | undefined): void => {
    if (t && !gleich(t, loesung) && !aus.some((a) => gleich(a, t))) aus.push(t)
  }
  for (const t of mischen(z, eigene)) dazu(t)
  const stufe = opt.stufe ?? 0
  const kandidaten = mischen(z, z.inhalt.items)
  if (stufe > 0)
    kandidaten.sort((a, b) => {
      const fa = feld(a) ?? ''
      const fb = feld(b) ?? ''
      return naehe(loesung, fb, stufe as 1 | 2, opt.pos, b.vok?.pos) - naehe(loesung, fa, stufe as 1 | 2, opt.pos, a.vok?.pos)
    })
  for (const i of kandidaten) {
    if (aus.length >= n) break
    dazu(feld(i))
  }
  return aus.slice(0, n)
}

/** Frage zu einem Item (mit Möglichkeiten bzw. zum Schreiben) */
export function frageAus(z: Basis, item: SpielItem, art: FragenArt = 'standard', optionen = 4, tippen = z.tippen): Frage {
  const v = item.vok
  let frage = item.frage
  // Vokabel-Items: Fragezusatz in der Zielsprache (Grammatik behält die Anweisung der Aufgabe)
  let zusatz = v ? tx(z, 'wieHeisst') : item.fehler && item.frage === item.fehler.satz ? tx(z, 'wieRichtig', item.fehler.wort) : item.zusatz
  let loesung = item.loesung
  let feld: (i: SpielItem) => string | undefined = (i) => i.loesung
  let eigene = item.ablenker
  if (v && art === 'erkennen') {
    frage = v.term
    zusatz = tx(z, 'wasBedeutet')
    loesung = v.translation
    feld = (i) => i.vok?.translation
    eigene = []
  } else if (v && art === 'abrufen') {
    frage = v.translation
    zusatz = tx(z, 'wieHeisst')
    loesung = v.term
    feld = (i) => i.vok?.term
    eigene = []
  } else if (v && art === 'luecke' && v.luecke) {
    frage = `${v.luecke.vor}___${v.luecke.nach}`
    zusatz = tx(z, 'welchesFehlt')
    loesung = v.luecke.loesung
    feld = (i) => i.vok?.term
    eigene = []
  }
  const ablenker = tippen ? [] : ablenkerFuer(z, loesung, eigene, feld, optionen - 1)
  return {
    itemId: item.id,
    frage,
    zusatz,
    optionen: tippen ? [] : mischen(z, [loesung, ...ablenker]),
    loesung,
    ...(tippen ? { tippen: true } : {}),
    ...(item.alternativen?.length && art === 'standard' ? { alternativen: item.alternativen } : {})
  } as Frage
}

/** Antwort prüfen: Auswahl genau, Geschriebenes tolerant (ein Tippfehler bei langen Wörtern ist „fast" und zählt) */
export function antwortRichtig(f: Frage, wert: unknown): boolean {
  const a = String(wert ?? '').slice(0, 300)
  if (!a.trim()) return false
  const loesungen = [f.loesung, ...(f.alternativen ?? [])]
  if (!f.tippen) return loesungen.some((l) => gleich(l, a)) && f.optionen.some((o) => gleich(o, a))
  return loesungen.some((l) => gleich(l, a) || bewerte(a, l).urteil !== 'falsch')
}

/** Block einer Frage – ohne Lösung */
export const frageBlock = (f: Frage, aktion = 'antwort', gesperrt = false, sprache?: string): Block => ({
  typ: 'frage',
  frage: f.frage,
  ...(f.zusatz ? { zusatz: f.zusatz } : {}),
  optionen: f.optionen,
  ...(f.tippen ? { tippen: true } : {}),
  aktion,
  ...(gesperrt ? { gesperrt: true } : {}),
  ...(sprache ? { sprache } : {})
})

// ---------------------------------------------------------------- Buchführung

export const name = (z: Basis, id: string): string => z.spieler.find((s) => s.id === id)?.name ?? tx(z, 'jemand')
export const istDabei = (z: Basis, id: string): boolean => z.spieler.some((s) => s.id === id) && !z.weg.includes(id)
export const aktive = (z: Basis): SpielerKurz[] => z.spieler.filter((s) => !z.weg.includes(s.id))

export function melde(z: Basis, wer: string, richtig: boolean, text: string, loesung?: string): void {
  z.letzte = { nr: ++z.nr, wer: wer ? name(z, wer) : '', richtig, text, ...(loesung !== undefined ? { loesung } : {}) }
}
export function gut(z: Basis, wer: string, punkte = 0): void {
  z.richtig[wer] = (z.richtig[wer] ?? 0) + 1
  z.punkte[wer] = (z.punkte[wer] ?? 0) + punkte
}
export function fehlerMerken(z: Basis, wer: string, itemId: string | undefined): void {
  if (!itemId || !z.inhalt.items.some((i) => i.id === itemId)) return
  const l = (z.fehler[wer] ??= [])
  if (!l.includes(itemId)) l.push(itemId)
}

/** Rückmeldung als Block (nach dem Zug, mit Lösung) */
export function rueckBlock(z: Basis): Block[] {
  const l = z.letzte
  if (!l) return []
  const text = `${l.wer ? `${l.wer}: ` : ''}${l.text}${l.loesung && !l.richtig ? ` ${tx(z, 'richtigIst', l.loesung)}` : ''}`
  return [{ typ: 'text', text, ton: l.richtig ? 'gut' : 'schlecht' }]
}

/** Zwei Teams aus den Plätzen: 1:1, 2:1 bzw. 2:2 (Plätze abwechselnd) */
export function teamsAus(spieler: SpielerKurz[]): [string[], string[]] {
  const a: string[] = []
  const b: string[] = []
  spieler.forEach((s, i) => (i % 2 ? b : a).push(s.id))
  return [a, b]
}
export const teamName = (z: Basis, team: string[]): string => team.map((id) => name(z, id)).join(' & ') || 'Bot'

/** Nächste anwesende Person nach `ab` in einer Liste (Plätze überspringen, deren Person weg ist) */
export function naechste(z: Basis, liste: string[], ab: number): number {
  for (let k = 1; k <= liste.length; k++) {
    const i = (ab + k) % liste.length
    if (!z.weg.includes(liste[i])) return i
  }
  return ab
}

// ---------------------------------------------------------------- Ergebnisse

const leerErgebnis = (z: Basis): SpielErgebnis['jeSpieler'] =>
  Object.fromEntries(z.spieler.map((s) => [s.id, { wert: null, richtig: z.richtig[s.id] ?? 0, fehler: [...(z.fehler[s.id] ?? [])] }]))

/** Kooperativ: Team-Ziel und ein gemeinsamer Wert für alle */
export function koopErgebnis(z: Basis, teamZiel: boolean, wert: number | null, text: string, fehlerfrei?: boolean): SpielErgebnis {
  const je = leerErgebnis(z)
  for (const id of Object.keys(je)) je[id].wert = wert
  return { jeSpieler: je, teamZiel, text, ...(fehlerfrei !== undefined ? { fehlerfrei } : {}) }
}

/** Versus: Sieger (Personen), je Person der eigene Wert; Plätze nur, wenn gesetzt */
export function versusErgebnis(
  z: Basis,
  sieger: string[],
  wertJe: (id: string) => number | null,
  text: string,
  opt: { comeback?: boolean; plaetze?: Record<string, number>; unentschieden?: boolean } = {}
): SpielErgebnis {
  const je = leerErgebnis(z)
  for (const id of Object.keys(je)) {
    je[id].wert = wertJe(id)
    je[id].gewonnen = sieger.includes(id)
    if (opt.plaetze?.[id]) je[id].platz = opt.plaetze[id]
  }
  return { jeSpieler: je, sieger, text, ...(opt.comeback ? { comeback: true } : {}), ...(opt.unentschieden ? { unentschieden: true } : {}) }
}

/** Punkte-Block für ein Team-/Personen-Rennen (ohne Rangfolge – nur die Stände) */
export const standBlock = (eintraege: { name: string; wert: string; ich?: boolean }[]): Block => ({ typ: 'punkte', eintraege })

/** Wörter eines Satzes als Teile (Satzzeichen bleiben am Wort) */
export const satzTeile = (satz: string): string[] => satz.split(/\s+/).filter(Boolean)

/** Gleich (normiert) – für Kacheln mit gleichem Text */
export const gleicherText = gleich

/** Item für Fragen mit Lücke/Satz geeignet? */
export const hatVok = (i: SpielItem): boolean => Boolean(i.vok)
