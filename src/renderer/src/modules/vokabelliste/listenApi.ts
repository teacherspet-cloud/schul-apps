import type { SavedVocabList } from '@shared/types'
import type { BibliotheksApi } from '../../shared/components/Bibliothek'
import { alsListenEintrag } from '../vokabeltest/model/vocab'

/**
 * Die gespeicherten Vokabellisten in der Form der gemeinsamen Bibliothek
 * (shared/components/Bibliothek.tsx).
 *
 * Anlass (Paket 7, Rest aus Paket 4): Die Vokabellisten-Übersicht und der Vokabeltest hatten
 * eigene Wege zum Löschen (teils ohne Rückfrage) und kein Duplizieren. Über diesen Adapter
 * bekommen sie Umbenennen, Kopie anlegen und Löschen mit derselben Inline-Rückfrage wie alle
 * anderen Bibliotheken. Die Listen liegen in einer einzigen Datei (vocab-library.json), der
 * „Inhalt" eines Eintrags ist also die Liste selbst.
 */
export const vokabellistenApi: BibliotheksApi<SavedVocabList> = {
  list: () => window.api.library.list(),
  get: async (id) => {
    const liste = (await window.api.library.list()).find((l) => l.id === id)
    if (!liste) throw new Error('Die Vokabelliste gibt es nicht mehr.')
    return { ...liste, payload: liste, createdAt: liste.updatedAt }
  },
  save: async ({ id, name, payload }) => {
    const alt = payload as SavedVocabList
    // Beim Kopieren und Umbenennen auch gleich ohne das veraltete `include` speichern
    const listen = await window.api.library.save({ ...alt, id, name, updatedAt: '', entries: alt.entries.map(alsListenEintrag) })
    const gespeichert = listen.find((l) => l.id === id)
    if (!gespeichert) throw new Error('Die Vokabelliste ließ sich nicht speichern.')
    return gespeichert
  },
  delete: (id) => window.api.library.delete(id)
}
