import type { SavedVocabList } from '@shared/types'
import { newId } from './random'
import type { VocabEntry } from './types'

/** Vokabel ist ausgefüllt und wird im Test abgefragt. */
export const isIncluded = (v: VocabEntry): boolean => Boolean(v.term.trim()) && v.include !== false

export function includedVocab(vocab: VocabEntry[]): VocabEntry[] {
  return vocab.filter(isIncluded)
}

export interface SpecialVocabCounts {
  grey: VocabEntry[]
  box: VocabEntry[]
}

/** Grau gedruckte Vokabeln und Vokabeln aus Kästen (eine Vokabel kann in beiden Gruppen sein). */
export function specialVocab(vocab: VocabEntry[]): SpecialVocabCounts {
  return { grey: vocab.filter((v) => v.grey), box: vocab.filter((v) => v.inBox) }
}

/**
 * Eine Regel für graue Wörter – überall gleich (Paket 7, Entscheidung der Lehrkraft):
 * Zusatzwortschatz (im Buch grau) wird ÜBERNOMMEN, gekennzeichnet und standardmäßig NICHT
 * abgefragt; einzeln lässt er sich einschalten. Vorher fiel er je nach Weg ganz weg
 * (Schulbuch), kam abgefragt mit („Test automatisch erstellen") oder abgewählt (Listen).
 */
export const standardAbfrage = (v: { grey?: boolean }): boolean => !v.grey

/** Eintrag einer gespeicherten Vokabelliste – ohne die Abfrage, die gehört zum Test */
export type ListenEintrag = SavedVocabList['entries'][number]

/**
 * Vokabeln aus einer gespeicherten Liste übernehmen.
 *
 * Ältere Listen tragen noch ein gespeichertes `include` (bis Paket 7 wurde die Abfrage-Wahl
 * eines Tests mit in die Liste geschrieben). Es zählt nicht mehr: Welche Wörter ein Test
 * abfragt, entscheidet der Test – die Liste gibt nur vor, was grau ist.
 */
export function ausListe(entries: ListenEintrag[]): VocabEntry[] {
  return entries.filter((e) => e.term.trim()).map(({ include: _veraltet, ...e }) => ({ ...e, id: newId(), include: standardAbfrage(e) }))
}

/** Eine Vokabel als Listeneintrag speichern – ohne `include` und ohne leere Felder */
export function alsListenEintrag(v: Omit<VocabEntry, 'id'> | ListenEintrag): ListenEintrag {
  return {
    term: v.term.trim(),
    translation: v.translation.trim(),
    ...(v.pos?.trim() ? { pos: v.pos.trim() } : {}),
    ...(v.note?.trim() ? { note: v.note.trim() } : {}),
    ...(v.grey ? { grey: true } : {}),
    ...(v.inBox ? { inBox: true } : {})
  }
}
