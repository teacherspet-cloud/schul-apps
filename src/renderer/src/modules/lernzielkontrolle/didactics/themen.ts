/**
 * Typische Unterrichtsthemen je Bundesland, Fach und Jahrgang.
 *
 * ZWECK: Das Themenfeld soll Vorschläge anbieten, statt nur ein leeres Eingabefeld zu sein.
 * Es bleibt aber ein FREIES Feld – die Vorschläge ergänzen es, sie ersetzen es nicht. Kein
 * Lehrplan der Welt kennt das Thema, das eine Lehrkraft heute tatsächlich braucht.
 *
 * WIE VERBINDLICH EIN THEMA EINEM JAHRGANG ZUGEORDNET IST, ist von Land zu Land verschieden.
 * Genau das führt `zuordnung`, und genau das sagt die Oberfläche auch:
 * - `jahrgang` – der Lehrplan nennt die Jahrgangsstufe (Bayern, mit Stundenrichtwerten).
 * - `doppeljahrgang` – der Lehrplan führt 5/6, 7/8, 9/10 und überlässt die Reihenfolge der
 *   Schule. Die Themen werden deshalb für BEIDE Jahrgänge vorgeschlagen (Entscheidung der
 *   Lehrkraft, 23.09.2026). Sie künstlich auf 5 und 6 aufzuteilen wäre eine Erfindung – die
 *   Zuordnung steht so in keinem Lehrplan; sie nur im ersten Jahr zu zeigen wäre falsch.
 * - `band` – der Lehrplan nennt nur „bis zum Ende der Sekundarstufe I" (Nordrhein-Westfalen).
 *   Vier Jahrgänge, keine Zuordnung. Die Themen erscheinen in allen vier, mit dem Hinweis,
 *   dass die Verteilung Sache des schulinternen Lehrplans ist.
 *
 * BELEGLAGE: Jeder Block trägt seine Fundstelle. Was nicht belegt ist, steht nicht drin.
 * Themen eines Landes werden NICHT für ein anderes vorgeschlagen. Das ist kein Formalismus:
 * In Bayern beginnt Geschichte erst in Jahrgang 6 und Geographie gibt es nur in 5, 7 und 10 –
 * eine aus Nordrhein-Westfalen übernommene Liste böte Themen für Jahrgänge an, in denen das
 * Fach dort gar nicht unterrichtet wird. Dieselbe Epoche liegt in drei Ländern in drei
 * verschiedenen Schuljahren. Ein falsch zugeordnetes Thema erzeugt einen stillen Fehler: Die
 * Lehrkraft bekommt einen fachlich einwandfreien Test – für den falschen Jahrgang.
 */
import { ERHOBENE_THEMEN } from './themenDaten'

/** Wie fest der Lehrplan ein Thema einem Jahrgang zuordnet. */
export type Themenzuordnung = 'jahrgang' | 'doppeljahrgang' | 'band'

export interface Themenblock {
  stateId: string
  fach: string
  /**
   * Jahrgänge, für die der Block gilt. Bei einem Doppeljahrgang stehen BEIDE drin, bei einem
   * Band alle vier – so erscheinen die Themen in jedem Jahr, das der Lehrplan meint.
   */
  jahrgaenge: number[]
  zuordnung: Themenzuordnung
  /** Schulformen, für die der Block gilt; leer = alle */
  schulformen?: string[]
  /**
   * Zweig innerhalb der Schulform, wenn der Lehrplan dort trennt – „Realschulbildungsgang",
   * „Wahlpflichtfächergruppe I", „M-Klasse". Leer = gilt für alle Zweige.
   */
  zweig?: string
  themen: string[]
  quelle: string
  url: string
  stand: string
  /** false = keine amtliche Veröffentlichung */
  amtlich: boolean
  hinweis?: string
}

/**
 * Die erhobenen Themenblöcke.
 *
 * Eigene Liste statt eines Re-Exports, weil die Tests sie vorübergehend ersetzen.
 */
export const THEMENBLOECKE: Themenblock[] = [...ERHOBENE_THEMEN]

/** Passt der Block zu dieser Schulform? Ohne Angabe gilt er für alle. */
const fuerSchulform = (b: Themenblock, schoolTypeId?: string): boolean => !b.schulformen?.length || !schoolTypeId || b.schulformen.includes(schoolTypeId)

/**
 * Passt der Block zum gewählten Zweig?
 *
 * Ein Block OHNE Zweig gilt immer – in Bayern hat die Realschule bis Klasse 6 einen
 * gemeinsamen Lehrplan und erst ab 7 getrennte Wahlpflichtfächergruppen. Wer Gruppe I
 * gewählt hat, soll in Klasse 6 trotzdem die gemeinsamen Themen sehen.
 */
const fuerZweig = (b: Themenblock, zweig?: string): boolean => !zweig || !b.zweig || b.zweig === zweig

const passende = (stateId: string, fach: string, grade: number, schoolTypeId?: string, zweig?: string): Themenblock[] =>
  THEMENBLOECKE.filter((b) => b.stateId === stateId && b.fach === fach && b.jahrgaenge.includes(grade) && fuerSchulform(b, schoolTypeId) && fuerZweig(b, zweig))

/**
 * Welche Zweige der Lehrplan für diese Lerngruppe kennt.
 *
 * Leer oder einelementig heißt: hier gibt es nichts zu wählen, und die Oberfläche zeigt
 * die Auswahl gar nicht erst an.
 */
export function zweigeFuer(stateId: string, fach: string, grade: number, schoolTypeId?: string): string[] {
  const alle = passende(stateId, fach, grade, schoolTypeId)
    .map((b) => b.zweig)
    .filter((z): z is string => Boolean(z))
  return [...new Set(alle)].sort((a, b) => a.localeCompare(b, 'de'))
}

export interface Themenvorschlag {
  thema: string
  zuordnung: Themenzuordnung
  /** true = nicht auf dieses eine Jahr festgelegt (Doppeljahrgang oder Band) */
  ausDoppeljahrgang: boolean
}

/**
 * Themenvorschläge für Land, Fach und Jahrgang.
 *
 * Ein Doppeljahrgangs- oder Bandblock erscheint in jedem seiner Jahre – siehe Kopfkommentar.
 */
export function themenFuer(stateId: string, fach: string, grade: number, schoolTypeId?: string, zweig?: string): Themenvorschlag[] {
  const out: Themenvorschlag[] = []
  const gesehen = new Set<string>()
  for (const b of passende(stateId, fach, grade, schoolTypeId, zweig)) {
    for (const t of b.themen) {
      if (gesehen.has(t)) continue
      gesehen.add(t)
      out.push({ thema: t, zuordnung: b.zuordnung, ausDoppeljahrgang: b.zuordnung !== 'jahrgang' })
    }
  }
  return out
}

/** Die Fundstellen hinter den Vorschlägen – damit in der Oberfläche steht, woher sie kommen. */
export function themenQuellen(stateId: string, fach: string, grade: number, schoolTypeId?: string, zweig?: string): Themenblock[] {
  return passende(stateId, fach, grade, schoolTypeId, zweig)
}

/** Aus [7, 8, 9, 10] wird „7–10", aus [7, 8] wird „7/8". */
const spanne = (jahrgaenge: number[]): string => {
  const j = [...jahrgaenge].sort((a, b) => a - b)
  return j.length === 2 ? `${j[0]}/${j[1]}` : `${j[0]}–${j[j.length - 1]}`
}

/**
 * Der Hinweis unter dem Themenfeld.
 *
 * Nennt die Fundstelle und sagt, wenn die Themen nicht auf dieses eine Jahr festgelegt sind.
 * Ohne diesen Satz sähe die Liste aus wie eine Vorgabe für genau dieses Schuljahr.
 */
export function themenHinweis(stateId: string, fach: string, grade: number, schoolTypeId?: string, zweig?: string): string {
  const bloecke = passende(stateId, fach, grade, schoolTypeId, zweig)
  if (!bloecke.length) return ''
  const quellen = [...new Set(bloecke.map((b) => b.quelle))].join(' · ')
  /*
   * Die Hinweise der Blöcke gehören sichtbar dazu, nicht nur in die Daten: „Der Lehrplan
   * führt diese Themen als Beispiel, nicht als Vorgabe" ändert, was die Liste überhaupt
   * bedeutet.
   */
  const zusaetze = [...new Set(bloecke.map((b) => b.hinweis).filter(Boolean))].join(' ')
  /*
   * Ohne gewählten Zweig enthält die Liste die Themen aller Zweige. Das muss dastehen –
   * sonst wundert sich eine Lehrkraft der Wahlpflichtfächergruppe II, warum „Dreiecke"
   * vorgeschlagen wird, das nur Gruppe I hat.
   */
  const offeneZweige = zweig ? [] : [...new Set(bloecke.map((b) => b.zweig).filter(Boolean))]
  const zweigSatz = offeneZweige.length > 1 ? ` Der Lehrplan trennt hier nach Zweig (${offeneZweige.join(', ')}); die Liste enthält alle.` : ''
  const satz = `Vorschläge aus ${quellen}.${zusaetze ? ` ${zusaetze}` : ''}${zweigSatz}`

  const band = bloecke.find((b) => b.zuordnung === 'band')
  if (band)
    return `${satz} Der Lehrplan ordnet diese Themen keinem einzelnen Jahrgang zu, sondern dem Abschnitt ${spanne(band.jahrgaenge)}; die Verteilung legt die Schule fest.`

  const doppelt = bloecke.find((b) => b.zuordnung === 'doppeljahrgang')
  if (doppelt)
    return `${satz} Der Lehrplan führt diese Themen als Doppeljahrgang ${spanne(doppelt.jahrgaenge)} – sie gelten für beide Jahre, die Reihenfolge legt die Schule fest.`

  return satz
}

/*
 * Mehrere gewählte Themen stehen als EINE Zeile im Test (`meta.thema`) – so steht es auch
 * auf dem Blatt und so geht es in den KI-Auftrag.
 *
 * Getrennt wird mit „ · ", nicht mit Komma oder Semikolon: Von den erhobenen Themen tragen
 * 63 selbst ein Komma im Namen („Prozentrechnung, Daten und Diagramme" ist EIN Lernbereich
 * des bayerischen Lehrplans) und eines ein Semikolon („Werkzeuge als Kraftwandler; Arbeit,
 * Energie"). Mit einem dieser Zeichen als Trenner zerfiele so ein Thema beim Wiederöffnen
 * in zwei – und niemand käme auf die Idee, dass der Lehrplan daran schuld ist.
 *
 * Kein einziges Thema enthält einen Mittelpunkt; ein Test hält das fest, damit ein später
 * nachgetragenes Bundesland diese Annahme nicht still bricht.
 *
 * Zusammenfügen und Aufteilen stehen direkt nebeneinander: Wer das eine ändert, sieht das andere.
 */
export const TRENNER = ' · '

export const themenZeile = (themen: string[]): string => themen.filter((t) => t.trim()).join(TRENNER)

export const themenAusZeile = (zeile: string): string[] =>
  zeile
    .split('·')
    .map((t) => t.trim())
    .filter(Boolean)
