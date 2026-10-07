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
import type { StructuredRequest } from '@shared/types'
import { paketBereinigt, type GrammatikPaket } from '@shared/grammatiktrainer'

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

const aufgabeSchema = (latein: boolean): Record<string, unknown> =>
  O({
    art: { type: 'string', enum: latein ? ARTEN_LATEIN : ARTEN_ALLGEMEIN },
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
    ...(latein ? LATEIN_FELDER : {})
  })

const paketSchema = (latein: boolean): Record<string, unknown> =>
  O({
    regeln: A(
      O({
        id: S('r1, r2 …'),
        titel: S('kurzer Titel der Regel'),
        erklaerung: S('2–4 Sätze auf Deutsch, altersgerecht'),
        beispiele: A(S(), '2–3 Beispielsätze in der Zielsprache')
      })
    ),
    aufgaben: A(aufgabeSchema(latein))
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
}

const istLatein = (a: GrammatikAuftrag): boolean => a.sprache === 'la' || /latein/i.test(a.fach)

/** Lernjahr im Fach Latein (ab Klasse 6 als 2. Fremdsprache die Regel in Niedersachsen; Klasse 5 = 1. Lernjahr) */
export const lateinLernjahr = (jahrgang: number): number => Math.max(1, Math.min(6, jahrgang - 5))

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
  '- tabelle: ein Paradigma – Zeilen Nom., Gen., Dat., Akk., Abl. (Vok. nur, wenn behandelt), Spalten Sg. und Pl.; bei Verben Zeilen 1. Sg. … 3. Pl. Zwei bis vier Zellen vorgeben (vorgabe true), den Rest ausfüllen lassen.',
  '- umformen: nach Vorgabe („in den Plural", „ins Imperfekt", „ins Passiv"); KNG-Kongruenz: satz „magnus + templum", vorgabe „Gen. Pl.", Lösung „magnōrum templōrum" – auch Paare aus verschiedenen Deklinationen (bonus + rēx, agricola + bonus).',
  '- luecke: Endung bzw. Form im Satz ergänzen, vorgabe nennt das Grundwort mit Nennform.',
  '- uebersetzen: kurze lateinische Wortgruppe oder Satz ins Deutsche, bei Kasusfunktionen passend (Abl. instrumenti „mit/durch", Gen. „des/der"); loesungen: mehrere gleichwertige deutsche Fassungen.',
  '- auswahl/mehrfach: z. B. Kasusfunktion benennen, Präposition mit Akk. oder Abl., in + Akk. (wohin?) gegen in + Abl. (wo?), „Welche Formen sind Ablativ?" (mehrfach: alle richtigen in loesungen).',
  '- Kein Satzbau-Puzzle und kein „Fehler finden" in Latein.'
].join('\n')

export async function erzeugeGrammatikPaket(a: GrammatikAuftrag, ai: Ai, melde: (t: string) => void = () => undefined): Promise<GrammatikPaket> {
  const latein = istLatein(a)
  melde('Die KI schreibt Regelkarten und Aufgaben …')
  const roh = await ai<{ regeln: unknown[]; aufgaben: unknown[] }>({
    schemaName: 'grammatik_pool',
    system: [
      `Du erstellst einen Aufgabenpool für eine Grammatik-Lern-App (${a.fach}, Klasse ${a.jahrgang}${a.niveau ? `, Niveau ${a.niveau}` : ''}).`,
      'Die Lernenden üben selbstständig im Karteikasten-Prinzip; jede Aufgabe muss für sich allein verständlich und EINDEUTIG lösbar sein.',
      'Regelkarten: 2–4 kurze Regeln zum Thema (bei mehreren Themen je Thema 1–3, zusammen höchstens 8), Erklärung auf Deutsch, altersgerecht, mit 2–3 Beispielen in der Zielsprache.',
      latein
        ? 'Aufgaben: genau 40, gemischt – etwa 10 Bestimmen, 4 Mehrfachauswahl, 4 Tabelle, 8 Umformen (davon 3 KNG-Kongruenz), 6 Lücke, 4 Übersetzen, 4 Auswahl. Alle Regeln abdecken, vom Leichten zum Schweren.'
        : 'Aufgaben: genau 40, gemischt – etwa 12 Lücke, 8 Auswahl, 8 Umformen, 6 Fehler finden, 6 Satzbau. Alle Regeln abdecken, vom Leichten zum Schweren.',
      'Wortschatz passend zur Klassenstufe; keine Namen realer Personen (fiktive Vornamen sind in Ordnung).',
      'Lücke: genau eine Lücke „___", die Grundform in „vorgabe". Gib ALLE richtigen Formen in „loesungen" an (z. B. Kurz- und Langform).',
      'Fehler finden: genau EIN Grammatikfehler (kein Rechtschreibfehler), „fehlerWort" exakt wie im Satz, „loesungen" das richtige Wort.',
      'Satzbau: „teile" in RICHTIGER Reihenfolge; Satzzeichen hängen am letzten Teil.',
      'Felder, die für eine Aufgabenart nicht gelten, bleiben leer bzw. leere Liste.',
      latein ? `Lernjahr Latein: etwa ${lateinLernjahr(a.jahrgang)}.\n${LATEIN_REGELN}` : '',
      a.woerter?.length
        ? `WORTSCHATZ${
            a.wortQuelle ? ` (${a.wortQuelle})` : ''
          }: Bilde die Aufgaben NUR mit diesen Wörtern (dazu Eigennamen und einfachste Funktionswörter):\n${a.woerter.slice(0, 300).join('; ')}`
        : ''
    ]
      .filter(Boolean)
      .join('\n'),
    user: `${
      a.thema.includes(' · ')
        ? `Themen (gemischt üben, Aufgaben gleichmäßig verteilen; Regelkarten zu jedem Thema): ${a.thema.split(' · ').join('; ')}`
        : `Thema: ${a.thema}`
    }\nZielsprache: ${a.sprache}${a.wunsch ? `\nWunsch der Lehrkraft: ${a.wunsch}` : ''}${
      a.teilformen
        ? `\n\n${a.teilformen}\nVerteile die Aufgaben auf die Teilformen zum Bilden; Teilformen „nur erkennen" nur in Auswahl- und Fehler-Aufgaben.`
        : ''
    }`,
    schema: paketSchema(latein)
  })
  let paket = paketBereinigt(roh, a.thema)
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
        latein
          ? 'LATEIN: Prüfe JEDE lateinische Form auf Richtigkeit (Endung, Stamm, Längen). Bestimmen: Sind ALLE Lesarten genannt (bei Einzelformen) bzw. genau die im Satz passende? lesarten = vollständige, korrigierte Liste. Tabelle: zellen = die korrigierten Formen je Zeile und Spalte. Übersetzen: alle gleichwertigen deutschen Fassungen.'
          : ''
      ]
        .filter(Boolean)
        .join('\n'),
      user: paket.aufgaben
        .map(
          (x, i) =>
            `${i + 1}. [${x.art}] ${x.anweisung}\nSatz: ${x.satz}${x.form ? `\nForm: ${x.form}` : ''}${
              x.merkmale?.length ? `\nMerkmale: ${x.merkmale.join(' | ')}\nLesarten: ${(x.lesarten ?? []).map((l) => l.join(' ')).join(' / ')}` : ''
            }${
              x.zeilen?.length ? `\nTabelle (${(x.spalten ?? []).join(' | ')}): ${x.zeilen.map((z) => `${z.name}: ${z.loesungen.join(' | ')}`).join('; ')}` : ''
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
              ...(x.art === 'bestimmen' && u.lesarten?.length ? { lesarten: u.lesarten } : {}),
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
