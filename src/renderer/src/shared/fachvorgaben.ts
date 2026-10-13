/**
 * Vorgaben der Fächer in der Oberfläche (13.10.2026; Regeln in shared/fachvorgaben.ts, Server server/fachvorgaben.ts).
 * Einmal beim Start geladen (nur mit dem Schul-Apps-Server), nach dem Speichern neu. Setzt die schulinternen Operatoren
 * für die Operatoren-Auswahl aller Programme.
 */
import { create } from 'zustand'
import type { AlleFachVorgaben, FachVorgaben } from '@shared/fachvorgaben'
import { setzeSchulOperatoren } from '@shared/operatoren/zugriff'
import { aufServer } from './plattform'
import { holen, senden } from '../modules/onlinetest/serverApi'

export const useFachVorgaben = create<{ vorgaben: AlleFachVorgaben; darf: string[]; geladen: boolean }>(() => ({ vorgaben: {}, darf: [], geladen: false }))

export async function fachVorgabenLaden(): Promise<void> {
  if (!aufServer()) return
  try {
    const d = await holen<{ vorgaben: AlleFachVorgaben; darf: string[] }>('/server/fachvorgaben')
    useFachVorgaben.setState({ vorgaben: d.vorgaben ?? {}, darf: d.darf ?? [], geladen: true })
  } catch {
    useFachVorgaben.setState({ geladen: true })
  }
}

export async function fachVorgabenSpeichern(fach: string, vorgaben: FachVorgaben): Promise<FachVorgaben> {
  const r = await senden<{ vorgaben: FachVorgaben }>('/server/fachvorgaben', { fach, vorgaben })
  useFachVorgaben.setState((s) => ({ vorgaben: { ...s.vorgaben, [fach]: r.vorgaben } }))
  return r.vorgaben
}

/** Vorgaben eines Fachs (Kennung) – ohne Server leer */
export const vorgabenVon = (fach: string | undefined): FachVorgaben | undefined => (fach ? useFachVorgaben.getState().vorgaben[fach] : undefined)

setzeSchulOperatoren((fach) => vorgabenVon(fach)?.operatoren)
