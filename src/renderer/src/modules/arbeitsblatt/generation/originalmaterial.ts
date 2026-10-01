/**
 * Originalmaterial beschaffen: suchen, laden, auf die Längenvorgabe kürzen, nachweisen.
 *
 * Wunsch der Lehrkraft (24.09.2026): „Hier soll die KI im Hintergrund nach geeigneten
 * Originalmaterialien im Internet suchen. Diese dürfen gekürzt werden ‚[...]‘ und mit anderen
 * Methoden auf Längenvorgaben reduziert werden."
 *
 * Die Arbeitsteilung ist der Kern dieser Datei:
 * - Die KI sagt, WONACH gesucht wird, und WELCHE Stellen des gefundenen Textes bleiben.
 * - Die App sucht, lädt und prüft. Sie nimmt keinen Wortlaut an, den sie nicht selbst gelesen hat.
 *
 * Damit ist die häufigste stille Fehlerquelle ausgeschlossen: eine Quelle, die es nicht gibt,
 * oder ein Zitat, das die KI aus dem Gedächtnis „ungefähr richtig" wiedergibt. Beides sieht
 * auf dem fertigen Blatt völlig unauffällig aus.
 */
import type { GeladeneQuelle, Materialanfrage, Quellentreffer, StructuredRequest } from '@shared/types'
import { arr, int, obj, str } from '../../../shared/aiSchema'
import { ablehnungsPruefer, normalisiereQuellenUrl, type AblehnungsDaten } from '@shared/quellenAblehnung'
import { pruefeRelevanz, relevanzText, type RelevanzBefund } from '../../../shared/quellenRelevanz'
import { wantsSourceHeader } from '../didactics/sourceHeader'
import { istUebungsklausur } from './abiturPrompt'
import { LANGUAGE_NAMES, subjectById } from '../model/subjects'

/** Moderne Fremdsprache (nicht Latein) – nur dort unterscheiden sich Ausgangs- und Zielsprache */
const fremdsprache = (subjectId: string): boolean => Boolean(subjectById(subjectId).foreignLanguage)
import type { OriginalMaterialAblage, Sheet, TextBlock, WorksheetMeta, WsBlock } from '../model/types'
import { kuerzungsHinweis, kuerzungsProtokoll, pruefeKuerzung, type KuerzungsPruefung } from './kuerzung'
import { befundText, bewerte, type Bewertung } from './textQualitaet'
import { bereinigeArtikeltext, type Artikel } from '@shared/artikelText'
import { einleitungErstellen } from './zuschnitt'

const wortzahlVon = (text: string): number => (text.match(/[\p{L}\p{N}]+/gu) ?? []).length

export type AiRuf = <T>(req: StructuredRequest) => Promise<T>

export interface MaterialDienste {
  suche: (anfrage: Materialanfrage) => Promise<Quellentreffer[]>
  laden: (url: string) => Promise<GeladeneQuelle>
  /**
   * Suche im offenen Netz über den KI-Anbieter.
   *
   * Die App selbst kann das nicht: Sie hat keinen Zugang zu einer Suchmaschine. Codex und
   * Claude Code haben ein Websuche-Werkzeug; kann der eingestellte Anbieter es nicht, bleibt
   * es bei den Archiven – dann gibt es weniger Auswahl, aber keinen Fehler.
   *
   * Zurück kommen nur FUNDSTELLEN. Den Wortlaut lädt die App anschließend selbst über
   * `laden` und misst ihn – eine erfundene Adresse fällt dabei auf.
   */
  netzsuche?: (auftrag: string) => Promise<Quellentreffer[]>
  /**
   * Die dauerhaft abgelehnten Quellen (01.10.2026) – gemeinsam für alle Programme.
   * Fehlt der Dienst (Tests, ältere Gegenstelle), wird nichts ausgeblendet.
   */
  ablehnungen?: () => Promise<AblehnungsDaten>
}

export interface MaterialWunsch {
  /** Thema des Arbeitsblatts bzw. der Klausur */
  thema: string
  fach: string
  /** Kennung des Faches – bestimmt, welche Quellentypen in Frage kommen */
  fachId: string
  /** Sprache des gesuchten Textes, zweibuchstabig */
  sprache: string
  jahrgang: number
  /** angestrebte Wortzahl des Ausgangstextes */
  zielWortzahl: number
  /**
   * Klausur statt Arbeitsblatt.
   *
   * Entscheidung der Lehrkraft (24.09.2026): Findet sich kein Originaltext, darf ein
   * Arbeitsblatt auf einen deutlich gekennzeichneten KI-Text ausweichen – eine Klausur
   * nicht. In der Prüfung wiegt die Echtheit des Materials schwerer als die Bequemlichkeit.
   */
  pruefung: boolean
  /**
   * Thema, unter dem Ablehnungen gespeichert werden (01.10.2026). Die Klassenarbeit sucht mit
   * „Thema – Teil" – abgelehnt wird aber für das Thema der ARBEIT, sonst gälte eine Ablehnung
   * im Teil „Mediation" nicht im Teil „Reading". Fehlt es, gilt `thema`.
   */
  kernthema?: string
  /** Lernziel bzw. Erwartung – für die Relevanzprüfung */
  lernziel?: string
  /** Sprachmittlung: Der Ausgangstext ist absichtlich deutsch */
  mediation?: boolean
}

export interface Originalmaterial {
  quelle: Quellentreffer
  /** der gekürzte Wortlaut, wie er aufs Blatt kommt */
  text: string
  /** vollständige Quellenangabe nach § 63 UrhG */
  quellenangabe: string
  /** sichtbarer Änderungshinweis nach § 62 Abs. 5 UrhG, ggf. leer */
  hinweis: string
  /** Kürzungsprotokoll für den Lehrkraftteil */
  protokoll: string[]
  /** einordnende Sätze der Lehrkraft – ausdrücklich NICHT Teil des Zitats */
  vorbemerkung: string
  pruefung: KuerzungsPruefung
  /** Einleitungssatz über dem Text und Fundstellen recherchierter Angaben (01.10.2026) */
  einleitung?: string
  einleitungFundstellen?: { angabe: string; url: string }[]
}

export type MaterialErgebnis =
  | {
      art: 'gefunden'
      material: Originalmaterial
      kandidaten: Quellentreffer[]
    }
  /** Nichts Passendes gefunden – das Blatt entsteht mit einem gekennzeichneten Autorentext */
  | { art: 'autorentext'; grund: string; kandidaten: Quellentreffer[] }
  /** Klausur ohne Originaltext: Abbruch, damit nichts Erfundenes in eine Prüfung gerät */
  | { art: 'abbruch'; grund: string; kandidaten: Quellentreffer[] }

// ---------- Schritt 1: Wonach wird gesucht? ----------

const SUCHE_SCHEMA = obj({
  begriffe: arr(
    str('Suchwörter für ein Textarchiv, 2–5 Wörter, in der Sprache des gesuchten Textes'),
    '4–6 verschiedene Suchanfragen, von der genauesten zur allgemeinsten'
  ),
  kernbegriffe: arr(
    str('Ein Begriff oder Name, ohne den ein Text nicht vom Thema handeln kann'),
    '1–4 Kernbegriffe in der Sprache des gesuchten Textes (z. B. ein Werktitel, ein Name, ein Fachbegriff)'
  ),
  gesucht: str('Was für ein Text gesucht wird (Textsorte, Zeit, Perspektive) – ein Satz')
})

/**
 * Wörter, die allein keine Suchanfrage tragen: Sie stehen in jedem zweiten Verzeichnis.
 *
 * Gemeldet am 01.10.2026: Aus „German Macbeth Adaptations" werden leicht Anfragen wie
 * „Rezeption Deutschland" oder „Adaption Bühne". Die Volltextsuche von Wikisource liefert darauf
 * Zeitschriften-Inhaltsverzeichnisse – dort stehen solche Wörter gehäuft (nachgemessen: „Macbeth
 * Rezeption Deutschland" → „William Shakespeare", „Friedrich Schiller", „Die Musikforschung").
 */
const ALLGEMEIN = new Set(
  'text texte quelle quellen auszug material deutsch deutsche deutschen deutschland german germany english englisch rezeption reception adaption adaptation adaptionen adaptations bearbeitung bearbeitungen geschichte history analyse analysis interpretation thema topic artikel article beispiel beispiele'.split(
    ' '
  )
)

/**
 * Räumt die Suchanfragen der KI auf: keine Einzelwörter, keine Anfragen ganz ohne Kernbegriff.
 *
 * Eine Anfrage ohne Kernbegriff („Rezeption Deutschland") findet alles, was irgendwie mit
 * Rezeption zu tun hat. Fehlt der Kernbegriff, wird er vorangestellt; besteht eine Anfrage nur
 * aus allgemeinen Wörtern, fällt sie weg.
 */
export function bereinigeSuchbegriffe(begriffe: string[], kern: string[]): string[] {
  const kernKlein = kern.map((k) => k.toLowerCase()).filter((k) => k.length >= 3)
  const aus: string[] = []
  for (const roh of begriffe) {
    const b = roh
      .replace(/["„“”]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const woerter = b.split(' ').filter(Boolean)
    if (!woerter.length) continue
    // Ein einzelnes Wort trägt nur, wenn es selbst ein Kernbegriff ist (ein Werktitel wie „Faust")
    if (woerter.length < 2 && !kernKlein.includes(b.toLowerCase())) continue
    const hatKern = kernKlein.some((k) => b.toLowerCase().includes(k))
    const tragend = woerter.filter((w) => w.length > 2 && !ALLGEMEIN.has(w.toLowerCase()))
    if (!tragend.length && !hatKern) continue
    aus.push(hatKern || !kern.length ? b : `${kern[0]} ${b}`)
  }
  return [...new Set(aus)]
}

/**
 * Lässt die KI Suchanfragen formulieren.
 *
 * Nicht überflüssig: Zu „Loreley" heißt der Text in Wikisource „Ich weiß nicht, was soll es
 * bedeuten", und Ciceros Reden stehen unter „In L. Catilinam orationes". Aus dem Thema die
 * richtigen Suchwörter zu machen, ist genau die Aufgabe, für die sich ein Sprachmodell eignet –
 * im Unterschied zum Wortlaut, den es nicht sicher kennt.
 *
 * ALLGEMEIN VOR GEZIELT (Vorgabe der Lehrkraft, 24.09.2026): „suche allgemein nach material,
 * nur gezielt nach autor, titel etc., wenn dies erfolgsversprechend ist."
 *
 * Das trifft die Sache: Zu „Migration" gibt es kein bestimmtes Werk, und eine Suche nach
 * Urheber und Titel geht dort ins Leere. Zu „Loreley" gibt es eines, und nur die gezielte
 * Suche findet es. Welcher Fall vorliegt, weiß das Sprachmodell – die App nicht.
 */
export async function suchbegriffe(wunsch: MaterialWunsch, ai: AiRuf): Promise<{ begriffe: string[]; gesucht: string; kernbegriffe: string[] }> {
  const data = await ai<{ begriffe: string[]; gesucht: string; kernbegriffe?: string[] }>({
    system:
      'Du hilfst einer Lehrkraft, einen echten, veröffentlichten Originaltext für den Unterricht zu finden. Du erfindest nichts und nennst keine Internetadressen – du formulierst nur Suchanfragen.',
    user: [
      `Fach: ${wunsch.fach}. Thema: ${wunsch.thema}. Jahrgang: ${wunsch.jahrgang}. Sprache des Textes: ${sprachName(wunsch.sprache)}.`,
      wunsch.lernziel?.trim() ? `Lernziel: ${wunsch.lernziel.trim()}` : '',
      `Gesucht wird ein zusammenhängender Originaltext von etwa ${wunsch.zielWortzahl} Wörtern (er darf deutlich länger sein und wird dann gekürzt).`,
      'Gesucht wird in Textarchiven und im offenen Netz.',
      /*
       * Sprache der Suchwörter (01.10.2026): Das Thema „German Macbeth Adaptations" ist
       * englisch formuliert, der Ausgangstext der Sprachmittlung aber deutsch. Halb englische,
       * halb deutsche Suchwörter finden in einem deutschen Archiv nur Zufallstreffer.
       */
      `SPRACHE DER SUCHWÖRTER: Formuliere ALLE Suchanfragen und Kernbegriffe auf ${sprachName(wunsch.sprache)} – auch wenn das Thema in einer anderen Sprache formuliert ist. Übersetze das Thema dazu sinngemäß und nutze die dort üblichen Fachwörter und Synonyme.`,
      wunsch.mediation
        ? 'Es geht um eine SPRACHMITTLUNG: Gesucht wird ein deutscher Gebrauchs- oder Sachtext (Zeitungsartikel, Kritik, Informationsseite) ZUM Thema – keine Literaturgeschichte und kein Verzeichnis.'
        : '',
      'KERNBEGRIFFE: Nenne 1–4 Begriffe oder Namen, ohne die ein Text nicht vom Thema handeln kann (bei „German Macbeth Adaptations" etwa „Macbeth"). Jede Suchanfrage muss mindestens einen Kernbegriff enthalten.',
      'SUCHE ZUERST ALLGEMEIN NACH MATERIAL ZUM THEMA:',
      '- Verbinde das Sachthema mit der Textsorte und, wo es passt, mit Zeit oder Ort („Migration Debatte Kommentar", „Weimarer Republik Rede Reichstag 1930").',
      '- Denke an die Textsorten, die zum Fach gehören: Zeitungskommentar, Rede, Brief, Essay, Gesetzestext, Bericht, Statistik.',
      '',
      'GEZIELT NACH URHEBER UND WERKTITEL NUR DANN, WENN DAS AUSSICHT AUF ERFOLG HAT:',
      '- also wenn der Unterrichtsgegenstand SELBST ein bestimmtes Werk ist (eine Lektüre, ein Gedicht, eine berühmte Rede, eine benannte Quelle),',
      '- oder wenn es zum Thema ein einschlägiges Werk gibt, das du sicher kennst.',
      '- Ist das Thema dagegen ein Sachgebiet („Migration", „Nachhaltigkeit", „Elektromobilität"), suche NICHT nach einem Werktitel: Es gibt keinen, und die Suche geht ins Leere.',
      '- Ist der bekannte Titel volkstümlich, nenne zusätzlich den echten Titel oder die erste Zeile („Loreley" → „Ich weiß nicht, was soll es bedeuten").',
      '',
      '- Vermeide Gattungswörter allein („Text", „Quelle", „Auszug") – sie stehen in keinem Titel.',
      '- Vermeide Anfragen aus lauter allgemeinen Wörtern („Rezeption Deutschland", „Adaption Bühne"): Sie finden Register und Zeitschriftenverzeichnisse, in denen diese Wörter zufällig stehen.',
      '- Achte auf Verwechslungen mit gleichnamigen Werken (Oper, Film) und grenze sie durch ein weiteres Wort ab („Macbeth Inszenierung Schauspiel").',
      '- Gib verschiedene Wege an, nicht Abwandlungen desselben: ein Sachthema, eine Textsorte mit Zeitbezug, ein Werk (falls einschlägig). Gefunden wird oft erst mit dem dritten.'
    ].join('\n'),
    schemaName: 'material_suche',
    schema: SUCHE_SCHEMA
  })
  const kernbegriffe = (Array.isArray(data?.kernbegriffe) ? data.kernbegriffe : [])
    .map((b) => String(b).trim())
    .filter((b) => b.length >= 3)
    .slice(0, 4)
  const roh = (Array.isArray(data?.begriffe) ? data.begriffe : []).map((b) => String(b).trim()).filter(Boolean)
  const begriffe = bereinigeSuchbegriffe(roh, kernbegriffe)
  return {
    // Bleibt nach dem Aufräumen nichts übrig, sind die Rohanfragen besser als gar keine
    begriffe: (begriffe.length ? begriffe : roh).slice(0, 6),
    gesucht: String(data?.gesucht ?? ''),
    kernbegriffe
  }
}

const sprachName = (code: string): string =>
  ({ de: 'Deutsch', en: 'Englisch', fr: 'Französisch', es: 'Spanisch', it: 'Italienisch', la: 'Latein', ...LANGUAGE_NAMES })[code] ?? code

// ---------- Schritt 2: Auswählen und kürzen ----------

const KUERZUNG_SCHEMA = obj({
  nummer: int('Nummer des gewählten Textes aus der Liste; -1, wenn keiner geeignet ist'),
  begruendung: str('Warum dieser Text geeignet bzw. warum keiner geeignet ist – ein Satz'),
  gekuerzt: str('Der gekürzte Text im WÖRTLICHEN Originalwortlaut, Auslassungen als [...]'),
  quellenangabe: str('Urheber, Titel, Publikationsort, Datum. Fundort: <Adresse>'),
  vorbemerkung: str('Ein bis zwei Sätze der Lehrkraft, die den Textausschnitt einordnen – oder leer')
})

export interface Kuerzungsauftrag {
  nummer: number
  begruendung: string
  gekuerzt: string
  quellenangabe: string
  vorbemerkung: string
}

/**
 * Die Regeln, nach denen gekürzt werden darf.
 *
 * Sie stehen hier und nicht verstreut in den Prompts, weil sie zusammen einen Rechtsstand
 * abbilden: § 62 Abs. 5 UrhG erlaubt die Kürzung nur, wenn sie sichtbar gemacht wird, und
 * § 62 Abs. 1 verbietet alles, was darüber hinausgeht.
 */
export const KUERZUNGSREGELN = [
  'KÜRZEN – NUR WEGLASSEN, NIEMALS UMSCHREIBEN:',
  '- Übernimm jeden übernommenen Satz WÖRTLICH, Zeichen für Zeichen. Formuliere nichts um, vereinfache nichts, „glätte" nichts.',
  '- Streiche nur zusammenhängende Teile (Sätze, Absätze) und setze an jede Streichung [...].',
  '- Verliert ein Bezugswort durch die Streichung seinen Sinn, ersetze es in eckigen Klammern: „er" → „[Müller]". Sonst verändere kein Wort.',
  '- Schreibe KEINE Übergangssätze in den Text. Fehlt Zusammenhang, gehört er in die Vorbemerkung, nicht ins Zitat.',
  '- Erhalte nach Möglichkeit Anfang und Schluss sowie den Gedankengang.',
  '- Streiche zuerst Exkurse, Wiederholungen und Beispielhäufungen, nicht die Argumentation.',
  '- Wähle einen zusammenhängenden Ausschnitt, statt viele kleine Stücke aneinanderzureihen.'
].join('\n')

export async function waehleUndKuerze(
  wunsch: MaterialWunsch,
  kandidaten: { treffer: Quellentreffer; quelle: GeladeneQuelle }[],
  ai: AiRuf
): Promise<Kuerzungsauftrag> {
  const liste = kandidaten
    .map((k, i) =>
      [
        `--- Text ${i} ---`,
        `Titel: ${k.treffer.titel}${k.treffer.urheber ? ` · Urheber: ${k.treffer.urheber}` : ''}`,
        `Fundort: ${k.treffer.url}`,
        `Umfang: ${k.quelle.wortzahl} Wörter`,
        k.quelle.text
      ].join('\n')
    )
    .join('\n\n')
  return ai<Kuerzungsauftrag>({
    system: 'Du bereitest einen echten Originaltext für den Unterricht auf. Du darfst kürzen, aber nichts umformulieren und nichts hinzuerfinden.',
    user: [
      `Fach: ${wunsch.fach}. Thema: ${wunsch.thema}. Jahrgang: ${wunsch.jahrgang}.`,
      `Ziel: ein Ausgangstext von etwa ${wunsch.zielWortzahl} Wörtern.`,
      'Wähle aus den folgenden Texten den geeignetsten aus und kürze ihn auf die Zielwortzahl.',
      'Ungeeignet ist ein Text, der nicht zum Thema passt, kein zusammenhängender Text ist (Register, Verzeichnis, Inhaltsangabe) oder für den Jahrgang unzumutbar ist. Dann nummer = -1.',
      /*
       * Nachgemessen am 24.09.2026: Auf „Heine, Die Lore-Ley" lieferte die Websuche unter
       * anderem einen Blogbeitrag mit einer ANALYSE des Gedichts. Der Text ist sprachlich
       * einwandfrei und besteht jede maschinelle Prüfung – er ist nur nicht die Quelle,
       * sondern eine Aussage darüber. Auf dem Blatt stünde dann eine fremde Deutung da, wo
       * die Lernenden selbst deuten sollen.
       */
      'ACHTUNG – eine Analyse, Interpretation, Rezension oder Unterrichtsvorbereitung ÜBER einen Text ist NICHT der Text selbst. Verlangt die Aufgabe eine Quelle, ist ein solcher Beitrag ungeeignet, so gut er auch geschrieben ist.',
      KUERZUNGSREGELN,
      'QUELLENANGABE: Urheber, Titel, Publikationsort bzw. Archiv, Datum, Fundort-Adresse. Bei Zeitungsartikeln zusätzlich den Namen der Zeitung.',
      'VORBEMERKUNG: Wenn der Ausschnitt ohne Kontext unverständlich wäre, schreibe ein bis zwei einordnende Sätze. Diese Sätze sind ausdrücklich NICHT Teil des Zitats.',
      liste
    ].join('\n\n'),
    schemaName: 'material_kuerzung',
    schema: KUERZUNG_SCHEMA
  })
}

// ---------- Ablauf ----------

/** Wie viele geladene Volltexte der KI höchstens vorgelegt werden. */
const MAX_KANDIDATEN = 3

/**
 * Wie viele Treffer überhaupt geladen und gemessen werden.
 *
 * Deutlich mehr als die drei, die am Ende gebraucht werden: Erst am geladenen Text zeigt
 * sich, ob er taugt. Ein Titel verrät nicht, dass die Seite ein Register ist oder aus einem
 * Scan mit Trennstrichen besteht – und die Qualitätsprüfung wirft erfahrungsgemäß die
 * Mehrzahl der Funde wieder heraus.
 *
 * Wunsch der Lehrkraft (24.09.2026): „die KI soll gründlich nach möglichen originalmaterial
 * für arbeitsblätter, klausuren etc. suchen."
 */
const MAX_LADEN = 12

export interface GepruefterTreffer {
  treffer: Quellentreffer
  wortzahl: number
  /** lesbare Beschreibung des Befunds für die Trefferliste */
  befund: string
  /** 0 bis 1 – bestimmt die Reihenfolge */
  rang: number
  /** Relevanzprüfung (01.10.2026): Textart, Passung, Begründung der KI */
  relevanz?: RelevanzBefund
  /** Kurzfassung der Relevanzprüfung für die Trefferliste */
  begruendung?: string
}

export interface MaterialLauf {
  wunsch: MaterialWunsch
  dienste: MaterialDienste
  ai: AiRuf
  /** meldet Zwischenstände an die Oberfläche */
  fortschritt?: (text: string) => void
  /**
   * In Sek II wählt die Lehrkraft aus den Treffern aus (Entscheidung vom 24.09.2026).
   *
   * Vorgelegt werden nur GELADENE und GEMESSENE Texte, nach Eignung sortiert. Eine Liste aus
   * bloßen Titeln wäre für die Lehrkraft wertlos: Sie müsste jeden Treffer selbst öffnen –
   * und genau die Arbeit soll ihr die Suche abnehmen.
   *
   * Liefert die gewählte Adresse oder null für „keiner davon".
   */
  auswahl?: (treffer: GepruefterTreffer[]) => Promise<string | null>
}

/** Höchstens so viele Funde derselben Website werden geladen, solange es andere gibt */
const MAX_JE_SEITE = 4

/**
 * Reihenfolge zum Laden: Archive und offenes Netz abwechselnd, je Website begrenzt.
 *
 * Befund vom 01.10.2026: Die Archivtreffer kamen zuerst in die Liste, die Netzfunde dahinter –
 * und geladen wurden nur die ersten zwölf. Lieferte Wikisource zwölf Treffer, wurde KEIN
 * einziger Netzfund je geprüft, so gut er war. Zu „German Macbeth Adaptations" bestand die
 * Auswahl deshalb nur aus Wikisource-Seiten, darunter ein Zeitschriftenverzeichnis und eine
 * Autorenseite – während eine Theaterkritik aus dem Netz nie geladen wurde.
 *
 * Reicht die Vielfalt nicht (nur ein Archiv lieferte etwas), wird mit den übrigen aufgefüllt:
 * Begrenzt wird die Reihenfolge, nicht die Auswahl.
 */
export function mischeQuellen(treffer: Quellentreffer[], max = MAX_LADEN): Quellentreffer[] {
  const seite = (t: Quellentreffer): string => {
    try {
      return new URL(t.url).hostname.replace(/^www\./, '')
    } catch {
      return t.url
    }
  }
  const gruppen = new Map<string, Quellentreffer[]>()
  for (const t of treffer) gruppen.set(t.herkunft, [...(gruppen.get(t.herkunft) ?? []), t])
  const reihen = [...gruppen.values()]
  const je = new Map<string, number>()
  const vorn: Quellentreffer[] = []
  const zurueck: Quellentreffer[] = []
  for (let i = 0; reihen.some((r) => i < r.length); i++) {
    for (const r of reihen) {
      const t = r[i]
      if (!t) continue
      const s = seite(t)
      const n = je.get(s) ?? 0
      if (n < MAX_JE_SEITE) {
        je.set(s, n + 1)
        vorn.push(t)
      } else zurueck.push(t)
    }
  }
  return [...vorn, ...zurueck].slice(0, max)
}

/** Rang aus Form (Messung) und Passung (KI): Die Passung wiegt schwerer – ein schöner Text zum falschen Thema nützt nichts */
function gesamtRang(form: number, relevanz?: RelevanzBefund): number {
  if (relevanz?.punkte === undefined) return form
  return Number((0.6 * (relevanz.punkte / 10) + 0.4 * form).toFixed(4))
}

export async function beschaffeOriginalmaterial(lauf: MaterialLauf): Promise<MaterialErgebnis> {
  const { wunsch, dienste, ai } = lauf
  lauf.fortschritt?.('Suchbegriffe werden bestimmt …')
  const { begriffe, kernbegriffe } = await suchbegriffe(wunsch, ai).catch(() => ({
    begriffe: [wunsch.thema],
    gesucht: '',
    kernbegriffe: [] as string[]
  }))

  /*
   * Dauerhaft abgelehnte Quellen ausblenden (01.10.2026) – für dieses Thema oder überhaupt.
   * Vorher galt „Keine davon" nur für den einen Lauf; die nächste Suche brachte dieselben Funde.
   */
  const ablehnungen = dienste.ablehnungen ? await dienste.ablehnungen().catch(() => null) : null
  const abgelehnt = ablehnungen ? ablehnungsPruefer(ablehnungen, wunsch.kernthema || wunsch.thema) : () => undefined
  let ausgeblendet = 0

  // Der Reihe nach suchen, bis genug Treffer da sind – die erste Anfrage ist die genaueste
  const treffer: Quellentreffer[] = []
  const gesehen = new Set<string>()
  const aufnehmen = (neue: Quellentreffer[]): void => {
    for (const t of neue) {
      // Dieselbe Seite in anderer Schreibweise (mobil, Unterstrich, Anker) ist dieselbe Seite
      const schluessel = normalisiereQuellenUrl(t.url) || t.url
      if (gesehen.has(schluessel)) continue
      gesehen.add(schluessel)
      if (abgelehnt(t.url)) {
        ausgeblendet++
        continue
      }
      treffer.push(t)
    }
  }
  const anfragen = begriffe.length ? begriffe : [wunsch.thema]
  for (const [i, begriff] of anfragen.entries()) {
    lauf.fortschritt?.(`Originalmaterial wird gesucht (${i + 1} von ${anfragen.length}): „${begriff}" …`)
    aufnehmen(await dienste.suche({ suchwoerter: begriff, sprache: wunsch.sprache, max: 8 }).catch(() => []))
    if (treffer.length >= MAX_LADEN) break
  }

  /*
   * Zusätzlich das offene Netz – dort stehen die aktuellen Texte.
   *
   * Die Archive enthalten fast nur Älteres. Für eine Sprachmittlung braucht es aber einen
   * heutigen Gebrauchstext, und für Politik oder Erdkunde eine Datenbasis, die „so zeitnah
   * wie möglich" ist (EPA Geographie 3.3).
   *
   * Die Netzsuche läuft NACH den Archiven, aber immer: Die Lehrkraft hat am 24.09.2026
   * ausdrücklich gründliche Suche gewünscht. Geladen wird anschließend abwechselnd aus Archiv
   * und Netz (`mischeQuellen`) – ein Fund aus dem offenen Netz kann sachlich der bessere sein,
   * und das entscheidet die Prüfung, nicht die Herkunft.
   */
  if (dienste.netzsuche) {
    lauf.fortschritt?.('Im Internet wird nach weiteren Quellen gesucht …')
    aufnehmen(await dienste.netzsuche(netzAuftrag(wunsch, begriffe)).catch(() => []))
  }
  const ausgeblendetSatz = ausgeblendet ? ` ${ausgeblendet === 1 ? 'Ein abgelehnter Fund wurde' : `${ausgeblendet} abgelehnte Funde wurden`} ausgeblendet.` : ''
  if (!treffer.length) return ergebnisOhneFund(wunsch, `In den freien Archiven wurde zu diesem Thema kein Originaltext gefunden.${ausgeblendetSatz}`, [])

  /*
   * Laden, messen, aussortieren, sortieren – und ERST DANN der Lehrkraft zeigen.
   *
   * Wunsch der Lehrkraft (24.09.2026): „um gefundenes Material zu filtern und zu ranken
   * bevor es den Nutzern gezeigt wird". Die Messung braucht den Volltext: Ob eine Seite ein
   * Register ist, aus einem Scan mit Trennstrichen besteht oder zur Hälfte aus Navigation,
   * sieht man dem Titel nicht an.
   */
  const qualitaet = {
    zielWortzahl: wunsch.zielWortzahl,
    jahrgang: wunsch.jahrgang,
    sprache: wunsch.sprache
  }
  const geprueft: {
    treffer: Quellentreffer
    quelle: GeladeneQuelle
    bewertung: Bewertung
  }[] = []
  const verworfen: string[] = []
  const artikelJeUrl = new Map<string, Artikel>()
  for (const t of mischeQuellen(treffer)) {
    lauf.fortschritt?.(`Quelle wird geprüft: ${t.titel} …`)
    const quelle = await dienste.laden(t.url).catch((e) => ({
      url: t.url,
      titel: '',
      text: '',
      wortzahl: 0,
      fehler: String(e)
    }))
    if (quelle.fehler) {
      verworfen.push(`${t.titel}: ${quelle.fehler}`)
      continue
    }
    /*
     * Seitenbeiwerk (Rubrik, Datum, Vorspann, Bildnachweis) wird VOR der Kürzung entfernt (01.10.2026) –
     * aber erst NACH Messung und Relevanzprüfung: Gerade die kurzen Zeilen verraten dort ein Register
     * oder eine Autorenseite.
     */
    const artikel = bereinigeArtikeltext(quelle.text, { seitentitel: quelle.titel })
    if (artikel.entfernt.length) artikelJeUrl.set(t.url, artikel)
    const bewertung = bewerte(quelle.text, qualitaet)
    if (bewertung.ausschluss.length) {
      verworfen.push(`${t.titel}: ${bewertung.ausschluss.join(', ')}`)
      continue
    }
    geprueft.push({ treffer: t, quelle, bewertung })
  }

  /*
   * Passt der Fund zum THEMA? (01.10.2026)
   *
   * Die Messung oben prüft nur die Form. „Die Musikforschung" (ein Zeitschriftenverzeichnis)
   * und „Friedrich Gundolf" (eine Autorenseite) bestanden sie beide – und landeten in der
   * Auswahl zu „German Macbeth Adaptations". Jetzt prüfen feste Regeln (Sprache, Seitenart,
   * Kernbegriffe) und danach die KI jeden Fund, BEVOR er der Lehrkraft gezeigt wird.
   */
  let passend: ((typeof geprueft)[number] & { relevanz?: RelevanzBefund })[] = geprueft
  if (geprueft.length) {
    lauf.fortschritt?.('Die KI prüft, ob die Funde zu Thema, Fach und Jahrgang passen …')
    const relevanz = await pruefeRelevanz(
      geprueft.map((g) => ({ treffer: g.treffer, text: g.quelle.text })),
      {
        thema: wunsch.thema,
        fach: wunsch.fach,
        jahrgang: wunsch.jahrgang,
        sprache: wunsch.sprache,
        lernziel: wunsch.lernziel,
        kernbegriffe,
        mediation: wunsch.mediation,
        pruefung: wunsch.pruefung
      },
      ai
    )
    passend = []
    geprueft.forEach((g, i) => {
      const r = relevanz[i]
      if (!r.ok) verworfen.push(`${g.treffer.titel}: ${r.gruende.join('; ')}`)
      else passend.push({ ...g, relevanz: r })
    })
  }
  passend.sort((a, b) => gesamtRang(b.bewertung.rang, b.relevanz) - gesamtRang(a.bewertung.rang, a.relevanz))
  // Ab hier zählt der bereinigte Artikeltext: Auswahl, Wortzahl und Kürzung (01.10.2026)
  passend = passend.map((g) => {
    const a = artikelJeUrl.get(g.treffer.url)
    return a?.text ? { ...g, quelle: { ...g.quelle, text: a.text, wortzahl: wortzahlVon(a.text) } } : g
  })

  if (!passend.length) {
    const details = verworfen.length ? ` Geprüft und verworfen: ${verworfen.slice(0, 3).join('; ')}.` : ''
    return ergebnisOhneFund(wunsch, `Keiner der gefundenen Texte war als Unterrichtsmaterial zu diesem Thema brauchbar.${details}${ausgeblendetSatz}`, treffer)
  }

  // In Sek II entscheidet die Lehrkraft, welche der geprüften Quellen genommen wird
  let kandidaten = passend
  if (lauf.auswahl) {
    const gewaehlt = await lauf.auswahl(
      passend.map((g) => ({
        treffer: g.treffer,
        wortzahl: g.quelle.wortzahl,
        befund: befundText(g.bewertung.befund, qualitaet),
        rang: gesamtRang(g.bewertung.rang, g.relevanz),
        ...(g.relevanz ? { relevanz: g.relevanz, begruendung: relevanzText(g.relevanz) } : {})
      }))
    )
    if (!gewaehlt) return ergebnisOhneFund(wunsch, 'Keiner der gefundenen Texte wurde übernommen.', treffer)
    kandidaten = passend.filter((g) => g.treffer.url === gewaehlt)
  }
  kandidaten = kandidaten.slice(0, MAX_KANDIDATEN)

  lauf.fortschritt?.('Der Originaltext wird auf den gewünschten Umfang gekürzt …')
  const auftrag = await waehleUndKuerze(wunsch, kandidaten, ai)
  const gewaehlt = kandidaten[auftrag.nummer]
  if (auftrag.nummer < 0 || !gewaehlt) return ergebnisOhneFund(wunsch, auftrag.begruendung || 'Keiner der gefundenen Texte passte zum Thema.', treffer)

  const pruefung = pruefeKuerzung(gewaehlt.quelle.text, auftrag.gekuerzt)
  // Einleitungssatz über dem Text (01.10.2026) – aus den Angaben der Seite, fehlende Angaben recherchiert
  const quellenangabe = quellenangabeMitAbruf(auftrag.quellenangabe, gewaehlt.treffer)
  const einleitung = await einleitungErstellen(
    {
      artikel: artikelJeUrl.get(gewaehlt.treffer.url) ?? { text: gewaehlt.quelle.text, entfernt: [] },
      text: auftrag.gekuerzt,
      titel: gewaehlt.treffer.titel,
      url: gewaehlt.treffer.url,
      sprache: wunsch.sprache,
      thema: wunsch.thema,
      quellenangabe,
      netzsuche: dienste.netzsuche
    },
    ai
  ).catch(() => null)
  return {
    art: 'gefunden',
    kandidaten: treffer,
    material: {
      quelle: gewaehlt.treffer,
      text: auftrag.gekuerzt,
      quellenangabe,
      hinweis: kuerzungsHinweis(pruefung),
      ...(einleitung?.text ? { einleitung: einleitung.text } : {}),
      ...(einleitung?.fundstellen.length ? { einleitungFundstellen: einleitung.fundstellen } : {}),
      vorbemerkung: (auftrag.vorbemerkung ?? '').trim(),
      protokoll: [
        ...(auftrag.vorbemerkung ? [`Vorbemerkung der Lehrkraft: „${auftrag.vorbemerkung}"`] : []),
        // Die Wortzahlen stehen im Kürzungsprotokoll („Umfang: …") – hier nicht noch einmal
        `Gewählt: ${gewaehlt.treffer.titel}`,
        ...(gewaehlt.relevanz?.kiGeprueft ? [`Relevanzprüfung: ${relevanzText(gewaehlt.relevanz)}`] : []),
        ...kuerzungsProtokoll(pruefung)
      ],
      pruefung
    }
  }
}

// ---------- Den Text selbst einsetzen ----------

/**
 * Baut die Bausteine für das beschaffte Material.
 *
 * Bewusst setzt die APP den Text ein und nicht die KI. Ein Sprachmodell, das einen Text
 * „übernimmt", ändert dabei Kleinigkeiten – ein Komma, ein Wort, eine Schreibweise. Auf dem
 * Blatt stünde das dann mit Quellenangabe da und sähe aus wie ein Zitat. Was die App selbst
 * einsetzt, ist dagegen genau der Wortlaut, den sie geladen und geprüft hat.
 *
 * Die Vorbemerkung bekommt einen EIGENEN Baustein. Stünde sie im Text, wäre sie Teil des
 * Zitats – und damit genau der Übergangssatz, den das Änderungsverbot des § 62 Abs. 1 UrhG
 * ausschließt.
 */
export function materialBausteine(
  material: OriginalMaterialAblage,
  meta: Pick<WorksheetMeta, 'subjectId'> & Partial<Pick<WorksheetMeta, 'skillFocus'>>,
  id: () => string
): WsBlock[] {
  const bausteine: WsBlock[] = []
  if (material.vorbemerkung?.trim()) {
    bausteine.push({
      id: id(),
      type: 'infoBox',
      variant: 'wissen',
      title: 'Zum Text',
      body: material.vorbemerkung.trim()
    })
  }
  const quelle: TextBlock = {
    id: id(),
    type: 'text',
    // Feste Kennung: Die KI verweist mit „M{quelle}", die Nummer vergibt die App nach der Stelle des Bausteins
    ref: 'quelle',
    title: `Q1: ${material.titel}`,
    body: material.text,
    // Zeilennummern: Ohne sie lässt sich kein Textbeleg angeben (EPA Geschichte 3.3.3)
    lineNumbers: true,
    // „Quelle:" schreibt die Darstellung davor – eine Angabe, die selbst so beginnt, stünde sonst doppelt („Quelle: Quelle: https://…", 27.09.2026)
    source: [material.quellenangabe.replace(/^\s*quelle\s*:\s*/i, ''), material.hinweis].filter(Boolean).join(' '),
    // Worthilfen nur, wenn sie geprüft im Text stehen (zuschnitt.ts, pruefeWorthilfen)
    glossary: material.worthilfen ?? [],
    // Einleitungssatz über dem Text (01.10.2026) – kursiv, nicht Teil des Zitats
    ...(material.einleitung?.trim() ? { intro: material.einleitung.trim() } : {}),
    ...(material.einleitungFundstellen?.length ? { introFundstellen: material.einleitungFundstellen } : {}),
    // Original für „kürzer/länger/anderer Ausschnitt" am Zauberstab
    ...(material.zuschnitt ? { zuschnitt: material.zuschnitt } : {}),
    /*
     * Sprache des Textes kennzeichnen (Paket 12): Die Prüfung der Sprachmittlung sucht den
     * DEUTSCHEN Ausgangstext über dieses Merkmal. Der eingesetzte Originaltext trug es nicht –
     * und die Prüfung meldete „Es fehlt der deutsche Ausgangstext", obwohl er dastand.
     */
    ...(fremdsprache(meta.subjectId) ? { language: meta.skillFocus === 'mediation' ? ('de' as const) : ('target' as const) } : {})
  }
  if (wantsSourceHeader(meta)) {
    /*
     * Nur eintragen, was tatsächlich bekannt ist. Entstehungsdatum und Textsorte weiß die
     * App nicht – sie zu erfinden wäre schlimmer als die Lücke, denn an genau diesen Angaben
     * hängt die Beurteilung der Standortgebundenheit. Die Prüfung meldet, was fehlt.
     */
    quelle.sourceHeader = {
      author: material.urheber ?? '',
      date: '',
      textType: '',
      found: material.quellenangabe
    }
  }
  bausteine.push(quelle)
  return bausteine
}

/**
 * Setzt die Materialbausteine ins Blatt.
 *
 * Normalerweise an den Anfang, hinter die Lernziele: Erst das Material, dann die Aufgaben
 * dazu – so liest man ein Arbeitsblatt.
 *
 * Bei einer ÜBUNGSKLAUSUR umgekehrt. Wunsch der Lehrkraft (24.09.2026): „füge bei
 * übungsklausuren die aufgabenstellungen außerdem an den anfang auf eine eigene seite und das
 * material auf nachfolgende seiten."
 *
 * So ist es auch in der Prüfung, und es hat einen Grund: Wer die Aufgaben vorher gelesen hat,
 * weiß beim Lesen des Materials, worauf er achten muss. Steht beides gemischt auf einer
 * Seite, blättert er ständig.
 *
 * Die Entscheidung trifft diese Funktion SELBST aus `meta.abitur`. Vorher war sie ein
 * Schalter, den der Aufrufer setzen musste – und der Erzeugungsweg in `generate.ts` setzte
 * ihn nicht. Die Tests gaben ihn mit, waren gruen, und auf dem fertigen Blatt stand die
 * Aufgabe weiterhin hinter dem Material (gemeldet am 25.09.2026). Was eine Funktion aus
 * ihren Eingaben ableiten kann, soll sie nicht von der Aufmerksamkeit des Aufrufers abhaengig
 * machen.
 */
export function setzeMaterialEin(
  sheet: Sheet,
  material: OriginalMaterialAblage,
  meta: Pick<WorksheetMeta, 'subjectId' | 'abitur'> & Partial<Pick<WorksheetMeta, 'skillFocus'>>,
  id: () => string
): Sheet {
  const bausteine = materialBausteine(material, meta, id)
  if (istUebungsklausur(meta)) {
    /*
     * Reihenfolge in der Klausur: Aufgabenstellung – Material – Schreibraum.
     *
     * Der Schreibraum wird dafür aus der Aufgabe HERAUSGELÖST: Er gehört normalerweise zum
     * Aufgabenbaustein und stünde damit vor dem Material. Die Aufgabe behält Anweisung,
     * Inhaltspunkte und Formvorgaben; die Linien kommen als eigener Baustein ans Ende.
     */
    const [erster, ...weitere] = bausteine
    const blocks = sheet.blocks.map((b) => b)
    let linien = 0
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i]
      if (b.type !== 'task' || b.answer.kind !== 'lines') continue
      linien = b.answer.count
      blocks[i] = { ...b, answer: { ...b.answer, kind: 'none', count: 0 } }
      break
    }
    const schreibraum: WsBlock[] = linien
      ? [
          {
            id: id(),
            type: 'workspace',
            kind: 'lines',
            // Eine Schreiblinie nimmt auf dem Blatt rund 8,5 mm ein
            heightMm: Math.round(linien * 8.5),
            label: ''
          }
        ]
      : []
    return {
      ...sheet,
      blocks: [...blocks, { ...erster, pageBreakBefore: true }, ...weitere, ...schreibraum]
    }
  }
  // Hinter die Lernziele: Sie sagen, worum es geht, und stehen deshalb immer zuerst
  const nach = sheet.blocks.findIndex((b) => b.type !== 'learningGoals')
  const stelle = nach < 0 ? sheet.blocks.length : nach
  return {
    ...sheet,
    blocks: [...sheet.blocks.slice(0, stelle), ...bausteine, ...sheet.blocks.slice(stelle)]
  }
}

/** Das Ergebnis der Beschaffung in der Form, in der es in der Datei landet. */
export function alsAblage(material: Originalmaterial): OriginalMaterialAblage {
  return {
    titel: material.quelle.titel,
    urheber: material.quelle.urheber,
    url: material.quelle.url,
    text: material.text,
    quellenangabe: material.quellenangabe,
    hinweis: material.hinweis,
    protokoll: material.protokoll,
    vorbemerkung: material.vorbemerkung.trim() || undefined,
    wortlautGeprueft: material.pruefung.ok,
    ...(material.einleitung ? { einleitung: material.einleitung } : {}),
    ...(material.einleitungFundstellen?.length ? { einleitungFundstellen: material.einleitungFundstellen } : {})
  }
}

/**
 * In welcher Sprache der Originaltext gesucht wird.
 *
 * Vorgabe der Lehrkraft (24.09.2026): „stell sicher, dass für sprachmittlungsaufgaben
 * (mediation) texte in der muttersprache der schüler in der sek ii gesucht werden als
 * originalmaterial."
 *
 * Das ist keine Feinheit, sondern die Aufgabe selbst: Bei der Sprachmittlung geben die
 * Lernenden einen DEUTSCHEN Ausgangstext sinngemäß in der Fremdsprache wieder. Ein
 * englischer Ausgangstext machte daraus eine Zusammenfassung – die geprüfte Leistung, das
 * Überbrücken zwischen zwei Sprachen, fiele weg.
 *
 * Sonst richtet sich die Sprache nach dem Fach: In den Fremdsprachen steht das Material in
 * der Zielsprache, in Latein auf Latein, in allen übrigen Fächern auf Deutsch.
 */
export function materialSprache(fach: { id: string; foreignLanguage?: string }, mediation: boolean): string {
  if (mediation) return 'de'
  return fach.foreignLanguage ?? (fach.id === 'latein' ? 'la' : 'de')
}

/**
 * Welche Quellentypen für dieses Fach in Frage kommen.
 *
 * Vorgabe der Lehrkraft (24.09.2026): „denk auch an zeitungsseiten, nachrichtenseiten,
 * wissenschaftliche quellen usw."
 *
 * Fachabhängig, weil es sonst nicht stimmt: Für Politik ist der Zeitungskommentar die
 * Kernquelle, für Biologie die Fachgesellschaft und das Statistikamt, für Deutsch der
 * literarische Text. Eine Liste für alle Fächer wäre für jedes einzelne halb falsch.
 *
 * Genannt werden bewusst ARTEN von Seiten und keine festen Adressen: Eine Liste von Domains
 * veraltet, und die Suche soll finden, was es gibt, statt abzuhaken, was ich kenne.
 */
export function quellentypen(fachId: string): string[] {
  const gemeinsam = [
    'überregionale Tageszeitungen und ihre Online-Ausgaben (Kommentar, Reportage, Hintergrundbericht)',
    'Nachrichtenseiten des öffentlich-rechtlichen Rundfunks, auch Manuskripte gesendeter Beiträge',
    'Bundeszentrale und Landeszentralen für politische Bildung',
    'Veröffentlichungen von Behörden, Ministerien und Statistikämtern'
  ]
  const gesellschaft = [
    'Reden, Protokolle und Dokumente aus Parlamenten und Archiven',
    'Analysen von Forschungsinstituten, Stiftungen und Verbänden – mit erkennbarer Urheberschaft',
    'wissenschaftliche Aufsätze aus frei zugänglichen Fachzeitschriften (Open Access)'
  ]
  const natur = [
    'Wissenschaftsportale von Universitäten, Max-Planck- und Helmholtz-Instituten',
    'frei zugängliche Fachaufsätze (Open Access) und ihre allgemein verständlichen Zusammenfassungen',
    'Veröffentlichungen von Fachgesellschaften, Umwelt- und Gesundheitsbehörden',
    'Datensätze und Berichte mit Zahlenmaterial (Statistikämter, Umweltbundesamt, Our World in Data)'
  ]
  const sprachlich = [
    'literarische Texte und Essays, auch aus Zeitungsfeuilletons',
    'Reden, Briefe und Tagebuchauszüge',
    'Sach- und Gebrauchstexte (Ratgeber, Informationsseiten, Broschüren, Aushänge)'
  ]
  if (['geschichte', 'politik', 'erdkunde', 'werte-und-normen', 'religion'].includes(fachId)) return [...gemeinsam, ...gesellschaft]
  if (['biologie', 'chemie', 'physik', 'informatik', 'mathematik'].includes(fachId)) return [...gemeinsam, ...natur]
  return [...gemeinsam, ...sprachlich]
}

/** Der Auftrag an die Websuche des Anbieters – in Worten, nicht als Suchmaschinenanfrage. */
export function netzAuftrag(wunsch: MaterialWunsch, begriffe: string[]): string {
  const sprachen: Record<string, string> = {
    de: 'Deutsch',
    en: 'Englisch',
    fr: 'Französisch',
    es: 'Spanisch',
    it: 'Italienisch',
    la: 'Latein',
    // Weitere Schulfremdsprachen (30.09.2026, @shared/faecher)
    ...LANGUAGE_NAMES
  }
  return [
    `Fach: ${wunsch.fach}. Thema: ${wunsch.thema}. Jahrgang: ${wunsch.jahrgang}.`,
    `Gesucht wird ein veröffentlichter Originaltext in ${sprachen[wunsch.sprache] ?? wunsch.sprache} von etwa ${wunsch.zielWortzahl} Wörtern (länger ist erlaubt, er wird gekürzt).`,
    begriffe.length ? `Mögliche Suchbegriffe: ${begriffe.join('; ')}.` : '',
    'Suche zuerst allgemein nach Material zum Thema. Nach einem bestimmten Urheber oder Werktitel nur dann, wenn der Unterrichtsgegenstand selbst ein bestimmtes Werk ist – bei einem Sachthema gibt es keinen Titel, nach dem sich suchen ließe.',
    'GEEIGNETE FUNDORTE (alles mit frei zugänglichem Volltext):',
    ...quellentypen(wunsch.fachId).map((t) => `- ${t}`),
    '- Gemeinfreie Textarchive (Wikisource, Projekt Gutenberg) durchsucht die App bereits selbst; dort musst du nicht suchen.',
    wunsch.pruefung ? 'Der Text kommt in eine Klausur: Er darf im Unterricht nicht verbreitet behandelt worden sein und muss für sich verständlich sein.' : '',
    'Nenne bis zu ACHT Fundstellen. Suche gründlich: Probiere mehrere Formulierungen und schau über die erste Trefferseite hinaus.'
  ]
    .filter(Boolean)
    .join('\n')
}

function ergebnisOhneFund(wunsch: MaterialWunsch, grund: string, kandidaten: Quellentreffer[]): MaterialErgebnis {
  /*
   * Entscheidung der Lehrkraft (24.09.2026): Arbeitsblätter dürfen auch in Sek II auf einen
   * gekennzeichneten Autorentext ausweichen, Klausuren nicht. Eine Klausur mit erfundenem
   * „Originaltext" wäre nicht nur rechtlich heikel, sondern didaktisch wertlos – die
   * Quellenarbeit ist dort der Prüfungsgegenstand.
   */
  return wunsch.pruefung ? { art: 'abbruch', grund, kandidaten } : { art: 'autorentext', grund, kandidaten }
}

/**
 * Ergänzt das Abrufdatum, wenn die KI es vergessen hat.
 *
 * § 63 UrhG verlangt eine deutliche Quellenangabe; bei Internetquellen gehört das Abrufdatum
 * dazu, weil sich Seiten ändern. Die KI kennt das heutige Datum nicht zuverlässig – die App
 * schon.
 */
export function quellenangabeMitAbruf(angabe: string, treffer: Quellentreffer, heute = new Date()): string {
  const teile = [angabe.trim()].filter(Boolean)
  if (!teile.length) teile.push([treffer.urheber, treffer.titel].filter(Boolean).join(': '))
  const text = teile.join(' ')
  const mitFundort = text.includes(treffer.url) ? text : `${text} Fundort: ${treffer.url}`
  if (/abgerufen|abruf/i.test(mitFundort)) return mitFundort
  const datum = heute.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
  return `${mitFundort} (abgerufen am ${datum})`
}
