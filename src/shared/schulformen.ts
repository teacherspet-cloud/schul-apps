/**
 * Länder × Schulformen – EINE Quelle der Wahrheit für alle Programme (30.09.2026).
 *
 * Auftrag der Lehrkraft: „Stelle sicher, dass alle Bundesländer, Schulformen und Fächer in jeder
 * App verfügbar und vollständig eingepflegt sind." Bis dahin kamen die Schulformen allein aus der
 * GER-Tabelle (resources/cefr/levels.json). Die kennt aber nur Schulformen mit Fremdsprachen-
 * Niveaus – die Kooperative Gesamtschule (NI, HE, MV), die Mittelstufenschule und Förderstufe
 * (HE), Wirtschaftsschule, FOS und BOS (BY), die beruflichen Gymnasien aller Länder und die
 * Berliner Gemeinschaftsschule fehlten, und jede Liste (Einstellungen, Vokabeltest, Schulsuche,
 * Programme) las die Tabelle auf ihre eigene Weise.
 *
 * Jetzt steht hier je Land jede Schulform mit amtlicher Bezeichnung, Jahrgangsspanne und
 * Schulprofil. Die GER-Tabelle bleibt die Quelle der Niveaus: `vollstaendigeGerTabelle` hängt
 * die fehlenden Schulformen mit den Niveaus ihrer Bezugsform an (Grundlage dann ausdrücklich
 * „übernommen … – nicht gesichert"). Der Hauptprozess liefert nur noch diese vervollständigte
 * Tabelle aus (`cefr:get`), damit auch Programme, die die Tabelle direkt lesen, alle
 * Schulformen sehen.
 *
 * BEZUGSFORM (`bezug`): Wo Landesdaten (GER-Niveaus, Klassenarbeitsregeln, Operatorenlisten)
 * nur für eine verwandte Schulform vorliegen, gelten deren Daten – mit Kennzeichnung. Die Kennung
 * einer Schulform ändert sich nie (gespeicherte Materialien und Einstellungen tragen sie).
 *
 * Belegt: Bezeichnungen und Spannen nach den Schulgesetzen/Schulordnungen der Länder (Stand der
 * Kenntnis 09/2026). Wo die Spanne je Schule schwankt, steht das in `hinweis`; was nicht
 * gegengeprüft werden konnte, trägt `nichtGesichert`.
 */
import type { CefrSchoolType, CefrTable } from './types'

/** Schulprofil – steuert Anforderungsniveau, Abschlussziel und Kursniveaus (arbeitsblatt/didactics/schoolProfiles.ts) */
export type SchulProfil = 'grundschule' | 'hauptschule' | 'realschule' | 'integriert' | 'gymnasium' | 'foerderLernen'

export interface Schulform {
  /** Kennung – gleichbleibend, in Materialien und Einstellungen gespeichert */
  id: string
  /** Amtliche Bezeichnung im Land */
  name: string
  /** Erster und letzter Jahrgang */
  von: number
  bis: number
  profil: SchulProfil
  /** Unterricht in Kursen oder auf Niveaustufen (G/E, G/M/E, Niveaustufen BE/BB) */
  kurse?: boolean
  /** Schulform, deren Landesdaten gelten, wo für diese keine eigenen vorliegen */
  bezug?: string
  /** Berufliche Schule (Sek II) */
  beruflich?: boolean
  hinweis?: string
  /** Spanne oder Bezeichnung nicht gegengeprüft */
  nichtGesichert?: boolean
}

export interface Land {
  id: string
  name: string
}

/** Die 16 Länder – Kürzel wie in den Einstellungen (NW = Nordrhein-Westfalen) */
export const LAENDER: Land[] = [
  { id: 'BW', name: 'Baden-Württemberg' },
  { id: 'BY', name: 'Bayern' },
  { id: 'BE', name: 'Berlin' },
  { id: 'BB', name: 'Brandenburg' },
  { id: 'HB', name: 'Bremen' },
  { id: 'HH', name: 'Hamburg' },
  { id: 'HE', name: 'Hessen' },
  { id: 'MV', name: 'Mecklenburg-Vorpommern' },
  { id: 'NI', name: 'Niedersachsen' },
  { id: 'NW', name: 'Nordrhein-Westfalen' },
  { id: 'RP', name: 'Rheinland-Pfalz' },
  { id: 'SL', name: 'Saarland' },
  { id: 'SN', name: 'Sachsen' },
  { id: 'ST', name: 'Sachsen-Anhalt' },
  { id: 'SH', name: 'Schleswig-Holstein' },
  { id: 'TH', name: 'Thüringen' }
]

/** Förderschule (Förderschwerpunkt Lernen) – in jedem Land, Bezeichnung je Land */
export const FOERDERSCHULE_ID = 'foerderschule-lernen'

const FOERDERSCHULE_NAME: Record<string, string> = {
  BW: 'SBBZ Lernen (Förderschwerpunkt Lernen)',
  BY: 'Förderzentrum (Förderschwerpunkt Lernen)',
  BE: 'Schule mit sonderpädagogischem Förderschwerpunkt Lernen',
  BB: 'Förderschule (Förderschwerpunkt Lernen)',
  HB: 'Förderzentrum / inklusive Lerngruppe (Förderschwerpunkt Lernen)',
  HH: 'Förderschule / ReBBZ (Förderschwerpunkt Lernen)'
}

/** Bezugsform der Förderschule für Landesdaten (GER-Niveaus): die Schulform mit dem ersten Schulabschluss */
const FOERDER_BEZUG: Record<string, string> = {
  BW: 'werkrealschule',
  BY: 'mittelschule',
  BE: 'integrierte-sekundarschule',
  BB: 'oberschule',
  HB: 'oberschule',
  HH: 'stadtteilschule',
  MV: 'regionale-schule',
  RP: 'realschule-plus',
  SL: 'gemeinschaftsschule',
  SN: 'oberschule',
  ST: 'sekundarschule',
  SH: 'gemeinschaftsschule',
  TH: 'regelschule'
}

const grundschule = (bis = 4): Schulform => ({ id: 'grundschule', name: 'Grundschule', von: 1, bis, profil: 'grundschule' })
const gymnasium = (bis: number, von = 5, hinweis?: string): Schulform => ({
  id: 'gymnasium',
  name: 'Gymnasium',
  von,
  bis,
  profil: 'gymnasium',
  ...(hinweis ? { hinweis } : {})
})
const beruflichesGymnasium = (name = 'Berufliches Gymnasium', id = 'berufliches-gymnasium'): Schulform => ({
  id,
  name,
  von: 11,
  bis: 13,
  profil: 'gymnasium',
  bezug: 'gymnasium',
  beruflich: true,
  hinweis: 'Dreijährige gymnasiale Oberstufe an einer beruflichen Schule (Eingangsklasse/Einführungsphase, dann Qualifikationsphase).'
})
const kgs = (bezug: string): Schulform => ({
  id: 'kooperative-gesamtschule',
  name: 'Kooperative Gesamtschule',
  von: 5,
  bis: 13,
  profil: 'integriert',
  kurse: true,
  bezug,
  hinweis: 'Unterricht in Schulzweigen (Haupt-, Real-, Gymnasialzweig); das Kursniveau entspricht dem Zweig.'
})

export const SCHULFORMEN: Record<string, Schulform[]> = {
  BW: [
    grundschule(),
    { id: 'werkrealschule', name: 'Werkrealschule/Hauptschule', von: 5, bis: 10, profil: 'hauptschule' },
    { id: 'realschule', name: 'Realschule', von: 5, bis: 10, profil: 'realschule', kurse: true, hinweis: 'Unterricht auf den Niveaus G und M.' },
    {
      id: 'gemeinschaftsschule',
      name: 'Gemeinschaftsschule',
      von: 5,
      bis: 13,
      profil: 'integriert',
      kurse: true,
      hinweis: 'Niveaus G, M, E; Oberstufe nur an einzelnen Standorten.'
    },
    gymnasium(13, 5, 'G9 im Aufbau (ab 2025/26 für Klasse 5 und 6); ältere Jahrgänge noch mit Abitur nach Klasse 12.'),
    beruflichesGymnasium()
  ],
  BY: [
    grundschule(),
    { id: 'mittelschule', name: 'Mittelschule', von: 5, bis: 10, profil: 'hauptschule', hinweis: 'Jahrgang 10 im M-Zweig bzw. als Vorbereitungsklasse.' },
    { id: 'realschule', name: 'Realschule', von: 5, bis: 10, profil: 'realschule' },
    gymnasium(13),
    {
      id: 'wirtschaftsschule',
      name: 'Wirtschaftsschule',
      von: 6,
      bis: 11,
      profil: 'realschule',
      bezug: 'realschule',
      beruflich: true,
      hinweis:
        'Vorklasse (Jgst. 6) zur vierstufigen Form (7–10), dreistufig (8–10), zweistufig (10–11, nach der Mittelschule); Abschluss: mittlerer Schulabschluss (WSO §§ 2, 4).'
    },
    {
      id: 'fos',
      name: 'Fachoberschule (FOS)',
      von: 11,
      bis: 13,
      profil: 'gymnasium',
      bezug: 'gymnasium',
      beruflich: true,
      hinweis: 'Fachhochschulreife nach Jahrgangsstufe 12, fachgebundene bzw. allgemeine Hochschulreife nach 13.'
    },
    {
      id: 'bos',
      name: 'Berufsoberschule (BOS)',
      von: 12,
      bis: 13,
      profil: 'gymnasium',
      bezug: 'gymnasium',
      beruflich: true,
      hinweis: 'Nach abgeschlossener Berufsausbildung; Fachhochschulreife nach 12, Hochschulreife nach 13.'
    }
  ],
  BE: [
    grundschule(6),
    { id: 'integrierte-sekundarschule', name: 'Integrierte Sekundarschule', von: 7, bis: 13, profil: 'integriert', kurse: true },
    {
      id: 'gemeinschaftsschule',
      name: 'Gemeinschaftsschule',
      von: 1,
      bis: 13,
      profil: 'integriert',
      kurse: true,
      bezug: 'integrierte-sekundarschule',
      hinweis: 'Von der Schulanfangsphase bis zum Abschluss; Oberstufe an einzelnen Standorten.'
    },
    gymnasium(12, 5, 'Klasse 5–6 nur an grundständigen Gymnasien.'),
    beruflichesGymnasium('Berufliches Gymnasium (OSZ)')
  ],
  BB: [
    grundschule(6),
    { id: 'oberschule', name: 'Oberschule', von: 7, bis: 10, profil: 'integriert', kurse: true },
    { id: 'gesamtschule', name: 'Gesamtschule', von: 7, bis: 13, profil: 'integriert', kurse: true },
    gymnasium(12, 5, 'Klasse 5–6 nur in Leistungs- und Begabungsklassen.'),
    beruflichesGymnasium()
  ],
  HB: [grundschule(), { id: 'oberschule', name: 'Oberschule', von: 5, bis: 13, profil: 'integriert', kurse: true }, gymnasium(12), beruflichesGymnasium()],
  HH: [
    grundschule(),
    { id: 'stadtteilschule', name: 'Stadtteilschule', von: 5, bis: 13, profil: 'integriert', kurse: true },
    gymnasium(12),
    beruflichesGymnasium()
  ],
  HE: [
    grundschule(),
    {
      id: 'foerderstufe',
      name: 'Förderstufe',
      von: 5,
      bis: 6,
      profil: 'integriert',
      kurse: true,
      bezug: 'integrierte-gesamtschule',
      hinweis: 'Schulformübergreifende Jahrgangsstufen 5 und 6.'
    },
    {
      id: 'hauptschule',
      name: 'Hauptschule',
      von: 5,
      bis: 9,
      profil: 'hauptschule',
      hinweis: 'Jahrgangsstufen 5–9; ein freiwilliges zehntes Schuljahr ist möglich.'
    },
    { id: 'realschule', name: 'Realschule', von: 5, bis: 10, profil: 'realschule' },
    {
      id: 'mittelstufenschule',
      name: 'Mittelstufenschule',
      von: 5,
      bis: 10,
      profil: 'integriert',
      kurse: true,
      bezug: 'integrierte-gesamtschule',
      hinweis: 'Haupt- und Realschulbildungsgang mit Praxisbezug, ab Jahrgang 7 in Zweigen.'
    },
    {
      id: 'integrierte-gesamtschule',
      name: 'Integrierte Gesamtschule',
      von: 5,
      bis: 13,
      profil: 'integriert',
      kurse: true,
      hinweis: 'Oberstufe nur an einzelnen Standorten.'
    },
    kgs('integrierte-gesamtschule'),
    gymnasium(13),
    beruflichesGymnasium()
  ],
  MV: [
    grundschule(),
    { id: 'regionale-schule', name: 'Regionale Schule', von: 5, bis: 10, profil: 'integriert', kurse: true },
    { id: 'gesamtschule', name: 'Integrierte Gesamtschule', von: 5, bis: 13, profil: 'integriert', kurse: true },
    kgs('gesamtschule'),
    gymnasium(12),
    beruflichesGymnasium('Fachgymnasium', 'fachgymnasium')
  ],
  NI: [
    grundschule(),
    { id: 'hauptschule', name: 'Hauptschule', von: 5, bis: 10, profil: 'hauptschule' },
    { id: 'realschule', name: 'Realschule', von: 5, bis: 10, profil: 'realschule' },
    { id: 'oberschule', name: 'Oberschule', von: 5, bis: 10, profil: 'integriert', kurse: true },
    { id: 'integrierte-gesamtschule', name: 'Integrierte Gesamtschule', von: 5, bis: 13, profil: 'integriert', kurse: true },
    kgs('integrierte-gesamtschule'),
    gymnasium(13),
    beruflichesGymnasium()
  ],
  NW: [
    grundschule(),
    { id: 'hauptschule', name: 'Hauptschule', von: 5, bis: 10, profil: 'hauptschule' },
    { id: 'realschule', name: 'Realschule', von: 5, bis: 10, profil: 'realschule' },
    { id: 'sekundarschule', name: 'Sekundarschule', von: 5, bis: 10, profil: 'integriert', kurse: true },
    { id: 'gesamtschule', name: 'Gesamtschule', von: 5, bis: 13, profil: 'integriert', kurse: true },
    gymnasium(13),
    beruflichesGymnasium('Berufskolleg (berufliches Gymnasium)', 'berufskolleg')
  ],
  RP: [
    grundschule(),
    { id: 'realschule-plus', name: 'Realschule plus', von: 5, bis: 10, profil: 'integriert', kurse: true },
    { id: 'integrierte-gesamtschule', name: 'Integrierte Gesamtschule', von: 5, bis: 13, profil: 'integriert', kurse: true },
    gymnasium(13, 5, 'An G8-Ganztagsgymnasien Abitur nach Klasse 12.'),
    beruflichesGymnasium()
  ],
  SL: [
    grundschule(),
    { id: 'gemeinschaftsschule', name: 'Gemeinschaftsschule', von: 5, bis: 13, profil: 'integriert', kurse: true },
    gymnasium(13, 5, 'G9 im Aufbau (erster G9-Jahrgang 2023/24 in Klasse 5).'),
    beruflichesGymnasium('Berufliches Oberstufengymnasium', 'berufliches-oberstufengymnasium')
  ],
  SN: [
    grundschule(),
    { id: 'oberschule', name: 'Oberschule', von: 5, bis: 10, profil: 'integriert', kurse: true },
    {
      id: 'gemeinschaftsschule',
      name: 'Gemeinschaftsschule',
      von: 1,
      bis: 12,
      profil: 'integriert',
      kurse: true,
      bezug: 'oberschule',
      hinweis: 'Klassenstufen 1–10 und Jahrgangsstufen 11–12; auch ab Klassenstufe 5 mit kooperierender Grundschule (SächsSchulG § 7a).'
    },
    gymnasium(12),
    beruflichesGymnasium()
  ],
  ST: [
    grundschule(),
    { id: 'sekundarschule', name: 'Sekundarschule', von: 5, bis: 10, profil: 'integriert', kurse: true },
    { id: 'gemeinschaftsschule', name: 'Gemeinschaftsschule', von: 5, bis: 13, profil: 'integriert', kurse: true },
    {
      id: 'gesamtschule',
      name: 'Gesamtschule',
      von: 5,
      bis: 13,
      profil: 'integriert',
      kurse: true,
      bezug: 'gemeinschaftsschule',
      hinweis: 'Integrierte und Kooperative Gesamtschulen.'
    },
    gymnasium(12),
    beruflichesGymnasium('Fachgymnasium', 'fachgymnasium')
  ],
  SH: [
    grundschule(),
    {
      id: 'gemeinschaftsschule',
      name: 'Gemeinschaftsschule',
      von: 5,
      bis: 13,
      profil: 'integriert',
      kurse: true,
      hinweis: 'Oberstufe an Gemeinschaftsschulen mit eigener Oberstufe.'
    },
    gymnasium(13),
    beruflichesGymnasium()
  ],
  TH: [
    grundschule(),
    { id: 'regelschule', name: 'Regelschule', von: 5, bis: 10, profil: 'integriert', kurse: true },
    {
      id: 'gemeinschaftsschule',
      name: 'Gemeinschaftsschule',
      von: 5,
      bis: 12,
      profil: 'integriert',
      kurse: true,
      hinweis: 'Umfasst meist auch die Klassen 1–4; Abitur nach Klasse 12.'
    },
    { id: 'gesamtschule', name: 'Gesamtschule', von: 5, bis: 12, profil: 'integriert', kurse: true, bezug: 'gemeinschaftsschule' },
    gymnasium(12),
    beruflichesGymnasium()
  ]
}

/** Förderschule des Landes – steht in jeder Liste zuletzt */
export function foerderschule(land: string): Schulform {
  return {
    id: FOERDERSCHULE_ID,
    name: FOERDERSCHULE_NAME[land] ?? 'Förderschule (Förderschwerpunkt Lernen)',
    von: 1,
    bis: 10,
    profil: 'foerderLernen',
    bezug: FOERDER_BEZUG[land] ?? 'hauptschule'
  }
}

/** Alle Schulformen eines Landes in der Reihenfolge der Auswahl (Förderschule zuletzt) */
export function schulformenDes(land: string): Schulform[] {
  const liste = SCHULFORMEN[land]
  return liste ? [...liste, foerderschule(land)] : []
}

export function schulformVon(land: string, id: string): Schulform | undefined {
  return schulformenDes(land).find((s) => s.id === id)
}

/** Profil einer Schulform-Kennung ohne Land (erste Fundstelle) – für Aufrufer, die das Land nicht kennen */
export function profilVon(id: string, land?: string): SchulProfil | undefined {
  if (land) {
    const s = schulformVon(land, id)
    if (s) return s.profil
  }
  if (id === FOERDERSCHULE_ID) return 'foerderLernen'
  for (const l of LAENDER) {
    const s = SCHULFORMEN[l.id].find((x) => x.id === id)
    if (s) return s.profil
  }
  return undefined
}

/**
 * Die Schulform, deren Landesdaten gelten. Liegt für die Schulform selbst etwas vor, ist das die
 * Schulform selbst; sonst die Bezugsform (Kette höchstens zweimal verfolgt).
 */
export function datenSchulform(land: string, id: string, vorhanden?: (id: string) => boolean): string {
  // Ohne Prüffunktion: Schulformen mit Bezugsform haben keine eigenen Landesdaten
  const hat = vorhanden ?? ((x: string) => !schulformVon(land, x)?.bezug)
  let aktuell = id
  for (let i = 0; i < 3 && !hat(aktuell); i++) {
    const b = schulformVon(land, aktuell)?.bezug
    if (!b) break
    aktuell = b
  }
  return aktuell
}

/**
 * Die GER-Tabelle mit ALLEN Schulformen: Reihenfolge und Bezeichnungen aus diesem Katalog,
 * Niveaus aus der Tabelle – für fehlende Schulformen die der Bezugsform, beschränkt auf die
 * eigenen Jahrgänge und als übernommen gekennzeichnet. Länder bleiben in der Tabellenreihenfolge.
 */
export function vollstaendigeGerTabelle(table: CefrTable): CefrTable {
  const states = LAENDER.map((land) => {
    const alt = table.states.find((s) => s.id === land.id)
    const eigene = alt?.schoolTypes ?? []
    const schoolTypes: CefrSchoolType[] = schulformenDes(land.id).map((sf) => {
      const direkt = eigene.find((t) => t.id === sf.id)
      if (direkt) return { ...direkt, name: sf.name }
      const bezug = datenSchulform(land.id, sf.id, (x) => eigene.some((t) => t.id === x))
      const quelle = eigene.find((t) => t.id === bezug)
      const bezugName = schulformVon(land.id, bezug)?.name ?? bezug
      const languages = (quelle?.languages ?? [])
        .map((l) => ({
          ...l,
          grades: Object.fromEntries(
            Object.entries(l.grades)
              .filter(([g]) => Number(g) >= sf.von && Number(g) <= sf.bis)
              .map(([g, e]) => [g, { ...e, basis: `${e.basis}; übernommen von ${bezugName} – nicht gesichert` }])
          )
        }))
        .filter((l) => Object.keys(l.grades).length > 0)
      return { id: sf.id, name: sf.name, languages }
    })
    return { id: land.id, name: alt?.name ?? land.name, schoolTypes }
  })
  return { ...table, states }
}
