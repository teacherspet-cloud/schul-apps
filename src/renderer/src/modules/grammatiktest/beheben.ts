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
import { alleTestBloecke, testFassungen, type GrammarTest } from './model/types'
import { addVersion } from '../arbeitsblatt/model/versions'
import { describeBlock } from '../arbeitsblatt/generation/describe'
import { newBlock } from '../arbeitsblatt/model/factory'
import type { TableBlock, WsBlock } from '../arbeitsblatt/model/types'
import { rasterAlsTabelle, rasterAnfrage, rasterAus } from '../../shared/bewertung/raster'
import { rasterAufteilung } from '../arbeitsblatt/auftraege'
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
          // Alle Gruppen (30.09.2026, A–D seit 06.10.2026): Der Baustein kann in jeder Fassung stehen
          bloecke: alleTestBloecke(t),
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
    // Der bisherige Stand bleibt als Fassung des Bausteins abrufbar (06.10.2026, wie Arbeitsblatt und Klassenarbeit)
    ablegen: (neu, t) => legeTestAb(docId, t, (aktuell) => jedeFassung(aktuell, (liste) => liste.map((b) => (b.id === blockId ? addVersion(b, neu) : b))))
  })
}

/** Dieselbe Änderung in jeder Fassung – Ergebnis mit `weitereFassungen` (eine alte Gruppe B wird übernommen) */
function jedeFassung(test: GrammarTest, fn: (liste: WsBlock[]) => WsBlock[]): GrammarTest {
  const [a, ...weitere] = testFassungen(test).map(fn)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { blocksB, ...rest } = test
  return { ...rest, blocks: a, ...(weitere.length ? { weitereFassungen: weitere } : {}) }
}

/**
 * Bewertungsraster zu einer Aufgabe (06.10.2026, wie Arbeitsblatt und Klassenarbeit): als Tabelle
 * hinter der Aufgabe, nur im Lösungsteil.
 */
export function testRasterAuftrag(test: GrammarTest, docId: string, blockId: string): void {
  void starteAuftrag({
    moduleId: 'grammatiktest',
    docId,
    titel: test.meta.title?.trim() || 'Grammatiktest',
    art: 'Bewertungsraster erstellen',
    eingabe: test,
    istOffen: () => testOffen(docId),
    sperrt: false,
    schluessel: `raster-${blockId}`,
    fehlerTitel: 'Das Bewertungsraster konnte nicht erstellt werden',
    arbeit: async (t, k) => {
      const aufgabe = alleTestBloecke(t).find((b) => b.id === blockId)
      if (aufgabe?.type !== 'task') throw new Error('Die Aufgabe ist nicht mehr vorhanden.')
      k.melde('Die KI entwirft das Bewertungsraster …')
      const meta = worksheetMetaForTest(t)
      const antwort = await k.ai<unknown>(
        rasterAnfrage({
          system: testPrompt(t),
          aufgabe: describeBlock(aufgabe),
          loesung: aufgabe.solution,
          punkte: aufgabe.points ?? 0,
          aufteilung: rasterAufteilung(meta.subjectId, Boolean(aufgabe.brief))
        })
      )
      return rasterAus(antwort, 'Bewertungsraster', aufgabe.points ?? 0)
    },
    abschluss: () => 'Fertig – das Raster steht hinter der Aufgabe (im Lösungsteil)',
    ablegen: (raster, t) =>
      legeTestAb(docId, t, (aktuell) =>
        jedeFassung(aktuell, (liste) => {
          if (!liste.some((b) => b.id === blockId)) return liste
          const id = `raster-${blockId}`
          const tabelle = { ...(newBlock('table') as TableBlock), id, ...rasterAlsTabelle(raster), nurLoesung: true }
          const neu = liste.filter((b) => b.id !== id)
          neu.splice(neu.findIndex((b) => b.id === blockId) + 1, 0, tabelle)
          return neu
        })
      )
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
          // Alle Fassungen (06.10.2026): Ein Hinweis kann an einem Baustein in B … hängen
          bloecke: alleTestBloecke(t),
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
    // Jede Änderung nur in der Fassung, in der ihr Baustein steht; ohne Fundort (neuer Baustein am Ende) in A
    ablegen: (e, t) =>
      legeTestAb(docId, t, (aktuell) => {
        const alle = alleTestBloecke(aktuell)
        return jedeFassung(aktuell, (liste) =>
          wendeReparaturAn(
            liste,
            e.aenderungen.filter((a) => liste.some((b) => b.id === a.anker) || (liste === aktuell.blocks && !alle.some((b) => b.id === a.anker)))
          )
        )
      })
  })
}
