/**
 * Erzeugt die Aufgaben eines Grammatiktests.
 *
 * Der Auftrag stützt sich auf die Daten der Themenliste: die belegten Stolperstellen und die
 * Aufgabenformen, die zum Thema passen. Die KI soll beides nicht erfinden.
 *
 * Zwei Dinge sind anders als beim Arbeitsblatt:
 * - **Geprüft wird, nicht erarbeitet.** Kein Merkkasten, kein induktiver Dreischritt, keine
 *   Hilfekarten – der Test misst, was sitzt.
 * - **Jede Aufgabe zielt auf eine benannte Stolperstelle** und trägt sie mit. Daraus entsteht
 *   das Fehlerprofil im Lösungsteil.
 */
import { PAGE_FORMAT_FIELD } from '../../arbeitsblatt/generation/schemas'
import { LUECKEN_REGELN_DE } from '@shared/luecken'
import type { AiCall } from '../../../shared/imageChoice'
import { createRng, newId } from '../../vokabeltest/model/random'
import { chosenGrammarTopics, grammarFormatLabel, learningYear, sequenceOf, teilformenAuftrag } from '../../arbeitsblatt/didactics/grammar'
import { convertBlock } from '../../arbeitsblatt/generation/convert'
import { verschluesseleMaterialverweise } from '../../arbeitsblatt/didactics/integrity'
import { arr, enumOf, int, obj, str } from '../../../shared/aiSchema'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import { knownVocabRulesDe } from '../../../shared/knownVocab'
import { grundwortschatzBis } from '@shared/lateinGrundwortschatz'
import { anredeRegel } from '../../../shared/anrede'
import { anredeFuer } from '../../arbeitsblatt/didactics/anrede'
import { errorTargets, testingRules } from '../model/testRules'
import type { GrammarTest } from '../model/types'
import { brauchtKi, erzeugeVerbBloecke } from '../../../shared/verben/aufgaben'
import { VERB_SPALTEN } from '@shared/verben'
import { blindprobeAktiv, blindprobeBloecke } from '../../../shared/verstehen/blindprobe'
import { describeBlock } from '../../arbeitsblatt/generation/describe'
import { abweichungZuA, begrenzteFassungen, fassungsBuchstabe, umgestellteFassung, umgestellteFassungen, wieA } from '../../../shared/testFassungen'

/**
 * Schrift und Varietät der neuen Schulfremdsprachen (30.09.2026): Was die KI sonst uneinheitlich
 * macht – Pinyin, Diakritika, Vokalharmonie, europäisches oder brasilianisches Portugiesisch.
 */
export const SPRACHREGELN: Record<string, string[]> = {
  chinesisch: [
    '- Chinesisch in Kurzzeichen (vereinfachte Schriftzeichen), keine Langzeichen.',
    '- Hinter jedem Satz bzw. jeder Wortgruppe Pinyin mit Tonzeichen in Klammern (z. B. 我是学生。(Wǒ shì xuésheng.)) – im 1. und 2. Lernjahr immer, später nur bei neuen Zeichen.',
    '- Lösungen in Schriftzeichen; wo die Klasse ein Zeichen noch nicht schreibt, ist Pinyin mit Tonzeichen als Lösung zulässig – nenne dann beides.',
    '- Stehen die Arbeitsanweisungen auf Chinesisch, dann sehr kurz und mit Pinyin.'
  ],
  tuerkisch: [
    '- Türkische Buchstaben vollständig (ç, ğ, ı, İ, ö, ş, ü); ı und i sind verschiedene Buchstaben.',
    '- Jede Endung folgt der Vokalharmonie und dem Konsonantenwechsel; die Fragepartikel mi/mı/mu/mü steht getrennt.'
  ],
  polnisch: ['- Polnische Diakritika vollständig (ą, ć, ę, ł, ń, ó, ś, ź, ż); in der Lösung stehen die Formen mit allen Zeichen.'],
  tschechisch: ['- Tschechische Diakritika vollständig (á, č, ď, é, ě, í, ň, ó, ř, š, ť, ú, ů, ý, ž); in der Lösung stehen die Formen mit allen Zeichen.'],
  portugiesisch: [
    '- Einheitlich europäisches Portugiesisch (tu, estar a + Infinitiv, Enklise), außer der Test nennt ausdrücklich Brasilien.',
    '- Wo die brasilianische Form ebenfalls richtig ist, nennt die Lösung beide.'
  ],
  niederlaendisch: ['- Standardniederländisch; wo in Belgien eine andere Form üblich und korrekt ist, nennt die Lösung beide.'],
  /*
   * Latein (07.10.2026, abgestimmt mit der Lehrkraft nach Recherche – KC Niedersachsen 2017, Pontes/Campus/prima):
   * Anweisungen immer deutsch, Längenzeichen in den Formen, Bestimmungen mit ALLEN Lesarten (Teilpunkte).
   */
  latein: [
    '- Arbeitsanweisungen immer auf Deutsch; lateinische Formen MIT Längenzeichen (ā ē ī ō ū) wie im Vokabelverzeichnis – in der Lösung ebenso.',
    '- Abkürzungen: Nom./Gen./Dat./Akk./Abl./Vok.; Sg./Pl.; m./f./n.; 1./2./3. Person; Präs./Impf./Fut. I/Perf./Plusqpf./Fut. II; Ind./Konj./Imp.; Akt./Pass.',
    '- Formen bestimmen als Tabelle (tableFill, Kopf z. B. Form | Kasus | Numerus | Genus bzw. Form | Person | Numerus | Tempus | Genus verbi). Bei einer EINZELNEN Form verlangt die Lösung ALLE Lesarten (rosae: Gen. Sg. f. / Dat. Sg. f. / Nom. Pl. f.) – Teilpunkte je Lesart; steht die Form in einem Satz, gilt nur die Lesart im Satz.',
    '- Mehrdeutige Endungen gezielt prüfen (-ae, -is, -a, -us, -um, -es, -ī; regit/reget, -ba-/-bi-, -era-).',
    '- Weitere übliche Formen: Paradigma ergänzen (tableFill Sg./Pl.), umformen nach Vorgabe („in den Plural", „ins Imperfekt", „ins Passiv"), KNG-Kongruenz bilden (magnus + templum → Gen. Pl.), Präposition mit Kasus, Wortgruppen mit Kasusfunktion übersetzen.',
    '- Nur Formen und Wörter, die zum Lernjahr passen; die Aufgabentexte sind lateinische Wörter, Wortgruppen oder kurze Sätze.'
  ]
}

/** Auftrag an die KI. */
export function testPrompt(test: GrammarTest): string {
  const m = test.meta
  // Unregelmäßige Verben (30.09.2026): Zauberstab und Kreis überarbeiten Bausteine mit diesem Auftrag
  if (m.modus === 'verben' && m.verben) {
    const spalten = VERB_SPALTEN[m.verben.sprache]
    return [
      `Du bearbeitest einen Test zu unregelmäßigen Verben (${m.subjectLabel}, Klasse ${m.grade}, Niveau ${m.cefrLevel}).`,
      'Die Formen stammen aus der Verbliste des Schulbuchs und sind VERBINDLICH – ändere keine Verbform und keine Lösung, die nicht ausdrücklich verlangt ist.',
      `Spalten der Liste: ${spalten.map((s) => s.label).join(' | ')}.`,
      `Verben: ${m.verben.verben
        .slice(0, 60)
        .map((e) =>
          spalten
            .map((s) => e.formen[s.id])
            .filter(Boolean)
            .join(' – ')
        )
        .join('; ')}.`,
      '- Geprüft wird, nicht erarbeitet: keine Merkkästen, keine Hilfekarten.',
      '- Je Form ein Punkt; die Arbeitsanweisung nennt die Punktzahl nicht.'
    ].join('\n')
  }
  const topics = chosenGrammarTopics({ ...m, grammarTopics: m.topics } as never)
  const german = m.subjectId === 'deutsch' || m.subjectId === 'daz'
  const target = m.subjectLabel
  const year = learningYear(m.grade, sequenceOf(m), m.stateId)
  const targets = errorTargets(m)
  const formats = m.formats.map(grammarFormatLabel)

  return [
    `Du entwirfst einen GRAMMATIKTEST für ${target}, Klasse ${m.grade}${german ? '' : `, ${year}. Lernjahr`}, Niveau ${m.cefrLevel}.`,
    `Geprüfte Form${topics.length === 1 ? '' : 'en'}: ${topics.map((t) => `${t.label}${t.term && t.term !== t.label ? ` (${t.term})` : ''}`).join(', ')}.`,
    // Ergänzte Themen (30.09.2026) bringen Beschreibung und Beispiele mit – sie grenzen die Form ab
    ...topics
      .filter((t) => t.description || t.examples?.length)
      .map((t) => `- ${t.label}: ${[t.description, t.examples?.length ? `Beispiele: ${t.examples.join(' | ')}` : ''].filter(Boolean).join(' ')}`),
    // Teilformen mit Stufe der Lerngruppe (Recherche 06.10.2026): geprüft wird nur, was gebildet bzw. erkannt werden soll
    teilformenAuftrag(
      topics,
      {
        subjectId: m.subjectId,
        grade: m.grade,
        stateId: m.stateId,
        schoolTypeId: m.schoolTypeId,
        sequence: sequenceOf(m),
        acquisitionStage: m.acquisitionStage,
        cefrLevel: m.cefrLevel || undefined
      },
      m.teilformen
    ),
    `Umfang: ${m.minutes} Minuten, insgesamt ${m.points} Punkte.`,
    LUECKEN_REGELN_DE,
    '',
    'ART DER AUFGABEN:',
    '- Es wird GEPRÜFT, nicht erarbeitet: kein Merkkasten, keine Regelherleitung, keine Hilfekarten, keine Tippkästen.',
    '- Die Arbeitsanweisung sagt knapp und eindeutig, was zu tun ist, und nennt die Punktzahl nicht (die vergibt die App).',
    '- Jede Aufgabe hat eine eindeutig richtige Lösung. Wo mehrere Formen möglich sind, nenne sie in der Lösung alle.',
    m.embedded
      ? '- EINGEBETTET: Die Aufgaben hängen an EINEM zusammenhängenden Text (Nachricht, Bericht, kurze Geschichte, Dialog). Stelle ihn als Baustein „text" voran; die Aufgaben beziehen sich darauf. Keine Reihe unverbundener Einzelsätze.'
      : '- Einzelsätze sind zulässig, aber jeder Satz muss für sich verständlich sein und eine Mitteilung enthalten – keine sinnlosen Übungssätze.',
    '- Keine unbekannte Lexik: Der Test prüft die Form, nicht den Wortschatz. Wer ein Wort nicht kennt, scheitert sonst aus dem falschen Grund.',
    german ? '' : `- Die Aufgabentexte stehen auf ${target}.`,
    ...(SPRACHREGELN[m.subjectId] ?? []),
    m.instructionsInGerman || m.subjectId === 'latein' ? '- Die Arbeitsanweisungen stehen auf Deutsch.' : '',
    // Anrede der Lernenden (Paket 8b): nur wo die Anweisungen deutsch sind – Sek I du, Sek II Sie
    german || m.instructionsInGerman || m.subjectId === 'latein' ? anredeRegel(anredeFuer(m.grade, m.schoolTypeId, m.stateId)) : '',
    '',
    formats.length ? `AUFGABENFORMEN – nutze genau diese: ${formats.join(', ')}.` : '',
    '- Steigere die Anforderung: erst Erkennen und Zuordnen, dann Umformen und Ergänzen, zuletzt eigenes Bilden.',
    '',
    targets.length
      ? [
          'STOLPERSTELLEN – jede Aufgabe zielt auf genau eine davon und trägt sie in grammarError:',
          ...targets.map((t) => `- ${t.error}`),
          'Verteile die Aufgaben so, dass möglichst jede Stolperstelle wenigstens einmal geprüft wird.'
        ].join('\n')
      : '',
    '',
    topics.some((t) => t.receptive)
      ? `NUR ERKENNEN: ${topics
          .filter((t) => t.receptive)
          .map((t) => t.label)
          .join(', ')} – dazu keine Aufgabe, die die Form selbst bilden lässt.`
      : '',
    m.knownVocab
      ? knownVocabRulesDe(m.knownVocab)
      : // Latein ohne Lehrwerkswortschatz: mitgelieferter Grundwortschatz bis zum Lernjahr (07.10.2026)
        m.subjectId === 'latein'
        ? `WORTSCHATZ (Grundwortschatz Latein bis ${Math.max(1, m.grade - 5)}. Lernjahr) – verwende nur diese Wörter, dazu Eigennamen:
${grundwortschatzBis(Math.max(1, m.grade - 5)).join('; ')}`
        : '',
    '',
    'Gib NUR Bausteine vom Typ „task" aus – und, wenn eingebettet, genau einen Baustein „text" davor.'
  ]
    .filter(Boolean)
    .join('\n')
}

/** Antwortformen, die ein Grammatiktest wirklich braucht. */
const TEST_ANSWER_KINDS = ['lines', 'gapText', 'matching', 'multipleChoice', 'ordering', 'tableFill', 'none']

/**
 * Antwortschema des Tests – bewusst SCHLANK.
 *
 * Ein Grammatiktest besteht aus einem Materialtext und Aufgaben. Felder für Bilder,
 * Gitternetze, Achsen, Hörtexte oder Schreibaufträge braucht er nicht. Im strikten Modus muss
 * die KI jedes Feld des Schemas für JEDEN Baustein ausfüllen – ein überflüssiges Feld kostet
 * also bei jeder Aufgabe Platz und Zeit und macht die Antwort fehleranfälliger.
 *
 * Die Feldnamen entsprechen denen des Arbeitsblatts, damit `convertBlock` sie versteht; fehlende
 * Felder verträgt es.
 */
const TEST_ANSWER = obj({
  kind: enumOf(TEST_ANSWER_KINDS),
  count: int('lines: Anzahl Schreiblinien'),
  gapText: str('gapText: Text mit [[Lösung]] je Lücke'),
  left: arr(str(), 'matching: linke Seite'),
  right: arr(str(), 'matching: rechte Seite, mit 1–2 überzähligen Einträgen'),
  pairs: arr(int(), 'matching: Index in right für jedes Element von left'),
  options: arr(str(), 'multipleChoice: Antwortmöglichkeiten'),
  correct: arr(int(), 'multipleChoice: Indizes der richtigen Antworten'),
  items: arr(str(), 'ordering: Elemente in RICHTIGER Reihenfolge'),
  headers: arr(str(), 'tableFill: Spaltenköpfe'),
  rows: arr(arr(str()), 'tableFill: Zeilen; leere Zelle = auszufüllen'),
  solutionRows: arr(arr(str()), 'tableFill: Lösungen der leeren Zellen')
})

const TEST_BLOCK = obj({
  type: enumOf(['text', 'task']),
  title: str('text: Überschrift des Materials; bei Aufgaben leer'),
  body: str('text: der zusammenhängende Text; bei Aufgaben leer'),
  instruction: str('task: knappe, eindeutige Arbeitsanweisung'),
  answer: TEST_ANSWER,
  parts: arr(obj({ instruction: str(), answer: TEST_ANSWER, solution: str() }), 'task: Teilaufgaben oder leer'),
  solution: str('task: die richtige Lösung, bei mehreren Möglichkeiten alle'),
  minutes: int('task: geschätzte Bearbeitungszeit'),
  grammarTopicId: str('task: Kennung der geprüften Form; bei Material leer'),
  grammarError: str('task: Stolperstelle im Wortlaut der Vorgabe; bei Material leer'),
  pageFormat: PAGE_FORMAT_FIELD
})

export const TEST_SCHEMA = obj({ blocks: arr(TEST_BLOCK) })

/** Alle weiteren Fassungen in EINER Antwort (06.10.2026) – je Fassung die Bausteine wie in TEST_SCHEMA */
export const FASSUNGEN_SCHEMA = obj({ fassungen: arr(obj({ blocks: arr(TEST_BLOCK) }), 'je weitere Fassung (B, C, D) ein Eintrag, in dieser Reihenfolge') })

/**
 * Verteilt die Punkte gleichmäßig auf die Aufgaben.
 * Der Rest geht an die vorderen Aufgaben – so stimmt die Summe genau.
 */
export function spreadPoints(blocks: WsBlock[], total: number): void {
  const tasks = blocks.filter((b) => b.type === 'task')
  if (!tasks.length || total <= 0) return
  const base = Math.floor(total / tasks.length)
  let rest = total - base * tasks.length
  for (const t of tasks) {
    if (t.type !== 'task') continue
    t.points = base + (rest > 0 ? 1 : 0)
    if (rest > 0) rest--
  }
}

/** Rohbausteine der KI → Bausteine des Tests, Aufgaben mit geprüfter Form und Stolperstelle */
function bloeckeAusAntwort(test: GrammarTest, roh: Record<string, unknown>[]): WsBlock[] {
  const rng = createRng(Date.now())
  const topics = chosenGrammarTopics({ ...test.meta, grammarTopics: test.meta.topics } as never)
  const blocks: WsBlock[] = []
  for (const raw of roh) {
    const block = convertBlock(raw, rng, [])
    if (!block) continue
    block.id = block.id || newId(rng)
    if (block.type === 'task') {
      const topicId = String(raw.grammarTopicId ?? '')
      const error = String(raw.grammarError ?? '').trim()
      // Nur zuordnen, was es wirklich gibt – sonst stünde im Fehlerprofil eine erfundene Form
      const topic = topics.find((t) => t.id === topicId) ?? (topics.length === 1 ? topics[0] : undefined)
      if (topic && error) block.grammar = { topicId: topic.id, error }
    }
    blocks.push(block)
  }
  return blocks
}

export async function generateTest(
  test: GrammarTest,
  ai: AiCall,
  onStep: (message: string) => void = () => undefined,
  /** Live-Vorschau (02.10.2026): die Aufgaben, sobald sie da sind – vor der Blindprobe */
  zwischenstand?: (blocks: WsBlock[]) => void
): Promise<WsBlock[]> {
  onStep('Aufgaben werden entworfen …')
  const data = await ai<{ blocks: Record<string, unknown>[] }>({
    system: testPrompt(test),
    user: 'Erzeuge die Aufgaben des Tests.',
    // Der Name gehört dazu: Die Anbieter verlangen ihn für ein benanntes Antwortschema.
    schemaName: 'grammar_test',
    schema: TEST_SCHEMA as Record<string, unknown>,
    ...(test.meta.provider ? { provider: test.meta.provider } : {}),
    ...(test.meta.model ? { model: test.meta.model } : {})
  })

  const blocks = bloeckeAusAntwort(test, data?.blocks ?? [])
  /*
   * Lieber laut scheitern als still nichts liefern.
   *
   * Kam keine Aufgabe zurück, schaltete die App bisher auf den nächsten Schritt und zeigte eine
   * leere Seite – ohne ein Wort. Die Lehrkraft sah nur, dass nichts passiert.
   */
  if (!blocks.some((b) => b.type === 'task')) {
    throw new Error('Die KI hat keine Aufgaben geliefert. Bitte erneut versuchen oder eine andere Form wählen.')
  }
  // Nummern der KI werden zu Kennungen („M{text}"); die Nummern entstehen beim Darstellen aus der Reihenfolge
  blocks.splice(0, blocks.length, ...verschluesseleMaterialverweise(blocks))
  spreadPoints(blocks, test.meta.points)
  zwischenstand?.(blocks)
  // Ankreuzfragen zu einem Lese- oder Hörtext (01.10.2026): Blindprobe ohne Text – nur ausgewiesene Verstehensaufgaben, Grammatikfragen nie
  if (blindprobeAktiv()) {
    const probe = await blindprobeBloecke(blocks, ai, { melde: onStep, streng: true }).catch(() => null)
    if (probe?.geprueft) return probe.bloecke
  }
  return blocks
}

/** Hinweise, die beim Erstellen oben stehen (Landesvorgaben und Anlage des Tests). */
export const testHints = (test: GrammarTest): string[] => testingRules(test.meta).map((r) => (r.suggestion ? `${r.text} ${r.suggestion}` : r.text))

/** Zahl der Fassungen eines Tests (1–4) */
export const fassungsZahl = (test: Pick<GrammarTest, 'meta'>): number => begrenzteFassungen(test.meta.fassungen ?? 1)

/**
 * Der Auftrag für die weiteren Fassungen: Fassung A als Vorlage, je Aufgabe Antwortform, Items
 * und Punkte, die gleich bleiben müssen. Die Sätze und Wörter sind andere.
 */
export function fassungenAuftrag(test: GrammarTest, a: WsBlock[], anzahl: number): string {
  const labels = Array.from({ length: anzahl - 1 }, (_, i) => fassungsBuchstabe(i + 1))
  const aufgaben = a.filter((b): b is Extract<WsBlock, { type: 'task' }> => b.type === 'task')
  const zeile = (t: Extract<WsBlock, { type: 'task' }>, i: number): string =>
    `${i + 1}. Antwortform ${t.answer.kind}${t.parts.length ? `, ${t.parts.length} Teilaufgaben` : ''}, ${t.points} Punkte${t.grammar ? `, Stolperstelle „${t.grammar.error}"` : ''}`
  return [
    `PARALLELFASSUNGEN ${labels.join(', ')} (gegen Abschreiben):`,
    `Der Test wird in ${anzahl} Fassungen geschrieben; benachbarte Lernende bekommen verschiedene Fassungen. Unten steht Fassung A. Schreibe Fassung${labels.length > 1 ? 'en' : ''} ${labels.join(', ')} – jede GLEICHWERTIG zu A:`,
    `- Gleich viele Aufgaben (${aufgaben.length}) in derselben Reihenfolge, jede mit DERSELBEN Antwortform, gleich vielen Items bzw. Teilaufgaben, DERSELBEN geprüften Form und Stolperstelle.`,
    '- Andere Sätze, andere Wörter, andere Situationen: Keine Lösung darf sich aus einer anderen Fassung übernehmen lassen.',
    '- Gleiche Schwierigkeit: gleiches Niveau, nur bekannter Wortschatz, gleich lange Sätze.',
    test.meta.embedded
      ? '- Eingebettet: Jede Fassung bekommt ihren eigenen zusammenhängenden Text (gleiche Textsorte, gleiche Länge, anderer Inhalt) als Baustein „text" vor den Aufgaben.'
      : '',
    '- Die Fassungen unterscheiden sich auch untereinander.',
    `- Gib im Feld fassungen genau ${anzahl - 1} Einträge zurück, in der Reihenfolge ${labels.join(', ')}.`,
    '',
    `AUFGABEN DER FASSUNG A (bleiben in Form und Punkten gleich):\n${aufgaben.map(zeile).join('\n')}`,
    '',
    `VORLAGE – FASSUNG A:\n${a.map(describeBlock).join('\n\n')}`
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Die weiteren Fassungen B … eines Tests zu Grammatikformen (06.10.2026).
 *
 * - `umgestellt`: ohne KI aus A (shared/testFassungen.ts).
 * - `parallel`: EINE Anfrage für alle weiteren Fassungen. Passt eine Fassung nicht zu A (andere
 *   Zahl oder Form der Aufgaben), tritt dafür die umgestellte Fassung ein – mit Hinweis am
 *   ersten Baustein, damit die Lehrkraft es sieht. Punkte und Stolperstellen kommen aus A.
 */
export async function generateTestFassungen(
  test: GrammarTest,
  a: WsBlock[],
  ai: AiCall,
  onStep: (message: string) => void = () => undefined
): Promise<WsBlock[][]> {
  const anzahl = fassungsZahl(test)
  if (anzahl < 2) return []
  const items = !test.meta.embedded
  if (test.meta.fassungsArt === 'umgestellt') {
    const r = umgestellteFassungen(a, anzahl, { items })
    r.fassungen.forEach((f, i) => r.hinweise[i] && markiere(f, r.hinweise[i]))
    return r.fassungen
  }
  onStep(`Fassung${anzahl > 2 ? 'en' : ''} ${Array.from({ length: anzahl - 1 }, (_, i) => fassungsBuchstabe(i + 1)).join(', ')} werden geschrieben …`)
  const data = await ai<{ fassungen?: { blocks?: Record<string, unknown>[] }[] }>({
    system: testPrompt(test),
    user: fassungenAuftrag(test, a, anzahl),
    schemaName: 'grammar_test_versions',
    schema: FASSUNGEN_SCHEMA as Record<string, unknown>,
    ...(test.meta.provider ? { provider: test.meta.provider } : {}),
    ...(test.meta.model ? { model: test.meta.model } : {})
  })
  const roh = Array.isArray(data?.fassungen) ? data.fassungen : []
  const out: WsBlock[][] = []
  for (let i = 1; i < anzahl; i++) {
    const bloecke = verschluesseleMaterialverweise(bloeckeAusAntwort(test, roh[i - 1]?.blocks ?? []))
    const abweichung = bloecke.some((b) => b.type === 'task') ? abweichungZuA(a, bloecke) : 'keine Aufgaben'
    if (abweichung) {
      // Lieber eine umgestellte Fassung als eine ungleichwertige – und offen sagen, warum
      const ersatz = umgestellteFassung(a, i, { items }).bloecke
      markiere(ersatz, `Fassung ${fassungsBuchstabe(i)}: Die KI lieferte keine gleichwertige Parallelfassung (${abweichung}). Hier steht Fassung A umgestellt – auf Wunsch einzelne Aufgaben neu erzeugen.`)
      out.push(ersatz)
      continue
    }
    wieA(a, bloecke)
    out.push(bloecke)
  }
  // Ankreuzfragen zu einem Text: Blindprobe wie in Fassung A (nur ausgewiesene Verstehensaufgaben)
  if (blindprobeAktiv()) {
    for (let i = 0; i < out.length; i++) {
      const probe = await blindprobeBloecke(out[i], ai, { melde: onStep, streng: true }).catch(() => null)
      if (probe?.geprueft) out[i] = probe.bloecke
    }
  }
  return out
}

/** Hinweis an die erste Aufgabe einer Fassung hängen (steht am Baustein, „Hinweise") */
function markiere(bloecke: WsBlock[], hinweis: string): void {
  const erste = bloecke.find((b) => b.type === 'task') ?? bloecke[0]
  if (erste) erste.warnings = [...(erste.warnings ?? []), hinweis]
}

/**
 * Test zu unregelmäßigen Verben (30.09.2026): Tabellen, Ankreuzen, Fehler finden und Zuordnen
 * entstehen ohne KI aus der Verbliste; nur Sätze im Zusammenhang schreibt die KI (shared/verben).
 * Bei mehreren Fassungen (bis D, 06.10.2026) bekommt jede andere Verben, sofern die Auswahl reicht.
 */
export async function generateVerbTest(
  test: GrammarTest,
  ai: AiCall | null,
  onStep: (message: string) => void = () => undefined,
  /** Live-Vorschau (02.10.2026): die Fassungen, sobald sie stehen */
  zwischenstand?: (fassungen: WsBlock[][]) => void
): Promise<{ blocks: WsBlock[]; weitereFassungen?: WsBlock[][] }> {
  const a = test.meta.verben
  if (!a) throw new Error('Es sind keine Verben gewählt.')
  const anrede = anredeFuer(test.meta.grade, test.meta.schoolTypeId, test.meta.stateId)
  const n = fassungsZahl(test)
  onStep(brauchtKi(a) ? 'Tabellen entstehen, die KI schreibt die Sätze …' : 'Die Aufgaben entstehen aus der Verbliste …')
  const blocks = await erzeugeVerbBloecke(a, anrede, ai, 0, n)
  if (n < 2) return { blocks }
  const weitere: WsBlock[][] = []
  for (let i = 1; i < n; i++) {
    zwischenstand?.([blocks, ...weitere])
    onStep(`Gruppe ${fassungsBuchstabe(i)} wird erstellt …`)
    weitere.push(await erzeugeVerbBloecke(a, anrede, ai, i, n))
  }
  return { blocks, weitereFassungen: weitere }
}
