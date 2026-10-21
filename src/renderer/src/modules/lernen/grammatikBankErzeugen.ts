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
  type Uebung
} from '@shared/grammatikBank'
import { bekanntNachStand, ohneGesperrteZeitformen, sperreFuer, sperrRegel, sperrSprache } from '@shared/zeitformSperre'
import { gepruefterPool, LATEIN_REGELN, lateinLernjahr, niveauDesAuftrags, type PruefBericht } from './grammatikErzeugen'
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
const ARTEN_ALLGEMEIN = ['luecke', 'auswahl', 'umformen', 'fehler', 'satzbau']
const ARTEN_LATEIN = ['bestimmen', 'mehrfach', 'umformen', 'luecke', 'uebersetzen', 'auswahl']

/** Vorläufige Kennung neuer Aufgaben (der Server vergibt beim Speichern die feste „b…") */
export const neueKennung = (i: number): string => `n${Date.now().toString(36)}${i}`

/** Erzeugt Regelkarte und Aufgaben für einen Schlüssel – die Aufgaben tragen ihre Übungsart, noch ohne Bank-Kennung */
export async function erzeugeBankAufgaben(
  a: BankAuftrag,
  ai: Ai,
  melde: (t: string) => void = () => undefined
): Promise<{ regel: BankRegel; aufgaben: BankAufgabe[]; bericht: BankBericht }> {
  const latein = istLatein(a)
  const ger = await niveauDesAuftrags(a)
  const sprache = sperrSprache(a.sprache, a.fach)
  const bekannt = bekanntNachStand(a.lehrwerk?.buch ? a.lehrwerk : undefined, a.jahrgang)
  const gesperrt = sprache ? sperreFuer({ bekannt, themen: a.themenIds, thema: a.titel, sprache }) : []
  const uebungen = a.uebungen.length ? a.uebungen : (['erkennen', 'bilden', 'anwenden'] as Uebung[])
  const anzahl = Math.max(2, Math.min(12, Math.round(a.anzahl)))
  const regelId = regelIdVon(a.schluessel)
  melde(`Die KI schreibt ${uebungen.length * anzahl} Aufgaben zu „${a.titel}" …`)
  const roh = await ai<{ regel: BankRegel; aufgaben: Record<string, unknown>[] }>({
    schemaName: 'grammatik_bank',
    system: [
      `Du erstellst Übungsaufgaben für eine Grammatik-Lern-App (${a.fach}, etwa Klasse ${a.jahrgang}). Die Aufgaben werden schulweit für diese Grammatik hinterlegt und in vielen Kursen genutzt.`,
      'Jede Aufgabe muss für sich allein verständlich und EINDEUTIG lösbar sein und genau die genannte Grammatik üben.',
      a.regel
        ? 'Die Regelkarte steht schon fest (unten) – gib sie unverändert zurück.'
        : 'Regelkarte: EINE kurze Karte – Titel, Erklärung in 2–4 Sätzen auf Deutsch (altersgerecht), 2–3 Beispiele in der Zielsprache.',
      `Aufgaben: je Übungsart GENAU ${anzahl}, jede mit „uebung":`,
      ...uebungen.map((u) => `- ${u} (${UEBUNG_NAME[u]}): ${UEBUNG_TEXT[u]}${latein ? '' : `; Aufgabenarten: ${UEBUNG_ARTEN[u].join(', ')}`}`),
      `SCHWIERIGKEIT dieser Aufgaben: ${STUFE_TEXT[a.niveau ?? 'm']} – relativ zum Niveau der Klasse.`,
      'Innerhalb jeder Übungsart vom Leichteren zum Schwereren.',
      latein
        ? `Lernjahr Latein: etwa ${lateinLernjahr(a.jahrgang)}.\n${LATEIN_REGELN}`
        : niveauRegel(a, ger, a.niveau === 'g' ? 'grundlegend' : a.niveau === 'a' ? 'anspruchsvoll' : 'mittel'),
      'Wortschatz passend zur Klassenstufe; keine Namen realer Personen (fiktive Vornamen sind in Ordnung).',
      'Lücke: genau eine Lücke „___", die Grundform in „vorgabe". Gib ALLE richtigen Formen in „loesungen" an (z. B. Kurz- und Langform).',
      'Auswahl: 3–4 Möglichkeiten in „optionen", die richtige dabei, die anderen typische Fehlformen.',
      'Fehler finden: genau EIN Grammatikfehler (kein Rechtschreibfehler), „fehlerWort" exakt wie im Satz, „loesungen" das richtige Wort.',
      'Satzbau: „teile" in RICHTIGER Reihenfolge (4–9 Teile); Satzzeichen hängen am letzten Teil.',
      'Felder, die für eine Aufgabenart nicht gelten, bleiben leer bzw. leere Liste.',
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
          satz: S('luecke/auswahl: Satz mit genau einer Lücke „___"; umformen: Ausgangssatz; fehler: Satz mit GENAU EINEM Grammatikfehler; satzbau: leer'),
          vorgabe: S('luecke: Grundform in Klammern; umformen: was zu tun ist; sonst leer'),
          loesungen: A(S(), 'alle richtigen Antworten'),
          optionen: A(S(), 'auswahl: 3–4 Möglichkeiten; sonst leer'),
          fehlerWort: S('fehler: das falsche Wort GENAU wie im Satz; sonst leer'),
          teile: A(S(), 'satzbau: Teile in RICHTIGER Reihenfolge; sonst leer'),
          erklaerung: S('ein kurzer Satz auf Deutsch: warum diese Form')
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
    { thema: a.titel, fach: a.fach, sprache: a.sprache, jahrgang: a.jahrgang },
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
  return {
    bericht,
    regel,
    aufgaben: ohne.aufgaben.filter((x): x is BankAufgabe => istUebung(x.uebung)).map((x, i) => ({ ...x, id: neueKennung(i), niveau: a.niveau ?? 'm' }))
  }
}
