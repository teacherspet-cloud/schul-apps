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
  medienSchluessel,
  satzSchluessel,
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
function aendern(schluessel: string, fn: (e: MedienEintrag) => MedienEintrag | null): void {
  const i = lies<Record<string, MedienEintrag>>(indexDatei(), {})
  const neu = fn(i[schluessel] ?? {})
  const leer =
    !neu ||
    (!neu.bild &&
      !Object.keys(neu.bildStufen ?? {}).length &&
      !neu.ohneBild?.length &&
      !neu.ton &&
      !neu.tonM &&
      !Object.keys(neu.saetze ?? {}).length &&
      !Object.keys(neu.saetzeM ?? {}).length)
  if (!neu || leer) delete i[schluessel]
  else i[schluessel] = neu
  schreibe(indexDatei(), i)
  zwischen = null
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
  for (const w of woerter.slice(0, 2000)) {
    const e = i[medienSchluessel(sprache, w)]
    if (!e) continue
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
  aendern(medienSchluessel(sprache, wort), (e) => {
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
  aendern(medienSchluessel(sprache, wort), (e) => ({ ...e, ohneBild: [...new Set([...(e.ohneBild ?? []), stufe])] }))
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
  aendern(medienSchluessel(sprache, wort), (e) => {
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
  aendern(medienSchluessel(sprache, wort), (e) => {
    if (art === 'wort') {
      weg(e[tonFeld]?.datei)
      return { ...e, [tonFeld]: ton }
    }
    const k = satzSchluessel(t.text)
    weg(e[satzFeld]?.[k]?.datei)
    return { ...e, [satzFeld]: { ...(e[satzFeld] ?? {}), [k]: ton } }
  })
  return ton
}

export function tonLoeschen(sprache: string, wort: string, art: TonArt, satz?: string, lage: Stimmlage = 'w'): void {
  const tonFeld = lage === 'm' ? 'tonM' : 'ton'
  const satzFeld = lage === 'm' ? 'saetzeM' : 'saetze'
  aendern(medienSchluessel(sprache, wort), (e) => {
    if (art === 'wort') {
      weg(e[tonFeld]?.datei)
      const rest = { ...e }
      delete rest[tonFeld]
      return rest
    }
    const k = satzSchluessel(satz ?? '')
    weg(e[satzFeld]?.[k]?.datei)
    const saetze = { ...(e[satzFeld] ?? {}) }
    delete saetze[k]
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
