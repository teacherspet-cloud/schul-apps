/**
 * Programm „Rückmeldung" (Großprogramm 0.4, F3): schriftliche Rückmeldung zu Schülerarbeiten.
 *
 * Wunsch der Lehrkraft: „wie 1, aber aus Klassenarbeit / Arbeitsblatt / Vokabeltest etc.
 * heraus erstellbar, um Aufgabengrundlage zu haben, oder custom erstellbar in neuem Programm."
 *
 * Aufbau: eine GRUNDLAGE (die Aufgaben eines gespeicherten Materials oder eine frei
 * eingegebene Aufgabe), mehrere ABGABEN (Foto, Scan, PDF, Word oder getippter Text je
 * Schülerin/Schüler), zu jeder Abgabe ein BOGEN: Das gelingt schon – Nächste Schritte –
 * Kriterien mit Einschätzung in Worten.
 *
 * Seit 29.09.2026 (Wunsch der Lehrkraft) wählbar: FORMEN der Rückmeldung (schriftlich,
 * Verbesserungstipps, Bewertungstabelle, Korrekturrand, Kommentare am Scan,
 * Überarbeitungsauftrag – mehrere) und eine EINSTUFUNG (Notenpunkte, Note mit/ohne Tendenz,
 * ++ … −−, Smileys, Ampel – eine oder keine). Die KI schlägt die Einstufung nur vor; die
 * Lehrkraft bestätigt sie, erst dann geht der Bogen in den Export. Ohne Einstufung bleibt es
 * bei der Rückmeldung ohne Note (`pruefeBogen` entfernt Noten und Punkte).
 *
 * Datenschutz: Namen bleiben auf diesem Rechner. Die KI sieht nur Kürzel (S1, S2 …);
 * erkannte Namen in Transkripten werden vor der nächsten Anfrage ersetzt (shared/pseudonymisierung).
 * Ein Nachteilsausgleich geht nur als MASSNAHME an die KI, nie als Diagnose.
 */
import type { KiHerkunft, KiVermerk } from '@shared/kiKennzeichnung'
import type { Zuordnung } from '@shared/pseudonymisierung'

/** Formen der Rückmeldung – mehrere wählbar */
export type FormArt = 'schriftlich' | 'tipps' | 'tabelle' | 'rand' | 'scan' | 'ueberarbeitung'

/** Einstufung – genau eine oder keine */
export type EinstufungsArt = 'keine' | 'notenpunkte' | 'noteTendenz' | 'note' | 'plusMinus' | 'smileys' | 'ampel'

export type EinstufungsEbene = 'gesamt' | 'kriterien' | 'beides'

export type GrundlageArt = 'arbeitsblatt' | 'klassenarbeit' | 'lernzielkontrolle' | 'grammatiktest' | 'vokabeltest' | 'frei'

export interface Grundlage {
  art: GrundlageArt
  /** Kennung des Materials in seiner Bibliothek (nicht bei „frei") */
  docId?: string
  titel: string
  /** Die Aufgaben als Text – so, wie die KI sie für die Rückmeldung braucht */
  aufgaben: string
  /** Erwartungshorizont bzw. Lösungen, falls vorhanden */
  erwartung?: string
}

export type Einschaetzung = 'sicher' | 'teilweise' | 'noch nicht'

export interface BogenKriterium {
  kriterium: string
  einschaetzung: Einschaetzung
  /** Beleg aus der Abgabe (kurzes Zitat oder Stelle) */
  beleg?: string
}

/**
 * Kommentar am Korrekturrand (29.09.2026). Beim digitalen Text hängt er an einem wörtlichen
 * Zitat; beim Scan zusätzlich an einer Stelle im Bild (Seite, x/y in Prozent), die die KI
 * ungefähr setzt und die Lehrkraft per Ziehen genau einstellt.
 */
export interface RandKommentar {
  id: string
  /** Wörtliche Stelle aus der Abgabe (mit Kürzeln statt Namen, wie die KI sie kennt) */
  zitat: string
  text: string
  /** Korrekturzeichen (R, Gr, Z …) aus der Liste des Fachs – leer bei Lob und Hinweisen */
  zeichen?: string
  art: 'lob' | 'fehler' | 'hinweis'
  /** Scan: Seite (0-basiert) und Lage in Prozent der Seitenbreite/-höhe */
  seite?: number
  x?: number
  y?: number
  /** Von der Lehrkraft verschoben oder gesetzt */
  gesetzt?: boolean
  /** Gilt wegen Notenschutz nur als Hinweis, fließt nicht in die Wertung ein */
  ohneWertung?: boolean
}

/** Wertung eines Kriteriums der Bewertungstabelle */
export interface TabellenWertung {
  kriteriumId: string
  /** Erreichte Punkte (bei Kriterien mit Höchstpunktzahl) */
  punkte?: number
  /** Gewählte Stufe (Index in `Bewertungstabelle.stufen`, 0 = beste) bei Kriterien ohne Punkte */
  stufe?: number
  begruendung?: string
}

/** Ein Fehlerschwerpunkt der Abgabe – Grundlage des Fehlerprofils der Lerngruppe */
export interface Fehlerschwerpunkt {
  kategorie: string
  beispiel?: string
}

/**
 * Einstufung auf der gewählten Skala (29.09.2026): Die KI schlägt vor, die Lehrkraft bestätigt.
 * `anteil` ist der Erfüllungsgrad in Prozent, aus dem die App den Wert der Skala ableitet
 * (bei einer Tabelle mit Punkten aus der Punktsumme).
 */
export interface Einstufungswert {
  anteil: number
  /** Wert auf der Skala („2−", „11", „++", „gut" …) – von der Lehrkraft änderbar */
  wert: string
  /** Von der Lehrkraft bestätigt (oder selbst gesetzt); erst dann geht der Bogen in den Export */
  bestaetigt?: boolean
  begruendung?: string
}

export interface Bogen {
  /** Was schon gelingt – konkret, mit Bezug auf die Abgabe */
  staerken: string[]
  /** Die nächsten Schritte – als Handlungen formuliert */
  schritte: string[]
  kriterien: BogenKriterium[]
  /** Ein persönlicher Satz zum Schluss */
  schluss?: string
  /** Was `pruefeBogen` entfernt hat (Noten, Punkte) – für einen Hinweis an die Lehrkraft */
  entfernt?: number
  /** Einstufung der Gesamtleistung */
  gesamt?: Einstufungswert
  /** Einstufung je Kriterium (gleiche Reihenfolge wie `kriterien`) */
  kriterienStufen?: (Einstufungswert | null)[]
  /** Kommentare am Korrekturrand bzw. am Scan */
  rand?: RandKommentar[]
  /** Wertung je Kriterium der Bewertungstabelle */
  tabelle?: TabellenWertung[]
  /** Überarbeitungsauftrag zu einer Stelle */
  ueberarbeitung?: { zitat: string; auftrag: string }
  fehler?: Fehlerschwerpunkt[]
  /** Fassung für die Eltern (Deutsch, einfache Sprache) und ihre Übersetzungen je Sprachcode */
  eltern?: string
  elternUebersetzt?: Record<string, string>
}

/** Nachteilsausgleich bzw. Notenschutz einer Abgabe – Katalog in nachteilsausgleich.ts */
export interface Nachteilsausgleich {
  massnahmen: string[]
  /** Eigene Angabe der Lehrkraft (vor der Anfrage von Diagnosewörtern bereinigt) */
  eigene?: string
}

export interface Abgabe {
  id: string
  /** Kürzel, unter dem die KI die Abgabe kennt (S1, S2 …) */
  kuerzel: string
  /** Name – nur auf diesem Rechner, geht nie an die KI */
  name: string
  dateiname: string
  /** Text der Abgabe (getippt, aus Datei gelesen oder aus dem Foto übertragen) – mit Kürzeln statt Namen */
  text: string
  /** Seitenbilder (Foto, Scan) – nur solange kein Text übertragen ist */
  bilder: string[]
  /** Namen, die im Text ersetzt wurden (Kürzel → Name), bleiben lokal */
  pseudonyme?: Zuordnung[]
  /**
   * Die Seitenbilder bleiben nach dem Übertragen erhalten (29.09.2026) – für Kommentare neben
   * dem eingescannten Schülertext. `bilder` leert sich wie bisher, sobald der Text da ist.
   */
  scans?: string[]
  /** Nachteilsausgleich für diese Abgabe (nur Maßnahmen, nie eine Diagnose) */
  ausgleich?: Nachteilsausgleich
  /** Familiensprache für die Elternfassung (Code aus shared/familiensprachen.ts) */
  familiensprache?: string
  bogen?: Bogen
}

/** Kriterium einer Bewertungstabelle */
export interface TabellenKriterium {
  id: string
  /** Bereich (z. B. Inhalt, Darstellung/Sprache) */
  bereich?: string
  kriterium: string
  /** Höchstpunktzahl; fehlt sie, wird über Stufen bewertet */
  punkte?: number
  /** Beschreibung je Stufe (gleiche Reihenfolge wie `Bewertungstabelle.stufen`) */
  deskriptoren?: string[]
}

export interface Bewertungstabelle {
  titel: string
  kriterien: TabellenKriterium[]
  /** Stufen für Kriterien ohne Punkte, beste zuerst (z. B. „voll erfüllt", „teilweise", „nicht") */
  stufen: string[]
  quelle: 'datei' | 'ki' | 'eigen'
  /** Entwurf der KI, noch nicht von der Lehrkraft durchgesehen */
  entwurf?: boolean
  /** Kennung in der Vorlagenablage, falls gespeichert */
  vorlageId?: string
}

export interface RueckmeldungMeta {
  title: string
  subjectId: string
  subjectLabel: string
  grade: number
  stateId: string
  schoolTypeId: string
  schoolTypeName: string
  /** Anrede auf dem Bogen */
  anrede: 'du' | 'sie'
  /** Worauf die Lehrkraft achten will (Kriterien, Schwerpunkt) */
  schwerpunkt: string
  /** Aus hineingezogenem Material erkannte Lerngruppe (29.09.2026) – Hinweis neben den Feldern */
  erkannt?: string
  /**
   * Art der Rückmeldung (29.09.2026, Wunsch der Lehrkraft): Formen (mehrere) und eine
   * Einstufung. Fehlen die Felder (ältere Rückmeldungen), gilt die bisherige Rückmeldung ohne
   * Note: schriftlich + Tipps, keine Einstufung – siehe `formenVon` in art.ts.
   */
  formen?: FormArt[]
  einstufung?: EinstufungsArt
  /** Wo die Einstufung gilt: Gesamtleistung, je Kriterium oder beides */
  ebene?: EinstufungsEbene
  /** Elternfassung zu jedem Bogen */
  elternfassung?: boolean
  ki?: KiHerkunft
  kiVermerk?: KiVermerk
}

export interface Rueckmeldung {
  version: 1
  meta: RueckmeldungMeta
  grundlage: Grundlage
  abgaben: Abgabe[]
  /** Bewertungstabelle für alle Abgaben dieser Rückmeldung */
  tabelle?: Bewertungstabelle
  createdAt: string
  /** Für die Projektdatei (shared/testmodul/projekt.ts) */
  design?: unknown
}

export const hatInhalt = (r: Rueckmeldung | null): boolean => Boolean(r?.abgaben.some((a) => a.bogen))
export const lohntSicherung = (r: Rueckmeldung | null): boolean => Boolean(r && (r.abgaben.length || r.grundlage.aufgaben.trim() || r.meta.title.trim()))

export const standardName = (r: Rueckmeldung): string =>
  r.meta.title.trim() || [r.meta.subjectLabel, r.grundlage.titel].filter(Boolean).join(' – ') || 'Rückmeldung'

export const naechstesKuerzel = (abgaben: Abgabe[]): string => {
  const nummern = abgaben.map((a) => Number(/^S(\d+)$/.exec(a.kuerzel)?.[1] ?? 0))
  return `S${Math.max(0, ...nummern) + 1}`
}
