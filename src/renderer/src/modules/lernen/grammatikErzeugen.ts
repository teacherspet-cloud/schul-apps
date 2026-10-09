/**
 * Aufgabenpool der Grammatik-Lern-App erzeugen (06.10.2026, abgestimmt: „KI beim Freigeben"): einmal je Thema und
 * Niveau, mit dem KI-Zugang der Lehrkraft. Zwei Schritte:
 *  1. Regelkarten und rund 40 Aufgaben (Lücke, Auswahl, Umformen, Fehler finden, Satzbau) nach Schema.
 *  2. Prüfung: Eine zweite Anfrage prüft jede Aufgabe und Lösung (eindeutig? richtig? alle gültigen Varianten?) und
 *     liefert Korrekturen bzw. streicht Aufgaben. Danach bereinigt shared/grammatiktrainer.ts `paketBereinigt` noch
 *     einmal (Lücke ohne „___", Lösung nicht unter den Möglichkeiten …).
 * Keine Namen, keine Daten der Lernenden.
 *
 * Latein (07.10.2026, abgestimmt mit der Lehrkraft): eigene Aufgabenmischung (Bestimmen mit allen Lesarten, Paradigma,
 * Umformen/Kongruenz, Übersetzen, Präpositionen) und Regeln aus der Recherche (KC Niedersachsen 2017, Pontes/Campus/
 * prima). Die Formen bildet weiter die KI – die Prüfung schaut deshalb gezielt auf Formen und Lesarten.
 */
import { CEFR_SCALE, type CefrLevel, type CefrTable, type StructuredRequest } from '@shared/types'
import {
  bekanntNachLernjahr,
  katalogFormenRegel,
  lateinNiveauRegel,
  niveauBefund,
  niveauMischung,
  niveauRegel,
  verschoben,
  zielNiveau,
  type Schwierigkeit
} from './grammatikNiveau'
import { ART_NAME, paketBereinigt, type AufgabenArt, type GrammatikPaket } from '@shared/grammatiktrainer'
import { bekanntNachStand, ohneGesperrteZeitformen, sperreFuer, sperrRegel, sperrSprache, type SperrbareZeitform } from '@shared/zeitformSperre'

type Ai = <T>(req: StructuredRequest) => Promise<T>

const S = (description?: string): Record<string, unknown> => ({ type: 'string', ...(description ? { description } : {}) })
const A = (items: Record<string, unknown>, description?: string): Record<string, unknown> => ({ type: 'array', items, ...(description ? { description } : {}) })
const O = (properties: Record<string, Record<string, unknown>>): Record<string, unknown> => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false
})

const ARTEN_ALLGEMEIN = ['luecke', 'auswahl', 'umformen', 'fehler', 'satzbau']
const ARTEN_LATEIN = ['bestimmen', 'mehrfach', 'tabelle', 'umformen', 'luecke', 'uebersetzen', 'auswahl']

/** Zusätzliche Felder der Latein-Aufgaben (bei den übrigen Arten leer) */
const LATEIN_FELDER = {
  form: S('bestimmen: die zu bestimmende lateinische Form MIT Längenzeichen; sonst leer'),
  merkmale: A(S(), 'bestimmen: Merkmale, z. B. ["Kasus","Numerus","Genus"] oder ["Person","Numerus","Tempus","Modus","Genus verbi"]; sonst leer'),
  werte: A(A(S()), 'bestimmen: je Merkmal ALLE wählbaren Werte (Abkürzungen), gleiche Reihenfolge wie merkmale; sonst leer'),
  lesarten: A(A(S()), 'bestimmen: ALLE richtigen Lesarten, je Lesart ein Wert pro Merkmal; steht die Form in einem Satz, nur die eine passende'),
  spalten: A(S(), 'tabelle: Spaltenköpfe, z. B. ["Sg.","Pl."]; sonst leer'),
  zeilen: A(
    O({
      name: S('Zeilenname, z. B. „Nom." oder „1. Sg."'),
      loesungen: A(S(), 'je Spalte die Form mit Längenzeichen'),
      vorgabe: A({ type: 'boolean' }, 'je Spalte: true = steht schon da')
    }),
    'tabelle: die Zeilen des Paradigmas; sonst leer'
  )
}

/** Felder der Extra-Aufgaben (Förder/Forder, 08.10.2026) */
const EXTRA_FELDER = {
  stufe: { type: 'integer', enum: [1, 2, 3], description: 'Förderaufgaben: 1 erkennen, 2 gelenkt bilden, 3 selbst bilden; Forderaufgaben: 3' },
  tipp: S('kleine Hilfe vor der Antwort auf Deutsch – verrät die Lösung NICHT')
}

const aufgabeSchema = (latein: boolean, extra = false): Record<string, unknown> =>
  O({
    art: { type: 'string', enum: latein ? ARTEN_LATEIN : extra ? [...ARTEN_ALLGEMEIN, 'uebersetzen'] : ARTEN_ALLGEMEIN },
    regelId: S('Kennung der Regelkarte, zu der die Aufgabe gehört'),
    anweisung: S('kurze Arbeitsanweisung auf Deutsch, z. B. „Setze die richtige Form ein."'),
    satz: S(
      'luecke/auswahl: Satz in der Zielsprache mit genau einer Lücke „___"; umformen: Ausgangssatz; fehler: Satz mit GENAU EINEM Grammatikfehler; satzbau: leer'
    ),
    vorgabe: S('luecke: Grundform in Klammern, z. B. „(to go)"; umformen: was zu tun ist, z. B. „Verneine den Satz."; sonst leer'),
    loesungen: A(
      S(),
      'alle richtigen Antworten: luecke/auswahl die Form; umformen der ganze neue Satz (Kurz- und Langform, falls beide richtig); fehler das richtige Wort; satzbau der ganze Satz'
    ),
    optionen: A(S(), 'auswahl: 3–4 Möglichkeiten, die richtige dabei, die anderen typische Fehlformen; sonst leer'),
    fehlerWort: S('fehler: das falsche Wort GENAU wie im Satz; sonst leer'),
    teile: A(S(), 'satzbau: die Wörter bzw. Satzteile in RICHTIGER Reihenfolge (4–9 Teile); sonst leer'),
    erklaerung: S('ein kurzer Satz auf Deutsch: warum diese Form'),
    ...(latein ? LATEIN_FELDER : {}),
    ...(extra ? EXTRA_FELDER : {})
  })

/**
 * Mehrere Themen in einer Freigabe (08.10.2026, abgestimmt): Jede Regelkarte nennt ihr Thema – beim Freigeben wird daraus
 * ein Training je Thema (server/grammatikTeilen.ts).
 */
const paketSchema = (latein: boolean, extra = false, themen: string[] = []): Record<string, unknown> =>
  O({
    regeln: A(
      O({
        id: S('r1, r2 …'),
        titel: S('kurzer Titel der Regel'),
        erklaerung: S('2–4 Sätze auf Deutsch, altersgerecht'),
        beispiele: A(S(), '2–3 Beispielsätze in der Zielsprache'),
        ...(extra ? { stolperfallen: A(S(), 'Förderaufgaben: 2–3 typische Stolperfallen (aus den Fehlern), je ein kurzer Satz auf Deutsch; sonst leer') } : {}),
        ...(themen.length > 1 ? { thema: { type: 'string', enum: themen, description: 'das Thema, zu dem die Regel gehört (genau wie in der Liste)' } } : {})
      })
    ),
    aufgaben: A(aufgabeSchema(latein, extra))
  })

export interface GrammatikAuftrag {
  thema: string
  fach: string
  sprache: string
  jahrgang: number
  niveau?: string
  /** Optional: was die Lehrkraft besonders üben lassen will */
  wunsch?: string
  /** Teilformen mit Stufe der Lerngruppe (grammar.ts teilformenAuftrag) */
  teilformen?: string
  /** Wortschatz, aus dem die Aufgaben schöpfen sollen (Lehrwerk, Grundwortschatz oder eigene Liste) – mit Nennform */
  woerter?: string[]
  /** Woher der Wortschatz stammt (für den Prompt), z. B. „Pontes, bis Lektion 12" */
  wortQuelle?: string
  /**
   * Bekannte Grammatik der Lerngruppe (Katalogkennungen aus Lehrwerk-Stand und Freigegebenem, 09.10.2026). Fehlt sie,
   * gilt der Jahrgang (shared/zeitformSperre.ts `bekanntNachStand`).
   */
  bekannt?: string[]
  /** Katalogkennungen der Themen dieses Auftrags (ihre Zeitformen sind erlaubt) */
  themenIds?: string[]
  /** Bundesland und Schulform (09.10.2026) – Maßstab für das Niveau (grammatikNiveau.ts) */
  land?: string
  schulform?: string
  /** GER-Niveau der Lerngruppe, falls schon bekannt (sonst GER-Tabelle bzw. Faustregel) */
  ger?: CefrLevel
  /**
   * Förder-/Forderaufgaben für ein Kind (08.10.2026, abgestimmt). Ohne Namen: nur die Regeln, die falschen Antworten
   * mit der richtigen Lösung und die bekannte Grammatik.
   */
  extra?: {
    art: 'foerder' | 'forder'
    regeln: { titel: string; erklaerung: string; beispiele: string[] }[]
    fehler: { antwort: string; richtig: string }[]
    bekannt: string[]
  }
}

/** Auftragstext der Extra-Aufgaben */
function extraAuftrag(e: NonNullable<GrammatikAuftrag['extra']>): { system: string; user: string } {
  const regeln = e.regeln.map((r) => `- ${r.titel}: ${r.erklaerung}${r.beispiele.length ? ` (z. B. ${r.beispiele.slice(0, 2).join('; ')})` : ''}`).join('\n')
  if (e.art === 'foerder')
    return {
      system: [
        'Du erstellst FÖRDERAUFGABEN für ein einzelnes Kind, das mit einer Grammatikregel noch Schwierigkeiten hat.',
        'Regelkarte: GENAU EINE vereinfachte Regelkarte (kurze Sätze, ein Merksatz, 2–3 sehr einfache Beispiele) und „stolperfallen": 2–3 typische Fehler, wie sie in den Antworten des Kindes vorkommen – jeweils was falsch ist und wie es richtig geht.',
        'Aufgaben: genau 10 in drei Stufen, vom Leichten zum Schweren:',
        '- stufe 1 (3 Aufgaben): erkennen – Auswahl und Fehler finden;',
        '- stufe 2 (4 Aufgaben): gelenkt bilden – Lücke mit Grundform in „vorgabe";',
        '- stufe 3 (3 Aufgaben): selbst bilden – Umformen und Satzbau.',
        'Jede Aufgabe hat einen „tipp" (Denkanstoß auf Deutsch, verrät die Lösung nicht) und eine kurze „erklaerung". Die typischen Fehler des Kindes gezielt aufgreifen. Einfacher Wortschatz.'
      ].join('\n'),
      user: `Regel(n), mit denen das Kind Schwierigkeiten hat:\n${regeln}\n\nFalsche Antworten des Kindes (→ richtig):\n${
        e.fehler.map((f) => `„${f.antwort}" → „${f.richtig}"`).join('\n') || '(keine Texte gespeichert)'
      }`
    }
  return {
    system: [
      'Du erstellst FORDERAUFGABEN für ein einzelnes Kind, das eine Grammatikregel schon sicher kann.',
      'Regelkarte: GENAU EINE kurze Karte „Weiterdenken" (worauf es bei schwierigeren Fällen ankommt), 2 Beispiele; stolperfallen leer.',
      'Aufgaben: genau 8 anspruchsvollere Aufgaben (stufe 3), Transfer und Mischung: die sichere Regel gemischt mit anderer BEKANNTER Grammatik, Übersetzen (Deutsch → Zielsprache: satz = deutscher Satz, loesungen = alle richtigen Übersetzungen), Fehler finden in längeren Sätzen, Umformungen mit mehreren Schritten.',
      'NUR Grammatik aus der Liste „bekannt" verwenden – nichts, was noch nicht behandelt wurde. „tipp" darf leer bleiben.'
    ].join('\n'),
    user: `Sicher beherrschte Regel(n):\n${regeln}\n\nBekannte Grammatik (darf vorkommen): ${e.bekannt.join('; ') || 'nur die Regel(n) oben'}`
  }
}

/** Themen eines Auftrags (mehrere stehen mit „ · " getrennt im Thema) */
export const themenVon = (thema: string): string[] => [
  ...new Set(
    thema
      .split(' · ')
      .map((t) => t.trim())
      .filter(Boolean)
  )
]

const istLatein = (a: GrammatikAuftrag): boolean => a.sprache === 'la' || /latein/i.test(a.fach)

/** Lernjahr im Fach Latein (ab Klasse 6 als 2. Fremdsprache die Regel in Niedersachsen; Klasse 5 = 1. Lernjahr) */
export const lateinLernjahr = (jahrgang: number): number => Math.max(1, Math.min(6, jahrgang - 5))

type SperrAngaben = Pick<GrammatikAuftrag, 'thema' | 'fach' | 'sprache' | 'jahrgang' | 'bekannt' | 'themenIds' | 'land'> & { extra?: { bekannt: string[] } }

/**
 * Gesperrte Zeitformen eines Auftrags (09.10.2026, Befund „There is / There are" in Klasse 5 mit „There was/were";
 * Nachtrag: alle Fremdsprachen). Englisch: bekannt = Angabe des Auftrags (Förder/Forder: die bekannte Grammatik des
 * Kindes), sonst der Jahrgang. Übrige Sprachen: dazu immer der Katalog nach Lernjahr (Latein auch der Lehrwerk-Stand,
 * den der Aufrufer über `bekanntNachStand` mitgibt).
 */
export function zeitformSperre(a: SperrAngaben): SperrbareZeitform[] {
  const sprache = sperrSprache(a.sprache, a.fach)
  if (!sprache) return []
  const eigene = [...(a.bekannt ?? []), ...(a.extra?.bekannt ?? [])]
  const bekannt =
    sprache === 'en' ? (eigene.length ? eigene : bekanntNachStand(undefined, a.jahrgang)) : [...eigene, ...bekanntNachLernjahr(a)]
  return sperreFuer({ bekannt, themen: a.themenIds, thema: a.thema, sprache })
}

/** Regel für den Auftrag: die strikte Zeitform-Regel – für Sprachen ohne erfasste Prüfung die Regel aus dem Katalog */
export function zeitformRegel(a: SperrAngaben, gesperrt: SperrbareZeitform[]): string {
  if (sperrSprache(a.sprache, a.fach)) return sperrRegel(gesperrt)
  return katalogFormenRegel(a, a.themenIds)
}

/** Was Zeitform-Prüfung und Niveau-Gegenprobe gefunden haben – für die Meldung am Ende des Auftrags */
const gestrichen = new WeakMap<GrammatikPaket, { entfernt: number; zeitformen: string[]; niveau?: string }>()

/**
 * Zusatz für die Abschlussmeldung: „(3 Aufgaben mit noch unbekannter Zeitform entfernt …)" und ggf. „Niveau: wirkt für
 * B1+ zu leicht …" – leer, wenn nichts auffiel.
 */
export function erzeugungsHinweis(p: GrammatikPaket): string {
  const g = gestrichen.get(p)
  if (!g) return ''
  const teile = [
    g.entfernt
      ? `${g.entfernt} ${g.entfernt === 1 ? 'Aufgabe' : 'Aufgaben'} mit noch unbekannter Zeitform entfernt${g.zeitformen.length ? `: ${g.zeitformen.join(', ')}` : ''}`
      : '',
    g.niveau ? `Niveau: ${g.niveau}` : ''
  ].filter(Boolean)
  return teile.length ? ` (${teile.join('; ')})` : ''
}

/** Niveau-Gegenprobe (grammatikNiveau.ts `niveauBefund`): Fällt der Pool deutlich zu leicht aus, sagt es die Meldung */
export function mitNiveauBefund(p: GrammatikPaket, ziel: CefrLevel | null): GrammatikPaket {
  if (!ziel) return p
  const b = niveauBefund(p.aufgaben, ziel)
  if (b.zuLeicht) gestrichen.set(p, { ...(gestrichen.get(p) ?? { entfernt: 0, zeitformen: [] }), niveau: b.hinweis })
  return p
}

/** GER-Niveau des Auftrags: Angabe, sonst GER-Tabelle der Länder (falls erreichbar), sonst Faustregel */
export async function niveauDesAuftrags(a: {
  fach: string
  sprache: string
  jahrgang: number
  land?: string
  schulform?: string
  ger?: CefrLevel
}): Promise<CefrLevel> {
  if (a.ger && CEFR_SCALE.includes(a.ger)) return a.ger
  let table: CefrTable | null = null
  try {
    const api = (globalThis as { window?: { api?: { cefr?: { get: () => Promise<CefrTable> } } } }).window?.api
    if (api?.cefr) table = await api.cefr.get()
  } catch {
    // ohne Tabelle: Faustregel
  }
  return zielNiveau(a, table).ger
}

/**
 * Nach der Prüfung: Aufgaben mit gesperrten Zeitformen streichen. Fehlen dadurch Aufgaben, schreibt die KI einmal
 * entsprechend viele nach (gleiche Regelkarten, dieselbe Sperre) – deren Treffer fallen ebenfalls weg.
 */
export async function mitZeitformSperre(
  paket: GrammatikPaket,
  gesperrt: SperrbareZeitform[],
  ziel: number,
  nachschreiben: (anzahl: number, p: GrammatikPaket) => Promise<GrammatikPaket>,
  melde: (t: string) => void = () => undefined
): Promise<GrammatikPaket> {
  if (!gesperrt.length) return paket
  const erst = ohneGesperrteZeitformen(paket, gesperrt)
  let ergebnis: GrammatikPaket = { ...paket, regeln: erst.regeln, aufgaben: erst.aufgaben }
  let entfernt = erst.entfernt
  const zeitformen = new Set(erst.zeitformen)
  const fehlend = Math.min(erst.entfernt, ziel - erst.aufgaben.length)
  if (fehlend > 0) {
    melde(`${erst.entfernt} Aufgaben mit unbekannter Zeitform entfernt – die KI schreibt ${fehlend} neue …`)
    try {
      const neu = await nachschreiben(fehlend, ergebnis)
      const zweit = ohneGesperrteZeitformen(neu, gesperrt)
      entfernt += zweit.entfernt
      for (const z of zweit.zeitformen) zeitformen.add(z)
      ergebnis = paketBereinigt(
        {
          ...ergebnis,
          // Neue Aufgaben ohne Kennung – paketBereinigt vergibt freie, die vorhandenen behalten ihre
          aufgaben: [...ergebnis.aufgaben, ...zweit.aufgaben.slice(0, fehlend).map((x) => ({ ...x, id: '' }))]
        },
        paket.thema
      )
    } catch {
      // Nachschreiben fehlgeschlagen: der bereinigte Pool bleibt
    }
  }
  gestrichen.set(ergebnis, { entfernt, zeitformen: [...zeitformen] })
  return ergebnis
}

/**
 * Latein-Regeln für die KI (Recherche 07.10.2026). Abkürzungen wie in den Schulbüchern; Längenzeichen in Formen und
 * Lösungen (die Eingaben der Lernenden werden ohne Längen geprüft); typische Mehrdeutigkeiten gezielt.
 */
export const LATEIN_REGELN = [
  'LATEIN – verbindlich:',
  '- Arbeitsanweisungen, Regelkarten und Erklärungen auf Deutsch; lateinische Formen MIT Längenzeichen (ā ē ī ō ū), so wie im Vokabelverzeichnis der Schulbücher.',
  '- Abkürzungen: Kasus Nom./Gen./Dat./Akk./Abl./Vok.; Numerus Sg./Pl.; Genus m./f./n.; Person 1./2./3.; Tempus Präs./Impf./Fut. I/Perf./Plusqpf./Fut. II; Modus Ind./Konj./Imp.; Genus verbi Akt./Pass.',
  '- Nur Formen und Wörter, die zum Thema und zum Lernjahr passen; die Fälle kommen in den Lehrwerken schrittweise (erst Nom./Akk., dann Dat., Gen., Abl.), e- und u-Deklination erst im 2.–3. Lernjahr, Passiv im 2. Lernjahr, Futur II spät.',
  '- bestimmen: Einzelform (satz leer) → ALLE Lesarten angeben (rosae = Gen. Sg. f. / Dat. Sg. f. / Nom. Pl. f.). Steht die Form in einem Satz (satz enthält die Form), gilt nur die Lesart im Satz. „werte" nennt je Merkmal die vollständige Auswahl (Kasus: Nom., Gen., Dat., Akk., Abl., Vok. – Vok. nur, wenn behandelt).',
  '- Typische Mehrdeutigkeiten gezielt einbauen: -ae (Gen./Dat. Sg., Nom. Pl.), -is (Dat./Abl. Pl. a/o; Gen. Sg. 3. Dekl.), -a (Nom. Sg. f. vs. Nom./Akk. Pl. n.), -us (o-, u-Dekl., Neutra wie tempus), -um (Akk. Sg. vs. Gen. Pl. 3. Dekl.), -es (Nom./Akk. Pl. 3. Dekl.), -ī (Gen. Sg. vs. Nom. Pl. o-Dekl.); bei Verben Präsens/Futur der kons. Konj. (regit/reget), -ba-/-bi-, -era- (Plusqpf.) vs. eram.',
  '- tabelle: ein Paradigma – Zeilen Nom., Gen., Dat., Akk., Abl. (Vok. nur, wenn behandelt), Spalten Sg. und Pl.; bei Verben Zeilen 1. Sg. … 3. Pl. Zwei bis vier Zellen vorgeben (vorgabe true), den Rest ausfüllen lassen. satz nennt das Wort mit Nennform (z. B. „servus, -ī m." bzw. „amāre, amō").',
  '- umformen: nach Vorgabe („in den Plural", „ins Imperfekt", „ins Passiv") – die Vorgabe nennt das Ziel EINDEUTIG (z. B. „in die 3. Pers. Pl."), nie nur „ändere Person und Numerus"; KNG-Kongruenz: satz „magnus + templum", vorgabe „Gen. Pl.", Lösung „magnōrum templōrum" – auch Paare aus verschiedenen Deklinationen (bonus + rēx, agricola + bonus).',
  '- luecke: Endung bzw. Form im Satz ergänzen, vorgabe nennt das Grundwort mit Nennform.',
  '- uebersetzen: kurze lateinische Wortgruppe oder Satz ins Deutsche, bei Kasusfunktionen passend (Abl. instrumenti „mit/durch", Gen. „des/der"); loesungen: mehrere gleichwertige deutsche Fassungen.',
  '- auswahl/mehrfach: z. B. Kasusfunktion benennen, Präposition mit Akk. oder Abl., in + Akk. (wohin?) gegen in + Abl. (wo?), „Welche Formen sind Ablativ?" (mehrfach: alle richtigen in loesungen).',
  '- Kein Satzbau-Puzzle und kein „Fehler finden" in Latein.'
].join('\n')

export async function erzeugeGrammatikPaket(a: GrammatikAuftrag, ai: Ai, melde: (t: string) => void = () => undefined): Promise<GrammatikPaket> {
  const latein = istLatein(a)
  const extra = a.extra ? extraAuftrag(a.extra) : null
  const gesperrt = zeitformSperre(a)
  // Niveau (09.10.2026): Förderaufgaben eine Teilstufe darunter, Forderaufgaben darüber, sonst der Wunsch der Lehrkraft
  const ger = await niveauDesAuftrags(a)
  const stufe: Schwierigkeit | string | undefined = a.extra ? (a.extra.art === 'foerder' ? 'grundlegend' : 'anspruchsvoll') : a.niveau
  melde(extra ? 'Die KI schreibt die Extra-Aufgaben …' : 'Die KI schreibt Regelkarten und Aufgaben …')
  const roh = await ai<{ regeln: unknown[]; aufgaben: unknown[] }>({
    schemaName: 'grammatik_pool',
    system: [
      `Du erstellst einen Aufgabenpool für eine Grammatik-Lern-App (${a.fach}, Klasse ${a.jahrgang}${a.niveau ? `, Niveau ${a.niveau}` : ''}).`,
      'Die Lernenden üben selbstständig im Karteikasten-Prinzip; jede Aufgabe muss für sich allein verständlich und EINDEUTIG lösbar sein.',
      extra
        ? extra.system
        : 'Regelkarten: 2–4 kurze Regeln zum Thema (bei mehreren Themen je Thema 1–3, zusammen höchstens 8), Erklärung auf Deutsch, altersgerecht, mit 2–3 Beispielen in der Zielsprache.',
      extra
        ? ''
        : latein
        ? 'Aufgaben: genau 40, gemischt – etwa 10 Bestimmen, 4 Mehrfachauswahl, 4 Tabelle, 8 Umformen (davon 3 KNG-Kongruenz), 6 Lücke, 4 Übersetzen, 4 Auswahl. Alle Regeln abdecken, vom Leichten zum Schweren.'
        : `Aufgaben: genau 40, gemischt – ${niveauMischung(ger, stufe)}. Alle Regeln abdecken, innerhalb des Niveaus vom Leichteren zum Schwereren.`,
      latein ? lateinNiveauRegel({ ...a, fach: a.fach || 'Latein' }, stufe) : niveauRegel(a, ger, stufe),
      'Wortschatz passend zur Klassenstufe; keine Namen realer Personen (fiktive Vornamen sind in Ordnung).',
      'Lücke: genau eine Lücke „___", die Grundform in „vorgabe". Gib ALLE richtigen Formen in „loesungen" an (z. B. Kurz- und Langform).',
      'Fehler finden: genau EIN Grammatikfehler (kein Rechtschreibfehler), „fehlerWort" exakt wie im Satz, „loesungen" das richtige Wort.',
      'Satzbau: „teile" in RICHTIGER Reihenfolge; Satzzeichen hängen am letzten Teil.',
      'Felder, die für eine Aufgabenart nicht gelten, bleiben leer bzw. leere Liste.',
      latein ? `Lernjahr Latein: etwa ${lateinLernjahr(a.jahrgang)}.\n${LATEIN_REGELN}` : '',
      zeitformRegel(a, gesperrt),
      a.woerter?.length
        ? `WORTSCHATZ${
            a.wortQuelle ? ` (${a.wortQuelle})` : ''
          }: Bilde die Aufgaben NUR mit diesen Wörtern (dazu Eigennamen und einfachste Funktionswörter):\n${a.woerter.slice(0, 300).join('; ')}`
        : ''
    ]
      .filter(Boolean)
      .join('\n'),
    user: extra
      ? `${extra.user}
Zielsprache: ${a.sprache}`
      : `${
          a.thema.includes(' · ')
            ? `Themen (Aufgaben gleichmäßig verteilen; Regelkarten zu jedem Thema, jede Regel gehört zu GENAU EINEM Thema und nennt es in „thema"; jede Aufgabe übt nur die Regel ihrer regelId): ${a.thema
                .split(' · ')
                .join('; ')}`
            : `Thema: ${a.thema}`
        }\nZielsprache: ${a.sprache}${a.wunsch ? `\nWunsch der Lehrkraft: ${a.wunsch}` : ''}${
          a.teilformen
            ? `\n\n${a.teilformen}\nVerteile die Aufgaben auf die Teilformen zum Bilden; Teilformen „nur erkennen" nur in Auswahl- und Fehler-Aufgaben.`
            : ''
        }`,
    schema: paketSchema(latein, Boolean(extra), extra ? [] : themenVon(a.thema))
  })
  const geprueft = await gepruefterPool(paketBereinigt(roh, a.thema), a, ai, melde, gesperrt, latein ? undefined : verschoben(ger, stufe))
  const ziel = a.extra ? (a.extra.art === 'foerder' ? 10 : 8) : 40
  const fertig = await mitZeitformSperre(
    geprueft,
    gesperrt,
    ziel,
    async (anzahl, p) => {
      const neu = await mehrAufgabenRoh(
        {
          thema: a.thema,
          fach: a.fach,
          sprache: a.sprache,
          jahrgang: a.jahrgang,
          anzahl,
          arten: [],
          schwierigkeit: a.extra?.art === 'forder' ? 'anspruchsvoll' : a.extra ? 'grundlegend' : 'mittel',
          regeln: p.regeln,
          vorhanden: vorhandeneSaetze(p),
          land: a.land,
          schulform: a.schulform,
          ger
        },
        ai,
        melde,
        gesperrt
      )
      // Förderaufgaben: die nachgeschriebenen zählen zur gelenkten Stufe
      return a.extra ? { ...neu, aufgaben: neu.aufgaben.map((x) => ({ ...x, stufe: x.stufe ?? (a.extra?.art === 'forder' ? 3 : 2) })) } : neu
    },
    melde
  )
  return mitNiveauBefund(fertig, latein ? null : verschoben(ger, stufe))
}

/** Vorhandene Sätze (gekürzt) – damit beim Nachschreiben nichts doppelt kommt */
const vorhandeneSaetze = (p: GrammatikPaket): string[] =>
  p.aufgaben.map((x) => (x.satz || x.form || (x.teile ?? []).join(' ')).slice(0, 120)).filter(Boolean)

/** 2. Schritt: Eine zweite Anfrage prüft jede Aufgabe (korrigiert Lösungen bzw. streicht) – auch für „+ Aufgaben" */
async function gepruefterPool(
  start: GrammatikPaket,
  a: GrammatikAuftrag,
  ai: Ai,
  melde: (t: string) => void,
  gesperrt: SperrbareZeitform[] = [],
  ger?: CefrLevel
): Promise<GrammatikPaket> {
  const latein = istLatein(a)
  let paket = start
  melde(`Die KI prüft ${paket.aufgaben.length} Aufgaben …`)
  // 2. Prüfung: Korrekturen bzw. Streichungen je Aufgabe
  try {
    const pruef = await ai<{
      urteile: {
        nr: number
        ok: boolean
        loesungen: string[]
        optionen: string[]
        fehlerWort: string
        lesarten?: string[][]
        zellen?: string[][]
        grund: string
      }[]
    }>({
      schemaName: 'grammatik_pruefung',
      system: [
        `Du prüfst Grammatikaufgaben (${a.fach}, Klasse ${a.jahrgang}) sorgfältig wie eine erfahrene Lehrkraft.`,
        'Für jede Aufgabe: Ist sie eindeutig lösbar? Stimmt die Lösung? Fehlen gültige Varianten (z. B. Kurzform)? Bei „Fehler finden": genau ein Fehler, fehlerWort exakt im Satz?',
        'ok = false, wenn die Aufgabe mehrdeutig oder falsch ist und sich nicht durch die Lösungen reparieren lässt.',
        'loesungen/optionen/fehlerWort: die korrigierte Fassung (oder unverändert); grund: kurz, deutsch.',
        gesperrt.length
          ? `ok = false auch, wenn Satz, Lösung oder Möglichkeiten eine Zeitform brauchen, die die Lerngruppe noch nicht kennt: ${gesperrt
              .map((z) => z.name)
              .join('; ')}.`
          : '',
        ger ? `ok = false auch für Aufgaben, die für GER-Niveau ${ger} trivial sind (ohne die Regel lösbar, Ablenker offensichtlich falsch).` : '',
        latein
          ? 'LATEIN: Prüfe JEDE lateinische Form auf Richtigkeit (Endung, Stamm, Längen). Bestimmen: Sind ALLE Lesarten genannt (bei Einzelformen) bzw. genau die im Satz passende? lesarten = vollständige, korrigierte Liste – je Lesart GENAU ein Wert pro Merkmal, in der Reihenfolge und Schreibweise der Merkmale (z. B. ["1.", "Sg.", "Präs.", "Ind.", "Akt."], nicht "1. Sg."). Tabelle: Formen in [eckigen Klammern] sind vorgegeben, die übrigen füllen die Lernenden aus – das ist eine gültige Aufgabe; zellen = NUR die korrigierten Formen je Zeile (ohne Zeilennamen), eine Zelle je Spalte. Übersetzen: alle gleichwertigen deutschen Fassungen. Umformen/Lücke/Auswahl mit mehreren möglichen Lösungen, die nicht alle genannt sind, oder mit unklarem Ziel: ok = false.'
          : ''
      ]
        .filter(Boolean)
        .join('\n'),
      user: paket.aufgaben
        .map(
          (x, i) =>
            `${i + 1}. [${x.art}] ${x.anweisung}\nSatz: ${x.satz}${x.form ? `\nForm: ${x.form}` : ''}${
              x.merkmale?.length ? `\nMerkmale: ${JSON.stringify(x.merkmale)}\nLesarten: ${JSON.stringify(x.lesarten ?? [])}` : ''
            }${
              x.zeilen?.length
                ? `\nTabelle (${(x.spalten ?? []).join(' | ')}; [eckige Klammern] = vorgegeben, sonst von den Lernenden auszufüllen): ${x.zeilen
                    .map((z) => `${z.name}: ${z.loesungen.map((l, j) => (z.vorgabe?.[j] ? `[${l}]` : l)).join(' | ')}`)
                    .join('; ')}`
                : ''
            }${x.vorgabe ? `\nVorgabe: ${x.vorgabe}` : ''}${x.optionen?.length ? `\nMöglichkeiten: ${x.optionen.join(' | ')}` : ''}${
              x.fehlerWort ? `\nFehlerwort: ${x.fehlerWort}` : ''
            }${x.teile?.length ? `\nTeile: ${x.teile.join(' | ')}` : ''}\nLösungen: ${x.loesungen.join(' | ')}`
        )
        .join('\n\n'),
      schema: O({
        urteile: A(
          O({
            nr: { type: 'integer' },
            ok: { type: 'boolean' },
            loesungen: A(S()),
            optionen: A(S()),
            fehlerWort: S(),
            ...(latein ? { lesarten: A(A(S())), zellen: A(A(S())) } : {}),
            grund: S()
          })
        )
      })
    })
    const nachNr = new Map((pruef.urteile ?? []).map((u) => [u.nr, u]))
    paket = paketBereinigt(
      {
        ...paket,
        aufgaben: paket.aufgaben.flatMap((x, i) => {
          const u = nachNr.get(i + 1)
          if (!u) return [x]
          if (!u.ok) return []
          return [
            {
              ...x,
              loesungen: u.loesungen?.length ? u.loesungen : x.loesungen,
              ...(x.art === 'auswahl' && u.optionen?.length ? { optionen: u.optionen } : {}),
              ...(x.art === 'fehler' && u.fehlerWort ? { fehlerWort: u.fehlerWort } : {}),
              ...(x.art === 'mehrfach' && u.optionen?.length ? { optionen: u.optionen } : {}),
              // Nur übernehmen, wenn jede Lesart je Merkmal einen Wert hat (Praxislauf 07.10.2026: „1. Sg." zusammengezogen)
              ...(x.art === 'bestimmen' && u.lesarten?.length && u.lesarten.every((l) => l.length === (x.merkmale?.length ?? 0))
                ? { lesarten: u.lesarten }
                : {}),
              ...(x.art === 'tabelle' && u.zellen?.length && x.zeilen
                ? { zeilen: x.zeilen.map((z, j) => ({ ...z, loesungen: u.zellen![j]?.length === z.loesungen.length ? u.zellen![j] : z.loesungen })) }
                : {})
            }
          ]
        })
      },
      a.thema
    )
  } catch {
    // Prüfung fehlgeschlagen: der bereinigte Pool bleibt – die Lehrkraft sieht ihn vor dem Freigeben
  }
  return paket
}

/** Auftrag „+ Aufgaben" (08.10.2026): weitere Aufgaben zu einer freigegebenen Grammatik */
export interface MehrAufgabenAuftrag {
  thema: string
  fach: string
  sprache: string
  jahrgang: number
  /** 4–20 */
  anzahl: number
  /** gewünschte Aufgabenarten (leer = gemischt wie bisher) */
  arten: AufgabenArt[]
  schwierigkeit: 'grundlegend' | 'mittel' | 'anspruchsvoll'
  wunsch?: string
  /** Die Regelkarten der Grammatik – die neuen Aufgaben hängen an ihren Kennungen */
  regeln: { id: string; titel: string; erklaerung: string; beispiele: string[] }[]
  /** Vorhandene Sätze (gekürzt) – damit nichts doppelt kommt */
  vorhanden: string[]
  /** Bekannte Grammatik der Lerngruppe (Katalogkennungen; 09.10.2026) – fehlt sie, gilt der Jahrgang */
  bekannt?: string[]
  /** Katalogkennungen der Themen dieser Grammatik */
  themenIds?: string[]
  /** Bundesland, Schulform, GER-Niveau (09.10.2026) – „schwierigkeit" gilt relativ zu diesem Maßstab */
  land?: string
  schulform?: string
  ger?: CefrLevel
}

const SCHWIERIGKEIT_TEXT: Record<MehrAufgabenAuftrag['schwierigkeit'], string> = {
  grundlegend: 'grundlegend – kurze Sätze, einfacher Wortschatz, die Regel in ihrer Grundform',
  mittel: 'mittel – wie im Unterricht üblich, gemischte Fälle',
  anspruchsvoll: 'anspruchsvoll – längere Sätze, Ausnahmen und Sonderfälle, Transfer'
}

/** Anzahl der Aufgaben im Auftrag „+ Aufgaben" auf 4–20 begrenzen */
export const mehrAnzahl = (n: number): number => Math.max(4, Math.min(20, Math.round(Number.isFinite(n) ? n : 10)))

/**
 * Weitere Aufgaben zu einer freigegebenen Grammatik (08.10.2026, Wunsch der Lehrkraft: „+ Aufgaben" je Grammatik):
 * Anzahl, Aufgabenarten, Schwierigkeit und Wünsche; nur Aufgaben, keine neuen Regelkarten – jede Aufgabe nennt die
 * Kennung einer vorhandenen Regel. Danach dieselbe Prüfung wie beim Pool. Keine Namen, keine Daten der Lernenden.
 */
export async function erzeugeMehrAufgaben(a0: MehrAufgabenAuftrag, ai: Ai, melde: (t: string) => void = () => undefined): Promise<GrammatikPaket> {
  const gesperrt = zeitformSperre(a0)
  const ger = await niveauDesAuftrags(a0)
  const a = { ...a0, ger }
  const p = await mehrAufgabenRoh(a, ai, melde, gesperrt)
  const fertig = await mitZeitformSperre(
    p,
    gesperrt,
    mehrAnzahl(a.anzahl),
    (fehlend, q) => mehrAufgabenRoh({ ...a, anzahl: fehlend, vorhanden: [...a.vorhanden, ...vorhandeneSaetze(q)] }, ai, melde, gesperrt),
    melde
  )
  return mitNiveauBefund(fertig, istLatein({ ...a, thema: '' }) ? null : verschoben(ger, a.schwierigkeit))
}

/** „+ Aufgaben" ohne Nachprüfung der Zeitformen – auch zum Nachschreiben gestrichener Aufgaben */
async function mehrAufgabenRoh(a: MehrAufgabenAuftrag, ai: Ai, melde: (t: string) => void, gesperrt: SperrbareZeitform[]): Promise<GrammatikPaket> {
  const auftrag: GrammatikAuftrag = { thema: a.thema, fach: a.fach, sprache: a.sprache, jahrgang: a.jahrgang }
  const latein = istLatein(auftrag)
  const erlaubt = latein ? ARTEN_LATEIN : [...ARTEN_ALLGEMEIN, 'uebersetzen']
  const arten = a.arten.filter((x) => erlaubt.includes(x))
  const anzahl = mehrAnzahl(a.anzahl)
  const ger = await niveauDesAuftrags(a)
  melde(`Die KI schreibt ${anzahl} weitere Aufgaben …`)
  const schema = O({
    aufgaben: A(
      O({
        ...((aufgabeSchema(latein) as { properties: Record<string, Record<string, unknown>> }).properties),
        art: { type: 'string', enum: arten.length ? arten : latein ? ARTEN_LATEIN : ARTEN_ALLGEMEIN },
        regelId: { type: 'string', enum: a.regeln.map((r) => r.id) }
      })
    )
  })
  const roh = await ai<{ aufgaben: unknown[] }>({
    schemaName: 'grammatik_mehr',
    system: [
      `Du ergänzt einen Aufgabenpool für eine Grammatik-Lern-App (${a.fach}, Klasse ${a.jahrgang}). Die Regelkarten stehen schon fest.`,
      'Jede Aufgabe muss für sich allein verständlich und EINDEUTIG lösbar sein; „regelId" nennt die Regelkarte, die sie übt.',
      `Aufgaben: genau ${anzahl}${arten.length ? `, nur diese Arten: ${arten.map((x) => ART_NAME[x as AufgabenArt] ?? x).join(', ')} (möglichst gleichmäßig)` : ', gemischt'}. Alle Regeln abdecken.`,
      `Schwierigkeit: ${SCHWIERIGKEIT_TEXT[a.schwierigkeit] ?? SCHWIERIGKEIT_TEXT.mittel} – relativ zum Niveau der Lerngruppe.`,
      latein ? lateinNiveauRegel({ ...a, fach: a.fach || 'Latein' }, a.schwierigkeit) : niveauRegel(a, ger, a.schwierigkeit),
      'Wortschatz passend zur Klassenstufe; keine Namen realer Personen (fiktive Vornamen sind in Ordnung).',
      'Lücke: genau eine Lücke „___", die Grundform in „vorgabe". Gib ALLE richtigen Formen in „loesungen" an.',
      'Fehler finden: genau EIN Grammatikfehler, „fehlerWort" exakt wie im Satz, „loesungen" das richtige Wort.',
      'Satzbau: „teile" in RICHTIGER Reihenfolge; Satzzeichen hängen am letzten Teil.',
      'Übersetzen: satz = deutscher Satz, loesungen = alle richtigen Übersetzungen in die Zielsprache.',
      'Felder, die für eine Aufgabenart nicht gelten, bleiben leer bzw. leere Liste.',
      'Keine Sätze, die schon im Pool stehen (Liste unten).',
      latein ? `Lernjahr Latein: etwa ${lateinLernjahr(a.jahrgang)}.\n${LATEIN_REGELN}` : '',
      zeitformRegel(a, gesperrt)
    ]
      .filter(Boolean)
      .join('\n'),
    user: [
      `Thema: ${a.thema}`,
      `Zielsprache: ${a.sprache}`,
      a.wunsch?.trim() ? `Wunsch der Lehrkraft: ${a.wunsch.trim().slice(0, 600)}` : '',
      '',
      'Regelkarten:',
      ...a.regeln.map((r) => `- ${r.id}: ${r.titel} – ${r.erklaerung}${r.beispiele.length ? ` (z. B. ${r.beispiele.slice(0, 2).join('; ')})` : ''}`),
      ...(a.vorhanden.length ? ['', 'Schon im Pool (nicht wiederholen):', ...a.vorhanden.slice(0, 80)] : [])
    ].join('\n'),
    schema
  })
  return gepruefterPool(
    paketBereinigt({ thema: a.thema, regeln: a.regeln, aufgaben: roh.aufgaben }, a.thema),
    auftrag,
    ai,
    melde,
    gesperrt,
    latein ? undefined : verschoben(ger, a.schwierigkeit)
  )
}

/** Aufgabenarten, die die KI für diese Sprache schreibt (Auswahl im Fenster „+ Aufgaben") */
export const waehlbareArten = (sprache: string, fach: string): AufgabenArt[] =>
  (istLatein({ thema: '', fach, sprache, jahrgang: 0 }) ? ARTEN_LATEIN : [...ARTEN_ALLGEMEIN, 'uebersetzen']) as AufgabenArt[]
