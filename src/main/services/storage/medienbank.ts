/**
 * Medienbank der Vokabeln – Ablage (05.10.2026, Typen und Schlüssel: shared/medienbank.ts).
 *
 *   <Wurzel>/index.json      { "en:park": { bild, ton, saetze, tonM, saetzeM } }  (M = männliche Fassung)
 *   <Wurzel>/stimmen.json    Standardstimmen je Sprache { "en": { "w": "<voiceId>", "m": "<voiceId>" } }
 *   <Wurzel>/bedeutungen.json Bilder je Bedeutung und Wortart (21.10.2026, shared/medienBedeutung.ts) { version, eintraege: { "en:bear": … } }
 *   <Wurzel>/dateien/<24 Hex>.jpg|png|mp3
 *
 * Wurzel: am Server <DATEN>/medienbank – EINMAL für alle (app.getPath('userData') zeigt dort auf den Ordner
 * der anfragenden Person, deshalb hier der Datenordner aus der Umgebung); in der Exe userData/medienbank.
 * Kein personenbezogener Inhalt: Wörter, Bilder, Aussprache.
 */
import { app } from 'electron'
import { randomBytes } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import {
  altSchluesselFuer,
  alsAnfrage,
  anfrageSchluessel,
  aufloesen,
  bedeutungFinden,
  bedeutungNorm,
  gruppiereKorpus,
  istEinfach,
  neueBedeutungsId,
  sinnSchluessel,
  wortartFuer,
  type BildTeil,
  type KorpusWort,
  type MedienAnfrage,
  type MedienBedeutung,
  type SinnAngabe,
  type SinnDatei,
  type SinnEintrag,
  type SinnStandEintrag,
  type Wortart,
  type SinnZuordnung,
  type Fundstelle,
  type MehrdeutigFilter,
  type MehrdeutigZeile
} from '@shared/medienBedeutung'
import { resourcePath } from './paths'
import {
  MEDIEN_DATEI,
  ErzeugungsSperre,
  medienSchluessel,
  medienSchluesselAlt,
  satzSchluessel,
  wortKanon,
  saetzeVon,
  BILDSTUFEN,
  bildDerStufe,
  stufenReihe,
  type Bildstufe,
  sprachKurz,
  stimmenNormiert,
  tonVon,
  type MedienBild,
  type Stimmen,
  type Stimmlage,
  type MedienEintrag,
  type MedienKandidat,
  type MedienSicht,
  type MedienTon,
  type TonArt
} from '@shared/medienbank'
import { pruefungBereinigt, type TonPruefung } from '@shared/tonPruefung'
import { fassungBereinigt, type SatzFassung, type SatzFassungSicht } from '@shared/satzFassung'
import { lizenzErlaubt } from '@shared/bildLizenz'

const wurzelPfad = (): string =>
  process.env.SCHULAPPS_SERVER ? resolve(process.env.SCHULAPPS_DATEN || './server-daten', 'medienbank') : join(app.getPath('userData'), 'medienbank')
const wurzel = (): string => {
  const w = wurzelPfad()
  const d = join(w, 'dateien')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return w
}
const indexDatei = (): string => join(wurzel(), 'index.json')
const stimmenDatei = (): string => join(wurzel(), 'stimmen.json')
export const medienDateiPfad = (datei: string): string => {
  if (!MEDIEN_DATEI.test(datei)) throw new Error('Unbekannte Datei.')
  return join(wurzel(), 'dateien', datei)
}

function lies<T>(pfad: string, leer: T): T {
  try {
    return existsSync(pfad) ? (JSON.parse(readFileSync(pfad, 'utf-8')) as T) : leer
  } catch {
    return leer
  }
}
function schreibe(pfad: string, wert: unknown): void {
  const tmp = `${pfad}.tmp`
  writeFileSync(tmp, JSON.stringify(wert))
  renameSync(tmp, pfad)
}

let zwischen: { zeit: number; index: Record<string, MedienEintrag> } | null = null
function index(): Record<string, MedienEintrag> {
  // Kurz zwischenspeichern: Listen mit Hunderten Wörtern fragen viele Einträge auf einmal ab
  if (zwischen && Date.now() - zwischen.zeit < 2000) return zwischen.index
  const i = lies<Record<string, MedienEintrag>>(indexDatei(), {})
  zwischen = { zeit: Date.now(), index: i }
  return i
}
/** Nur für Tests: index.json beim nächsten Nachschlagen neu lesen */
export const medienbankNeuLesen = (): void => void (zwischen = null)
const istLeer = (e: MedienEintrag | null): boolean =>
  !e ||
  (!e.bild &&
    !Object.keys(e.bildStufen ?? {}).length &&
    !e.ohneBild?.length &&
    !e.ton &&
    !e.tonM &&
    !Object.keys(e.saetze ?? {}).length &&
    !Object.keys(e.saetzeM ?? {}).length &&
    !Object.keys(e.fassungen ?? {}).length)

/*
 * Einheitliche Schlüssel (10.10.2026, Wunsch der Lehrkraft: dieselbe Vokabel nie zweimal vertonen). Der Schlüssel ist
 * `medienSchluessel` (shared/medienbank.ts: Sprache + vereinheitlichtes Wort). Ältere Einträge liegen noch unter dem
 * bisherigen Schlüssel („en:a / one", „en:it’s", „en:us" für „US"); sie werden über ihren kanonischen Schlüssel gefunden
 * und beim nächsten Nachschlagen bzw. Schreiben dorthin verschoben – keine Aufnahme geht verloren, keine Datei wird
 * dabei gelöscht. Fallen mehrere alte Einträge auf denselben Schlüssel, gilt der beste (ausdrücklicher Sprechtext,
 * dann der neueste); die übrigen bleiben liegen, zählen als Dubletten, und die Wartung `medienKanonOrdnen` führt sie
 * zusammen.
 */

/** Kanonischer Schlüssel eines gespeicherten Eintrags – aus dem Wortlaut seiner Aufnahme, sonst aus dem Schlüssel */
export function kanonDesEintrags(schluessel: string, e: MedienEintrag): string {
  const p = schluessel.indexOf(':')
  const sp = p > 0 ? schluessel.slice(0, p) : 'xx'
  const basis = wortKanon(schluessel.slice(p + 1))
  // Der Wortlaut der Aufnahme kennt die Großschreibung („US"), die der alte Schlüssel verlor
  for (const t of [e?.ton?.text, e?.tonM?.text]) {
    if (!t) continue
    const k = wortKanon(t)
    if (k.toLowerCase() === basis.toLowerCase()) return `${sp}:${k}`
  }
  return `${sp}:${basis}`
}

const zeitVon = (x: { zeit?: number } | undefined): number => x?.zeit ?? 0
/** Bessere Aufnahme zuerst: ausdrücklicher Sprechtext („Aussprache als", Abkürzung), dann die neueste */
const besserTon = (a: MedienTon | undefined, b: MedienTon | undefined): number =>
  Number(Boolean(b?.gesprochen)) - Number(Boolean(a?.gesprochen)) || zeitVon(b) - zeitVon(a)
const guete = (e: MedienEintrag): [number, number] => [
  [e.ton, e.tonM].filter((t) => t?.gesprochen).length,
  Math.max(0, ...[e.ton, e.tonM, e.bild, ...Object.values(e.bildStufen ?? {})].map(zeitVon))
]
const besser = (a: MedienEintrag, b: MedienEintrag): number => {
  const [ga, gb] = [guete(a), guete(b)]
  return gb[0] - ga[0] || gb[1] - ga[1]
}

/** Kanonischer Schlüssel → Schlüssel im Index; der kanonische selbst zuerst, sonst der beste */
function gruppenVon(i: Record<string, MedienEintrag>): Map<string, string[]> {
  const g = new Map<string, string[]>()
  for (const [k, e] of Object.entries(i)) {
    const c = kanonDesEintrags(k, e)
    const liste = g.get(c)
    if (liste) liste.push(k)
    else g.set(c, [k])
  }
  for (const [c, ks] of g) if (ks.length > 1) ks.sort((a, b) => (a === c ? -1 : b === c ? 1 : besser(i[a], i[b])))
  return g
}
const gruppenZwischen = new WeakMap<Record<string, MedienEintrag>, Map<string, string[]>>()
function gruppen(i: Record<string, MedienEintrag>): Map<string, string[]> {
  let g = gruppenZwischen.get(i)
  if (!g) gruppenZwischen.set(i, (g = gruppenVon(i)))
  return g
}

/**
 * Wo liegt der Eintrag eines Wortes? Unter dem kanonischen Schlüssel (bzw. im besten alten Eintrag, der dorthin gehört),
 * sonst – nur zum Ansehen, wie bisher – unter dem bisherigen Schlüssel. `verschieben`: Der gefundene alte Eintrag gehört
 * auf den kanonischen Schlüssel.
 */
function finde(i: Record<string, MedienEintrag>, sprache: string, wort: string): { schluessel: string; verschieben: boolean } | null {
  const c = medienSchluessel(sprache, wort)
  const k = gruppen(i).get(c)?.[0]
  if (k) return { schluessel: k, verschieben: k !== c }
  const alt = medienSchluesselAlt(sprache, wort)
  return i[alt] ? { schluessel: alt, verschieben: false } : null
}

/** Beiseitegelegte Einträge (nie gelöscht – ihre Dateien bleiben liegen und lassen sich zurückholen) */
const dublettenDatei = (): string => join(wurzel(), 'dubletten.json')
function beiseitelegen(eintraege: Record<string, MedienEintrag>): void {
  if (!Object.keys(eintraege).length) return
  const d = lies<Record<string, MedienEintrag>>(dublettenDatei(), {})
  const marke = Date.now().toString(36)
  for (const [k, e] of Object.entries(eintraege)) d[`${k}#${marke}`] = e
  schreibe(dublettenDatei(), d)
}

/**
 * Den kanonischen Schlüssel `c` bereitmachen: Liegt dort ein Eintrag, der zu einem anderen Wort gehört (alter Schlüssel
 * „en:us" mit der Aufnahme von „US"), zieht er auf seinen eigenen Schlüssel um; fehlt der Eintrag, übernimmt `c` den
 * besten alten Eintrag derselben Gruppe. true = der Index hat sich geändert.
 */
function bereitmachen(i: Record<string, MedienEintrag>, c: string): boolean {
  let geaendert = false
  const eigen = i[c] ? kanonDesEintrags(c, i[c]) : c
  if (eigen !== c) {
    if (i[eigen]) beiseitelegen({ [c]: i[c] })
    else i[eigen] = i[c]
    delete i[c]
    geaendert = true
  }
  if (!i[c]) {
    const k = gruppenVon(i).get(c)?.[0]
    if (k) {
      i[c] = i[k]
      delete i[k]
      geaendert = true
    }
  }
  return geaendert
}

function aendern(sprache: string, wort: string, fn: (e: MedienEintrag) => MedienEintrag | null): void {
  const schluessel = medienSchluessel(sprache, wort)
  const i = lies<Record<string, MedienEintrag>>(indexDatei(), {})
  bereitmachen(i, schluessel)
  const neu = fn(i[schluessel] ?? {})
  if (!neu || istLeer(neu)) delete i[schluessel]
  else i[schluessel] = neu
  schreibe(indexDatei(), i)
  zwischen = null
}

/** Gefundene alte Einträge auf ihren kanonischen Schlüssel ziehen – das nächste Nachschlagen trifft direkt */
function umziehen(schluessel: Iterable<string>): void {
  try {
    const i = lies<Record<string, MedienEintrag>>(indexDatei(), {})
    let geaendert = false
    for (const c of schluessel) geaendert = bereitmachen(i, c) || geaendert
    if (!geaendert) return
    schreibe(indexDatei(), i)
    zwischen = null
  } catch {
    // Nur eine Abkürzung für später – Nachschlagen klappt auch ohne
  }
}

/** Sätze eines Eintrags unter ihren vereinheitlichten Schlüsseln (fallen zwei zusammen: die bessere Aufnahme) */
function saetzeKanon<T extends MedienTon>(s: Record<string, T> | undefined): Record<string, T> | undefined {
  if (!s) return s
  const aus: Record<string, T> = {}
  for (const [k, t] of Object.entries(s)) {
    const c = satzSchluessel(k)
    if (!aus[c] || besserTon(t, aus[c]) < 0) aus[c] = t
  }
  return aus
}

const neueDatei = (endung: string): string => `${randomBytes(12).toString('hex')}.${endung}`
const weg = (datei: string | undefined): void => {
  if (datei && MEDIEN_DATEI.test(datei)) rmSync(join(wurzel(), 'dateien', datei), { force: true })
}

function ausDataUrl(dataUrl: string): { bytes: Buffer; endung: 'jpg' | 'png' | 'webp' | 'mp3' } {
  const m = /^data:(image\/(jpeg|png|webp)|audio\/mpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''))
  if (!m) throw new Error('Unerwartetes Dateiformat.')
  const bytes = Buffer.from(m[3], 'base64')
  if (bytes.byteLength > 6 * 1024 * 1024) throw new Error('Die Datei ist zu groß.')
  const endung = m[1] === 'audio/mpeg' ? 'mp3' : m[2] === 'jpeg' ? 'jpg' : (m[2] as 'png' | 'webp')
  return { bytes, endung }
}

const dataUrlVon = (datei: string): string | undefined => {
  try {
    const p = medienDateiPfad(datei)
    if (!existsSync(p)) return undefined
    const typ = datei.endsWith('.mp3') ? 'audio/mpeg' : datei.endsWith('.png') ? 'image/png' : datei.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
    return `data:${typ};base64,${readFileSync(p).toString('base64')}`
  } catch {
    return undefined
  }
}

/**
 * Einträge zu Wörtern einer Sprache. `mitBildern`: Bilder gleich als data-URL (Vorschau in der Tabelle);
 * `basisUrl`: am Server die Adresse der Dateien (`/medien/<datei>`), dann ohne data-URL.
 */
export function medienFuer(
  sprache: string,
  woerter: (string | MedienAnfrage)[],
  opts: { mitBildern?: boolean; basisUrl?: string; lage?: Stimmlage; stufe?: Bildstufe } = {}
): Record<string, MedienSicht> {
  const stufe = opts.stufe ?? 's2'
  const i = index()
  const sinn = sinne()
  const aus: Record<string, MedienSicht> = {}
  const umziehenNach = new Set<string>()
  const url = (d: string): string | undefined => (opts.basisUrl ? `${opts.basisUrl}${d}` : undefined)
  /*
   * Bildstufen (07.10.2026): das Bild der eigenen Stufe, sonst das der nächstliegenden. Für eine Stufe, in der die
   * KI kein eindeutiges Bild sieht (abstrakte Wörter für Jüngere), bleibt das Bild leer.
   */
  const bildAus = (e: Pick<MedienEintrag, 'bild' | 'bildStufen' | 'ohneBild'> | undefined): BildTeil => {
    if (!e) return {}
    const gefunden = e.ohneBild?.includes(stufe) ? undefined : stufenReihe(stufe).find((s) => bildDerStufe(e, s))
    const b = gefunden ? bildDerStufe(e, gefunden) : undefined
    const da = BILDSTUFEN.filter((s) => bildDerStufe(e, s))
    return {
      ...(b ? { bild: { ...b, ...(opts.basisUrl ? { url: url(b.datei) } : opts.mitBildern ? { dataUrl: dataUrlVon(b.datei) } : {}) }, bildStufe: gefunden } : {}),
      // Für die Lehrkraft: Stufen mit eigenem Bild bzw. ohne eindeutiges Bild
      ...(!opts.lage && da.length ? { bildStufenDa: da } : {}),
      ...(!opts.lage && e.ohneBild?.length ? { ohneBild: e.ohneBild } : {})
    }
  }
  /*
   * Bilder je Bedeutung und Wortart (21.10.2026, shared/medienBedeutung.ts): erst die Bedeutung, dann – nur für Lemmata
   * ohne Bedeutungen – das alte Bild aus index.json, und auch das nur unter einem Wort derselben Wortart.
   */
  const bildFuer = (a: MedienAnfrage): BildTeil => {
    const art = wortartFuer(a, sprache)
    const e = sinn.eintraege[sinnSchluessel(sprache, a.w, art)]
    const r = aufloesen(e, a, sprache)
    const andere = !opts.lage && e ? e.bedeutungen.filter((x) => x.id !== r.b?.id).map((x) => ({ id: x.id, deutsch: x.deutsch, wortart: x.wortart })) : []
    const zusatz: BildTeil = {
      ...(r.b && !opts.lage ? { bedeutung: { id: r.b.id, deutsch: r.b.deutsch, wortart: r.b.wortart } } : {}),
      ...(r.vorlaeufig && !opts.lage ? { vorlaeufig: true as const } : {}),
      ...(r.mehrdeutig && !opts.lage ? { mehrdeutig: true as const } : {}),
      ...(andere.length ? { andere } : {})
    }
    if (r.b) return { ...bildAus(r.b), ...zusatz }
    if (!r.altErlaubt) return zusatz
    for (const w of altSchluesselFuer(sprache, a)) {
      const f = finde(i, sprache, w)
      const alt = f ? i[f.schluessel] : undefined
      if (alt && (alt.bild || Object.keys(alt.bildStufen ?? {}).length || alt.ohneBild?.length)) return { ...bildAus(alt), ...zusatz }
    }
    return zusatz
  }
  for (const roh of woerter.slice(0, 2000)) {
    const a = alsAnfrage(roh)
    if (!a) continue
    const w = a.w
    const teil = bildFuer(a)
    const schon = aus[w]
    if (schon) {
      // Dasselbe Wort mehrmals (verschiedene Bedeutungen): nur die Bilder ergänzen
      if (!istEinfach(a)) schon.bilder = { ...(schon.bilder ?? {}), [anfrageSchluessel(a, sprache)]: teil }
      else Object.assign(schon, teil)
      continue
    }
    const bildTeil: Partial<MedienSicht> = istEinfach(a) ? teil : { bilder: { [anfrageSchluessel(a, sprache)]: teil } }
    const f = finde(i, sprache, w)
    if (!f) {
      if (Object.keys(teil).length) aus[w] = bildTeil
      continue
    }
    if (f.verschieben) umziehenNach.add(medienSchluessel(sprache, w))
    const e0 = i[f.schluessel]
    // Sätze unter ihren vereinheitlichten Schlüsseln – so finden die Seiten sie mit `satzSchluessel` (10.10.2026)
    const e: MedienEintrag = { ...e0, saetze: saetzeKanon(e0.saetze), saetzeM: saetzeKanon(e0.saetzeM) }
    const mitUrl = (t: MedienTon): MedienTon & { url?: string } => ({ ...t, ...(opts.basisUrl ? { url: url(t.datei) } : {}) })
    const saetzeMitUrl = (s: Record<string, MedienTon> | undefined): Record<string, MedienTon & { url?: string }> | undefined =>
      s && Object.keys(s).length ? Object.fromEntries(Object.entries(s).map(([k, t]) => [k, mitUrl(t)])) : undefined
    /*
     * Lernende (07.10.2026): nur ihre Fassung, gleich aufgelöst – `ton`/`saetze` sind die bevorzugte Fassung,
     * wo sie fehlt, die andere. Ohne `lage` (Lehrkraft) kommen beide Fassungen.
     */
    if (opts.lage) {
      const andere: Stimmlage = opts.lage === 'w' ? 'm' : 'w'
      const ton = tonVon(e, opts.lage) ?? tonVon(e, andere)
      const saetze = saetzeMitUrl({ ...(saetzeVon(e, andere) ?? {}), ...(saetzeVon(e, opts.lage) ?? {}) })
      const fassungen = fassungenFuerLernende(e, opts.lage)
      aus[w] = {
        ...bildTeil,
        ...(ton ? { ton: mitUrl(ton) } : {}),
        ...(saetze ? { saetze } : {}),
        ...(fassungen ? { fassungen } : {})
      }
      continue
    }
    const saetzeM = saetzeMitUrl(e.saetzeM)
    aus[w] = {
      // Geschlechtsbezogene Beispielsätze (12.10.2026): die Lehrkraft sieht alle Fassungen
      ...(e.fassungen && Object.keys(e.fassungen).length ? { fassungen: e.fassungen } : {}),
      ...(e.tonM ? { tonM: mitUrl(e.tonM) } : {}),
      ...(saetzeM ? { saetzeM } : {}),
      ...bildTeil,
      ...(e.ton ? { ton: { ...e.ton, ...(opts.basisUrl ? { url: url(e.ton.datei) } : {}) } } : {}),
      ...(e.saetze && Object.keys(e.saetze).length
        ? { saetze: Object.fromEntries(Object.entries(e.saetze).map(([k, t]) => [k, { ...t, ...(opts.basisUrl ? { url: url(t.datei) } : {}) }])) }
        : {})
    }
  }
  if (umziehenNach.size) umziehen(umziehenNach)
  return aus
}

/**
 * Fassungen für Lernende (12.10.2026, shared/satzFassung.ts): Sie sehen die angepasste Fassung nur, wenn sie deren Aufnahme
 * auch hören – mit ihrer bevorzugten Stimme oder, wenn es von ihr gar keine Aufnahme des Originals gibt, mit der anderen.
 * Sonst bleibt das Original (Text und Ton passen dann zusammen).
 */
export function fassungenFuerLernende(e: MedienEintrag, lage: Stimmlage): Record<string, SatzFassungSicht> | undefined {
  const andere: Stimmlage = lage === 'w' ? 'm' : 'w'
  const aus: Record<string, SatzFassungSicht> = {}
  const da = (l: Stimmlage, t: string): boolean => Object.keys(saetzeVon(e, l) ?? {}).some((k) => satzSchluessel(k) === satzSchluessel(t))
  for (const [k, f] of Object.entries(e.fassungen ?? {})) {
    if (!f?.lage || !f.text) continue
    const eigene = f.lage === lage && da(lage, f.text)
    const rueckfall = f.lage === andere && !da(lage, f.original || k) && da(andere, f.text)
    if (eigene || rueckfall) aus[satzSchluessel(k)] = { text: f.text, ...(f.uebersetzung ? { uebersetzung: f.uebersetzung } : {}) }
  }
  return Object.keys(aus).length ? aus : undefined
}

/** Datei als data-URL (Ton abspielen, Bild groß) */
export const medienDatei = (datei: string): string | null => dataUrlVon(datei) ?? null

export function bildSetzen(
  sprache: string,
  wort: string,
  b: { dataUrl: string; herkunft: 'suche' | 'ki'; nachweis: string; kandidaten?: MedienKandidat[]; kiAbgelehnt?: boolean },
  stufe: Bildstufe = 's2',
  /** Bedeutung und Wortart (21.10.2026): dann kommt das Bild zu dieser Bedeutung, nicht an das Wort */
  sinn?: SinnAngabe
): MedienBild {
  const { bytes, endung } = ausDataUrl(b.dataUrl)
  if (endung === 'mp3') throw new Error('Kein Bild.')
  const datei = neueDatei(endung)
  writeFileSync(medienDateiPfad(datei), bytes)
  const bild: MedienBild = {
    datei,
    herkunft: b.herkunft === 'ki' ? 'ki' : 'suche',
    nachweis: String(b.nachweis ?? '').slice(0, 400),
    ...(b.kandidaten?.length ? { kandidaten: bereinigeKandidaten(b.kandidaten) } : {}),
    ...(b.kiAbgelehnt === true ? { kiAbgelehnt: true } : {}),
    zeit: Date.now()
  }
  if (sinn) {
    sinnBildAendern(sprache, wort, sinn, (e) => stufeSetzen(e, stufe, bild))
    return bild
  }
  aendern(sprache, wort, (e) => {
    const vorher = bildDerStufe(e, stufe)
    weg(vorher?.datei)
    // Kandidaten bleiben, wenn nur umgewählt wurde
    const neu: MedienBild = { ...bild, kandidaten: bild.kandidaten ?? vorher?.kandidaten }
    const ohneBild = (e.ohneBild ?? []).filter((s) => s !== stufe)
    const basis = { ...e, ...(ohneBild.length ? { ohneBild } : {}) }
    if (!ohneBild.length) delete basis.ohneBild
    return stufe === 's2' ? { ...basis, bild: neu } : { ...basis, bildStufen: { ...(e.bildStufen ?? {}), [stufe]: neu } }
  })
  return bild
}

/** Die KI sieht für diese Stufe kein eindeutiges Bild (abstraktes Wort) – merken, damit kein Auftrag es erneut versucht */
export function ohneBildMerken(sprache: string, wort: string, stufe: Bildstufe, sinn?: SinnAngabe): void {
  if (sinn) return void sinnBildAendern(sprache, wort, sinn, (e) => ({ ...e, ohneBild: [...new Set([...(e.ohneBild ?? []), stufe])] }))
  aendern(sprache, wort, (e) => ({ ...e, ohneBild: [...new Set([...(e.ohneBild ?? []), stufe])] }))
}

/** Bild einer Stufe setzen (die vorige Datei weicht, Kandidaten bleiben beim Umwählen) – für Wort und Bedeutung gleich */
function stufeSetzen<E extends Pick<MedienEintrag, 'bild' | 'bildStufen' | 'ohneBild'>>(e: E, stufe: Bildstufe, bild: MedienBild): E {
  const vorher = bildDerStufe(e, stufe)
  if (vorher?.datei !== bild.datei) weg(vorher?.datei)
  const neu: MedienBild = { ...bild, kandidaten: bild.kandidaten ?? vorher?.kandidaten }
  const ohneBild = (e.ohneBild ?? []).filter((s) => s !== stufe)
  const basis: E = { ...e, ...(ohneBild.length ? { ohneBild } : {}) }
  if (!ohneBild.length) delete basis.ohneBild
  return stufe === 's2' ? { ...basis, bild: neu } : { ...basis, bildStufen: { ...(e.bildStufen ?? {}), [stufe]: neu } }
}

function bereinigeKandidaten(k: MedienKandidat[]): MedienKandidat[] {
  const t = (x: unknown, n = 300): string => String(x ?? '').slice(0, n)
  return k
    .filter((x) => /^https:\/\//.test(String(x?.url ?? '')) || (String(x?.url ?? '').startsWith('data:image/') && String(x.url).length < 4000))
    // Keine NC-/ND-Kandidaten (22.10.2026, Prüfung des Schulträgers)
    .filter((x) => lizenzErlaubt(x?.lizenz))
    .slice(0, 12)
    .map((x) => ({
      url: t(x.url, 4000),
      vorschau: t(x.vorschau, 4000),
      titel: t(x.titel),
      urheber: t(x.urheber),
      lizenz: t(x.lizenz, 120),
      quelle: t(x.quelle, 40)
    }))
}

export function bildLoeschen(sprache: string, wort: string, stufe: Bildstufe = 's2', sinn?: SinnAngabe): void {
  if (sinn)
    return void sinnBildAendern(sprache, wort, sinn, (e) => {
      weg(bildDerStufe(e, stufe)?.datei)
      const rest = { ...e }
      if (stufe === 's2') delete rest.bild
      else {
        const bildStufen = { ...(e.bildStufen ?? {}) }
        delete bildStufen[stufe]
        rest.bildStufen = bildStufen
      }
      return rest
    })
  aendern(sprache, wort, (e) => {
    weg(bildDerStufe(e, stufe)?.datei)
    if (stufe === 's2') {
      const { bild: _b, ...rest } = e
      return rest
    }
    const bildStufen = { ...(e.bildStufen ?? {}) }
    delete bildStufen[stufe]
    return { ...e, bildStufen }
  })
}

/**
 * Aufnahmen aussortieren (09.10.2026, einmalige Wartung server/wartungAbkuerzungTon.ts): Jede Wort- und Satz-Aufnahme
 * beider Fassungen, für die `weg` true sagt, wird gelöscht – Datei und Eintrag. Danach spricht wie ohne Aufnahme die
 * Stimme des Geräts. Bilder bleiben. Ohne Medienbank (kein index.json) geschieht nichts und es wird nichts angelegt.
 */
export function toeneAussortieren(
  weg_: (ton: MedienTon, art: TonArt, sprache: string, eintrag: { wort: string; saetze: string[] }) => boolean,
  /**
   * Sicherung zuerst (09.10.2026, Wartung verbform-ton): Name eines Unterordners der Medienbank. Vor der ersten
   * Löschung kommt index.json dorthin, die betroffenen Dateien werden dorthin VERSCHOBEN statt gelöscht.
   */
  sicherung?: string
): { woerter: number; saetze: number; dateien: number } {
  const zahl = { woerter: 0, saetze: 0, dateien: 0 }
  if (!existsSync(join(wurzelPfad(), 'index.json'))) return zahl
  const i = lies<Record<string, MedienEintrag>>(indexDatei(), {})
  const sich = sicherung && /^[a-z0-9-]{3,80}$/.test(sicherung) ? join(wurzelPfad(), sicherung) : null
  if (sicherung && !sich) throw new Error('Ungültiger Name der Sicherung.')
  const sichern = (): void => {
    if (!sich || existsSync(join(sich, 'index.json'))) return
    mkdirSync(sich, { recursive: true })
    copyFileSync(indexDatei(), join(sich, 'index.json'))
  }
  const loeschen = (t: MedienTon): void => {
    sichern()
    const pfad = t.datei && MEDIEN_DATEI.test(t.datei) ? join(wurzelPfad(), 'dateien', t.datei) : null
    if (pfad && existsSync(pfad)) {
      zahl.dateien++
      if (sich) return renameSync(pfad, join(sich, t.datei))
    }
    weg(t.datei)
  }
  for (const [schluessel, e0] of Object.entries(i)) {
    const sp = schluessel.split(':')[0] ?? ''
    const e: MedienEintrag = { ...e0 }
    const eintrag = { wort: schluessel.slice(sp.length + 1), saetze: [...Object.keys(e0.saetze ?? {}), ...Object.keys(e0.saetzeM ?? {})] }
    for (const feld of ['ton', 'tonM'] as const) {
      const t = e[feld]
      if (t && weg_(t, 'wort', sp, eintrag)) {
        loeschen(t)
        delete e[feld]
        zahl.woerter++
      }
    }
    for (const feld of ['saetze', 'saetzeM'] as const) {
      const s = e[feld]
      if (!s) continue
      const rest: Record<string, MedienTon> = {}
      for (const [k, t] of Object.entries(s))
        if (weg_(t, 'satz', sp, eintrag)) {
          loeschen(t)
          zahl.saetze++
        } else rest[k] = t
      if (Object.keys(rest).length) e[feld] = rest
      else delete e[feld]
    }
    const leer =
      !e.bild && !Object.keys(e.bildStufen ?? {}).length && !e.ohneBild?.length && !e.ton && !e.tonM && !Object.keys(e.saetze ?? {}).length && !Object.keys(e.saetzeM ?? {}).length
    if (leer) delete i[schluessel]
    else i[schluessel] = e
  }
  if (zahl.woerter || zahl.saetze) {
    schreibe(indexDatei(), i)
    zwischen = null
  }
  return zahl
}

/** `lage`: Fassung (weiblich = die bisherigen Felder) */
export function tonSetzen(
  sprache: string,
  wort: string,
  art: TonArt,
  t: {
    dataUrl: string
    stimme: string
    text: string
    gesprochen?: string
    /** Prüfung per Messung (12.10.2026, shared/tonPruefung.ts) */
    pruefung?: TonPruefung
    /** „Neue Aussprache erzeugen" der Admins (12.10.2026): die bisherige Datei als Rückfall behalten */
    behalteVorher?: boolean
    /** … und was bemängelt wurde */
    grund?: string
  },
  lage: Stimmlage = 'w'
): MedienTon {
  const { bytes, endung } = ausDataUrl(t.dataUrl)
  if (endung !== 'mp3') throw new Error('Kein MP3.')
  const datei = neueDatei('mp3')
  writeFileSync(medienDateiPfad(datei), bytes)
  const gesprochen = typeof t.gesprochen === 'string' ? t.gesprochen.slice(0, 600) : ''
  const ton: MedienTon = {
    datei,
    stimme: String(t.stimme ?? '').slice(0, 120),
    text: String(t.text ?? '').slice(0, 600),
    // Abweichender Sprechtext (Abkürzungen, eigene Aussprache, 09.10.2026)
    ...(gesprochen && gesprochen !== t.text ? { gesprochen } : {}),
    zeit: Date.now()
  }
  const pruefung = pruefungBereinigt(t.pruefung)
  if (pruefung) ton.pruefung = pruefung
  const grund = typeof t.grund === 'string' ? t.grund.slice(0, 120) : ''
  /*
   * Rückfall (12.10.2026): Bei „Neue Aussprache erzeugen" bleibt die bisherige Datei als `vorher` liegen; die davor
   * gemerkte weicht. Sonst wird die alte Datei wie bisher gelöscht (samt einer gemerkten).
   */
  const ersetze = (alt: MedienTon | undefined): void => {
    if (!alt) return
    weg(alt.vorher?.datei)
    if (t.behalteVorher) ton.vorher = { datei: alt.datei, stimme: alt.stimme, zeit: alt.zeit, ...(grund ? { grund } : {}) }
    else weg(alt.datei)
  }
  const tonFeld = lage === 'm' ? 'tonM' : 'ton'
  const satzFeld = lage === 'm' ? 'saetzeM' : 'saetze'
  aendern(sprache, wort, (e) => {
    if (art === 'wort') {
      ersetze(e[tonFeld])
      return { ...e, [tonFeld]: ton }
    }
    // Ersetzt wird die Aufnahme dieses Satzes in jeder Schreibweise („it’s" = „it's", 10.10.2026) – die neueste als Rückfall
    const k = satzSchluessel(t.text)
    const saetze = { ...(e[satzFeld] ?? {}) }
    const gleiche = Object.entries(saetze)
      .filter(([alt]) => satzSchluessel(alt) === k)
      .sort((a, b) => b[1].zeit - a[1].zeit)
    gleiche.forEach(([alt, x], i) => {
      if (i === 0) ersetze(x)
      else {
        weg(x.datei)
        weg(x.vorher?.datei)
      }
      delete saetze[alt]
    })
    return { ...e, [satzFeld]: { ...saetze, [k]: ton } }
  })
  medienGeaendert()
  return ton
}

/**
 * Prüfung einer vorhandenen Aufnahme speichern (12.10.2026, Nachprüfung beim Öffnen einer Liste). Nur, wenn die Aufnahme
 * noch dieselbe Datei hat – inzwischen neu erzeugte bekommen ihre eigene Prüfung. `satz`: Wortlaut bei Satz-Aufnahmen.
 * true = gespeichert.
 */
export function tonPruefungSetzen(
  sprache: string,
  wort: string,
  art: TonArt,
  lage: Stimmlage,
  satz: string | undefined,
  datei: string,
  p: TonPruefung
): boolean {
  const pruefung = pruefungBereinigt(p)
  if (!pruefung || !MEDIEN_DATEI.test(String(datei))) return false
  // Kein Eintrag: nichts anlegen
  if (!finde(index(), sprache, wort)) return false
  let getroffen = false
  const tonFeld = lage === 'm' ? 'tonM' : 'ton'
  const satzFeld = lage === 'm' ? 'saetzeM' : 'saetze'
  aendern(sprache, wort, (e) => {
    if (art === 'wort') {
      const t = e[tonFeld]
      if (t?.datei !== datei) return e
      getroffen = true
      return { ...e, [tonFeld]: { ...t, pruefung } }
    }
    const k = satzSchluessel(satz ?? '')
    const saetze = { ...(e[satzFeld] ?? {}) }
    for (const [alt, x] of Object.entries(saetze))
      if (satzSchluessel(alt) === k && x.datei === datei) {
        saetze[alt] = { ...x, pruefung }
        getroffen = true
      }
    return getroffen ? { ...e, [satzFeld]: saetze } : e
  })
  return getroffen
}

/**
 * Fassung eines geschlechtsbezogenen Beispielsatzes setzen (12.10.2026, shared/satzFassung.ts) – von der KI oder von Hand.
 * `fassung` null = vergessen (die KI prüft beim nächsten Auftrag erneut).
 */
export function fassungSetzen(sprache: string, wort: string, original: string, fassung: Partial<SatzFassung> | null): SatzFassung | null {
  const k = satzSchluessel(original)
  if (!k) throw new Error('Kein Beispielsatz.')
  const f = fassung ? fassungBereinigt(fassung, original) : null
  aendern(sprache, wort, (e) => {
    const fassungen = { ...(e.fassungen ?? {}) }
    if (f) fassungen[k] = f
    else delete fassungen[k]
    const rest: MedienEintrag = { ...e, fassungen }
    if (!Object.keys(fassungen).length) delete rest.fassungen
    return rest
  })
  return f
}

/*
 * Erzeugungssperre (10.10.2026): Wer eine Aufnahme erzeugen will, reserviert vorher ihre Kennung (`tonKennung`). Am
 * Server gilt das für alle Lehrkräfte gemeinsam – fordern zwei zugleich dieselbe Vokabel an, wartet die zweite und nimmt
 * die fertige Aufnahme, statt die Sprach-KI noch einmal zu bezahlen (shared/medienbank.ts `einmalErzeugen`).
 */
const sperre = new ErzeugungsSperre()
export const tonReservieren = (kennung: string): Promise<boolean> => sperre.reservieren(String(kennung).slice(0, 900))
export const tonFreigeben = (kennung: string): void => sperre.freigeben(String(kennung).slice(0, 900))

/** Dubletten der Medienbank: mehrere Einträge mit demselben kanonischen Schlüssel bzw. Sätze in mehreren Schreibweisen */
export function medienDubletten(): { gruppen: number; eintraege: number; saetze: number; beispiele: string[] } {
  const aus = { gruppen: 0, eintraege: 0, saetze: 0, beispiele: [] as string[] }
  if (!existsSync(join(wurzelPfad(), 'index.json'))) return aus
  const i = lies<Record<string, MedienEintrag>>(indexDatei(), {})
  for (const [c, ks] of gruppenVon(i))
    if (ks.length > 1) {
      aus.gruppen++
      aus.eintraege += ks.length - 1
      if (aus.beispiele.length < 5) aus.beispiele.push(c)
    }
  for (const e of Object.values(i))
    for (const s of [e.saetze, e.saetzeM]) if (s) aus.saetze += Object.keys(s).length - Object.keys(saetzeKanon(s) ?? {}).length
  return aus
}

/*
 * Prüfung nach Medienaufträgen (10.10.2026): Am Server meldet `start.ts` einen Melder an; nach Änderungen an Aufnahmen
 * (gebündelt, höchstens einmal je Minute) und beim Start zählt er die Dubletten und schreibt eine Zeile ins Protokoll –
 * nur wenn es welche gibt und sich die Zahl geändert hat.
 */
let melder: ((zeile: string) => void) | null = null
let zuletztGemeldet = ''
let pruefUhr: ReturnType<typeof setTimeout> | null = null
export function dublettenPruefen(): void {
  if (!melder) return
  try {
    const d = medienDubletten()
    const zeile = d.gruppen || d.saetze ? `MEDIENBANK Dubletten: ${d.gruppen} Wörter mit ${d.eintraege} zusätzlichen Einträgen, ${d.saetze} doppelte Sätze (z. B. ${d.beispiele.join(', ')})` : ''
    if (zeile && zeile !== zuletztGemeldet) melder(zeile)
    zuletztGemeldet = zeile
  } catch {
    // Nur eine Prüfung – nie den Betrieb stören
  }
}
export function dublettenMelder(fn: ((zeile: string) => void) | null): void {
  melder = fn
}
function medienGeaendert(): void {
  if (!melder || pruefUhr) return
  pruefUhr = setTimeout(() => {
    pruefUhr = null
    dublettenPruefen()
  }, 60_000)
  pruefUhr.unref?.()
}

/**
 * Einmalige Wartung (10.10.2026, server/wartungMedienKanon.ts): alle Einträge auf ihren kanonischen Schlüssel ziehen und
 * Dubletten zusammenführen – je Aufnahme bzw. Bild die beste (ausdrücklicher Sprechtext, dann die neueste), fehlende
 * Teile aus den anderen ergänzt. Die übrigen Einträge kommen nach dubletten.json; KEINE Datei wird gelöscht. Vorher
 * wird index.json gesichert.
 */
export function medienKanonOrdnen(sicherung = 'sicherung-kanon-2026-10-10'): { verschoben: number; zusammengefuehrt: number; beiseite: number; saetze: number } {
  const zahl = { verschoben: 0, zusammengefuehrt: 0, beiseite: 0, saetze: 0 }
  if (!existsSync(join(wurzelPfad(), 'index.json'))) return zahl
  const i = lies<Record<string, MedienEintrag>>(indexDatei(), {})
  const neu: Record<string, MedienEintrag> = {}
  const weg_: Record<string, MedienEintrag> = {}
  const ersterBesser = <T extends { zeit?: number }>(a: T | undefined, b: T | undefined): T | undefined => (!a ? b : !b ? a : zeitVon(b) > zeitVon(a) ? b : a)
  for (const [c, ks] of gruppenVon(i)) {
    const alle = ks.map((k) => i[k])
    if (ks.length > 1) {
      zahl.zusammengefuehrt++
      ks.forEach((k) => (weg_[k] = i[k]))
    } else if (ks[0] !== c) zahl.verschoben++
    const e: MedienEintrag = { ...alle[0] }
    for (const feld of ['ton', 'tonM'] as const) {
      const t = alle.map((x) => x[feld]).sort(besserTon)[0]
      if (t) e[feld] = t
    }
    const bild = alle.map((x) => x.bild).reduce(ersterBesser, undefined)
    if (bild) e.bild = bild
    const stufen = { ...(e.bildStufen ?? {}) }
    for (const x of alle) for (const [s, b] of Object.entries(x.bildStufen ?? {})) stufen[s as Bildstufe] = ersterBesser(stufen[s as Bildstufe], b)
    if (Object.keys(stufen).length) e.bildStufen = stufen
    for (const feld of ['saetze', 'saetzeM'] as const) {
      const vorher = alle.reduce((n, x) => n + Object.keys(x[feld] ?? {}).length, 0)
      // Sätze aller Einträge zusammen, je vereinheitlichtem Satz die bessere Aufnahme
      const alleSaetze: Record<string, MedienTon> = {}
      for (const x of alle)
        for (const [k, t] of Object.entries(x[feld] ?? {})) {
          const kk = satzSchluessel(k)
          if (!alleSaetze[kk] || besserTon(t, alleSaetze[kk]) < 0) alleSaetze[kk] = t
        }
      if (vorher) e[feld] = alleSaetze
      const doppelt = vorher - Object.keys(alleSaetze).length
      if (doppelt > 0) zahl.saetze += doppelt
      // Auch ein einzelner Eintrag mit doppelten Sätzen kommt zur Sicherheit in dubletten.json
      if (doppelt > 0 && ks.length === 1) weg_[ks[0]] = i[ks[0]]
    }
    neu[c] = e
  }
  // Was in keinem behaltenen Eintrag mehr vorkommt, liegt nur noch in dubletten.json (Dateien bleiben)
  zahl.beiseite = Object.keys(weg_).length
  if (!zahl.verschoben && !zahl.zusammengefuehrt && !zahl.saetze) return zahl
  if (/^[a-z0-9-]{3,80}$/.test(sicherung)) {
    const sich = join(wurzelPfad(), sicherung)
    if (!existsSync(join(sich, 'index.json'))) {
      mkdirSync(sich, { recursive: true })
      copyFileSync(indexDatei(), join(sich, 'index.json'))
    }
  }
  beiseitelegen(weg_)
  schreibe(indexDatei(), neu)
  zwischen = null
  return zahl
}

export function tonLoeschen(sprache: string, wort: string, art: TonArt, satz?: string, lage: Stimmlage = 'w'): void {
  const tonFeld = lage === 'm' ? 'tonM' : 'ton'
  const satzFeld = lage === 'm' ? 'saetzeM' : 'saetze'
  aendern(sprache, wort, (e) => {
    if (art === 'wort') {
      weg(e[tonFeld]?.datei)
      weg(e[tonFeld]?.vorher?.datei)
      const rest = { ...e }
      delete rest[tonFeld]
      return rest
    }
    const k = satzSchluessel(satz ?? '')
    const saetze = { ...(e[satzFeld] ?? {}) }
    for (const [alt, x] of Object.entries(saetze))
      if (satzSchluessel(alt) === k) {
        weg(x.datei)
        weg(x.vorher?.datei)
        delete saetze[alt]
      }
    return { ...e, [satzFeld]: saetze }
  })
}

/** Standardstimmen je Sprache und Fassung (Einstellungen › Bilder und Hörtexte); ältere Dateien: eine Kennung je Sprache */
export const stimmenLesen = (): Record<string, Stimmen> => stimmenNormiert(lies<unknown>(stimmenDatei(), {}))
export function stimmeSetzen(sprache: string, stimme: string, lage: Stimmlage = 'w'): Record<string, Stimmen> {
  const s = stimmenLesen()
  const k = sprachKurz(sprache)
  const neu: Stimmen = { ...(s[k] ?? {}) }
  const l: Stimmlage = lage === 'm' ? 'm' : 'w'
  if (stimme) neu[l] = String(stimme).slice(0, 120)
  else delete neu[l]
  if (neu.w || neu.m) s[k] = neu
  else delete s[k]
  schreibe(stimmenDatei(), s)
  return s
}

// ---------------------------------------------------------------- Bilder je Bedeutung (21.10.2026, shared/medienBedeutung.ts)


const SINN_VERSION = 1
const SINN_SICHERUNG = 'sicherung-bedeutungen-2026-10-21'
const sinnDatei = (): string => join(wurzel(), 'bedeutungen.json')
let sinnZwischen: { zeit: number; d: SinnDatei } | null = null

/**
 * Woher die Wörter für das Einrichten kommen (Lehrwerke, Verblisten): am Server meldet start.ts die Ordner aller
 * Lehrkräfte an, in der Exe gelten die eigenen. Liefert die Wörter – ohne Personenbezug.
 */
let korpusQuelle: () => KorpusWort[] = () => korpusAusOrdnern(standardOrdner())
export const medienKorpusQuelle = (fn: () => KorpusWort[]): void => void (korpusQuelle = fn)

function standardOrdner(): { lehrwerke: string[]; verben: string[] } {
  const lehrwerke: string[] = []
  try {
    lehrwerke.push(resourcePath('lehrwerke'))
  } catch {
    // ohne Electron (Tests): nur die eigenen Ordner
  }
  try {
    const u = app.getPath('userData')
    lehrwerke.push(join(u, 'lehrwerke'))
    return { lehrwerke, verben: [join(u, 'lehrwerke', 'verben')] }
  } catch {
    return { lehrwerke, verben: [] }
  }
}

/** Wörter aus Lehrwerk-Dateien und Verblisten (einzelne kaputte Dateien werden übersprungen) */
export function korpusAusOrdnern(o: { lehrwerke: string[]; verben: string[] }): KorpusWort[] {
  const aus: KorpusWort[] = []
  const dateien = (d: string): string[] => {
    try {
      return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => join(d, f)) : []
    } catch {
      return []
    }
  }
  for (const d of o.lehrwerke)
    for (const f of dateien(d)) {
      const b = lies<{ name?: string; language?: string; units?: { name?: string; sections?: { entries?: { term?: string; translation?: string; pos?: string }[] }[] }[] }>(f, {})
      const sprache = String(b.language ?? '')
      if (!sprache || !Array.isArray(b.units)) continue
      for (const u of b.units)
        for (const s of u.sections ?? [])
          for (const e of s.entries ?? [])
            if (e?.term && e.translation)
              aus.push({
                sprache,
                term: String(e.term),
                translation: String(e.translation),
                ...(e.pos ? { pos: String(e.pos) } : {}),
                quelle: [b.name, u.name].filter(Boolean).join(' › ')
              })
    }
  for (const d of o.verben)
    for (const f of dateien(d)) {
      const l = lies<{ name?: string; sprache?: string; eintraege?: { formen?: Record<string, string> }[] }>(f, {})
      const sprache = String(l.sprache ?? '')
      if (!sprache) continue
      for (const e of l.eintraege ?? []) {
        const inf = String(e?.formen?.inf ?? '').trim()
        const de = String(e?.formen?.de ?? '').trim()
        if (inf && de) aus.push({ sprache, term: inf, translation: de, art: 'verb', quelle: `Unregelmäßige Verben${l.name ? ` › ${l.name}` : ''}` })
      }
    }
  return aus
}

/** bedeutungen.json lesen – beim ersten Mal mit dem Einrichten aus dem Bestand (Phase A, ohne KI) */
function sinne(): SinnDatei {
  if (sinnZwischen && Date.now() - sinnZwischen.zeit < 2000) return sinnZwischen.d
  let d = lies<SinnDatei>(sinnDatei(), { eintraege: {} })
  if (!d.eintraege || typeof d.eintraege !== 'object') d = { eintraege: {} }
  if ((d.version ?? 0) < SINN_VERSION)
    try {
      sinneEinrichten()
      d = lies<SinnDatei>(sinnDatei(), { eintraege: {} })
    } catch {
      // Einrichten scheiterte (z. B. unlesbare Lehrwerke): weiter mit dem, was da ist – die alten Bilder gelten dann
    }
  sinnZwischen = { zeit: Date.now(), d }
  return d
}
/** Nur für Tests */
export const bedeutungenNeuLesen = (): void => void (sinnZwischen = null)

function sinnSchreiben(d: SinnDatei): void {
  schreibe(sinnDatei(), { ...d, version: Math.max(d.version ?? 0, SINN_VERSION) })
  sinnZwischen = null
}

/** Sicherung von index.json und bedeutungen.json – je Sicherungsordner nur einmal */
function sinnSichern(): string {
  const sich = join(wurzelPfad(), SINN_SICHERUNG)
  if (!existsSync(sich)) mkdirSync(sich, { recursive: true })
  for (const name of ['index.json', 'bedeutungen.json']) {
    const von = join(wurzelPfad(), name)
    if (existsSync(von) && !existsSync(join(sich, name))) copyFileSync(von, join(sich, name))
  }
  return sich
}
/** Eine Bilddatei in die Sicherung verschieben statt sie zu löschen (Zusammenführen, KI verwirft ein altes Bild) */
function beiseiteDatei(datei: string | undefined): void {
  if (!datei || !MEDIEN_DATEI.test(datei)) return
  const von = join(wurzelPfad(), 'dateien', datei)
  if (!existsSync(von)) return
  try {
    renameSync(von, join(sinnSichern(), datei))
  } catch {
    // Nur Aufräumen – lieber die Datei liegen lassen als scheitern
  }
}

/** Neue Bedeutung anlegen */
function bedeutungNeu(wortart: Wortart, deutsch: string, quelle: MedienBedeutung['quelle'], varianten: string[] = []): MedienBedeutung {
  const n = bedeutungNorm(deutsch)
  return {
    id: neueBedeutungsId(),
    wortart,
    deutsch: deutsch.trim().slice(0, 160) || deutsch,
    varianten: [...new Set([...(n ? [n] : []), ...varianten])],
    quelle,
    zeit: Date.now()
  }
}

const bildFelder = (e: Pick<MedienEintrag, 'bild' | 'bildStufen' | 'ohneBild'>): boolean => Boolean(e.bild || Object.keys(e.bildStufen ?? {}).length || e.ohneBild?.length)

/**
 * Erste Bedeutung eines Lemmas ohne Einrichtung (neue Wörter nach dem Einrichten): Das alte Bild aus index.json zieht
 * mit in die Bedeutung, sofern es unter einem Wort derselben Wortart liegt – sonst verschwände es aus der Ansicht und
 * würde neu erzeugt.
 */
function altesBildUebernehmen(sprache: string, wort: string, b: MedienBedeutung): void {
  const i = lies<Record<string, MedienEintrag>>(indexDatei(), {})
  for (const w of altSchluesselFuer(sprache, { w: wort, art: b.wortart, de: b.deutsch })) {
    const f = finde(i, sprache, w)
    const e = f ? i[f.schluessel] : undefined
    if (!f || !e || !bildFelder(e)) continue
    if (e.bild) b.bild = e.bild
    if (Object.keys(e.bildStufen ?? {}).length) b.bildStufen = e.bildStufen
    if (e.ohneBild?.length) b.ohneBild = e.ohneBild
    const rest: MedienEintrag = { ...e }
    delete rest.bild
    delete rest.bildStufen
    delete rest.ohneBild
    if (istLeer(rest)) delete i[f.schluessel]
    else i[f.schluessel] = rest
    schreibe(indexDatei(), i)
    zwischen = null
    return
  }
}

/**
 * Die Bedeutung zu einer Angabe finden oder anlegen: per Kennung, sonst über die Übersetzung (genau oder ein gemeinsamer
 * Teil); sonst neu. Die Übersetzung kommt als Variante dazu – das ist der Merker der Zuordnung.
 */
function bedeutungSichern(d: SinnDatei, sprache: string, wort: string, sinn: SinnAngabe, quelle: MedienBedeutung['quelle'] = 'neu'): MedienBedeutung {
  const schluessel = sinnSchluessel(sprache, wort, sinn.wortart)
  const e: SinnEintrag = d.eintraege[schluessel] ?? { bedeutungen: [] }
  const erste = !e.bedeutungen.length && !e.offen?.length
  let b = sinn.id ? e.bedeutungen.find((x) => x.id === sinn.id && x.wortart === sinn.wortart) : undefined
  if (!b) {
    const f = bedeutungFinden(e, sinn.wortart, sinn.deutsch)
    if (f.wie === 'genau' || f.wie === 'teil') b = f.b
  }
  if (!b) {
    b = bedeutungNeu(sinn.wortart, sinn.deutsch || wort, quelle)
    if (erste) altesBildUebernehmen(sprache, wort, b)
    e.bedeutungen.push(b)
    // Zweite Bedeutung derselben Wortart: vielleicht nur ein Synonym – die Klärung der Admins prüft
    if (e.bedeutungen.filter((x) => x.wortart === sinn.wortart).length > 1) e.klaeren = true
  }
  const n = bedeutungNorm(sinn.deutsch)
  if (n && !b.varianten.includes(n)) b.varianten.push(n)
  d.eintraege[schluessel] = e
  return b
}

/** Bilder einer Bedeutung ändern (sie wird bei Bedarf angelegt) */
function sinnBildAendern(sprache: string, wort: string, sinn: SinnAngabe, fn: (b: MedienBedeutung) => MedienBedeutung): void {
  // Erst einrichten (falls noch nicht geschehen) – sonst stünde die Version fest, bevor der Bestand eingeordnet ist
  sinne()
  const d = lies<SinnDatei>(sinnDatei(), { eintraege: {} })
  d.eintraege ??= {}
  const b = bedeutungSichern(d, sprache, wort, sinn)
  const neu = fn({ ...b })
  const e = d.eintraege[sinnSchluessel(sprache, wort, sinn.wortart)]
  e.bedeutungen = e.bedeutungen.map((x) => (x.id === b.id ? neu : x))
  sinnSchreiben(d)
}


/**
 * Bedeutungen zuordnen (erster Schritt des Medienauftrags, ohne KI): passt eine Übersetzung genau oder über einen Teil,
 * ist die Bedeutung klar; hat die Wortart noch keine, entsteht sie. Sonst (einzige andere oder mehrere) fragt der
 * Auftrag die KI und meldet das Ergebnis mit `sinnFestlegen`.
 */
export function sinneZuordnen(sprache: string, anfragen: MedienAnfrage[]): SinnZuordnung[] {
  sinne()
  const d = lies<SinnDatei>(sinnDatei(), { eintraege: {} })
  d.eintraege ??= {}
  let geaendert = false
  const aus = anfragen.slice(0, 2000).map((roh): SinnZuordnung => {
    const a = alsAnfrage(roh)
    if (!a) return { fragen: [] }
    const art = wortartFuer(a, sprache)
    const de = a.de ?? a.w
    const e = d.eintraege[sinnSchluessel(sprache, a.w, art)]
    const f = bedeutungFinden(e, art, de)
    if (f.wie === 'genau' && f.b) return { id: f.b.id, deutsch: f.b.deutsch }
    if (f.wie === 'teil' || f.wie === 'keine') {
      geaendert = true
      const b = bedeutungSichern(d, sprache, a.w, { wortart: art, deutsch: de }, 'neu')
      return { id: b.id, deutsch: b.deutsch }
    }
    const gleich = (e?.bedeutungen ?? []).filter((b) => b.wortart === art)
    return { fragen: gleich.map((b) => ({ id: b.id, deutsch: b.deutsch })) }
  })
  if (geaendert) sinnSchreiben(d)
  return aus
}

/** Ergebnis der KI: diese Übersetzung gehört zu Bedeutung `ziel` – oder ist eine neue (`ziel` = 'neu') */
export function sinnFestlegen(sprache: string, wort: string, wortart: Wortart, deutsch: string, ziel: string): { id: string; deutsch: string } {
  sinne()
  const d = lies<SinnDatei>(sinnDatei(), { eintraege: {} })
  d.eintraege ??= {}
  const art: Wortart = wortart === 'verb' ? 'verb' : 'andere'
  const schluessel = sinnSchluessel(sprache, wort, art)
  const e: SinnEintrag = d.eintraege[schluessel] ?? { bedeutungen: [] }
  let b = ziel !== 'neu' ? e.bedeutungen.find((x) => x.id === ziel && x.wortart === art) : undefined
  if (!b) {
    b = bedeutungNeu(art, deutsch || wort, 'ki')
    e.bedeutungen.push(b)
    if (e.bedeutungen.filter((x) => x.wortart === art).length > 1) e.klaeren = true
  }
  const n = bedeutungNorm(deutsch)
  if (n && !b.varianten.includes(n)) b.varianten.push(n)
  d.eintraege[schluessel] = e
  sinnSchreiben(d)
  return { id: b.id, deutsch: b.deutsch }
}


/** Was auf die Klärung wartet (Admin-Knopf „Mehrdeutige Wörter klären") */
export function sinnStand(max = 400): { klaeren: number; offen: number; liste: SinnStandEintrag[] } {
  const d = sinne()
  const aus = { klaeren: 0, offen: 0, liste: [] as SinnStandEintrag[] }
  for (const [schluessel, e] of Object.entries(d.eintraege)) {
    const offen = e.offen ?? []
    if (!e.klaeren && !offen.length) continue
    if (e.klaeren) aus.klaeren++
    aus.offen += offen.length
    if (aus.liste.length < max)
      aus.liste.push({
        schluessel,
        bedeutungen: e.bedeutungen.map((b) => ({ id: b.id, wortart: b.wortart, deutsch: b.deutsch, varianten: b.varianten.slice(0, 12) })),
        ...(e.klaeren ? { klaeren: true as const } : {}),
        offen: offen.map((o) => ({ datei: o.datei, stufe: o.stufe, wortarten: o.wortarten }))
      })
  }
  return aus
}

/**
 * Synonyme zusammenführen (Ergebnis der KI): je Gruppe bleibt die erste Bedeutung mit Bild (sonst die erste), die
 * übrigen gehen in ihr auf – Varianten zusammen, ihre überzähligen Bilder kommen in die Sicherung. Danach gilt das Lemma
 * als geklärt.
 */
export function sinneZusammenfuehren(schluessel: string, gruppen: string[][]): number {
  const d = lies<SinnDatei>(sinnDatei(), { eintraege: {} })
  const e = d.eintraege?.[schluessel]
  if (!e) return 0
  let n = 0
  for (const g of gruppen) {
    const teil = g.map((id) => e.bedeutungen.find((b) => b.id === id)).filter((b): b is MedienBedeutung => Boolean(b))
    if (teil.length < 2 || new Set(teil.map((b) => b.wortart)).size > 1) continue
    const bleibt = teil.find((b) => bildFelder(b)) ?? teil[0]
    for (const b of teil) {
      if (b === bleibt) continue
      bleibt.varianten = [...new Set([...bleibt.varianten, ...b.varianten])]
      for (const s of BILDSTUFEN) {
        const x = bildDerStufe(b, s)
        if (!x) continue
        if (!bildDerStufe(bleibt, s)) Object.assign(bleibt, stufeSetzenOhneLoeschen(bleibt, s, x))
        else beiseiteDatei(x.datei)
      }
      e.bedeutungen = e.bedeutungen.filter((x) => x !== b)
      n++
    }
  }
  delete e.klaeren
  e.geklaert = Date.now()
  sinnSchreiben(d)
  return n
}

/** Ein altes Bild zuordnen (Ergebnis der Bildprüfung): `id` = Bedeutung, null = passt zu keiner (Datei in die Sicherung) */
export function altbildZuordnen(schluessel: string, datei: string, id: string | null): boolean {
  const d = lies<SinnDatei>(sinnDatei(), { eintraege: {} })
  const e = d.eintraege?.[schluessel]
  const o = e?.offen?.find((x) => x.datei === datei)
  if (!e || !o) return false
  const b = id ? e.bedeutungen.find((x) => x.id === id && o.wortarten.includes(x.wortart)) : undefined
  if (b && !bildDerStufe(b, o.stufe)) Object.assign(b, stufeSetzenOhneLoeschen(b, o.stufe, o.bild))
  else beiseiteDatei(o.datei)
  e.offen = (e.offen ?? []).filter((x) => x !== o)
  if (!e.offen.length) delete e.offen
  sinnSchreiben(d)
  return true
}

/**
 * Einrichten (Phase A, 21.10.2026, ohne KI): Aus allen bekannten Wörtern (Lehrwerke, Verblisten) entstehen je Lemma und
 * Wortart die Bedeutungen (Übersetzungen mit gemeinsamem Teil = eine). Alte Bilder aus index.json ziehen in ihre
 * Bedeutung, wenn sie eindeutig ist; sonst warten sie in `offen` auf die Bildprüfung der KI (Admin-Knopf). Vorher wird
 * gesichert; ein zweiter Lauf ändert nichts (Lemmata mit Bedeutungen bleiben, wie sie sind). Ohne index.json geschieht
 * nichts.
 */
export function sinneEinrichten(korpus?: KorpusWort[]): { lemmata: number; verschoben: number; offen: number; klaeren: number } {
  const zahl = { lemmata: 0, verschoben: 0, offen: 0, klaeren: 0 }
  const d = lies<SinnDatei>(sinnDatei(), { eintraege: {} })
  d.eintraege ??= {}
  // Ohne index.json nichts festschreiben: Ein neuer Server bekommt den Grundbestand erst nach der Wartung (start.ts) –
  // eingerichtet wird dann beim ersten Nachschlagen
  if (!existsSync(join(wurzelPfad(), 'index.json'))) return zahl
  const woerter = korpus ?? korpusQuelle()
  const i = lies<Record<string, MedienEintrag>>(indexDatei(), {})
  let indexGeaendert = false
  for (const [schluessel, g] of gruppiereKorpus(woerter)) {
    if (d.eintraege[schluessel]) continue
    const e: SinnEintrag = { bedeutungen: g.gruppen.map((x) => bedeutungNeu(x.wortart, x.deutsch, 'migration', x.varianten)) }
    for (const art of ['verb', 'andere'] as Wortart[]) if (e.bedeutungen.filter((b) => b.wortart === art).length > 1) e.klaeren = true
    // Wortarten je bisherigem Wort (ein Wort kann als Verb und als Nomen vorkommen: „bear" der Verbliste und die Vokabel)
    const arten = new Map<string, Set<Wortart>>()
    for (const w of g.woerter) arten.set(w.wort, new Set([...(arten.get(w.wort) ?? []), w.wortart]))
    for (const [wort, wa] of arten) {
      const f = finde(i, g.sprache, wort)
      const alt = f ? i[f.schluessel] : undefined
      if (!f || !alt || !bildFelder(alt)) continue
      const kandidaten = e.bedeutungen.filter((b) => wa.has(b.wortart))
      if (!kandidaten.length) continue
      if (!indexGeaendert) sinnSichern()
      for (const s of BILDSTUFEN) {
        const bild = bildDerStufe(alt, s)
        if (!bild) continue
        if (kandidaten.length === 1) {
          const b = kandidaten[0]
          const da = bildDerStufe(b, s)
          // Zwei Wörter derselben Bedeutung mit Bild („to bear" und „bear" der Verbliste): das neuere bleibt
          if (!da || da.zeit < bild.zeit) {
            if (da) beiseiteDatei(da.datei)
            Object.assign(b, stufeSetzenOhneLoeschen(b, s, bild))
          } else beiseiteDatei(bild.datei)
          zahl.verschoben++
        } else {
          e.offen = [...(e.offen ?? []), { datei: bild.datei, stufe: s, wortarten: [...wa], bild }]
          zahl.offen++
        }
      }
      if (kandidaten.length === 1 && alt.ohneBild?.length) kandidaten[0].ohneBild = [...new Set([...(kandidaten[0].ohneBild ?? []), ...alt.ohneBild])]
      const rest: MedienEintrag = { ...alt }
      delete rest.bild
      delete rest.bildStufen
      delete rest.ohneBild
      if (istLeer(rest)) delete i[f.schluessel]
      else i[f.schluessel] = rest
      indexGeaendert = true
    }
    if (e.klaeren) zahl.klaeren++
    d.eintraege[schluessel] = e
    zahl.lemmata++
  }
  if (indexGeaendert) {
    schreibe(indexDatei(), i)
    zwischen = null
  }
  sinnSchreiben(d)
  return zahl
}

/** Bild einer Stufe setzen, ohne die vorige Datei zu löschen (Einrichten und Zusammenführen verschieben nur Verweise) */
function stufeSetzenOhneLoeschen<E extends Pick<MedienEintrag, 'bild' | 'bildStufen' | 'ohneBild'>>(e: E, stufe: Bildstufe, bild: MedienBild): E {
  return stufe === 's2' ? { ...e, bild } : { ...e, bildStufen: { ...(e.bildStufen ?? {}), [stufe]: bild } }
}

// ---------------------------------------------------------------- App „Mehrdeutig" (21.10.2026)

/**
 * App „Mehrdeutig" (21.10.2026, Wunsch der Lehrkraft): Wörter aller Bücher (Lehrwerke, Verblisten – derselbe Bestand wie
 * beim Einrichten) mit ihren Fundstellen und Bedeutungen ansehen und klären. Der Bestand wird kurz zwischengespeichert –
 * das Blättern liest nicht jedes Mal alle Lehrwerke.
 */
let korpusZwischen: { zeit: number; w: KorpusWort[] } | null = null
function korpusKurz(): KorpusWort[] {
  if (korpusZwischen && Date.now() - korpusZwischen.zeit < 60_000) return korpusZwischen.w
  const w = korpusQuelle()
  korpusZwischen = { zeit: Date.now(), w }
  return w
}
/** Nur für Tests */
export const korpusNeuLesen = (): void => void (korpusZwischen = null)

function sinnDateiAendern<T>(schluessel: string, fn: (e: SinnEintrag, d: SinnDatei) => T): T {
  sinne()
  const d = lies<SinnDatei>(sinnDatei(), { eintraege: {} })
  d.eintraege ??= {}
  if (!/^[a-z]{2,8}:.+/.test(schluessel)) throw new Error('Unbekanntes Wort.')
  // Wörter ohne Einrichtung (neu nach dem Einrichten) bekommen hier ihren Eintrag
  const e = (d.eintraege[schluessel] ??= { bedeutungen: [] })
  const aus = fn(e, d)
  sinnSchreiben(d)
  return aus
}
const bedeutungVon = (e: SinnEintrag, id: string): MedienBedeutung => {
  const b = e.bedeutungen.find((x) => x.id === id)
  if (!b) throw new Error('Unbekannte Bedeutung.')
  return b
}

/** „Bild passt" (21.10.2026): die Lehrkraft hat Bedeutung und Bild geprüft; `an` = false nimmt es zurück */
/** „Wort geklärt" (21.10.2026): von Hand abgehakt – keine Klärung mehr nötig (`an` = false nimmt es zurück) */
export function wortGeklaert(schluessel: string, an = true): void {
  sinnDateiAendern(schluessel, (e) => {
    if (an) e.vonHand = Date.now()
    else delete e.vonHand
  })
}

/**
 * Alle Wörter mit Klärungsbedarf auf einmal als geklärt abhaken (21.10.2026, Wunsch der Lehrkraft; die App „Mehrdeutig"
 * ist danach entfernt). bedeutungen.json wird vorher gesichert. Ergebnis: Zahl der abgehakten Wörter.
 */
export function alleWoerterGeklaert(sicherung = 'sicherung-geklaert-2026-10-21'): number {
  const offen = mehrdeutigListe({ filter: 'klaerung' }, true).zeilen.map((z) => z.schluessel)
  if (!offen.length) return 0
  const sich = join(wurzelPfad(), sicherung)
  const von = join(wurzelPfad(), 'bedeutungen.json')
  if (!existsSync(sich)) mkdirSync(sich, { recursive: true })
  if (existsSync(von) && !existsSync(join(sich, 'bedeutungen.json'))) copyFileSync(von, join(sich, 'bedeutungen.json'))
  const d = lies<SinnDatei>(sinnDatei(), { eintraege: {} })
  d.eintraege ??= {}
  const jetzt = Date.now()
  for (const s of offen) (d.eintraege[s] ??= { bedeutungen: [] }).vonHand = jetzt
  sinnSchreiben(d)
  return offen.length
}

export function sinnGeprueft(schluessel: string, id: string, an = true): void {
  sinnDateiAendern(schluessel, (e) => {
    const b = bedeutungVon(e, id)
    if (an) b.geprueft = Date.now()
    else delete b.geprueft
  })
}

/** Wortart einer Bedeutung ändern (Verb / kein Verb) – die Prüfung gilt danach nicht mehr */
export function sinnWortart(schluessel: string, id: string, wortart: Wortart): void {
  sinnDateiAendern(schluessel, (e) => {
    const b = bedeutungVon(e, id)
    b.wortart = wortart === 'verb' ? 'verb' : 'andere'
    delete b.geprueft
    if (e.bedeutungen.filter((x) => x.wortart === b.wortart).length > 1) e.klaeren = true
  })
}

/** Bezeichnung einer Bedeutung ändern („Bär" → „Bär (Tier)") – die neue Schreibweise gehört dazu */
export function sinnBezeichnung(schluessel: string, id: string, deutsch: string): void {
  const text = String(deutsch ?? '').trim().slice(0, 160)
  if (!text) throw new Error('Die Bedeutung braucht einen Text.')
  sinnDateiAendern(schluessel, (e) => {
    const b = bedeutungVon(e, id)
    b.deutsch = text
    const n = bedeutungNorm(text)
    if (n && !b.varianten.includes(n)) b.varianten.push(n)
  })
}

/**
 * Eine Übersetzung einer anderen Bedeutung zuordnen – oder einer neuen (`ziel` = 'neu', dann mit `wortart`). Die
 * Übersetzung verlässt dabei ihre bisherige Bedeutung; eine Bedeutung ohne Übersetzung und ohne Bild verschwindet.
 */
export function varianteVerschieben(schluessel: string, uebersetzung: string, ziel: string, wortart: Wortart = 'andere'): string {
  const n = bedeutungNorm(uebersetzung)
  if (!n) throw new Error('Keine Übersetzung.')
  return sinnDateiAendern(schluessel, (e) => {
    const verlassen = new Set<MedienBedeutung>()
    for (const b of e.bedeutungen)
      if (b.varianten.includes(n)) {
        b.varianten = b.varianten.filter((v) => v !== n)
        verlassen.add(b)
      }
    let z = ziel !== 'neu' ? e.bedeutungen.find((x) => x.id === ziel) : undefined
    if (!z) {
      z = bedeutungNeu(wortart === 'verb' ? 'verb' : 'andere', uebersetzung.trim(), 'hand')
      e.bedeutungen.push(z)
    } else z.varianten.push(n)
    // Leer gewordene Bedeutungen fallen weg: ohne Bild und ohne eine Übersetzung, die in einem Buch vorkommt
    const imBuch = new Set(
      korpusKurz()
        .filter((k) => sinnSchluessel(k.sprache, k.term, wortartFuer({ term: k.term, pos: k.pos, art: k.art }, k.sprache)) === schluessel)
        .map((k) => bedeutungNorm(k.translation))
    )
    const leer = (b: MedienBedeutung): boolean => !bildFelder(b) && !b.varianten.some((v) => imBuch.has(v))
    e.bedeutungen = e.bedeutungen.filter((b) => b === z || !verlassen.has(b) || !leer(b))
    if (e.bedeutungen.filter((x) => x.wortart === z!.wortart).length > 1) e.klaeren = true
    return z.id
  })
}


/**
 * Die Liste der App: je Lemma Fundstellen und Bedeutungen, gefiltert, gesucht, A–Z, seitenweise. Klärungsbedarf: mehrere
 * Bedeutungen (noch nicht alle geprüft), wartende alte Bilder, Synonym-Verdacht oder Fundstellen ohne sichere Bedeutung.
 */
export function mehrdeutigListe(o: {
  filter?: MehrdeutigFilter
  suche?: string
  sprache?: string
  stufe?: Bildstufe
  seite?: number
  jeSeite?: number
}, alle = false): { zeilen: MehrdeutigZeile[]; gesamt: number; sprachen: string[]; klaerung: number } {
  const d = sinne()
  const stufe = istStufeWert(o.stufe) ? o.stufe : 's2'
  const jeSeite = Math.max(5, Math.min(100, Math.round(o.jeSeite ?? 30)))
  const fund = new Map<string, { sprache: string; liste: KorpusWort[] }>()
  for (const k of korpusKurz()) {
    const art = wortartFuer({ term: k.term, pos: k.pos, art: k.art }, k.sprache)
    const s = sinnSchluessel(k.sprache, k.term, art)
    const x = fund.get(s) ?? { sprache: sprachKurz(k.sprache), liste: [] }
    x.liste.push(k)
    fund.set(s, x)
  }
  const schluessel = new Set([...fund.keys(), ...Object.keys(d.eintraege)])
  const sprachen = [...new Set([...schluessel].map((s) => s.split(':')[0]))].sort()
  const suche = (o.suche ?? '').trim().toLowerCase()
  const zeilen: MehrdeutigZeile[] = []
  let klaerung = 0
  for (const s of schluessel) {
    const sp = s.split(':')[0]
    if (o.sprache && sp !== sprachKurz(o.sprache)) continue
    const e: SinnEintrag = d.eintraege[s] ?? { bedeutungen: [] }
    const lemma = s.slice(sp.length + 1)
    const fundstellen: Fundstelle[] = (fund.get(s)?.liste ?? []).map((k) => {
      const art = wortartFuer({ term: k.term, pos: k.pos, art: k.art }, k.sprache)
      const f = bedeutungFinden(e, art, k.translation)
      return {
        quelle: k.quelle ?? '',
        term: k.term,
        translation: k.translation,
        ...(k.pos ? { pos: k.pos } : {}),
        wortart: art,
        ...(f.b && f.wie !== 'einzig' ? { bedeutung: f.b.id } : {}),
        wie: f.wie
      }
    })
    const gruende: MehrdeutigZeile['gruende'] = []
    if (e.bedeutungen.length > 1 && e.bedeutungen.some((b) => !b.geprueft)) gruende.push('mehrere')
    if (e.offen?.length) gruende.push('offen')
    if (e.klaeren) gruende.push('klaeren')
    if (fundstellen.some((f) => f.wie === 'einzig')) gruende.push('vorlaeufig')
    if (fundstellen.some((f) => f.wie === 'mehrdeutig')) gruende.push('ungeklaert')
    // Von Hand geklärt: keine Gründe mehr (21.10.2026)
    if (e.vonHand) gruende.length = 0
    if (gruende.length) klaerung++
    const bildDa = (b: MedienBedeutung): boolean => Boolean(bildDerStufe(b, stufe)) || Boolean(b.ohneBild?.includes(stufe))
    const passt =
      o.filter === 'alle'
        ? true
        : o.filter === 'geprueft'
          ? Boolean(e.vonHand) || (e.bedeutungen.length > 0 && e.bedeutungen.every((b) => b.geprueft))
          : o.filter === 'ohneBild'
            ? !e.bedeutungen.length || e.bedeutungen.some((b) => !bildDa(b))
            : gruende.length > 0
    if (!passt) continue
    if (
      suche &&
      !lemma.toLowerCase().includes(suche) &&
      !e.bedeutungen.some((b) => b.deutsch.toLowerCase().includes(suche)) &&
      !fundstellen.some((f) => f.translation.toLowerCase().includes(suche) || f.term.toLowerCase().includes(suche))
    )
      continue
    zeilen.push({
      schluessel: s,
      sprache: sp,
      lemma,
      fundstellen,
      bedeutungen: [],
      offen: [],
      ...(e.klaeren ? { klaeren: true as const } : {}),
      ...(e.vonHand ? { vonHand: e.vonHand } : {}),
      gruende
    })
  }
  const sammler = new Intl.Collator('de', { sensitivity: 'base', numeric: true })
  zeilen.sort((a, b) => sammler.compare(a.lemma, b.lemma) || a.sprache.localeCompare(b.sprache))
  const seite = Math.max(0, Math.round(o.seite ?? 0))
  // `alle`: jede Zeile, ohne Bilder (für „Alle geklärt")
  if (alle) return { zeilen, gesamt: zeilen.length, sprachen, klaerung }
  const teil = zeilen.slice(seite * jeSeite, seite * jeSeite + jeSeite)
  // Bilder nur für die gezeigte Seite (als data-URL – die Exe hat keine Dateiadressen)
  for (const z of teil) {
    const e: SinnEintrag = d.eintraege[z.schluessel] ?? { bedeutungen: [] }
    z.bedeutungen = e.bedeutungen.map((b) => {
      const gefunden = b.ohneBild?.includes(stufe) ? undefined : stufenReihe(stufe).find((x) => bildDerStufe(b, x))
      const bild = gefunden ? bildDerStufe(b, gefunden) : undefined
      return {
        id: b.id,
        wortart: b.wortart,
        deutsch: b.deutsch,
        varianten: b.varianten,
        ...(b.geprueft ? { geprueft: b.geprueft } : {}),
        bild: {
          ...(bild ? { bild: { ...bild, dataUrl: dataUrlVon(bild.datei) }, bildStufe: gefunden } : {}),
          ...(b.ohneBild?.length ? { ohneBild: b.ohneBild } : {}),
          bedeutung: { id: b.id, deutsch: b.deutsch, wortart: b.wortart }
        }
      }
    })
    z.offen = (e.offen ?? []).map((x) => ({ datei: x.datei, stufe: x.stufe, wortarten: x.wortarten, dataUrl: dataUrlVon(x.datei) }))
  }
  return { zeilen: teil, gesamt: zeilen.length, sprachen, klaerung }
}

const istStufeWert = (s: unknown): s is Bildstufe => BILDSTUFEN.includes(s as Bildstufe)
