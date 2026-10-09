/**
 * Mehrspieler-Spiele „Kooperativ" und „Versus" (08.10.2026, Plan refactored-wishing-iverson, Welle 1) – gemeinsame
 * Begriffe für Server, Oberfläche und Tests.
 *
 * Grundsätze (abgestimmt): Lobby mit Einladungscode, bis 4 Spieler aus DEMSELBEN Kurs; der Server prüft jede Antwort,
 * die Geräte bekommen nie die Lösung vorab (nur Fragen und Möglichkeiten, die Lösung erst nach dem Zug als
 * Rückmeldung); Spielzustand nur im Speicher, Ergebnisse danach wie bei den Einzelspielen (Rekordbuch, „nochmal
 * ansehen", Fehler machen das Wort wackelig). Versus: Handicap nach Können, kein öffentlicher letzter Platz.
 */

export type MehrspielId =
  // Welle 1
  | 'teammatch'
  | 'satzbaustelle'
  | 'fluchtraum'
  | 'beschreiben'
  | 'tauziehen'
  | 'staffel'
  | 'bingo'
  | 'schiffe'
  // Welle 2 – Kooperativ
  | 'wortkette'
  | 'bildergeschichte'
  | 'teammemory'
  | 'kreuzwort'
  | 'fehlerdetektive'
  | 'uebersetzung'
  | 'dialog'
  | 'woerterturm'
  | 'hoerkette'
  | 'zeitstrahl'
  | 'reiseplaner'
  // Welle 2 – Versus
  | 'schnapp'
  | 'galgen'
  | 'buzzer'
  | 'konjugation'
  | 'umbau'
  | 'kollokation'
  | 'auktion'
  | 'domino'
  | 'stadtland'
  | 'sniper'
  | 'synonyme'
export type MehrArt = 'koop' | 'versus'
export type Bereich = 'vok' | 'gram'
/** Schwierigkeit der Runde und zugleich Band eines Items */
export type Schwierigkeit = 'leicht' | 'mittel' | 'schwer' | 'unmoeglich'
export type Band = Schwierigkeit

export const SCHWIERIGKEITEN: { id: Schwierigkeit; name: string; text: string }[] = [
  { id: 'leicht', name: 'Leicht', text: 'Wörter, die alle sicher können' },
  { id: 'mittel', name: 'Mittel', text: 'Ab und zu ging etwas daneben' },
  { id: 'schwer', name: 'Schwer', text: 'Öfter falsch – gut zum Üben' },
  { id: 'unmoeglich', name: 'Unmöglich', text: 'Die Stolpersteine von allen' }
]
export const BAND_RANG: Record<Band, number> = { leicht: 0, mittel: 1, schwer: 2, unmoeglich: 3 }
export const istSchwierigkeit = (x: unknown): x is Schwierigkeit => typeof x === 'string' && x in BAND_RANG

export interface MehrspielInfo {
  id: MehrspielId
  /** Deutscher Name (Lehrkraft, Tests); Lernende sehen den Namen der Zielsprache (spielSprache.ts, 09.10.2026) */
  name: string
  art: MehrArt
  min: number
  max: number
  bereiche: Bereich[]
  beschreibung: string
  /** Wie der eigene Wert im Rekordbuch zählt */
  einheit: string
  kleinerBesser: boolean
  /** Zählt für die Achievements der Gruppe „Zusammen" (Beschreib-Raten nicht, abgestimmt) */
  achievements: boolean
  /** Jahrgangsband (Klasse des Kurses ±1 steuert die Sichtbarkeit); fehlt = alle */
  jahrgang?: [number, number]
}

function k(
  id: MehrspielId,
  name: string,
  art: MehrArt,
  bereiche: Bereich[],
  jahrgang: [number, number],
  beschreibung: string,
  einheit: string,
  kleinerBesser: boolean
): MehrspielInfo {
  return { id, name, art, min: 2, max: 4, bereiche, beschreibung, einheit, kleinerBesser, achievements: true, jahrgang }
}

export const MEHRSPIELE: MehrspielInfo[] = [
  {
    id: 'teammatch',
    name: 'Team-Match',
    art: 'koop',
    min: 2,
    max: 4,
    bereiche: ['vok', 'gram'],
    beschreibung: 'Alle sehen die Frage – die richtige Antwort steht nur auf einem Gerät. Redet miteinander!',
    einheit: 'gelöst',
    kleinerBesser: false,
    achievements: true
  },
  {
    id: 'satzbaustelle',
    name: 'Satzbaustelle',
    art: 'koop',
    min: 2,
    max: 4,
    bereiche: ['vok', 'gram'],
    beschreibung: 'Jede und jeder hat ein paar Wörter des Satzes – legt sie gemeinsam in die richtige Reihenfolge.',
    einheit: 'Fehler',
    kleinerBesser: true,
    achievements: true
  },
  {
    id: 'fluchtraum',
    name: 'Fluchtraum',
    art: 'koop',
    min: 2,
    max: 4,
    bereiche: ['vok', 'gram'],
    beschreibung: 'Löst gemeinsam Aufgaben: Nach ein paar richtigen Antworten gibt es einen Buchstaben des Codeworts. Errätst ihr es, seid ihr frei!',
    einheit: 's',
    kleinerBesser: true,
    achievements: true
  },
  {
    id: 'beschreiben',
    name: 'Beschreib-Raten',
    art: 'koop',
    min: 2,
    max: 4,
    bereiche: ['vok'],
    beschreibung: 'Eine Person sieht das Wort und wählt Hinweise, die anderen raten. Die Rollen wechseln.',
    einheit: 'erraten',
    kleinerBesser: false,
    achievements: false
  },
  {
    id: 'tauziehen',
    name: 'Tauziehen',
    art: 'versus',
    min: 2,
    max: 4,
    bereiche: ['vok', 'gram'],
    beschreibung: 'Jede richtige Antwort zieht das Seil zu deiner Seite. Schwerere Fragen ziehen stärker, ab „schwer“ mit mehrteiligen Aufgaben.',
    einheit: 'Punkte',
    kleinerBesser: false,
    achievements: true
  },
  {
    id: 'staffel',
    name: 'Formen-Staffel',
    art: 'versus',
    min: 2,
    max: 4,
    bereiche: ['vok', 'gram'],
    beschreibung: 'Die Teams antworten abwechselnd. Wer zuerst zehn Felder füllt, gewinnt.',
    einheit: 'richtig',
    kleinerBesser: false,
    achievements: true
  },
  {
    id: 'bingo',
    name: 'Wort-Bingo',
    art: 'versus',
    min: 2,
    max: 4,
    bereiche: ['vok'],
    beschreibung: 'Die App ruft Wörter auf – tippe die Bedeutung in deinem Feld. Eine volle Reihe ist Bingo.',
    einheit: 'Aufrufe',
    kleinerBesser: true,
    achievements: true
  },
  {
    id: 'schiffe',
    name: 'Schiffe versenken',
    art: 'versus',
    min: 2,
    max: 4,
    bereiche: ['vok', 'gram'],
    beschreibung: 'Ein paar richtige Antworten laden einen Schuss. Wer zuerst alle Schiffe findet, gewinnt.',
    einheit: 'Treffer',
    kleinerBesser: false,
    achievements: true
  }
,
  // ---------------------------------------------------------------- Welle 2 (abgestimmt 08.10.2026)
  k('wortkette', 'Wortkette', 'koop', ['vok'], [5, 6], 'Reihum ein Wort – jedes beginnt mit dem letzten Buchstaben des vorigen.', 'Glieder', false),
  k('bildergeschichte', 'Bildergeschichte', 'koop', ['vok'], [5, 7], 'Die Geschichte steht in Wörtern da – legt eure Bilder in die richtige Reihenfolge.', 'Fehler', true),
  k('teammemory', 'Team-Memory', 'koop', ['vok'], [5, 7], 'Reihum zwei Karten aufdecken. Schafft ihr es mit wenigen Zügen?', 'Züge', true),
  k('kreuzwort', 'Geteiltes Kreuzwort', 'koop', ['vok'], [6, 10], 'Jede und jeder hat andere Hinweise – zusammen füllt ihr alle Wörter.', 's', true),
  k('fehlerdetektive', 'Fehlerdetektive', 'koop', ['vok', 'gram'], [8, 13], 'Eine Person findet den Fehler, die nächste verbessert ihn.', 'Fehler', true),
  k('uebersetzung', 'Übersetzungs-Puzzle', 'koop', ['vok', 'gram'], [9, 13], 'Baut gemeinsam die Übersetzung – Vorsicht, nicht jedes Teil gehört dazu.', 'Fehler', true),
  k('dialog', 'Dialog-Theater', 'koop', ['vok'], [6, 10], 'Zwei Rollen, ein Gespräch: Setzt in eurer Zeile das fehlende Wort ein.', 'richtig', false),
  k('woerterturm', 'Wörterturm', 'koop', ['vok', 'gram'], [5, 6], 'Jede richtige Antwort ist ein Stein. Baut den Turm, bevor er wackelt!', 'Steine', false),
  k('hoerkette', 'Hör-Kette', 'koop', ['vok'], [5, 8], 'Eine Person hört das Wort und spricht es nach – die anderen tippen es an.', 'Glieder', false),
  k('zeitstrahl', 'Zeitstrahl', 'koop', ['gram'], [7, 11], 'Ordnet die Sätze auf dem Zeitstrahl und nennt die Zeitform.', 'Fehler', true),
  k('reiseplaner', 'Reiseplaner', 'koop', ['vok'], [5, 10], 'Alle sehen dieselben Reisen, jede und jeder hat eigene Hinweise. Nur alle Hinweise zusammen passen zu genau einer Reise.', 'Fehler', true),
  k('schnapp', 'Schnapp!', 'versus', ['vok'], [5, 6], 'Passen Wort und Bedeutung zusammen? Wer zuerst richtig schnappt, punktet.', 'Punkte', false),
  k('galgen', 'Galgen-Duell', 'versus', ['vok'], [5, 7], 'Errate deine Wörter Buchstabe für Buchstabe – wer schafft drei zuerst?', 'Wörter', false),
  k('buzzer', 'Team-Buzzer', 'versus', ['vok', 'gram'], [7, 10], 'Wer zuerst drückt, darf antworten. Daneben? Dann ist das andere Team dran.', 'Punkte', false),
  k('konjugation', 'Konjugations-Duell', 'versus', ['vok'], [7, 10], 'Die richtige Verbform – wer hat zuerst acht?', 'richtig', false),
  k('umbau', 'Umbau-Rennen', 'versus', ['gram'], [9, 13], 'Baue den Satz um – so schnell und sicher wie möglich.', 'Sätze', false),
  k('kollokation', 'Kollokations-Duell', 'versus', ['vok'], [10, 13], 'Welches Wort passt zu den Nachbarwörtern?', 'Punkte', false),
  k('auktion', 'Wort-Auktion', 'versus', ['vok', 'gram'], [8, 13], 'Setze Münzen auf „stimmt" oder „stimmt nicht".', 'Münzen', false),
  k('domino', 'Wort-Domino', 'versus', ['vok'], [5, 7], 'Lege den Stein, dessen Wort zur offenen Bedeutung passt.', 'Steine', false),
  k('stadtland', 'Stadt-Land-Fluss', 'versus', ['vok'], [6, 10], 'Wörter aus eurem Kurs zum Anfangsbuchstaben – der Server prüft.', 'Punkte', false),
  k('sniper', 'Fehler-Sniper', 'versus', ['vok', 'gram'], [8, 13], 'Tippe zuerst den Fehler an und verbessere ihn. Daneben? 3 Sekunden Pause.', 'Punkte', false),
  k('synonyme', 'Synonym-Leiter', 'versus', ['vok'], [10, 13], 'Wörter mit gleicher Bedeutung bringen dich nach oben.', 'Sprossen', false)
]

export const mehrspielInfo = (id: string): MehrspielInfo | undefined => MEHRSPIELE.find((s) => s.id === id)
export const istMehrspielId = (x: unknown): x is MehrspielId => typeof x === 'string' && MEHRSPIELE.some((s) => s.id === x)

/** Bit je Spielart für „alle Spielarten ausprobiert" (ohne Beschreib-Raten) */
export const SPIELART_BIT: Partial<Record<MehrspielId, number>> = Object.fromEntries(
  MEHRSPIELE.filter((s) => s.achievements).map((s, i) => [s.id, 1 << i])
) as Partial<Record<MehrspielId, number>>
export const ALLE_SPIELARTEN = Object.values(SPIELART_BIT).reduce((a, b) => (a ?? 0) | (b ?? 0), 0) ?? 0

/** Feste Kurzrufe – kein freier Chat (abgestimmt) */
export const KURZRUFE: readonly string[] = ['Gut gemacht!', 'Hilfe?', 'Ich bin dran', 'Super Team!', 'Moment …']

/** Einladungscode: sechs Ziffern – unterscheidet sich von den übrigen Codes (Buchstaben und Ziffern) */
export const istSpielCode = (s: string): boolean => /^\d{6}$/.test(s)

/**
 * Ein Item im Speicher des Servers (nie so an die Geräte): Frage, Lösung, Ablenker; bei Vokabeln dazu Wort und
 * Übersetzung (für die Fragearten des Fluchtraums, Bingo und Beschreib-Raten), bei Sätzen die Teile in richtiger
 * Reihenfolge.
 */
export interface SpielItem {
  id: string
  frage: string
  zusatz?: string
  loesung: string
  /** Weitere richtige Schreibweisen (bei Wahl-Antworten nur zur Absicherung) */
  alternativen?: string[]
  ablenker: string[]
  /** Satz in richtiger Reihenfolge (Satzbaustelle) und der Hinweis dazu */
  satz?: string[]
  satzHinweis?: string
  vok?: {
    term: string
    translation: string
    pos?: string
    note?: string
    /** Beispielsatz mit Lücke */
    luecke?: { vor: string; nach: string; loesung: string }
    beispiel?: string
    beispielDe?: string
    bild?: string
  }
  /** Satz mit genau einem falschen Wort (Grammatik „Fehler finden" bzw. aus Beispielsätzen) */
  fehler?: {
    satz: string
    wort: string
    korrektur: string
    /** Wortstellen (Index in satzTeile(satz)), die den Fehler tragen – nur auf dem Server; nie leer (09.10.2026) */
    stellen: number[]
  }
  /** Umformen (Grammatik): Ausgangssatz, Vorgabe, Lösung */
  umformen?: { satz: string; vorgabe: string; loesung: string }
  /** Übersetzung: deutscher Satz und die Teile der Lösung */
  uebersetzung?: { de: string; teile: string[] }
}

/** Eine Frage mit Möglichkeiten – `loesung` bleibt auf dem Server */
export interface Frage {
  itemId: string
  frage: string
  zusatz?: string
  optionen: string[]
  loesung: string
  /** Schreiben statt antippen */
  tippen?: boolean
  alternativen?: string[]
}

/** Rückmeldung nach einem Zug – erst jetzt kommt die Lösung auf die Geräte */
export interface Rueckmeldung {
  nr: number
  wer: string
  richtig: boolean
  text: string
  loesung?: string
}

/** Ergebnis eines Spiels je Person (privat) und für alle */
/** Satz mit Zeitform (Zeitstrahl) */
export interface ZeitSatz {
  id: string
  satz: string
  zeitform: string
  name: string
  /** Lage auf dem Zeitstrahl: 0 Vergangenheit … 3 Zukunft */
  rang: number
}

/** Unregelmäßiges Verb (Konjugations-Duell): Formen je Spalte mit Beschriftung */
export interface VerbFormen {
  id: string
  de: string
  formen: { label: string; wert: string }[]
}

/** Alles, was ein Spiel an Inhalt bekommt – ohne KI, aus Kurs und Katalogform */
export interface SpielInhalt {
  bereich: Bereich
  sprache: string
  items: SpielItem[]
  verben: VerbFormen[]
  zeitSaetze: ZeitSatz[]
  /** Gruppen gleichbedeutender Wörter (gleiche Übersetzung oder „=" in der Notiz) */
  synonyme: { de: string; woerter: string[] }[]
  /** Wörter des Lehrwerks der Klasse bis zum aktuellen Stand (alle Bände der Reihe davor) – Reiseplaner (09.10.2026) */
  lehrwerk?: string[]
  /** Davon: Wörter, die alle Mitspielenden im Vokabelweg schon kennengelernt haben (zuerst gewählt) */
  lehrwerkGemeinsam?: string[]
}

export interface SpielErgebnis {
  jeSpieler: Record<string, { wert: number | null; richtig: number; fehler: string[]; gewonnen?: boolean; platz?: number }>
  /** Kooperativ: Team-Ziel erreicht */
  teamZiel?: boolean
  /** Versus: Siegerinnen und Sieger (Personen) bzw. Name des Siegerteams */
  sieger?: string[]
  unentschieden?: boolean
  comeback?: boolean
  fehlerfrei?: boolean
  text: string
}
