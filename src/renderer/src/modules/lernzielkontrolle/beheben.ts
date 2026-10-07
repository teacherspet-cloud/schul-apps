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
import { hoertextWunschLzk } from './hoertext'
import { addVersion } from '../arbeitsblatt/model/versions'
import { describeBlock } from '../arbeitsblatt/generation/describe'
import { newBlock } from '../arbeitsblatt/model/factory'
import type { TableBlock } from '../arbeitsblatt/model/types'
import { rasterAlsTabelle, rasterAnfrage, rasterAus } from '../../shared/bewertung/raster'
import { rasterAufteilung } from '../arbeitsblatt/auftraege'

/**
 * Zauberstab „Überarbeiten" bzw. Kreis „Neu erzeugen" an einem Baustein (30.09.2026) – mit dem
 * Systemauftrag der Lernzielkontrolle. Das Ergebnis ersetzt nur diesen Baustein in dieser
 * Fassung (ein Rückgängig-Schritt); Punkte bleiben.
 */
export function bausteinNachWunschAuftrag(test: Kurztest, docId: string, variante: number, blockId: string, art: WunschArt, wunsch: string): void {
  if (!test.varianten[variante]) return
  // Hörtext (01.10.2026): Das Skript ändert sich, die Aufgaben dazu ziehen mit
  if (test.varianten[variante].blocks.find((b) => b.id === blockId)?.type === 'audio') return hoertextWunschLzk(test, docId, blockId, art, wunsch)
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
    // Der bisherige Stand bleibt als Fassung des Bausteins abrufbar (06.10.2026, wie Arbeitsblatt und Klassenarbeit)
    ablegen: (neu, t) =>
      legeKurztestAb(docId, t, (aktuell) => ({
        ...aktuell,
        varianten: aktuell.varianten.map((v, i) => (i === variante ? { ...v, blocks: v.blocks.map((b) => (b.id === blockId ? addVersion(b, neu) : b)) } : v))
      }))
  })
}

/**
 * Bewertungsraster zu einer Aufgabe (06.10.2026, wie Arbeitsblatt und Klassenarbeit): als Tabelle
 * hinter der Aufgabe in dieser Fassung, nur im Lösungsteil.
 */
export function rasterAuftragLzk(test: Kurztest, docId: string, variante: number, blockId: string): void {
  if (!test.varianten[variante]) return
  void starteAuftrag({
    moduleId: 'lernzielkontrolle',
    docId,
    titel: test.meta.title.trim() || test.meta.thema.trim() || 'Lernzielkontrolle',
    art: 'Bewertungsraster erstellen',
    eingabe: test,
    istOffen: () => kurztestOffen(docId),
    sperrt: false,
    schluessel: `raster-${blockId}`,
    fehlerTitel: 'Das Bewertungsraster konnte nicht erstellt werden',
    arbeit: async (t, k) => {
      const v = t.varianten[variante]
      const aufgabe = v?.blocks.find((b) => b.id === blockId)
      if (aufgabe?.type !== 'task') throw new Error('Die Aufgabe ist nicht mehr vorhanden.')
      k.melde('Die KI entwirft das Bewertungsraster …')
      const antwort = await k.ai<unknown>(
        rasterAnfrage({
          system: kurztestPrompt(t, v.label),
          aufgabe: describeBlock(aufgabe),
          loesung: aufgabe.solution,
          punkte: aufgabe.points ?? 0,
          aufteilung: rasterAufteilung(t.meta.subjectId, Boolean(aufgabe.brief))
        })
      )
      return rasterAus(antwort, 'Bewertungsraster', aufgabe.points ?? 0)
    },
    abschluss: () => 'Fertig – das Raster steht hinter der Aufgabe (im Lösungsteil)',
    ablegen: (raster, t) =>
      legeKurztestAb(docId, t, (aktuell) => ({
        ...aktuell,
        varianten: aktuell.varianten.map((v, i) => {
          if (i !== variante || !v.blocks.some((b) => b.id === blockId)) return v
          const id = `raster-${blockId}`
          const tabelle = { ...(newBlock('table') as TableBlock), id, ...rasterAlsTabelle(raster), nurLoesung: true }
          const blocks = v.blocks.filter((b) => b.id !== id)
          blocks.splice(blocks.findIndex((b) => b.id === blockId) + 1, 0, tabelle)
          return { ...v, blocks }
        })
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
