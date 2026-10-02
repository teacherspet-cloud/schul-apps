/**
 * Namensschutz vor jeder KI (02.10.2026) – Bedingung der Lehrkraft: „Klarnamen von Lehrkräften
 * und Schülern etc. dürfen nie an eine KI übergeben werden. Fiktive Namen sind in Ordnung."
 *
 * Auf dem Server gehen ALLE Anfragen an KI und Sprachausgabe durch diese eine Stelle (start.ts
 * umhüllt die Kanäle). Bekannt sind dem Server die echten Menschen der Schule: jedes Konto
 * (Lehrkräfte, Schülerinnen und Schüler, die sich angemeldet haben) mit Vor- und Nachnamen und
 * Benutzernamen, dazu Namen aus den Einstellungen des Nutzers (Briefkopf).
 *
 *  - KI-Text (ai:structured, ai:websuche, ai:image): Jeder Treffer wird durch einen Platzhalter
 *    „[Person-3]" ersetzt – je Anfrage stabil, damit die KI Bezüge behält. In der Antwort setzt
 *    der Server die Klarnamen wieder ein: Die Lehrkraft sieht alles in Klarnamen.
 *  - Sprachausgabe (audio:speak): nicht ersetzen (die Aufnahme klänge falsch), sondern SPERREN mit
 *    einer verständlichen Meldung – im Hörtext gehört ein erfundener Name hin.
 *  - Danach wird nachgeprüft: Bleibt ein Treffer übrig, geht die Anfrage nicht hinaus.
 *
 * Erkannt werden (Faustregel der App): voller Name in beiden Reihenfolgen, „Herr/Frau/Hr./Fr."
 * + Nachname, Initiale + Nachname, Benutzername, sowie der Nachname allein – außer bei
 * Nachnamen, die zugleich gewöhnliche Wörter sind (Koch, Weber, Bauer …): Die würden sonst in
 * jedem Sachtext ersetzt. Vornamen allein erkennt der Server nicht (fiktive Namen in Hörtexten
 * sind ausdrücklich erlaubt); für Schülerarbeiten ersetzt die Rückmeldung sie schon vorher
 * (shared/pseudonymisierung.ts). Namen in BILDERN (Fotos von Arbeiten) kann der Filter nicht sehen.
 */
import type { StructuredRequest, TtsRequest } from '@shared/types'

export interface Person {
  vorname: string
  nachname: string
  benutzer?: string
}

/** Nachnamen, die zugleich gewöhnliche Wörter sind – allein stehend NICHT ersetzt */
const GEWOEHNLICHE_WOERTER = new Set(
  (
    'koch weber bauer kaiser wolf fuchs vogel fischer schmidt schneider meyer meier maier mayer müller becker hoffmann schäfer schulz richter klein ' +
    'neumann schwarz zimmermann braun krüger hofmann hartmann lange werner krause lehmann köhler herrmann könig walter peters möller ' +
    'jung hahn schubert vogt friedrich keller günther frank berger winkler roth beck lorenz baumann franke albrecht schuster simon ' +
    'ludwig böhm winter kraus martin schumacher krämer vogt stein jäger otto sommer groß seidel heinrich brandt haas schreiber ' +
    'graf schulte dietrich ziegler kuhn kühn pohl engel horn busch bergmann thomas voigt sauer arnold wolff pfeiffer hammer ' +
    'licht wagner berg brunner bach sonne mond blume himmel stern adler falke hirsch löwe bär rose lamm hase strauss strauß ' +
    'park glas eisen gold silber kupfer acker feld wald hain brück brücke burg dorf hof kirch mann frau kind alt neu ' +
    'english french young brown green white black smith miller baker cook taylor turner hunter king wood hill bird fox wolf ' +
    'paris london berlin hamburg rom'
  ).split(/\s+/)
)

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Grenzen für Wörter mit Umlauten (\b kennt nur ASCII) */
const VOR = '(?<![\\p{L}\\p{N}])'
const NACH = '(?![\\p{L}\\p{N}])'

export interface Muster {
  /** Platzhalter-Gruppe: gleiche Person → gleicher Platzhalter */
  person: number
  re: RegExp
}

/** Erkennungsmuster für eine Liste von Personen (längste zuerst) */
export function musterFuer(personen: Person[]): Muster[] {
  const out: { person: number; quelle: string; laenge: number }[] = []
  personen.forEach((p, i) => {
    const vn = p.vorname.trim()
    const nn = p.nachname.trim()
    const varianten: string[] = []
    if (vn && nn) {
      varianten.push(`${esc(vn)}\\s+${esc(nn)}`, `${esc(nn)},\\s*${esc(vn)}`, `${esc(vn[0])}\\.\\s*${esc(nn)}`)
    }
    if (nn && nn.length >= 3) {
      varianten.push(`(?:Herrn?|Frau|Hr\\.|Fr\\.|Mr\\.?|Mrs\\.?|Ms\\.?|Monsieur|Madame|Señora?)\\s+${esc(nn)}`)
      if (!GEWOEHNLICHE_WOERTER.has(nn.toLowerCase()) && nn.length >= 4) varianten.push(esc(nn))
    }
    if (p.benutzer && p.benutzer.length >= 4) varianten.push(esc(p.benutzer))
    for (const v of varianten) out.push({ person: i, quelle: v, laenge: v.length })
  })
  return out
    .sort((a, b) => b.laenge - a.laenge)
    .map((m) => ({ person: m.person, re: new RegExp(`${VOR}${m.quelle}${NACH}`, 'giu') }))
}

/** Aus einem Anzeigenamen Vor- und Nachname („Max Mustermann", „Mustermann, Max") */
export function personAus(name: string, benutzer?: string): Person | null {
  const n = name.replace(/\s+/g, ' ').trim()
  if (!n) return benutzer ? { vorname: '', nachname: '', benutzer } : null
  if (n.includes(',')) {
    const [nach, vor] = n.split(',').map((x) => x.trim())
    return { vorname: vor ?? '', nachname: nach ?? '', benutzer }
  }
  const teile = n.split(' ')
  if (teile.length === 1) return { vorname: '', nachname: teile[0], benutzer }
  return { vorname: teile.slice(0, -1).join(' '), nachname: teile[teile.length - 1], benutzer }
}

export interface Ersetzung {
  /** Platzhalter → Klarname (zum Wiedereinsetzen) */
  zuordnung: Map<string, string>
  anzahl: number
}

/** Treffer in einem Text durch Platzhalter ersetzen; `zuordnung` gilt über alle Texte einer Anfrage */
export function ersetzeIn(text: string, muster: Muster[], z: Ersetzung, nummer: Map<number, string>): string {
  let out = text
  for (const m of muster) {
    out = out.replace(m.re, (treffer) => {
      let platz = nummer.get(m.person)
      if (!platz) {
        platz = `[Person-${nummer.size + 1}]`
        nummer.set(m.person, platz)
      }
      if (!z.zuordnung.has(platz)) z.zuordnung.set(platz, treffer)
      z.anzahl++
      return platz
    })
  }
  return out
}

export const enthaeltNamen = (text: string, muster: Muster[]): boolean =>
  muster.some((m) => {
    m.re.lastIndex = 0
    const ja = m.re.test(text)
    m.re.lastIndex = 0
    return ja
  })

/** Welche Namen (für die Meldung an die Lehrkraft – sie sieht ihre eigenen Daten) */
export function gefundeneNamen(text: string, muster: Muster[]): string[] {
  const out = new Set<string>()
  for (const m of muster) for (const t of text.matchAll(m.re)) out.add(t[0])
  return [...out]
}

/** Platzhalter in der Antwort (auch ohne Klammern) wieder durch die Klarnamen ersetzen */
export function stelleWiederHer<T>(wert: T, z: Ersetzung): T {
  if (!z.zuordnung.size) return wert
  const ersetze = (s: string): string =>
    s.replace(/\[?Person-(\d+)\]?/g, (treffer, nr: string) => z.zuordnung.get(`[Person-${nr}]`) ?? treffer)
  const geh = (v: unknown): unknown => {
    if (typeof v === 'string') return ersetze(v)
    if (Array.isArray(v)) return v.map(geh)
    if (v && typeof v === 'object' && !(v instanceof Uint8Array)) {
      const o: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = geh(x)
      return o
    }
    return v
  }
  return geh(wert) as T
}

export class NamensSperre extends Error {
  constructor(meldung: string) {
    super(meldung)
    this.name = 'NamensSperre'
  }
}

const HINWEIS_PLATZHALTER =
  'Hinweis zum Datenschutz: Echte Namen wurden durch Platzhalter wie [Person-1] ersetzt. Verwende diese Platzhalter unverändert, wo die Person gemeint ist, und erfinde keine Namen für sie.'

/** Eine KI-Anfrage schützen: Text ersetzen, nachprüfen; liefert die neue Anfrage und die Zuordnung */
export function schuetzeAnfrage(req: StructuredRequest, muster: Muster[]): { req: StructuredRequest; z: Ersetzung } {
  const z: Ersetzung = { zuordnung: new Map(), anzahl: 0 }
  const nummer = new Map<number, string>()
  const system = ersetzeIn(req.system ?? '', muster, z, nummer)
  const user = ersetzeIn(req.user ?? '', muster, z, nummer)
  if (enthaeltNamen(system, muster) || enthaeltNamen(user, muster)) throw new NamensSperre('Die Anfrage enthält noch einen echten Namen und wurde nicht gesendet.')
  return { req: { ...req, system: z.anzahl ? `${system}\n\n${HINWEIS_PLATZHALTER}` : system, user }, z }
}

/** Freitext (Websuche, Bildauftrag) schützen */
export function schuetzeText(text: string, muster: Muster[]): { text: string; z: Ersetzung } {
  const z: Ersetzung = { zuordnung: new Map(), anzahl: 0 }
  const neu = ersetzeIn(text, muster, z, new Map())
  if (enthaeltNamen(neu, muster)) throw new NamensSperre('Die Anfrage enthält noch einen echten Namen und wurde nicht gesendet.')
  return { text: neu, z }
}

/** Sprachausgabe: echte Namen sperren statt ersetzen */
export function pruefeHoertext(req: TtsRequest, muster: Muster[]): void {
  const text = req.turns.map((t) => t.text).join('\n')
  const namen = gefundeneNamen(text, muster)
  if (namen.length)
    throw new NamensSperre(
      `Der Hörtext enthält den Namen einer echten Person (${namen.slice(0, 3).join(', ')}). Echte Namen gehen nie an einen Sprachdienst – bitte im Skript durch einen erfundenen Namen ersetzen.`
    )
}
