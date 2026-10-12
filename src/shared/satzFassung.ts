/**
 * Geschlechtsbezogene Beispielsätze (12.10.2026, Wunsch der Lehrkraft): Legt ein Beispielsatz die sprechende Person
 * geschlechtlich fest („My name is Tom.", „I'm a boy.", „My wife …", „Je suis contente."), klingt er mit der anderen
 * Stimme falsch. Für diese Stimme entsteht eine minimal angepasste Fassung samt Übersetzung („My name is Emma.").
 *
 * - Vorfilter per Regeln (kostenlos): Ich-Form UND ein Name bzw. Geschlechtswort (in den romanischen Sprachen auch
 *   „je suis/soy/sono …", wo das Adjektiv angeglichen wird). Nur diese Kandidaten gehen an die KI.
 * - Die KI entscheidet und passt an – EIN gebündelter strukturierter Aufruf je Liste (medienAuftrag.ts).
 * - Namen: zuerst die Figuren des Lehrwerks (Eigennamen aus den Beispielsätzen), sonst gängige Namen der Sprache.
 * - Gespeichert in der Medienbank am Eintrag des Wortes (`fassungen`, Schlüssel = satzSchluessel des Originals); auch
 *   „keine Anpassung nötig" wird gemerkt (ohne `lage`), damit die KI nicht erneut gefragt wird.
 * - Lernende sehen und hören die Fassung ihrer Stimme; Tests und Arbeitsblätter behalten das Original (sie lesen die
 *   Liste, nicht die Medienbank).
 */
import type { StructuredRequest } from './types'
import { istGanzerSatz, satzSchluessel, type Stimmlage } from './medienbank'

export interface SatzFassung {
  /** Wortlaut des Originals (zur Anzeige und Kontrolle) */
  original: string
  /** Für welche Stimme die angepasste Fassung gilt – fehlt = geprüft, keine Anpassung nötig */
  lage?: Stimmlage
  text?: string
  uebersetzung?: string
  /** Von der KI vorgeschlagen oder von Hand eingetragen */
  von: 'ki' | 'hand'
  zeit: number
}

/** Was Lernende bekommen: nur der passende Text (der Server löst die Stimme auf) */
export type SatzFassungSicht = Pick<SatzFassung, 'text' | 'uebersetzung'> & Partial<Pick<SatzFassung, 'original' | 'lage' | 'von' | 'zeit'>>

/** Ich-Form je Sprache */
const ICH: Record<string, RegExp> = {
  en: /\b(I|I'm|I've|I'd|I'll)\b|\b(my|me|myself|mine)\b/i,
  fr: /\b(je|moi|mon|ma|mes)\b|\bj'|\bm'appelle/i,
  es: /\b(yo|mi|mis|soy|estoy|me llamo)\b/i,
  it: /\b(io|mio|mia|miei|mie|sono|mi chiamo)\b/i,
  de: /\b(ich|mein|meine|meiner|meinen|mich|mir)\b/i,
  nl: /\b(ik|mijn|mij)\b/i
}

/** Geschlechtswörter bzw. Wendungen, die das Geschlecht der sprechenden Person festlegen können */
const GESCHLECHT: Record<string, RegExp> = {
  en: /\b(boy|girl|man|woman|brother|sister|son|daughter|husband|wife|boyfriend|girlfriend|king|queen|prince|princess|actor|actress|waiter|waitress|uncle|aunt|nephew|niece|grandson|granddaughter|lady|gentleman|guy|bride|groom|mr|mrs|ms|miss|himself|herself|policeman|policewoman|sportsman|sportswoman)\b/i,
  fr: /\b(garçon|fille|frère|sœur|soeur|fils|mari|femme|copain|copine|homme|ami|amie|oncle|tante|neveu|nièce|roi|reine|je suis|suis né|suis née)\b/i,
  es: /\b(chico|chica|niño|niña|hermano|hermana|hijo|hija|marido|esposo|esposa|mujer|novio|novia|hombre|amigo|amiga|tío|tía|soy|estoy)\b/i,
  it: /\b(ragazzo|ragazza|fratello|sorella|figlio|figlia|marito|moglie|fidanzato|fidanzata|uomo|donna|amico|amica|zio|zia|sono)\b/i,
  de: /\b(junge|mädchen|bruder|schwester|sohn|tochter|ehemann|ehefrau|mann|frau|freund|freundin|onkel|tante)\b|\bich bin (ein|eine|der|die)\b/i,
  nl: /\b(jongen|meisje|broer|zus|zoon|dochter|man|vrouw|vriend|vriendin)\b/i
}

/** „Ich heiße X" in allen Sprachen – die Wendung in beliebiger Schreibung, danach ein großgeschriebenes Wort */
const NAME_WENDUNG =
  /\b(my name is|my name's|i'm|i am|call me|je m'appelle|moi,? c'est|je suis|me llamo|soy|mi chiamo|sono|ich heiße|ich bin|mein name ist|ik heet|ik ben)\s+(\S+)/giu
const nameGesagt = (s: string): boolean => [...s.matchAll(NAME_WENDUNG)].some((m) => /^\p{Lu}\p{Ll}+/u.test(m[2]))

const sprachKurz = (s: string): string =>
  String(s ?? '')
    .toLowerCase()
    .split(/[-_]/)[0]

/** Günstiger Vorfilter: Kann dieser Satz die sprechende Person geschlechtlich festlegen? */
export function istFassungsKandidat(satz: string | undefined, sprache: string): boolean {
  const s = String(satz ?? '').trim()
  const sp = sprachKurz(sprache)
  if (!istGanzerSatz(s) || !ICH[sp]) return false
  if (!ICH[sp].test(s)) return false
  return nameGesagt(s) || GESCHLECHT[sp].test(s)
}

/** Häufige großgeschriebene Wörter, die keine Figuren sind (Wochentage, Monate, Länder, Anrede …) */
const KEIN_NAME = new Set(
  (
    'I Mr Mrs Ms Miss Dr Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December ' +
    'English England Britain British London Scotland Wales Ireland America American USA UK Germany German Berlin France French Paris Spain Spanish Madrid Italy Italian Rome ' +
    'Christmas Easter Halloween God OK TV Internet Europe European Africa Asia Australia Canada New York Lundi Mardi Mercredi Jeudi Vendredi Samedi Dimanche Madame Monsieur ' +
    'Mademoiselle Señor Señora Signora Signor Herr Frau Unit Text Station'
  )
    .toLowerCase()
    .split(/\s+/)
)

/**
 * Figuren des Lehrwerks schätzen (im Repo gibt es keine Figurenliste der Lehrwerke): Eigennamen aus den Beispielsätzen –
 * großgeschrieben mitten im Satz, kein Satzanfang, keine bekannten Nicht-Namen. Häufigste zuerst.
 */
export function figurenAus(saetze: (string | undefined)[], max = 24): string[] {
  const zahl = new Map<string, number>()
  for (const satz of saetze) {
    const s = String(satz ?? '')
    // Wörter nach Satzanfang bzw. nach . ! ? : nicht zählen
    const teile = s.split(/(?<=[.!?:;"“„])\s+/)
    for (const t of teile) {
      const woerter = t.match(/[\p{L}'’-]+/gu) ?? []
      woerter.slice(1).forEach((w) => {
        const name = w.replace(/['’]s$/u, '')
        if (!/^\p{Lu}\p{Ll}{1,14}$/u.test(name) || KEIN_NAME.has(name.toLowerCase())) return
        zahl.set(name, (zahl.get(name) ?? 0) + 1)
      })
    }
  }
  return [...zahl.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([n]) => n)
}

/** Gängige Namen als Rückfall (Kinder/Jugendliche der Zielkultur, bewusst vielfältig) */
export const NAMEN_RUECKFALL: Record<string, { w: string[]; m: string[] }> = {
  en: { w: ['Emma', 'Olivia', 'Amelia', 'Lily', 'Grace', 'Priya', 'Chloe'], m: ['Tom', 'Jack', 'Oliver', 'Harry', 'Leo', 'Ravi', 'Sam'] },
  fr: { w: ['Léa', 'Chloé', 'Manon', 'Inès', 'Camille', 'Jade'], m: ['Lucas', 'Hugo', 'Louis', 'Nathan', 'Karim', 'Théo'] },
  es: { w: ['Lucía', 'Sofía', 'María', 'Paula', 'Carmen', 'Elena'], m: ['Pablo', 'Hugo', 'Daniel', 'Álvaro', 'Javier', 'Diego'] },
  it: { w: ['Giulia', 'Sofia', 'Aurora', 'Chiara', 'Martina'], m: ['Leonardo', 'Francesco', 'Lorenzo', 'Matteo', 'Luca'] },
  de: { w: ['Mia', 'Emma', 'Lena', 'Hannah', 'Leonie'], m: ['Ben', 'Paul', 'Leon', 'Finn', 'Jonas'] },
  nl: { w: ['Emma', 'Julia', 'Sanne', 'Lotte'], m: ['Daan', 'Sem', 'Lucas', 'Bram'] }
}

const SPRACHE: Record<string, string> = { en: 'Englisch', fr: 'Französisch', es: 'Spanisch', it: 'Italienisch', de: 'Deutsch', nl: 'Niederländisch' }

export interface FassungsKandidat {
  nr: number
  satz: string
  uebersetzung?: string
}

export interface FassungsAntwort {
  saetze: { nr: number; festgelegt: 'w' | 'm' | 'nein'; fassung: string; uebersetzung: string }[]
}

/** Strukturierter Auftrag an die KI – ein Aufruf für alle Kandidaten einer Liste */
export function fassungsAuftrag(sprache: string, kandidaten: FassungsKandidat[], figuren: string[]): StructuredRequest {
  const sp = sprachKurz(sprache)
  const rueck = NAMEN_RUECKFALL[sp] ?? NAMEN_RUECKFALL.en
  return {
    schemaName: 'vokabel_satzfassung',
    system: [
      `Du prüfst Beispielsätze einer Vokabelliste (${
        SPRACHE[sp] ?? sp
      }) für Lernende. Jeder Satz wird von einer weiblichen UND einer männlichen Stimme vorgelesen, als spräche die Stimme von sich selbst.`,
      'festgelegt: "w", wenn der Satz die SPRECHENDE Person (Ich-Form) eindeutig als weiblich festlegt (eigener Name, „I\'m a girl", „my husband", „je suis contente", „soy alta"); "m" entsprechend männlich; sonst "nein". Personen, über die nur gesprochen wird („my brother is tall"), legen die sprechende Person NICHT fest.',
      'Ist der Satz festgelegt, schreibe in "fassung" eine MINIMAL angepasste Fassung für das andere Geschlecht: nur Name, Geschlechtswort bzw. Angleichung ändern, alles andere (Vokabel, Satzbau, Satzzeichen) bleibt wörtlich gleich; die Vokabel des Satzes muss erhalten bleiben. "uebersetzung" ist die passend angepasste deutsche Übersetzung (wenn eine Übersetzung mitgegeben ist, ändere sie ebenso minimal; sonst übersetze).',
      figuren.length
        ? `Namen: Nimm bevorzugt eine Figur des Lehrwerks mit dem passenden Geschlecht – mögliche Figuren: ${figuren.join(
            ', '
          )} (nicht jede ist sicher ein Name). Passt keine, nimm einen gängigen Namen (weiblich: ${rueck.w.join(', ')}; männlich: ${rueck.m.join(', ')}).`
        : `Namen: Nimm einen gängigen Namen (weiblich: ${rueck.w.join(', ')}; männlich: ${rueck.m.join(', ')}).`,
      'Bei "nein": fassung und uebersetzung leer lassen. Antworte für JEDEN Satz mit seiner Nummer.'
    ].join('\n'),
    user: kandidaten.map((k) => `${k.nr}. ${k.satz}${k.uebersetzung ? `\n   Übersetzung: ${k.uebersetzung}` : ''}`).join('\n'),
    schema: {
      type: 'object',
      properties: {
        saetze: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nr: { type: 'integer' },
              festgelegt: { type: 'string', enum: ['w', 'm', 'nein'] },
              fassung: { type: 'string' },
              uebersetzung: { type: 'string' }
            },
            required: ['nr', 'festgelegt', 'fassung', 'uebersetzung'],
            additionalProperties: false
          }
        }
      },
      required: ['saetze'],
      additionalProperties: false
    }
  }
}

/**
 * Antwort der KI in Fassungen übersetzen. Schlüssel = satzSchluessel des Originals. Eine Fassung gilt für die Stimme des
 * ANDEREN Geschlechts. Unbrauchbare Antworten (leer, gleich dem Original, viel länger) gelten als „keine Anpassung" –
 * so bleibt das Original, statt einen falschen Satz vorzulesen. Fehlt ein Satz in der Antwort, bleibt er offen.
 */
export function fassungenAusAntwort(
  kandidaten: FassungsKandidat[],
  antwort: FassungsAntwort | null | undefined,
  jetzt = Date.now()
): Record<string, SatzFassung> {
  const aus: Record<string, SatzFassung> = {}
  const nachNr = new Map((antwort?.saetze ?? []).map((s) => [Math.round(Number(s?.nr)), s]))
  for (const k of kandidaten) {
    const a = nachNr.get(k.nr)
    if (!a) continue
    const basis: SatzFassung = { original: k.satz, von: 'ki', zeit: jetzt }
    const text = String(a.fassung ?? '').trim()
    const brauchbar =
      (a.festgelegt === 'w' || a.festgelegt === 'm') &&
      istGanzerSatz(text) &&
      satzSchluessel(text) !== satzSchluessel(k.satz) &&
      text.length <= k.satz.length * 1.6 + 12
    aus[satzSchluessel(k.satz)] = brauchbar
      ? {
          ...basis,
          lage: a.festgelegt === 'w' ? 'm' : 'w',
          text: text.slice(0, 600),
          ...(String(a.uebersetzung ?? '').trim() ? { uebersetzung: String(a.uebersetzung).trim().slice(0, 600) } : {})
        }
      : basis
  }
  return aus
}

/** Text, den die Stimme `lage` zu diesem Beispielsatz spricht: die Fassung, wenn es eine für sie gibt, sonst das Original */
export function satzFuerLage(satz: string, fassungen: Record<string, SatzFassung | SatzFassungSicht> | undefined, lage: Stimmlage): string {
  const f = fassungen?.[satzSchluessel(satz)]
  return f && (f as SatzFassung).lage === lage && f.text?.trim() ? f.text : satz
}

/** Eine Fassung aus fremder Hand bereinigen (Kanal medien:fassung-setzen) – null = löschen */
export function fassungBereinigt(f: unknown, original: string): SatzFassung | null {
  if (!f || typeof f !== 'object') return null
  const x = f as Record<string, unknown>
  const lage: Stimmlage | undefined = x.lage === 'w' || x.lage === 'm' ? x.lage : undefined
  const text = typeof x.text === 'string' ? x.text.trim().slice(0, 600) : ''
  const uebersetzung = typeof x.uebersetzung === 'string' ? x.uebersetzung.trim().slice(0, 600) : ''
  return {
    original: String(original ?? '').slice(0, 600),
    ...(lage && text ? { lage, text, ...(uebersetzung ? { uebersetzung } : {}) } : {}),
    von: x.von === 'hand' ? 'hand' : 'ki',
    zeit: Date.now()
  }
}
