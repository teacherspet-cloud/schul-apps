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
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import {
  MEDIEN_DATEI,
  medienSchluessel,
  satzSchluessel,
  saetzeVon,
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

const wurzel = (): string => {
  const w = process.env.SCHULAPPS_SERVER ? resolve(process.env.SCHULAPPS_DATEN || './server-daten', 'medienbank') : join(app.getPath('userData'), 'medienbank')
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
  const leer = !neu || (!neu.bild && !neu.ton && !neu.tonM && !Object.keys(neu.saetze ?? {}).length && !Object.keys(neu.saetzeM ?? {}).length)
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
  opts: { mitBildern?: boolean; basisUrl?: string; lage?: Stimmlage } = {}
): Record<string, MedienSicht> {
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
     * Lernende (07.10.2026): nur ihre Fassung, gleich aufgelöst – `ton`/`saetze` sind die bevorzugte Fassung,
     * wo sie fehlt, die andere. Ohne `lage` (Lehrkraft) kommen beide Fassungen.
     */
    if (opts.lage) {
      const andere: Stimmlage = opts.lage === 'w' ? 'm' : 'w'
      const ton = tonVon(e, opts.lage) ?? tonVon(e, andere)
      const saetze = saetzeMitUrl({ ...(saetzeVon(e, andere) ?? {}), ...(saetzeVon(e, opts.lage) ?? {}) })
      aus[w] = {
        ...(e.bild
          ? { bild: { ...e.bild, ...(opts.basisUrl ? { url: url(e.bild.datei) } : opts.mitBildern ? { dataUrl: dataUrlVon(e.bild.datei) } : {}) } }
          : {}),
        ...(ton ? { ton: mitUrl(ton) } : {}),
        ...(saetze ? { saetze } : {})
      }
      continue
    }
    const saetzeM = saetzeMitUrl(e.saetzeM)
    aus[w] = {
      ...(e.tonM ? { tonM: mitUrl(e.tonM) } : {}),
      ...(saetzeM ? { saetzeM } : {}),
      ...(e.bild
        ? { bild: { ...e.bild, ...(opts.basisUrl ? { url: url(e.bild.datei) } : opts.mitBildern ? { dataUrl: dataUrlVon(e.bild.datei) } : {}) } }
        : {}),
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
  b: { dataUrl: string; herkunft: 'suche' | 'ki'; nachweis: string; kandidaten?: MedienKandidat[] }
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
    weg(e.bild?.datei)
    // Kandidaten bleiben, wenn nur umgewählt wurde
    return { ...e, bild: { ...bild, kandidaten: bild.kandidaten ?? e.bild?.kandidaten } }
  })
  return bild
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

export function bildLoeschen(sprache: string, wort: string): void {
  aendern(medienSchluessel(sprache, wort), (e) => {
    weg(e.bild?.datei)
    const { bild: _b, ...rest } = e
    return rest
  })
}

/** `lage`: Fassung (weiblich = die bisherigen Felder) */
export function tonSetzen(sprache: string, wort: string, art: TonArt, t: { dataUrl: string; stimme: string; text: string }, lage: Stimmlage = 'w'): MedienTon {
  const { bytes, endung } = ausDataUrl(t.dataUrl)
  if (endung !== 'mp3') throw new Error('Kein MP3.')
  const datei = neueDatei('mp3')
  writeFileSync(medienDateiPfad(datei), bytes)
  const ton: MedienTon = { datei, stimme: String(t.stimme ?? '').slice(0, 120), text: String(t.text ?? '').slice(0, 600), zeit: Date.now() }
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
