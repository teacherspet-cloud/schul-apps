import type { DesignTemplate } from '@shared/design'
import type { Worksheet } from '../model/types'
import { aenderungen, bilderVerkleinern, designMit, satzJetzt, stufen, type Stufe } from '../didactics/seitenAnpassung'
import { layoutKey } from './SheetPages'
import { messeSeiten } from './seitenMessen'

/**
 * „Auf weniger Seiten bringen" – die Suche (23.10.2026, Regeln in didactics/seitenAnpassung.ts). Jede Stufe wird
 * WIRKLICH gesetzt und gemessen (seitenMessen.ts, dieselbe Messung wie im Editor); genommen wird die erste, mit der das
 * längste Schülerblatt eine Seite weniger braucht. Die Schriftstufen werden halbiert gesucht (kleinere Schrift braucht
 * nie mehr Seiten), damit es bei vielen halben Punkten nicht lange dauert.
 */

export interface SeitenVorschlag {
  vorher: number
  nachher: number
  design: DesignTemplate
  /** Bilder verkleinern (bilderVerkleinern auf das Quelldokument anwenden) */
  bilder: boolean
  aenderungen: string[]
}

/** Seiten des längsten Schülerblatts (alle Fassungen) */
export function schuelerSeiten(ws: Worksheet, layouts: Map<string, { length: number }>): number {
  return Math.max(0, ...ws.sheets.map((s) => layouts.get(layoutKey(s.id, false))?.length ?? 0))
}

export async function wenigerSeitenSuchen(
  ws: Worksheet,
  logo: string | null,
  schule: string,
  /** Jetzige Seitenzahl, wenn schon gemessen (sonst wird gemessen) */
  jetzt: number | undefined,
  melde: (text: string) => void,
  abgebrochen: () => boolean
): Promise<SeitenVorschlag | { vorher: number; nachher: null }> {
  const vorher = jetzt || schuelerSeiten(ws, await messeSeiten(ws, logo, schule))
  const bilderProbe = bilderVerkleinern(ws.sheets)
  const liste = stufen(ws, bilderProbe.anzahl > 0)
  const ziel = vorher - 1
  const ergebnisse = new Map<number, number>()
  const probe = async (i: number): Promise<number> => {
    if (ergebnisse.has(i)) return ergebnisse.get(i)!
    const s = liste[i]
    melde(`Probiere: ${aenderungen(satzJetzt(ws), s, bilderProbe.anzahl).join(', ') || 'gleiche Darstellung'} …`)
    const versuch: Worksheet = { ...ws, design: designMit(ws.design, s), sheets: s.bilder ? bilderProbe.doc : ws.sheets }
    const n = schuelerSeiten(versuch, await messeSeiten(versuch, logo, schule))
    ergebnisse.set(i, n)
    return n
  }
  if (ziel < 1 || !liste.length) return { vorher, nachher: null }
  // Erst die Stufen ohne Schriftänderung der Reihe nach, dann die Schrift halbiert
  const ersteSchrift = liste.findIndex((s) => s.fontPt !== satzJetzt(ws).fontPt)
  const ohneSchrift = ersteSchrift < 0 ? liste.length : ersteSchrift
  let treffer = -1
  for (let i = 0; i < ohneSchrift && treffer < 0; i++) {
    if (abgebrochen()) return { vorher, nachher: null }
    if ((await probe(i)) <= ziel) treffer = i
  }
  if (treffer < 0 && ohneSchrift < liste.length) {
    if (abgebrochen()) return { vorher, nachher: null }
    // Reicht nicht einmal die kleinste erlaubte Schrift, gibt es keinen Vorschlag
    if ((await probe(liste.length - 1)) <= ziel) {
      let lo = ohneSchrift
      let hi = liste.length - 1
      while (lo < hi) {
        if (abgebrochen()) return { vorher, nachher: null }
        const mitte = Math.floor((lo + hi) / 2)
        if ((await probe(mitte)) <= ziel) hi = mitte
        else lo = mitte + 1
      }
      treffer = lo
    }
  }
  if (treffer < 0) return { vorher, nachher: null }
  const s: Stufe = liste[treffer]
  return {
    vorher,
    nachher: ergebnisse.get(treffer) ?? ziel,
    design: designMit(ws.design, s),
    bilder: s.bilder,
    aenderungen: aenderungen(satzJetzt(ws), s, bilderProbe.anzahl)
  }
}
