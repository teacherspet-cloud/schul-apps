/**
 * Einmalige Wartung der Daten (08.10.2026). Jede Aufgabe läuft genau einmal (Tabelle `wartung`).
 *
 * rekorde-zeit-2026-10-08: Unnatürlich hohe Bestwerte in Spielen auf Zeit zurücksetzen (Wunsch der Lehrkraft nach dem
 * Livetest: Falsches Antippen kostete nichts, wildes Tippen brachte Rekorde). Seitdem kostet Falsch einen Punkt und eine
 * Sekunde; ehrlich sind in 60 Sekunden etwa 20–30 Treffer zu schaffen.
 *
 * faecher-schreibweise-2026-10-08: Fachnamen in die Schreibweise des Katalogs bringen (Befund der Lehrkraft in „Meine
 * Klassen": ältere Lerngruppen hießen „englisch" – gewählt, bevor es den Fächerkatalog gab). Nur, was der Katalog kennt
 * (shared/faecher.ts `fachSchreibweise`); eigene Fächer bleiben. Die Fach-Spalten sind nicht verschlüsselt
 * (feldschutz.ts); geschrieben wird trotzdem über den geschützten Zugang, den `datenbank()` übergibt.
 */
import type { DatabaseSync } from 'node:sqlite'
import { fachSchreibweise } from '../shared/faecher'
import { protokoll } from './diagnose'

/** Spiele mit 60 s Uhr, in denen Raten Punkte brachte – Bestwerte darüber gelten als unnatürlich */
export const ZEIT_GRENZE: Record<string, number> = { blitz: 30, richtiggehoert: 30, formenblitz: 30, verbblitz: 30, richtigfalsch: 30 }

/** Bestwerte über der Grenze entfernen; Ergebnis: Anzahl entfernter Einträge */
export function rekordeBereinigt(rekorde: Record<string, number> | undefined): { rekorde: Record<string, number>; entfernt: number } {
  const neu: Record<string, number> = {}
  let entfernt = 0
  for (const [spiel, wert] of Object.entries(rekorde ?? {}))
    if (ZEIT_GRENZE[spiel] !== undefined && wert > ZEIT_GRENZE[spiel]) entfernt++
    else neu[spiel] = wert
  return { rekorde: neu, entfernt }
}

/** Tabellen mit einer Spalte `fach` (Fachname wie gewählt; fach_freigaben führt Kennungen und bleibt außen vor) */
export const FACH_SPALTEN = ['lerngruppen', 'vok_zuweisungen', 'gram_zuweisungen', 'blatt_freigaben', 'tafel_freigaben']

const tabelleDa = (d: DatabaseSync, tabelle: string): boolean => Boolean(d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabelle))
const spalteDa = (d: DatabaseSync, tabelle: string, spalte: string): boolean =>
  (d.prepare(`PRAGMA table_info(${tabelle})`).all() as { name: string }[]).some((s) => s.name === spalte)

/** Fachnamen vereinheitlichen; Ergebnis: Anzahl geänderter Zeilen. Mehrfach aufrufbar – beim zweiten Mal ändert sich nichts. */
export function faecherVereinheitlichen(d: DatabaseSync): number {
  let geaendert = 0
  for (const tabelle of FACH_SPALTEN) {
    if (!tabelleDa(d, tabelle) || !spalteDa(d, tabelle, 'fach')) continue
    const zeilen = d.prepare(`SELECT DISTINCT fach FROM ${tabelle} WHERE fach != ''`).all() as { fach: string }[]
    for (const { fach } of zeilen) {
      const neu = fachSchreibweise(fach)
      if (neu !== fach) geaendert += Number(d.prepare(`UPDATE ${tabelle} SET fach = ? WHERE fach = ?`).run(neu, fach).changes)
    }
  }
  // Onlinetests führen das Fach in den Einstellungen (JSON)
  if (tabelleDa(d, 'onlinetests')) {
    for (const z of d.prepare("SELECT rowid AS r, einstellungen FROM onlinetests WHERE einstellungen LIKE '%\"fach\"%'").all() as { r: number; einstellungen: string }[]) {
      let e: { fach?: unknown }
      try {
        e = JSON.parse(z.einstellungen) as typeof e
      } catch {
        continue
      }
      if (typeof e.fach !== 'string') continue
      const neu = fachSchreibweise(e.fach)
      if (neu === e.fach) continue
      d.prepare('UPDATE onlinetests SET einstellungen = ? WHERE rowid = ?').run(JSON.stringify({ ...e, fach: neu }), z.r)
      geaendert++
    }
  }
  return geaendert
}

function rekordeZeitBereinigen(d: DatabaseSync): string {
  let entfernt = 0
  for (const tabelle of ['vok_stand', 'gram_stand']) {
    if (!tabelleDa(d, tabelle)) continue
    const zeilen = d.prepare(`SELECT rowid AS r, daten FROM ${tabelle}`).all() as { r: number; daten: string }[]
    for (const z of zeilen) {
      let daten: { rekorde?: Record<string, number> }
      try {
        daten = JSON.parse(z.daten) as typeof daten
      } catch {
        continue
      }
      const b = rekordeBereinigt(daten.rekorde)
      if (!b.entfernt) continue
      entfernt += b.entfernt
      d.prepare(`UPDATE ${tabelle} SET daten = ? WHERE rowid = ?`).run(JSON.stringify({ ...daten, rekorde: b.rekorde }), z.r)
    }
  }
  return `${entfernt} unnatürlich hohe Bestwerte zurückgesetzt`
}

/** Einmalige Aufgaben in fester Reihenfolge – jede liefert den Satz fürs Protokoll */
const AUFGABEN: [string, (d: DatabaseSync) => string][] = [
  ['rekorde-zeit-2026-10-08', rekordeZeitBereinigen],
  ['faecher-schreibweise-2026-10-08', (d) => `${faecherVereinheitlichen(d)} Fachnamen in die Schreibweise des Katalogs gebracht`]
]

export function wartungAusfuehren(d: DatabaseSync): void {
  d.exec('CREATE TABLE IF NOT EXISTS wartung (name TEXT PRIMARY KEY, erledigt TEXT NOT NULL)')
  const erledigt = (name: string): boolean => Boolean(d.prepare('SELECT 1 FROM wartung WHERE name = ?').get(name))
  for (const [name, aufgabe] of AUFGABEN) {
    if (erledigt(name)) continue
    const satz = aufgabe(d)
    d.prepare('INSERT INTO wartung (name, erledigt) VALUES (?, ?)').run(name, new Date().toISOString())
    protokoll('langsam', `WARTUNG ${name}: ${satz}`)
  }
}
