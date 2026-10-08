/**
 * Reihe aus eingescannten Schulbuchseiten (06.10.2026, abgestimmt mit der Lehrkraft; Grundlage:
 * recherche/reihe-aus-schulbuch-2026-10-06.md, Abschnitte 2, 4, 6 und 7).
 *
 *  - Umfang: Wochen × Wochenstunden × 0,85 (Ausfälle, Feiertage, Klassenarbeiten) – oder Stunden direkt.
 *    Die KI schätzt die Dauer auf Wunsch als SPANNE mit Begründung; daraus wird das Stundenraster (`Reihe.stunden`).
 *  - Mehrere Seiten auf einmal: Die vorhandene Schulbuch-Erkennung läuft JE SEITE (mit Lage der Abschnitte für
 *    einen möglichen Bildausschnitt).
 *  - Die KI wählt die für die Lernziele relevantesten Aufgaben und Texte (Stundenbudget, Phasen,
 *    Auswahl-/Kürzungsreihenfolge, AFB-Mischung nach Schulform, eine Begründungszeile je Element);
 *    Fakultatives/Differenzierung wird zu OPTIONALEN Schritten.
 *  - Übernahme Standard: VERWEISEN („Buch S. 39, Nr. 4"). Abschrift oder Bildausschnitt nur, wenn die Lehrkraft es
 *    je Abschnitt anklickt – dann mit Quellenangabe; Seitenzähler je Lerngruppe + Buch + Schuljahr, Warnung ab 20 Seiten.
 */
import type { StructuredRequest } from '@shared/types'
import { SCHULFORMEN, type SchulProfil } from '@shared/schulformen'
import {
  leererInhalt,
  neueSchrittId,
  artVon,
  standardErfolg,
  type BuchUebernahme,
  type Lernziel,
  type Reihe,
  type Schritt,
  type SchrittArt,
  type StundenArt
} from '@shared/reihe'
import { quelleVon, schulbuchText, type Schulbuch, type SchulbuchAbschnitt } from '../../shared/schulbuch/schulbuch'
import { KI_ARTEN, stundenText, type ReihenPlan } from './reihePlanungKi'

type Ki = <T>(req: StructuredRequest) => Promise<T>

// ---------------------------------------------------------------- Umfang und Stundenraster

export type Umfang = { art: 'wochen'; wochen: number; wochenstunden: number } | { art: 'stunden'; stunden: number }

/** Netto-Anteil der Unterrichtszeit (Ausfälle, Feiertage, Klassenarbeiten) – Vorgabe der Lehrkraft */
export const NETTO_FAKTOR = 0.85

/** Verfügbare Unterrichtsstunden (45 min) */
export function stundenAusUmfang(u: Umfang): number {
  const roh = u.art === 'wochen' ? Math.max(0, u.wochen) * Math.max(0, u.wochenstunden) * NETTO_FAKTOR : Math.max(0, u.stunden)
  return Math.max(1, Math.round(roh))
}

/** Stundenraster aus der Stundenzahl: lauter Einzel- oder möglichst Doppelstunden (Rest als Einzelstunde) */
export function stundenRaster(n: number, form: StundenArt): StundenArt[] {
  const s = Math.max(1, Math.round(n))
  if (form === 'einzel') return Array.from({ length: s }, () => 'einzel')
  return [...Array.from({ length: Math.floor(s / 2) }, () => 'doppel' as const), ...(s % 2 ? ['einzel' as const] : [])]
}

/** Unterrichtsstunden eines Rasters (Doppelstunde = 2) */
export const stundenImRaster = (r: StundenArt[]): number => r.reduce((n, a) => n + (a === 'doppel' ? 2 : 1), 0)

// ---------------------------------------------------------------- Schulform (Recherche Abschnitt 2 und 6)

export interface SchulformVorgaben {
  profil: SchulProfil
  /** Anforderungsbereiche I/II/III in Prozent */
  afb: [number, number, number]
  /** Anteil der Übungsphase (vor dem Ausgleich) */
  ueben: number
  text: string
}

export function schulformVorgaben(stateId: string, schoolTypeId: string): SchulformVorgaben {
  const profil = SCHULFORMEN[stateId]?.find((f) => f.id === schoolTypeId)?.profil ?? (/gymn/i.test(schoolTypeId) ? 'gymnasium' : 'integriert')
  switch (profil) {
    case 'gymnasium':
      return {
        profil,
        afb: [40, 40, 20],
        ueben: 0.25,
        text: 'Gymnasium: vertiefte Allgemeinbildung – zügigere Erarbeitung, mehr Transfer und Anforderungsbereich III.'
      }
    case 'realschule':
      return {
        profil,
        afb: [45, 40, 15],
        ueben: 0.3,
        text: 'Realschule: Übung vor Transfer, Anwendungs- und Praxisbezug; Differenzierung als optionale Schritte.'
      }
    case 'integriert':
      return {
        profil,
        afb: [45, 40, 15],
        ueben: 0.3,
        text: 'Gesamt-/Gemeinschaftsschule (Kurse G/E): das Grundniveau für alle sichern, Erweiterung als optionale Schritte, Hilfen als Förderschritte.'
      }
    case 'hauptschule':
    case 'foerderLernen':
      return {
        profil,
        afb: [55, 35, 10],
        ueben: 0.35,
        text: 'Haupt-/Mittelschule bzw. Förderschwerpunkt Lernen: kleinere Schritte, mehr gelenkte Übung und Wiederholung, Praxis- und Berufsbezug; Hilfen als Förderschritte.'
      }
    case 'grundschule':
      return { profil, afb: [55, 35, 10], ueben: 0.35, text: 'Grundschule: kleinschrittig, handelnd und anschaulich, viel Wiederholung.' }
  }
}

// ---------------------------------------------------------------- Stundenbudget (Recherche Abschnitt 7.2)

export interface PhasenBudget {
  gesamt: number
  /** Klassenarbeit samt Rückgabe/Berichtigung und Puffer */
  reserve: number
  phasen: { id: string; name: string; stunden: number }[]
}

const PHASEN: { id: string; name: string; anteil: (v: SchulformVorgaben) => number }[] = [
  { id: 'einstieg', name: 'Einstieg/Diagnose', anteil: () => 0.075 },
  { id: 'erarbeitung', name: 'Erarbeitung', anteil: () => 0.275 },
  { id: 'ueben', name: 'Üben/Vertiefen', anteil: (v) => v.ueben },
  { id: 'anwendung', name: 'Anwendung/Transfer/Zielaufgabe', anteil: () => 0.175 },
  { id: 'sicherung', name: 'Sicherung/Wiederholung', anteil: () => 0.1 }
]

/** Verteilt eine ganze Zahl nach Anteilen (größter Rest), die Summe stimmt genau */
export function verteile(gesamt: number, anteile: number[]): number[] {
  const summe = anteile.reduce((a, b) => a + b, 0) || 1
  const roh = anteile.map((a) => (gesamt * a) / summe)
  const ganz = roh.map(Math.floor)
  let rest = gesamt - ganz.reduce((a, b) => a + b, 0)
  const reihenfolge = roh.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i)
  for (const { i } of reihenfolge) {
    if (rest <= 0) break
    ganz[i]++
    rest--
  }
  return ganz
}

/** Stundenbudget: Reserve für Klassenarbeit (ca. 12 %) und Puffer (ca. 7 %), Rest nach Phasen */
export function phasenBudget(n: number, v: SchulformVorgaben, mitKlassenarbeit: boolean): PhasenBudget {
  const gesamt = Math.max(1, Math.round(n))
  const ka = mitKlassenarbeit ? Math.max(1, Math.round(gesamt * 0.12)) : 0
  const puffer = mitKlassenarbeit ? Math.round(gesamt * 0.07) : 0
  const reserve = Math.min(gesamt - 1, ka + puffer)
  const stunden = verteile(
    gesamt - reserve,
    PHASEN.map((p) => p.anteil(v))
  )
  return { gesamt, reserve, phasen: PHASEN.map((p, i) => ({ id: p.id, name: p.name, stunden: stunden[i] })) }
}

// ---------------------------------------------------------------- Dauer (Recherche Abschnitt 7.3)

export interface Dauer {
  min: number
  max: number
  begruendung: string
}

const SPRACHEN = /englisch|franz|spanisch|latein|italien|russisch|polnisch|türkisch|tuerkisch|niederl|chinesisch|griechisch|daf|daz/i

/** Faustwert ohne KI (Praxiswerte, keine Belege) – immer als Spanne */
export function dauerFaustwert(fachId: string): Dauer {
  if (/mathe/i.test(fachId)) return { min: 12, max: 20, begruendung: 'Faustwert Mathematik-Kapitel: 12–20 Stunden.' }
  if (SPRACHEN.test(fachId)) return { min: 22, max: 38, begruendung: 'Faustwert Sprachen-Unit bei 4–5 Wochenstunden: 22–38 Stunden.' }
  if (/deutsch/i.test(fachId)) return { min: 12, max: 25, begruendung: 'Faustwert Deutsch-Unterrichtsvorhaben: 12–25 Stunden.' }
  return { min: 8, max: 16, begruendung: 'Faustwert Sachfach-Kontext (NaWi/Gesellschaft): 8–16 Stunden.' }
}

// ---------------------------------------------------------------- Seiten erkennen (je Seite)

export interface BuchAbschnitt extends SchulbuchAbschnitt {
  /** Index des Seitenbilds in `BuchErkennung.bilder` */
  seitenIndex: number
}

export interface BuchErkennung {
  titel: string
  verlag: string
  /** Seitenbilder (nur für Bildausschnitte – gehen nie als ganze Seite aufs Blatt) */
  bilder: string[]
  abschnitte: BuchAbschnitt[]
}

/** Ergebnisse der Erkennung je Seite zusammenführen (Seiten ohne Schulbuch fallen weg) */
export function fuegeSeitenZusammen(ergebnisse: (Schulbuch | null)[], bilder: string[]): BuchErkennung {
  const ok = ergebnisse.map((sb, i) => ({ sb, i })).filter((x): x is { sb: Schulbuch; i: number } => Boolean(x.sb))
  return {
    titel: ok.find((x) => x.sb.titel)?.sb.titel ?? '',
    verlag: ok.find((x) => x.sb.verlag)?.sb.verlag ?? '',
    bilder,
    abschnitte: ok.flatMap(({ sb, i }) => sb.abschnitte.map((a) => ({ ...a, seite: a.seite || sb.seiten, seitenIndex: i, wahl: 'verweis' as const })))
  }
}

/** Jede Seite einzeln erkennen (eine KI-Anfrage je Seite) */
export async function erkenneBuchSeiten(
  bilder: string[],
  erkenne: (bild: string) => Promise<Schulbuch | null>,
  melde?: (t: string) => void
): Promise<BuchErkennung> {
  const ergebnisse: (Schulbuch | null)[] = []
  for (const [i, b] of bilder.entries()) {
    melde?.(`Seite ${i + 1} von ${bilder.length} wird erkannt …`)
    ergebnisse.push(await erkenne(b).catch(() => null))
  }
  return fuegeSeitenZusammen(ergebnisse, bilder)
}

/** Kurzfassung der Abschnitte für die KI (nummeriert) */
export const abschnittListe = (buch: BuchErkennung, laenge = 500): string =>
  buch.abschnitte
    .map(
      (a, i) =>
        `[${i}] S. ${a.seite || '?'} ${a.kennung} (${a.art}${a.titel ? `: ${a.titel}` : ''}) – ${a.text.replace(/\s+/g, ' ').slice(0, laenge)}${
          a.text.length > laenge ? ' …' : ''
        }`
    )
    .join('\n')

// ---------------------------------------------------------------- KI: Dauer schätzen

const DAUER_SCHEMA = {
  type: 'object',
  properties: { min: { type: 'integer' }, max: { type: 'integer' }, begruendung: { type: 'string' } },
  required: ['min', 'max', 'begruendung'],
  additionalProperties: false
}

export function dauerAnfrage(
  r: Pick<Reihe, 'fachLabel' | 'fachId' | 'grade' | 'schoolTypeId' | 'stateId' | 'oberthema' | 'titel'>,
  buch: BuchErkennung
): StructuredRequest {
  const f = dauerFaustwert(r.fachId)
  const seiten = new Set(buch.abschnitte.map((a) => a.seite).filter(Boolean)).size
  return {
    system: `Du schätzt als erfahrene Lehrkraft, wie viele Unterrichtsstunden (45 min) eine Unterrichtsreihe braucht (${r.fachLabel}, Klasse ${r.grade}, Schulform ${r.schoolTypeId}, Bundesland ${r.stateId}).`,
    user: [
      `THEMA: ${r.oberthema || r.titel}`,
      `SCHULBUCH: ${buch.titel || 'unbekannt'}, ${seiten} Seiten, ${buch.abschnitte.length} Abschnitte (davon ${
        buch.abschnitte.filter((a) => /aufgabe/i.test(a.art)).length
      } Aufgabenblöcke).`,
      `ABSCHNITTE:\n${abschnittListe(buch, 160)}`,
      `FAUSTWERT: ${f.begruendung}`,
      'Gib eine realistische SPANNE an ("min" bis "max" Unterrichtsstunden) – Erarbeitung, Übung, Anwendung und Sicherung mitbedacht, ohne Klassenarbeit.',
      '"begruendung": ein bis zwei Sätze (Seitenzahl, Zahl und Art der Aufgaben, Schwierigkeit für diese Lerngruppe). Es ist ein Vorschlag.'
    ].join('\n'),
    schemaName: 'reihe_dauer',
    schema: DAUER_SCHEMA
  }
}

export function dauerAuswerten(d: Partial<Dauer> | null | undefined, rueckfall: Dauer): Dauer {
  const a = Math.round(Number(d?.min) || 0)
  const b = Math.round(Number(d?.max) || 0)
  if (a < 1 || b < 1) return rueckfall
  return { min: Math.min(a, b), max: Math.min(120, Math.max(a, b)), begruendung: String(d?.begruendung ?? '').trim() || rueckfall.begruendung }
}

// ---------------------------------------------------------------- KI: Reihe planen (Recherche Abschnitt 7)

export type Kuerzung = 'minimal' | 'standard' | 'voll'

export interface BuchPlanEingabe {
  reihe: Reihe
  kc: { auszug: string[]; quelle: string }
  buch: BuchErkennung
  stunden: StundenArt[]
  budget: PhasenBudget
  vorgaben: SchulformVorgaben
  kuerzung: Kuerzung
  mitKlassenarbeit: boolean
  wunsch?: string
}

const BUCH_ARTEN: SchrittArt[] = KI_ARTEN

const BUCH_SCHEMA = {
  type: 'object',
  properties: {
    lernziele: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, ichKann: { type: 'string' } },
        required: ['text', 'ichKann'],
        additionalProperties: false
      }
    },
    teile: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          schritte: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                titel: { type: 'string' },
                art: { type: 'string', enum: BUCH_ARTEN },
                rolle: { type: 'string', enum: ['pflicht', 'optional', 'foerder'] },
                phase: { type: 'string', enum: PHASEN.map((p) => p.id) },
                afb: { type: 'string', enum: ['I', 'II', 'III'] },
                stunde: { type: 'integer' },
                minuten: { type: 'integer' },
                beschreibung: { type: 'string' },
                buch: { type: 'array', items: { type: 'integer' } },
                lernziele: { type: 'array', items: { type: 'integer' } },
                begruendung: { type: 'string' }
              },
              required: ['titel', 'art', 'rolle', 'phase', 'afb', 'stunde', 'minuten', 'beschreibung', 'buch', 'lernziele', 'begruendung'],
              additionalProperties: false
            }
          }
        },
        required: ['name', 'schritte'],
        additionalProperties: false
      }
    },
    gestrichen: {
      type: 'array',
      items: {
        type: 'object',
        properties: { abschnitt: { type: 'integer' }, begruendung: { type: 'string' } },
        required: ['abschnitt', 'begruendung'],
        additionalProperties: false
      }
    },
    hinweis: { type: 'string' }
  },
  required: ['lernziele', 'teile', 'gestrichen', 'hinweis'],
  additionalProperties: false
}

const KUERZUNG_TEXT: Record<Kuerzung, string> = {
  minimal: 'MINIMAL: nur Zielaufgabe, Kernwortschatz/-grammatik bzw. Kernbegriffe, je Lernziel eine Erarbeitungs- und eine Übungsaufgabe und eine Sicherung.',
  standard: 'STANDARD: Pflicht- und Kernaufgaben plus ausgewählte Übungen; Fakultatives und Differenzierung als optionale Schritte.',
  voll: 'VOLL: möglichst alle sinnvollen Aufgaben; Fakultatives und Differenzierung als optionale Schritte.'
}

/** Anfrage an die KI – ohne Aufruf, damit sie sich prüfen lässt */
export function buchPlanAnfrage(e: BuchPlanEingabe): StructuredRequest {
  const r = e.reihe
  const { budget, vorgaben: v } = e
  const nettoJeStunde = e.stunden.map((a, i) => `${i + 1}: ${a === 'doppel' ? 80 : 40} min netto`).join(', ')
  return {
    system: `Du planst als erfahrene Lehrkraft eine realistische Unterrichtsreihe aus Schulbuchseiten (${r.fachLabel}, Klasse ${r.grade}, Schulform ${r.schoolTypeId}, Bundesland ${r.stateId}). Die Lernenden bearbeiten sie Schritt für Schritt in einem digitalen Lernpfad und haben das Buch selbst.`,
    user: [
      `THEMA: ${r.oberthema || r.titel}`,
      r.titel ? `TITEL DER REIHE: ${r.titel}` : '',
      `SCHULBUCH: ${[e.buch.titel || 'Schulbuch', e.buch.verlag].filter(Boolean).join(', ')}`,
      e.kc.auszug.length
        ? `VORGABEN DES KERNCURRICULUMS (${e.kc.quelle}):\n${e.kc.auszug.map((a) => `- ${a}`).join('\n')}`
        : 'Kein Auszug – richte dich nach dem üblichen Kerncurriculum dieses Landes, Fachs, Jahrgangs und dieser Schulform.',
      r.lernziele.length
        ? `LERNZIELE DER REIHE (Nummern für "lernziele"; das Feld "lernziele" oben bleibt LEER):\n${r.lernziele.map((l, i) => `${i}: ${l.text}`).join('\n')}`
        : 'Noch keine Lernziele: Formuliere oben in "lernziele" 3 bis 6 Lernziele der Reihe aus Kerncurriculum und Buchseiten ("text" für die Lehrkraft, "ichKann" schülergerecht „Ich kann …"); die Schritte verweisen mit ihren Nummern darauf.',
      `SCHULFORM: ${v.text} Anforderungsbereiche etwa I ${v.afb[0]} % / II ${v.afb[1]} % / III ${v.afb[2]} %.`,
      `STUNDEN (nummeriert ab 1): ${stundenText(e.stunden)}`,
      `NETTOZEIT JE STUNDE (Rest für Organisation und Besprechung): ${nettoJeStunde}`,
      `STUNDENBUDGET (${budget.gesamt} Unterrichtsstunden${
        budget.reserve ? `, davon ${budget.reserve} Reserve für Klassenarbeit, Rückgabe/Berichtigung und Puffer – dort nichts Neues einplanen` : ''
      }): ${budget.phasen.map((p) => `${p.name} ${p.stunden} Std.`).join(', ')}`,
      `UMFANG: ${KUERZUNG_TEXT[e.kuerzung]}`,
      `SCHULBUCHABSCHNITTE (Nummern für "buch" und "gestrichen"):\n${abschnittListe(e.buch)}`,
      e.wunsch?.trim() ? `WÜNSCHE DER LEHRKRAFT: ${e.wunsch.trim()}` : '',
      'SCHRITTARTEN:',
      '- arbeitsblatt: Erarbeitung/Übung mit mehreren Aufgaben und KI-Feedback; aufgabe: kurzer Auftrag (auch Lesen/Hören mit Kontrollfragen); lernkarten: Wortschatz/Begriffe sichern; diagnose: Eingangsdiagnose; reflexion: Selbsteinschätzung; hefter: Merkkasten/Sicherung; abschluss: Lernprodukt/Zielaufgabe mit Raster; sprechen: Sprachaufnahme; praesenz: im Unterricht (Gespräch, Gruppenarbeit, Experiment).',
      'REGELN:',
      '1. Wähle aus den Abschnitten die für die Lernziele RELEVANTESTEN Aufgaben und Texte in dieser Reihenfolge: Zielaufgabe der Einheit und die hinführenden Schlüsselaufgaben; je Lernziel mindestens eine Erarbeitungs-, eine Übungs- und eine Anwendungsaufgabe; alle Kompetenzbereiche/Fertigkeiten des Fachs abdecken; Anforderungsbereiche wie oben gemischt; was das Buch als obligatorisch kennzeichnet vor Fakultativem.',
      '2. Zeit: Schätze je Aufgabe 5 bis 20 Minuten ("minuten") und fülle jede Stunde nur bis zur Nettozeit. Passt nicht alles hinein, kürze in dieser Reihenfolge: fakultative, Spiel- und Projektteile → Doppelungen gleichartiger Übungen (1–2 behalten) → Zusatztexte. NIEMALS kürzen: Zielaufgabe, Kernwortschatz/-grammatik bzw. Kernbegriffe, eine Sicherungsphase. Mindestens eine Aufgabe je Lernziel bleibt.',
      '3. Phasen je Teil in dieser Folge: Aktivierung → Input (Text/Hörtext mit Kontrollfragen) → Erarbeitung (Regel/Muster entdecken) → gelenkte Übung → freie Übung → Anwendung (Zielaufgabe/Produkt) → Selbsteinschätzung. Lernkarten für Wortschatz/Begriffe, Selbsteinschätzung nach der Erarbeitung und vor Tests. "phase" nennt die Phase des Schritts; die Summe je Phase hält das Stundenbudget ein.',
      '4. Gliedere in 2 bis 5 Teile mit kurzen Namen; verteile die Schritte auf GENAU die angegebenen Stunden ("stunde" ab 1).',
      '5. Differenzierungsaufgaben (z. B. „Help with", „Extra", Basis/Erweiterung), Fakultatives und Vertiefungen werden OPTIONALE Schritte ("rolle": "optional") – parallel, nicht zusätzlich zum Stundenbudget. Hilfen für Schwächere: "foerder". Alles andere "pflicht".',
      '6. Aufgaben, die eine Hör-CD, ein Video, Partner oder Material außerhalb der Seiten brauchen: in "beschreibung" ausdrücklich so kennzeichnen oder als "praesenz" planen.',
      '7. URHEBERRECHT: Standard ist VERWEISEN – die Lernenden arbeiten im eigenen Buch. "beschreibung" nennt die Stelle genau („Buch S. 39, Nr. 4", „Lies VT1 auf S. 38") und was zu tun ist; schreibe den Wortlaut des Buchs NICHT ab. Eigene Aufgaben formulierst du neu. Keine vollständigen Kapitel übernehmen.',
      '8. Tests und Diagnosen formulierst du immer neu (nicht aus dem Buch kopieren); jede Testaufgabe gehört zu einem Lernziel und spiegelt einen Übungsschritt.',
      '9. TRANSPARENZ: "begruendung" ist EINE Zeile je Schritt (Lernziel, AFB, warum Pflicht oder optional). In "gestrichen" steht jeder Abschnitt mit Aufgaben oder Texten, den du NICHT nutzt, mit einer Begründungszeile. "buch" nennt die Nummern der Abschnitte, auf die sich der Schritt stützt.',
      '10. Titel kurz und für Lernende verständlich (keine Nummern). "hinweis": zwei bis drei Sätze für die Lehrkraft (was im Plenum geschehen sollte, wo Buchmaterial fehlt).'
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'reihe_aus_schulbuch',
    schema: BUCH_SCHEMA
  }
}

interface BuchPlanRoh {
  lernziele: { text: string; ichKann: string }[]
  teile: {
    name: string
    schritte: {
      titel: string
      art: string
      rolle: string
      phase: string
      afb: string
      stunde: number
      minuten: number
      beschreibung: string
      buch: number[]
      lernziele: number[]
      begruendung: string
    }[]
  }[]
  gestrichen: { abschnitt: number; begruendung: string }[]
  hinweis: string
}

export interface BuchPlan extends ReihenPlan {
  /** Neue Lernziele der Reihe (nur, wenn die Reihe noch keine hatte) */
  lernziele: Lernziel[]
  gestrichen: { abschnitt: number; begruendung: string }[]
  /** Buchabschnitte je Schritt (Nummern in `BuchErkennung.abschnitte`) */
  bezuege: Record<string, number[]>
  /** Phase und AFB je Schritt – zur Anzeige */
  einordnung: Record<string, { phase: string; afb: string }>
}

const s = (t: unknown): string => String(t ?? '').trim()

/** Antwort der KI prüfen und in Schritte übersetzen (alle als Platzhalter, die per Knopf entstehen) */
export function buchPlanUebernehmen(d: BuchPlanRoh, r: Pick<Reihe, 'lernziele' | 'art'>, buch: BuchErkennung, stunden: StundenArt[]): BuchPlan {
  const n = Math.max(1, stunden.length)
  const neueZiele: Lernziel[] = r.lernziele.length
    ? []
    : (d?.lernziele ?? [])
        .map((l) => ({ text: s(l.text), ichKann: s(l.ichKann) || s(l.text) }))
        .filter((l) => l.text)
        .slice(0, 8)
  const ziele = r.lernziele.length ? r.lernziele : neueZiele
  const gueltig = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < buch.abschnitte.length
  const teile: string[] = []
  const schritte: Schritt[] = []
  const bezuege: Record<string, number[]> = {}
  const einordnung: Record<string, { phase: string; afb: string }> = {}
  for (const t of d?.teile ?? []) {
    let name = s(t.name) || `Teil ${teile.length + 1}`
    while (teile.includes(name)) name = `${name} (2)`
    teile.push(name)
    for (const x of t.schritte ?? []) {
      const art = (BUCH_ARTEN as string[]).includes(x.art) ? (x.art as SchrittArt) : 'aufgabe'
      const rolle: Schritt['rolle'] = x.rolle === 'optional' || x.rolle === 'foerder' ? x.rolle : 'pflicht'
      const titel = s(x.titel) || 'Schritt'
      const id = neueSchrittId()
      const afb = ['I', 'II', 'III'].includes(x.afb) ? x.afb : ''
      const phase = PHASEN.find((p) => p.id === x.phase)?.name ?? ''
      schritte.push({
        id,
        titel,
        lernziele: [...new Set(x.lernziele ?? [])].map((i) => ziele[i]).filter((l): l is Lernziel => Boolean(l)),
        rolle,
        erfolg: standardErfolg(art, artVon(r)),
        inhalt: leererInhalt(art),
        abschnitt: name,
        stunde: Math.min(n - 1, Math.max(0, Math.round(Number(x.stunde) || 1) - 1)),
        ...(Number(x.minuten) > 0 ? { minuten: Math.min(90, Math.round(Number(x.minuten))) } : {}),
        platzhalter: { beschreibung: s(x.beschreibung) || titel, begruendung: [afb && `AFB ${afb}`, s(x.begruendung)].filter(Boolean).join(' · ') || undefined }
      })
      bezuege[id] = [...new Set((x.buch ?? []).filter(gueltig))]
      einordnung[id] = { phase, afb }
    }
  }
  const gestrichen = (d?.gestrichen ?? [])
    .filter((g) => gueltig(g.abschnitt))
    .map((g) => ({ abschnitt: g.abschnitt, begruendung: s(g.begruendung) }))
    .filter((g, i, alle) => alle.findIndex((x) => x.abschnitt === g.abschnitt) === i)
  return { teile, schritte, hinweis: s(d?.hinweis), materialEingesetzt: 0, lernziele: neueZiele, gestrichen, bezuege, einordnung }
}

export async function planeAusBuch(e: BuchPlanEingabe, ki: Ki): Promise<BuchPlan> {
  const d = await ki<BuchPlanRoh>(buchPlanAnfrage(e))
  const plan = buchPlanUebernehmen(d, e.reihe, e.buch, e.stunden)
  if (!plan.schritte.length) throw new Error('Die KI hat keine Schritte geplant – bitte noch einmal versuchen.')
  return plan
}

// ---------------------------------------------------------------- Übernahme je Abschnitt

/** verweisen (Standard) – abschreiben (Transkription) – Bildausschnitt aus dem Scan */
export type Uebernahme = 'verweis' | 'text' | 'bild'

/** Kurzer Verweis für Lernende: „Buch S. 39, VT1" */
export const buchVerweis = (a: Pick<SchulbuchAbschnitt, 'seite' | 'kennung'>): string => `Buch S. ${a.seite || '?'}, ${a.kennung}`

const alsSchulbuch = (buch: BuchErkennung, abschnitte: SchulbuchAbschnitt[]): Schulbuch => ({ titel: buch.titel, verlag: buch.verlag, seiten: '', abschnitte })

/**
 * Schritte mit den Wahlen je Abschnitt fertigstellen: Die KI bekommt je Schritt, was sie verweisen soll und was
 * wörtlich übernommen ist; Abschriften und Bildausschnitte kommen mit Quellenangabe ins Material.
 */
export function schritteMitUebernahme(
  plan: Pick<BuchPlan, 'schritte' | 'bezuege'>,
  buch: BuchErkennung,
  wahl: Record<number, Uebernahme>,
  ausschnitte: Record<number, string>,
  fach = ''
): Schritt[] {
  return plan.schritte.map((x) => {
    const nummern = plan.bezuege[x.id] ?? []
    if (!nummern.length || !x.platzhalter) return x
    const abschnitte = nummern.map((i) => ({ ...buch.abschnitte[i], wahl: wahl[i] === 'text' ? ('text' as const) : ('verweis' as const) }))
    const sb = alsSchulbuch(buch, abschnitte)
    const uebernahme: BuchUebernahme[] = nummern.flatMap((i): BuchUebernahme[] => {
      const a = buch.abschnitte[i]
      const quelle = quelleVon(sb, a)
      if (wahl[i] === 'text') return [{ kennung: a.kennung, quelle, text: a.text }]
      if (wahl[i] === 'bild' && ausschnitte[i]) return [{ kennung: a.kennung, quelle, bild: ausschnitte[i] }]
      return []
    })
    const bilder = uebernahme.filter((u) => u.bild)
    // Verweise, die die Beschreibung noch nicht nennt, hängen kurz an („Buch S. 39, VT1")
    const verweise = nummern
      .filter((i) => wahl[i] !== 'text')
      .map((i) => buch.abschnitte[i])
      .filter((a) => !(x.platzhalter!.beschreibung.includes(a.kennung) && (!a.seite || x.platzhalter!.beschreibung.includes(a.seite))))
      .map(buchVerweis)
    const buchText = [
      schulbuchText(sb, fach),
      bilder.length ? `BILDAUSSCHNITTE (stehen als Bild im Material, mit Quelle): ${bilder.map((b) => `${b.kennung} (${b.quelle})`).join('; ')}` : '',
      'Formuliere eigene Aufgaben; den Wortlaut des Buchs nur dort verwenden, wo er oben ausdrücklich zur Übernahme steht.'
    ]
      .filter(Boolean)
      .join('\n\n')
    const beschreibung = verweise.length ? `${x.platzhalter.beschreibung} (${verweise.join('; ')})` : x.platzhalter.beschreibung
    return { ...x, platzhalter: { ...x.platzhalter, beschreibung, buch: buchText, ...(uebernahme.length ? { uebernahme } : {}) } }
  })
}

// ---------------------------------------------------------------- Seitenzähler (Gesamtvertrag § 4)

/** Kurzer Hinweis (Recherche Abschnitt 4, Vorschlag Hinweistext) – sachlich, keine Rechtsberatung */
export const GESAMTVERTRAG_KURZ =
  'Schulbuchseiten dürfen nach dem Gesamtvertrag „Vervielfältigungen an Schulen" (Länder/VG WORT/Bildungsmedienverlage, gültig bis 31.12.2027) für den eigenen Unterricht gescannt und den eigenen Lernenden zugänglich gemacht werden – insgesamt höchstens 15 % des Buches, nie mehr als 20 Seiten je Buch, Schuljahr und Klasse; nur Bücher ab 2005; nur im geschützten Bereich der Klasse; ohne Änderungen des Originals; mit Quellenangabe; das Buch darf nicht ersetzt werden. Die App zählt mit, ersetzt aber keine Rechtsberatung.'

export const SEITEN_GRENZE = 20

/** Schuljahr ab 1. August: „2026/27" */
export function schuljahrVon(d = new Date()): string {
  const j = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1
  return `${j}/${String((j + 1) % 100).padStart(2, '0')}`
}

export const zaehlerSchluessel = (lerngruppe: string, buch: string, schuljahr: string): string =>
  [lerngruppe, buch, schuljahr].map((x) => x.trim().toLowerCase().replace(/\s+/g, ' ')).join('|')

/** Seiten, aus denen etwas vervielfältigt wird (Abschrift oder Bildausschnitt) – Verweise zählen nicht */
export function vervielfaeltigteSeiten(buch: BuchErkennung, wahl: Record<number, Uebernahme>): string[] {
  return [
    ...new Set(
      Object.entries(wahl)
        .filter(([, w]) => w === 'text' || w === 'bild')
        .map(([i]) => buch.abschnitte[Number(i)])
        .filter(Boolean)
        .map((a) => a.seite || `Bild ${a.seitenIndex + 1}`)
    )
  ]
}

export function zaehlerStand(bisher: string[], neu: string[]): { seiten: string[]; anzahl: number; warnung: boolean; ueber: boolean } {
  const seiten = [...new Set([...bisher, ...neu])]
  return { seiten, anzahl: seiten.length, warnung: seiten.length >= SEITEN_GRENZE, ueber: seiten.length > SEITEN_GRENZE }
}

const ZAEHLER_KEY = 'reihe-schulbuch-seitenzaehler'

/** Gezählte Seiten je Lerngruppe + Buch + Schuljahr (auf diesem Gerät) */
export function ladeZaehler(): Record<string, string[]> {
  try {
    const d = JSON.parse(localStorage.getItem(ZAEHLER_KEY) ?? '{}') as unknown
    return d && typeof d === 'object' ? (d as Record<string, string[]>) : {}
  } catch {
    return {}
  }
}

export function merkeZaehler(schluessel: string, seiten: string[]): void {
  try {
    localStorage.setItem(ZAEHLER_KEY, JSON.stringify({ ...ladeZaehler(), [schluessel]: seiten }))
  } catch {
    /* ohne lokalen Speicher zählt die App nur für diese Sitzung */
  }
}
