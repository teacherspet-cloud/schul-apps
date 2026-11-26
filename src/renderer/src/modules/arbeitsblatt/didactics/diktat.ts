/**
 * Diktat im Fach Deutsch (26.11.2026, Wunsch der Lehrkraft; Recherche und Abstimmung siehe Sitzung).
 *
 * Grundsatz (abgestimmt): Das Diktat steht im Zentrum. Ohne weitere Wahl entsteht nur das Diktat
 * selbst – Lehrkraftblatt (Text mit Diktierpausen, Zielwörter, Ablauf, Fehlerschlüssel) und die
 * Niederschrift für die Lernenden. Vor- und Nachbereitung (Lernwörter, Strategien, Berichtigung …)
 * kommen nur dazu, wenn die Lehrkraft sie vor dem Erstellen auswählt.
 *
 * BELEGT – ISB Bayern, Handreichung „Leistungserhebungen im Fach Deutsch" (Realschule), Kap. 3.1.9/3.2:
 *  - für Übung UND Prüfung: klassisches Diktat, Lückendiktat (ganzer Text wird diktiert, nur die Lücken
 *    werden geschrieben), Diktat mit Wörterbuch; Mehrstufen-/Zwillingsdiktat (Fehlerzahl je Zeile,
 *    selbst finden und einordnen, später leicht abgewandelter Text);
 *  - nur zum Üben: Lauf-/Schleich-, Partner-, Dosen-/Schachteldiktat;
 *  - Vorlesen: erst ganz, dann Satz für Satz in Sinnabschnitten, am Ende noch einmal ganz; danach Zeit
 *    zum Verbessern. Satzschlusszeichen werden angesagt, Kommas in der Regel nicht.
 * BELEGT – Niedersachsen KC Grundschule: Wendediktat (Rückseite) und Dosendiktat gegen buchstaben-
 *  weises Abschreiben; „Richtig schreiben" in Kombination verschiedener Aufgabenformen prüfen.
 * BELEGT – Rheinland-Pfalz (Fachberatung 2023): Diktat nicht alleiniges Instrument; Ersatzformen
 *  (Fehlertext korrigieren, Schreibweisen begründen, Wörterbuch) → Form „Rechtschreibüberprüfung".
 * BELEGT – Bayern: Diktat als Schulaufgabe nicht zulässig (klassenarbeit/model/examRules.ts).
 * FAUSTREGEL – Wortzahl je Klasse: Kl. 2 ≈ 40, 3 ≈ 80, 4 ≈ 100 (familie.de, Lehrkraft-Tipps);
 *  5: 120–150, 6: 150–180, 7: 180–210 (Fachkonferenz Schubart-Gymnasium Aalen 2024); 8–10 hochgerechnet.
 * FAUSTREGEL – Strategien nach FRESCH (Schwingen, Verlängern, Ableiten, Merken, Großschreibung).
 */
import { arr, obj, str } from '../../../shared/aiSchema'
import { newId } from '../../vokabeltest/model/random'
import { emptyAnswer } from '../model/factory'
import type { DiktatBlock, DiktatForm, DiktatSetup, TaskBlock, WorksheetMeta } from '../model/types'

export const DIKTAT_FORMEN: { value: DiktatForm; label: string; beschreibung: string; nurUebung?: boolean }[] = [
  { value: 'klassisch', label: 'Diktat (klassisch)', beschreibung: 'Die Lehrkraft liest vor, die Lernenden schreiben den ganzen Text mit.' },
  { value: 'lueckendiktat', label: 'Lückendiktat', beschreibung: 'Der ganze Text wird diktiert, geschrieben werden nur die Wörter in den Lücken – die Zielwörter des Phänomens.' },
  {
    value: 'mehrstufen',
    label: 'Mehrstufendiktat',
    beschreibung: 'Die Lehrkraft nennt nur die Fehlerzahl je Zeile; die Lernenden finden und berichtigen selbst. Mit Zwillingstext für später.'
  },
  { value: 'laufdiktat', label: 'Laufdiktat', beschreibung: 'Textstreifen hängen aus; Abschnitt lesen, merken, zum Platz laufen, aufschreiben.', nurUebung: true },
  { value: 'partnerdiktat', label: 'Partnerdiktat', beschreibung: 'Zwei Lernende diktieren sich die Textteile A und B gegenseitig und kontrollieren sich.', nurUebung: true },
  { value: 'dosendiktat', label: 'Dosendiktat', beschreibung: 'Abschnitte auf Streifen: lesen, in die Dose stecken, aus dem Gedächtnis schreiben, vergleichen.', nurUebung: true },
  { value: 'wendediktat', label: 'Wendediktat', beschreibung: 'Satz lesen, merken, Blatt wenden und auswendig aufschreiben.', nurUebung: true },
  {
    value: 'pruefung',
    label: 'Rechtschreibüberprüfung',
    beschreibung: 'Kurzdiktat plus Fehlertext, Schreibweisen begründen und eine Wörterbuchaufgabe – Ersatzform für die Klassenarbeit (RLP, Nds.).'
  }
]

/** Vor- und Nachbereitung – nur auf Wunsch */
export const DIKTAT_ZUSATZ: { value: string; label: string; wann: 'vorher' | 'nachher'; prompt: string }[] = [
  {
    value: 'lernwoerter',
    label: 'Lernwörter üben',
    wann: 'vorher',
    prompt: 'Eine Aufgabe zum Üben der Lernwörter aus dem Diktat (z. B. Wörter nach Silben schwingen, abschreiben mit Abdecken, in Sätze einbauen).'
  },
  {
    value: 'strategien',
    label: 'Rechtschreibstrategie zum Phänomen',
    wann: 'vorher',
    prompt: 'Eine Aufgabe, die die passende Rechtschreibstrategie zum Phänomen erarbeitet (Schwingen, Verlängern, Ableiten, Merken, Großschreibung) – mit kurzer Regel und Übungswörtern.'
  },
  { value: 'sortieren', label: 'Wörter nach Phänomen sortieren', wann: 'vorher', prompt: 'Eine Aufgabe, in der Wörter mit dem Phänomen in eine Tabelle sortiert werden.' },
  { value: 'wortfamilien', label: 'Wortfamilien bilden', wann: 'vorher', prompt: 'Eine Aufgabe zu Wortfamilien der Zielwörter (verwandte Wörter mit gleicher Schreibung des Stamms).' },
  {
    value: 'berichtigung',
    label: 'Berichtigungsbogen',
    wann: 'nachher',
    prompt:
      'Eine Berichtigungsaufgabe als Tabelle mit den Spalten „Fehlerwort richtig", „Strategie/Regel", „verwandtes Wort oder Verlängerung", „eigener Satz" und sechs leeren Zeilen.'
  },
  {
    value: 'fehleranalyse',
    label: 'Fehler einordnen',
    wann: 'nachher',
    prompt: 'Eine Aufgabe, in der die Lernenden ihre Fehler den Strategien zuordnen (Schwingen, Verlängern, Ableiten, Merken, Großschreibung) und je Strategie eine Übung wählen.'
  }
]

export interface DiktatSchwerpunkt {
  value: string
  label: string
  gruppe: string
  beispiele: string[]
  strategie: string
  /** Üblich ab Klasse */
  ab: number
}

/**
 * Rechtschreibschwerpunkte zur Auswahl (Mehrfachauswahl, 26.11.2026).
 * BELEGT: VERA-8-Lupenstellen (QUA-LiS NRW), AFRA-Kategorien in VERA-3, KMK-Bildungsstandards 2022,
 * Rechtschreibrahmen Sachsen 2025, LehrplanPLUS Bayern Gymnasium 5–8, OLFA 3–9 (Thomé 2023).
 * FAUSTREGEL: „ab Klasse" aus diesen Quellen zusammengeführt – kein einzelner Lehrplan gibt es so vor.
 */
export const DIKTAT_SCHWERPUNKTE: DiktatSchwerpunkt[] = [
  { value: 'lauttreu', label: 'Laute vollständig (Wortdurchgliederung)', gruppe: 'Laut und Buchstabe', beispiele: ['Erdbeere', 'Strumpf', 'plötzlich'], strategie: 'Schwingen', ab: 2 },
  { value: 'besondere', label: 'sp/st, qu, x/chs, pf, nk', gruppe: 'Laut und Buchstabe', beispiele: ['Spinne', 'Qualle', 'Fuchs'], strategie: 'Merken, Schwingen', ab: 2 },
  { value: 'fvph', label: 'f, v oder ph', gruppe: 'Laut und Buchstabe', beispiele: ['Vogel', 'voll', 'Strophe'], strategie: 'Merken', ab: 3 },
  { value: 'ie', label: 'Langes i (ie)', gruppe: 'Vokallänge und -kürze', beispiele: ['Biene', 'liegen', 'Tiger'], strategie: 'Schwingen', ab: 2 },
  { value: 'dehnung', label: 'Dehnungs-h und Doppelvokal', gruppe: 'Vokallänge und -kürze', beispiele: ['fahren', 'Zahl', 'Boot'], strategie: 'Merken', ab: 3 },
  { value: 'silbenh', label: 'Silbentrennendes h', gruppe: 'Vokallänge und -kürze', beispiele: ['gehen', 'Schuh', 'sieht'], strategie: 'Schwingen, Verlängern', ab: 3 },
  { value: 'doppelkonsonant', label: 'Doppelkonsonant', gruppe: 'Vokallänge und -kürze', beispiele: ['Teller', 'kommt', 'Ball'], strategie: 'Schwingen, Verlängern', ab: 2 },
  { value: 'ck_tz', label: 'ck und tz', gruppe: 'Vokallänge und -kürze', beispiele: ['Decke', 'Katze', 'schmeckt'], strategie: 'Schwingen, Verlängern', ab: 3 },
  { value: 'slaute', label: 's-Laute (s, ss, ß)', gruppe: 'Vokallänge und -kürze', beispiele: ['Straße', 'Fluss', 'reisen'], strategie: 'Verlängern, Merken', ab: 4 },
  { value: 'auslaut', label: 'Auslautverhärtung (d/t, b/p, g/k)', gruppe: 'Wortbausteine', beispiele: ['Hund', 'Korb', 'Zug'], strategie: 'Verlängern', ab: 2 },
  { value: 'umlaut', label: 'Umlaut ä/äu ableiten', gruppe: 'Wortbausteine', beispiele: ['Äpfel', 'Bäume', 'läuft'], strategie: 'Ableiten', ab: 2 },
  { value: 'nachsilben', label: 'Nachsilben -ig/-lich, -ung/-heit/-keit/-nis', gruppe: 'Wortbausteine', beispiele: ['ruhig', 'fröhlich', 'Ergebnis'], strategie: 'Verlängern, Zerlegen', ab: 3 },
  { value: 'vorsilben', label: 'Vorsilben (ver-/vor-, ent-/end-) und Morphemgrenzen', gruppe: 'Wortbausteine', beispiele: ['verlieren', 'endlich', 'Schifffahrt'], strategie: 'Zerlegen', ab: 4 },
  { value: 'gross_nomen', label: 'Großschreibung: Nomen und Satzanfang', gruppe: 'Groß- und Kleinschreibung', beispiele: ['Haus', 'Freundlichkeit', 'Satzanfang'], strategie: 'Artikelprobe, Erweitern', ab: 2 },
  { value: 'gross_nominal', label: 'Nominalisierung und Tageszeiten', gruppe: 'Groß- und Kleinschreibung', beispiele: ['das Laufen', 'beim Lesen', 'heute Abend'], strategie: 'Artikelprobe, Erweitern', ab: 5 },
  { value: 'gross_anrede', label: 'Anredepronomen und Eigennamen', gruppe: 'Groß- und Kleinschreibung', beispiele: ['Sie', 'Ihnen', 'das Schwarze Meer'], strategie: 'Merken', ab: 5 },
  { value: 'getrennt', label: 'Getrennt- und Zusammenschreibung', gruppe: 'Getrennt und zusammen', beispiele: ['Rad fahren', 'kennenlernen', 'zum Beispiel'], strategie: 'Betonung, Zerlegen', ab: 6 },
  { value: 'gleichklang', label: 'das/dass und gleich klingende Wörter', gruppe: 'Gleich klingende Wörter', beispiele: ['dass', 'seit', 'wieder'], strategie: 'Ersatzprobe (dieses, welches)', ab: 5 },
  { value: 'fremdwoerter', label: 'Fremdwörter (th, rh, y, c, -ieren)', gruppe: 'Fremd- und Merkwörter', beispiele: ['Rhythmus', 'Theater', 'Computer'], strategie: 'Merken, Nachschlagen', ab: 6 },
  { value: 'zeichen_satz', label: 'Satzschluss und wörtliche Rede', gruppe: 'Zeichensetzung', beispiele: ['„Komm her!“, rief sie.', 'Fragezeichen', 'Ausrufezeichen'], strategie: 'Satzbau', ab: 2 },
  { value: 'komma_neben', label: 'Komma bei Aufzählung und Nebensatz', gruppe: 'Zeichensetzung', beispiele: ['…, weil …', '…, dass …', 'Äpfel, Birnen und Pflaumen'], strategie: 'Verbprobe', ab: 4 },
  { value: 'komma_infinitiv', label: 'Komma bei Infinitiv, Partizip und Apposition', gruppe: 'Zeichensetzung', beispiele: ['…, um zu …', '…, vor Freude strahlend, …', 'Herr Meier, unser Nachbar, …'], strategie: 'Satzbau', ab: 7 }
]

/** FAUSTREGEL (siehe Kopf): Wortzahl nach Klassenstufe */
export function diktatWortzahl(klasse: number): number {
  const t: Record<number, number> = { 1: 25, 2: 40, 3: 80, 4: 100, 5: 135, 6: 165, 7: 195, 8: 220, 9: 240, 10: 250 }
  return t[Math.max(1, Math.min(10, Math.round(klasse) || 5))] ?? 200
}

export const STANDARD_DIKTAT: DiktatSetup = { form: 'klassisch', schwerpunkte: [], woerter: 0, kommasDiktiert: false, zaehlart: 'isb', sechsAbProzent: 10, zusatz: [] }

export const istDiktatBlatt = (meta: Pick<WorksheetMeta, 'subjectId' | 'skillFocus' | 'diktat'>): boolean =>
  meta.subjectId === 'deutsch' && meta.skillFocus === 'diktat'

/** Sinnabschnitte eines Diktattextes („/" trennt) – Absätze bleiben über Zeilenwechsel erhalten */
export function sinnabschnitte(text: string): string[] {
  return text
    .split(/\s*\/\s*|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Der Text ohne Pausenzeichen (so wird er geschrieben) */
export const diktatOhnePausen = (text: string): string =>
  text
    .split('\n')
    .map((z) => z.replace(/\s*\/\s*/g, ' ').replace(/\s+/g, ' ').trim())
    .join('\n')
    .trim()

export const zaehleWoerter = (text: string): number => (diktatOhnePausen(text).match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu) ?? []).length
/** Mögliche Fehler nach ISB: Wörter + (diktierte) Satzzeichen */
export const moeglicheFehler = (text: string, kommasDiktiert: boolean): number =>
  zaehleWoerter(text) + (diktatOhnePausen(text).match(kommasDiktiert ? /[.!?:,;]/g : /[.!?:]/g) ?? []).length

/** Die Regeln für die KI */
export function diktatRegeln(meta: WorksheetMeta, setup: DiktatSetup): string {
  const woerter = setup.woerter || diktatWortzahl(meta.grade)
  const form = DIKTAT_FORMEN.find((f) => f.value === setup.form) ?? DIKTAT_FORMEN[0]
  const zusatz = DIKTAT_ZUSATZ.filter((z) => setup.zusatz.includes(z.value))
  return [
    `DIKTAT (${form.label}) für Klasse ${meta.grade}: ${form.beschreibung}`,
    `- Schreibe einen zusammenhängenden, altersgemäßen Text zum Thema „${meta.topic}" mit etwa ${woerter} Wörtern (±10 %).`,
    schwerpunktText(setup)
      ? `- Rechtschreibschwerpunkte: ${schwerpunktText(setup)}. Der Text enthält dazu viele natürliche Beispiele (zusammen etwa jedes sechste bis achte Wort, über die Schwerpunkte verteilt), wirkt aber nicht konstruiert.`
      : '- Wähle ein bis zwei für die Klassenstufe typische Rechtschreibphänomene und baue sie natürlich ein.',
    '- Nur Wörter und Regeln, die in dieser Klassenstufe üblich sind; keine Fallen mit Schreibvarianten, keine freiwilligen Kommas.',
    '- Markiere die Diktierpausen (Sinnabschnitte von drei bis sieben Wörtern) mit „ / " im Text. Absätze mit einer Leerzeile.',
    '- zielwoerter: alle Wörter im Text, die das Phänomen zeigen – genau so geschrieben wie im Text.',
    setup.form === 'lueckendiktat' ? '- Lückendiktat: Die Zielwörter werden die Lücken – höchstens jedes fünfte Wort, gut über den Text verteilt.' : '',
    setup.form === 'mehrstufen' ? '- zwilling: ein Zwillingstext mit denselben Zielwörtern in leicht anderem Zusammenhang (gleiche Länge, gleiche Pausenmarken).' : '',
    setup.form === 'pruefung'
      ? '- Rechtschreibüberprüfung: Das Diktat ist kurz (etwa die Hälfte der Wortzahl). Lege in pruefung GENAU DREI Aufgaben an: (1) einen Fehlertext mit 8–10 Fehlern zum Phänomen finden und berichtigen, (2) drei Schreibweisen mit einer Strategie begründen, (3) eine Wörterbuchaufgabe.'
      : '',
    zusatz.length
      ? ['Zusätzlich gewünschte Aufgaben (sonst KEINE weiteren Aufgaben):', ...zusatz.map((z) => `- in ${z.wann === 'vorher' ? 'vorbereitung' : 'nachbereitung'}: ${z.prompt}`)].join('\n')
      : setup.form === 'pruefung'
        ? ''
        : '- Lege KEINE weiteren Aufgaben an: Das Blatt ist das Diktat.'
  ]
    .filter(Boolean)
    .join('\n')
}

export const DIKTAT_SCHEMA = (aufgabe: Record<string, unknown>) =>
  obj({
    title: str('Titel des Diktats'),
    phaenomene: arr(str('Rechtschreibphänomen'), 'Ein bis zwei Phänomene'),
    text: str('Der Diktattext mit „ / " zwischen den Sinnabschnitten'),
    zielwoerter: arr(str('Zielwort, genau wie im Text')),
    zwilling: str('Zwillingstext (nur beim Mehrstufendiktat, sonst leer)'),
    vorbereitung: arr(aufgabe as never, 'Nur gewünschte VORBEREITUNGS-Aufgaben (Baustein type "task"), sonst leer'),
    nachbereitung: arr(aufgabe as never, 'Nur gewünschte NACHBEREITUNGS-Aufgaben (type "task" oder "table"), sonst leer'),
    pruefung: arr(aufgabe as never, 'Nur bei der Rechtschreibüberprüfung: die drei Aufgaben, sonst leer'),
    teacherNote: str('Kurzer Hinweis für die Lehrkraft (Deutsch)')
  })

export interface DiktatAntwort {
  title?: string
  phaenomene?: string[]
  text?: string
  zielwoerter?: string[]
  zwilling?: string
}

/** Der Diktat-Baustein aus der KI-Antwort */
export function diktatBaustein(d: DiktatAntwort, setup: DiktatSetup, topic: string): DiktatBlock {
  const text = String(d.text ?? '').trim()
  if (!text) throw new Error('Die KI hat keinen Diktattext geliefert.')
  const ohne = diktatOhnePausen(text)
  // Nur Zielwörter, die wirklich im Text stehen
  const zielwoerter = [...new Set((d.zielwoerter ?? []).map((w) => String(w).trim()).filter((w) => w && new RegExp(`(?<![\\p{L}])${esc(w)}(?![\\p{L}])`, 'u').test(ohne)))]
  return {
    id: newId(),
    type: 'diktat',
    title: String(d.title ?? '').trim() || topic || 'Diktat',
    form: setup.form,
    text,
    phaenomene: (d.phaenomene ?? []).map(String).filter(Boolean),
    zielwoerter,
    kommasDiktiert: setup.kommasDiktiert,
    zaehlart: setup.zaehlart,
    sechsAbProzent: setup.sechsAbProzent,
    ...(setup.form === 'mehrstufen' && d.zwilling?.trim() ? { zwilling: d.zwilling.trim() } : {})
  }
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Anweisung der Niederschrift je Form */
const NIEDERSCHRIFT: Record<DiktatForm, string> = {
  klassisch: 'Schreibe das Diktat mit. Lies am Ende alles noch einmal genau durch und verbessere.',
  lueckendiktat: 'Hör gut zu. Schreibe die fehlenden Wörter in die Lücken.',
  mehrstufen: 'Schreibe das Diktat mit. Danach bekommst du die Zahl deiner Fehler je Zeile: Finde und verbessere sie selbst.',
  laufdiktat: 'Lies einen Abschnitt am Laufzettel, merke ihn dir, laufe zum Platz und schreibe ihn auf. Vergleiche am Ende mit dem Laufzettel.',
  partnerdiktat: 'Diktiert euch die Textteile abwechselnd. Wer schreibt, schreibt hier; wer diktiert, kontrolliert nach jedem Satz.',
  dosendiktat: 'Lies einen Streifen, merke ihn dir, stecke ihn in die Dose und schreibe ihn auswendig auf. Vergleiche am Ende.',
  wendediktat: 'Lies einen Satz, merke ihn dir, wende das Blatt und schreibe den Satz auswendig auf. Vergleiche danach.',
  pruefung: 'Schreibe das Diktat mit. Lies am Ende alles noch einmal genau durch und verbessere.'
}

/** Niederschrift als Aufgabe: Schreiblinien nach Wortzahl, beim Lückendiktat der Text mit Lücken */
export function niederschrift(b: DiktatBlock, schreibraum = 1): TaskBlock {
  const ohne = diktatOhnePausen(b.text)
  const woerter = zaehleWoerter(b.text)
  const lueckenText = (): string => {
    let t = ohne
    for (const w of [...b.zielwoerter].sort((x, y) => y.length - x.length))
      t = t.replace(new RegExp(`(?<![\\p{L}\\[])${esc(w)}(?![\\p{L}\\]])`, 'gu'), `[[${w}]]`)
    return t
  }
  const answer =
    b.form === 'lueckendiktat'
      ? { ...emptyAnswer('gapText'), gapText: lueckenText() }
      : { ...emptyAnswer('lines'), count: Math.max(4, Math.round((woerter / 7) * schreibraum) + 2) }
  return {
    id: newId(),
    type: 'task',
    instruction: NIEDERSCHRIFT[b.form],
    operator: 'schreiben',
    afbReason: '',
    socialForm: b.form === 'partnerdiktat' ? 'PA' : 'EA',
    answer,
    parts: [],
    solution: ohne,
    points: 0,
    minutes: Math.max(10, Math.round(woerter / 8)),
    diktat: b.id
  } as TaskBlock
}

/** Sätze des Textes (Laufzettel, Dosenstreifen, Wendediktat) */
export const saetze = (text: string): string[] => diktatOhnePausen(text).match(/[^.!?]+[.!?]+["“”»]?|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? []

export type DiktatTeil =
  | { art: 'hinweis'; text: string }
  | { art: 'text'; titel?: string; text: string }
  | { art: 'liste'; titel: string; punkte: string[] }
  | { art: 'streifen'; titel: string; streifen: string[] }

/** Zielwörter im Text fett (Lehrkraftblatt) */
function mitZielwoertern(text: string, ziel: string[]): string {
  let t = text
  for (const w of [...ziel].sort((a, b) => b.length - a.length)) t = t.replace(new RegExp(`(?<![\\p{L}*])${esc(w)}(?![\\p{L}*])`, 'gu'), `**${w}**`)
  return t
}

const ABLAUF = [
  'Den ganzen Text einmal vorlesen (ohne Satzzeichen anzusagen).',
  'Jeden Satz einmal ganz vorlesen, dann in den Sinnabschnitten (/) diktieren; Satzschlusszeichen ansagen.',
  'Am Ende den ganzen Text noch einmal langsam vorlesen.',
  'Zeit zum Durchlesen und Verbessern geben.'
]

/** Was der Baustein zeigt – für Lehrkraft (Lösungsteil) und Lernende, gemeinsam für Blatt und Word */
export function diktatInhalt(b: DiktatBlock, lehrkraft: boolean, sechs: (fehler: number, woerter: number, prozent: number) => number): DiktatTeil[] {
  const form = DIKTAT_FORMEN.find((f) => f.value === b.form) ?? DIKTAT_FORMEN[0]
  const s = saetze(b.text)
  if (!lehrkraft) {
    if (b.form === 'laufdiktat' || b.form === 'dosendiktat')
      return [{ art: 'streifen', titel: b.form === 'laufdiktat' ? 'Laufzettel (ausschneiden und aushängen)' : 'Streifen für die Dose (ausschneiden)', streifen: s }]
    if (b.form === 'partnerdiktat') {
      const mitte = Math.ceil(s.length / 2)
      return [
        { art: 'text', titel: 'Text A – diktiert Kind A', text: s.slice(0, mitte).join(' ') },
        { art: 'text', titel: 'Text B – diktiert Kind B', text: s.slice(mitte).join(' ') }
      ]
    }
    if (b.form === 'wendediktat') return [{ art: 'liste', titel: 'Lies einen Satz, merke ihn dir, wende das Blatt und schreibe.', punkte: s }]
    return []
  }
  const woerter = zaehleWoerter(b.text)
  const moeglich = moeglicheFehler(b.text, b.kommasDiktiert)
  const noten: string[] = []
  for (let n = 1; n <= 6; n++) {
    const fs: number[] = []
    for (let f = 0; f <= woerter; f += 0.5) if (sechs(f, woerter, b.sechsAbProzent) === n) fs.push(f)
    if (fs.length) noten.push(`Note ${n}: ${n === 6 ? `ab ${fs[0]}` : fs[0] === fs[fs.length - 1] ? fs[0] : `${fs[0]}–${fs[fs.length - 1]}`} Fehler`)
  }
  const zaehlung =
    b.zaehlart === 'woerter'
      ? ['Gezählt wird nur die Schreibung der Wörter – Satzzeichen zählen nicht.']
      : [
          'Ein Fehler je Wort, gleich wie viele Buchstaben falsch sind; Groß-/Kleinschreibung zählt voll.',
          `Angesagte Satzzeichen: ${b.zaehlart === 'streng' ? 'ganzer' : 'halber'} Fehler${b.kommasDiktiert ? ' (Kommas werden angesagt)' : '; Kommas werden nicht angesagt und zählen nicht'}.`,
          'Wiederholungsfehler (gleiches Wort, gleich falsch) zählen einmal – nicht bei das/dass.'
        ]
  return [
    { art: 'hinweis', text: `${form.label} · ${woerter} Wörter · ${moeglich} mögliche Fehler${b.phaenomene.length ? ` · Schwerpunkt: ${b.phaenomene.join(', ')}` : ''}` },
    { art: 'text', titel: 'Diktattext (/ = Pause, fett = Zielwörter)', text: mitZielwoertern(b.text, b.zielwoerter) },
    { art: 'liste', titel: 'Ablauf beim Vorlesen', punkte: b.form === 'mehrstufen' ? [...ABLAUF, 'Beim Zurückgeben nur die Fehlerzahl je Zeile an den Rand schreiben.'] : ABLAUF },
    { art: 'liste', titel: 'Fehlerzählung', punkte: zaehlung },
    { art: 'liste', titel: `Notenvorschlag (Faustregel: Note 6 ab ${b.sechsAbProzent} % Fehlern – nur Orientierung)`, punkte: noten },
    ...(b.zwilling ? [{ art: 'text' as const, titel: 'Zwillingstext (ein bis zwei Wochen später)', text: b.zwilling }] : [])
  ]
}

/** Die gewählten Schwerpunkte in Worten (mit Beispielen für die KI) */
export function schwerpunktText(setup: Pick<DiktatSetup, 'schwerpunkte' | 'eigenerSchwerpunkt'>): string {
  const gewaehlt = DIKTAT_SCHWERPUNKTE.filter((s) => setup.schwerpunkte.includes(s.value)).map((s) => `${s.label} (z. B. ${s.beispiele.join(', ')})`)
  if (setup.eigenerSchwerpunkt?.trim()) gewaehlt.push(setup.eigenerSchwerpunkt.trim())
  return gewaehlt.join('; ')
}
