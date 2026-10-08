/**
 * „Reihe mit KI planen" als Hintergrund-Auftrag (08.10.2026, Wunsch der Lehrkraft): Nach „Planen" schließt das Fenster,
 * die Planung läuft in der Auftragsleiste (shared/auftraege.ts) – die Lehrkraft arbeitet in anderen Programmen oder
 * anderen Reihen weiter.
 *
 * - Die Reihe wird VOR dem Start gespeichert (ReiheKi.tsx, `speichernVorher`); der Auftrag gehört zu ihrer Kennung
 *   (`docId`). Eingaben (Stunden, Wünsche, Schulbuchseiten, eigene Materialien) gehen unverändert an `planeReihe`.
 * - Das Ergebnis ändert die Reihe NICHT von selbst: Es liegt als Plan je Reihe bereit (`usePlaene`). Wer den
 *   fertigen Auftrag öffnet, kommt in genau diese Reihe; dort öffnet sich die Vorschau mit „Übernehmen" wie bisher.
 *   So geht weder ein ungespeicherter Stand verloren noch landet der Plan in einer anderen, inzwischen offenen Reihe.
 * - Fehler stehen wie bei allen Aufträgen in der Leiste, mit „Erneut versuchen" (dieselben Eingaben).
 */
import { create } from 'zustand'
import type { Reihe } from '@shared/reihe'
import { starteAuftrag, useAuftraege, laeuft } from '../../shared/auftraege'
import { notifySuccess } from '../../shared/util'
import { planeReihe, type MaterialKandidat, type ReihenPlan } from './reihePlanungKi'

/** Was die Lehrkraft im Fenster eingegeben hat – für „Neu planen" wieder vorbelegt */
export interface PlanEingaben {
  wunsch: string
  buch: { text: string; titel: string; abschnitte: number }[]
}

export interface PlanErgebnis {
  plan: ReihenPlan
  eingaben: PlanEingaben
  fertig: number
}

interface PlaeneState {
  /** Fertige, noch nicht übernommene Pläne je Reihe */
  plaene: Record<string, PlanErgebnis>
  /** Diese Reihe soll ihre Plan-Vorschau zeigen (aus der Auftragsleiste geöffnet) */
  zeigen: string | null
  setzeZeigen: (reiheId: string | null) => void
  verwerfe: (reiheId: string) => void
}

export const usePlaene = create<PlaeneState>((set) => ({
  plaene: {},
  zeigen: null,
  setzeZeigen: (zeigen) => set({ zeigen }),
  verwerfe: (reiheId) =>
    set((s) => {
      const { [reiheId]: _weg, ...rest } = s.plaene
      return { plaene: rest, zeigen: s.zeigen === reiheId ? null : s.zeigen }
    })
}))

/** Schlüssel des Auftrags in der Leiste – führt beim Öffnen zur Plan-Vorschau (UnterrichtsreiheModule, `useZielZeiger`) */
const PRAEFIX = 'reihe-plan:'
export const planSchluessel = (reiheId: string): string => `${PRAEFIX}${reiheId}`
export const reiheAusPlanSchluessel = (schluessel: string | undefined): string | null =>
  schluessel?.startsWith(PRAEFIX) ? schluessel.slice(PRAEFIX.length) : null

/** Welche Reihe gerade im Editor offen ist (meldet der Editor) */
let offeneReihe: string | null = null
export function meldeOffeneReihe(reiheId: string | null): () => void {
  offeneReihe = reiheId
  return () => {
    if (offeneReihe === reiheId) offeneReihe = null
  }
}

/** Läuft für diese Reihe gerade eine Planung? */
export const usePlantGerade = (reiheId: string | undefined): boolean =>
  useAuftraege((s) => Boolean(reiheId) && s.auftraege.some((a) => a.schluessel === planSchluessel(reiheId!) && laeuft(a)))

interface PlanStart {
  /** Gespeicherte Reihe (mit Kennung) */
  reihe: Reihe
  kc: { auszug: string[]; quelle: string }
  material: MaterialKandidat[]
  eingaben: PlanEingaben
}

/** Planung anstoßen – die Reihe muss gespeichert sein */
export function starteReihenPlanung(start: PlanStart): void {
  if (!start.reihe.id) throw new Error('Bitte die Reihe zuerst speichern.')
  const reiheId = start.reihe.id
  const titel = start.reihe.titel || 'Unterrichtsreihe'
  void starteAuftrag({
    moduleId: 'unterrichtsreihe',
    docId: reiheId,
    titel,
    art: 'Reihe mit KI planen',
    eingabe: start,
    // Die Reihe bleibt bearbeitbar: Der Plan ändert sie erst mit „Übernehmen"
    sperrt: false,
    schluessel: planSchluessel(reiheId),
    istOffen: () => offeneReihe === reiheId,
    fehlerTitel: 'Keine Planung',
    arbeit: async (e, k) => {
      k.melde('Die KI plant die Reihe …')
      return planeReihe(
        e.reihe,
        e.kc,
        e.material,
        k.ai,
        e.eingaben.wunsch,
        e.eingaben.buch.map((b) => b.text).join('\n\n')
      )
    },
    ablegen: async (plan, e) => {
      usePlaene.setState((s) => ({ plaene: { ...s.plaene, [reiheId]: { plan, eingaben: e.eingaben, fertig: Date.now() } } }))
      notifySuccess(`Plan für „${titel}" ist fertig – in der Auftragsleiste öffnen, ansehen und übernehmen.`)
    },
    abschluss: (plan) => `${plan.schritte.length} Schritte geplant – öffnen zum Ansehen und Übernehmen`
  })
}
