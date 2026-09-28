/**
 * Weitergebbare Projektdatei eines Programms (`.klassenarbeit`, `.lernzielkontrolle`,
 * `.grammatiktest`) – gemeinsames Gerüst (Großprogramm 0.4, Aufräumen D1).
 *
 * Aufbau der Datei unverändert: `{ app: 'schul-apps', type, version: 1, <feld>: Dokument }`.
 */
import { normalizeDesign } from '@shared/design'

export interface ProjektDateiBeschreibung<D> {
  /** Wert von `type` und Dateiendung */
  typ: string
  /** Name des Felds, in dem das Dokument steht (`exam`, `test`) */
  feld: string
  /** Bezeichnung im Dateidialog und in Fehlermeldungen */
  bezeichnung: string
  /** Mindestprüfung des Inhalts (z. B. `parts` ist eine Liste) */
  gueltig: (d: D) => boolean
}

export interface ProjektDatei<D> {
  filter: { name: string; extensions: string[] }[]
  serialisiere: (d: D) => string
  lies: (data: Uint8Array) => D
}

export function erzeugeProjektDatei<D extends { design?: unknown }>(b: ProjektDateiBeschreibung<D>): ProjektDatei<D> {
  const fehler = `Die Datei ist keine gültige ${b.bezeichnung}-Datei.`
  return {
    filter: [{ name: b.bezeichnung, extensions: [b.typ] }],
    serialisiere: (d) => JSON.stringify({ app: 'schul-apps', type: b.typ, version: 1, [b.feld]: d }),
    lies: (data) => {
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>
      } catch {
        throw new Error(fehler)
      }
      const d = parsed?.[b.feld] as D | undefined
      if (parsed?.type !== b.typ || !d || typeof d !== 'object' || !b.gueltig(d)) throw new Error(fehler)
      return { ...d, design: normalizeDesign(d.design as never) }
    }
  }
}
