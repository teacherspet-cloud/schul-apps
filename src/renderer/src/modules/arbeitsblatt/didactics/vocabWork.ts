/**
 * Wortschatzarbeit auf Arbeitsblättern (Schwerpunkt „Vokabeln").
 *
 * Grundlage ist eine Auswertung der Fachliteratur und amtlicher Vorgaben:
 * Nation (Four Strands 2007; Vocabulary Research into Practice 2011), Schmitt (Instructed
 * Second Language Vocabulary Learning 2008), Karpicke & Roediger (Science 2008),
 * Karpicke & Bauernschmidt (2011), IES Practice Guide „Organizing Instruction and Study
 * to Improve Student Learning" (2007), Lee & Muncie (2006), Kernlehrpläne NRW und
 * Bildungspläne BW, QUA-LiS NRW, Mercator-Institut und ProDaZ (DaZ/Scaffolding),
 * Goethe-Institut-Wortlisten, Beck/McKeown/Kucan (Robust Vocabulary Instruction).
 *
 * Die wichtigsten belegten Punkte, die hier zu Regeln werden:
 * - Abrufen schlägt Wiederlesen: Wort und Bedeutung dürfen in der Übung nie zugleich sichtbar sein.
 * - Verteiltes Üben wirkt stark; jedes Blatt wiederholt Wörter früherer Blätter.
 * - Offene Formate (Lücke, Kurzantwort) bringen mehr als Ankreuzen – mit Lösungsteil.
 * - Wörter in Kollokationen und mehreren Kontexten statt isoliert.
 * - Geschlossene Sets (Farben, Wochentage) und Synonym-/Antonympaare gemeinsam einzuführen
 *   erschwert das Lernen erheblich – solche Bündel werden vermieden.
 * - Produktiver Gebrauch entsteht nicht von allein: Er braucht eigene Produktionsaufgaben,
 *   am besten mit Schreibgerüst und der Vorgabe, wie viele Zielwörter vorkommen sollen.
 */
import type { VocabWorkMode, WorksheetMeta } from '../model/types'

export interface VocabWorkOption {
  value: VocabWorkMode
  label: string
  description: string
}

export const VOCAB_WORK: VocabWorkOption[] = [
  {
    value: 'introduce',
    label: 'Neue Wörter einführen',
    description: 'Semantisieren: Bedeutung erschließen, Form sichern, erste Abrufübungen.'
  },
  {
    value: 'practise',
    label: 'Üben und festigen',
    description: 'Bekannte Wörter abrufen, ordnen, in Kollokationen und Wortfamilien sichern.'
  },
  {
    value: 'apply',
    label: 'Anwenden',
    description: 'Die Wörter in eigenen Texten und Situationen gebrauchen – mit Schreibgerüst.'
  },
  {
    value: 'revise',
    label: 'Wiederholen (verteiltes Üben)',
    description: 'Gemischte Wiederholung älterer Wörter, überwiegend freier Abruf.'
  },
  {
    value: 'check',
    label: 'Abprüfen (ohne Note)',
    description: 'Feststellen, was sitzt: ohne Hilfen, mit Lösungen zum Selbstvergleich.'
  }
]

/** Empfehlung nach Jahrgang – Faustregel aus den Lehrplanmengen (600–700 Wörter/Jahr). */
export function recommendedWordCount(meta: WorksheetMeta): { min: number; max: number } {
  if (meta.subjectId === 'daz') return { min: 6, max: 10 }
  if (meta.grade <= 6) return { min: 8, max: 10 }
  if (meta.grade <= 8) return { min: 10, max: 12 }
  if (meta.grade <= 10) return { min: 12, max: 15 }
  return { min: 10, max: 15 }
}

/**
 * Zahl der Zielwörter für dieses Blatt. Die Lehrkraft kann die Empfehlung mit einer
 * eigenen Obergrenze überschreiben – dann gilt ihre Zahl.
 */
export function targetWordCount(meta: WorksheetMeta): { min: number; max: number; own: boolean } {
  const rec = recommendedWordCount(meta)
  const own = Math.round(meta.vocabMaxWords ?? 0)
  if (own > 0) return { min: Math.min(rec.min, own), max: own, own: true }
  return { ...rec, own: false }
}

const MODE_RULES: Record<VocabWorkMode, string[]> = {
  introduce: [
    'ANLAGE: neue Wörter einführen (Semantisierung).',
    '- Beginne mit einem kurzen, zusammenhängenden Text oder Dialog, in dem die Zielwörter natürlich vorkommen – nicht mit einer Liste.',
    '- Jedes Zielwort bekommt eine Bedeutungsklärung in einem vollständigen Satz („friendly explanation"), dazu bei Bedarf die deutsche Entsprechung. Wörterbuchdefinitionen vermeiden.',
    '- Danach eine Aufgabe, in der die Lernenden die Bedeutung aus dem Kontext erschließen, bevor sie die Lösung vergleichen.',
    '- Erst danach Abrufaufgaben; Wort und Bedeutung stehen dabei nie nebeneinander.'
  ],
  practise: [
    'ANLAGE: üben und festigen.',
    '- Schwerpunkt auf Abruf: Lücken ohne Wortkasten, Kurzantworten, Zuordnen nur als leichteste Stufe.',
    '- Mindestens eine Aufgabe zu Kollokationen (Verb + typisches Objekt, Nomen + typisches Adjektiv, feste Präposition).',
    '- Mindestens eine Aufgabe zur Wortbildung bzw. Wortfamilie (Nomen – Verb – Adjektiv, Vor- und Nachsilben).',
    '- Ein Wortnetz oder eine Mindmap nur zu BEKANNTEN Wörtern, nicht zur Einführung.'
  ],
  apply: [
    'ANLAGE: anwenden.',
    '- Die Zielwörter werden in einer echten Situation gebraucht (Nachricht, Bericht, Bildbeschreibung, kurzer Dialog).',
    '- Die Schreibaufgabe nennt ausdrücklich, wie viele Zielwörter vorkommen sollen, und gibt ein Schreibgerüst (Gliederung, Satzanfänge) – das erhöht den Gebrauch der Zielwörter deutlich.',
    '- Davor höchstens eine kurze Abrufaufgabe zur Aktivierung.'
  ],
  revise: [
    'ANLAGE: wiederholen (verteiltes Üben).',
    '- Mische Wörter aus früheren Einheiten; ordne sie nicht nach Lektionen, sondern durcheinander.',
    '- Überwiegend freier Abruf: erst ohne Hilfen, Hilfen erst in der letzten Aufgabe.',
    '- Nimm kein Wort aus der Wiederholung heraus, nur weil es einmal richtig war.'
  ],
  /*
   * Abprüfen ist kein Üben mit anderem Namen.
   *
   * Geprüft wird der ABRUF, und der misst nur dann etwas, wenn die Antwort nicht schon auf
   * dem Blatt steht: kein Wortkasten, keine Satzanfänge, keine Tippkarten. Zugleich ist es
   * eine Lernzielkontrolle ohne Note – die Lösungen gehören dazu, damit die Lernenden selbst
   * sehen, was sitzt. Abrufen festigt dabei stärker als erneutes Lesen (Testungseffekt,
   * Roediger & Karpicke 2006), das Blatt übt also, während es prüft.
   */
  check: [
    'ANLAGE: abprüfen (Lernzielkontrolle ohne Note).',
    '- KEINE Hilfen: kein Wortkasten, keine Satzanfänge, keine Tippkarten, keine Beispiellösung im Aufgabenteil.',
    '- Schwerpunkt auf produktivem Abruf: vom Deutschen in die Zielsprache, Lücken ohne Vorgabe, Kurzantworten.',
    '- Jedes Zielwort wird genau einmal geprüft; Wort und Bedeutung stehen nie nebeneinander.',
    '- Mische die Aufgabenformen (Abruf, Lücke im Satz, Anwendung in einem eigenen Satz) und ordne die Wörter durcheinander, nicht nach Lektion.',
    '- Am Ende eine kurze Selbsteinschätzung; die Lösungen stehen vollständig im Lösungsteil, damit die Lernenden selbst vergleichen können.',
    '- Vergib KEINE Punkte und keine Note – das Blatt stellt fest, was sitzt, es bewertet nicht.'
  ]
}

/**
 * Wörter aus einer Eingabe herauslösen.
 *
 * Steht mindestens ein Zeilenumbruch darin, gilt die ZEILE als Trenner – sonst Komma und
 * Semikolon. Der Grund ist praktisch: Wendungen enthalten selbst Kommas („to look after
 * sb., sth."). Aus der Auswahl kommen die Wörter zeilenweise, und dann bleibt eine solche
 * Wendung EIN Eintrag, statt in zwei zu zerfallen – beim ersten Lauf mit zwei Units wurden
 * aus 189 gewählten Wörtern so 193. Von Hand getippte Listen mit Kommas gehen weiterhin.
 */
export const splitVocabWords = (text: string): string[] => (text.includes('\n') ? text.split(/\n+/) : text.split(/[,;]+/)).map((w) => w.trim()).filter(Boolean)

export const targetWords = (meta: WorksheetMeta): string[] => splitVocabWords(meta.vocabWords ?? '')

/**
 * Was mit den vorgegebenen Zielwörtern geschieht.
 * Sind es mehr, als ein Blatt trägt, wählt die KI daraus aus, statt alles hineinzupressen –
 * ein überfrachtetes Blatt lernt niemand.
 */
function vocabWordRules(meta: WorksheetMeta, min: number, max: number): string[] {
  const words = targetWords(meta)
  if (!words.length) return ['- Wähle die Zielwörter passend zum Thema und nenne sie im Lehrkraft-Hinweis.']
  if (words.length <= max) return [`- Diese Zielwörter sind vorgegeben und müssen alle vorkommen: ${words.join(', ')}`]
  return [
    `- Aus dieser Liste wählst du ${min} bis ${max} Wörter aus – NICHT alle ${words.length}: ${words.join(', ')}`,
    '- Auswahl nach: Passung zum Thema, Nützlichkeit im Alltag der Lernenden, gemischte Wortarten; keine geschlossenen Reihen und keine Synonym- oder Antonympaare zusammen.',
    '- Nenne die gewählten Wörter im Hinweis für die Lehrkraft, damit sie weiß, welche Wörter das Blatt aufbaut.'
  ]
}

/** Regeln für den KI-Auftrag beim Schwerpunkt „Vokabeln". */
export function vocabWorkRules(meta: WorksheetMeta): string {
  if (meta.skillFocus !== 'vocabulary') return ''
  const mode = meta.vocabWork ?? 'introduce'
  const { min, max } = targetWordCount(meta)
  const daz = meta.subjectId === 'daz'
  return [
    'SCHWERPUNKT VOKABELN: Das Blatt baut Wortschatz auf – es ist keine Vokabelliste zum Auswendiglernen.',
    ...MODE_RULES[mode],
    '',
    'DURCHGEHENDE REGELN (fachdidaktisch belegt):',
    `- ${min} bis ${max} Zielwörter, nicht mehr.`,
    ...vocabWordRules(meta, min, max),
    '- Jedes Zielwort begegnet mindestens dreimal auf dem Blatt, davon mindestens zweimal als Abruf (die Lernenden müssen es selbst hervorholen).',
    '- In einer Übung dürfen Wort und Bedeutung NIE zugleich sichtbar sein – sonst wird nichts abgerufen.',
    '- Formathierarchie, so offen wie möglich: freie Produktion > Lücke ohne Wortkasten > Lücke mit Wortkasten > Zuordnung > Multiple Choice.',
    '- Wörter immer im Kontext und in Wendungen (Chunks/Kollokationen), nie als bloße Wortgleichung.',
    '- Setze KEINE geschlossenen Reihen (Farben, Wochentage, Zahlen, Körperteile) und keine Synonym- oder Antonympaare gemeinsam neu an: Gemeinsam gelernt behindern sie sich gegenseitig. Verknüpfe stattdessen thematisch-szenisch (ein Schauplatz, eine kleine Geschichte).',
    '- Ein Teil des Blattes (etwa ein Viertel) wiederholt Wörter aus früheren Stunden.',
    '- Unterscheide rezeptive und produktive Zielwörter: Zu produktiven Wörtern gehört eine Aufgabe, in der die Lernenden sie selbst schreiben.',
    '- Ein Lösungsteil gehört dazu, damit die Lernenden sich selbst kontrollieren können.',
    daz
      ? '- DaZ: Jedes Nomen mit Artikel und Pluralform, jedes Verb mit Infinitiv und Stammformen. Artikel farblich bzw. durch Kennzeichnung hervorheben. Wortspeicher als Kasten oben auf dem Blatt, dazu Satzanfänge und ein Schreibrahmen für die Produktionsaufgabe. Ein Feld „mein Wort in meiner Sprache" lässt Mehrsprachigkeit zu.'
      : '- Gib zu schwierigen Wörtern eine Merkhilfe (Eselsbrücke, Wortverwandtschaft), nicht zu allen.'
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Vorrangvokabeln: ausgewählte Wörter, die auf dem Blatt besonders vorkommen sollen.
 *
 * Unterschied zum Schwerpunkt „Vokabeln": Dort IST der Wortschatz das Thema, und
 * `vocabWorkRules` legt den ganzen Aufbau des Blattes darauf aus. Hier geht es um ein Blatt
 * mit einem anderen Schwerpunkt – Leseverstehen, Grammatik, Schreiben –, auf dem bestimmte
 * Wörter dennoch besonders vorkommen sollen, weil die Klasse sie gerade lernt.
 *
 * Deshalb sind es VORRANGWÖRTER und keine Pflicht: Die KI nimmt so viele, wie sich in Texte
 * und Aufgaben natürlich einbauen lassen. Ein Blatt, auf das jedes Wort gepresst wird, liest
 * sich wie eine Liste – und die Aufgaben, um die es eigentlich geht, gehen darin unter.
 *
 * Die Regel gilt ausdrücklich AUCH für Hörtexte: Der Hörtext entsteht in einer eigenen
 * Anfrage, die denselben Systemauftrag bekommt. Ohne diesen Satz käme der Wortschatz genau
 * dort nicht an, wo er am meisten trägt – im gesprochenen Zusammenhang.
 */
export function vocabFocusRules(meta: WorksheetMeta): string {
  // Beim Schwerpunkt „Vokabeln" gilt die ausführliche Anlage, nicht diese Kurzform
  if (meta.skillFocus === 'vocabulary') return ''
  const words = targetWords(meta)
  if (!words.length) return ''
  const mode = VOCAB_WORK.find((v) => v.value === (meta.vocabWork ?? 'practise'))
  return [
    `VORRANGVOKABELN (${words.length}) – diese Wörter lernt die Klasse gerade:`,
    words.join(', '),
    '',
    '- Baue möglichst viele davon natürlich ein: in Lesetexte, Hörtexte, Beispielsätze, Arbeitsanweisungen und Lösungen.',
    '- Natürlich heißt: Das Wort steht dort, wo es hingehört. Erzwinge kein Wort in einen Satz, in den es nicht passt, und reihe sie nicht als Liste aneinander.',
    '- Sie sind VORRANGIG, nicht verpflichtend: Nimm so viele, wie der Text und die Aufgaben tragen; der Schwerpunkt des Blattes bleibt unverändert.',
    '- Brauchst du darüber hinaus Wörter, nimm bekannte – keine neuen, die zufällig dazu passen.',
    mode ? `- Umgang mit diesen Wörtern: ${mode.label} – ${mode.description}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}
