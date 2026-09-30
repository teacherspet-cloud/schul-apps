/**
 * „Mit KI beheben" an den Befunden der Lernzielkontrolle (Paket 12).
 *
 * Derselbe Reparaturweg wie im Arbeitsblatt (arbeitsblatt/generation/reparatur.ts), mit dem
 * Systemauftrag der Lernzielkontrolle – so gelten Landesformat, Operatoren und „nur Aufgaben und
 * Material" auch für die Reparatur. Ergebnis: ein Rückgängig-Schritt in der richtigen Fassung.
 * Die Befunde selbst werden ohnehin bei jedem Anzeigen neu ermittelt (EditorStep, useMemo) –
 * die Prüfung läuft danach also von selbst neu.
 */
import { starteAuftrag } from '../../shared/auftraege'
import { anredeRegel } from '../../shared/anrede'
import { istBehebbar, lerngruppeSatz, wendeReparaturAn } from '../../shared/kiBeheben'
import { anredeFuerMeta } from '../arbeitsblatt/didactics/anrede'
import { repariereBausteine } from '../arbeitsblatt/generation/reparatur'
import type { Befund } from './didactics/pruefungen'
import { kurztestPrompt } from './generation/generateKurztest'
import { kurztestOffen, legeKurztestAb } from './library'
import type { Kurztest } from './model/types'
import { worksheetMetaForKurztest } from './render/kurztestWorksheet'
import { bausteinNachWunsch } from '../arbeitsblatt/generation/wunsch'
import type { WunschArt } from '../../shared/kiWunsch'

/**
 * Zauberstab „Überarbeiten" bzw. Kreis „Neu erzeugen" an einem Baustein (30.09.2026) – mit dem
 * Systemauftrag der Lernzielkontrolle. Das Ergebnis ersetzt nur diesen Baustein in dieser
 * Fassung (ein Rückgängig-Schritt); Punkte bleiben.
 */
export function bausteinNachWunschAuftrag(test: Kurztest, docId: string, variante: number, blockId: string, art: WunschArt, wunsch: string): void {
  if (!test.varianten[variante]) return
  void starteAuftrag({
    moduleId: 'lernzielkontrolle',
    docId,
    titel: test.meta.title.trim() || test.meta.thema.trim() || 'Lernzielkontrolle',
    art: art === 'neu' ? 'Baustein neu erzeugen' : 'Baustein überarbeiten',
    eingabe: test,
    istOffen: () => kurztestOffen(docId),
    sperrt: false,
    schluessel: blockId,
    fehlerTitel: 'Der Baustein ließ sich nicht überarbeiten',
    arbeit: async (t, k) => {
      k.melde(art === 'neu' ? 'Die KI erzeugt den Baustein neu …' : 'Die KI überarbeitet den Baustein …')
      const v = t.varianten[variante]
      const meta = worksheetMetaForKurztest(t)
      const anrede = anredeFuerMeta(meta)
      return bausteinNachWunsch(
        {
          bloecke: v.blocks,
          blockId,
          art,
          wunsch,
          system: kurztestPrompt(t, v.label),
          zusammenhang: [
            `Material: Lernzielkontrolle${t.varianten.length > 1 ? `, Fassung ${v.label}` : ''}.`,
            `Lerngruppe: ${lerngruppeSatz({ fach: t.meta.subjectLabel, jahrgang: t.meta.grade, schulform: t.meta.schoolTypeName })}.`,
            t.meta.thema ? `Thema und Lernziel: ${t.meta.thema}.` : '',
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
      legeKurztestAb(docId, t, (aktuell) => ({
        ...aktuell,
        varianten: aktuell.varianten.map((v, i) => (i === variante ? { ...v, blocks: v.blocks.map((b) => (b.id === blockId ? neu : b)) } : v))
      }))
  })
}

/**
 * Welche Befunde eine Änderung am Test beheben kann. Nicht: Bedeutungsunterschiede zwischen
 * Ländern (ein Hinweis zum Lesen) und die Zeitgrenze des Landes (eine Einstellung, kein Mangel
 * am Blatt).
 */
export function befundBehebbar(b: Befund): boolean {
  if (b.bereich === 'Bedeutung') return false
  if (b.bereich === 'Umfang und Zeit' && !/Teilaufgaben/.test(b.message)) return false
  return istBehebbar(b.message)
}

export function befundeBeheben(test: Kurztest, docId: string, variante: number, befunde: Befund[]): void {
  const liste = befunde.filter(befundBehebbar)
  if (!liste.length || !test.varianten[variante]) return
  const ziel = liste.length === 1 ? liste[0].blockId : undefined
  void starteAuftrag({
    moduleId: 'lernzielkontrolle',
    docId,
    titel: test.meta.title.trim() || test.meta.thema.trim() || 'Lernzielkontrolle',
    art: liste.length > 1 ? `${liste.length} Befunde mit KI beheben` : 'Befund mit KI beheben',
    eingabe: test,
    istOffen: () => kurztestOffen(docId),
    sperrt: false,
    schluessel: ziel ?? `beheben-${variante}`,
    fehlerTitel: 'Der Befund ließ sich nicht beheben',
    arbeit: async (t, k) => {
      k.melde('Die KI behebt den Befund …')
      const v = t.varianten[variante]
      const meta = worksheetMetaForKurztest(t)
      const anrede = anredeFuerMeta(meta)
      const nummer = ziel ? v.blocks.findIndex((b) => b.id === ziel) + 1 : 0
      return repariereBausteine(
        {
          bloecke: v.blocks,
          hinweise: liste.map((b) => `${b.bereich}: ${b.message}`),
          kontext: {
            material: 'Lernzielkontrolle',
            lerngruppe: lerngruppeSatz({ fach: t.meta.subjectLabel, jahrgang: t.meta.grade, schulform: t.meta.schoolTypeName }),
            lernziel: t.meta.thema,
            ort: t.varianten.length > 1 ? `Fassung ${v.label}` : undefined,
            anredeRegel: anredeRegel(anrede),
            bausteinNummer: nummer || undefined
          },
          system: kurztestPrompt(t, v.label),
          anrede,
          punkte: 'behalten'
        },
        k.ai
      )
    },
    abschluss: (e) => (e.erklaerung ? `Behoben: ${e.erklaerung}` : 'Fertig – in der Kontrolle übernommen'),
    ablegen: (e, t) =>
      legeKurztestAb(docId, t, (aktuell) => ({
        ...aktuell,
        varianten: aktuell.varianten.map((v, i) => (i === variante ? { ...v, blocks: wendeReparaturAn(v.blocks, e.aenderungen) } : v))
      }))
  })
}
