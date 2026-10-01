/**
 * WebDAV-Zugriff auf IServ (01.10.2026) – PROPFIND, MKCOL, PUT über einen austauschbaren Abrufer.
 *
 * Am PC ruft Node `fetch` ab, auf dem iPad die native HTTP-Schicht von Capacitor (kein CORS,
 * Körper als Base64), im Prüf-Build des Browsers das normale `fetch` (Fake-Server mit CORS).
 * Deshalb kennt dieser Teil nur `DavAbruf` – die Umgebung des Geräts liefert ihn (main/kanaele.ts).
 *
 * Fehler kommen als `IservFehler` mit Art und einer Meldung, die die Lehrkraft versteht:
 * Anmeldung fehlgeschlagen (401), WebDAV nicht freigeschaltet (404/405/HTML statt Multi-Status),
 * keine Verbindung (Netz), Speicher voll (507).
 */
import { davUrl, iservKandidaten, inhaltstyp, leseMultistatus, pfadTeile, type DavEintrag } from '@shared/iserv'
import { freierDateiname } from '@shared/dateiname'

export interface DavAnfrage {
  methode: 'PROPFIND' | 'MKCOL' | 'PUT'
  url: string
  kopf: Record<string, string>
  /** Text (PROPFIND) oder Bytes (PUT) */
  koerper?: string | Uint8Array
}

export interface DavAntwort {
  status: number
  text: string
}

/** Eine Anfrage absetzen; wirft bei Netzfehlern (keine Antwort) */
export type DavAbruf = (a: DavAnfrage) => Promise<DavAntwort>

export type IservFehlerArt = 'anmeldung' | 'nicht-freigeschaltet' | 'netz' | 'voll' | 'verboten' | 'unbekannt'

export class IservFehler extends Error {
  constructor(
    public art: IservFehlerArt,
    meldung: string
  ) {
    super(meldung)
    this.name = 'IservFehler'
  }
}

export const MELDUNG: Record<IservFehlerArt, string> = {
  anmeldung: 'IServ: Anmeldung fehlgeschlagen – Benutzername oder Passwort stimmen nicht (Benutzername meist vorname.nachname).',
  'nicht-freigeschaltet': 'IServ: WebDAV ist an der Schule nicht freigeschaltet (Modul „WebDAV“) – oder die Adresse der Schule stimmt nicht.',
  netz: 'IServ: keine Verbindung – Netz oder Adresse der Schule prüfen.',
  voll: 'IServ: Der Speicherplatz auf IServ ist voll.',
  verboten: 'IServ: In diesen Ordner darf dieses Konto nicht schreiben.',
  unbekannt: 'IServ: Der Server hat unerwartet geantwortet.'
}

const PROPFIND_KOERPER =
  '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/></d:prop></d:propfind>'

/** Basic-Anmeldung; Benutzername und Passwort als UTF-8 (Umlaute im Passwort) */
export function basicKopf(benutzer: string, passwort: string): string {
  const bytes = new TextEncoder().encode(`${benutzer}:${passwort}`)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return `Basic ${btoa(s)}`
}

function fehlerAus(status: number): IservFehler {
  if (status === 401) return new IservFehler('anmeldung', MELDUNG.anmeldung)
  if (status === 403) return new IservFehler('verboten', MELDUNG.verboten)
  if (status === 507) return new IservFehler('voll', MELDUNG.voll)
  if (status === 404 || status === 405 || status === 501) return new IservFehler('nicht-freigeschaltet', MELDUNG['nicht-freigeschaltet'])
  return new IservFehler('unbekannt', `${MELDUNG.unbekannt} (Status ${status})`)
}

export interface IservZugang {
  abruf: DavAbruf
  /** WebDAV-Adresse mit Schrägstrich am Ende */
  basis: string
  benutzer: string
  passwort: string
}

/** Eine Anfrage mit Anmeldung; Netzfehler werden zu „keine Verbindung" */
async function anfrage(z: IservZugang, a: Omit<DavAnfrage, 'kopf'> & { kopf?: Record<string, string> }): Promise<DavAntwort> {
  if (!/^https:\/\//i.test(a.url)) throw new IservFehler('netz', 'IServ: nur verschlüsselte Verbindungen (https).')
  try {
    return await z.abruf({ ...a, kopf: { Authorization: basicKopf(z.benutzer, z.passwort), ...(a.kopf ?? {}) } })
  } catch (e) {
    if (e instanceof IservFehler) throw e
    throw new IservFehler('netz', MELDUNG.netz)
  }
}

/** Ordnerinhalt (Depth 1); `teile` = Pfad unterhalb der Basis */
export async function liste(z: IservZugang, teile: string[]): Promise<DavEintrag[]> {
  const url = davUrl(z.basis, teile, true)
  const r = await anfrage(z, {
    methode: 'PROPFIND',
    url,
    kopf: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
    koerper: PROPFIND_KOERPER
  })
  if (r.status !== 207) throw fehlerAus(r.status)
  // Eine HTML-Seite mit 207 gibt es nicht – eine ohne Multi-Status ist kein WebDAV
  if (!/multistatus/i.test(r.text)) throw new IservFehler('nicht-freigeschaltet', MELDUNG['nicht-freigeschaltet'])
  return leseMultistatus(r.text, z.basis, teile)
}

/** Gibt es den Eintrag schon? (PROPFIND Depth 0) */
export async function existiert(z: IservZugang, teile: string[]): Promise<boolean> {
  const r = await anfrage(z, {
    methode: 'PROPFIND',
    url: davUrl(z.basis, teile),
    kopf: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
    koerper: PROPFIND_KOERPER
  })
  if (r.status === 207) return true
  if (r.status === 404) return false
  throw fehlerAus(r.status)
}

/**
 * Den Ordner samt Elternordnern anlegen, von oben nach unten. Die beiden Freigaben (Home,
 * Groups und je Gruppe) legt niemand an – deren Fehlen ist ein Fehler, kein Anlass für MKCOL.
 */
export async function ordnerSicherstellen(z: IservZugang, teile: string[]): Promise<void> {
  const fest = (teile[0] ?? '').toLowerCase() === 'groups' ? 2 : 1
  for (let i = fest + 1; i <= teile.length; i++) {
    const r = await anfrage(z, { methode: 'MKCOL', url: davUrl(z.basis, teile.slice(0, i), true) })
    // 201 angelegt, 405 gibt es schon
    if (r.status === 201 || r.status === 405 || r.status === 200 || r.status === 204) continue
    if (r.status === 409) throw new IservFehler('unbekannt', `IServ: Der Ordner „${teile.slice(0, i - 1).join('/')}“ fehlt.`)
    throw fehlerAus(r.status)
  }
}

/**
 * Datei hochladen – nie überschreiben: Gibt es den Namen schon, wird es „Name (2).pdf" usw.
 * Liefert den Pfad (Teile) der gespeicherten Datei.
 */
export async function hochladen(z: IservZugang, ordner: string[], name: string, daten: Uint8Array): Promise<string[]> {
  await ordnerSicherstellen(z, ordner)
  const vorhanden = new Set((await liste(z, ordner)).map((e) => e.name.toLowerCase()))
  const sauber = name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Datei'
  let frei = freierDateiname(sauber, (x) => vorhanden.has(x.toLowerCase()))
  // Sicherheitshalber noch einmal einzeln fragen (die Liste kann gekürzt sein)
  for (let n = 0; n < 50 && (await existiert(z, [...ordner, frei])); n++) {
    vorhanden.add(frei.toLowerCase())
    frei = freierDateiname(sauber, (x) => vorhanden.has(x.toLowerCase()))
  }
  const ziel = [...ordner, frei]
  const r = await anfrage(z, { methode: 'PUT', url: davUrl(z.basis, ziel), kopf: { 'Content-Type': inhaltstyp(frei) }, koerper: daten })
  if (r.status !== 201 && r.status !== 204 && r.status !== 200) throw fehlerAus(r.status)
  return ziel
}

/**
 * Die WebDAV-Adresse der Schule finden und die Anmeldung prüfen: die Kandidaten der Reihe nach
 * (webdav.<domain>, <domain>/webdav). Eine 401 bricht sofort ab – die Adresse stimmt, die
 * Zugangsdaten nicht. Liefert die Basis und die oberste Ebene (Home, Groups).
 */
export async function verbindungFinden(
  abruf: DavAbruf,
  schule: string,
  benutzer: string,
  passwort: string
): Promise<{ basis: string; wurzel: DavEintrag[] }> {
  const kandidaten = iservKandidaten(schule)
  if (!kandidaten.length) throw new IservFehler('netz', 'IServ: Die Adresse der Schule ist so nicht verwendbar (z. B. meineschule.de).')
  if (!benutzer.trim() || !passwort) throw new IservFehler('anmeldung', 'IServ: Benutzername und Passwort fehlen.')
  let letzter: IservFehler | null = null
  for (const basis of kandidaten) {
    try {
      const wurzel = await liste({ abruf, basis, benutzer: benutzer.trim(), passwort }, [])
      return { basis, wurzel }
    } catch (e) {
      const f = e instanceof IservFehler ? e : new IservFehler('unbekannt', MELDUNG.unbekannt)
      if (f.art === 'anmeldung') throw f
      // „keine Verbindung" zur ersten Form heißt oft nur: diese Form gibt es hier nicht
      letzter = letzter && letzter.art !== 'netz' ? letzter : f
    }
  }
  // Antwortete eine Form, aber ohne WebDAV, ist das aussagekräftiger als ein Netzfehler
  throw letzter ?? new IservFehler('nicht-freigeschaltet', MELDUNG['nicht-freigeschaltet'])
}

export { pfadTeile }
