/**
 * Aufnahmen mit Abkürzungen löschen (09.10.2026, von der Lehrkraft bestätigt: „nur löschen", nicht neu erzeugen).
 *
 * Einmalige Wartung `abkuerzung-ton-2026-10-09`: In der gemeinsamen Medienbank (main/services/storage/medienbank.ts)
 * sprach die Sprach-KI Abkürzungen so, wie sie dastehen – „YA" wie „ja", „sb" als „S B", „e.g." als „e g". Gelöscht
 * werden beide Fassungen (weiblich/männlich)
 *  - jeder Wort-Aufnahme, deren Wort eine Abkürzung enthält (Tabelle des Lehrwerks, allgemeine Regeln, Platzhalter),
 *  - jeder Satz-Aufnahme (Beispielsätze, Verbformen, Hinweise), deren Satz eine enthält –
 * erkennbar daran, dass der Sprechtext nach den neuen Regeln (shared/sprechtext.ts) anders lautet als das Gedruckte.
 * Nur Aufnahmen der Sprach-KI (mit Stimmenkennung); Aufnahmen ohne Herkunftsangabe bleiben. Schon nach den neuen
 * Regeln erzeugte Aufnahmen (`gesprochen` = neuer Sprechtext) bleiben ebenfalls.
 *
 * Danach spielt die App für diese Wörter keine Aufnahme mehr ab – es spricht wie ohne Aufnahme die Stimme des Geräts
 * (nach denselben Regeln). Neu erzeugte Aufnahmen folgen den neuen Regeln. Das Protokoll nennt nur Zahlen.
 */
import type { DatabaseSync } from 'node:sqlite'
import { abkuerzungAus } from '../shared/abkuerzung'
import { abkEintrag } from '../shared/abkuerzungen'
import { sprechText, sprechTextFuerWort } from '../shared/sprechtext'
import { toeneAussortieren } from '../main/services/storage/medienbank'
import type { MedienTon, TonArt } from '../shared/medienbank'

/** Neuer Sprechtext einer Aufnahme nach den Regeln vom 09.10.2026 */
export const neuerSprechtext = (ton: Pick<MedienTon, 'text'>, art: TonArt, sprache: string): string =>
  art === 'wort' ? sprechTextFuerWort({ term: ton.text }, sprache) : sprechText(ton.text, sprache)

/** Gehört diese Aufnahme gelöscht? */
export function abkuerzungsTonVeraltet(ton: MedienTon, art: TonArt, sprache: string): boolean {
  // Nur Aufnahmen der Sprach-KI (Stimmenkennung gesetzt) – unbekannte Herkunft bleibt
  if (!ton || typeof ton.stimme !== 'string' || !ton.stimme.trim() || typeof ton.text !== 'string') return false
  const neu = neuerSprechtext(ton, art, sprache)
  // Schon nach den neuen Regeln gesprochen
  if (typeof ton.gesprochen === 'string' && ton.gesprochen.trim() === neu.trim()) return false
  if (neu.trim() !== ton.text.trim()) return true
  // Wort mit Abkürzung, das trotzdem gleich klingt (z. B. eigener Sprechtext der Tabelle = Wort)
  return art === 'wort' && (Boolean(abkuerzungAus(ton.text)) || Boolean(abkEintrag(ton.text))) && !ton.gesprochen
}

export function abkuerzungsToeneLoeschen(): string {
  try {
    const z = toeneAussortieren(abkuerzungsTonVeraltet)
    return `${z.woerter} Wort- und ${z.saetze} Satz-Aufnahmen mit Abkürzungen gelöscht (${z.dateien} Dateien)`
  } catch (e) {
    // Ohne Medienbank oder bei unlesbarem Index: nichts löschen, aber die Wartung nicht blockieren
    return `nichts gelöscht (${e instanceof Error ? e.name : 'Fehler'})`
  }
}

export const ABKUERZUNG_TON: [string, (d: DatabaseSync) => string] = ['abkuerzung-ton-2026-10-09', () => abkuerzungsToeneLoeschen()]
