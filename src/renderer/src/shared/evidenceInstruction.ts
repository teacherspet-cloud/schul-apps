/**
 * Arbeitsanweisung für Richtig/Falsch MIT Textbeleg (Leseverstehen).
 *
 * BELEGTE GRUNDLAGE:
 * - MSB/QUA-LiS NRW, Unterrichtsvorgaben ZP10 Englisch 2027, Abschnitt 1.5: Für das
 *   Leseverstehen sind „Richtig-/Falsch-Aufgaben MIT BEGRÜNDUNG" vorgesehen – in MSA,
 *   Gymnasium und EESA gleichermaßen.
 * - MSB NRW, Operatorenliste Englisch (ZP10), Operator „give evidence from the text":
 *   „Belege deine Antwort durch ein KURZES ZITAT aus dem Text. VERZICHTE in dieser Aufgabe
 *   AUF ZEILENANGABEN." Aufgabenbeispiel: „Tick the correct box and give one piece of
 *   evidence by quoting short passages from the text."
 * - QUA-LiS NRW, ZP10-FAQ: „Eine Zeilenangabe als Beleg ist nicht vorgesehen … Zeilenangaben
 *   geben keine Punkte."
 * - KMK 2012, illustrierende Prüfungsaufgabe Französisch: „Citez le passage qui justifie
 *   votre réponse."
 *
 * ACHTUNG, das ist die Korrektur eines Fehlers: Die App hat vorher eine ZEILENANGABE als
 * Beleg verlangt („Give the line that proves your answer"). Genau das ist nach NRW wertlos,
 * weil sich daran nicht erkennen lässt, ob die richtige Stelle gemeint war.
 *
 * Spanisch und Italienisch sind NICHT belegt: In den geprüften amtlichen Materialien kommt
 * das Format dort nicht vor (DELE benutzt es gar nicht). Die Fassungen sind sinngemäß
 * gebildet und als Vorschlag gekennzeichnet.
 */
interface EvidenceText {
  /** Die Arbeitsanweisung an die Lernenden */
  instruction: string
  /** Überschrift der Belegspalte */
  column: string
  /** false = sinngemäß gebildet, nicht aus amtlichem Material belegt */
  sourced: boolean
}

const TEXTS: Record<string, EvidenceText> = {
  de: {
    instruction: 'Kreuze an und belege deine Antwort durch ein kurzes Zitat aus dem Text. Verzichte auf Zeilenangaben.',
    column: 'Zitat aus dem Text',
    sourced: true
  },
  en: {
    instruction: 'Tick the correct box and give one piece of evidence by quoting short passages from the text.',
    column: 'Evidence (quotation)',
    sourced: true
  },
  fr: {
    instruction: 'Cochez la bonne case. Citez le passage qui justifie votre réponse.',
    column: 'Citation du texte',
    sourced: true
  },
  es: {
    instruction: 'Marca la casilla correcta y justifica tu respuesta citando el texto.',
    column: 'Cita del texto',
    sourced: false
  },
  it: {
    instruction: 'Segna la casella giusta e giustifica la tua risposta citando il testo.',
    column: 'Citazione dal testo',
    sourced: false
  }
}

/** Sprachcode → Anweisung und Spaltenkopf; unbekannte Sprachen fallen auf Deutsch zurück. */
export function evidenceInstruction(language: string | undefined): EvidenceText {
  return TEXTS[(language ?? 'de').toLowerCase().slice(0, 2)] ?? TEXTS.de
}

/**
 * Punktvergabe: alles oder nichts.
 *
 * QUA-LiS NRW, ZP10-FAQ: „Häufig führen Differenzen zwischen gewählter Antwortoption und
 * Textbeleg dazu, dass nicht zweifelsfrei festgestellt werden kann, ob Schülerinnen und
 * Schüler eine Textaussage richtig verstanden haben oder nicht. … Folglich dürfen nur 0
 * oder 2 Punkte vergeben werden." Gleichlautend KMK 2012 („ohne den Textbeleg werden 0
 * Punkte gegeben") und die DELF-Korrektorenhefte („1,5 point si le choix V/F ET la
 * justification sont corrects, sinon aucun point").
 */
export const EVIDENCE_SCORING = 'Zwei Punkte nur für die richtige Kombination aus Ankreuzen und zutreffendem Zitat – sonst null. Keine Teilpunkte.'
