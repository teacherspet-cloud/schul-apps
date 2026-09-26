/**
 * Überthema im Kopf des Materials (Paket 11).
 *
 * Wunsch der Lehrkraft (26.09.2026): Neben dem Thema kann ein Überthema stehen – optisch dem
 * Kopfband, dem Farbband oder der Seitenleiste zugeordnet, NICHT der Blattüberschrift. Das
 * Thema sagt, was heute dran ist („Wie Pflanzen Energie gewinnen"), das Überthema, zu welcher
 * Unterrichtseinheit das Blatt gehört („Ökologie").
 *
 * Woher es kommt, in dieser Reihenfolge:
 * 1. abgeschaltet (`ueberthemaAus`) → nichts;
 * 2. von Hand eingetragen (`ueberthema`) → genau das;
 * 3. der Themenbereich des Materials aus Paket 10 (`themenbereich`, beim Anzeigen eingesetzt);
 * 4. ein Rückfall des Programms (Vokabeltest: die Unit aus dem Namen der Vokabelliste).
 * Leer heißt: gar nichts anzeigen – auch keinen einsamen Pfeil hinter dem Fach.
 *
 * Diese Datei kennt weder React noch den Speicher der Themenbereiche; sie rechnet nur und
 * lässt sich deshalb ohne Oberfläche prüfen (tests/ueberthema.test.ts).
 */

/** Felder, die jedes Material für sein Überthema trägt */
export interface UeberthemaFelder {
  /** Von Hand eingetragenes Überthema; leer = der Themenbereich gilt */
  ueberthema?: string
  /** true = kein Überthema auf diesem Material, auch wenn es in einem Bereich liegt */
  ueberthemaAus?: boolean
  /**
   * Name des Themenbereichs, in dem das Material liegt – NUR zum Anzeigen: Die Programme setzen
   * ihn beim Darstellen und Exportieren ein (`mitThemenbereich`). Gespeichert hält er höchstens
   * den letzten bekannten Stand fest, falls das Material ohne die Bereiche gedruckt wird.
   */
  themenbereich?: string
}

/**
 * Darstellung in der Designvorlage:
 * - `path`: Pfad „Fach › Überthema" in der Fachzeile;
 * - `split`: Fach links, Überthema rechts im Kopf;
 * - `emphasis`: Überthema betont, das Fach klein darüber.
 */
export type UeberthemaStil = 'path' | 'split' | 'emphasis'

export const UEBERTHEMA_STILE: { value: UeberthemaStil; label: string; beispiel: string }[] = [
  { value: 'path', label: 'Pfad „Fach › Überthema"', beispiel: 'Biologie › Ökologie' },
  { value: 'split', label: 'Fach links, Überthema rechts', beispiel: 'Biologie … Ökologie' },
  { value: 'emphasis', label: 'Überthema betont, Fach klein darüber', beispiel: 'BIOLOGIE / Ökologie' }
]

/** Trenner im Pfad – derselbe in Vorschau, Druck und Word */
export const PFAD_TRENNER = ' › '

/** Das geltende Überthema eines Materials (leer = keins). `rueckfall` nur, wenn sonst nichts da ist. */
export function ueberthemaVon(felder: UeberthemaFelder | undefined, rueckfall = ''): string {
  if (!felder || felder.ueberthemaAus) return ''
  return (felder.ueberthema ?? '').trim() || (felder.themenbereich ?? '').trim() || rueckfall.trim()
}

/**
 * Fach und Überthema als eine Zeile – für Pfad, Seitenleiste und kompakten Kopf.
 * Fehlt eines von beiden, steht das andere allein; fehlen beide, bleibt die Zeile leer.
 */
export function fachPfad(fach: string, ueberthema: string): string {
  return [fach.trim(), ueberthema.trim()].filter(Boolean).join(PFAD_TRENNER)
}

/**
 * Themenbereich zum Anzeigen einsetzen, ohne das Original zu verändern.
 * Gibt dasselbe Objekt zurück, wenn sich nichts ändert – so bleiben `useMemo`-Ketten ruhig.
 */
export function mitThemenbereich<T extends { meta: UeberthemaFelder }>(material: T, bereich: string | null | undefined): T {
  const name = (bereich ?? '').trim()
  if (!name || material.meta.themenbereich === name) return material
  return { ...material, meta: { ...material.meta, themenbereich: name } }
}

/**
 * Rückfall für den Vokabeltest: die Unit (Lektion, Kapitel …) aus dem Namen der Vokabelliste.
 * „Green Line 5 – Unit 3, Station 1" → „Unit 3". Ohne erkennbare Einheit bleibt es leer –
 * lieber kein Überthema als ein geratenes.
 */
export function unitAusName(name: string | undefined): string {
  if (!name) return ''
  const m = name.match(
    /\b(Unit|Unité|Unidad|Unità|Lektion|Leçon|Lección|Lezione|Lesson|Kapitel|Chapter|Module|Modul|Theme|Topic|Dossier|Étape)\s*(\d+[a-z]?)\b/i
  )
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}` : ''
}
