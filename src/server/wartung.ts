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
 *
 * grammatik-je-thema-2026-10-08: Kurs-Grammatik mit mehreren Themen in ein Training je Thema teilen (abgestimmt mit der
 * Lehrkraft; grammatikTeilen.ts). Die erste Gruppe behält die Kennung, der Lernstand zieht je Aufgabe mit um.
 */
import type { DatabaseSync } from 'node:sqlite'
import { fachSchreibweise } from '../shared/faecher'
import { protokoll } from './diagnose'
import { grammatikThemenTeilen } from './grammatikTeilen'
import { codePruefwertAusAlt } from './feldschutz'

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
    // Einstellungen sind verschlüsselt (08.10.2026) – kein LIKE in SQL, sondern nach dem Entschlüsseln prüfen
    for (const z of d.prepare('SELECT rowid AS r, einstellungen FROM onlinetests').all() as { r: number; einstellungen: string }[]) {
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

/**
 * Prüfwerte der Gäste-Codes (vok_gaeste.wieder/anmelde, gram_gaeste.wieder) von ungesalzenem SHA-256 auf HMAC mit dem
 * Hauptschlüssel umstellen (08.10.2026, feldschutz.ts `codePruefwertAusAlt`). Der Code selbst wird nicht gebraucht.
 */
export function codePruefwerteUmstellen(d: DatabaseSync): number {
  let n = 0
  for (const [tabelle, spalten] of [
    ['vok_gaeste', ['wieder', 'anmelde']],
    ['gram_gaeste', ['wieder']]
  ] as const) {
    if (!tabelleDa(d, tabelle)) continue
    for (const spalte of spalten) {
      if (!spalteDa(d, tabelle, spalte)) continue
      for (const z of d.prepare(`SELECT rowid AS r, ${spalte} AS w FROM ${tabelle}`).all() as { r: number; w: string }[]) {
        const neu = codePruefwertAusAlt(String(z.w ?? ''))
        if (neu === z.w) continue
        d.prepare(`UPDATE ${tabelle} SET ${spalte} = ? WHERE rowid = ?`).run(neu, z.r)
        n++
      }
    }
  }
  return n
}

/**
 * Klartext-Reste nach dem Verschlüsseln entfernen (08.10.2026): Alte Fassungen der Zeilen liegen sonst noch in freien
 * Seiten der Datenbank und im WAL. Einmal den WAL zurückschreiben und leeren, dann VACUUM (baut die Datei neu; mit
 * secure_delete, datenbank.ts). Läuft beim Start, also ohne offene Transaktion.
 */
export function klartextResteEntfernen(d: DatabaseSync): string {
  d.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  d.exec('VACUUM')
  d.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  return 'Datenbank neu geschrieben (VACUUM), WAL geleert'
}

/** Einmalige Aufgaben in fester Reihenfolge – jede liefert den Satz fürs Protokoll */
const AUFGABEN: [string, (d: DatabaseSync) => string][] = [
  ['rekorde-zeit-2026-10-08', rekordeZeitBereinigen],
  ['faecher-schreibweise-2026-10-08', (d) => `${faecherVereinheitlichen(d)} Fachnamen in die Schreibweise des Katalogs gebracht`],
  [
    'grammatik-je-thema-2026-10-08',
    (d) => `${grammatikThemenTeilen(d, (z) => protokoll('langsam', `WARTUNG grammatik-je-thema-2026-10-08: ${z}`))} Grammatiktrainings je Thema geteilt`
  ],
  ['codes-hmac-2026-10-08', (d) => `${codePruefwerteUmstellen(d)} Code-Prüfwerte auf HMAC umgestellt`],
  // Zuletzt: nach allen Umstellungen die Klartext-Reste entfernen
  ['klartext-reste-2026-10-08', klartextResteEntfernen]
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
