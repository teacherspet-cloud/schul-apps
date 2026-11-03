/**
 * Sprung von der Startseite in „Meine Klassen" (03.11.2026, Befund der Lehrkraft: „Termine & Vokabeltraining" führte nach
 * Sprachenlernen statt in die Klasse beim Fach). Öffnet die Klasse der Lerngruppe mit diesem Fach, wählt den passenden
 * Reiter und springt bei einem Hinweis an die Stelle (kursFokus.ts) – wie der Handlungsbedarf in „Meine Klassen".
 */
import { openDocument } from '../../shared/navigation'
import { zumHinweis } from '../lernen/kurs/kursFokus'
import { klassenReiterFuer } from '../lernen/kurs/kursHinweise'
import type { KursReiter } from '../lernen/kurs/kursDaten'

/** Trenner zwischen Lerngruppe und Reiter in der Dokument-Kennung von „Meine Klassen" („<gruppe>#vokabeln") */
export const KLASSE_REITER = '#'

export function kursInKlasse(gruppeId: string, kursId: string, h?: { reiter?: string; hinweis?: string; ids?: string[] }): void {
  const reiter = h?.reiter ? klassenReiterFuer({ reiter: h.reiter, hinweis: h.hinweis ?? '' } as Parameters<typeof klassenReiterFuer>[0]) : ''
  void openDocument('meineklassen', reiter ? `${gruppeId}${KLASSE_REITER}${reiter}` : gruppeId).then(() => {
    if (h?.reiter && h.hinweis) zumHinweis({ kurs: kursId, hinweis: h.hinweis, reiter: h.reiter as KursReiter, ids: h.ids })
  })
}
