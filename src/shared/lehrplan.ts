/**
 * Lehrplan-Themen aus `resources/lehrplaene/<LAND>.json` (Paket 12/14).
 *
 * Die Recherche (Paket 14) legt je Land eine Datei mit amtlich belegten Themen an, in Ebenen:
 * Oberthema (Themenfeld, Inhaltsfeld, Lernbereich) › Unterthemen › ggf. eine weitere Ebene. Das
 * Format steht in der Recherche-Vorgabe (Stand 26.09.2026) und wird hier nur GELESEN: Die
 * Themenbereiche (renderer/shared/themenKatalog.ts) bauen daraus ihre Hierarchie. Fehlt die
 * Datei für ein Land – oder ist sie beschädigt –, gilt der Rückfall auf die Daten, die die App
 * schon mitbringt (Lernzielkontrolle, Klassenarbeit Geschichte, Lehrwerke, Grammatik).
 *
 * Ohne Electron und ohne React: Der Hauptprozess liest die Datei (main/index.ts,
 * `lehrplan:themen`), die Oberfläche wandelt sie um, die Tests prüfen beides direkt.
 */

export interface LehrplanUnterthema {
  thema: string
  herkunft?: 'wortlaut' | 'zusammengefasst' | string
  /** „z. B."-Angabe des Lehrplans – ein Beispiel, kein verbindliches Thema */
  beispiel?: boolean
  unterthemen?: LehrplanUnterthema[]
}

export interface LehrplanEintrag {
  fach: string
  /** Bei fach = "anderes" der Name des Fachs */
  fachname?: string
  /** z. B. "ethik" bei fach = "religion" */
  variante?: string
  schulformen?: string[]
  jahrgaenge?: number[]
  verbindlichkeit?: string
  quelle?: string
  seite?: string
  thema: string
  herkunft?: string
  unterthemen?: LehrplanUnterthema[]
  stichwoerter?: string[]
}

export interface LehrplanDatei {
  stateId: string
  stand?: string
  quellen?: { id: string; titel: string; url?: string }[]
  eintraege: LehrplanEintrag[]
}

const text = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

function unterthemen(roh: unknown, tiefe: number): LehrplanUnterthema[] {
  if (!Array.isArray(roh) || tiefe > 4) return []
  return roh
    .map((u): LehrplanUnterthema | null => {
      const r = (u ?? {}) as Record<string, unknown>
      const thema = text(r.thema)
      if (!thema) return null
      const kinder = unterthemen(r.unterthemen, tiefe + 1)
      return {
        thema,
        ...(text(r.herkunft) ? { herkunft: text(r.herkunft) } : {}),
        ...(r.beispiel === true ? { beispiel: true } : {}),
        ...(kinder.length ? { unterthemen: kinder } : {})
      }
    })
    .filter((u): u is LehrplanUnterthema => u !== null)
}

/**
 * Liest eine Lehrplandatei und verwirft, was nicht passt. Eine halb fertige oder beschädigte
 * Datei soll die Themenbereiche nicht lahmlegen – schlimmstenfalls fehlen einzelne Einträge.
 * Liefert null, wenn gar nichts Brauchbares darin steht.
 */
export function pruefeLehrplan(roh: unknown, stateId: string): LehrplanDatei | null {
  if (!roh || typeof roh !== 'object') return null
  const r = roh as Record<string, unknown>
  if (!Array.isArray(r.eintraege)) return null
  const eintraege: LehrplanEintrag[] = []
  for (const e of r.eintraege) {
    const x = (e ?? {}) as Record<string, unknown>
    const fach = text(x.fach)
    const thema = text(x.thema)
    if (!fach || !thema) continue
    const jahrgaenge = Array.isArray(x.jahrgaenge) ? x.jahrgaenge.filter((j): j is number => Number.isInteger(j)) : undefined
    const schulformen = Array.isArray(x.schulformen) ? x.schulformen.filter((s): s is string => typeof s === 'string') : undefined
    const stichwoerter = Array.isArray(x.stichwoerter) ? x.stichwoerter.filter((s): s is string => typeof s === 'string') : undefined
    const kinder = unterthemen(x.unterthemen, 1)
    eintraege.push({
      fach,
      thema,
      ...(text(x.fachname) ? { fachname: text(x.fachname) } : {}),
      ...(text(x.variante) ? { variante: text(x.variante) } : {}),
      ...(schulformen?.length ? { schulformen } : {}),
      ...(jahrgaenge?.length ? { jahrgaenge } : {}),
      ...(text(x.verbindlichkeit) ? { verbindlichkeit: text(x.verbindlichkeit) } : {}),
      ...(text(x.quelle) ? { quelle: text(x.quelle) } : {}),
      ...(kinder.length ? { unterthemen: kinder } : {}),
      ...(stichwoerter?.length ? { stichwoerter } : {})
    })
  }
  if (!eintraege.length) return null
  return { stateId: text(r.stateId) || stateId, ...(text(r.stand) ? { stand: text(r.stand) } : {}), eintraege }
}

/** Nur Länderkürzel – der Name wird zum Dateinamen */
export const gueltigesLand = (stateId: string): boolean => /^[A-Z]{2}$/.test(stateId)
