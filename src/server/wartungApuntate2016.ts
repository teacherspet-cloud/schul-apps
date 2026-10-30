/**
 * ¡Apúntate! Ausgabe 2016 entfernen (30.10.2026, Auftrag der Lehrkraft: „entferne die Apúntate-Buchreihe von 2016 vom
 * Server"). Die fünf Bände waren leere Platzhalter (keine Units); die Dateien sind aus dem Paket genommen. Hier fallen
 * ihre Einträge aus dem Bücherkatalog der Schule (server_einstellungen „schulbuecher", Erstbestand aus den Lehrwerken).
 */
import type { DatabaseSync } from 'node:sqlite'
import { serverWert, setzeServerWert } from './datenbank'

export const APUNTATE_2016_PRAEFIX = 'apuntate-2016-'

export const APUNTATE_2016: [string, (d: DatabaseSync) => string] = [
  'apuntate-2016-entfernen-2026-10-30',
  () => {
    const buecher = serverWert<unknown>('schulbuecher', null)
    if (!Array.isArray(buecher)) return 'kein Bücherkatalog gespeichert'
    const bleiben = buecher.filter((b) => !String((b as { lehrwerkId?: unknown })?.lehrwerkId ?? '').startsWith(APUNTATE_2016_PRAEFIX))
    if (bleiben.length !== buecher.length) setzeServerWert('schulbuecher', bleiben)
    return `${buecher.length - bleiben.length} Einträge der Ausgabe 2016 aus dem Bücherkatalog entfernt`
  }
]
