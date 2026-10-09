/**
 * „Meine Bücher" und „Alphabetisch" im Fachordner der Lernenden (09.10.2026, Wunsch der Lehrkraft) – ersetzen das
 * Register „Wortliste":
 *  - Meine Bücher: ein Bücherbord mit den Bänden des Lehrwerks, die die Person bis jetzt gehabt haben sollte – alle
 *    früheren Bände ihrer Reihe VOLLSTÄNDIG, dazu der aktuelle Band nur mit den FREIGEGEBENEN Abschnitten
 *    (Entscheidung der Lehrkraft). Wörter aus Kursen ohne Lehrwerk stehen als eigenes Fach „Weitere Wörter" daneben.
 *    Die Gruppen „Vokabelweg …" gibt es hier nicht mehr.
 *  - Alphabetisch: alle Wörter aus „Meine Bücher" nach dem fremdsprachigen Wort – ohne „to ", Artikel und Akzente
 *    sortiert, gleiche Wörter (gleiche Bedeutung) in einer Zeile mit allen Fundstellen („GL 2 · U3").
 * Rein rechnend: Der Server (server/wortliste.ts) reicht Bände, Abschnitte und Lernstände herein; Tests:
 * tests/meineBuecher.test.ts.
 */
import { suchform, type WortlisteGruppe, type WortlisteWort, type WortStatus } from './wortliste'

/** Ein Band auf dem Bücherbord */
export interface MeinBuch {
  id: string
  name: string
  reihe?: string
  band?: string
  ausgabe?: string
  stateId?: string
  grade?: number
  /** Aktueller Band: nur die freigegebenen Abschnitte; frühere Bände vollständig */
  aktuell: boolean
  /** Kurzname für Fundstellen („GL 2") */
  kurz: string
  /** Abschnitte in Buchreihenfolge */
  gruppen: WortlisteGruppe[]
}

// ---------------------------------------------------------------- Bände wählen

export interface BandAngabe {
  id: string
  band?: string
  grade?: number
}

/** Stelle eines Bands in der Reihe: Klassenstufe, sonst Bandnummer (Band 1 ≈ Klasse 5), Wortbände („Transition") ans Ende */
export function bandRang(b: Pick<BandAngabe, 'band' | 'grade'>): number {
  if (typeof b.grade === 'number' && Number.isFinite(b.grade)) return b.grade
  const n = parseFloat(String(b.band ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n + 4 : 99
}

/**
 * Welche Bände aufs Bord gehören. `aktuell`: der höchste Band, aus dem die Person etwas freigegeben bekam (ohne: der
 * Band ihrer Klassenstufe `jahrgang`, aber ohne freigegebene Abschnitte bleibt er weg). Früher: alle Bände der Reihe
 * davor – ohne bekannten aktuellen Band die unterhalb der Klassenstufe.
 */
export function baendeWahl(baende: BandAngabe[], aktuell: string | null | undefined, jahrgang?: number | null): { frueher: string[]; aktuell: string | null } {
  const sortiert = [...baende].sort((a, b) => bandRang(a) - bandRang(b))
  const akt = (aktuell && baende.find((b) => b.id === aktuell)) || null
  if (akt) return { frueher: sortiert.filter((b) => b.id !== akt.id && bandRang(b) < bandRang(akt)).map((b) => b.id), aktuell: akt.id }
  if (jahrgang) return { frueher: sortiert.filter((b) => typeof b.grade === 'number' && b.grade < jahrgang).map((b) => b.id), aktuell: null }
  return { frueher: [], aktuell: null }
}

// ---------------------------------------------------------------- Kurzformen für Fundstellen

/** „Green Line" + „2" → „GL 2"; „Transition" → „GL T"; ohne Reihe die Anfangsbuchstaben des Namens */
export function buchKurz(b: { name: string; reihe?: string; band?: string }): string {
  const reihe = (b.reihe || b.name.replace(/\s*\d+\s*$/, '')).trim()
  const worte = reihe.split(/[\s-]+/).filter(Boolean)
  const kuerzel = worte.length > 1 ? worte.map((w) => w[0].toUpperCase()).join('') : reihe.slice(0, 3)
  const band = (b.band ?? '').trim()
  if (!band) return kuerzel || b.name
  return `${kuerzel} ${/^\d+$/.test(band) ? band : band[0].toUpperCase()}`
}

/** „Unit 3" → „U3", „Topic 1" → „T1", „Across cultures 2" → „AC2", „Welcome back" → „WB", kurze Namen bleiben */
export function unitKurz(unit: string): string {
  const u = unit.trim()
  const m = /^(.*?)\s*(\d+)\s*$/.exec(u)
  if (m && m[1]) return m[1].split(/[\s-]+/).filter(Boolean).map((w) => w[0].toUpperCase()).join('') + m[2]
  if (u.length <= 9) return u
  return u
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('')
}

// ---------------------------------------------------------------- Alphabetisch

/** Artikel und Verbmarken am Anfang, je Sprache (nur wenn danach noch etwas kommt) */
const VORNE: Record<string, RegExp> = {
  en: /^(?:\(?to\)?|the|an?)\s+/,
  fr: /^(?:l'|(?:le|la|les|un|une|des|se)\s+|s')/,
  es: /^(?:el|la|los|las|un|una|unos|unas)\s+/,
  it: /^(?:l'|un'|(?:il|lo|la|i|gli|le|un|uno|una)\s+)/,
  pt: /^(?:o|a|os|as|um|uma)\s+/,
  nl: /^(?:de|het|een)\s+/,
  de: /^(?:der|die|das|ein|eine)\s+/,
  da: /^(?:at|en|et)\s+/
}

/**
 * Sortierform eines Wortes: klein, ohne Akzente (suchform), ohne Artikel bzw. „to " am Anfang, ohne Klammern und
 * Zeichen davor („(the) UK" → „uk", „…" → Wort). Leer bleibt nie: Ohne Rest gilt das ganze Wort.
 */
export function sortierform(term: string, sprache = ''): string {
  let s = suchform(term)
    .replace(/[’`´]/g, "'")
    .replace(/^[\s.,;:!?¡¿"„“”'«»()[\]…–-]+/, '')
  const muster = VORNE[sprache.toLowerCase()]
  for (let i = 0; muster && i < 2; i++) {
    const rest = s.replace(muster, '').replace(/^[\s"„“”'«»()[\]…–-]+/, '')
    if (!rest || rest === s) break
    s = rest
  }
  return s || suchform(term)
}

/** Buchstabe für die Sprungleiste: A–Z (auch Ä → A), andere Schriften ihr Großbuchstabe, Ziffern und Zeichen „#" */
export function anfangsbuchstabe(sortiert: string): string {
  const c = [...sortiert][0] ?? ''
  if (/[a-z]/.test(c)) return c.toUpperCase()
  if (/\p{L}/u.test(c)) return c.toLocaleUpperCase()
  return '#'
}

export interface AbcEintrag {
  w: WortlisteWort
  /** Fundstelle („GL 2 · U3") */
  quelle: string
}

export interface AbcZeile {
  key: string
  term: string
  translation: string
  pos?: string
  example?: string
  exampleTranslation?: string
  /** bester Stand über alle Fundstellen */
  status: WortStatus
  quellen: string[]
  sort: string
  buchstabe: string
}

const RANG: Record<WortStatus, number> = { neu: 0, aufbau: 1, sicher: 2 }

/**
 * Alle Wörter alphabetisch: gleiches Wort mit gleicher Bedeutung (ohne Rücksicht auf Groß/klein und Akzente) wird EINE
 * Zeile mit allen Fundstellen; der Stand ist der beste. Gleiches Wort mit anderer Bedeutung bleibt eine eigene Zeile.
 * Zeichen und Ziffern („#") kommen zuerst, dann A–Z, dann andere Schriften.
 */
export function alphabetisch(eintraege: AbcEintrag[], sprache = ''): AbcZeile[] {
  const nach = new Map<string, AbcZeile>()
  for (const { w, quelle } of eintraege) {
    const key = `${suchform(w.term)}\u0001${suchform(w.translation)}`
    const z = nach.get(key)
    if (z) {
      if (quelle && !z.quellen.includes(quelle)) z.quellen.push(quelle)
      if (RANG[w.status] > RANG[z.status]) z.status = w.status
      if (!z.example && w.example) Object.assign(z, { example: w.example, exampleTranslation: w.exampleTranslation })
      if (!z.pos && w.pos) z.pos = w.pos
      continue
    }
    const sort = sortierform(w.term, sprache)
    nach.set(key, {
      key,
      term: w.term,
      translation: w.translation,
      ...(w.pos ? { pos: w.pos } : {}),
      ...(w.example ? { example: w.example } : {}),
      ...(w.exampleTranslation ? { exampleTranslation: w.exampleTranslation } : {}),
      status: w.status,
      quellen: quelle ? [quelle] : [],
      sort,
      buchstabe: anfangsbuchstabe(sort)
    })
  }
  const vergleich = new Intl.Collator(sprache || 'en', { sensitivity: 'base', numeric: true })
  const gruppe = (b: string): number => (b === '#' ? 0 : /^[A-Z]$/.test(b) ? 1 : 2)
  return [...nach.values()].sort(
    (a, b) =>
      gruppe(a.buchstabe) - gruppe(b.buchstabe) ||
      vergleich.compare(a.sort, b.sort) ||
      vergleich.compare(a.term, b.term) ||
      vergleich.compare(a.translation, b.translation)
  )
}

/** Einträge der Bücher (und weiterer Gruppen) für die alphabetische Liste – mit Fundstelle je Wort */
export function abcEintraege(buecher: MeinBuch[], weitere: WortlisteGruppe[], weitereName: string): AbcEintrag[] {
  const aus: AbcEintrag[] = []
  for (const b of buecher)
    for (const g of b.gruppen) {
      const unit = unitKurz(g.titel.split(' · ')[0] ?? g.titel)
      for (const w of g.woerter) aus.push({ w, quelle: `${b.kurz} · ${unit}` })
    }
  for (const g of weitere) for (const w of g.woerter) aus.push({ w, quelle: weitereName })
  return aus
}

/** Liste mit Buchstaben-Überschriften: Kopf je Buchstabe, darunter seine Zeilen (für das Fenster-Zeichnen) */
export type AbcPosten = { art: 'kopf'; buchstabe: string; anzahl: number } | { art: 'zeile'; z: AbcZeile }
export function mitKoepfen(zeilen: AbcZeile[]): AbcPosten[] {
  const aus: AbcPosten[] = []
  let kopf: Extract<AbcPosten, { art: 'kopf' }> | null = null
  for (const z of zeilen) {
    if (!kopf || kopf.buchstabe !== z.buchstabe) {
      kopf = { art: 'kopf', buchstabe: z.buchstabe, anzahl: 0 }
      aus.push(kopf)
    }
    kopf.anzahl++
    aus.push({ art: 'zeile', z })
  }
  return aus
}

/**
 * Sichtbarer Ausschnitt einer Liste mit festen Höhen je Posten: `oben` = Anfang je Posten (aufsteigend, Länge n + 1 mit
 * der Gesamthöhe am Ende). Liefert die Posten von `von` bis ausschließlich `bis` mit `rand` Pixeln Vorrat.
 */
export function fenster(oben: number[], sichtVon: number, sichtBis: number, rand = 400): { von: number; bis: number } {
  const n = oben.length - 1
  if (n <= 0) return { von: 0, bis: 0 }
  const suche = (y: number): number => {
    let lo = 0
    let hi = n - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (oben[mid] <= y) lo = mid
      else hi = mid - 1
    }
    return lo
  }
  const von = suche(Math.max(0, sichtVon - rand))
  const bis = Math.min(n, suche(Math.max(0, sichtBis + rand)) + 1)
  return { von, bis: Math.max(von, bis) }
}
