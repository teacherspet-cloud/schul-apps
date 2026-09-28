/**
 * Sicherung und Zurücksetzen auf den Werkszustand.
 *
 * Wunsch der Lehrkraft (25.09.2026): „Füge bei Einstellungen einen ‚Zurücksetzen' Button an
 * einer passenden Stelle hinzu, mit dem man nach einer Warnung alle Einstellungen und Inhalte,
 * die bisher erstellt wurden, löscht und die Hauptapp auf Werkszustand zurücksetzt."
 *
 * WAS ERHALTEN BLEIBT – und warum das hier steht und nicht in einer Liste weiter unten:
 *
 * Auf Nachfrage ausdrücklich ergänzt (25.09.2026): „die vokabellisten und lehrwerke sollen auch
 * bei zurücksetzen unbedingt erhalten bleiben!" Beide liegen im Ordner `lehrwerke`. Das sind
 * Bestände, die über Jahre wachsen und sich nicht wiederbeschaffen lassen – anders als ein
 * Arbeitsblatt, das neu erzeugt werden kann. Wer diesen Ordner einmal versehentlich in die
 * Löschliste schreibt, vernichtet die Arbeit mehrerer Schuljahre.
 *
 * Deshalb arbeitet dieses Modul mit einer AUSNAHMELISTE statt mit einer Löschliste: Gelöscht
 * wird, was nicht ausdrücklich geschützt ist – aber der Ordner `lehrwerke` steht in der
 * Ausnahmeliste, und ein Test hält das fest.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'fs'
import { writeAtomic } from './atomar'
import { join } from 'path'
import { pruefeThemen, type ThemenDaten } from '@shared/themen'

/**
 * Was das Zurücksetzen NICHT anfasst.
 *
 * - `lehrwerke`: Vokabellisten und Schulbücher – ausdrücklicher Wunsch der Lehrkraft.
 * - Die übrigen Einträge gehören Electron selbst (Zwischenspeicher, Sitzungsdaten). Sie zu
 *   löschen, während das Programm läuft, bringt nichts und kann es zum Absturz bringen; beim
 *   nächsten Start legt Electron sie ohnehin neu an.
 */
export const GESCHUETZT = [
  'lehrwerke',
  // Vokabel-Bibliothek (eigene Listen) und Maskottchen: wachsen über Jahre wie die Lehrwerke
  'vocab-library.json',
  'maskottchen',
  // Automatische Sicherungen (27.09.2026) – ein Zurücksetzen darf sie nicht mitnehmen
  'sicherungen',
  'protokoll.log',
  'protokoll.1.log',
  'verbrauch.json',
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'blob_storage',
  'Local Storage',
  'Session Storage',
  'Network',
  'Shared Dictionary',
  'DIPS',
  'Local State',
  'Preferences',
  'DevToolsActivePort'
]

/** Ordner mit Material, das die Lehrkraft erzeugt hat. */
const MATERIAL = [
  'arbeitsblaetter',
  'vokabeltests',
  'klassenarbeiten',
  'grammatiktests',
  'lernzielkontrollen',
  'rueckmeldungen',
  'elternbriefe',
  'piktogramme',
  'hoertexte'
]

/**
 * Nur sichern, nie zurücksetzen (27.09.2026): Bis dahin standen Lehrwerke, Vokabel-Bibliothek und
 * Maskottchen in KEINER Sicherung – ausgerechnet die Bestände, die sich nicht neu erzeugen lassen.
 * Ordner werden mit Unterordnern gesichert (Maskottchen liegen je Figur in einem eigenen Ordner).
 */
export const NUR_SICHERN_ORDNER = ['lehrwerke', 'maskottchen']
export const NUR_SICHERN_DATEIEN = ['vocab-library.json']

/** Alle Ordner und Dateien, die in eine Sicherung gehören – Grundlage auch für den Vollständigkeitstest */
export const SICHERUNG_ORDNER = (): string[] => [...MATERIAL, ...NUR_SICHERN_ORDNER]
export const SICHERUNG_DATEIEN = (): string[] => [...DATEIEN.filter((d) => d !== 'secrets.json'), ...NUR_SICHERN_DATEIEN]

/** Einzelne Dateien mit Einstellungen und Zugängen. */
const DATEIEN = [
  'settings.json',
  'secrets.json',
  'logo.png',
  'worksheet-designs.json',
  'worksheet-designs-version.json',
  'model-cache.json',
  // Themenbereiche und die Zuordnung der Materialien (Paket 10b) – ohne sie käme nach dem
  // Einlesen alles Material ungeordnet zurück
  'themenbereiche.json'
]

const userData = (): string => app.getPath('userData')

/** Was beim Zurücksetzen verschwinden würde – für die Warnung, bevor etwas geschieht. */
export function bestand(): { ordner: string; eintraege: number }[] {
  const wurzel = userData()
  return MATERIAL.filter((d) => existsSync(join(wurzel, d)))
    .map((d) => ({ ordner: d, eintraege: readdirSync(join(wurzel, d)).filter((f) => f.endsWith('.json') || f.endsWith('.mp3') || f.endsWith('.png')).length }))
    .filter((e) => e.eintraege > 0)
}

/**
 * Eine Sicherung als eine einzige Datei.
 *
 * Bewusst JSON und kein Archiv: Die App hat keine eigene Zip-Bibliothek, und eine indirekte
 * Abhängigkeit dafür zu benutzen wäre eine stille Fußangel für den Tag, an dem sie wegfällt.
 * Binärdateien (Logo, Hörtexte) stehen als Base64 darin.
 *
 * Die ZUGÄNGE bleiben draußen. `secrets.json` liegt auf der Platte verschlüsselt; in einer
 * Sicherungsdatei stünde der Schlüssel im Klartext und wanderte mit ihr auf jeden USB-Stick.
 */
export function sicherung(): { name: string; daten: Uint8Array } {
  const wurzel = userData()
  const inhalt: Record<string, unknown> = { version: 2, erstellt: new Date().toISOString() }

  for (const ordner of SICHERUNG_ORDNER()) {
    const pfad = join(wurzel, ordner)
    if (!existsSync(pfad)) continue
    const dateien: Record<string, string> = {}
    sammle(pfad, '', dateien)
    if (Object.keys(dateien).length) inhalt[ordner] = dateien
  }

  for (const datei of SICHERUNG_DATEIEN()) {
    const pfad = join(wurzel, datei)
    if (existsSync(pfad)) inhalt[datei] = readFileSync(pfad).toString('base64')
  }

  const tag = new Date().toISOString().slice(0, 10)
  return { name: `Schul-Apps Sicherung ${tag}.json`, daten: new TextEncoder().encode(JSON.stringify(inhalt)) }
}

/** Dateien eines Ordners samt Unterordnern (eine Ebene tief genügt für Maskottchen; hier allgemein) */
function sammle(pfad: string, praefix: string, ziel: Record<string, string>): void {
  for (const name of readdirSync(pfad)) {
    if (name.endsWith('.tmp')) continue
    const voll = join(pfad, name)
    const st = statSync(voll)
    if (st.isDirectory()) sammle(voll, `${praefix}${name}/`, ziel)
    else if (st.isFile()) ziel[`${praefix}${name}`] = readFileSync(voll).toString('base64')
  }
}

/** Ein Pfad aus einer Sicherung: nur schlichte Namen, höchstens mit „/" getrennt – nie „..", nie absolut */
export function sichererRelPfad(name: string): string[] | null {
  if (!name || name.includes('\\') || name.startsWith('/')) return null
  const teile = name.split('/')
  if (teile.some((t) => !t || t === '.' || t === '..' || t.includes(':'))) return null
  return teile
}

/**
 * Setzt auf den Werkszustand zurück.
 *
 * Gelöscht wird nur, was in `MATERIAL` und `DATEIEN` steht – und zusätzlich wird gegen
 * `GESCHUETZT` geprüft. Diese doppelte Sicherung ist Absicht: Ein Tippfehler in einer der
 * Listen soll nicht ausreichen, um die Lehrwerke zu löschen.
 */
export function werkszustand(): { geloescht: string[] } {
  const wurzel = userData()
  const geloescht: string[] = []

  for (const name of [...MATERIAL, ...DATEIEN]) {
    if (GESCHUETZT.includes(name)) continue
    const pfad = join(wurzel, name)
    if (!existsSync(pfad)) continue
    rmSync(pfad, { recursive: true, force: true })
    geloescht.push(name)
  }

  // Die Materialordner wieder anlegen, damit die Programme nicht über fehlende Ordner stolpern
  for (const ordner of MATERIAL) mkdirSync(join(wurzel, ordner), { recursive: true })
  return { geloescht }
}

/** Liest eine Sicherungsdatei – und weist alles ab, was keine ist. */
function lies(daten: Uint8Array): Record<string, unknown> {
  let inhalt: unknown
  try {
    inhalt = JSON.parse(new TextDecoder().decode(daten))
  } catch {
    throw new Error('Die Datei ist keine Sicherung von Schul-Apps (kein lesbares JSON).')
  }
  const version = (inhalt as { version?: unknown } | null)?.version
  if (!inhalt || typeof inhalt !== 'object' || (version !== 1 && version !== 2))
    throw new Error('Die Datei ist keine Sicherung von Schul-Apps oder stammt aus einer unbekannten Version.')
  return inhalt as Record<string, unknown>
}

/**
 * Was eine Sicherung enthält – für die Rückfrage, BEVOR etwas geschrieben wird.
 *
 * Wunsch der Lehrkraft (25.09.2026): das Wiederherstellen nachholen, das beim Zurücksetzen
 * zunächst auf „später“ gestellt war. Wie beim Zurücksetzen gilt: Wer liest, was genau
 * zurückkommt, entscheidet besser als bei einem allgemeinen Satz.
 */
export function pruefeSicherung(daten: Uint8Array): { erstellt: string; ordner: { ordner: string; eintraege: number }[]; dateien: string[] } {
  const inhalt = lies(daten)
  const ordner = SICHERUNG_ORDNER()
    .filter((o) => inhalt[o] && typeof inhalt[o] === 'object')
    .map((o) => ({ ordner: o, eintraege: Object.keys(inhalt[o] as Record<string, string>).length }))
    .filter((e) => e.eintraege > 0)
  const dateien = SICHERUNG_DATEIEN().filter((d) => typeof inhalt[d] === 'string')
  return { erstellt: typeof inhalt.erstellt === 'string' ? inhalt.erstellt : '', ordner, dateien }
}

/**
 * Spielt eine Sicherung zurück.
 *
 * ZUSAMMENFÜHREN, nicht ersetzen: Materialien, die es schon gibt und die nicht in der Sicherung
 * stehen, bleiben liegen; gleichnamige werden überschrieben. Einstellungen und Logo kommen aus
 * der Sicherung. Die Lehrwerke stehen nie in einer Sicherung und werden nicht angefasst.
 *
 * Bisher nur für den Fall gedacht, dass jemand versehentlich zurückgesetzt hat. Der
 * Einrichtungsassistent bietet das bewusst noch nicht an (Entscheidung vom 25.09.2026:
 * „Nein, später").
 */
export function wiederherstellen(daten: Uint8Array): { wiederhergestellt: string[] } {
  const wurzel = userData()
  const inhalt = lies(daten)
  const wiederhergestellt: string[] = []

  for (const ordner of SICHERUNG_ORDNER()) {
    const dateien = inhalt[ordner]
    if (!dateien || typeof dateien !== 'object') continue
    mkdirSync(join(wurzel, ordner), { recursive: true })
    for (const [name, base64] of Object.entries(dateien as Record<string, unknown>)) {
      if (typeof base64 !== 'string') continue
      // Kein Ausbruch: Ein „../" in der Sicherung dürfte nicht aus dem Ordner führen
      const teile = sichererRelPfad(name)
      if (!teile) continue
      if (teile.length > 1) mkdirSync(join(wurzel, ordner, ...teile.slice(0, -1)), { recursive: true })
      writeAtomic(join(wurzel, ordner, ...teile), Buffer.from(base64, 'base64'))
    }
    wiederhergestellt.push(ordner)
  }

  for (const datei of SICHERUNG_DATEIEN()) {
    const base64 = inhalt[datei]
    if (typeof base64 !== 'string' || !base64) continue
    if (datei === 'themenbereiche.json') {
      // Zusammenführen wie beim Material: Bereiche, die es nur hier gibt, bleiben erhalten
      writeAtomic(join(wurzel, datei), JSON.stringify(themenZusammenfuehren(join(wurzel, datei), Buffer.from(base64, 'base64').toString('utf8'))))
      wiederhergestellt.push(datei)
      continue
    }
    writeAtomic(join(wurzel, datei), Buffer.from(base64, 'base64'))
    wiederhergestellt.push(datei)
  }
  return { wiederhergestellt }
}

/**
 * Themenbereiche aus der Sicherung mit den vorhandenen zusammenführen (Paket 10b): Was in der
 * Sicherung steht, gewinnt; Bereiche und Zuordnungen, die es nur auf diesem Rechner gibt,
 * bleiben – so wie Materialien, die nicht in der Sicherung stehen.
 */
export function themenZusammenfuehren(pfad: string, ausSicherung: string): ThemenDaten {
  let hier: unknown = null
  let dort: unknown = null
  try {
    if (existsSync(pfad)) hier = JSON.parse(readFileSync(pfad, 'utf8'))
  } catch {
    hier = null
  }
  try {
    dort = JSON.parse(ausSicherung)
  } catch {
    dort = null
  }
  const a = pruefeThemen(hier)
  const b = pruefeThemen(dort)
  const bereiche = [...a.bereiche.filter((x) => !b.bereiche.some((y) => y.id === x.id)), ...b.bereiche]
  return pruefeThemen({
    version: 1,
    bereiche,
    zuordnungen: { ...a.zuordnungen, ...b.zuordnungen },
    reihenfolge: { ...a.reihenfolge, ...b.reihenfolge },
    automatik: { ...a.automatik, ...b.automatik }
  })
}
