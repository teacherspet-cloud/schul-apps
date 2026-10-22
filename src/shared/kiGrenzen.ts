/**
 * Grenzen der KI auf dem Server (22.10.2026, KI-Sicherheitsprüfung): Überlast der Warteschlange und erschöpftes
 * Monatsbudget einer Lehrkraft. Gemeinsame Meldungen, damit die Aufrufstellen (Rückmeldebogen, Onlinetest, Sprechen …)
 * sie den Lernenden zeigen können statt der allgemeinen Fehlermeldung (kiSchutz.ts › LERNENDEN_FEHLER).
 *
 * Verwendung an einer Aufrufstelle:  `json(res, 503, { fehler: kiGrenzeMeldung(e) ?? LERNENDEN_FEHLER })`
 */

/** Zu viele Anfragen in der Schlange der Lernenden (main/services/ai/kiPlaetze.ts) */
export const KI_UEBERLAST = 'Gerade sind sehr viele Anfragen unterwegs – bitte gleich noch einmal.'

/** Monatsbudget der Lehrkraft erschöpft (server/kiNutzung.ts) – nur Anfragen von Lernenden werden angehalten */
export const KI_PAUSIERT =
  'Die KI-Rückmeldung ist für diesen Monat pausiert: Das KI-Budget deiner Lehrkraft ist aufgebraucht. Bitte wende dich an deine Lehrkraft.'

export type KiGrenze = 'ueberlast' | 'budget'

export class KiGrenzeFehler extends Error {
  constructor(public grenze: KiGrenze) {
    super(grenze === 'budget' ? KI_PAUSIERT : KI_UEBERLAST)
    this.name = 'KiGrenzeFehler'
  }
}

/** Freundliche Meldung, wenn `e` eine dieser Grenzen ist (auch nach dem Weg über JSON: am Wortlaut erkannt), sonst null */
export function kiGrenzeMeldung(e: unknown): string | null {
  if (e instanceof KiGrenzeFehler) return e.message
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  if (m.includes(KI_UEBERLAST)) return KI_UEBERLAST
  if (m.includes(KI_PAUSIERT)) return KI_PAUSIERT
  return null
}
