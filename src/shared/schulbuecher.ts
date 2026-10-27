/**
 * Schulbücher und Fächer der Schule (27.10.2026, abgestimmt mit der Lehrkraft).
 *
 * Bis dahin gab es keine Liste „Fächer dieser Schule“ und Schulbücher nur als Lehrwerksdateien der Sprachen (Vokabeln,
 * resources/lehrwerke). Jetzt führt die Verwaltung (Schule & Daten › Fächer) einen schulweiten Bücherkatalog:
 *  - Fächer: vorbelegt aus Lerngruppen, IServ-Fachschaften, eigenen Fächern der Lehrkräfte und Fachobleuten; der Admin
 *    hakt Fächer aus dem Katalog (shared/faecher.ts) hinzu oder ab. Eigene Fächer außerhalb des Katalogs bleiben Freitext
 *    an den Lerngruppen.
 *  - Bücher: je Fach beliebig viele; ein Buch kann mehreren Fächern gehören (NaWi/Biologie). Felder: Reihe, Band, Titel,
 *    Verlag, Ausgabe, Landesausgabe, Jahrgänge, Schulformen, ISBN, Bild-Adresse, Kapitel, Verknüpfung zur Lehrwerksdatei
 *    (Vokabeln bleiben in der App „Vokabellisten“).
 *  - Rechte: Admins alles; Fachobleute die Bücher ihres Fachs („Mein Fach“). Die Fächerliste nur Admins.
 *  - Bilder: keine Uploads (Urheberrecht, Entscheidung 09.10.2026). Cover aus der ISBN (Cornelsen nach Muster, Klett über
 *    die Tabelle in lehrwerkCover.ts) oder eine eigene Adresse – nur von Verlags-Hosts (`BILD_HOSTS`, auch in der CSP).
 * Gespeichert am Server in server_einstellungen ('schulbuecher', 'schulfaecher'; server/schulbuecher.ts), ohne Personenbezug.
 */
import { FAECHER, fachAusName, fachVon } from './faecher'
import { COVER_AUSGABEN } from './lehrwerkCover'

export interface Schulbuch {
  id: string
  /** Fachkennungen (mindestens eine) */
  faecher: string[]
  /** Reihe („Green Line“) – oder leer bei einem Einzelband mit Titel */
  reihe: string
  /** Band („1“, „Transition“) */
  band: string
  /** Volltitel, wenn er von „Reihe Band“ abweicht („Geschichte und Geschehen 2“) */
  titel: string
  verlag: string
  /** „ab 2021“ */
  ausgabe: string
  /** Landesausgabe („Niedersachsen“, „Bundesausgabe“) */
  edition: string
  /** Klassenstufen 1–13 */
  jahrgaenge: number[]
  /** Schulform-Kennungen (shared/schulformen.ts), leer = alle */
  schulformen: string[]
  /** ISBN-13 oder ISBN-10, wie eingegeben (mit Strichen) */
  isbn: string
  /** Bild-Adresse (nur BILD_HOSTS) – leer: Cover aus der ISBN bzw. der Tabelle */
  bild: string
  /** Kapitel/Units in Buchreihenfolge (optional) */
  kapitel: string[]
  /** Lehrwerksdatei mit Vokabeln (resources/lehrwerke bzw. gemeinsame Fassung) */
  lehrwerkId?: string
  geaendert?: { von: string; am: string }
}

/** Die Fächer der Schule – gespeichert, sobald der Admin die Vorbelegung bestätigt oder ändert */
export interface SchulFaecher {
  liste: string[]
  stand?: string
}

/** Verlags-Hosts, von denen Buchbilder angezeigt werden (Oberfläche und CSP, server/sicherheitsKoepfe.ts) */
export const BILD_HOSTS = [
  'assets.klett.de',
  'www.klett.de',
  'static.cornelsen.de',
  'www.cornelsen.de',
  'www.westermann.de',
  'www.ccbuchner.de',
  'www.schoeningh-schulbuch.de',
  'www.hueber.de',
  'www.duden.de',
  'www.cbuchner.de',
  'www.mildenberger-verlag.de',
  'www.vandenhoeck-ruprecht-verlage.com'
]

/** Erlaubte Bild-Adresse: https und ein bekannter Verlags-Host */
export function bildUrlErlaubt(url: string): boolean {
  try {
    const u = new URL(url.trim())
    return u.protocol === 'https:' && BILD_HOSTS.includes(u.hostname.toLowerCase())
  } catch {
    return false
  }
}

/** Nur Ziffern (und X bei ISBN-10) */
export const isbnKern = (s: string): string => s.replace(/[^0-9Xx]/g, '').toUpperCase()

/** ISBN-13 (Prüfziffer) oder ISBN-10 (Prüfziffer mod 11) */
export function isbnGueltig(s: string): boolean {
  const k = isbnKern(s)
  if (k.length === 13 && /^\d{13}$/.test(k)) {
    const summe = [...k.slice(0, 12)].reduce((n, z, i) => n + Number(z) * (i % 2 ? 3 : 1), 0)
    return (10 - (summe % 10)) % 10 === Number(k[12])
  }
  if (k.length === 10 && /^\d{9}[\dX]$/.test(k)) {
    const summe = [...k.slice(0, 9)].reduce((n, z, i) => n + Number(z) * (10 - i), 0)
    const pruef = (11 - (summe % 11)) % 11
    return (pruef === 10 ? 'X' : String(pruef)) === k[9]
  }
  return false
}

/** ISBN-10 → ISBN-13 (978-Präfix), ISBN-13 unverändert, sonst leer */
export function isbn13(s: string): string {
  const k = isbnKern(s)
  if (k.length === 13) return k
  if (k.length !== 10) return ''
  const basis = `978${k.slice(0, 9)}`
  const summe = [...basis].reduce((n, z, i) => n + Number(z) * (i % 2 ? 3 : 1), 0)
  return `${basis}${(10 - (summe % 10)) % 10}`
}

/** Anzeigename: „Green Line 6“, „Green Line Transition“ oder der Titel */
export function buchName(b: Pick<Schulbuch, 'reihe' | 'band' | 'titel'>): string {
  const rb = `${b.reihe} ${b.band}`.trim()
  return rb || b.titel.trim() || 'Schulbuch'
}

/**
 * Cover-Adresse aus der ISBN: Cornelsen nach festem Muster, Klett über die bekannten Ausgaben (lehrwerkCover.ts, dort
 * stehen die Pfade je ISBN). Andere Verlage: keine – die Lehrkraft trägt eine Bild-Adresse ein.
 */
export function coverVonIsbn(isbn: string, verlag: string): string {
  const k = isbn13(isbn)
  if (!k) return ''
  const bekannt = COVER_AUSGABEN.find((a) => isbnKern(a.isbn) === k)
  if (bekannt) return bekannt.url
  if (/cornelsen/i.test(verlag)) return `https://static.cornelsen.de/media/${k}/${k}_COVER_STD_B110_X2.png`
  return ''
}

/** Bild eines Buchs: eigene Adresse (nur erlaubte Hosts), sonst aus der ISBN */
export function buchBild(b: Pick<Schulbuch, 'bild' | 'isbn' | 'verlag'>): string {
  if (b.bild && bildUrlErlaubt(b.bild)) return b.bild.trim()
  return coverVonIsbn(b.isbn, b.verlag)
}

const text = (x: unknown, n: number): string =>
  String(x ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n)
const liste = (x: unknown, n: number, laenge: number): string[] =>
  Array.isArray(x) ? [...new Set(x.map((s) => text(s, laenge)).filter(Boolean))].slice(0, n) : []

export const KENNUNG = /^[A-Za-z0-9_-]{2,64}$/

/** Ein Buch aus Eingabe oder Speicher prüfen; null, wenn nichts Brauchbares (kein Fach oder kein Name) */
export function schulbuchBereinigt(roh: unknown): Schulbuch | null {
  if (!roh || typeof roh !== 'object') return null
  const r = roh as Record<string, unknown>
  const id = typeof r.id === 'string' && KENNUNG.test(r.id) ? r.id : ''
  const faecher = liste(r.faecher, 6, 40).filter((f) => Boolean(fachVon(f)))
  const b: Schulbuch = {
    id,
    faecher,
    reihe: text(r.reihe, 80),
    band: text(r.band, 40),
    titel: text(r.titel, 160),
    verlag: text(r.verlag, 60),
    ausgabe: text(r.ausgabe, 40),
    edition: text(r.edition, 60),
    jahrgaenge: Array.isArray(r.jahrgaenge)
      ? [...new Set(r.jahrgaenge.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 13))].sort((a, c) => a - c)
      : [],
    schulformen: liste(r.schulformen, 12, 40),
    isbn: text(r.isbn, 20),
    bild: text(r.bild, 400),
    kapitel: liste(r.kapitel, 60, 120),
    ...(typeof r.lehrwerkId === 'string' && /^[A-Za-z0-9_-]{2,80}$/.test(r.lehrwerkId) ? { lehrwerkId: r.lehrwerkId } : {})
  }
  if (b.bild && !bildUrlErlaubt(b.bild)) b.bild = ''
  if (!b.faecher.length || !buchName(b).trim() || buchName(b) === 'Schulbuch') return null
  const g = r.geaendert as { von?: unknown; am?: unknown } | undefined
  if (g && typeof g.von === 'string' && typeof g.am === 'string') b.geaendert = { von: text(g.von, 80), am: g.am }
  return b
}

export function buecherBereinigt(roh: unknown): Schulbuch[] {
  if (!Array.isArray(roh)) return []
  const aus: Schulbuch[] = []
  const ids = new Set<string>()
  for (const x of roh) {
    const b = schulbuchBereinigt(x)
    if (!b || !b.id || ids.has(b.id)) continue
    ids.add(b.id)
    aus.push(b)
  }
  return aus
}

/** Fächerliste prüfen: nur Katalogfächer, eindeutig, in Katalogreihenfolge */
export function faecherBereinigt(roh: unknown): string[] {
  const ids = new Set(Array.isArray(roh) ? roh.filter((f): f is string => typeof f === 'string' && Boolean(fachVon(f))) : [])
  return FAECHER.filter((f) => ids.has(f.id)).map((f) => f.id)
}

/**
 * Fächer der Schule ableiten: Lerngruppen (Freitext → Katalogfach), IServ-Fachschaften, eigene Fächer der Lehrkräfte,
 * Fachobleute und die Fächer der Katalogbücher. Freitext ohne Katalogfach fällt weg (bleibt an der Lerngruppe stehen).
 */
export function faecherAbgeleitet(quellen: { lerngruppen: string[]; iserv: string[]; eigene: string[]; obleute: string[]; buecher?: string[] }): string[] {
  const ids = new Set<string>()
  for (const f of [...quellen.lerngruppen, ...quellen.iserv]) {
    const x = fachVon(f) ?? fachAusName(f)
    if (x) ids.add(x.id)
  }
  // Fächer der Katalogbücher (27.10.2026): wer Lehrwerksdateien für Englisch hat, unterrichtet Englisch – so ist ein neuer Server nicht leer
  for (const f of [...quellen.eigene, ...quellen.obleute, ...(quellen.buecher ?? [])]) if (fachVon(f)) ids.add(f)
  return faecherBereinigt([...ids])
}

/** Was ein Lehrwerk (Vokabeldatei) über sich sagt – Grundlage für den ersten Katalog und „Aus Lehrwerk übernehmen“ */
export interface LehrwerkKurz {
  id: string
  name: string
  language: string
  grade?: number
  publisher?: string
  edition?: string
  reihe?: string
  ausgabe?: string
  band?: string
  schoolTypeId?: string
  platzhalter?: boolean
  entryCount?: number
}

/** Fach einer Sprache (en → englisch, de → deutsch) – wie shared/fachobleute.ts, ohne dessen Abhängigkeiten */
export const fachDerLehrwerkSprache = (sprache: string): string | undefined =>
  sprache === 'de' ? 'deutsch' : FAECHER.find((f) => f.sprache === sprache || f.uebersetzungssprache === sprache)?.id

/** Ein Lehrwerk als Buch des Katalogs (Kennung „lw-<Lehrwerk>“, damit es nur einmal entsteht) */
export function buchAusLehrwerk(l: LehrwerkKurz): Schulbuch | null {
  const fach = fachDerLehrwerkSprache(l.language)
  if (!fach) return null
  const reihe = (l.reihe ?? '').trim()
  const band = (l.band ?? '').trim()
  const isbn =
    COVER_AUSGABEN.find((a) => a.reihe === reihe && a.band === band && (!l.ausgabe || a.ausgabe.includes(l.ausgabe.replace(/^ab\s*/i, ''))))?.isbn ?? ''
  return schulbuchBereinigt({
    id: `lw-${l.id}`.slice(0, 64),
    faecher: [fach],
    reihe,
    band,
    titel: reihe ? '' : l.name,
    verlag: l.publisher ?? '',
    ausgabe: l.ausgabe ?? '',
    edition: l.edition ?? '',
    jahrgaenge: l.grade ? [l.grade] : [],
    schulformen: l.schoolTypeId ? [l.schoolTypeId] : [],
    isbn,
    bild: '',
    kapitel: [],
    lehrwerkId: l.id
  })
}

/** Bücher eines Fachs, sortiert nach Reihe, dann Band (Zahlen natürlich), dann Titel */
export function buecherDesFachs(buecher: readonly Schulbuch[], fach: string): Schulbuch[] {
  const c = new Intl.Collator('de', { numeric: true })
  return buecher
    .filter((b) => b.faecher.includes(fach))
    .sort((a, b) => c.compare(a.reihe, b.reihe) || c.compare(a.band, b.band) || c.compare(buchName(a), buchName(b)))
}
