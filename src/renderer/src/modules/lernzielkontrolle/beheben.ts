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
