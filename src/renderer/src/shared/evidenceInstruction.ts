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
 * Spanisch, Italienisch und Russisch sind NICHT belegt: In den geprüften amtlichen Materialien kommt
 * das Format dort nicht vor (DELE benutzt es gar nicht). Die Fassungen sind sinngemäß
 * gebildet und als Vorschlag gekennzeichnet.
 */
import { ANREDE_TEXTE, type Anrede } from './anrede'

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
    // Wortlaut der NRW-Operatorenliste (ZP10, also Sek I, daher du) – die Sie-Form für die Oberstufe setzt `evidenceInstruction`
    instruction: ANREDE_TEXTE.textbeleg.du,
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
  // Italienisch (29.09.2026, Nachrecherche 2): „Segnate con una crocetta la risposta giusta" steht wörtlich in den
  // NRW-Operatoren Hörverstehen Italienisch (Abitur ab 2025), hier in der du-Form; der Beleg-Teil ist sinngemäß gebildet
  it: {
    instruction: 'Segna con una crocetta la risposta giusta e giustificala con una breve citazione dal testo.',
    column: 'Citazione dal testo',
    sourced: false
  },
  // Russisch (29.09.2026): ЕГЭ/ОГЭ kennen Richtig/Falsch nur ohne Beleg. Beide Satzteile stehen als Beispiele in der
  // NRW-Operatorenübersicht Russisch (Abitur ab 2025): „отметьте правильный ответ", „Обоснуйте свою точку зрения цитатами
  // из текста" – hier in der du-Form verbunden; die Verbindung selbst ist nicht amtlich, daher sourced: false
  ru: {
    instruction: 'Отметь правильный ответ и обоснуй его короткой цитатой из текста.',
    column: 'Цитата из текста',
    sourced: false
  },
  /*
   * Neue Schulfremdsprachen (30.09.2026): sinngemäß gebildet nach dem englischen Wortlaut, in
   * keinem geprüften amtlichen Material belegt – daher alle sourced: false
   * (recherche/sprachtexte-2026-09-30.md, nicht muttersprachlich geprüft).
   */
  nl: { instruction: 'Kruis het juiste antwoord aan en onderbouw het met een kort citaat uit de tekst.', column: 'Citaat uit de tekst', sourced: false },
  pl: { instruction: 'Zaznacz właściwą odpowiedź i uzasadnij ją krótkim cytatem z tekstu.', column: 'Cytat z tekstu', sourced: false },
  cs: { instruction: 'Označ správnou odpověď a zdůvodni ji krátkou citací z textu.', column: 'Citace z textu', sourced: false },
  pt: { instruction: 'Assinala a resposta correta e justifica-a com uma citação curta do texto.', column: 'Citação do texto', sourced: false },
  tr: { instruction: 'Doğru cevabı işaretle ve metinden kısa bir alıntıyla gerekçelendir.', column: 'Metinden alıntı', sourced: false },
  zh: { instruction: '请选出正确答案，并引用课文中的一句短句作为依据。', column: '课文引文', sourced: false },
  ja: { instruction: '正しい答えに印をつけ、本文から短く引用して根拠を示しなさい。', column: '本文からの引用', sourced: false },
  ar: { instruction: 'ضع علامة على الإجابة الصحيحة وعلّلها باقتباس قصير من النص.', column: 'اقتباس من النص', sourced: false },
  da: { instruction: 'Sæt kryds ved det rigtige svar, og begrund det med et kort citat fra teksten.', column: 'Citat fra teksten', sourced: false },
  el: { instruction: 'Σημείωσε τη σωστή απάντηση και τεκμηρίωσέ την με ένα σύντομο απόσπασμα από το κείμενο.', column: 'Απόσπασμα από το κείμενο', sourced: false }
}

/**
 * Sprachcode → Anweisung und Spaltenkopf; unbekannte Sprachen fallen auf Deutsch zurück.
 * `anrede` gilt nur für die deutsche Fassung: Sek I du, Sek II Sie (Paket 8b).
 */
export function evidenceInstruction(language: string | undefined, anrede: Anrede = 'du'): EvidenceText {
  const text = TEXTS[(language ?? 'de').toLowerCase().slice(0, 2)] ?? TEXTS.de
  return text === TEXTS.de ? { ...text, instruction: ANREDE_TEXTE.textbeleg[anrede] } : text
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
