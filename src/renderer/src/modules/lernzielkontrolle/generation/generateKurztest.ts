/**
 * Erzeugung einer Lernzielkontrolle.
 *
 * Der Auftrag an die KI setzt sich aus den recherchierten Schichten zusammen:
 *   - das LANDESFORMAT (Bezeichnung, Höchstdauer, Stoffgrenze) aus `formate.ts`
 *   - die OPERATORENGRUNDLAGE des Landes und der Stufe aus `operatoren.ts`
 *   - die Bauregel „nur Aufgaben und Material" aus `bausteine.ts`
 *
 * Was fertig ist, wird danach NOCH EINMAL geprüft (`pruefeOperatoren`, `pruefeBausteine`).
 * Eine Regel im Auftrag ist eine Bitte; eine Prüfung am Ergebnis ist eine Feststellung. Beide
 * werden gebraucht, weil sich die KI nicht zuverlässig an den Auftrag hält – die
 * Lernzielkontrolle, die den Anlass für dieses Programm gab, war selbst KI-erzeugt.
 */
import { PAGE_FORMAT_FIELD } from '../../arbeitsblatt/generation/schemas'
import { LUECKEN_REGELN_DE } from '@shared/luecken'
import { pruefungsVersuchRegeln, setzeProtokollInPruefung } from '../../arbeitsblatt/didactics/protokoll'
import { vokabelnFuerFassungen } from '../../arbeitsblatt/generation/hoerVokabular'
import { linkListeningTasks } from '../../arbeitsblatt/generation/listening'
import { worksheetMetaForKurztest } from '../render/kurztestWorksheet'
import { arr, enumOf, int, obj, str } from '../../../shared/aiSchema'
import type { AiCall } from '../../../shared/imageChoice'
import { convertBlock } from '../../arbeitsblatt/generation/convert'
import { verschluesseleMaterialverweise } from '../../arbeitsblatt/didactics/integrity'
import { aufgabenIn, punkteNachTeilaufgaben, skalierePunkte } from '../../../shared/punkte'
import { createRng, newId } from '../../vokabeltest/model/random'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import { subjectById } from '../../arbeitsblatt/model/subjects'
import { bausteinRegeln } from '../didactics/bausteine'
import type { Punktebereich } from '../didactics/bewertung'
import { formatById, geschaetzteMinuten } from '../didactics/formate'
import { operatorRegeln } from '../didactics/operatorPruefung'
import { anredeRegel } from '../../../shared/anrede'
import { anredeFuerKurztest } from '../model/defaults'
import { BILINGUALE_SPRACHEN, bilingualMoeglich, profilFuerKurztest } from '../didactics/operatoren'
import { stateInfo } from '../../arbeitsblatt/didactics/states'
import type { Kurztest } from '../model/types'
import { interkulturellRegeln } from '../../arbeitsblatt/didactics/interkulturell'
import { blindprobeAktiv, blindprobeBloecke, mcAusschlussRegeln } from '../../../shared/verstehen/blindprobe'

// Dieselbe Signatur wie in den anderen Programmen – sonst passt der Fortschrittszähler nicht
export type { AiCall } from '../../../shared/imageChoice'

/** Antwortformen, die ein Kurztest braucht. Kein Platz für Bilder, Raster oder Hörtexte. */
const KURZTEST_ANSWER_KINDS = ['lines', 'space', 'gapText', 'matching', 'multipleChoice', 'trueFalse', 'ordering', 'tableFill', 'none']

const ANSWER = obj({
  kind: enumOf(KURZTEST_ANSWER_KINDS),
  count: int('lines: Anzahl Schreiblinien'),
  heightMm: int('space: Höhe des Rechenraums in Millimetern'),
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

export const KURZTEST_SCHEMA = obj({
  blocks: arr(
    obj({
      type: enumOf(['text', 'table', 'task']),
      title: str('text/table: Überschrift des Materials; bei Aufgaben leer'),
      body: str('text: der Materialtext; bei Aufgaben und Tabellen leer'),
      headers: arr(str(), 'table: Spaltenköpfe des Materials'),
      rows: arr(arr(str()), 'table: Zeilen des Materials'),
      instruction: str(
        'task: PFLICHT, nie leer. Arbeitsanweisung, beginnt mit GENAU EINEM Operator als korrekt gebildetem Imperativ (trennbare Verben: „Fasse … zusammen", „Gib … an"). Auch wenn es Teilaufgaben gibt.'
      ),
      operator: str('task: der verwendete Operator im Infinitiv, z. B. „berechnen"'),
      answer: ANSWER,
      parts: arr(obj({ instruction: str(), answer: ANSWER, solution: str() }), 'task: Teilaufgaben oder leer'),
      solution: str('task: die erwartete Lösung; bei mehreren Möglichkeiten alle'),
      minutes: int('task: geschätzte Bearbeitungszeit in Minuten'),
      points: int('task: Punkte für diese Aufgabe'),
      pageFormat: PAGE_FORMAT_FIELD
    })
  )
})

/**
 * Der Teil des Auftrags, der aus hineingezogenen Tafelbildern und Buchseiten entsteht.
 *
 * Der ausgelesene Text steht im Auftrag; die Seitenbilder gehen zusätzlich als Bild mit
 * (siehe `bilderAus`). Das ist wichtig für handgeschriebene Tafelbilder, aus denen keine
 * Textebene zu holen ist – dort trägt allein das Bild die Information.
 */
function stoffQuellenTeil(test: Kurztest): string[] {
  const quellen = (test.meta.stoffQuellen ?? []).filter((q) => q.aktiv)
  if (!quellen.length) return []
  const out = [
    '',
    'WAS IM UNTERRICHT DRAN WAR (aus den beigefügten Unterlagen):',
    '- Die folgenden Unterlagen zeigen den tatsächlich behandelten Stoff: Schreibweise, Beispiele und Reihenfolge, die die Klasse kennt.',
    '- Bleibe INNERHALB dessen, was dort steht. Führe keine Schreibweise und keinen Aufgabentyp ein, der dort nicht vorkommt.',
    '- Übernimm die Bezeichnungen und Formelschreibweisen der Unterlagen, nicht die eigenen.'
  ]
  for (const q of quellen) {
    const text = q.text.trim()
    out.push(`--- ${q.fileName} ---`)
    if (text) out.push(text.slice(0, 6000))
    else out.push('(kein auslesbarer Text – siehe das beigefügte Bild)')
  }
  return out
}

/** Die Seitenbilder der aktiven Unterlagen, für die Bildanalyse der KI. */
export function bilderAus(test: Kurztest): string[] {
  return (test.meta.stoffQuellen ?? []).filter((q) => q.aktiv).flatMap((q) => q.bilder.slice(0, 3))
}

/**
 * Die von der Lehrkraft bevorzugten Operatoren.
 *
 * Bewusst als VORSCHLAG formuliert, nicht als Zwang. Manche Antwortformen verlangen einen
 * bestimmten Operator – eine Zuordnung braucht „Ordne zu" oder „Gib an", keinen, der einen
 * Lösungsweg verlangt. Ein erzwungener Operator erzeugte also genau den Fehler, den die App
 * an anderer Stelle meldet.
 */
function bevorzugteTeil(operatoren: string[]): string[] {
  if (!operatoren.length) return []
  return [
    '',
    'BEVORZUGTE OPERATOREN:',
    `- Die Lehrkraft möchte in diesem Test vor allem diese Operatoren sehen: ${operatoren.join(', ')}.`,
    '- Verwende sie, wo sie zur Aufgabe passen. Passt keiner davon zur Antwortform, nimm den fachlich richtigen – ein unpassender Operator wäre schlimmer als ein nicht gewünschter.'
  ]
}

/**
 * Bilingualer Sachfachunterricht (30.09.2026): Aufgaben in der Arbeitssprache, Operatoren aus
 * der zielsprachigen Liste. Bewertet wird das Sachfach (KMK-Bericht 2013).
 */
function bilingualTeil(m: Kurztest['meta']): string[] {
  if (!m.bilingual?.an || !bilingualMoeglich(m.subjectId)) return []
  const sprache = BILINGUALE_SPRACHEN.find((s) => s.value === m.bilingual!.sprache)?.label ?? 'Englisch'
  return [
    '',
    `BILINGUALER SACHFACHUNTERRICHT (Arbeitssprache ${sprache}):`,
    `- Arbeitsanweisungen, Teilaufgaben und Material stehen auf ${sprache}. Jede Aufgabe beginnt mit einem Operator aus der Liste unter OPERATOREN, in ${sprache} und als korrekt gebildeter Imperativ dieser Sprache (nicht im Infinitiv).`,
    '- Zentrale Fachbegriffe stehen beim ersten Vorkommen zusätzlich auf Deutsch in Klammern.',
    '- Bewertet wird die fachliche Leistung; keine Aufgabe verlangt eine Sprachleistung, die über das Sachfach hinausgeht.',
    `- Die erwartete Lösung steht ebenfalls auf ${sprache}.`
  ]
}

/** Der Systemauftrag. */
export function kurztestPrompt(test: Kurztest, variante: string): string {
  const m = test.meta
  const format = formatById(m.formatId)
  const profil = profilFuerKurztest(m)
  const land = stateInfo(m.stateId)
  const fach = subjectById(m.subjectId)

  const teile = [
    `Du entwirfst eine kurze schriftliche Leistungskontrolle für ${fach.label}, Klasse ${m.grade}, ${m.schoolTypeName} in ${land.name}.`,
    format
      ? `Das Format heißt dort „${format.bezeichnung}". ${format.beschreibung}${format.maxMinuten ? ` Die Höchstdauer beträgt ${format.maxMinuten} Minuten (${format.fundstelle}).` : ''}`
      : 'Für dieses Bundesland ist kein eigenes Kurztestformat belegt.',
    `Vorgesehene Bearbeitungszeit: ${m.minutes} Minuten. Der Umfang richtet sich nach dieser Zeit, nicht umgekehrt.`,
    `Thema: ${m.thema || fach.label}.`,
    LUECKEN_REGELN_DE,
    m.stoff ? `Im Unterricht wurde unmittelbar vorher behandelt: ${m.stoff}` : '',
    ...stoffQuellenTeil(test),
    format?.stoffStunden
      ? `WICHTIG: Der Stoff darf sich höchstens auf die letzten ${format.stoffStunden} Unterrichtsstunden beziehen (${format.fundstelle}). Nichts darüber hinaus.`
      : 'Der Stoff beschränkt sich auf den unmittelbar vorangegangenen Unterricht.',
    variante
      ? `Dies ist Variante ${variante}. Sie prüft DIESELBEN Inhalte und Aufgabentypen wie die übrigen Varianten, mit anderen Zahlen und Beispielen – gleicher Schwierigkeitsgrad.`
      : '',
    '',
    bausteinRegeln(m.nachteilsausgleich),
    pruefungsVersuchRegeln(m.versuch),
    '',
    operatorRegeln(profil),
    '',
    // Anrede nach der gewählten Stufe – nicht nach der Anrede der Landesliste (Paket 8b);
    // Klasse 10 im G8 (Einführungsphase) immer Sie
    anredeRegel(anredeFuerKurztest(m)),
    ...bilingualTeil(m),
    ...bevorzugteTeil(m.bevorzugteOperatoren ?? []),
    /*
     * Orte und interkulturelle Aspekte – dieselbe Regel wie im Arbeitsblatt. Ein Kurztest in
     * Erdkunde oder Geschichte spielt oft an einem konkreten Ort; in Mathematik liefert die
     * Regel eine leere Zeichenkette und fällt weg.
     */
    // `stoff` ist hier das ausgewiesene Vorwissen: was unmittelbar vorher behandelt wurde
    interkulturellRegeln({ subjectId: m.subjectId, priorKnowledge: m.stoff, grade: m.grade }),
    '',
    // Ankreuzfragen zu einem Materialtext: ohne den Text keine Möglichkeit ausschließbar (01.10.2026)
    mcAusschlussRegeln(),
    '',
    'AUFGABENSTELLUNG:',
    '- JEDE Aufgabe hat eine eigene Arbeitsanweisung im Feld „instruction". Sie darf NIE leer bleiben, auch dann nicht, wenn es Teilaufgaben gibt.',
    '- Gibt es Teilaufgaben, steht in der Anweisung der gemeinsame Auftrag („**Berechne.**"), und die Teilaufgaben enthalten nur noch die Rechnung oder Frage selbst – nicht noch einmal denselben Operator.',
    '- Die Teilaufgaben werden auf dem Blatt automatisch mit a), b), c) gekennzeichnet. Schreibe diese Buchstaben NICHT selbst in den Text – sonst steht dort „a) a) …".',
    '',
    'UMFANG:',
    `- Richtwert für ${m.minutes} Minuten: etwa ${Math.max(2, Math.round(m.minutes / 6))} bis ${Math.max(3, Math.round(m.minutes / 3))} Teilaufgaben insgesamt, auf EINER Seite.`,
    '- Echte Vorlagen zum Vergleich: eine bayerische Stegreifaufgabe für 20 Minuten hat 2 bis 3 Aufgaben mit zusammen 4 bis 9 Teilaufgaben.',
    '- Der Schwerpunkt liegt auf sicherem Können, nicht auf Transfer. Höchstens eine Aufgabe geht über die reine Anwendung hinaus.',
    m.bewertung.punkteAufBlatt
      ? '- Gib zu jeder Aufgabe eine Punktzahl an, die zum Aufwand passt.'
      : '- Setze alle Punktzahlen auf 0; dieses Blatt trägt keine Punkte.',
    m.bewertung.punkteAufBlatt && m.bewertung.bereich
      ? `- Die GESAMTPUNKTZAHL soll zwischen ${m.bewertung.bereich.min} und ${m.bewertung.bereich.max} Punkten liegen. Richte den Umfang danach aus, verteile die Punkte aber weiterhin nach dem Aufwand der einzelnen Aufgabe – erfinde keine Punkte, nur damit die Summe stimmt.`
      : '',
    '',
    'FORMELN UND FACHSPRACHE:',
    '- Mathematische Formeln in $…$ setzen, z. B. $a^m \\cdot a^n = a^{m+n}$. Chemische Formeln mit \\ce{}.',
    '- Fettdruck mit **…**.',
    '',
    'LÖSUNG:',
    '- Zu jeder Aufgabe gehört die erwartete Lösung. Sie erscheint nur auf dem Lösungsblatt der Lehrkraft.'
  ]
  return teile.filter(Boolean).join('\n')
}

/** Erzeugt die Aufgaben einer Variante. */
export async function generateKurztest(
  test: Kurztest,
  variante: string,
  ai: AiCall,
  onStep: (m: string) => void = () => undefined,
  /** Live-Vorschau (02.10.2026): die Aufgaben, sobald sie entworfen sind – vor der Blindprobe */
  zwischenstand?: (blocks: WsBlock[]) => void
): Promise<WsBlock[]> {
  onStep(variante ? `Variante ${variante} wird entworfen …` : 'Aufgaben werden entworfen …')
  const data = await ai<{ blocks: Record<string, unknown>[] }>({
    system: kurztestPrompt(test, variante),
    user: 'Erzeuge die Aufgaben der Lernzielkontrolle.',
    schemaName: 'lernzielkontrolle',
    schema: KURZTEST_SCHEMA as Record<string, unknown>,
    // Tafelbilder und Buchseiten gehen als Bild mit – handschriftliche liefern keinen Text
    ...(bilderAus(test).length ? { images: bilderAus(test) } : {}),
    ...(test.meta.provider ? { provider: test.meta.provider } : {}),
    ...(test.meta.model ? { model: test.meta.model } : {})
  })

  const rng = createRng(Date.now())
  const blocks: WsBlock[] = []
  for (const raw of data?.blocks ?? []) {
    const block = convertBlock(raw, rng, [])
    if (!block) continue
    block.id = block.id || newId(rng)
    blocks.push(block)
  }
  /*
   * Lieber laut scheitern als still nichts liefern – dieselbe Entscheidung wie beim
   * Grammatiktest. Eine leere Seite ohne ein Wort sieht aus wie ein Absturz.
   */
  if (!blocks.some((b) => b.type === 'task')) {
    throw new Error('Die KI hat keine Aufgaben geliefert. Bitte erneut versuchen oder das Thema genauer angeben.')
  }
  // Versuchsprotokoll (29.09.2026): Vorlage hinter die Aufgabe „protokollieren"; Lernhilfen nur mit Nachteilsausgleich (Satzanfänge)
  const mitHilfen = test.meta.nachteilsausgleich.aktiv && test.meta.nachteilsausgleich.hilfen.includes('satzanfaenge')
  blocks.splice(0, blocks.length, ...setzeProtokollInPruefung(blocks, test.meta.versuch, test.meta, !mitHilfen))
  // Nummern der KI werden zu Kennungen („M{tabelle}"); die Nummern entstehen beim Darstellen aus der Reihenfolge
  blocks.splice(0, blocks.length, ...verschluesseleMaterialverweise(blocks))
  if (test.meta.bewertung.punkteAufBlatt) verteilePunkte(blocks, test.meta.bewertung.bereich)
  // Ohne Punkte auf dem Blatt auch keine im Erwartungshorizont – die KI hält sich nicht immer an „0"
  else for (const a of aufgabenIn(blocks)) a.points = 0
  zwischenstand?.(blocks)
  // Ankreuzfragen zu Texten (01.10.2026): Blindprobe ohne Text, Lösbares neu fassen (shared/verstehen/blindprobe.ts)
  let fertig = blocks
  if (blindprobeAktiv()) {
    const probe = await blindprobeBloecke(blocks, ai, { melde: onStep }).catch(() => null)
    if (probe?.geprueft) fertig = probe.bloecke
  }
  // Annotationen zu Hörtexten/Videos (02.10.2026): sparsam wie in Prüfungen (arbeitsblatt/generation/hoerVokabular.ts)
  if (fertig.some((b) => b.type === 'audio' || b.type === 'video')) {
    linkListeningTasks(fertig)
    onStep('Annotationen zum Hörtext werden ausgewählt …')
    ;[fertig] = await vokabelnFuerFassungen(worksheetMetaForKurztest(test), [fertig], 'pruefung', ai)
  }
  return fertig
}

/**
 * Verteilt Punkte, wenn wirklich keine ankamen, und bringt die Summe in die gewünschte Spanne.
 *
 * Im ersten Prüfdurchlauf mit echter KI (23.09.2026) stand an jeder Aufgabe null Punkte. Das
 * lag NICHT an der KI: Der gemeinsame Umwandlungsweg `convertBlock` setzte die Punkte fest auf 0
 * (seit Paket 6 behoben, arbeitsblatt/generation/convert.ts). Diese Verteilung nach der Zahl
 * der Teilaufgaben bleibt als Rückfall für den Fall, dass die KI wirklich keine Punkte nennt.
 */
export function verteilePunkte(blocks: WsBlock[], bereich?: Punktebereich): void {
  const aufgaben = aufgabenIn(blocks)
  if (!aufgaben.length) return
  punkteNachTeilaufgaben(aufgaben)
  if (bereich) skaliereAufBereich(aufgaben, bereich)
}

/**
 * Bringt die Punktsumme in die gewünschte Spanne (Rechnung in shared/punkte.ts).
 * Liegt die Summe schon in der Spanne, passiert nichts – die Bepunktung der KI ist näher am
 * tatsächlichen Aufwand als jede Rechnung hier.
 */
function skaliereAufBereich(aufgaben: ReturnType<typeof aufgabenIn>, bereich: Punktebereich): void {
  const summe = aufgaben.reduce((s, a) => s + a.points, 0)
  if (summe <= 0 || bereich.min > bereich.max) return
  if (summe >= bereich.min && summe <= bereich.max) return
  skalierePunkte(aufgaben, summe < bereich.min ? bereich.min : bereich.max)
}

/** Wie lange der fertige Test schätzungsweise dauert. */
export function dauerSchaetzung(blocks: WsBlock[]): number {
  let teilaufgaben = 0
  let mitWeg = false
  for (const b of blocks) {
    if (b.type !== 'task') continue
    teilaufgaben += Math.max(1, b.parts.length)
    if (['lines', 'space'].includes(b.answer.kind)) mitWeg = true
  }
  return geschaetzteMinuten(teilaufgaben, mitWeg)
}
