/**
 * Bilder der Medienbank je Bedeutung und Wortart (21.10.2026, Befund der Lehrkraft: das Verb „bear" bekam das Bild eines
 * Bären; shared/medienBedeutung.ts, Ablage main/services/storage/medienbank.ts).
 *
 * Einmalige Wartung `medien-bedeutungen-2026-10-21` (Phase A, ohne KI): Aus allen Wörtern der Lehrwerke (mitgeliefert,
 * gemeinsam bearbeitet, eigene der Lehrkräfte) und den Verblisten der Lehrkräfte entstehen je Lemma und Wortart die
 * Bedeutungen; eindeutige alte Bilder ziehen in ihre Bedeutung, mehrdeutige warten auf die Bildprüfung (Admin-Knopf
 * „Mehrdeutige Wörter klären"). index.json und bedeutungen.json werden vorher gesichert, keine Datei wird gelöscht.
 * Ein neuer Server ohne Medienbank richtet beim ersten Nachschlagen ein (der Grundbestand kommt erst nach der Wartung).
 * Das Protokoll nennt nur Zahlen.
 */
import type { DatabaseSync } from 'node:sqlite'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { korpusAusOrdnern, sinneEinrichten } from '../main/services/storage/medienbank'
import type { KorpusWort } from '../shared/medienBedeutung'
import { DATEN, RESSOURCEN } from './pfade'

/** Wörter für das Einrichten: Lehrwerke und Verblisten aller Lehrkräfte (die Ablage entschlüsselt beim Lesen) */
export function serverKorpus(): KorpusWort[] {
  const nutzer = join(DATEN, 'nutzer')
  const je: string[] = []
  try {
    if (existsSync(nutzer)) for (const id of readdirSync(nutzer)) je.push(join(nutzer, id))
  } catch {
    // Ohne lesbaren Nutzerordner: nur die gemeinsamen Lehrwerke
  }
  return korpusAusOrdnern({
    lehrwerke: [join(RESSOURCEN, 'lehrwerke'), join(DATEN, 'lehrwerke'), ...je.map((d) => join(d, 'lehrwerke'))],
    verben: je.map((d) => join(d, 'lehrwerke', 'verben'))
  })
}

export function medienBedeutungenWartung(): string {
  try {
    const z = sinneEinrichten(serverKorpus())
    return `${z.lemmata} Lemmata mit Bedeutungen, ${z.verschoben} alte Bilder ihrer Bedeutung zugeordnet, ${z.offen} warten auf die Bildprüfung, ${z.klaeren} Lemmata mit mehreren Bedeutungen derselben Wortart (keine Datei gelöscht)`
  } catch (e) {
    // Ohne Medienbank oder bei unlesbarem Index: nichts ändern, aber die Wartung nicht blockieren
    return `nichts geändert (${e instanceof Error ? e.name : 'Fehler'})`
  }
}

export const MEDIEN_BEDEUTUNGEN: [string, (d: DatabaseSync) => string] = ['medien-bedeutungen-2026-10-21', () => medienBedeutungenWartung()]
