/**
 * ¡Apúntate! Ausgabe 2016 entfernen (30.10.2026, Auftrag der Lehrkraft: „entferne die Apúntate-Buchreihe von 2016 vom
 * Server"). Die fünf Bände waren leere Platzhalter (keine Units); die Dateien sind aus dem Paket genommen. Hier fallen
 * ihre Einträge aus dem Bücherkatalog der Schule (server_einstellungen „schulbuecher", Erstbestand aus den Lehrwerken).
 */
import type { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buchAusLehrwerk, type LehrwerkKurz } from '@shared/schulbuecher'
import { serverWert, setzeServerWert } from './datenbank'
import { RESSOURCEN } from './pfade'

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

/**
 * ¡Apúntate! 2 (Ausgabe 2016) wieder aufnehmen (20.11.2026, Auftrag der Lehrkraft: ab Jahrgang 7 nutzt die Schule noch
 * die Ausgabe 2016; Wortschatz Unidad 1–6 und Módulo 1–4 aus ihrer Liste). Der Band kommt in den Bücherkatalog, falls
 * die Schule schon einen hat (sonst entsteht er beim ersten Lesen ohnehin aus den Lehrwerksdateien).
 */
export const APUNTATE_2016_BAND2: [string, (d: DatabaseSync) => string] = [
  'apuntate-2016-band2-2026-11-20',
  () => {
    const buecher = serverWert<unknown>('schulbuecher', null)
    if (!Array.isArray(buecher)) return 'kein Bücherkatalog gespeichert'
    const datei = join(RESSOURCEN, 'lehrwerke', 'apuntate-2016-2.json')
    if (!existsSync(datei)) return 'Lehrwerksdatei fehlt'
    const lw = JSON.parse(readFileSync(datei, 'utf8')) as LehrwerkKurz
    const buch = buchAusLehrwerk(lw)
    if (!buch) return 'kein Fach zur Sprache'
    if (buecher.some((b) => (b as { lehrwerkId?: unknown })?.lehrwerkId === lw.id)) return 'schon im Bücherkatalog'
    setzeServerWert('schulbuecher', [...buecher, buch])
    return '¡Apúntate! 2 (ab 2016) in den Bücherkatalog aufgenommen'
  }
]
