/**
 * Aufgabenformen für unregelmäßige Verben (30.09.2026) – gemeinsam für Grammatiktest, Arbeitsblatt
 * und Vokabeltest.
 *
 * Auswahl und Voreinstellungen nach der Recherche (recherche/unregelmaessige-verben-2026-09-30.md):
 * - Lernjahr 1–2: Tabelle mit vorgegebener Grundform, dazu wenige Lückensätze.
 * - Lernjahr 3–4: gemischte Lücken in der Tabelle, Lückensätze, Ankreuzen oder Fehler finden.
 * - ab Lernjahr 5: nur noch im Zusammenhang (Lückensätze, Text in die Vergangenheit setzen).
 * - Bewertung: je Form ein Punkt; erkennbare Form mit Schreibfehler ½ Punkt, falsch gebildete 0.
 * Tabellen, Ankreuzen, Fehler finden, Zuordnen und „Was passt nicht?" entstehen OHNE KI aus den
 * Daten der Liste – die Lösung ist damit genau die Form im Schulbuch. Nur Sätze und Texte im
 * Zusammenhang schreibt die KI; ihre Lösungen prüft die App gegen die Liste.
 */
import type { Anrede } from '../anrede'
import { VERB_SPALTEN, type VerbEintrag, type VerbSprache } from '@shared/verben'

export type VerbFormatId = 'tabelle' | 'tabelleGemischt' | 'auswahl' | 'fehler' | 'muster' | 'ausreisser' | 'lueckensatz' | 'zeitform' | 'uebersetzen'

export interface VerbFormat {
  id: VerbFormatId
  label: string
  beschreibung: string
  /** Braucht die KI (Sätze im Zusammenhang); alle anderen entstehen aus der Liste */
  ki: boolean
  /** Anzahl Zeilen bzw. Sätze, wenn nichts anderes eingestellt ist */
  standardAnzahl: number
}

export const VERB_FORMATE: VerbFormat[] = [
  {
    id: 'tabelle',
    label: 'Tabelle ergänzen (eine Spalte vorgegeben)',
    beschreibung: 'Eine Spalte steht da (z. B. infinitive oder German), die übrigen Formen werden ergänzt – wie die Tabelle im Schulbuch.',
    ki: false,
    standardAnzahl: 10
  },
  {
    id: 'tabelleGemischt',
    label: 'Tabelle mit gemischten Lücken',
    beschreibung: 'In jeder Zeile ist eine andere Form vorgegeben; Auswendiglernen der Reihenfolge hilft nicht.',
    ki: false,
    standardAnzahl: 10
  },
  {
    id: 'auswahl',
    label: 'Richtige Form ankreuzen',
    beschreibung: 'Ankreuzen zwischen der richtigen Form und typischen Fehlformen (*goed, *brang, *have went) – gut zur Diagnose.',
    ki: false,
    standardAnzahl: 6
  },
  {
    id: 'fehler',
    label: 'Fehler finden und berichtigen',
    beschreibung: 'In jeder Zeile ist eine Form falsch (typischer Fehler); sie wird gefunden und berichtigt.',
    ki: false,
    standardAnzahl: 5
  },
  {
    id: 'muster',
    label: 'Nach Bildungsmuster zuordnen',
    beschreibung: 'Verben den Mustern zuordnen (A–A–A, A–B–B, A–B–C; Perfektbildung; Partizipendung).',
    ki: false,
    standardAnzahl: 6
  },
  {
    id: 'ausreisser',
    label: 'Was passt nicht? (odd one out)',
    beschreibung: 'Drei Verben folgen demselben Muster, eines nicht.',
    ki: false,
    standardAnzahl: 4
  },
  {
    id: 'lueckensatz',
    label: 'Lückensätze im Zusammenhang',
    beschreibung: 'Sätze mit Lücke und Grundform in Klammern; die KI schreibt die Sätze, die Lösung stammt aus der Liste.',
    ki: true,
    standardAnzahl: 6
  },
  {
    id: 'zeitform',
    label: 'Text in die Vergangenheit setzen',
    beschreibung: 'Ein kurzer zusammenhängender Text; die Verben werden in die verlangte Form gesetzt.',
    ki: true,
    standardAnzahl: 6
  },
  {
    id: 'uebersetzen',
    label: 'Sätze übersetzen',
    beschreibung: 'Deutsche Sätze übersetzen; bewertet wird die Verbform.',
    ki: true,
    standardAnzahl: 4
  }
]

export const formatVon = (id: VerbFormatId): VerbFormat => VERB_FORMATE.find((f) => f.id === id) ?? VERB_FORMATE[0]
export const OHNE_KI: VerbFormatId[] = VERB_FORMATE.filter((f) => !f.ki).map((f) => f.id)

/** Wie Schreibfehler zählen – je Form ein Punkt */
export type Rechtschreibung = 'halb' | 'streng'

/** Einstellungen einer Verb-Aufgabe – im Grammatiktest, im Arbeitsblatt und im Vokabeltest gleich */
export interface VerbAufgabe {
  sprache: VerbSprache
  /** Woher die Verben kommen */
  quelle: 'lehrwerk' | 'standard'
  /** Verbliste (Lehrwerk-Band) bei quelle = 'lehrwerk' */
  listeId?: string
  listenName?: string
  /** Verben früherer Bände derselben Reihe mitnehmen (Green Line 3 + Green Line 2) */
  kumulativ: boolean
  lernjahr: number
  /**
   * Die ausgewählten Verben als Schnappschuss. So bleibt ein Test gleich, auch wenn die Liste später
   * geändert wird – und die Erzeugung braucht keinen Zugriff auf die Ablage.
   */
  verben: VerbEintrag[]
  formate: VerbFormatId[]
  /** Zeilen bzw. Sätze je Format */
  anzahl: Partial<Record<VerbFormatId, number>>
  /** Spalten, die in den Tabellen stehen (Spalten-Kennungen aus shared/verben.ts) */
  spalten: string[]
  /** Vorgegebene Spalte bei „Tabelle ergänzen" */
  vorgabe: string
  /** Zielform bei Lückensätzen und „in die Vergangenheit setzen" (Spalten-Kennung) */
  zielform: string
  rechtschreibung: Rechtschreibung
  /** Arbeitsanweisungen auf Deutsch (Latein und Russisch immer) */
  anweisungDeutsch: boolean
  seed: number
}

/** Formate, die für dieses Lernjahr voreingestellt werden */
export function formateFuerLernjahr(lernjahr: number, sprache: VerbSprache): VerbFormatId[] {
  if (sprache === 'la') return lernjahr <= 2 ? ['tabelle', 'muster'] : ['tabelleGemischt', 'muster', 'ausreisser']
  if (lernjahr <= 2) return ['tabelle', 'lueckensatz']
  if (lernjahr <= 4) return ['tabelleGemischt', 'lueckensatz', 'auswahl']
  return ['lueckensatz', 'zeitform']
}

/** Spalten, die in den ersten Lernjahren abgefragt werden – später alle */
export function spaltenFuerLernjahr(sprache: VerbSprache, lernjahr: number): string[] {
  const alle = VERB_SPALTEN[sprache].map((s) => s.id)
  if (sprache === 'fr' && lernjahr <= 2) return ['inf', 'je', 'nous', 'ils', 'pc', 'de']
  if (sprache === 'es' && lernjahr <= 1) return ['inf', 'yo', 'nos', 'de']
  if (sprache === 'it' && lernjahr <= 1) return ['inf', 'io', 'loro', 'de']
  return alle
}

/** Zielform für Sätze im Zusammenhang: die einfache Vergangenheit der Sprache */
export const ZIELFORM: Record<VerbSprache, string> = { en: 'past', fr: 'pc', es: 'indef', it: 'pp', ru: 'past', la: 'perf' }

/** Wie viele Verben die Voreinstellung wählt – nach Lernjahr (Recherche: 10–15, später 15–20; romanisch weniger) */
export function verbzahlFuerLernjahr(lernjahr: number, sprache: VerbSprache): number {
  const romanisch = sprache === 'fr' || sprache === 'es' || sprache === 'it'
  if (lernjahr <= 2) return romanisch ? 8 : 12
  return romanisch ? 12 : 16
}

/** Russisch und Latein: Anweisungen immer auf Deutsch (so in den Lehrwerken) */
export const immerDeutsch = (sprache: VerbSprache): boolean => sprache === 'ru' || sprache === 'la'

// ---------- Arbeitsanweisungen ----------

type Anweisungen = Record<VerbFormatId, string>

const ZIEL: Partial<Record<VerbSprache, Anweisungen>> = {
  en: {
    tabelle: 'Complete the table with the missing verb forms.',
    tabelleGemischt: 'Complete the table. One form is given in each line.',
    auswahl: 'Tick the correct form.',
    fehler: 'One form in each line is wrong. Correct it.',
    muster: 'Which pattern do the verbs follow? Write the letter in the box.',
    ausreisser: 'Which verb does not follow the same pattern? Tick the odd one out.',
    lueckensatz: 'Complete the sentences. Use the correct form of the verb in brackets.',
    zeitform: 'Put the verbs in brackets into the correct form.',
    uebersetzen: 'Translate the sentences into English.'
  },
  fr: {
    tabelle: 'Complète le tableau.',
    tabelleGemischt: 'Complète le tableau. Dans chaque ligne, une forme est donnée.',
    auswahl: 'Coche la bonne forme.',
    fehler: 'Dans chaque ligne, une forme est fausse. Corrige-la.',
    muster: 'Quel modèle suivent les verbes ? Écris la bonne lettre dans la case.',
    ausreisser: "Quel verbe ne suit pas le même modèle ? Coche l'intrus.",
    lueckensatz: 'Complète les phrases avec la bonne forme du verbe entre parenthèses.',
    zeitform: 'Mets les verbes entre parenthèses à la bonne forme.',
    uebersetzen: 'Traduis les phrases en français.'
  },
  es: {
    tabelle: 'Completa la tabla.',
    tabelleGemischt: 'Completa la tabla. En cada línea hay una forma dada.',
    auswahl: 'Marca la forma correcta.',
    fehler: 'En cada línea hay una forma incorrecta. Corrígela.',
    muster: '¿Qué modelo siguen los verbos? Escribe la letra correcta en la casilla.',
    ausreisser: '¿Qué verbo no sigue el mismo modelo? Marca el intruso.',
    lueckensatz: 'Completa las frases con la forma correcta del verbo entre paréntesis.',
    zeitform: 'Pon los verbos entre paréntesis en la forma correcta.',
    uebersetzen: 'Traduce las frases al español.'
  },
  it: {
    tabelle: 'Completa la tabella.',
    tabelleGemischt: 'Completa la tabella. In ogni riga è data una forma.',
    auswahl: 'Segna la forma corretta.',
    fehler: "In ogni riga c'è una forma sbagliata. Correggila.",
    muster: 'Quale modello seguono i verbi? Scrivi la lettera giusta nella casella.',
    ausreisser: "Quale verbo non segue lo stesso modello? Segna l'intruso.",
    lueckensatz: 'Completa le frasi con la forma corretta del verbo tra parentesi.',
    zeitform: 'Metti i verbi tra parentesi nella forma corretta.',
    uebersetzen: 'Traduci le frasi in italiano.'
  }
}

const DEUTSCH: Record<Anrede, Anweisungen> = {
  du: {
    tabelle: 'Ergänze die fehlenden Verbformen in der Tabelle.',
    tabelleGemischt: 'Ergänze die Tabelle. In jeder Zeile ist eine Form vorgegeben.',
    auswahl: 'Kreuze die richtige Form an.',
    fehler: 'In jeder Zeile ist eine Form falsch. Berichtige sie.',
    muster: 'Welchem Muster folgen die Verben? Trage den Buchstaben ins Kästchen ein.',
    ausreisser: 'Welches Verb folgt nicht demselben Muster? Kreuze es an.',
    lueckensatz: 'Ergänze die Sätze mit der richtigen Form des Verbs in Klammern.',
    zeitform: 'Setze die Verben in Klammern in die verlangte Form.',
    uebersetzen: 'Übersetze die Sätze.'
  },
  sie: {
    tabelle: 'Ergänzen Sie die fehlenden Verbformen in der Tabelle.',
    tabelleGemischt: 'Ergänzen Sie die Tabelle. In jeder Zeile ist eine Form vorgegeben.',
    auswahl: 'Kreuzen Sie die richtige Form an.',
    fehler: 'In jeder Zeile ist eine Form falsch. Berichtigen Sie sie.',
    muster: 'Welchem Muster folgen die Verben? Tragen Sie den Buchstaben ins Kästchen ein.',
    ausreisser: 'Welches Verb folgt nicht demselben Muster? Kreuzen Sie es an.',
    lueckensatz: 'Ergänzen Sie die Sätze mit der richtigen Form des Verbs in Klammern.',
    zeitform: 'Setzen Sie die Verben in Klammern in die verlangte Form.',
    uebersetzen: 'Übersetzen Sie die Sätze.'
  }
}

export function anweisung(format: VerbFormatId, a: Pick<VerbAufgabe, 'sprache' | 'anweisungDeutsch'>, anrede: Anrede): string {
  const ziel = ZIEL[a.sprache]
  if (ziel && !a.anweisungDeutsch && !immerDeutsch(a.sprache)) return ziel[format]
  return DEUTSCH[anrede === 'sie' ? 'sie' : 'du'][format]
}

/** Überschrift der Aufgabe im Kopfkasten bzw. in der Aufgabenliste */
export const TITEL: Record<VerbSprache, string> = {
  en: 'Irregular verbs',
  fr: 'Verbes irréguliers',
  es: 'Verbos irregulares',
  it: 'Verbi irregolari',
  ru: 'Unregelmäßige Verben',
  la: 'Stammformen'
}
