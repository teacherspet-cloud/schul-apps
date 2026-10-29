/**
 * Aufgaben für die Aufgabenbank der Grammatik erzeugen (13.10.2026, abgestimmt; shared/grammatikBank.ts): je Schlüssel
 * (Teilbereich einer Form, gemischt je Punkt, gemischt je Unit) EINE Anfrage an die KI der Lehrkraft – Regelkarte und rund
 * 8 Aufgaben je gewünschter Übungsart –, danach dieselbe Prüfung wie beim Pool (grammatikErzeugen.ts `gepruefterPool`)
 * und das Streichen noch unbekannter Zeitformen (Stand im Lehrwerk). Die Lehrkraft sieht alles vor dem Speichern durch.
 * Keine Namen, keine Daten der Lernenden.
 */
import type { StructuredRequest } from '@shared/types'
import { paketBereinigt, BANK_GRENZEN, type GrammatikPaket } from '@shared/grammatiktrainer'
import {
  istUebung,
  regelIdVon,
  STUFE_TEXT,
  UEBUNG_ARTEN,
  UEBUNG_NAME,
  UEBUNG_TEXT,
  type BankAufgabe,
  type BankRegel,
  type Stufe,
  type Uebung,
  UEBUNGEN,
  zielJeFeld,
  istRegelPlatzhalter,
  ALTERNATIVEN_ARTEN,
  alternativePasst,
  loesungenZusammenfuehren,
  LOESUNGEN_REGEL
} from '@shared/grammatikBank'
import { bekanntNachStand, ohneGesperrteZeitformen, sperreFuer, sperrRegel, sperrSprache } from '@shared/zeitformSperre'
import { AUFGABEN_REGELN, aufgabeMangel, aufgabeNormalisiert, aufgabenGeprueft, beispielVerraten } from '@shared/grammatikAufgabenRegeln'
import { designFuer, designText } from '@shared/grammatikDesign'
import { formWoerter, unbekannteWoerter } from '@shared/lehrwerkWortschatz'
import { wortschatzStand, type WortschatzStand } from './wortschatzStand'
import { blindGeprueft, gepruefterPool, LATEIN_REGELN, lateinLernjahr, niveauDesAuftrags, type PruefBericht } from './grammatikErzeugen'
import { katalogFormenRegel, niveauRegel } from './grammatikNiveau'

type Ai = <T>(req: StructuredRequest) => Promise<T>

const S = (description?: string): Record<string, unknown> => ({ type: 'string', ...(description ? { description } : {}) })
const A = (items: Record<string, unknown>, description?: string): Record<string, unknown> => ({ type: 'array', items, ...(description ? { description } : {}) })
const O = (properties: Record<string, Record<string, unknown>>): Record<string, unknown> => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false
})

export interface BankAuftrag {
  schluessel: string
  /** Bezeichnung des Teilbereichs bzw. der gemischten Übung („Simple past: Fragen") */
  titel: string
  /** Fachname („Englisch") und Sprache („en") */
  fach: string
  sprache: string
  /** Klasse des Lehrwerks, an dem erzeugt wird */
  jahrgang: number
  land?: string
  schulform?: string
  /** Welche Übungsarten und wie viele je Art */
  uebungen: Uebung[]
  anzahl: number
  /** Je Übungsart, wie viele noch fehlen (28.10.2026) – sonst höchstens das Ziel der Übungsart plus eine */
  jeUebung?: Partial<Record<Uebung, number>>
  /** Stufe der Aufgaben (13.10.2026): grundlegend, mittel, anspruchsvoll – ohne Angabe mittel */
  niveau?: Stufe
  /** Gemischt: die Formen, die zusammen geübt werden (Bezeichnungen) */
  formen?: string[]
  /** Katalogkennungen der Formen (ihre Zeitformen sind erlaubt) */
  themenIds: string[]
  /** Angaben des Katalogs zum Teilbereich (erkennen/bilden, Beispiele, typische Fehler) */
  hinweise?: string
  /** Stand im Lehrwerk: bekannt ist alles bis hierhin */
  lehrwerk?: { buch?: string; unit?: string }
  /** Vorhandene Regelkarte – dann schreibt die KI keine neue */
  regel?: BankRegel
  /** Vorhandene Sätze (gekürzt) – nichts doppelt */
  vorhanden: string[]
  /**
   * Ohne „trivial für das GER-Niveau" prüfen (21.10.2026): Nachlegen, wenn die Prüfung einen ganzen Durchgang als zu
   * leicht gestrichen hat – die übrige Prüfung (richtig, eindeutig) bleibt
   */
  ohneLeichtPruefung?: boolean
}

/** Bericht eines Durchgangs: Prüfung plus gestrichene Zeitformen */
export interface BankBericht extends PruefBericht {
  /** Wegen noch unbekannter Zeitformen gestrichen */
  zeitform: number
}

const istLatein = (a: Pick<BankAuftrag, 'sprache' | 'fach'>): boolean => a.sprache === 'la' || /latein/i.test(a.fach)
// Neubeginn 28.10.2026: dazu Lückentext, Sätze verbinden, Frage bilden, Markieren, Sortieren, Mehrfachauswahl
const ARTEN_ALLGEMEIN = ['luecke', 'auswahl', 'umformen', 'fehler', 'satzbau', 'zuordnen', 'richtigfalsch', 'lueckentext', 'verbinden', 'frage', 'markieren', 'sortieren', 'mehrfach']
const ARTEN_LATEIN = ['bestimmen', 'mehrfach', 'umformen', 'luecke', 'uebersetzen', 'auswahl', 'zuordnen', 'richtigfalsch']

const stelleText = (ws: WortschatzStand): string => `${ws.stelle.buch}, ${ws.stelle.unit}, ${ws.stelle.abschnitt}`

/** Auftrag an die KI: nur Wörter und Grammatik, die an der Einführungsstelle bekannt sind */
export function wortschatzRegel(ws: WortschatzStand, formWorte: readonly string[] = []): string {
  return [
    `WORTSCHATZ UND GRAMMATIK (eingeführt in ${stelleText(ws)} – verbindlich): Die Lernenden kennen NUR diese englischen Wörter (dazu erfundene Vornamen, Zahlen, Plural-s und Kurzformen wie I'm, isn't, can't${formWorte.length ? ` sowie die Wörter der geübten Form: ${formWorte.join(', ')}` : ''}): ${[...ws.bekannt].sort().join(', ')}.`,
    `Bekannte Grammatik bis hier: ${ws.grammatik.join('; ')}. Verwende KEINE anderen Formen und Strukturen – z. B. kein has/have als Vollverb, kein does/did, keine Vergangenheit, kein will, kein -ing, wenn es oben nicht steht. Jedes englische Wort in Sätzen, Möglichkeiten, Lösungen und Kontexten muss aus der Liste stammen; Anweisungen und Erklärungen sind deutsch.`,
    // Wortstellung in den ersten Lernjahren (29.10.2026, Hinweis der Lehrkraft zu „Ella has an hour for lunch.")
    ws.jahrgang !== undefined && ws.jahrgang <= 6
      ? 'SATZBAU (Anfangsunterricht): kurze Hauptsätze in der gelernten Reihenfolge Subjekt – Verb – Objekt – Ort – Zeit; Orts- und Zeitangaben am Satzende, nie mitten im Satz; keine Einschübe, keine Nebensätze, keine vorangestellten Satzteile (außer Fragen und Imperativ) – es sei denn, die geübte Form verlangt den Nebensatz (z. B. while-/when-Satz beim Past Progressive); dann nur dieser eine, kurz.'
      : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/** Vorläufige Kennung neuer Aufgaben (der Server vergibt beim Speichern die feste „b…") */
export const neueKennung = (i: number): string => `n${Date.now().toString(36)}${i}`

/** Erzeugt Regelkarte und Aufgaben für einen Schlüssel – die Aufgaben tragen ihre Übungsart, noch ohne Bank-Kennung */
export async function erzeugeBankAufgaben(
  a0: BankAuftrag,
  ai: Ai,
  melde: (t: string) => void = () => undefined
): Promise<{ regel: BankRegel; aufgaben: BankAufgabe[]; bericht: BankBericht }> {
  // Platzhalter-Regelkarte („x", 29.10.2026) gilt als nicht vorhanden – die KI schreibt eine neue
  const a1: BankAuftrag = a0.regel && istRegelPlatzhalter(a0.regel) ? { ...a0, regel: undefined } : a0
  const latein = istLatein(a1)
  // Wortschatz- und Grammatikstand der frühesten Einführung (29.10.2026, Auftrag der Lehrkraft: nur Bekanntes verwenden)
  const ws = latein ? null : await wortschatzStand(a1.schluessel, a1.sprache)
  // Klasse und Lehrwerksstelle ebenfalls der frühesten Einführung (29.10.2026, Befund der Lehrkraft: Past Progressive lief mit
  // „Klasse 5" – die Bank gilt für alle Lehrwerke, Niveau und Wortschatz müssen zur selben Stelle passen)
  const a: BankAuftrag = ws?.jahrgang ? { ...a1, jahrgang: ws.jahrgang, lehrwerk: { buch: ws.stelle.buch, unit: ws.stelle.unit } } : a1
  const ger = await niveauDesAuftrags(a)
  const sprache = sperrSprache(a.sprache, a.fach)
  const bekannt = bekanntNachStand(a.lehrwerk?.buch ? a.lehrwerk : undefined, a.jahrgang)
  const gesperrt = sprache ? sperreFuer({ bekannt, themen: a.themenIds, thema: a.titel, sprache }) : []
  const uebungen = a.uebungen.length ? a.uebungen : (['erkennen', 'bilden', 'anwenden'] as Uebung[])
  const anzahl = Math.max(1, Math.min(12, Math.round(a.anzahl)))
  // Je Übungsart (28.10.2026, weniger Übungen): was ihr fehlt, sonst ihr Ziel (4/4/3/1/1) plus eine als Puffer für die Prüfung
  const zahlVon = (u: Uebung): number => Math.max(1, Math.min(8, a.jeUebung?.[u] ?? Math.min(anzahl, zielJeFeld(u) + 1)))
  const regelId = regelIdVon(a.schluessel)
  // Übungsdesign der Form aus der Recherche (nur Englisch, nur bei einer einzelnen Form)
  const design = latein || a.formen?.length ? null : await designFuer(a.schluessel).catch(() => null)
  melde(`Die KI schreibt ${uebungen.reduce((n, u) => n + zahlVon(u), 0)} Aufgaben zu „${a.titel}" …`)
  const roh = await ai<{ regel: BankRegel; aufgaben: Record<string, unknown>[] }>({
    schemaName: 'grammatik_bank',
    system: [
      `Du erstellst Übungsaufgaben für eine Grammatik-Lern-App (${a.fach}, etwa Klasse ${a.jahrgang}). Die Aufgaben werden schulweit für diese Grammatik hinterlegt und in vielen Kursen genutzt.`,
      'Jede Aufgabe muss für sich allein verständlich und EINDEUTIG lösbar sein und genau die genannte Grammatik üben.',
      a.regel
        ? 'Die Regelkarte steht schon fest (unten) – gib sie unverändert zurück.'
        : 'Regelkarte: EINE kurze Karte – Titel, Erklärung in 2–4 Sätzen auf Deutsch (altersgerecht), 2–3 Beispiele in der Zielsprache.',
      'Aufgaben, jede mit „uebung“ (genaue Zahl je Übungsart):',
      ...uebungen.map((u) => `- ${u} (${UEBUNG_NAME[u]}): GENAU ${zahlVon(u)} – ${UEBUNG_TEXT[u]}${latein ? '' : `; Aufgabenarten: ${UEBUNG_ARTEN[u].join(', ')}`}`),
      a.formen?.length
        ? 'Gemischte Übung: vor allem Lückentexte und Dialoge („lueckentext“), in denen die Formen nebeneinander vorkommen und der Zusammenhang jede Lücke festlegt; beim Unterscheiden die Formen gegeneinander.'
        : '',
      `SCHWIERIGKEIT dieser Aufgaben: ${STUFE_TEXT[a.niveau ?? 'm']} – relativ zum Niveau der Klasse.`,
      'Innerhalb jeder Übungsart vom Leichteren zum Schwereren.',
      latein
        ? `Lernjahr Latein: etwa ${lateinLernjahr(a.jahrgang)}.\n${LATEIN_REGELN}`
        : niveauRegel(a, ger, a.niveau === 'g' ? 'grundlegend' : a.niveau === 'a' ? 'anspruchsvoll' : 'mittel'),
      'Wortschatz passend zur Klassenstufe; keine Namen realer Personen (fiktive Vornamen sind in Ordnung).',
      ws ? wortschatzRegel(ws, formWoerter(a.schluessel)) : '',
      // Regeln für eindeutige Aufgaben (28.10.2026, nach der Prüfung der ganzen Bank – shared/grammatikAufgabenRegeln.ts)
      AUFGABEN_REGELN,
      LOESUNGEN_REGEL,
      'Fehler finden: „fehlerWort" exakt wie im Satz, „loesungen" das richtige Wort.',
      'Satzbau: „teile" in RICHTIGER Reihenfolge (4–9 Teile); Satzzeichen hängen am letzten Teil.',
      'Zuordnen: 3–5 „paare" (links Satzanfang bzw. Signalwort/Situation, rechts die passende Fortsetzung bzw. Form) – jede rechte Hälfte passt NUR zu ihrer linken; „satz" leer.',
      'Richtig oder falsch: „satz" ein Satz; „korrekt" true, wenn er richtig ist – sonst false mit GENAU EINEM Grammatikfehler, „fehlerWort" exakt wie im Satz und „loesungen" die richtige Form. Etwa die Hälfte richtig.',
      'Felder, die für eine Aufgabenart nicht gelten, bleiben leer bzw. leere Liste (korrekt dann false).',
      sprache ? sperrRegel(gesperrt) : katalogFormenRegel(a, a.themenIds)
    ]
      .filter(Boolean)
      .join('\n'),
    user: [
      a.formen?.length
        ? `Gemischte Übung „${
            a.titel
          }" – diese Formen gemischt üben (in jeder Aufgabe eine davon, gleichmäßig verteilt; beim Unterscheiden gegeneinander): ${a.formen.join('; ')}`
        : `Grammatik: ${a.titel}`,
      `Zielsprache: ${a.sprache}`,
      a.hinweise ? `\nAngaben aus dem Katalog:\n${a.hinweise}` : '',
      a.regel ? `\nRegelkarte: ${a.regel.titel} – ${a.regel.erklaerung} (z. B. ${a.regel.beispiele.slice(0, 3).join('; ')})` : '',
      design ? `\n${designText(design)}` : '',
      a.vorhanden.length ? `\nSchon hinterlegt (nicht wiederholen):\n${a.vorhanden.slice(0, 80).join('\n')}` : ''
    ]
      .filter(Boolean)
      .join('\n'),
    schema: O({
      regel: O({ titel: S('kurzer Titel'), erklaerung: S('2–4 Sätze auf Deutsch'), beispiele: A(S(), '2–3 Beispielsätze in der Zielsprache') }),
      aufgaben: A(
        O({
          uebung: { type: 'string', enum: uebungen },
          art: { type: 'string', enum: latein ? ARTEN_LATEIN : ARTEN_ALLGEMEIN },
          anweisung: S('kurze Arbeitsanweisung auf Deutsch'),
          satz: S(
            'luecke/auswahl: Satz mit genau einer Lücke „___" (Auswahl zwischen ganzen Sätzen: nur „___"); umformen: Ausgangssatz; fehler: Satz mit GENAU EINEM Grammatikfehler; lueckentext: der Text mit 3–6 „___“ (Dialog: Zeilen „A: …“, „B: …“); verbinden: die zwei Sätze; frage: die Antwort; markieren: der Text; satzbau/zuordnen/sortieren: leer'
          ),
          kontext: S('1–3 Sätze Vorlauf (Situation, Zeit), wenn der Satz allein die Form nicht festlegt; sonst leer'),
          anfang: S('umformen/verbinden/frage: vorgegebener Satzanfang; sonst leer'),
          kommaPruefen: { type: 'boolean', description: 'true nur, wenn die geübte Grammatik eine Kommaregel ist' },
          luecken: A(
            O({ vorgabe: S('Grundwort in Klammern bzw. leer'), loesungen: A(S(), 'alle richtigen'), optionen: A(S(), 'Auswahl für diese Lücke bzw. leer') }),
            'lueckentext: je „___“ eine Lücke in Reihenfolge; sonst leer'
          ),
          wortkasten: A(S(), 'lueckentext: Wörter zum Einsetzen, jedes passt genau einmal; sonst leer'),
          zielWoerter: A(S(), 'markieren: die zu markierenden Wörter genau wie im Text; sonst leer'),
          gruppen: A(S(), 'sortieren: 2–3 Gruppennamen; sonst leer'),
          elemente: A(O({ text: S(), gruppe: { type: 'integer' } }), 'sortieren: 6–8 Elemente mit Gruppennummer (0 = erste); sonst leer'),
          vorgabe: S('luecke: das Grundwort in Klammern, aus dem die Lösung gebildet wird – nie die Lösung selbst; umformen: die Zielform bzw. was zu tun ist; sonst leer'),
          loesungen: A(S(), 'alle richtigen Antworten'),
          optionen: A(S(), 'auswahl: 3–4 Möglichkeiten; mehrfach: 4–5 Möglichkeiten; sonst leer'),
          fehlerWort: S('fehler: das falsche Wort GENAU wie im Satz; sonst leer'),
          teile: A(S(), 'satzbau: Teile in RICHTIGER Reihenfolge; sonst leer'),
          paare: A(O({ links: S('linke Hälfte'), rechts: S('passende rechte Hälfte') }), 'zuordnen: 3–5 Paare in richtiger Zuordnung; sonst leer'),
          korrekt: { type: 'boolean', description: 'richtigfalsch: true = der Satz ist richtig; sonst false' },
          erklaerung: S('ein kurzer Satz auf Deutsch: warum diese Form – die Lernenden sehen ihn nach der Antwort')
        })
      )
    })
  })
  const regel: BankRegel = a.regel ?? {
    titel: String(roh.regel?.titel ?? a.titel).slice(0, 160) || a.titel,
    erklaerung: String(roh.regel?.erklaerung ?? '').slice(0, 900),
    beispiele: (Array.isArray(roh.regel?.beispiele) ? roh.regel.beispiele : []).map(String).slice(0, 6)
  }
  const start: GrammatikPaket = paketBereinigt(
    {
      thema: a.titel,
      regeln: [{ id: regelId, ...regel, erklaerung: regel.erklaerung || regel.titel }],
      aufgaben: (roh.aufgaben ?? []).filter((x) => istUebung(x.uebung)).map((x) => ({ ...x, regelId }))
    },
    a.titel,
    BANK_GRENZEN
  )
  const bericht: BankBericht = { geprueft: 0, gestrichen: 0, zuLeicht: 0, gruende: [], zeitform: 0 }
  const geprueft = await gepruefterPool(
    start,
    { thema: a.titel, fach: a.fach, sprache: a.sprache, jahrgang: a.jahrgang, ...(ws ? { zusatzRegel: wortschatzRegel(ws, formWoerter(a.schluessel)) } : {}) },
    ai,
    melde,
    gesperrt,
    // „Trivial für das GER-Niveau" nicht bei grundlegend (13.10.2026, Befund am VPS: grundlegende Stufen blieben nach
    // „Ergänzen" leer) – dort sind leichte Aufgaben gewollt
    latein || a.niveau === 'g' || a.ohneLeichtPruefung ? undefined : ger,
    bericht
  )
  const ohne = ohneGesperrteZeitformen(geprueft, gesperrt)
  bericht.zeitform = geprueft.aufgaben.length - ohne.aufgaben.length
  // Regeln (28.10.2026): richten, was ohne KI geht; mit Mangel fällt eine Aufgabe weg (gepruefterPool prüft das schon –
  // hier mit Übungsart, die erst jetzt feststeht)
  const regelGeprueft = aufgabenGeprueft(ohne.aufgaben)
  bericht.gestrichen += regelGeprueft.gestrichen.length
  for (const g of regelGeprueft.gestrichen) if (bericht.gruende.length < 20 && !bericht.gruende.includes(g.grund)) bericht.gruende.push(g.grund)
  ohne.aufgaben = regelGeprueft.aufgaben
  // Wortschatz (29.10.2026): Aufgaben mit Wörtern, die an der Einführungsstelle noch nicht bekannt sind, fallen weg
  if (ws) {
    const vorher = ohne.aufgaben.length
    ohne.aufgaben = ohne.aufgaben.filter((x) => {
      const u = unbekannteWoerter(x, ws.bekannt, formWoerter(a.schluessel), ws.lexikon)
      if (!u.length) return true
      const g = `Wortschatz (${stelleText(ws)}): ${u.slice(0, 4).join(', ')}`
      if (bericht.gruende.length < 20 && !bericht.gruende.includes(g)) bericht.gruende.push(g)
      return false
    })
    bericht.gestrichen += vorher - ohne.aufgaben.length
  }
  // Beispiel der Regelkarte als Aufgabe (29.10.2026, Blindprobe): verrät die Lösung – fällt weg
  {
    const vorher = ohne.aufgaben.length
    ohne.aufgaben = ohne.aufgaben.filter((x) => !beispielVerraten(x, regel.beispiele ?? []))
    if (ohne.aufgaben.length < vorher && bericht.gruende.length < 20) bericht.gruende.push('Beispiel der Regelkarte als Aufgabe')
    bericht.gestrichen += vorher - ohne.aufgaben.length
  }
  return {
    bericht,
    regel,
    aufgaben: ohne.aufgaben.filter((x): x is BankAufgabe => istUebung(x.uebung)).map((x, i) => ({ ...x, id: neueKennung(i), niveau: a.niveau ?? 'm' }))
  }
}

// ---------------------------------------------------------------- Alternativlösungen nachtragen (25.10.2026)

/** Je Anfrage so viele Aufgaben – kurze Listen, damit die KI jede Aufgabe wirklich durchgeht */
export const ALTERNATIVEN_JE_ANFRAGE = 25

/**
 * Weitere richtige Lösungen zu vorhandenen Aufgaben eines Schlüssels nachtragen (25.10.2026, Befund der Lehrkraft: bei
 * „It is said / believed / thought that …" galt nur eine Fassung). Die Aufgaben bleiben, wie sie sind – Kennungen, Sätze,
 * Vorgaben –, nur `loesungen` wächst. Auswahl- und Mehrfachaufgaben haben ihre Möglichkeiten und bleiben außen vor.
 * Rein additiv und ohne Durchsicht speicherbar: Eine zusätzliche richtige Antwort kann keine Lernende benachteiligen.
 */
export async function ergaenzeAlternativen(
  e: { fach: string; sprache: string; jahrgang: number; titel: string; regel?: BankRegel; aufgaben: BankAufgabe[] },
  ai: Ai,
  melde: (t: string) => void = () => undefined
): Promise<{ aufgaben: BankAufgabe[]; betroffen: number; ergaenzt: number; geprueft: number }> {
  const offen = e.aufgaben.map((a, i) => ({ a, i })).filter(({ a }) => ALTERNATIVEN_ARTEN.includes(a.art))
  const aus = e.aufgaben.map((a) => ({ ...a, loesungen: [...a.loesungen] }))
  let betroffen = 0
  let ergaenzt = 0
  for (let von = 0; von < offen.length; von += ALTERNATIVEN_JE_ANFRAGE) {
    const stueck = offen.slice(von, von + ALTERNATIVEN_JE_ANFRAGE)
    melde(`Die KI prüft weitere Lösungen zu „${e.titel}" (${Math.min(von + stueck.length, offen.length)} von ${offen.length} Aufgaben) …`)
    const roh = await ai<{ aufgaben: { nr: number; weitere: string[] }[] }>({
      schemaName: 'grammatik_alternativen',
      system: [
        `Du prüfst die Lösungen von Grammatikaufgaben (${e.fach}, etwa Klasse ${e.jahrgang}) wie eine erfahrene Lehrkraft.`,
        'Die App wertet eine Antwort nur als richtig, wenn sie GENAU einer hinterlegten Lösung entspricht (Groß-/Kleinschreibung und Satzzeichen am Ende zählen nicht).',
        'Nenne je Aufgabe in „weitere" ALLE zusätzlichen Antworten, die ebenso richtig sind und die Aufgabe genauso erfüllen: Kurz- und Langformen (it is / it\'s, do not / don\'t), gleichwertige Umformungen (People say that he is rich → „It is said that he is rich" und „He is said to be rich"), bei Lücken mit Vorgabe alle passenden Formen des vorgegebenen Worts, gleichwertige Wortstellung (bei Satzbau nur mit denselben Teilen).',
        'NICHT aufnehmen: Antworten mit einem anderen Wort als in der Vorgabe, Antworten, die die geübte Grammatik umgehen, umgangssprachliche oder stilistisch fragwürdige Fassungen, bloße Rechtschreibvarianten der Lösung.',
        'Lücke und Fehler finden: nur den Text für die Lücke bzw. das berichtigte Wort, nie den ganzen Satz. Umformen und Satzbau: ganze Sätze mit Satzzeichen wie die Lösung.',
        '„weitere" bleibt leer, wenn es nichts Gleichwertiges gibt. Im Zweifel weglassen – eine falsche „richtige" Antwort schadet mehr als eine fehlende.'
      ].join('\n'),
      user: [
        `Grammatik: ${e.titel}`,
        `Zielsprache: ${e.sprache}`,
        e.regel ? `Regelkarte: ${e.regel.titel} – ${e.regel.erklaerung}` : '',
        '',
        ...stueck.map(
          ({ a }, j) =>
            `${j + 1}. [${a.art}] ${a.anweisung}\nSatz: ${a.satz}${a.vorgabe ? `\nVorgabe: ${a.vorgabe}` : ''}${
              a.teile?.length ? `\nTeile: ${a.teile.join(' | ')}` : ''
            }${a.fehlerWort ? `\nFehlerwort: ${a.fehlerWort}` : ''}\nLösungen: ${a.loesungen.join(' | ')}`
        )
      ]
        .filter((x) => x !== '')
        .join('\n'),
      schema: O({
        aufgaben: A(O({ nr: { type: 'integer' }, weitere: A(S(), 'zusätzliche richtige Antworten; leer, wenn es keine gibt') }))
      })
    })
    for (const u of roh.aufgaben ?? []) {
      const ziel = stueck[Number(u.nr) - 1]
      if (!ziel || !Array.isArray(u.weitere)) continue
      const alt = aus[ziel.i].loesungen
      const neu = loesungenZusammenfuehren(
        alt,
        u.weitere.filter((w) => alternativePasst({ art: ziel.a.art, loesungen: alt }, String(w ?? '')))
      )
      if (neu.length > alt.length) {
        betroffen++
        ergaenzt += neu.length - alt.length
        aus[ziel.i] = { ...aus[ziel.i], loesungen: neu }
      }
    }
  }
  return { aufgaben: aus, betroffen, ergaenzt, geprueft: offen.length }
}


// ---------------------------------------------------------------- Zurückgestellte Aufgaben überarbeiten (28.10.2026)

/** Je Anfrage so viele Aufgaben */
export const REPARATUR_JE_ANFRAGE = 20

/**
 * Zurückgestellte Aufgaben überarbeiten (28.10.2026, nach der Prüfung der Bank; shared/grammatikAufgabenRegeln.ts): Die KI
 * bekommt jede Aufgabe mit ihrem Mangel bzw. Befund und schreibt sie nach den Regeln neu – dieselbe Grammatik, dieselbe
 * Übungsart und Stufe, möglichst dieselbe Satzidee. Kennung, Übungsart und Stufe bleiben (Lernstand). Was die KI verwirft
 * oder was danach noch einen Mangel hat, bleibt zurückgestellt; Verworfenes wird entfernt.
 */
export async function repariereAufgaben(
  e: { fach: string; sprache: string; jahrgang: number; titel: string; regel?: BankRegel; aufgaben: BankAufgabe[] },
  ai: Ai,
  melde: (t: string) => void = () => undefined
): Promise<{ aufgaben: BankAufgabe[]; repariert: number; verworfen: number; geprueft: number }> {
  const latein = istLatein(e)
  const offen = e.aufgaben.map((a, i) => ({ a, i })).filter(({ a }) => a.pruefen)
  const aus: (BankAufgabe | null)[] = [...e.aufgaben]
  let repariert = 0
  let verworfen = 0
  const kandidaten: { i: number; neu: BankAufgabe; regelId?: string }[] = []
  for (let von = 0; von < offen.length; von += REPARATUR_JE_ANFRAGE) {
    const stueck = offen.slice(von, von + REPARATUR_JE_ANFRAGE)
    melde(`Die KI überarbeitet „${e.titel}" (${Math.min(von + stueck.length, offen.length)} von ${offen.length} Aufgaben) …`)
    const roh = await ai<{ aufgaben: Record<string, unknown>[] }>({
      schemaName: 'grammatik_reparatur',
      system: [
        `Du überarbeitest fehlerhafte Übungsaufgaben einer Grammatik-Lern-App (${e.fach}, etwa Klasse ${e.jahrgang}) wie eine erfahrene Lehrkraft.`,
        'Zu jeder Aufgabe steht, was an ihr falsch ist („Mangel"). Schreibe sie so neu, dass sie alle Regeln erfüllt: dieselbe Grammatik, dieselbe Übungsart, dieselbe Schwierigkeit, möglichst dieselbe Satzidee.',
        'Übungsarten: ' + UEBUNGEN.map((u) => `${UEBUNG_NAME[u]} = ${UEBUNG_TEXT[u]}`).join('; ') + '.',
        latein ? '' : 'Erlaubte Aufgabenarten je Übungsart: ' + UEBUNGEN.map((u) => `${UEBUNG_NAME[u]}: ${UEBUNG_ARTEN[u].join(', ')}`).join('; ') + '.',
        AUFGABEN_REGELN,
        LOESUNGEN_REGEL,
        'Satzbau: „teile" in RICHTIGER Reihenfolge (4–9 Teile); Satzzeichen hängen am letzten Teil. Zuordnen: 3–5 „paare", jede rechte Hälfte passt NUR zu ihrer linken; „satz" leer. Richtig oder falsch: „korrekt" true, wenn der Satz richtig ist – sonst false mit GENAU EINEM Fehler, „fehlerWort" exakt wie im Satz und „loesungen" die richtige Form.',
        latein ? LATEIN_REGELN : '',
        'Lässt sich eine Aufgabe nicht sinnvoll retten (z. B. weil die Grammatik so nicht abfragbar ist), setze verwerfen = true.',
        'Felder, die für eine Aufgabenart nicht gelten, bleiben leer bzw. leere Liste (korrekt dann false).'
      ]
        .filter(Boolean)
        .join('\n'),
      user: [
        `Grammatik: ${e.titel}`,
        `Zielsprache: ${e.sprache}`,
        e.regel ? `Regelkarte: ${e.regel.titel} – ${e.regel.erklaerung}` : '',
        '',
        // Alle Felder (29.10.2026: auch Kontext, Satzanfang, Lücken, Gruppen … der neuen Formate)
        ...stueck.map(({ a }, j) => {
          const { id: _i, regelId: _r, pruefen: _p, uebung: _u, niveau: _n, ...felder } = a as BankAufgabe & { regelId?: string }
          void _i
          void _r
          void _p
          void _u
          void _n
          return `${j + 1}. Übungsart: ${UEBUNG_NAME[a.uebung]} · bisher [${a.art}]\nAufgabe: ${JSON.stringify(felder)}\nMangel: ${String(a.pruefen).replace(/^Befund:\s*/, '')}`
        })
      ]
        .filter((x) => x !== '')
        .join('\n'),
      schema: O({
        aufgaben: A(
          O({
            nr: { type: 'integer' },
            verwerfen: { type: 'boolean' },
            art: { type: 'string', enum: latein ? ARTEN_LATEIN : ARTEN_ALLGEMEIN },
            anweisung: S('kurze Arbeitsanweisung auf Deutsch'),
            satz: S('luecke/auswahl: Satz mit genau einer Lücke „___"; umformen: Ausgangssatz; fehler: Satz mit GENAU EINEM Grammatikfehler; satzbau/zuordnen: leer'),
            vorgabe: S('luecke: das Grundwort in Klammern – nie die Lösung selbst; umformen: Zielform; sonst leer'),
            loesungen: A(S(), 'alle richtigen Antworten'),
            optionen: A(S(), 'auswahl: 3–4 Möglichkeiten; sonst leer'),
            fehlerWort: S('fehler/richtigfalsch: das falsche Wort GENAU wie im Satz; sonst leer'),
            teile: A(S(), 'satzbau: Teile in RICHTIGER Reihenfolge; sonst leer'),
            paare: A(O({ links: S(), rechts: S() }), 'zuordnen: 3–5 Paare; sonst leer'),
            korrekt: { type: 'boolean' },
            // Neue Formate (29.10.2026)
            kontext: S('1–3 Sätze Vorlauf, wenn der Satz allein die Form nicht festlegt; sonst leer'),
            anfang: S('umformen/verbinden/frage: Satzanfang (ohne „…“, nie Bindewort samt Teilsatz); sonst leer'),
            kommaPruefen: { type: 'boolean' },
            luecken: A(O({ vorgabe: S(), loesungen: A(S()), optionen: A(S()) }), 'lueckentext: je „___“ eine Lücke; sonst leer'),
            wortkasten: A(S(), 'lueckentext: Wörter zum Einsetzen; sonst leer'),
            zielWoerter: A(S(), 'markieren: die zu markierenden Wörter genau wie im Text; sonst leer'),
            gruppen: A(S(), 'sortieren: 2–3 Gruppennamen; sonst leer'),
            elemente: A(O({ text: S(), gruppe: { type: 'integer' } }), 'sortieren: Elemente mit Gruppennummer (0 = erste); sonst leer'),
            erklaerung: S('ein kurzer Satz auf Deutsch: warum diese Form')
          })
        )
      })
    })
    for (const u of roh.aufgaben ?? []) {
      const ziel = stueck[Number(u.nr) - 1]
      if (!ziel) continue
      if (u.verwerfen === true) {
        aus[ziel.i] = null
        verworfen++
        continue
      }
      const { a } = ziel
      // Form prüfen wie jede neue Aufgabe (paketBereinigt), dann die Regeln
      const geprueft = paketBereinigt(
        {
          thema: e.titel,
          regeln: [{ id: 'r', titel: e.titel, erklaerung: e.titel, beispiele: [] }],
          aufgaben: [{ ...u, id: 'x', regelId: 'r', uebung: a.uebung, niveau: a.niveau, erklaerung: String(u.erklaerung ?? '') || a.erklaerung, tipp: a.tipp }]
        },
        e.titel,
        BANK_GRENZEN
      ).aufgaben[0]
      if (!geprueft) continue
      const neu = aufgabeNormalisiert({ ...geprueft, id: a.id, uebung: a.uebung, niveau: a.niveau } as BankAufgabe)
      if (aufgabeMangel(neu)) continue
      const { pruefen: _p, regelId: _r, ...ohne } = neu
      void _p
      void _r
      kandidaten.push({ i: ziel.i, neu: ohne as BankAufgabe, regelId: a.regelId })
    }
  }
  // Blindprobe (29.10.2026): Überarbeitetes muss aus der Schüleransicht lösbar sein – sonst bleibt die Aufgabe zurückgestellt
  if (kandidaten.length) {
    const probe = await blindGeprueft(
      {
        thema: e.titel,
        regeln: [{ id: 'r', titel: e.regel?.titel ?? e.titel, erklaerung: e.regel?.erklaerung ?? '', beispiele: e.regel?.beispiele ?? [] }],
        aufgaben: kandidaten.map((k) => ({ ...k.neu, regelId: 'r' }))
      } as GrammatikPaket,
      { fach: e.fach, jahrgang: e.jahrgang, thema: e.titel },
      ai,
      melde
    ).catch(() => null)
    const besteht = new Map((probe?.aufgaben ?? []).map((x) => [x.id, x]))
    for (const k of kandidaten) {
      const x = besteht.get(k.neu.id)
      if (!x) continue
      const neu = aufgabeNormalisiert({ ...k.neu, ...x, id: k.neu.id, uebung: k.neu.uebung, niveau: k.neu.niveau } as BankAufgabe)
      if (aufgabeMangel(neu)) continue
      const { pruefen: _p, ...ohne } = neu as BankAufgabe
      void _p
      aus[k.i] = { ...ohne, regelId: k.regelId } as BankAufgabe
      repariert++
    }
  }
  return { aufgaben: aus.filter((x): x is BankAufgabe => x !== null), repariert, verworfen, geprueft: offen.length }
}
