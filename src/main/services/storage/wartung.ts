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
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
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
const MATERIAL = ['arbeitsblaetter', 'vokabeltests', 'klassenarbeiten', 'grammatiktests', 'lernzielkontrollen', 'piktogramme', 'hoertexte']

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
  const inhalt: Record<string, unknown> = { version: 1, erstellt: new Date().toISOString() }

  for (const ordner of MATERIAL) {
    const pfad = join(wurzel, ordner)
    if (!existsSync(pfad)) continue
    const dateien: Record<string, string> = {}
    for (const name of readdirSync(pfad)) {
      const voll = join(pfad, name)
      if (!statSync(voll).isFile()) continue
      dateien[name] = readFileSync(voll).toString('base64')
    }
    if (Object.keys(dateien).length) inhalt[ordner] = dateien
  }

  for (const datei of DATEIEN) {
    if (datei === 'secrets.json') continue
    const pfad = join(wurzel, datei)
    if (existsSync(pfad)) inhalt[datei] = readFileSync(pfad).toString('base64')
  }

  const tag = new Date().toISOString().slice(0, 10)
  return { name: `Schul-Apps Sicherung ${tag}.json`, daten: new TextEncoder().encode(JSON.stringify(inhalt)) }
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
  if (!inhalt || typeof inhalt !== 'object' || (inhalt as { version?: unknown }).version !== 1)
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
  const ordner = MATERIAL.filter((o) => inhalt[o] && typeof inhalt[o] === 'object')
    .map((o) => ({ ordner: o, eintraege: Object.keys(inhalt[o] as Record<string, string>).length }))
    .filter((e) => e.eintraege > 0)
  const dateien = DATEIEN.filter((d) => d !== 'secrets.json' && typeof inhalt[d] === 'string')
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

  for (const ordner of MATERIAL) {
    const dateien = inhalt[ordner]
    if (!dateien || typeof dateien !== 'object') continue
    mkdirSync(join(wurzel, ordner), { recursive: true })
    for (const [name, base64] of Object.entries(dateien as Record<string, unknown>)) {
      if (typeof base64 !== 'string') continue
      // Kein Pfad im Dateinamen: Ein „../" in der Sicherung dürfte nicht aus dem Ordner führen
      if (name.includes('/') || name.includes('\\') || name.includes('..')) continue
      writeFileSync(join(wurzel, ordner, name), Buffer.from(base64, 'base64'))
    }
    wiederhergestellt.push(ordner)
  }

  for (const datei of DATEIEN) {
    const base64 = inhalt[datei]
    if (typeof base64 !== 'string' || !base64 || datei === 'secrets.json') continue
    if (datei === 'themenbereiche.json') {
      // Zusammenführen wie beim Material: Bereiche, die es nur hier gibt, bleiben erhalten
      writeFileSync(join(wurzel, datei), JSON.stringify(themenZusammenfuehren(join(wurzel, datei), Buffer.from(base64, 'base64').toString('utf8'))))
      wiederhergestellt.push(datei)
      continue
    }
    writeFileSync(join(wurzel, datei), Buffer.from(base64, 'base64'))
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
