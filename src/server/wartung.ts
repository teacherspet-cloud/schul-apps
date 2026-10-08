/**
 * Einmalige Wartung der Daten (08.10.2026). Jede Aufgabe läuft genau einmal (Tabelle `wartung`).
 *
 * rekorde-zeit-2026-10-08: Unnatürlich hohe Bestwerte in Spielen auf Zeit zurücksetzen (Wunsch der Lehrkraft nach dem
 * Livetest: Falsches Antippen kostete nichts, wildes Tippen brachte Rekorde). Seitdem kostet Falsch einen Punkt und eine
 * Sekunde; ehrlich sind in 60 Sekunden etwa 20–30 Treffer zu schaffen.
 */
import type { DatabaseSync } from 'node:sqlite'
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

export function wartungAusfuehren(d: DatabaseSync): void {
  d.exec('CREATE TABLE IF NOT EXISTS wartung (name TEXT PRIMARY KEY, erledigt TEXT NOT NULL)')
  const erledigt = (name: string): boolean => Boolean(d.prepare('SELECT 1 FROM wartung WHERE name = ?').get(name))
  const name = 'rekorde-zeit-2026-10-08'
  if (erledigt(name)) return
  let entfernt = 0
  for (const tabelle of ['vok_stand', 'gram_stand']) {
    if (!d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabelle)) continue
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
  d.prepare('INSERT INTO wartung (name, erledigt) VALUES (?, ?)').run(name, new Date().toISOString())
  protokoll('langsam', `WARTUNG ${name}: ${entfernt} unnatürlich hohe Bestwerte zurückgesetzt`)
}
