/**
 * Versuchsprotokoll und verwandte Protokolle (29.09.2026, Wunsch der Lehrkraft) – Datenmodell.
 *
 * Abgestimmt per Multiple Choice:
 * - Karte „Versuch" im ersten Schritt (Blatt rund um einen Versuch) UND Baustein
 *   „Versuchsprotokoll", der sich im Editor überall einfügen lässt.
 * - Fächer: Chemie, Physik, Biologie, Sachunterricht, Informatik, Erdkunde, Technik.
 * - Struktur wählbar (Forscherbogen, vorstrukturiert, Lückenprotokoll, offene Vorlage, selbst
 *   planen), Vorschlag nach Alter; Zeitform wählbar, Vorschlag nach Alter.
 * - Sicherheit: Vorschlag der KI, deutlich „zu prüfen", mit Link zur GESTIS-Stoffdatenbank.
 * - Der Versuch kommt von der KI (Vorschlag zum Thema), aus einer Beschreibung der Lehrkraft
 *   oder aus einer hineingezogenen Versuchsanleitung.
 * - Checkliste für die Lernenden, Bewertungsraster und Musterprotokoll im Lösungsteil.
 * - Auch in Lernzielkontrollen – dort ohne Lernhilfen (Leitfragen, Satzanfänge), außer mit
 *   Nachteilsausgleich.
 *
 * Grundlage der Gliederung und der Regeln: recherche/versuchsprotokoll-2026-09-29.md (die
 * Didaktik steht in didactics/protokoll.ts).
 */

/** Art des Protokolls – neben dem Versuchsprotokoll „Ähnliches" (Wunsch der Lehrkraft) */
export type ProtokollArt = 'versuch' | 'beobachtung' | 'mikroskopie' | 'messung' | 'forscher' | 'test' | 'gelaende'

/** Wie weit das Protokoll vorstrukturiert ist */
export type ProtokollStufe = 'forscher' | 'vorstrukturiert' | 'luecken' | 'offen' | 'planen'

/** Zeitform und Perspektive (keine amtliche Regel – wählbar) */
export type ProtokollStil = 'ichwir' | 'praesens' | 'praeteritum'

export type AbschnittId =
  | 'kopf'
  | 'frage'
  | 'vermutung'
  | 'material'
  | 'chemikalien'
  | 'sicherheit'
  | 'aufbau'
  | 'durchfuehrung'
  | 'beobachtung'
  | 'messwerte'
  | 'diagramm'
  | 'auswertung'
  | 'fehler'
  | 'ergebnis'
  | 'entsorgung'
  | 'weiter'

/** Wie ein Abschnitt auf dem Blatt aussieht */
export type AbschnittForm = 'linien' | 'skizze' | 'tabelle' | 'diagramm' | 'liste' | 'kopf'

export interface ProtokollAbschnitt {
  id: AbschnittId
  titel: string
  form: AbschnittForm
  /** Leitfrage unter der Überschrift (Hilfe – in Lernzielkontrollen nur mit Nachteilsausgleich) */
  leitfrage?: string
  /** Satzanfänge (Hilfe) */
  satzanfaenge?: string[]
  /**
   * Vorgegebener Inhalt (vorstrukturiert: Material, Durchführung stehen schon da). Bei der
   * Stufe „Lückenprotokoll" enthält er Lücken als „___".
   */
  vorgabe?: string
  /** Schreiblinien bzw. Höhe der Fläche */
  zeilen?: number
  hoeheMm?: number
  /** Messwerttabelle: Kopfzeile (Größe, Formelzeichen, Einheit) und Zahl der Zeilen */
  spalten?: string[]
  tabellenZeilen?: number
  /** Musterlösung dieses Abschnitts – nur im Lösungsteil */
  muster?: string
}

/** Die neun GHS-Piktogramme (GHS01 … GHS09) */
export type GhsId = 'GHS01' | 'GHS02' | 'GHS03' | 'GHS04' | 'GHS05' | 'GHS06' | 'GHS07' | 'GHS08' | 'GHS09'

export interface Chemikalie {
  name: string
  menge?: string
  ghs: GhsId[]
  signalwort?: 'Gefahr' | 'Achtung' | ''
  hSaetze?: string
  pSaetze?: string
}

/** Inhalt des Bausteins „protocol" (der Baustein selbst steht in types.ts: `ProtocolBlock`) */
export interface ProtokollInhalt {
  title: string
  art: ProtokollArt
  stufe: ProtokollStufe
  stil: ProtokollStil
  abschnitte: ProtokollAbschnitt[]
  chemikalien?: Chemikalie[]
  /** Angekreuzte Schutzmaßnahmen (Kennungen aus SCHUTZMASSNAHMEN) */
  schutz?: string[]
  entsorgung?: string
  /** Sicherheitsangaben stammen von der KI und sind noch nicht geprüft */
  sicherheitZuPruefen?: boolean
  /** Checkliste „Ist mein Protokoll vollständig?" am Ende */
  checkliste?: string[]
  /** Bewertungsraster für die Lehrkraft (nur Lösungsteil) */
  raster?: { kriterium: string; erwartung: string }[]
}

/** Der ausgearbeitete Versuch – Grundlage für Protokoll und Aufgaben */
export interface VersuchDaten {
  titel: string
  frage: string
  /** Erwartete Vermutung (Lösungsteil) */
  vermutung?: string
  geraete: string[]
  chemikalien: Chemikalie[]
  schutz: string[]
  /** Beschreibung des Aufbaus – Grundlage einer Skizze */
  aufbau: string
  durchfuehrung: string[]
  /** Messgrößen mit Einheit (Messprotokoll), z. B. „Zeit t in s" */
  messgroessen: string[]
  beobachtung: string
  deutung: string
  /** Reaktionsgleichung (Chemie) bzw. Formel/Gesetz (Physik) */
  gleichung?: string
  ergebnis: string
  fehlerquellen: string[]
  entsorgung?: string
  /** Lückenprotokoll: Beobachtung und Deutung mit „___" und der Wortspeicher dazu */
  lueckenBeobachtung?: string
  lueckenDeutung?: string
  wortspeicher?: string[]
  /** Hinweise nur für die Lehrkraft (Gefährdungsbeurteilung, Tätigkeitsbeschränkungen, Stolperstellen) */
  lehrkraft: string
  /** Sicherheitsangaben stammen von der KI */
  sicherheitZuPruefen: boolean
}

/** Einstellung „Versuch" im ersten Schritt des Arbeitsblatts */
export interface VersuchSetup {
  aktiv: boolean
  art: ProtokollArt
  stufe: ProtokollStufe
  stil: ProtokollStil
  quelle: 'ki' | 'beschreibung' | 'datei'
  /** Beschreibung der Lehrkraft (Titel, Material, Durchführung in Stichpunkten) */
  beschreibung: string
  /** Aus hineingezogenen Dateien gelesener Text der Versuchsanleitung */
  anleitung?: { fileName: string; text: string; pageImages?: string[] }[]
  /** Gewählte Abschnitte – fehlt die Liste, gilt der Vorschlag für Art, Fach und Jahrgang */
  abschnitte?: AbschnittId[]
  /** Checkliste und Bewertungsraster/Musterprotokoll */
  checkliste: boolean
  raster: boolean
  /** Ausgearbeiteter Versuch (von der App vor dem Planen erzeugt oder von der Lehrkraft bearbeitet) */
  daten?: VersuchDaten
}
