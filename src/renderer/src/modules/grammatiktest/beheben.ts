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
import { bausteinNachWunsch } from '../arbeitsblatt/generation/wunsch'
import type { WunschArt } from '../../shared/kiWunsch'

/**
 * Zauberstab „Überarbeiten" bzw. Kreis „Neu erzeugen" an einem Baustein (30.09.2026) – mit dem
 * Systemauftrag des Grammatiktests (geprüfte Form, Niveau). Ersetzt nur diesen Baustein, ein
 * Rückgängig-Schritt; Punkte bleiben.
 */
export function testBausteinNachWunsch(test: GrammarTest, docId: string, blockId: string, art: WunschArt, wunsch: string): void {
  void starteAuftrag({
    moduleId: 'grammatiktest',
    docId,
    titel: test.meta.title?.trim() || 'Grammatiktest',
    art: art === 'neu' ? 'Baustein neu erzeugen' : 'Baustein überarbeiten',
    eingabe: test,
    istOffen: () => testOffen(docId),
    sperrt: false,
    schluessel: blockId,
    fehlerTitel: 'Der Baustein ließ sich nicht überarbeiten',
    arbeit: async (t, k) => {
      k.melde(art === 'neu' ? 'Die KI erzeugt den Baustein neu …' : 'Die KI überarbeitet den Baustein …')
      const meta = worksheetMetaForTest(t)
      const anrede = anredeFuerMeta(meta)
      return bausteinNachWunsch(
        {
          // Beide Gruppen (30.09.2026): Der Baustein kann auch in Gruppe B stehen
          bloecke: [...t.blocks, ...(t.blocksB ?? [])],
          blockId,
          art,
          wunsch,
          system: testPrompt(t),
          zusammenhang: [
            'Material: Grammatiktest.',
            `Lerngruppe: ${lerngruppeSatz({ fach: meta.subjectLabel, jahrgang: meta.grade, schulform: meta.schoolTypeName, niveau: meta.cefrLevel || undefined })}.`,
            anredeRegel(anrede)
          ],
          anrede,
          punkteBehalten: true
        },
        k.ai
      )
    },
    abschluss: () => (art === 'neu' ? 'Der Baustein wurde neu erzeugt.' : 'Der Baustein wurde überarbeitet.'),
    ablegen: (neu, t) =>
      legeTestAb(docId, t, (aktuell) => ({
        ...aktuell,
        blocks: aktuell.blocks.map((b) => (b.id === blockId ? neu : b)),
        ...(aktuell.blocksB ? { blocksB: aktuell.blocksB.map((b) => (b.id === blockId ? neu : b)) } : {})
      }))
  })
}

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
