/**
 * IServ verbinden, Ordner zeigen und Material ablegen (01.10.2026) – für main/kanaele.ts.
 *
 * Einstellungen (Schuladresse, Benutzer, gefundene WebDAV-Adresse, Standardziel) stehen in den
 * App-Einstellungen; das Passwort NIE – es kommt über `IservGeraet.passwort` aus dem
 * Schlüsselbund des iPads bzw. verschlüsselt aus secrets.json am PC.
 */
import { ISERV_PRAEFIX, ISERV_STANDARD_ZIEL, iservAdressFehler, iservOrdnerFuer, pfadTeile, wurzelAngleichen, type DavEintrag } from '@shared/iserv'
import type { AblageZiel, IservEinstellungen } from '@shared/types'
import { getSettings, setSettings } from '../storage/settings'
import { herunterladen, hochladen, IservFehler, liste, verbindungFinden, type DavAbruf, type IservZugang } from './webdav'

/** Was je Gerät verschieden ist: der Abrufer und der Ort des Passworts */
export interface IservGeraet {
  abruf: DavAbruf
  passwort: {
    lies(): Promise<string | null>
    setze(wert: string): Promise<void>
    loesche(): Promise<void>
  }
}

export interface IservStatus {
  /** Adresse und Benutzer sind eingetragen, die Verbindung klappte einmal */
  verbunden: boolean
  schule: string
  benutzer: string
  basis: string
  /** Standardziel, z. B. „Home/Schulmaterial" */
  ziel: string
  passwortGespeichert: boolean
}

const einstellungen = (): IservEinstellungen | undefined => getSettings().iserv

export async function iservStatus(g: IservGeraet): Promise<IservStatus> {
  const e = einstellungen()
  const passwort = Boolean(await g.passwort.lies().catch(() => null))
  return {
    verbunden: Boolean(e?.basis && e.benutzer && passwort),
    schule: e?.schule ?? '',
    benutzer: e?.benutzer ?? '',
    basis: e?.basis ?? '',
    ziel: e?.ziel || ISERV_STANDARD_ZIEL,
    passwortGespeichert: passwort
  }
}

/**
 * Verbindung testen und – wenn sie klappt – merken. Ohne Passwort gilt das gespeicherte (nur
 * Benutzer/Adresse geändert). Liefert die oberste Ebene (Eigene Dateien, Gruppen).
 */
export async function iservVerbinden(
  g: IservGeraet,
  eingabe: { schule: string; benutzer: string; passwort?: string }
): Promise<{ basis: string; ordner: DavEintrag[] }> {
  const fehler = iservAdressFehler(eingabe.schule)
  if (fehler) throw new IservFehler('netz', `IServ: ${fehler}`)
  const passwort = eingabe.passwort || (await g.passwort.lies()) || ''
  const benutzer = eingabe.benutzer.trim()
  const { basis, wurzel } = await verbindungFinden(g.abruf, eingabe.schule, benutzer, passwort)
  // Erst nach erfolgreicher Anmeldung speichern – ein Tippfehler überschreibt nichts Funktionierendes
  if (eingabe.passwort) await g.passwort.setze(eingabe.passwort)
  setSettings({ iserv: { schule: eingabe.schule.trim(), benutzer, basis, ziel: einstellungen()?.ziel || ISERV_STANDARD_ZIEL } })
  return { basis, ordner: wurzel }
}

async function zugang(g: IservGeraet): Promise<IservZugang> {
  const e = einstellungen()
  const passwort = await g.passwort.lies().catch(() => null)
  if (!e?.basis || !e.benutzer || !passwort) throw new IservFehler('anmeldung', 'IServ ist noch nicht verbunden (Einstellungen › Ablage › IServ verbinden).')
  return { abruf: g.abruf, basis: e.basis, benutzer: e.benutzer, passwort }
}

/** Unterordner eines Ordners (für die Ordnerauswahl) */
export async function iservOrdner(g: IservGeraet, pfad: string | string[]): Promise<DavEintrag[]> {
  const z = await zugang(g)
  return (await liste(z, pfadTeile(pfad))).filter((e) => e.ordner)
}

/** Ordner und Dateien eines Ordners (Dateien von IServ öffnen, 02.10.2026) */
export async function iservEintraege(g: IservGeraet, pfad: string | string[]): Promise<DavEintrag[]> {
  const z = await zugang(g)
  return liste(z, pfadTeile(pfad))
}

/** Eine Datei von IServ laden – für „Datei öffnen" aus den IServ-Ordnern */
export async function iservLaden(g: IservGeraet, pfad: string | string[]): Promise<{ name: string; data: Uint8Array }> {
  const z = await zugang(g)
  const teile = pfadTeile(pfad)
  return { name: teile[teile.length - 1] ?? 'Datei', data: await herunterladen(z, teile) }
}

/** Abmelden: Passwort aus dem Schlüsselbund, WebDAV-Adresse vergessen (Schule und Benutzer bleiben zum Wiederverbinden) */
export async function iservTrennen(g: IservGeraet): Promise<void> {
  await g.passwort.loesche()
  const e = einstellungen()
  if (e) setSettings({ iserv: { ...e, basis: '' } })
}

/**
 * Eine Datei ablegen: Standardziel + Fach + Themenbereich, fehlende Ordner werden angelegt,
 * vorhandene Dateien nie überschrieben. Liefert „iserv:Home/Schulmaterial/Englisch/Test.pdf".
 */
export async function iservAblegen(g: IservGeraet, name: string, daten: Uint8Array | string, ziel: AblageZiel): Promise<string> {
  const z = await zugang(g)
  // Oberste Ebene so benennen, wie dieser Server sie nennt („Home" ↔ „Eigene", „Groups" ↔ „Gruppen")
  const ordner = wurzelAngleichen(
    iservOrdnerFuer(einstellungen()?.ziel, ziel),
    (await liste(z, [])).filter((e) => e.ordner).map((e) => e.name)
  )
  const bytes = typeof daten === 'string' ? new TextEncoder().encode(daten) : daten
  const teile = await hochladen(z, ordner, name, bytes, ziel.beiVorhanden)
  return ISERV_PRAEFIX + teile.join('/')
}
