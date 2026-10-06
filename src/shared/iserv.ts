/**
 * IServ per WebDAV – reine Funktionen (01.10.2026, recherche/iserv-webdav-2026-10-01.md).
 *
 * Wunsch der Lehrkraft: Material von der iPad-/Tablet-App direkt in die Ordner auf IServ
 * speichern. IServ bietet dafür das Modul WebDAV: https://webdav.<domain> (ältere Form
 * https://<domain>/webdav), darunter „Home" (Eigene Dateien) und „Groups" (Gruppenordner).
 *
 * Hier stehen nur Adressen, Pfade, Anzeige und das Lesen der PROPFIND-Antwort – ohne Netz und
 * ohne Dateisystem, damit PC, iPad und Tests dasselbe benutzen. Netz: main/services/iserv.
 */
import { schulmaterialTeile, SCHULMATERIAL } from './schulmaterial'
import type { AblageZiel } from './types'

/** Rückgabe eines Speicherns auf IServ – kein Pfad des Geräts, sondern „iserv:Home/Schulmaterial/…" */
export const ISERV_PRAEFIX = 'iserv:'

/** Vorgabe für das Standardziel: Eigene Dateien › Schulmaterial */
export const ISERV_STANDARD_ZIEL = `Home/${SCHULMATERIAL}`

/** Anzeigenamen der beiden Freigaben (so heißen sie im Web-Interface) */
const ANZEIGE: Record<string, string> = { home: 'Eigene Dateien', eigene: 'Eigene Dateien', groups: 'Gruppen', files: 'Dateien' }

/**
 * Die Schuladresse, wie die Lehrkraft sie einträgt („meineschule.de", „https://meineschule.de/iserv",
 * „webdav.meineschule.de") → nur der Rechnername, klein. '' bei Unbrauchbarem. `http://` wird
 * abgelehnt (Passwort ginge im Klartext) – das meldet `iservAdressFehler`.
 */
export function iservDomain(eingabe: string): string {
  let s = String(eingabe ?? '')
    .trim()
    .toLowerCase()
  if (!s || /^http:\/\//.test(s)) return ''
  s = s.replace(/^https:\/\//, '').replace(/^[a-z]+:\/\//, '')
  s = s.split(/[/?#]/)[0].replace(/:443$/, '').replace(/\.$/, '')
  if (s.startsWith('webdav.')) s = s.slice('webdav.'.length)
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return ''
  return s
}

/** Warum die Adresse nicht taugt – null, wenn sie taugt */
export function iservAdressFehler(eingabe: string): string | null {
  const s = String(eingabe ?? '').trim()
  if (!s) return 'Die Adresse der Schule fehlt (z. B. meineschule.de).'
  if (/^http:\/\//i.test(s)) return 'Nur verschlüsselte Verbindungen (https) – das Passwort ginge sonst offen durchs Netz.'
  if (!iservDomain(s)) return 'Die Adresse ist so nicht verwendbar – gemeint ist die IServ-Adresse der Schule, z. B. meineschule.de.'
  return null
}

/** Die WebDAV-Adressen, die die App der Reihe nach probiert (immer mit Schrägstrich am Ende) */
export function iservKandidaten(eingabe: string): string[] {
  const d = iservDomain(eingabe)
  if (!d) return []
  return [`https://webdav.${d}/`, `https://${d}/webdav/`]
}

/** Pfad („Home/Schulmaterial") ↔ Teile; leere Teile und „.."/„." fallen weg */
export function pfadTeile(pfad: string | string[] | undefined): string[] {
  const teile = Array.isArray(pfad) ? pfad : String(pfad ?? '').split('/')
  return teile.map((t) => t.trim()).filter((t) => t && t !== '.' && t !== '..')
}

/** Adresse eines Eintrags: Basis + jeder Teil einzeln kodiert; Ordner mit Schrägstrich am Ende */
export function davUrl(basis: string, teile: string[], ordner = false): string {
  const b = basis.endsWith('/') ? basis : `${basis}/`
  const rest = teile.map((t) => encodeURIComponent(t)).join('/')
  return b + rest + (ordner && rest ? '/' : '')
}

/** Ordner für eine Datei: Standardziel + Fach + Themenbereich (wie die Ablage auf dem iPad) */
export function iservOrdnerFuer(standardZiel: string | undefined, ziel: AblageZiel): string[] {
  // Fester Ordner (Ablagestruktur der Verwaltung aus „Meine Klassen")
  if (ziel.iservPfad?.length) return pfadTeile(ziel.iservPfad)
  const basis = pfadTeile(standardZiel || ISERV_STANDARD_ZIEL)
  return [...basis, ...schulmaterialTeile(ziel)]
}

/** Name eines Teils für die Anzeige (Home → Eigene Dateien) */
export const anzeigeTeil = (teil: string, ebene: number): string => (ebene === 0 ? (ANZEIGE[teil.toLowerCase()] ?? teil) : teil)

/** „IServ › Eigene Dateien › Schulmaterial › Englisch" */
export function iservAnzeige(pfad: string | string[]): string {
  const roh = Array.isArray(pfad) ? pfad : pfad.startsWith(ISERV_PRAEFIX) ? pfad.slice(ISERV_PRAEFIX.length) : pfad
  return ['IServ', ...pfadTeile(roh).map(anzeigeTeil)].join(' › ')
}

export const istIservPfad = (pfad: unknown): boolean => typeof pfad === 'string' && pfad.startsWith(ISERV_PRAEFIX)

/** Liegt der Pfad in einem Gruppenordner (dort lesen oft viele mit)? */
export const inGruppenordner = (teile: string[]): boolean => istGruppenWurzel(teile[0] ?? '')

/**
 * Die oberste Ebene heißt nicht überall gleich (gemeldet 03.10.2026): je nach IServ-Version und
 * Sprache „Home"/„Groups", „Eigene"/„Gruppen" oder „Files". Gespeichert wird das Ziel mit dem
 * Namen von damals – vor dem Ablegen wird der erste Teil auf den Namen umgestellt, den der Server
 * gerade zeigt.
 */
export const istGruppenWurzel = (name: string): boolean => /^(groups|gruppen)$/i.test(name.trim())
const istEigeneWurzel = (name: string): boolean => /^(home|eigene|eigene dateien|files|dateien)$/i.test(name.trim())

/** Teile mit dem ersten Teil so, wie der Server die oberste Ebene nennt (unverändert, wenn nichts passt) */
export function wurzelAngleichen(teile: string[], wurzel: string[]): string[] {
  const erster = teile[0] ?? ''
  if (!erster || wurzel.some((w) => w === erster)) return teile
  const gleich = wurzel.find((w) => w.toLowerCase() === erster.toLowerCase())
  const passend =
    gleich ??
    (istGruppenWurzel(erster)
      ? wurzel.find(istGruppenWurzel)
      : istEigeneWurzel(erster)
        ? (wurzel.find(istEigeneWurzel) ?? (wurzel.length === 2 && wurzel.some(istGruppenWurzel) ? wurzel.find((w) => !istGruppenWurzel(w)) : undefined))
        : undefined)
  return passend ? [passend, ...teile.slice(1)] : teile
}

/** Ein Eintrag aus PROPFIND */
export interface DavEintrag {
  /** Name (dekodiert) */
  name: string
  ordner: boolean
  groesse?: number
  /** Der Pfad unterhalb der Basis, Teile dekodiert */
  teile: string[]
}

const entities = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')

const dekodiere = (s: string): string => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * Die Antwort auf PROPFIND (207 Multi-Status) lesen – ohne DOMParser (am PC gibt es keinen).
 * Namensraum-Kürzel sind beliebig (d:, D:, lp1: oder keines). Der angefragte Ordner selbst
 * fällt weg; versteckte Einträge (Punkt am Anfang) auch.
 */
export function leseMultistatus(xml: string, basis: string, angefragt: string[]): DavEintrag[] {
  const basisPfad = new URL(basis).pathname.replace(/\/+$/, '')
  const eigen = pfadTeile(angefragt).join('/')
  const out: DavEintrag[] = []
  const tag = (name: string): string => `<(?:[A-Za-z][\\w.-]*:)?${name}\\b[^>]*>`
  const ende = (name: string): string => `</(?:[A-Za-z][\\w.-]*:)?${name}\\s*>`
  const antworten = xml.match(new RegExp(`${tag('response')}[\\s\\S]*?${ende('response')}`, 'g')) ?? []
  for (const a of antworten) {
    const href = new RegExp(`${tag('href')}([\\s\\S]*?)${ende('href')}`).exec(a)?.[1]?.trim()
    if (!href) continue
    let pfad = entities(href)
    try {
      pfad = new URL(pfad, basis).pathname
    } catch {
      continue
    }
    if (!pfad.startsWith(basisPfad)) continue
    const teile = pfadTeile(pfad.slice(basisPfad.length).split('/').map(dekodiere))
    if (teile.join('/') === eigen) continue
    const name = teile[teile.length - 1]
    if (!name || name.startsWith('.')) continue
    const ordner = new RegExp(`${tag('resourcetype')}[\\s\\S]*?<(?:[A-Za-z][\\w.-]*:)?collection\\b`).test(a) || /\/$/.test(href)
    const laenge = new RegExp(`${tag('getcontentlength')}\\s*(\\d+)\\s*${ende('getcontentlength')}`).exec(a)?.[1]
    out.push({ name, ordner, teile, ...(laenge ? { groesse: Number(laenge) } : {}) })
  }
  return out.sort((x, y) => Number(y.ordner) - Number(x.ordner) || x.name.localeCompare(y.name, 'de'))
}

/** Inhaltstyp nach Endung (IServ zeigt damit die Vorschau) */
export function inhaltstyp(name: string): string {
  const e = name.toLowerCase().split('.').pop() ?? ''
  const typen: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    mp3: 'audio/mpeg',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    svg: 'image/svg+xml',
    zip: 'application/zip',
    txt: 'text/plain; charset=utf-8',
    html: 'text/html; charset=utf-8',
    json: 'application/json',
    xml: 'application/xml'
  }
  return typen[e] ?? 'application/octet-stream'
}
