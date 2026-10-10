/**
 * Einheitliche Schlüssel der Medienbank (10.10.2026, Wunsch der Lehrkraft: dieselbe Vokabel nie zweimal vertonen).
 *
 * Einmalige Wartung `medien-kanon-2026-10-10`: Alle Einträge der gemeinsamen Medienbank ziehen auf ihren kanonischen
 * Schlüssel (shared/medienbank.ts `medienSchluessel`: „a / one" = „a/one", „it’s" = „it's", „…" = „..."). Fallen
 * mehrere Einträge zusammen, bleibt je Aufnahme und Bild die beste (ausdrücklicher Sprechtext, dann die neueste);
 * fehlende Teile kommen aus den anderen. Die übrigen Einträge liegen danach in medienbank/dubletten.json, index.json
 * wird vorher gesichert – KEINE Datei wird gelöscht. Das Protokoll nennt nur Zahlen.
 */
import type { DatabaseSync } from 'node:sqlite'
import { medienKanonOrdnen } from '../main/services/storage/medienbank'

export function medienKanonWartung(): string {
  try {
    const z = medienKanonOrdnen()
    return `${z.verschoben} Einträge auf den einheitlichen Schlüssel gezogen, ${z.zusammengefuehrt} Dubletten-Gruppen zusammengeführt, ${z.saetze} doppelte Sätze, ${z.beiseite} Einträge in dubletten.json (keine Datei gelöscht)`
  } catch (e) {
    // Ohne Medienbank oder bei unlesbarem Index: nichts ändern, aber die Wartung nicht blockieren
    return `nichts geändert (${e instanceof Error ? e.name : 'Fehler'})`
  }
}

export const MEDIEN_KANON: [string, (d: DatabaseSync) => string] = ['medien-kanon-2026-10-10', () => medienKanonWartung()]
