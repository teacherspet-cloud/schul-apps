/**
 * Änderungswunsch an einen einzelnen Baustein – Überarbeiten (Zauberstab) und Neu erzeugen (Kreis).
 *
 * Wunsch der Lehrkraft (30.09.2026): Am Kreis zum Neugenerieren soll ein Änderungswunsch mit
 * angegeben werden können. Entscheidung dazu (Auswahl der Lehrkraft):
 * - In JEDEM Programm mit Bausteinen stehen rechts am Baustein ein Zauberstab „Überarbeiten"
 *   (der vorhandene Baustein bleibt erkennbar) und der Kreis „Neu erzeugen" (ganz neuer
 *   Entwurf). Beide teilen dasselbe Wunschfeld und dieselben Vorschläge.
 * - Unter dem Feld stehen Vorschläge aus ZWEI Quellen: sofort die Regelvorschläge dieser Datei
 *   (kostenlos, ohne Warten) und dazu 4–6 Vorschläge der KI für genau diesen Baustein, die
 *   angehängt werden, sobald sie da sind (je Baustein und Inhalt nur einmal erfragt).
 * - Ein Klick auf einen Vorschlag fügt ihn ins Feld ein; weitere Klicks hängen an.
 *
 * Diese Datei ist ohne Oberfläche und ohne KI prüfbar (tests/kiWunsch.test.ts).
 */
import type { StructuredRequest } from '@shared/types'

export type WunschArt = 'ueberarbeiten' | 'neu'

/** Was über Baustein und Lerngruppe bekannt ist – jedes Programm füllt, was es hat. */
export interface WunschKontext {
  /** Bausteintyp: 'task', 'text', 'infoBox' … – im Vokabeltest 'vokabel' */
  typ: string
  /** Lesbare Bezeichnung des Bausteins, z. B. „Aufgabe" oder „Lückentext" */
  typLabel?: string
  /** „Arbeitsblatt", „Klassenarbeit", „Lernzielkontrolle", „Grammatiktest", „Vokabeltest" */
  material?: string
  fachId?: string
  fachLabel?: string
  klasse?: number
  /** Name des Bundeslandes */
  bundesland?: string
  schulform?: string
  /** GER-Stufe oder Kursniveau */
  niveau?: string
  thema?: string
  lernziel?: string
  /** Inhalt des Bausteins als Klartext (Aufgabenstellung, Text, Kasten …) */
  inhalt: string
  /** Anforderungsbereich einer Aufgabe (1–3) */
  afb?: number
  /** Antwortform einer Aufgabe ('lines', 'multipleChoice' …) */
  antwortArt?: string
  /** Hat die Aufgabe Teilaufgaben? */
  teilaufgaben?: number
}

const FREMDSPRACHE = /englisch|franz|spanisch|latein|italien|russisch|niederl|tuerk|türk|polnisch|chinesisch|griechisch|japan|portug|daz/i
const MATHE_NAWI = /mathe|physik|chemie|informatik|technik/i
const GESELLSCHAFT = /geschichte|politik|sozial|gesellschaft|wirtschaft|erdkunde|geograf|geograph/i

export const istFremdsprache = (fachId = ''): boolean => FREMDSPRACHE.test(fachId)

/** Höchstens so viele Regelvorschläge – mehr liest niemand, bevor er schreibt */
export const MAX_REGELVORSCHLAEGE = 8
/** So viele Vorschläge soll die KI liefern (angehängt an die Regelvorschläge) */
export const KI_VORSCHLAEGE = { min: 4, max: 6 }

const kurz = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/**
 * Regelvorschläge für diesen Baustein – sofort da, ohne KI.
 *
 * Reihenfolge: zuerst, was zum Bausteintyp und zur konkreten Aufgabe passt, dann Fach,
 * Jahrgang, Schulform und Niveau, zuletzt Thema/Lernziel. Die Texte sind Wünsche als
 * Nominalgruppen („Einfachere Sprache"), keine Aufforderungen.
 */
export function regelVorschlaege(k: WunschKontext): string[] {
  const v: string[] = []
  const fach = `${k.fachId ?? ''} ${k.fachLabel ?? ''}`
  const sprache = istFremdsprache(fach)
  const klasse = k.klasse ?? 0
  const text = k.inhalt.toLowerCase()

  // --- Bausteintyp und konkrete Aufgabe
  switch (k.typ) {
    case 'task':
      if (k.afb === 1) v.push('Anspruchsvoller (AFB II)')
      else if (k.afb === 3) v.push('Leichterer Einstieg (AFB I)')
      else v.push('Anspruchsvoller (AFB III)')
      if (!k.teilaufgaben) v.push('Kleinschrittiger mit Teilaufgaben')
      else v.push('Weniger Teilaufgaben')
      v.push('Mehr Differenzierung (★/★★/★★★)')
      if (k.antwortArt === 'lines' || k.antwortArt === 'space') v.push('Satzanfänge als Hilfe')
      if (k.antwortArt === 'multipleChoice' || k.antwortArt === 'trueFalse') v.push('Überzeugendere Ablenker')
      if (k.antwortArt === 'gapText') v.push('Lücken nur bei Fachbegriffen')
      v.push('Offenere Aufgabenstellung')
      if (!/material|m\d|text|quelle|abbildung|tabelle/.test(text)) v.push('Bezug auf das Material')
      break
    case 'text':
      v.push('Kürzerer Text', 'Fachbegriffe erklärt', 'Mehr Absätze und Zwischenüberschriften')
      if (GESELLSCHAFT.test(fach)) v.push('Originalquelle statt Darstellung')
      break
    case 'infoBox':
      v.push('Kürzer und prägnanter', 'Mit Beispiel', 'Merksatz zum Auswendiglernen')
      break
    case 'image':
      v.push('Anderes Motiv', 'Schlichtere Darstellung')
      if (GESELLSCHAFT.test(fach)) v.push('Historische Bildquelle statt Zeichnung')
      break
    case 'table':
      v.push('Weniger Spalten', 'Beispielzeile vorgegeben')
      break
    case 'scaffold':
      v.push('Gestufte Hilfen', 'Mehr Satzanfänge')
      break
    case 'phrases':
      v.push('Weniger, dafür gezieltere Wendungen', 'Wendungen für die Meinungsäußerung')
      break
    case 'learningGoals':
      v.push('Lernziele als „Ich kann …"-Sätze', 'Weniger, dafür überprüfbare Lernziele')
      break
    case 'selfCheck':
      v.push('Aussagen näher an den Aufgaben')
      break
    case 'vokabel':
      v.push('Mehr Kontextsätze', 'Schwierigere Ablenker', 'Anfangsbuchstaben als Hilfe', 'Andere Satzbeispiele')
      break
  }

  // --- Allgemein
  v.push('Einfachere Sprache', 'Bezug zum Alltag der Klasse')

  // --- Fach
  if (sprache) {
    if (k.typ !== 'vokabel') v.push('Nur Wortschatz der Klassenstufe')
    if (klasse && klasse <= 6) v.push('Mehr Bildunterstützung')
  } else if (MATHE_NAWI.test(fach)) {
    if (k.typ === 'task') v.push('Rechenweg und Einheiten verlangt')
    v.push('Zahlen aus dem Alltag')
  } else if (GESELLSCHAFT.test(fach)) {
    if (k.typ === 'task') v.push('Mit Quellenbezug (Standortgebundenheit)')
  } else if (/deutsch/i.test(fach) && k.typ === 'task') v.push('Mit Textbeleg (Zeilenangabe)')

  // --- Jahrgang, Schulform, Niveau, Land
  if (klasse && klasse <= 6) v.push('Kindgerechter formuliert')
  if (klasse >= 11 && k.typ === 'task') v.push(`Operatoren wie im Abitur${k.bundesland ? ` (${k.bundesland})` : ''}`)
  if (/förder|foerder|haupt|lernen/i.test(k.schulform ?? '')) v.push('Leichte Sprache')
  if (k.niveau && sprache) v.push(`Genau auf Niveau ${k.niveau}`)

  // --- Thema und Lernziel
  const ziel = (k.lernziel ?? '').split('\n').map((s) => s.trim()).find(Boolean)
  if (ziel) v.push(`Engerer Bezug zum Lernziel „${kurz(ziel, 40)}"`)
  else if (k.thema?.trim()) v.push(`Engerer Bezug zum Thema „${kurz(k.thema.trim(), 40)}"`)

  return [...new Set(v)].slice(0, MAX_REGELVORSCHLAEGE)
}

/** Einen Vorschlag ins Wunschfeld einfügen: leer = ersetzen, sonst anhängen (doppelt nie). */
export function fuegeVorschlagEin(text: string, vorschlag: string): string {
  const t = text.trim()
  if (!t) return vorschlag
  if (t.split(/,\s*/).includes(vorschlag)) return t
  return `${t.replace(/[,;]\s*$/, '')}, ${vorschlag}`
}

/** Kurze, stabile Prüfsumme (FNV-1a) – Schlüssel des Vorschlagsspeichers. */
export function inhaltsSchluessel(blockId: string, inhalt: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < inhalt.length; i++) {
    h ^= inhalt.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${blockId}:${(h >>> 0).toString(36)}`
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['vorschlaege'],
  properties: {
    vorschlaege: {
      type: 'array',
      description: `${KI_VORSCHLAEGE.min} bis ${KI_VORSCHLAEGE.max} kurze Änderungswünsche`,
      items: { type: 'string' }
    }
  }
}

/** Die Anfrage an die KI: 4–6 Änderungswünsche, die genau zu diesem Baustein passen. */
export function kiVorschlagAnfrage(k: WunschKontext, schon: string[] = []): StructuredRequest {
  const lerngruppe = [
    k.fachLabel || k.fachId,
    k.klasse ? `Klasse ${k.klasse}` : '',
    k.schulform,
    k.niveau ? `Niveau ${k.niveau}` : '',
    k.bundesland
  ]
    .filter(Boolean)
    .join(', ')
  return {
    system:
      'Du unterstützt eine Lehrkraft beim Überarbeiten von Unterrichtsmaterial. Du schlägst kurze, konkrete Änderungswünsche für einen einzelnen Baustein vor – fachlich und didaktisch begründet, passend zu Lerngruppe, Land und Lernziel.',
    user: [
      `Material: ${k.material || 'Arbeitsblatt'}.`,
      lerngruppe ? `Lerngruppe: ${lerngruppe}.` : '',
      k.thema ? `Thema: ${k.thema}.` : '',
      k.lernziel ? `Lernziel(e): ${k.lernziel}.` : '',
      `Baustein: ${k.typLabel || k.typ}${k.afb ? `, AFB ${k.afb}` : ''}.`,
      `Inhalt des Bausteins:\n${kurz(k.inhalt, 2500)}`,
      schon.length ? `Diese Vorschläge stehen schon da – nicht wiederholen: ${schon.join('; ')}` : '',
      [
        `Nenne ${KI_VORSCHLAEGE.min} bis ${KI_VORSCHLAEGE.max} Änderungswünsche, die GENAU zu diesem Baustein passen (nicht allgemein).`,
        'Jeder Wunsch höchstens 60 Zeichen, auf Deutsch, als Nominalgruppe oder Wunsch formuliert (z. B. „Mehr Bezug auf M2", „Zweite Teilaufgabe mit Transfer").',
        'Keine Anrede (kein du/Sie), kein Imperativ am Anfang, kein Satzzeichen am Ende.'
      ].join(' ')
    ]
      .filter(Boolean)
      .join('\n\n'),
    schemaName: 'baustein_wunsch_vorschlaege',
    schema: SCHEMA
  }
}

/** Antwort der KI säubern: Texte kürzen, Doppeltes und schon Vorhandenes streichen. */
export function kiVorschlaegeAus(antwort: unknown, schon: string[] = []): string[] {
  const roh = (antwort as { vorschlaege?: unknown } | null)?.vorschlaege
  if (!Array.isArray(roh)) return []
  const bekannt = new Set(schon.map((s) => s.toLowerCase()))
  const aus: string[] = []
  for (const r of roh) {
    if (typeof r !== 'string') continue
    const s = kurz(r.replace(/\s+/g, ' ').replace(/[.!]+$/, '').trim(), 70)
    if (!s || bekannt.has(s.toLowerCase())) continue
    bekannt.add(s.toLowerCase())
    aus.push(s)
  }
  return aus.slice(0, KI_VORSCHLAEGE.max)
}

/**
 * Der Auftrag an die KI für Überarbeiten bzw. Neu erzeugen – für alle Programme gleich.
 *
 * Überarbeiten: Der vorhandene Baustein bleibt erkennbar; ohne Wunsch wird er didaktisch
 * verbessert. Neu erzeugen: gleicher Typ und Zweck, aber ein eigener neuer Entwurf.
 */
export function wunschAuftrag(art: WunschArt, wunsch: string, nummer?: number): string {
  const welcher = nummer ? `Baustein (${nummer})` : 'den Baustein'
  const w = wunsch.trim()
  if (art === 'neu')
    return [
      `Erzeuge ${welcher} komplett NEU: gleicher Typ, gleicher Zweck und dieselbe Stelle im Material, aber ein eigenständiger neuer Entwurf – nicht bloß umformuliert.`,
      w ? `Wunsch der Lehrkraft für den neuen Entwurf (genau umsetzen): ${w}` : ''
    ]
      .filter(Boolean)
      .join('\n')
  return [
    `Überarbeite ${welcher}. Es bleibt eine Überarbeitung des VORHANDENEN Bausteins: Inhalt, Typ und Zweck bleiben erkennbar.`,
    w
      ? `Änderungswunsch der Lehrkraft für diesen Baustein (genau umsetzen, alles andere möglichst beibehalten): ${w}`
      : 'Verbessere ihn didaktisch und sprachlich.'
  ].join('\n')
}
