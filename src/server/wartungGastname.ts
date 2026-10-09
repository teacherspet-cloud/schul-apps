/**
 * Einmalige Namenskorrekturen einzelner Lernender (09.10.2026, Wunsch der Lehrkraft). Läuft als EINE Wartungsaufgabe
 * (wartung.ts) beim nächsten Start; jeder Eintrag der Liste `KORREKTUREN` wird dabei genau einmal angewandt:
 *  - Lerngruppe „5b": „Jayen S." → „Jayden S."
 *  - Lerngruppe „10b": „Jill v." → „Jil v." (das kleine „v." bleibt genau so)
 *
 * Gesucht wird unter allen Lehrkräften: Schülerkonten und Gäste (keine Vorschaukonten) mit genau diesem Namen, die zu
 * einer Lerngruppe dieses Namens gehören – als eingetragenes Mitglied, über die IServ-Gruppe der Lerngruppe oder (Gäste)
 * per Code an einem Vokabel-/Grammatikkurs dieser Lerngruppe. Geändert wird nur bei GENAU EINEM Treffer – sonst bleibt
 * alles, wie es ist (lieber von Hand nachsehen als die falsche Person umbenennen).
 *
 * Namen und Gruppennamen sind verschlüsselt (feldschutz.ts): gelesen und geschrieben wird über den geschützten Zugang,
 * den `datenbank()` an die Wartung übergibt; verglichen wird nach dem Entschlüsseln. Das Protokoll nennt keinen Namen.
 */
import type { DatabaseSync } from 'node:sqlite'
import { protokolliereServer } from './datenbank'
import { lernendeUmbenennen } from './umbenennen'

export interface NamensKorrektur {
  klasse: string
  alt: string
  neu: string
}

/** Die Korrekturen dieser Wartung – neue gehören in eine NEUE Aufgabe (diese läuft nur einmal) */
export const KORREKTUREN: NamensKorrektur[] = [
  { klasse: '5b', alt: 'Jayen S.', neu: 'Jayden S.' },
  { klasse: '10b', alt: 'Jill v.', neu: 'Jil v.' }
]

const tabelleDa = (d: DatabaseSync, tabelle: string): boolean => Boolean(d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabelle))

const gleich = (a: string, b: string): boolean => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()

const liste = (roh: string): unknown[] => {
  try {
    const x = JSON.parse(roh || '[]') as unknown
    return Array.isArray(x) ? x : []
  } catch {
    return []
  }
}

/** Eine Korrektur anwenden; Ergebnis: Satz fürs Protokoll (ohne Namen) */
export function nameKorrigieren(d: DatabaseSync, o: NamensKorrektur): string {
  if (!tabelleDa(d, 'lerngruppen') || !tabelleDa(d, 'nutzer')) return 'keine Lerngruppen – nichts geändert'
  const gruppen = (
    // SELECT *: ältere bzw. schlanke Datenbanken haben nicht jede Spalte
    d.prepare('SELECT * FROM lerngruppen').all() as { id: string; name: string; mitglieder: string; iserv_gruppe: string }[]
  ).filter((g) => gleich(String(g.name ?? ''), o.klasse))
  if (!gruppen.length) return `Lerngruppe ${o.klasse} nicht gefunden – nichts geändert`
  const ids = new Set(gruppen.map((g) => g.id))
  const mitglieder = new Set(gruppen.flatMap((g) => liste(String(g.mitglieder ?? '')).map((b) => String(b).toLowerCase())))
  const iserv = new Set(gruppen.map((g) => String(g.iserv_gruppe ?? '')).filter(Boolean))
  // Gäste per Code an einem Kurs dieser Lerngruppe (Vokabeln, Grammatik)
  const perKurs = new Set<string>()
  for (const [gaeste, kurse] of [
    ['vok_gaeste', 'vok_zuweisungen'],
    ['gram_gaeste', 'gram_zuweisungen']
  ] as const) {
    if (!tabelleDa(d, gaeste) || !tabelleDa(d, kurse)) continue
    for (const z of d.prepare(`SELECT g.nutzer_id AS n, k.lerngruppe_id AS l FROM ${gaeste} g JOIN ${kurse} k ON k.id = g.zuweisung_id`).all() as {
      n: string
      l: string
    }[])
      if (ids.has(z.l)) perKurs.add(z.n)
  }
  // `benutzer` setzt der geschützte Zugang aus `benutzer_v` (Klartext statt Suchschlüssel)
  const treffer = (
    d.prepare('SELECT * FROM nutzer').all() as {
      id: string
      benutzer: string
      name: string
      gruppen: string
      rolle: string
      quelle: string
    }[]
  ).filter(
    (n) =>
      n.rolle === 'schueler' &&
      n.quelle !== 'vorschau' &&
      gleich(String(n.name ?? ''), o.alt) &&
      (mitglieder.has(String(n.benutzer ?? '').toLowerCase()) ||
        perKurs.has(n.id) ||
        liste(String(n.gruppen ?? '')).some((x) => iserv.has(String((x as { id?: unknown } | null)?.id ?? ''))))
  )
  if (treffer.length !== 1) {
    const satz = `Name in ${o.klasse} nicht korrigiert: ${treffer.length} Treffer statt genau einem`
    protokolliereServer('wartung', satz)
    return satz
  }
  // Mit den Test-Gastkonten derselben Person, damit alle Ergebnisse dranbleiben (umbenennen.ts)
  lernendeUmbenennen(treffer[0].id, o.neu, d)
  const satz = `Name in ${o.klasse} korrigiert (genau ein Treffer)`
  protokolliereServer('wartung', satz, treffer[0].id)
  return satz
}

/** Alle Korrekturen der Liste, je einmal */
export function namenKorrigieren(d: DatabaseSync, korrekturen: NamensKorrektur[] = KORREKTUREN): string {
  return korrekturen.map((k) => nameKorrigieren(d, k)).join('; ')
}

/** Eintrag für die Liste der einmaligen Aufgaben (wartung.ts) */
export const NAMEN_KORRIGIEREN: [string, (d: DatabaseSync) => string] = ['namen-korrigieren-2026-10-09', (d) => namenKorrigieren(d)]
