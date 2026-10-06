/**
 * Aufgabenpool der Grammatik-Lern-App erzeugen (06.10.2026, abgestimmt: „KI beim Freigeben"): einmal je Thema und
 * Niveau, mit dem KI-Zugang der Lehrkraft. Zwei Schritte:
 *  1. Regelkarten und rund 40 Aufgaben (Lücke, Auswahl, Umformen, Fehler finden, Satzbau) nach Schema.
 *  2. Prüfung: Eine zweite Anfrage prüft jede Aufgabe und Lösung (eindeutig? richtig? alle gültigen Varianten?) und
 *     liefert Korrekturen bzw. streicht Aufgaben. Danach bereinigt shared/grammatiktrainer.ts `paketBereinigt` noch
 *     einmal (Lücke ohne „___", Lösung nicht unter den Möglichkeiten …).
 * Keine Namen, keine Daten der Lernenden.
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

const AUFGABE = O({
  art: { type: 'string', enum: ['luecke', 'auswahl', 'umformen', 'fehler', 'satzbau'] },
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
  erklaerung: S('ein kurzer Satz auf Deutsch: warum diese Form')
})

const PAKET = O({
  regeln: A(
    O({
      id: S('r1, r2 …'),
      titel: S('kurzer Titel der Regel'),
      erklaerung: S('2–4 Sätze auf Deutsch, altersgerecht'),
      beispiele: A(S(), '2–3 Beispielsätze in der Zielsprache')
    })
  ),
  aufgaben: A(AUFGABE)
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
}

export async function erzeugeGrammatikPaket(a: GrammatikAuftrag, ai: Ai, melde: (t: string) => void = () => undefined): Promise<GrammatikPaket> {
  melde('Die KI schreibt Regelkarten und Aufgaben …')
  const roh = await ai<{ regeln: unknown[]; aufgaben: unknown[] }>({
    schemaName: 'grammatik_pool',
    system: [
      `Du erstellst einen Aufgabenpool für eine Grammatik-Lern-App (${a.fach}, Klasse ${a.jahrgang}${a.niveau ? `, Niveau ${a.niveau}` : ''}).`,
      'Die Lernenden üben selbstständig im Karteikasten-Prinzip; jede Aufgabe muss für sich allein verständlich und EINDEUTIG lösbar sein.',
      'Regelkarten: 2–4 kurze Regeln zum Thema, Erklärung auf Deutsch, altersgerecht, mit 2–3 Beispielen in der Zielsprache.',
      'Aufgaben: genau 40, gemischt – etwa 12 Lücke, 8 Auswahl, 8 Umformen, 6 Fehler finden, 6 Satzbau. Alle Regeln abdecken, vom Leichten zum Schweren.',
      'Wortschatz passend zur Klassenstufe; keine Namen realer Personen (fiktive Vornamen sind in Ordnung).',
      'Lücke: genau eine Lücke „___", die Grundform in „vorgabe". Gib ALLE richtigen Formen in „loesungen" an (z. B. Kurz- und Langform).',
      'Fehler finden: genau EIN Grammatikfehler (kein Rechtschreibfehler), „fehlerWort" exakt wie im Satz, „loesungen" das richtige Wort.',
      'Satzbau: „teile" in RICHTIGER Reihenfolge; Satzzeichen hängen am letzten Teil.',
      'Felder, die für eine Aufgabenart nicht gelten, bleiben leer bzw. leere Liste.'
    ].join('\n'),
    user: `Thema: ${a.thema}\nZielsprache: ${a.sprache}${a.wunsch ? `\nWunsch der Lehrkraft: ${a.wunsch}` : ''}${
      a.teilformen
        ? `\n\n${a.teilformen}\nVerteile die Aufgaben auf die Teilformen zum Bilden; Teilformen „nur erkennen" nur in Auswahl- und Fehler-Aufgaben.`
        : ''
    }`,
    schema: PAKET
  })
  let paket = paketBereinigt(roh, a.thema)
  melde(`Die KI prüft ${paket.aufgaben.length} Aufgaben …`)
  // 2. Prüfung: Korrekturen bzw. Streichungen je Aufgabe
  try {
    const pruef = await ai<{ urteile: { nr: number; ok: boolean; loesungen: string[]; optionen: string[]; fehlerWort: string; grund: string }[] }>({
      schemaName: 'grammatik_pruefung',
      system: [
        `Du prüfst Grammatikaufgaben (${a.fach}, Klasse ${a.jahrgang}) sorgfältig wie eine erfahrene Lehrkraft.`,
        'Für jede Aufgabe: Ist sie eindeutig lösbar? Stimmt die Lösung? Fehlen gültige Varianten (z. B. Kurzform)? Bei „Fehler finden": genau ein Fehler, fehlerWort exakt im Satz?',
        'ok = false, wenn die Aufgabe mehrdeutig oder falsch ist und sich nicht durch die Lösungen reparieren lässt.',
        'loesungen/optionen/fehlerWort: die korrigierte Fassung (oder unverändert); grund: kurz, deutsch.'
      ].join('\n'),
      user: paket.aufgaben
        .map(
          (x, i) =>
            `${i + 1}. [${x.art}] ${x.anweisung}\nSatz: ${x.satz}${x.vorgabe ? `\nVorgabe: ${x.vorgabe}` : ''}${x.optionen?.length ? `\nMöglichkeiten: ${x.optionen.join(' | ')}` : ''}${x.fehlerWort ? `\nFehlerwort: ${x.fehlerWort}` : ''}${x.teile?.length ? `\nTeile: ${x.teile.join(' | ')}` : ''}\nLösungen: ${x.loesungen.join(' | ')}`
        )
        .join('\n\n'),
      schema: O({
        urteile: A(O({ nr: { type: 'integer' }, ok: { type: 'boolean' }, loesungen: A(S()), optionen: A(S()), fehlerWort: S(), grund: S() }))
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
              ...(x.art === 'fehler' && u.fehlerWort ? { fehlerWort: u.fehlerWort } : {})
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
