/**
 * Schulkalender (10.10.2026, abgestimmt mit der Lehrkraft; Recherche recherche/schulkalender.md).
 *
 * Der Server holt für das Bundesland der Schule die Schulferien und gesetzlichen Feiertage (OpenHolidays API, Rückfall
 * ferien-api.de; src/server/schulkalender.ts) und gibt sie an Lehrkräfte und Lernende weiter. Hier stehen nur reine
 * Rechnungen auf diesen Daten – ohne Netz und Datenbank, damit Server, Oberfläche und Tests dieselben Regeln nutzen:
 *
 *  - Schultag = Montag bis Freitag, nicht in den Ferien, kein Feiertag. Nur landesweite Termine – schuleigene
 *    bewegliche Ferientage gibt es bewusst nicht (Entscheidung der Lehrkraft).
 *  - Schuljahr genau: Es beginnt am ersten Schultag nach den Sommerferien und reicht bis zum Tag vor dem ersten
 *    Schultag des nächsten Schuljahres. Die Sommerferien gehören damit noch zum alten Schuljahr – so passt es zu den
 *    Klassennamen, die erst am ersten Schultag hochgestuft werden (shared/schuljahrWechsel.ts). Ohne Daten (Exe am PC,
 *    Server ohne Abruf) gilt die alte Regel: Wechsel am 1. August.
 *  - Datumsvorschläge (Freischalten, Testtermin, Lernzeitraum) rücken aus Ferien und Feiertagen heraus: Beginn/Termin
 *    auf den ersten Schultag danach, ein Ende auf den letzten Schultag davor (`schultagVorschlag`).
 *
 * Die Daten werden einmal gesetzt (`setzeSchulkalender`) und gelten dann für alle Aufrufe ohne eigenen Datensatz.
 * Tage sind Texte „JJJJ-MM-TT" (deutsche Zeit); Zeitpunkte (ms) werden in deutscher Zeit auf ihren Tag abgebildet.
 */

export interface KalenderZeitraum {
  /** erster und letzter Tag (einschließlich), JJJJ-MM-TT */
  von: string
  bis: string
  name: string
}

export interface SchulkalenderDaten {
  /** Bundesland (Kürzel wie in shared/schulformen.ts, z. B. „NI") */
  land: string
  /** Woher die Daten stammen */
  quelle: 'openholidays' | 'ferien-api' | 'datei'
  /** Zeitpunkt des Abrufs (ISO) */
  abgerufen: string
  ferien: KalenderZeitraum[]
  feiertage: KalenderZeitraum[]
}

let aktiv: SchulkalenderDaten | null = null

/** Daten für alle folgenden Rechnungen setzen (null = keine Daten, alte Regeln) */
export function setzeSchulkalender(d: SchulkalenderDaten | null): void {
  aktiv = d && Array.isArray(d.ferien) && Array.isArray(d.feiertage) ? d : null
}
export const schulkalender = (): SchulkalenderDaten | null => aktiv

// ---------------------------------------------------------------- Tage

const TAG_RE = /^\d{4}-\d{2}-\d{2}$/
let FORMAT: Intl.DateTimeFormat | null = null

/** Tag „JJJJ-MM-TT" in deutscher Zeit (Zeitpunkt in ms, Date oder schon ein Tag) */
export function tagVon(x: number | Date | string): string {
  if (typeof x === 'string') {
    if (TAG_RE.test(x)) return x
    const t = Date.parse(x)
    return Number.isFinite(t) ? tagVon(t) : x.slice(0, 10)
  }
  FORMAT ??= new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })
  return FORMAT.format(typeof x === 'number' ? x : x.getTime())
}

/** Tag plus n Tage */
export const tagPlus = (tag: string, n: number): string => {
  const [j, m, t] = tag.split('-').map(Number)
  return new Date(Date.UTC(j, m - 1, t + n)).toISOString().slice(0, 10)
}

/** Wochentag: 1 = Montag … 7 = Sonntag */
export const wochentag = (tag: string): number => {
  const [j, m, t] = tag.split('-').map(Number)
  return ((new Date(Date.UTC(j, m - 1, t)).getUTCDay() + 6) % 7) + 1
}

export const istWochenende = (x: number | Date | string): boolean => wochentag(tagVon(x)) >= 6

/** Tag als Datum in Ortszeit (für Datumsfelder der Oberfläche) */
export const alsLokalesDatum = (tag: string, stunde = 0, minute = 0): Date => {
  const [j, m, t] = tag.split('-').map(Number)
  return new Date(j, m - 1, t, stunde, minute, 0, 0)
}

/** „12.10.2026" */
export const tagText = (tag: string, mitJahr = true): string => {
  const [j, m, t] = tag.split('-')
  return mitJahr ? `${Number(t)}.${Number(m)}.${j}` : `${Number(t)}.${Number(m)}.`
}

// ---------------------------------------------------------------- Nachschlagen

/** Kleiner Zwischenspeicher: Tag → Ferien/Feiertag (die Listen sind kurz, aber Serien prüfen Hunderte Tage) */
interface Karte {
  ferien: Map<string, KalenderZeitraum>
  feiertage: Map<string, KalenderZeitraum>
}
const merk = new WeakMap<SchulkalenderDaten, Karte>()
function karte(k: SchulkalenderDaten): Karte {
  const da = merk.get(k)
  if (da) return da
  const fuellen = (liste: KalenderZeitraum[]): Map<string, KalenderZeitraum> => {
    const m = new Map<string, KalenderZeitraum>()
    for (const z of liste) {
      if (!TAG_RE.test(z.von) || !TAG_RE.test(z.bis) || z.bis < z.von) continue
      for (let t = z.von, n = 0; t <= z.bis && n < 120; t = tagPlus(t, 1), n++) if (!m.has(t)) m.set(t, z)
    }
    return m
  }
  const neu = { ferien: fuellen(k.ferien), feiertage: fuellen(k.feiertage) }
  merk.set(k, neu)
  return neu
}

/** Ferien an diesem Tag (oder null) */
export function istFerien(x: number | Date | string, k: SchulkalenderDaten | null = aktiv): KalenderZeitraum | null {
  return k ? (karte(k).ferien.get(tagVon(x)) ?? null) : null
}

/** Gesetzlicher Feiertag an diesem Tag (oder null) */
export function istFeiertag(x: number | Date | string, k: SchulkalenderDaten | null = aktiv): KalenderZeitraum | null {
  return k ? (karte(k).feiertage.get(tagVon(x)) ?? null) : null
}

/** Unterrichtsfrei wegen Ferien oder Feiertag (Wochenenden zählen hier nicht) – Serien pausieren an solchen Tagen */
export const istFerienOderFeiertag = (x: number | Date | string, k: SchulkalenderDaten | null = aktiv): boolean =>
  Boolean(istFerien(x, k) || istFeiertag(x, k))

/**
 * Ferienzeit für Serien: Ferien- und Feiertage, dazu ein Wochenende direkt davor oder danach (OpenHolidays nennt z. B.
 * die Herbstferien Montag bis Samstag – das Wochenende davor gehört für Lernende trotzdem zu den Ferien).
 */
export function istFerienZeit(x: number | Date | string, k: SchulkalenderDaten | null = aktiv): boolean {
  const tag = tagVon(x)
  if (istFerienOderFeiertag(tag, k)) return true
  const w = wochentag(tag)
  if (w < 6) return false
  // Samstag/Sonntag: Freitag davor oder Montag danach frei?
  return istFerienOderFeiertag(tagPlus(tag, 5 - w), k) || istFerienOderFeiertag(tagPlus(tag, 8 - w), k)
}

/** Montag bis Freitag, keine Ferien, kein Feiertag (ohne Daten: Montag bis Freitag) */
export function istSchultag(x: number | Date | string, k: SchulkalenderDaten | null = aktiv): boolean {
  const tag = tagVon(x)
  return wochentag(tag) <= 5 && !istFerienOderFeiertag(tag, k)
}

/** Erster Schultag am oder nach diesem Tag */
export function naechsterSchultagAb(x: number | Date | string, k: SchulkalenderDaten | null = aktiv): string {
  let t = tagVon(x)
  for (let n = 0; n < 120 && !istSchultag(t, k); n++) t = tagPlus(t, 1)
  return t
}

/** Letzter Schultag am oder vor diesem Tag */
export function letzterSchultagBis(x: number | Date | string, k: SchulkalenderDaten | null = aktiv): string {
  let t = tagVon(x)
  for (let n = 0; n < 120 && !istSchultag(t, k); n++) t = tagPlus(t, -1)
  return t
}

// ---------------------------------------------------------------- Schuljahr

/** Sommerferien der Daten, nach Beginn sortiert (am Namen erkannt, sonst die längsten Ferien zwischen Juni und September) */
export function sommerferien(k: SchulkalenderDaten | null = aktiv): KalenderZeitraum[] {
  if (!k) return []
  const benannt = k.ferien.filter((z) => /sommer/i.test(z.name))
  const jahre = new Map<string, KalenderZeitraum>()
  const laenge = (z: KalenderZeitraum): number => Date.parse(`${z.bis}T00:00:00Z`) - Date.parse(`${z.von}T00:00:00Z`)
  for (const z of benannt.length ? benannt : k.ferien.filter((x) => /-0[6-9]-/.test(x.von) && laenge(x) >= 20 * 864e5)) {
    const j = z.von.slice(0, 4)
    const da = jahre.get(j)
    if (!da || laenge(z) > laenge(da)) jahre.set(j, z)
  }
  return [...jahre.values()].sort((a, b) => a.von.localeCompare(b.von))
}

/** Erster Schultag des Schuljahres, das im Sommer `schuljahr` beginnt (null ohne Daten zu diesen Sommerferien) */
export function ersterSchultag(schuljahr: number, k: SchulkalenderDaten | null = aktiv): string | null {
  const s = sommerferien(k).find((z) => z.von.startsWith(String(schuljahr)))
  return s ? naechsterSchultagAb(tagPlus(s.bis, 1), k) : null
}

/** Letzter Schultag des Schuljahres `schuljahr` – vor den Sommerferien des Folgejahres (null ohne Daten) */
export function letzterSchultag(schuljahr: number, k: SchulkalenderDaten | null = aktiv): string | null {
  const s = sommerferien(k).find((z) => z.von.startsWith(String(schuljahr + 1)))
  return s ? letzterSchultagBis(tagPlus(s.von, -1), k) : null
}

/** Alte Regel ohne Daten: Wechsel am 1. August */
export const schuljahrNachAugust = (tag: string): number => {
  const j = Number(tag.slice(0, 4))
  return Number(tag.slice(5, 7)) >= 8 ? j : j - 1
}

/**
 * Beginn-Jahr des Schuljahres an diesem Tag (2026 = Schuljahr 2026/27): ab dem ersten Schultag nach den Sommerferien.
 * Fehlen die Sommerferien des Kalenderjahres in den Daten, gilt der 1. August.
 */
export function schuljahrVon(x: number | Date | string = Date.now(), k: SchulkalenderDaten | null = aktiv): number {
  const tag = tagVon(x)
  const jahr = Number(tag.slice(0, 4))
  const erster = ersterSchultag(jahr, k)
  if (!erster) return schuljahrNachAugust(tag)
  return tag >= erster ? jahr : jahr - 1
}

/** „2026/27" (Trenner wählbar, z. B. „-" für Ordnernamen) */
export const schuljahrText = (beginn: number, trenner = '/'): string => `${beginn}${trenner}${String((beginn + 1) % 100).padStart(2, '0')}`

/** Erster und letzter Schultag eines Schuljahres (soweit bekannt) */
export function schuljahrGrenzen(schuljahr: number, k: SchulkalenderDaten | null = aktiv): { erster: string | null; letzter: string | null } {
  return { erster: ersterSchultag(schuljahr, k), letzter: letzterSchultag(schuljahr, k) }
}

// ---------------------------------------------------------------- Vorschläge und Hinweise

/**
 * Unterrichtstage einer Reihe: ab `beginn` an den Wochentagen `tage` (1 = Montag … 5 = Freitag) – nur Schultage, Ferien
 * und Feiertage werden übersprungen. Liefert `anzahl` Tage (eine Doppelstunde ist EIN Termin).
 */
export function unterrichtsTage(beginn: string, tage: number[], anzahl: number, k: SchulkalenderDaten | null = aktiv): string[] {
  const wahl = new Set(tage.filter((t) => t >= 1 && t <= 5))
  if (!TAG_RE.test(beginn) || !wahl.size || anzahl <= 0) return []
  const aus: string[] = []
  let t = beginn
  for (let n = 0; aus.length < anzahl && n < 800; n++, t = tagPlus(t, 1)) if (wahl.has(wochentag(t)) && istSchultag(t, k)) aus.push(t)
  return aus
}

/**
 * Datum für einen Vorschlag: liegt `tag` nicht an einem Schultag (Ferien, Feiertag, Wochenende), rückt ein Beginn bzw.
 * Termin (`'nach'`) auf den ersten Schultag danach, ein Ende (`'vor'`) auf den letzten Schultag davor.
 */
export function schultagVorschlag(x: number | Date | string, richtung: 'nach' | 'vor', k: SchulkalenderDaten | null = aktiv): string {
  return richtung === 'nach' ? naechsterSchultagAb(x, k) : letzterSchultagBis(x, k)
}

/** Ferien bzw. Feiertag an diesem Tag als Hinweis für die Oberfläche (null an Schultagen und Wochenenden ohne Ferien) */
export function kalenderHinweis(x: number | Date | string, k: SchulkalenderDaten | null = aktiv): { art: 'ferien' | 'feiertag'; text: string } | null {
  const tag = tagVon(x)
  const f = istFeiertag(tag, k)
  if (f) return { art: 'feiertag', text: `Der ${tagText(tag)} ist ein Feiertag (${f.name}).` }
  const z = istFerien(tag, k)
  if (z) return { art: 'ferien', text: `Der ${tagText(tag)} liegt in den ${z.name} (${tagText(z.von, false)}–${tagText(z.bis)}).` }
  return null
}

// ---------------------------------------------------------------- Gesetzliche Feiertage (Rückfall ohne Abruf)

/** Ostersonntag (Gaußsche Osterformel nach Meeus/Jones/Butcher) */
export function ostersonntag(jahr: number): string {
  const a = jahr % 19
  const b = Math.floor(jahr / 100)
  const c = jahr % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const kk = c % 4
  const l = (32 + 2 * e + 2 * i - h - kk) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const monat = Math.floor((h + l - 7 * m + 114) / 31)
  const tag = ((h + l - 7 * m + 114) % 31) + 1
  return `${jahr}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`
}

/**
 * Landesweite gesetzliche Feiertage eines Jahres (Stand 2026) – Rückfall, wenn eine Quelle nur Ferien liefert
 * (ferien-api.de). Nur landesweit geltende Tage; örtliche (Augsburger Friedensfest, Mariä Himmelfahrt in Teilen
 * Bayerns, Fronleichnam in Teilen Sachsens/Thüringens) fehlen bewusst.
 */
export function gesetzlicheFeiertage(land: string, jahr: number): KalenderZeitraum[] {
  const ostern = ostersonntag(jahr)
  const fest = (mmtt: string): string => `${jahr}-${mmtt}`
  const liste: [string, string, string[] | null][] = [
    [fest('01-01'), 'Neujahr', null],
    [fest('01-06'), 'Heilige Drei Könige', ['BW', 'BY', 'ST']],
    [fest('03-08'), 'Internationaler Frauentag', ['BE', 'MV']],
    [tagPlus(ostern, -2), 'Karfreitag', null],
    [tagPlus(ostern, 1), 'Ostermontag', null],
    [fest('05-01'), 'Tag der Arbeit', null],
    [tagPlus(ostern, 39), 'Christi Himmelfahrt', null],
    [tagPlus(ostern, 50), 'Pfingstmontag', null],
    [tagPlus(ostern, 60), 'Fronleichnam', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']],
    [fest('08-15'), 'Mariä Himmelfahrt', ['SL']],
    [fest('09-20'), 'Weltkindertag', ['TH']],
    [fest('10-03'), 'Tag der Deutschen Einheit', null],
    [fest('10-31'), 'Reformationstag', ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']],
    [fest('11-01'), 'Allerheiligen', ['BW', 'BY', 'NW', 'RP', 'SL']],
    // Buß- und Bettag: Mittwoch vor dem 23. November
    [tagPlus(fest('11-23'), -(((wochentag(fest('11-23')) - 3 + 7) % 7) || 7)), 'Buß- und Bettag', ['SN']],
    [fest('12-25'), '1. Weihnachtsfeiertag', null],
    [fest('12-26'), '2. Weihnachtsfeiertag', null]
  ]
  return liste.filter(([, , laender]) => !laender || laender.includes(land)).map(([tag, name]) => ({ von: tag, bis: tag, name }))
}
