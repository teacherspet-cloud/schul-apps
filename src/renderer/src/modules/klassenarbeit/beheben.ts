/**
 * „Mit KI beheben" in der Klassenarbeit (Paket 12) – an den Hinweisen über der Arbeit.
 *
 * Repariert wird in der Fassung, zu der der Hinweis gehört, über ALLE Teile hinweg: Die KI sieht
 * die Fassung so, wie sie gedruckt wird (die Materialnummern laufen über alle Teile). Danach
 * kommt jede Änderung in ihren Teil zurück – über `teilNachUeberarbeitung`, damit die Punkte
 * zum Teil passen und gemeinsames Material in allen Fassungen gleich bleibt.
 */
import { starteAuftrag } from '../../shared/auftraege'
import { anredeRegel } from '../../shared/anrede'
import { lerngruppeSatz, wendeReparaturAn } from '../../shared/kiBeheben'
import { anredeFuerMeta } from '../arbeitsblatt/didactics/anrede'
import { profileFromMeta } from '../arbeitsblatt/render/SheetPages'
import { systemPrompt } from '../arbeitsblatt/generation/prompts'
import { repariereBausteine } from '../arbeitsblatt/generation/reparatur'
import { worksheetMetaFor } from './generation/generateExam'
import { arbeitOffen, defaultExamName, legeArbeitAb } from './library'
import { bloeckeDerFassung, fassungsLabel, fassungsZahl, teilNachUeberarbeitung } from './model/fassungen'
import type { Exam } from './model/types'

export function arbeitHinweiseBeheben(exam: Exam, docId: string, fassung: number, hinweise: string[]): void {
  if (!hinweise.length) return
  const gesamt = fassungsZahl(exam)
  const label = fassungsLabel(fassung, gesamt)
  void starteAuftrag({
    moduleId: 'klassenarbeit',
    docId,
    titel: defaultExamName(exam),
    art: `${hinweise.length > 1 ? `${hinweise.length} Hinweise` : 'Hinweis'} mit KI beheben${label ? ` (Fassung ${label})` : ''}`,
    eingabe: exam,
    istOffen: () => arbeitOffen(docId),
    sperrt: false,
    schluessel: `beheben-${fassung}`,
    fehlerTitel: 'Der Hinweis ließ sich nicht beheben',
    arbeit: async (e, k) => {
      k.melde('Die KI behebt den Hinweis …')
      const meta = worksheetMetaFor(e)
      const anrede = anredeFuerMeta(meta)
      return repariereBausteine(
        {
          bloecke: e.parts.flatMap((p) => bloeckeDerFassung(p, fassung)),
          hinweise,
          kontext: {
            material: 'Klassenarbeit',
            lerngruppe: lerngruppeSatz({
              fach: e.meta.subjectLabel,
              jahrgang: e.meta.grade,
              schulform: e.meta.schoolTypeName,
              niveau: e.meta.cefrLevel || undefined
            }),
            lernziel: [e.meta.topic, e.meta.content].filter((x) => x?.trim()).join('; '),
            ort: [label ? `Fassung ${label}` : '', `Teile: ${e.parts.map((p, i) => `${i + 1}. ${p.label}`).join(', ')}`].filter(Boolean).join('; '),
            anredeRegel: anredeRegel(anrede)
          },
          system: systemPrompt(meta, profileFromMeta(meta)),
          anrede,
          punkte: 'behalten'
        },
        k.ai
      )
    },
    abschluss: (e) => (e.erklaerung ? `Behoben: ${e.erklaerung}` : 'Fertig – in der Arbeit übernommen'),
    ablegen: (ergebnis, e) =>
      legeArbeitAb(docId, e, (aktuell) => ({
        ...aktuell,
        parts: aktuell.parts.map((p) => {
          const alt = bloeckeDerFassung(p, fassung)
          // Nur die Änderungen, deren Bezug in diesem Teil liegt
          const hier = ergebnis.aenderungen.filter((a) => alt.some((b) => b.id === a.anker))
          return hier.length ? teilNachUeberarbeitung(aktuell, p, fassung, wendeReparaturAn(alt, hier)) : p
        })
      }))
  })
}
