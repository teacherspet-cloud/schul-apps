/**
 * Abkürzungs-Tabellen je Lehrwerk bzw. Fach (09.10.2026, Wunsch der Lehrkraft). Eine Tabelle beschreibt geprüfte
 * Einträge GENAU so, wie das Lehrwerk sie druckt („YA (= young adults)"); die allgemeinen Regeln (shared/abkuerzung.ts,
 * shared/sprechtext.ts) gelten nur, wo die Tabelle nichts sagt. So lassen sich weitere Lehrwerke (Französisch, Spanisch,
 * Latein) und Fächer (Biologie „DNA", Chemie „H₂O", Geschichte „BRD/DDR") mit einer eigenen Datei ergänzen –
 * Anleitung: recherche/abkuerzungen-green-line.md.
 */

/**
 * Art der Abkürzung:
 *  - buchstabiert: Initialwort, Buchstabe für Buchstabe gesprochen („YA", „UK", „BBC", „DNA")
 *  - akronym: als Wort gesprochen („NASA", „FOMO", „EPIC")
 *  - punkt: Kürzel mit Punkt („e.g.", „p.m.", „No.")
 *  - platzhalter: Platzhalter in Wendungen („sb", „sth", „jmdn.", „etw.")
 *  - einheit: Maßeinheit oder Symbol („m", „ml", „°C")
 *  - kurzwort: gekürztes Wort, als Wort gesprochen („pic", „pro", „admin", „Gen Z")
 *  - anrede: Anrede („Mr", „Mrs", „Ms") – gesprochen in voller Form
 */
export type AbkArt = 'buchstabiert' | 'akronym' | 'punkt' | 'platzhalter' | 'einheit' | 'kurzwort' | 'anrede'

/**
 * Übungen zur Abkürzung im Vokabeltrainer: 'beide' = „Abkürzung schreiben" und „Abkürzung auflösen",
 * 'aufloesen' = nur auflösen, 'kuerzen' = nur die Abkürzung schreiben, 'keine' = gelernt wird nur das Wort selbst
 * (z. B. „PC" – die Langform steht nicht im Buch).
 */
export type AbkUeben = 'beide' | 'aufloesen' | 'kuerzen' | 'keine'

export interface AbkEintrag {
  /** Eintrag genau wie im Lehrwerk (Schlüssel; verglichen ohne Rücksicht auf Leerraum und Apostroph-Zeichen) */
  term: string
  /** Sprachcode des Eintrags („en", „fr", „de" …) */
  sprache: string
  /** Bände, in denen der Eintrag steht (nur zur Übersicht) */
  quellen?: string[]
  /** Die Abkürzung selbst („YA") */
  kurz: string
  /** Langform, wenn das Lehrwerk sie nennt („young adults") – ohne Langform keine Paar-Übung */
  lang?: string
  art: AbkArt
  ueben: AbkUeben
  /** Weitere richtige Antworten über Abkürzung, Langform und deren Kombinationen hinaus */
  auchRichtig?: string[]
  /** Gesprochener Text für die Sprachausgabe (ElevenLabs, Gerätestimme) */
  aussprache: string
  /** Entscheidung bzw. Begründung für die Lehrkraft */
  hinweis?: string
}

/** Eine Tabelle: ein Lehrwerk oder ein Fach */
export interface AbkTabelle {
  id: string
  name: string
  eintraege: AbkEintrag[]
}
