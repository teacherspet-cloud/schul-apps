import type { AblageZiel } from '@shared/types'
import { pfadVon } from '@shared/themen'
import { SUBJECTS } from '../../modules/arbeitsblatt/model/subjects'
import { fachIdVon, WEITERE_FAECHER } from '../fachfarben'
import { themenbereichVon, useThemen } from '../themenbereiche'

/**
 * Wohin eine ausgegebene Datei gehört (30.09.2026) – Programm, Fach und Themenbereich des
 * Materials. Die iPad-App legt damit unter Dokumente/Schulmaterial/<Fach>/<Themenbereich> ab
 * (shared/schulmaterial.ts); am PC bleibt es beim Speichern-Dialog.
 *
 * Der Themenbereich kommt aus derselben Zuordnung wie in der Bibliothek (themenbereiche.tsx),
 * mit Unterbereichen von oben nach unten. Fehlt das Fach am Material, gilt das Fach des Bereichs.
 */
export function ablageZiel(programm: string, docId?: string | null, fach?: string): AblageZiel {
  const daten = useThemen.getState().daten
  const bereich = docId ? themenbereichVon(programm, docId, daten) : null
  const name = fachAnzeige(fach) || (bereich ? fachAnzeige(bereich.fachId) : '')
  const pfad = bereich ? pfadVon(daten, bereich.id).map((b) => b.name) : []
  return { programm, ...(name ? { fach: name } : {}), ...(pfad.length ? { themenbereich: pfad } : {}) }
}

/** Anzeigename des Fachs aus Kennung, Namen oder Sprachcode; Unbekanntes bleibt, wie es ist */
function fachAnzeige(fach?: string): string {
  const roh = String(fach ?? '').trim()
  if (!roh) return ''
  const id = fachIdVon(roh)
  const label = [...SUBJECTS, ...WEITERE_FAECHER].find((s) => s.id === id)?.label
  return (label ?? roh).replace(/\s*…$/, '')
}
