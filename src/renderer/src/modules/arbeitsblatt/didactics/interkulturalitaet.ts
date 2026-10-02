import { subjectById } from '../model/subjects'

/**
 * Interkulturelle (kommunikative) Kompetenz als Schwerpunkt (02.10.2026).
 *
 * Wunsch der Lehrkraft: „Für bei den Sprachen noch den Kompetenzschwerpunkt ‚Interkulturalität'
 * hinzufügen. Recherchiere dazu auch in den KCs der Fremdsprachen." Entscheidung nach der
 * Recherche: BEIDES – als eigener Schwerpunkt eines Arbeitsblatts und als Zusatzschalter, der auf
 * jeden anderen Schwerpunkt aufsetzt; in Klassenarbeiten nur integrativ (Zusatzschalter).
 *
 * BELEGT (recherche, 02.10.2026):
 * - KMK Bildungsstandards fortgeführte Fremdsprache (Abitur 2012): „Interkulturelle kommunikative
 *   Kompetenz" mit den Dimensionen Wissen, Einstellungen, Bewusstheit; ohne Unterscheidung von
 *   grundlegendem und erhöhtem Niveau; in den Beispielaufgaben INTEGRIERT geprüft, v. a. über die
 *   Sprachmittlung (z. B. „spezifisch deutsche Begriffe … ohne Äquivalente" erklären).
 * - KMK erste Fremdsprache ESA/MSA (2023): Bereich „2.2 Interkulturelle Kompetenz" (plurikulturell
 *   im Sinne des GeR-Begleitbands 2020): soziokulturelles/soziolinguistisches Wissen, Einstellungen
 *   und Empathie, kommunikatives Können; Rolle als „kultureller Mittler".
 * - Niedersachsen, KC Englisch Gymnasium 5–10 (2015): „Interkulturelle (kommunikative) Kompetenz" mit
 *   Orientierungswissen – Umgang mit kultureller Differenz – Praktische Bewältigung von
 *   Begegnungssituationen; sie „wird nicht in Leistungssituationen überprüft".
 * - NRW, KLP Englisch Gymnasium Sek I (G9, 2019): Soziokulturelles Orientierungswissen –
 *   Interkulturelle Einstellungen und Bewusstheit – Interkulturelles Verstehen und Handeln.
 * NICHT geprüft: die KCs Französisch/Spanisch Niedersachsen (vermutlich gleich aufgebaut).
 * Alte Sprachen (Latein, Griechisch) bewusst ausgenommen – dort heißt es anders und ist nicht recherchiert.
 */

export type InterkulturBereich = 'orientierung' | 'differenz' | 'begegnung'

export interface InterkulturSetup {
  aktiv: boolean
  /** Leer = alle drei Teilbereiche */
  bereiche: InterkulturBereich[]
}

export const INTERKULTUR_BEREICHE: { value: InterkulturBereich; label: string; beschreibung: string; aufgaben: string }[] = [
  {
    value: 'orientierung',
    label: 'Soziokulturelles Orientierungswissen',
    beschreibung: 'Wissen über Alltag, Lebensbedingungen, Werte und Institutionen der Zielkulturen – erschließen und anwenden.',
    aufgaben: 'Informationen aus dem Material zu Lebenswelt und Gepflogenheiten erschließen und auf eine Situation anwenden; Vergleich mit der eigenen Lebenswelt'
  },
  {
    value: 'differenz',
    label: 'Umgang mit kultureller Differenz (Einstellungen, Bewusstheit)',
    beschreibung: 'Wahrnehmungen und (Vor-)Urteile erkennen, hinterfragen und relativieren; Perspektiven wechseln und vergleichen.',
    aufgaben:
      'eine verbreitete Vorstellung am Material überprüfen; Perspektivwechsel (z. B. Tagebucheintrag, Brief oder Post aus Sicht einer Person der Zielkultur); Perspektiven vergleichen und abwägen'
  },
  {
    value: 'begegnung',
    label: 'Begegnungssituationen bewältigen (Verstehen und Handeln)',
    beschreibung: 'Sprachlich und kulturell angemessen handeln: Anrede, Höflichkeit, Register, Missverständnisse klären, als Mittler auftreten.',
    aufgaben:
      'Dialog oder Rollenspiel in einer Begegnungssituation; ein Missverständnis erkennen und klären; als „kultureller Mittler" einem Gast etwas Deutsches erklären (Sprachmittlung mit kulturspezifischen Begriffen)'
  }
]

const ALTE_SPRACHEN = ['latein', 'altgriechisch', 'griechisch']

/** Gilt nur in den modernen Fremdsprachen */
export function interkulturMoeglich(subjectId: string): boolean {
  return Boolean(subjectById(subjectId).foreignLanguage) && !ALTE_SPRACHEN.includes(subjectId)
}

/**
 * Wie der Bereich heißt: KMK 2023 (Sek I) „Interkulturelle Kompetenz"; Niedersachsen, NRW und die
 * Oberstufe (KMK 2012) „Interkulturelle kommunikative Kompetenz".
 */
export function interkulturName(meta: { stateId?: string; grade?: number }): string {
  const oberstufe = (meta.grade ?? 0) >= 11
  return oberstufe || meta.stateId === 'NI' || meta.stateId === 'NW' ? 'Interkulturelle kommunikative Kompetenz' : 'Interkulturelle Kompetenz'
}

const gewaehlt = (setup: InterkulturSetup | undefined): (typeof INTERKULTUR_BEREICHE)[number][] => {
  const b = setup?.bereiche?.length ? setup.bereiche : INTERKULTUR_BEREICHE.map((x) => x.value)
  return INTERKULTUR_BEREICHE.filter((x) => b.includes(x.value))
}

/** Teilbereiche als Zeilen für den Auftrag an die KI */
const bereichsZeilen = (setup: InterkulturSetup | undefined): string[] => gewaehlt(setup).map((b) => `- ${b.label}: ${b.beschreibung} Mögliche Aufgaben: ${b.aufgaben}.`)

interface Angaben {
  subjectId: string
  stateId?: string
  grade?: number
  skillFocus?: string
  interkulturell?: InterkulturSetup
}

/**
 * Der eigene Schwerpunkt „Interkulturelle (kommunikative) Kompetenz" eines Arbeitsblatts: Das ganze
 * Blatt ist darauf angelegt – ein Material, das kulturelle Unterschiede oder eine Begegnung zeigt,
 * und Aufgaben über die gewählten Teilbereiche.
 */
export function interkulturSchwerpunktRegeln(meta: Angaben): string {
  if (meta.skillFocus !== 'interkulturell' || !interkulturMoeglich(meta.subjectId)) return ''
  return [
    `SCHWERPUNKT ${interkulturName(meta).toUpperCase()}:`,
    '- Das Blatt hat EIN Material (Sachtext, Erfahrungsbericht, Dialog, Social-Media-Beitrag, Bild mit Text), das einen kulturellen Unterschied, eine Begegnung oder eine Sicht aus der Zielkultur zeigt – authentisch wirkend, auf dem Niveau der Lerngruppe.',
    '- Die Aufgaben führen vom Erschließen über das Vergleichen und Hinterfragen zum Handeln. Teilbereiche (aus den Bildungsstandards bzw. dem Kerncurriculum):',
    ...bereichsZeilen(meta.interkulturell),
    '- Mindestens eine Aufgabe verlangt einen Perspektivwechsel oder sprachliches Handeln in einer Begegnungssituation (nicht nur Wissen abfragen).',
    '- Keine Stereotype bestätigen: Wo eine verbreitete Vorstellung vorkommt, wird sie am Material geprüft und differenziert („viele", „manche", „in dieser Region"), nie als Tatsache über „die" Menschen eines Landes.',
    '- Die eigene Kultur der Lernenden kommt als Vergleich vor, ohne sie zur Norm zu machen; Lernende mit Migrationsgeschichte dürfen ihre Erfahrungen einbringen, müssen es aber nicht (Aufgabe offen formulieren: „aus deiner Erfahrung oder aus dem Material").',
    '- Operatoren u. a.: compare, explain, comment, discuss, put yourself in the position of …, mediate / explain to a friend (in der Zielsprache bzw. nach der Operatorenliste des Landes).'
  ].join('\n')
}

/**
 * Der ZUSATZSCHALTER: setzt auf jeden Schwerpunkt auf (Hör-/Sehverstehen, Sprachmittlung, Schreiben
 * …) und gibt ihm eine interkulturelle Dimension. In Klassenarbeiten nur so – integrativ.
 */
export function interkulturZusatzRegeln(meta: Angaben, opts: { klassenarbeit?: boolean } = {}): string {
  if (!meta.interkulturell?.aktiv || meta.skillFocus === 'interkulturell' || !interkulturMoeglich(meta.subjectId)) return ''
  const nichtEigenstaendig = opts.klassenarbeit && meta.stateId === 'NI' && (meta.grade ?? 0) <= 10
  return [
    `INTERKULTURELLER SCHWERPUNKT (integriert, ${interkulturName(meta)}):`,
    '- Die interkulturelle Dimension steckt IN den Aufgaben des gewählten Schwerpunkts, nicht in einer zusätzlichen Aufgabe: z. B. Sprachmittlung mit kulturspezifischen Begriffen, die erklärt statt übersetzt werden müssen; Hör-/Sehverstehen mit Fragen zu Konventionen und Perspektiven; Schreiben mit Adressaten aus der Zielkultur.',
    '- Teilbereiche, die vorkommen sollen:',
    ...bereichsZeilen(meta.interkulturell),
    '- Bewertung NICHT als eigene Punkte-Kategorie, sondern im Inhaltskriterium der jeweiligen Aufgabe („kulturell angemessen, adressatengerecht"); das gehört in den Erwartungshorizont.',
    nichtEigenstaendig
      ? '- Niedersachsen Sek I: Laut Kerncurriculum wird die interkulturelle Kompetenz nicht eigenständig in Leistungssituationen überprüft – sie wirkt nur über die Teilkompetenzen.'
      : '',
    '- Keine Stereotype bestätigen; Vorstellungen am Material prüfen und differenzieren.'
  ]
    .filter(Boolean)
    .join('\n')
}

/** Hinweis für die Lehrkraft (Klassenarbeit, Niedersachsen Sek I) */
export function interkulturHinweis(meta: Angaben): string {
  if (!meta.interkulturell?.aktiv || meta.stateId !== 'NI' || (meta.grade ?? 0) > 10) return ''
  return 'Interkulturelle Kompetenz wird laut KC Niedersachsen (Sek I) nicht eigenständig bewertet – sie fließt nur über die Teilkompetenzen (Inhaltskriterium) in die Note ein.'
}
