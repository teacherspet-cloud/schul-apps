/**
 * Reihe löschen – mit oder ohne ihr Material (09.10.2026, Regeln in shared/reiheMaterial.ts).
 *
 * Erst die Reihe, dann das Material: Scheitert das Löschen eines Dokuments, ist es danach gewöhnliches Material in der
 * Bibliothek – umgekehrt stünde eine Reihe da, deren Schritte auf gelöschte Blätter zeigen. Jedes Dokument geht über
 * `loescheDokument` (shared/bibliothek.ts): Ist es gerade offen, wird es geschlossen, und keine spätere Sicherung legt
 * es wieder an. Freigaben an Lernende sind eigene Kopien und bleiben mit ihren Abgaben stehen.
 */
import type { MaterialVerweis } from '@shared/reiheMaterial'
import { loescheDokument } from '../../shared/bibliothek'
import { zuordnungVergessen } from '../../shared/themenbereiche'
import { reiheVergessen } from '../../shared/reiheZuordnung'
import { senden } from '../onlinetest/serverApi'
import { useArbeitsblatt } from '../arbeitsblatt/store'
import { useKlassenarbeit } from '../klassenarbeit/store'
import { useLernzielkontrolle } from '../lernzielkontrolle/store'
import { useGrammatiktest } from '../grammatiktest/store'
import { useVokabeltest } from '../vokabeltest/store'

interface Ablage {
  loeschen: (id: string) => Promise<unknown[]>
  offeneId: () => string | null
  geloescht: () => void
}

function ablageVon(moduleId: string): Ablage | null {
  switch (moduleId) {
    case 'arbeitsblatt':
      return {
        loeschen: (id) => window.api.sheets.delete(id),
        offeneId: () => useArbeitsblatt.getState().docId,
        geloescht: () => useArbeitsblatt.getState().forgetSaved()
      }
    case 'klassenarbeit':
      return {
        loeschen: (id) => window.api.exams.delete(id),
        offeneId: () => useKlassenarbeit.getState().docId,
        geloescht: () => useKlassenarbeit.getState().forgetSaved()
      }
    case 'lernzielkontrolle':
      return {
        loeschen: (id) => window.api.kurztests.delete(id),
        offeneId: () => useLernzielkontrolle.getState().docId,
        geloescht: () => useLernzielkontrolle.getState().forgetSaved()
      }
    case 'grammatiktest':
      return {
        loeschen: (id) => window.api.grammarTests.delete(id),
        offeneId: () => useGrammatiktest.getState().docId,
        geloescht: () => useGrammatiktest.getState().forgetSaved()
      }
    case 'vokabeltest':
      return {
        loeschen: (id) => window.api.tests.delete(id),
        offeneId: () => useVokabeltest.getState().testId,
        geloescht: () => useVokabeltest.getState().forgetSaved()
      }
    default:
      return null
  }
}

/**
 * Reihe löschen; `material` = zu löschende Dokumente (leer = „Nur die Reihe löschen", das Material bleibt als
 * gewöhnliches Material in den Bibliotheken). Rückgabe: wie viele Dokumente sich nicht löschen ließen.
 */
export async function loescheReihe(reiheId: string, material: MaterialVerweis[]): Promise<{ fehlgeschlagen: number }> {
  await senden(`/server/reihen/${reiheId}/loeschen`)
  reiheVergessen(reiheId)
  let fehlgeschlagen = 0
  for (const m of material) {
    const ablage = ablageVon(m.moduleId)
    if (!ablage) {
      fehlgeschlagen++
      continue
    }
    try {
      await loescheDokument(ablage.loeschen, m.docId, ablage)
      void zuordnungVergessen(m.moduleId, m.docId)
    } catch {
      fehlgeschlagen++
    }
  }
  return { fehlgeschlagen }
}
