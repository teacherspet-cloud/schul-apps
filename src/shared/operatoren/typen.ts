/**
 * Gemeinsamer Operatoren-Bestand (Großprogramm 0.4, Aufräumen D3): Typen.
 *
 * Bis dahin gab es drei getrennte Operatoren-Datenbestände: die Länderprofile der
 * Lernzielkontrolle, die Fachlisten des Arbeitsblatts und die amtlichen Listen der
 * Klassenarbeits-Anlage (nur Niedersachsen). Die Recherche vom 28.09.2026 hat die amtlichen
 * Operatorenlisten aller Länder im Wortlaut erfasst; sie liegen in `daten/<LAND>.json` und
 * werden über `zugriff.ts` gelesen.
 */
export type AfbAngabe = 'I' | 'II' | 'III' | 'I–II' | 'II–III' | 'I–III'

export interface OperatorDefinition {
  operator: string
  /** Leer = bloße Arbeitsanweisung (tick, match …): bekannt, aber ohne Erläuterung */
  definition: string
  afb?: AfbAngabe
  /** Weitere Formen, wie sie in Arbeitsanweisungen stehen („Nimm Stellung", „Setze … in Beziehung") */
  formen?: string[]
  /** Illustrierende Aufgabenbeispiele im Wortlaut der Liste */
  beispiele?: string[]
  /** Kompetenzbereich, für den dieser Eintrag gilt (Schreiben, Sprachmittlung, Sprechen, Hör-/Hörsehverstehen, Leseverstehen) */
  kompetenzbereich?: string
  /** Gilt nur für diese Fächer (Kennungen aus subjects.ts) */
  nurFaecher?: string[]
  /** Weitere Spalten der Liste im Wortlaut (Spaltenname → Inhalt) */
  zusatz?: Record<string, string>
}

export type Listensprache = 'de' | 'en' | 'fr' | 'es'

/** Eine Liste, wie sie auf der Klausur als Anlage erscheint */
export interface Operatorenliste {
  /** Sprache der Liste – bei Fremdsprachen die Zielsprache */
  sprache: Listensprache
  quelle: string
  operatoren: OperatorDefinition[]
  /** Vorbemerkungen der Liste je Kompetenzbereich im Wortlaut */
  hinweise?: Record<string, string>
}

/** Eine Liste im Bestand: mit Fundstelle, Fächern, Stufe und Belegart */
export interface BestandsListe {
  quelle: string
  url: string
  /** „volltext" = aus dem Dokument des Landes; „abgeleitet" = Land verweist auf KMK/IQB/EPA */
  belegt: 'volltext' | 'abgeleitet'
  faecher: string[]
  stufe: 'sek1' | 'sek2'
  sprache: Listensprache
  afbLogik: 'keine' | 'mehrfach' | 'genauEiner' | 'schwerpunkt'
  operatoren: OperatorDefinition[]
}

export interface LandesBestand {
  stateId: string
  stand: string
  listen: BestandsListe[]
}
