/**
 * Zwei Regelwerke für Hörtexte – und der Unterschied ist grundsätzlich.
 *
 * FREMDSPRACHEN UND DEUTSCH: Das Hören SELBST ist der Prüfgegenstand. Dafür gilt die
 * Vorgabe der KMK-Bildungsstandards fortgeführte Fremdsprache (Abitur 2012): Der Text wird
 * in der Regel zweimal gehört, vorher gibt es Lesezeit für die Aufgaben – und das Transkript
 * bleibt beim Lehrkraft-Teil. Läge es der Klasse vor, prüfte man Lesen statt Hören.
 * Für Deutsch ist „Verstehend zuhören" ein eigener Kernbereich der Bildungsstandards
 * (ESA/MSA 2022) und eine getestete Domäne in VERA-8.
 *
 * SACHFÄCHER: Dort ist eine Aufnahme MATERIAL, kein Prüfgegenstand. Geprüft wird Fachwissen.
 * Die EPA Geschichte sagt dazu wörtlich (3.3.3): Auditive Medienprodukte müssen „während der
 * Prüfung STÄNDIG ABRUFBAR sein" und sind „soweit möglich bzw. erforderlich, IN
 * VERSCHRIFTLICHTER FORM BEIZUFÜGEN (z. B. Redemanuskript, Liedtext)".
 *
 * Das ist das genaue Gegenteil der Fremdsprachenregel. Wer beides gleich behandelt, macht in
 * einem der beiden Fälle etwas falsch: Entweder nimmt er dem Hörverstehen die Grundlage oder
 * er macht aus einer Materialquelle eine Gedächtnisprüfung.
 *
 * Entscheidung der Lehrkraft (22.09.2026): je Fach unterschiedlich, genau so.
 */
import { subjectById } from '../model/subjects'

export interface AudioRules {
  /** Wie oft abgespielt wird; 0 = so oft wie nötig */
  plays: number
  /** Transkript liegt dem Schülerblatt bei */
  transcriptOnSheet: boolean
  /** Begründung für die Anzeige im Editor und für den Lehrkraft-Hinweis */
  reason: string
}

/**
 * Ist das Hören in diesem Fach der Prüfgegenstand?
 *
 * Fremdsprachen und DaZ: ja, Hörverstehen ist eine eigene funktionale Teilkompetenz.
 * Deutsch: ja, „Verstehend zuhören" ist Kernbereich der Bildungsstandards.
 * Alles andere: nein – dort ist die Aufnahme Material.
 */
export function hoerenIstPruefgegenstand(subjectId: string): boolean {
  return Boolean(subjectById(subjectId).foreignLanguage) || subjectId === 'deutsch' || subjectId === 'daz'
}

export function audioRulesFor(subjectId: string): AudioRules {
  if (hoerenIstPruefgegenstand(subjectId)) {
    return {
      plays: 2,
      transcriptOnSheet: false,
      reason:
        'Hier wird das Hören selbst geprüft: zweimal abspielen, vorher Lesezeit für die Aufgaben, Transkript nur im Lehrkraft-Teil (KMK-Bildungsstandards Fremdsprache 2012; Deutsch: Kernbereich „Verstehend zuhören", Bildungsstandards 2022).'
    }
  }
  return {
    plays: 0,
    transcriptOnSheet: true,
    reason:
      'Hier ist die Aufnahme Material, nicht Prüfgegenstand: so oft abrufbar wie nötig, Transkript liegt bei (EPA Geschichte 3.3.3 – auditive Medienprodukte müssen „ständig abrufbar" und „in verschriftlichter Form beizufügen" sein).'
  }
}

/** Beschriftung der Abspielzahl auf dem Blatt. */
export function playsLabelFor(subjectId: string, plays: number): string {
  if (!hoerenIstPruefgegenstand(subjectId)) return 'so oft anhören, wie du möchtest'
  return plays === 1 ? 'einmal hören' : plays === 2 ? 'zweimal hören' : `${plays}-mal hören`
}

/**
 * Kennzeichnung einer KI-erzeugten Aufnahme auf dem Schülerblatt.
 *
 * Die KMK-Handlungsempfehlung zum Umgang mit Künstlicher Intelligenz (10.10.2024) nennt
 * „notwendige Absprachen zur Verwendung und KENNZEICHNUNG KI-generierter Produkte"; die
 * hessische Handreichung (2023) gibt dafür eine Musterformel. Entscheidung der Lehrkraft:
 * Hinweis auf dem Blatt, nicht in der Tonspur – ein gesprochener Vorspann stört beim
 * Abspielen im Unterricht.
 *
 * WICHTIG: Der Hinweis gilt nur für AUFNAHMEN, DIE DIE APP ERZEUGT HAT. Eine verlinkte
 * Archivaufnahme ist echt; sie so zu kennzeichnen wäre schlicht falsch.
 */
export const AI_AUDIO_NOTE = 'Diese Aufnahme wurde mit Künstlicher Intelligenz erzeugt.'
