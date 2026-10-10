/**
 * Medienbank der Vokabeln – Ablage (05.10.2026, Typen und Schlüssel: shared/medienbank.ts).
 *
 *   <Wurzel>/index.json      { "en:park": { bild, ton, saetze, tonM, saetzeM } }  (M = männliche Fassung)
 *   <Wurzel>/stimmen.json    Standardstimmen je Sprache { "en": { "w": "<voiceId>", "m": "<voiceId>" } }
 *   <Wurzel>/dateien/<24 Hex>.jpg|png|mp3
 *
 * Wurzel: am Server <DATEN>/medienbank – EINMAL für alle (app.getPath('userData') zeigt dort auf den Ordner
 * der anfragenden Person, deshalb hier der Datenordner aus der Umgebung); in der Exe userData/medienbank.
 * Kein personenbezogener Inhalt: Wörter, Bilder, Aussprache.
 */
import { app } from 'electron'
import { randomBytes } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
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
    !Object.keys(e.saetzeM ?? {}).length)

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
  woerter: string[],
  opts: { mitBildern?: boolean; basisUrl?: string; lage?: Stimmlage; stufe?: Bildstufe } = {}
): Record<string, MedienSicht> {
  const stufe = opts.stufe ?? 's2'
  const i = index()
  const aus: Record<string, MedienSicht> = {}
  const umziehenNach = new Set<string>()
  for (const w of woerter.slice(0, 2000)) {
    const f = finde(i, sprache, w)
    if (!f) continue
    if (f.verschieben) umziehenNach.add(medienSchluessel(sprache, w))
    const e0 = i[f.schluessel]
    // Sätze unter ihren vereinheitlichten Schlüsseln – so finden die Seiten sie mit `satzSchluessel` (10.10.2026)
    const e: MedienEintrag = { ...e0, saetze: saetzeKanon(e0.saetze), saetzeM: saetzeKanon(e0.saetzeM) }
    const url = (d: string): string | undefined => (opts.basisUrl ? `${opts.basisUrl}${d}` : undefined)
    const mitUrl = (t: MedienTon): MedienTon & { url?: string } => ({ ...t, ...(opts.basisUrl ? { url: url(t.datei) } : {}) })
    const saetzeMitUrl = (s: Record<string, MedienTon> | undefined): Record<string, MedienTon & { url?: string }> | undefined =>
      s && Object.keys(s).length ? Object.fromEntries(Object.entries(s).map(([k, t]) => [k, mitUrl(t)])) : undefined
    /*
     * Bildstufen (07.10.2026): das Bild der eigenen Stufe, sonst das der nächstliegenden. Für eine Stufe, in der die
     * KI kein eindeutiges Bild sieht (abstrakte Wörter für Jüngere), bleibt das Bild leer.
     */
    const gefunden = e.ohneBild?.includes(stufe) ? undefined : stufenReihe(stufe).find((s) => bildDerStufe(e, s))
    const b = gefunden ? bildDerStufe(e, gefunden) : undefined
    const bildTeil: Partial<MedienSicht> = b
      ? { bild: { ...b, ...(opts.basisUrl ? { url: url(b.datei) } : opts.mitBildern ? { dataUrl: dataUrlVon(b.datei) } : {}) }, bildStufe: gefunden }
      : {}
    /*
     * Lernende (07.10.2026): nur ihre Fassung, gleich aufgelöst – `ton`/`saetze` sind die bevorzugte Fassung,
     * wo sie fehlt, die andere. Ohne `lage` (Lehrkraft) kommen beide Fassungen.
     */
    if (opts.lage) {
      const andere: Stimmlage = opts.lage === 'w' ? 'm' : 'w'
      const ton = tonVon(e, opts.lage) ?? tonVon(e, andere)
      const saetze = saetzeMitUrl({ ...(saetzeVon(e, andere) ?? {}), ...(saetzeVon(e, opts.lage) ?? {}) })
      aus[w] = {
        ...bildTeil,
        ...(ton ? { ton: mitUrl(ton) } : {}),
        ...(saetze ? { saetze } : {})
      }
      continue
    }
    const saetzeM = saetzeMitUrl(e.saetzeM)
    const da = BILDSTUFEN.filter((s) => bildDerStufe(e, s))
    aus[w] = {
      ...(e.tonM ? { tonM: mitUrl(e.tonM) } : {}),
      ...(saetzeM ? { saetzeM } : {}),
      ...bildTeil,
      ...(da.length ? { bildStufenDa: da } : {}),
      ...(e.ohneBild?.length ? { ohneBild: e.ohneBild } : {}),
      ...(e.ton ? { ton: { ...e.ton, ...(opts.basisUrl ? { url: url(e.ton.datei) } : {}) } } : {}),
      ...(e.saetze && Object.keys(e.saetze).length
        ? { saetze: Object.fromEntries(Object.entries(e.saetze).map(([k, t]) => [k, { ...t, ...(opts.basisUrl ? { url: url(t.datei) } : {}) }])) }
        : {})
    }
  }
  if (umziehenNach.size) umziehen(umziehenNach)
  return aus
}

/** Datei als data-URL (Ton abspielen, Bild groß) */
export const medienDatei = (datei: string): string | null => dataUrlVon(datei) ?? null

export function bildSetzen(
  sprache: string,
  wort: string,
  b: { dataUrl: string; herkunft: 'suche' | 'ki'; nachweis: string; kandidaten?: MedienKandidat[] },
  stufe: Bildstufe = 's2'
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
    zeit: Date.now()
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
export function ohneBildMerken(sprache: string, wort: string, stufe: Bildstufe): void {
  aendern(sprache, wort, (e) => ({ ...e, ohneBild: [...new Set([...(e.ohneBild ?? []), stufe])] }))
}

function bereinigeKandidaten(k: MedienKandidat[]): MedienKandidat[] {
  const t = (x: unknown, n = 300): string => String(x ?? '').slice(0, n)
  return k
    .filter((x) => /^https:\/\//.test(String(x?.url ?? '')) || (String(x?.url ?? '').startsWith('data:image/') && String(x.url).length < 4000))
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

export function bildLoeschen(sprache: string, wort: string, stufe: Bildstufe = 's2'): void {
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
  t: { dataUrl: string; stimme: string; text: string; gesprochen?: string },
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
  const tonFeld = lage === 'm' ? 'tonM' : 'ton'
  const satzFeld = lage === 'm' ? 'saetzeM' : 'saetze'
  aendern(sprache, wort, (e) => {
    if (art === 'wort') {
      weg(e[tonFeld]?.datei)
      return { ...e, [tonFeld]: ton }
    }
    // Ersetzt wird die Aufnahme dieses Satzes in jeder Schreibweise („it’s" = „it's", 10.10.2026)
    const k = satzSchluessel(t.text)
    const saetze = { ...(e[satzFeld] ?? {}) }
    for (const [alt, x] of Object.entries(saetze))
      if (satzSchluessel(alt) === k) {
        weg(x.datei)
        delete saetze[alt]
      }
    return { ...e, [satzFeld]: { ...saetze, [k]: ton } }
  })
  medienGeaendert()
  return ton
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
      const rest = { ...e }
      delete rest[tonFeld]
      return rest
    }
    const k = satzSchluessel(satz ?? '')
    const saetze = { ...(e[satzFeld] ?? {}) }
    for (const [alt, x] of Object.entries(saetze))
      if (satzSchluessel(alt) === k) {
        weg(x.datei)
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
