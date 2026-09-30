/**
 * Zugriff auf den gemeinsamen Operatoren-Bestand (Großprogramm 0.4, Aufräumen D3).
 *
 * `anlageFuer` liefert die amtliche Liste eines Landes für ein Fach als Klausur-Anlage.
 * Grundsatz der Lehrkraft (27.09.2026): „Immer nur die amtlichen Listen des Landes" – deshalb
 * zählen nur Listen, die aus einem Dokument DES LANDES stammen (`belegt: 'volltext'`). Listen,
 * bei denen das Land nur auf KMK/IQB/EPA verweist, und der KMK-Grundstock bleiben außen vor.
 */
import type { BestandsListe, LandesBestand, Listensprache, OperatorDefinition, Operatorenliste } from './typen'
import { datenSchulform } from '../schulformen'

const dateien = import.meta.glob<LandesBestand>('./daten/*.json', { eager: true, import: 'default' })

export const BESTAND: Record<string, LandesBestand> = Object.fromEntries(Object.values(dateien).map((d) => [d.stateId, d]))

/** Länder mit mindestens einer Liste im Bestand (ohne den KMK-Grundstock) */
export const laenderImBestand = (): string[] =>
  Object.keys(BESTAND)
    .filter((l) => l !== 'KMK')
    .sort()

export interface AnlageWunsch {
  stufe?: 'sek1' | 'sek2'
  /** Sprache der Arbeit: bei Fremdsprachen die Zielsprache, bei bilingualem Sachfach 'en' */
  sprache?: Listensprache
  /** Schulform der Lerngruppe (levels.json) */
  schulform?: string
}

/** Alle belegten Listen eines Landes für ein Fach, in der gewünschten Sprache und Stufe (Sek II als Rückfall) – über `operatorenAuswahl` */
export function listenFuer(stateId: string, fach: string, wunsch: AnlageWunsch = {}): BestandsListe[] {
  return operatorenAuswahl({ stateId, fach, stufe: wunsch.stufe ?? 'sek2', sprache: wunsch.sprache, schulform: wunsch.schulform, nurLand: true })?.listen ?? []
}

/**
 * Die Listen zu einer Anlage zusammengeführt. Ein Land veröffentlicht oft je Kompetenzbereich
 * oder je Fach eine eigene Tabelle; auf der Klausur erscheint EINE Anlage, die Fundstellen
 * werden alle genannt. Doppelte Einträge (gleicher Operator, gleicher Bereich, gleiche
 * Erläuterung) erscheinen einmal. Nur Listen aus Dokumenten des Landes.
 */
export function anlageFuer(stateId: string, fach: string, wunsch: AnlageWunsch = {}): Operatorenliste | null {
  const a = operatorenAuswahl({ stateId, fach, stufe: wunsch.stufe ?? 'sek2', sprache: wunsch.sprache, schulform: wunsch.schulform, nurLand: true })
  return a ? { sprache: a.sprache, quelle: a.quelle, operatoren: a.operatoren } : null
}

/*
 * ---------- Die EINE Auswahlfunktion (30.09.2026) ----------
 *
 * Anlass: In Niedersachsen zeigte die Lernzielkontrolle für Englisch „ohne Landesliste" und
 * einen naturwissenschaftlichen Kern (berechnen, skizzieren, zeichnen …). Ursache waren zwei
 * getrennte Wege: Die Lernzielkontrolle kannte nur ihre eigenen Profile und den Bestand ohne
 * Niedersachsen, die Klassenarbeit die niedersächsischen Listen – und wo nichts passte, griff
 * ein fächerübergreifender Rückfall, der aus Mathematik-/Naturwissenschaftslisten stammte.
 *
 * Jetzt wählen alle Programme über `operatorenAuswahl` (Land, Fach, Stufe, Schulform) – in
 * dieser Rangfolge, die Stufe zuerst:
 *   1. „land"         – Liste aus einem Dokument des Landes für genau dieses Fach
 *   2. „land-verweis" – das Land verweist für das Fach auf KMK/IQB/EPA; deren Liste
 *   3. „kmk"          – fachspezifischer KMK-/IQB-Bestand DESSELBEN Fachs (nie eines anderen)
 * zuerst für die gewünschte Stufe, dann – nur für die Sek I – für die Oberstufe. Bleibt alles
 * leer, gibt es kein Ergebnis; die Programme sagen das dann fachbezogen.
 */

/** Zielsprache der modernen Fremdsprachen mit amtlichen Listen */
export const ZIELSPRACHE_DES_FACHS: Record<string, Listensprache> = { englisch: 'en', franzoesisch: 'fr', spanisch: 'es' }

const MODERNE_FREMDSPRACHEN = ['englisch', 'franzoesisch', 'spanisch', 'italienisch', 'russisch']

export const istModerneFremdsprache = (fach: string): boolean => MODERNE_FREMDSPRACHEN.includes(fach)

export type Herkunft = 'land' | 'land-verweis' | 'kmk'

export interface OperatorenAnfrage {
  stateId: string
  fach: string
  stufe: 'sek1' | 'sek2'
  /** Schulform (levels.json); Listen, die ausdrücklich nur für andere Schulformen gelten, fallen weg */
  schulform?: string
  /** Sprache der Liste; ohne Angabe die Zielsprache des Fachs, sonst Deutsch */
  sprache?: Listensprache
  /** Nur Listen aus Dokumenten des Landes (Klausur-Anlage: „Immer nur die amtlichen Listen des Landes") */
  nurLand?: boolean
  /** Bezugstag für abgelöste Fassungen (Tests); Standard: heute */
  heute?: Date
}

export interface OperatorenAuswahl {
  herkunft: Herkunft
  /** Stufe der gefundenen Liste – für die Sek I kann das die Oberstufenliste sein */
  stufe: 'sek1' | 'sek2'
  stufeAbweichend: boolean
  sprache: Listensprache
  quelle: string
  url: string
  stand: string
  afbLogik: BestandsListe['afbLogik']
  listen: BestandsListe[]
  operatoren: OperatorDefinition[]
}

/** Das Prüfungsjahr, für das eine Liste jetzt gelten muss: ab August zählt das Abitur des Folgejahres */
const aktuellesPruefungsjahr = (heute: Date): number => heute.getFullYear() + (heute.getMonth() >= 7 ? 1 : 0)

/**
 * Gilt die Fassung jetzt nicht? Abgelöst („letztmalig Prüfungsjahr 2026", „gültig bis Abitur
 * 2026") oder noch nicht in Kraft („gültig ab Abitur 2029", „(ab 2029)").
 */
export function abgeloest(l: BestandsListe, heute = new Date()): boolean {
  const jahr = aktuellesPruefungsjahr(heute)
  const bis = /(?:letztmalig(?: im)? Prüfungsjahr|gültig bis (?:zum )?(?:Abitur|Prüfungsjahr)) (\d{4})/.exec(l.quelle)
  if (bis && Number(bis[1]) < jahr) return true
  const ab = /(?:gültig|gilt) ab (?:dem )?(?:Abitur|Prüfungsjahr) (\d{4})|\(ab (\d{4})\)/.exec(l.quelle)
  return Boolean(ab) && Number(ab![1] ?? ab![2]) > jahr
}

/** Eine Liste zählt nur als Liste des Fachs, wenn sie es nennt – bei Fremdsprachen in der Zielsprache oder als eigene Fremdsprachenliste */
function sprachePasst(l: BestandsListe, fach: string, sprache: Listensprache): boolean {
  if (l.sprache === sprache) return true
  if (sprache === 'de') return false
  // Deutsche Liste für eine Fremdsprache: nur, wenn sie ausschließlich für Fremdsprachen gilt (BW Englisch) –
  // fächerübergreifende Listen („alle Fächer", Gesellschaftswissenschaften + Englisch) gehören nicht in die Zielsprache
  if (l.sprache === 'de' && istModerneFremdsprache(fach)) return l.faecher.every(istModerneFremdsprache)
  // Bilinguales Sachfach ohne englische Liste: die deutsche des Fachs
  return l.sprache === 'de'
}

/**
 * Schulform ohne eigene Listen im Land (Kooperative Gesamtschule, berufliches Gymnasium, FOS …):
 * die Listen ihrer Bezugsform aus @shared/schulformen (30.09.2026, Audit Länder/Schulformen/Fächer).
 */
function listenSchulform(stateId: string, schulform: string | undefined): string | undefined {
  if (!schulform) return schulform
  const genannt = (x: string): boolean => (BESTAND[stateId]?.listen ?? []).some((l) => l.schulformen?.includes(x))
  return genannt(schulform) ? schulform : datenSchulform(stateId, schulform, genannt)
}

function stufenListen(stateId: string, anfrage: OperatorenAnfrage, stufe: 'sek1' | 'sek2', belegt: BestandsListe['belegt']): BestandsListe[] {
  const a = { ...anfrage, schulform: listenSchulform(stateId, anfrage.schulform) }
  const sprache = a.sprache ?? ZIELSPRACHE_DES_FACHS[a.fach] ?? 'de'
  const heute = a.heute ?? new Date()
  const alle = (BESTAND[stateId]?.listen ?? []).filter(
    (l) =>
      l.belegt === belegt &&
      l.stufe === stufe &&
      l.faecher.includes(a.fach) &&
      !abgeloest(l, heute) &&
      (!l.schulformen?.length || !a.schulform || l.schulformen.includes(a.schulform))
  )
  // Zielsprache vor Ersatzsprache
  const inSprache = alle.filter((l) => l.sprache === sprache)
  const passend = inSprache.length ? inSprache : alle.filter((l) => sprachePasst(l, a.fach, sprache))
  // Eine Liste für GENAU diese Schulform schlägt eine ohne Einschränkung
  const eigene = a.schulform ? passend.filter((l) => l.schulformen?.includes(a.schulform!)) : []
  return eigene.length ? eigene : passend.filter((l) => !l.schulformen?.length || !a.schulform)
}

/** Die Operatoren mehrerer Tabellen zusammengeführt; doppelte Einträge einmal */
export function zusammenfuehren(listen: BestandsListe[]): OperatorDefinition[] {
  const operatoren: OperatorDefinition[] = []
  const gesehen = new Set<string>()
  for (const l of listen)
    for (const o of l.operatoren) {
      const k = `${o.operator.toLowerCase()}|${o.kompetenzbereich ?? ''}|${o.definition}`
      if (gesehen.has(k)) continue
      gesehen.add(k)
      operatoren.push(o)
    }
  return operatoren
}

/** Ergänzungstabellen mit zwei, drei Einträgen (BB Englisch: nur AFB III) sind allein keine Liste */
const MINDESTZAHL = 6

function auswahl(herkunft: Herkunft, listen: BestandsListe[], a: OperatorenAnfrage, stufe: 'sek1' | 'sek2', stand: string): OperatorenAuswahl {
  const operatoren = zusammenfuehren(listen)
  const mitAfb = listen.find((l) => l.afbLogik !== 'keine' && l.operatoren.some((o) => o.afb))
  return {
    herkunft,
    stufe,
    stufeAbweichend: stufe !== a.stufe,
    sprache: listen[0].sprache,
    quelle: [...new Set(listen.map((l) => l.quelle))].join('; '),
    url: listen.find((l) => l.url)?.url ?? '',
    stand: [...new Set(listen.map((l) => l.stand).filter(Boolean))].join('; ') || `Recherchestand ${stand}`,
    afbLogik: mitAfb?.afbLogik ?? 'keine',
    listen,
    operatoren
  }
}

/**
 * Die Operatorenliste für Land, Fach, Stufe und Schulform – oder null, wenn es für das Fach
 * weder eine Landesliste noch einen KMK-/IQB-Bestand gibt.
 */
export function operatorenAuswahl(a: OperatorenAnfrage): OperatorenAuswahl | null {
  const stufen: ('sek1' | 'sek2')[] = a.stufe === 'sek1' ? ['sek1', 'sek2'] : ['sek2']
  const landStand = BESTAND[a.stateId]?.stand ?? ''
  for (const stufe of stufen) {
    const land = stufenListen(a.stateId, a, stufe, 'volltext')
    if (zusammenfuehren(land).length >= MINDESTZAHL) return auswahl('land', land, a, stufe, landStand)
    if (a.nurLand) {
      if (land.length) return auswahl('land', land, a, stufe, landStand)
      continue
    }
    // Verweis des Landes, zusammen mit den eigenen Ergänzungstabellen
    const verweis = stufenListen(a.stateId, a, stufe, 'abgeleitet')
    if (verweis.length) return auswahl('land-verweis', [...land, ...verweis], a, stufe, landStand)
    const kmk = stufenListen('KMK', a, stufe, 'volltext')
    if (kmk.length) return auswahl('kmk', kmk, a, stufe, BESTAND.KMK?.stand ?? '')
    if (land.length) return auswahl('land', land, a, stufe, landStand)
  }
  return null
}
