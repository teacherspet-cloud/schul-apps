/**
 * „Mit KI beheben" im Grammatiktest (Paket 12) – an den Hinweisen zur Anrede über dem Blatt.
 *
 * Derselbe Reparaturweg wie im Arbeitsblatt (arbeitsblatt/generation/reparatur.ts), mit dem
 * Systemauftrag des Grammatiktests. Die Hinweise werden beim Anzeigen neu ermittelt – nach dem
 * Einsetzen läuft die Prüfung also von selbst neu.
 */
import { starteAuftrag } from '../../shared/auftraege'
import { anredeRegel } from '../../shared/anrede'
import { lerngruppeSatz, wendeReparaturAn } from '../../shared/kiBeheben'
import { anredeFuerMeta } from '../arbeitsblatt/didactics/anrede'
import { repariereBausteine } from '../arbeitsblatt/generation/reparatur'
import { testPrompt } from './generation/generateTest'
import { legeTestAb, testOffen } from './library'
import type { GrammarTest } from './model/types'
import { worksheetMetaForTest } from './render/testWorksheet'

export function testHinweiseBeheben(test: GrammarTest, docId: string, hinweise: string[]): void {
  if (!hinweise.length) return
  void starteAuftrag({
    moduleId: 'grammatiktest',
    docId,
    titel: test.meta.title?.trim() || 'Grammatiktest',
    art: hinweise.length > 1 ? `${hinweise.length} Hinweise mit KI beheben` : 'Hinweis mit KI beheben',
    eingabe: test,
    istOffen: () => testOffen(docId),
    sperrt: false,
    schluessel: 'beheben',
    fehlerTitel: 'Der Hinweis ließ sich nicht beheben',
    arbeit: async (t, k) => {
      k.melde('Die KI behebt den Hinweis …')
      const meta = worksheetMetaForTest(t)
      const anrede = anredeFuerMeta(meta)
      return repariereBausteine(
        {
          bloecke: t.blocks,
          hinweise,
          kontext: {
            material: 'Grammatiktest',
            lerngruppe: lerngruppeSatz({ fach: meta.subjectLabel, jahrgang: meta.grade, schulform: meta.schoolTypeName, niveau: meta.cefrLevel || undefined }),
            lernziel: meta.topic,
            anredeRegel: anredeRegel(anrede)
          },
          system: testPrompt(t),
          anrede,
          punkte: 'behalten'
        },
        k.ai
      )
    },
    abschluss: (e) => (e.erklaerung ? `Behoben: ${e.erklaerung}` : 'Fertig – im Test übernommen'),
    ablegen: (e, t) => legeTestAb(docId, t, (aktuell) => ({ ...aktuell, blocks: wendeReparaturAn(aktuell.blocks, e.aenderungen) }))
  })
}
