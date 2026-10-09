import type { SavedVocabList } from '@shared/types'
import { newId } from './random'
import type { VocabEntry } from './types'

/** Vokabel ist ausgefüllt und wird im Test abgefragt. */
export const isIncluded = (v: VocabEntry): boolean => Boolean(v.term.trim()) && v.include !== false

export function includedVocab(vocab: VocabEntry[]): VocabEntry[] {
  return vocab.filter(isIncluded)
}

/**
 * Hinweise in eckigen Klammern („information [no pl]", „Pfund [Währung]", „[AE]", „[infml]") sind
 * Lesehilfen der Wortliste – Befund der Lehrkraft (02.10.2026): „Dies ist lediglich als ein
 * Hinweis zu verstehen und soll weder mit auf den Vokabeltests angegeben werden, noch als korrekte
 * Antwort benötigt werden." Runde Klammern bleiben: „(to) look" gehört oft zur Form.
 */
export function ohneHinweise(text: string): { text: string; hinweise: string[] } {
  const hinweise = [...text.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1].trim()).filter(Boolean)
  const bereinigt = text
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+([,;.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
  // Besteht der Eintrag nur aus einem Hinweis, bleibt er, wie er ist – sonst stünde nichts da
  return bereinigt ? { text: bereinigt, hinweise } : { text: text.trim(), hinweise: [] }
}

/**
 * Die Vokabeln, wie sie in einen Test gehen: ohne Klammer-Hinweise in Wort und Übersetzung. Die
 * Hinweise wandern in die Notiz – die KI sieht sie weiter (z. B. „Währung" bei „Pfund", damit sie
 * die richtige Bedeutung wählt), auf dem Blatt und in den Lösungen stehen sie nicht.
 */
export function fuerTest(vocab: VocabEntry[]): VocabEntry[] {
  return vocab.map((v) => {
    const wort = ohneHinweise(v.term)
    const uebersetzung = ohneHinweise(v.translation)
    const hinweise = [...wort.hinweise, ...uebersetzung.hinweise]
    if (!hinweise.length) return v
    const notiz = [v.note?.trim(), `Hinweis der Wortliste (nicht abfragen, nicht abdrucken): ${hinweise.join('; ')}`].filter(Boolean).join(' · ')
    return { ...v, term: wort.text, translation: uebersetzung.text, note: notiz }
  })
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
    ...(v.inBox ? { inBox: true } : {}),
    // Abkürzungen (09.10.2026): eigene Aussprache und weitere richtige Antworten der Lehrkraft
    ...(v.aussprache?.trim() ? { aussprache: v.aussprache.trim() } : {}),
    ...(v.auchRichtig?.some((a) => a.trim()) ? { auchRichtig: v.auchRichtig.map((a) => a.trim()).filter(Boolean) } : {})
  }
}
