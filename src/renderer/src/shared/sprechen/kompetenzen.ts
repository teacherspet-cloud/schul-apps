/**
 * Bezeichnungen der Teilkompetenzen des Sprechens (01.10.2026).
 *
 * KMK-Bildungsstandards erste Fremdsprache (MSA 2003) und fortgeführte Fremdsprache (AHR 2012):
 * Der Kompetenzbereich Sprechen hat zwei Teilkompetenzen, „an Gesprächen teilnehmen" (dialogisch)
 * und „zusammenhängendes Sprechen" (2012: „zusammenhängendes monologisches Sprechen").
 * Die Fassung ESA/MSA 2023 nennt sie „Mündliche Interaktion" und „Mündliche Produktion"; Berlin,
 * Brandenburg, Mecklenburg-Vorpommern und das Saarland folgen dem schon.
 * Die Länder übernehmen das weitgehend wörtlich; abweichende Bezeichnungen stehen in
 * LAENDER_NAMEN mit Fundstelle (recherche/sprechpruefung-2026-10-01.md).
 */

export interface SprechKompetenzNamen {
  /** monologisch */
  monolog: string
  /** dialogisch */
  dialog: string
  /** Lehrplanwerk bzw. Fundstelle */
  quelle: string
}

export const KMK_NAMEN: SprechKompetenzNamen = {
  monolog: 'Sprechen – zusammenhängendes Sprechen',
  dialog: 'Sprechen – an Gesprächen teilnehmen',
  quelle: 'KMK-Bildungsstandards erste Fremdsprache 2003, fortgeführte Fremdsprache 2012'
}

/** Abweichende Bezeichnungen der Länder (Sek I; `sek2` für die Oberstufe, falls anders) */
const n = (monolog: string, dialog: string, quelle: string): SprechKompetenzNamen => ({ monolog, dialog, quelle })

const LAENDER_NAMEN: Record<string, SprechKompetenzNamen & { sek2?: SprechKompetenzNamen }> = {
  BW: n('Sprechen – zusammenhängendes monologisches Sprechen', 'Sprechen – an Gesprächen teilnehmen', 'Bildungsplan 2016'),
  // LehrplanPLUS kennt nur „Sprechen" ohne Unterteilung; die Zusätze nennen die Kompetenzerwartungen
  BY: n('Sprechen (zusammenhängend: darstellen, präsentieren)', 'Sprechen (an Gesprächen und Diskussionen teilnehmen)', 'LehrplanPLUS'),
  BE: n('Sprechen – Mündliche Produktion', 'Sprechen – Mündliche Interaktion', 'Rahmenlehrplan 1–10 (2025)'),
  BB: n('Sprechen – Mündliche Produktion', 'Sprechen – Mündliche Interaktion', 'Rahmenlehrplan 1–10 (2025)'),
  HB: n('Sprechen – zusammenhängend sprechen', 'Sprechen – an Gesprächen teilnehmen', 'Bildungsplan Gymnasium 2006'),
  HE: n('Sprechen – zusammenhängend sprechen', 'Sprechen – an Gesprächen teilnehmen', 'Kerncurriculum 2023'),
  HH: n('Sprechen – zusammenhängendes Sprechen', 'Sprechen – an Gesprächen teilnehmen', 'Bildungsplan 2022'),
  MV: n('Sprechen: Mündliche Produktion', 'Sprechen: Mündliche Interaktion', 'Rahmenplan 2025'),
  NI: n('Sprechen – zusammenhängendes monologisches Sprechen', 'Sprechen – an Gesprächen teilnehmen', 'Kerncurriculum'),
  NW: n('Sprechen: zusammenhängendes Sprechen', 'Sprechen: an Gesprächen teilnehmen', 'Kernlehrplan'),
  SH: n('Sprechen – zusammenhängendes Sprechen', 'Sprechen – an Gesprächen teilnehmen', 'Fachanforderungen 2014'),
  SL: n('Zusammenhängendes monologisches Sprechen – mündliche Produktion', 'Dialogisches Sprechen – mündliche Interaktion', 'Lehrplan 2025'),
  ST: n('Sprechen – zusammenhängendes monologisches Sprechen', 'Sprechen – an Gesprächen teilnehmen', 'Fachlehrplan 2022'),
  TH: n('Sprechen – zusammenhängendes Sprechen', 'Sprechen – an Gesprächen teilnehmen', 'Lehrplan')
  // RP, SN: nicht am Wortlaut geprüft – es gelten die Bezeichnungen der KMK
}

/** Namen für Land und Stufe – sonst die der KMK */
export function sprechKompetenzen(stateId: string, _schoolTypeId?: string, grade?: number): SprechKompetenzNamen {
  const land = LAENDER_NAMEN[stateId]
  if (!land) return KMK_NAMEN
  return grade !== undefined && grade >= 11 && land.sek2 ? land.sek2 : land
}

/**
 * Die beiden Einträge für Kompetenzlisten (Kompetenzschwerpunkt, Kompetenzbereiche): KMK-Wortlaut
 * mit Zusatz, welche Form gemeint ist – so ist auch ohne Lehrplankenntnis klar, was dahintersteht.
 */
export const SPRECHEN_MONOLOGISCH = 'Sprechen: zusammenhängendes Sprechen (monologisch)'
export const SPRECHEN_DIALOGISCH = 'Sprechen: an Gesprächen teilnehmen (dialogisch)'
