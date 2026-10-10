/**
 * Schulkalender des Servers (10.10.2026, abgestimmt mit der Lehrkraft; Regeln in shared/schulkalender.ts, Quellen in
 * recherche/schulkalender.md).
 *
 *   GET  /server/schulkalender              Daten und Stand (alle Angemeldeten: Lehrkräfte, Admins, Lernende)
 *   POST /server/schulkalender/aktualisieren jetzt neu abrufen (nur Admin, mit x-schulapps-token)
 *   POST /server/schulkalender/testuhr      {heute} – nur mit SCHULAPPS_KALENDER_TESTUHR=1 (Browsertests): Tag setzen
 *                                           und den Schuljahreswechsel prüfen (schuljahrWechsel.ts)
 *
 * Abruf für das Bundesland der Schule (Verwaltung › Schule, server_einstellungen 'schule'; sonst das häufigste Land in
 * den Einstellungen der Lehrkräfte): Schulferien und gesetzliche Feiertage für das laufende und das nächste Schuljahr
 * (vom Juli des Vorjahres an 1095 Tage – mehr erlaubt die OpenHolidays API nicht). Quelle: OpenHolidays API, Rückfall
 * ferien-api.de (nur Ferien; die Feiertage rechnet dann shared/schulkalender.ts selbst). Wöchentlich und beim Start,
 * wenn der Stand älter als eine Woche ist oder das Land wechselte. Scheitert ein Abruf, bleiben die letzten guten Daten;
 * das Protokoll bekommt EINEN Eintrag je Fehlerserie.
 *
 * Ohne Netz für Tests: SCHULAPPS_KALENDER_DATEI = JSON-Datei, entweder fertige `SchulkalenderDaten` oder die rohen
 * Antworten der OpenHolidays API als { schulferien: [...], feiertage: [...] } (das Land kommt aus `land`, sonst „NI").
 */
import { readFileSync } from 'node:fs'
import {
  gesetzlicheFeiertage,
  setzeSchulkalender,
  schulkalender,
  sommerferien,
  schuljahrVon,
  tagPlus,
  tagVon,
  type KalenderZeitraum,
  type SchulkalenderDaten
} from '@shared/schulkalender'
import { LAENDER } from '@shared/schulformen'
import type { Anfrage } from './http'
import { json } from './http'
import { alleNutzer, protokolliereServer, serverWert, setzeServerWert } from './datenbank'
import { leseSchule } from './schule'

export const KALENDER_SCHLUESSEL = 'schulkalender'
const STAND_SCHLUESSEL = 'schulkalender-stand'
const WOCHE = 7 * 864e5
const OPENHOLIDAYS = 'https://openholidaysapi.org'
const FERIEN_API = 'https://ferien-api.de/api/v1/holidays'

export interface KalenderStand {
  /** Letzter Versuch (ISO) und ob er glückte */
  versuch: string
  ok: boolean
  /** Fehler des letzten Versuchs (kurz, ohne Inhalte) */
  fehler: string
  /** Fehler schon protokolliert (nur einmal je Serie) */
  gemeldet?: boolean
}

// ---------------------------------------------------------------- Antworten lesen

interface OhEintrag {
  startDate?: unknown
  endDate?: unknown
  name?: { language?: string; text?: string }[]
  nationwide?: unknown
  regionalScope?: unknown
  subdivisions?: { code?: string }[]
  groups?: unknown[]
}

const TAG_RE = /^\d{4}-\d{2}-\d{2}$/
const ohName = (e: OhEintrag): string =>
  String((e.name ?? []).find((n) => String(n.language).toUpperCase() === 'DE')?.text ?? e.name?.[0]?.text ?? '').trim() || 'Ferien'

/**
 * Antwort der OpenHolidays API (SchoolHolidays bzw. PublicHolidays) → Zeiträume des Landes. Nur landesweite Einträge:
 * bundesweit oder mit dem Land unter `subdivisions`; Einträge nur für Gruppen/Orte (`groups`, regionalScope „Local")
 * gelten nicht für alle Schulen des Landes und fallen weg.
 */
export function leseOpenHolidays(roh: unknown, land: string): KalenderZeitraum[] {
  if (!Array.isArray(roh)) throw new Error('Antwort ist keine Liste')
  const code = `DE-${land.toUpperCase()}`
  const aus: KalenderZeitraum[] = []
  for (const e of roh as OhEintrag[]) {
    const von = String(e?.startDate ?? '')
    const bis = String(e?.endDate ?? von)
    if (!TAG_RE.test(von) || !TAG_RE.test(bis) || bis < von) continue
    if (Array.isArray(e.groups) && e.groups.length) continue
    if (String(e.regionalScope ?? '') === 'Local') continue
    const landesweit = e.nationwide === true || (e.subdivisions ?? []).some((s) => String(s?.code ?? '').toUpperCase() === code)
    if (!landesweit) continue
    aus.push({ von, bis, name: ohName(e) })
  }
  return aus.sort((a, b) => a.von.localeCompare(b.von))
}

/** „sommerferien niedersachsen" → „Sommerferien" */
const ferienName = (roh: string): string => {
  const w = roh.trim().split(/\s+/)[0] ?? ''
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : 'Ferien'
}

/**
 * Antwort von ferien-api.de (`/api/v1/holidays/<LAND>/<JAHR>`): [{start, end, year, stateCode, name, slug}] mit Tagen wie
 * „2025-07-03" (ältere Antworten: „2025-07-03T00:00Z"); `end` ist der letzte Ferientag (geprüft am 10.10.2026, siehe
 * recherche/schulkalender.md). Einträge „(beweglicher ferientag)" fallen weg – nur feste, landesweite Ferien.
 */
export function leseFerienApi(roh: unknown, land: string): KalenderZeitraum[] {
  if (!Array.isArray(roh)) throw new Error('Antwort ist keine Liste')
  const aus: KalenderZeitraum[] = []
  for (const e of roh as Record<string, unknown>[]) {
    if (e?.stateCode && String(e.stateCode).toUpperCase() !== land.toUpperCase()) continue
    if (/beweglich/i.test(String(e?.name ?? ''))) continue
    const von = String(e?.start ?? '').slice(0, 10)
    const bis = String(e?.end ?? '').slice(0, 10)
    if (!TAG_RE.test(von) || !TAG_RE.test(bis) || bis < von) continue
    aus.push({ von, bis, name: ferienName(String(e?.name ?? '')) })
  }
  return aus.sort((a, b) => a.von.localeCompare(b.von))
}

/** Zeitraum des Abrufs: vom 1. Juli des Vorjahres an 1095 Tage (laufendes und nächstes Schuljahr samt Sommerferien) */
export function abrufZeitraum(jetzt = Date.now()): { von: string; bis: string } {
  const jahr = schuljahrVon(jetzt, null)
  const von = `${jahr - 1}-07-01`
  return { von, bis: tagPlus(von, 1094) }
}

type Abruf = typeof fetch

async function holeJson(abruf: Abruf, url: string): Promise<unknown> {
  const r = await abruf(url, { headers: { accept: 'application/json', 'user-agent': 'Schul-Apps-Server (Schulkalender)' }, signal: AbortSignal.timeout(20_000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

/** OpenHolidays: Schulferien und Feiertage */
export async function holeOpenHolidays(land: string, abruf: Abruf = fetch, jetzt = Date.now()): Promise<SchulkalenderDaten> {
  const z = abrufZeitraum(jetzt)
  const q = `countryIsoCode=DE&subdivisionCode=DE-${land}&languageIsoCode=DE&validFrom=${z.von}&validTo=${z.bis}`
  const ferien = leseOpenHolidays(await holeJson(abruf, `${OPENHOLIDAYS}/SchoolHolidays?${q}`), land)
  const feiertage = leseOpenHolidays(await holeJson(abruf, `${OPENHOLIDAYS}/PublicHolidays?${q}`), land)
  return vollstaendig({ land, quelle: 'openholidays', abgerufen: new Date(jetzt).toISOString(), ferien, feiertage }, jetzt)
}

/** ferien-api.de: Ferien je Jahr (vier Jahre), Feiertage selbst gerechnet */
export async function holeFerienApi(land: string, abruf: Abruf = fetch, jetzt = Date.now()): Promise<SchulkalenderDaten> {
  const z = abrufZeitraum(jetzt)
  const von = Number(z.von.slice(0, 4))
  const bis = Number(z.bis.slice(0, 4))
  const ferien: KalenderZeitraum[] = []
  const feiertage: KalenderZeitraum[] = []
  for (let j = von; j <= bis; j++) {
    ferien.push(...leseFerienApi(await holeJson(abruf, `${FERIEN_API}/${land}/${j}`), land))
    feiertage.push(...gesetzlicheFeiertage(land, j))
  }
  const doppelt = new Set<string>()
  return vollstaendig({
    land,
    quelle: 'ferien-api',
    abgerufen: new Date(jetzt).toISOString(),
    ferien: ferien.filter((f) => !doppelt.has(f.von) && doppelt.add(f.von)).sort((a, b) => a.von.localeCompare(b.von)),
    feiertage: feiertage.filter((f) => f.von >= z.von && f.von <= z.bis)
  }, jetzt)
}

/**
 * Nur vollständige Daten übernehmen: Die Sommerferien, mit denen das laufende Schuljahr begann, müssen dabei sein (sonst
 * ließe sich weder das Schuljahr noch der erste Schultag bestimmen). ferien-api.de liefert z. B. für 2026 eine leere
 * Liste (Stand 10.10.2026) – dann bleiben die bisherigen Daten.
 */
export function vollstaendig(d: SchulkalenderDaten, jetzt = Date.now()): SchulkalenderDaten {
  if (!d.ferien.length) throw new Error('keine Schulferien geliefert')
  const jahr = schuljahrVon(jetzt, null)
  if (!sommerferien(d).some((s) => s.von.startsWith(String(jahr)))) throw new Error(`Sommerferien ${jahr} fehlen`)
  return d
}

/** Datei statt Netz (SCHULAPPS_KALENDER_DATEI): fertige Daten oder rohe OpenHolidays-Antworten */
export function leseKalenderDatei(datei: string, jetzt = Date.now()): SchulkalenderDaten {
  const roh = JSON.parse(readFileSync(datei, 'utf8')) as Record<string, unknown>
  const land = typeof roh.land === 'string' && roh.land ? roh.land.toUpperCase() : 'NI'
  if (Array.isArray(roh.ferien) && Array.isArray(roh.feiertage))
    return { land, quelle: 'datei', abgerufen: new Date(jetzt).toISOString(), ferien: roh.ferien as KalenderZeitraum[], feiertage: roh.feiertage as KalenderZeitraum[] }
  return {
    land,
    quelle: 'datei',
    abgerufen: new Date(jetzt).toISOString(),
    ferien: leseOpenHolidays(roh.schulferien, land),
    feiertage: leseOpenHolidays(roh.feiertage, land)
  }
}

// ---------------------------------------------------------------- Land und Stand

/** Häufigstes Land in den Einstellungen der Lehrkräfte (Rückfall ohne Schul-Einrichtung) – von außen gesetzt (start.ts) */
let landDerLehrkraefte: () => string | null = () => null
export const setzeLandRueckfall = (f: () => string | null): void => void (landDerLehrkraefte = f)

/** Häufigstes Land einer Liste (null bei leerer Liste) */
export function haeufigstesLand(laender: (string | null | undefined)[]): string | null {
  const zahl = new Map<string, number>()
  for (const l of laender) if (l && LAENDER.some((x) => x.id === l)) zahl.set(l, (zahl.get(l) ?? 0) + 1)
  return [...zahl.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null
}

/** Land für den Abruf: Schule, sonst die Lehrkräfte */
export function kalenderLand(): string | null {
  const s = leseSchule()?.stateId
  if (s && LAENDER.some((x) => x.id === s)) return s
  try {
    return landDerLehrkraefte()
  } catch {
    return null
  }
}

/** Gespeicherte Daten (oder null) */
export const gespeicherterKalender = (): SchulkalenderDaten | null => {
  const d = serverWert<SchulkalenderDaten | null>(KALENDER_SCHLUESSEL, null)
  return d && Array.isArray(d.ferien) && Array.isArray(d.feiertage) ? d : null
}
export const kalenderStand = (): KalenderStand | null => serverWert<KalenderStand | null>(STAND_SCHLUESSEL, null)

/** Gespeicherte Daten für alle Rechnungen des Servers setzen */
export function kalenderLaden(): SchulkalenderDaten | null {
  const d = gespeicherterKalender()
  setzeSchulkalender(d)
  return d
}

/** Neu abrufen nötig? (keine Daten, anderes Land, älter als eine Woche) */
export function abrufNoetig(d: SchulkalenderDaten | null, land: string | null, jetzt = Date.now()): boolean {
  if (!land) return false
  if (!d || d.land !== land) return true
  const t = Date.parse(d.abgerufen)
  return !Number.isFinite(t) || jetzt - t >= WOCHE
}

let laeuft: Promise<SchulkalenderDaten | null> | null = null

/**
 * Abrufen und speichern. `erzwingen`: auch wenn der Stand frisch ist (Knopf der Verwaltung). Fehler: letzte gute Daten
 * bleiben, ein Protokolleintrag je Fehlerserie. Liefert die gültigen Daten (neu oder bisherige).
 */
export function kalenderAktualisieren(o: { erzwingen?: boolean; abruf?: Abruf; jetzt?: number; datei?: string } = {}): Promise<SchulkalenderDaten | null> {
  if (laeuft) return laeuft
  laeuft = (async (): Promise<SchulkalenderDaten | null> => {
    const jetzt = o.jetzt ?? Date.now()
    const bisher = gespeicherterKalender()
    const datei = o.datei ?? process.env.SCHULAPPS_KALENDER_DATEI
    if (datei) {
      try {
        const d = leseKalenderDatei(datei, jetzt)
        setzeServerWert(KALENDER_SCHLUESSEL, d)
        setzeServerWert(STAND_SCHLUESSEL, { versuch: new Date(jetzt).toISOString(), ok: true, fehler: '' } satisfies KalenderStand)
        setzeSchulkalender(d)
        return d
      } catch (e) {
        setzeServerWert(STAND_SCHLUESSEL, { versuch: new Date(jetzt).toISOString(), ok: false, fehler: `Datei: ${(e as Error).message}`.slice(0, 200) })
        setzeSchulkalender(bisher)
        return bisher
      }
    }
    const land = kalenderLand()
    if (!land || (!o.erzwingen && !abrufNoetig(bisher, land, jetzt))) {
      setzeSchulkalender(bisher)
      return bisher
    }
    const abruf = o.abruf ?? fetch
    const fehler: string[] = []
    for (const [name, hole] of [
      ['OpenHolidays', holeOpenHolidays],
      ['ferien-api.de', holeFerienApi]
    ] as const) {
      try {
        const d = await hole(land, abruf, jetzt)
        setzeServerWert(KALENDER_SCHLUESSEL, d)
        const vorher = kalenderStand()
        setzeServerWert(STAND_SCHLUESSEL, { versuch: new Date(jetzt).toISOString(), ok: true, fehler: fehler.join('; ') } satisfies KalenderStand)
        if (vorher && !vorher.ok) protokolliereServer('schulkalender', `Schulkalender wieder abgerufen (${name})`)
        else if (!bisher || bisher.land !== land) protokolliereServer('schulkalender', `Schulkalender für ${land} abgerufen (${name}): ${d.ferien.length} Ferien, ${d.feiertage.length} Feiertage`)
        setzeSchulkalender(d)
        return d
      } catch (e) {
        fehler.push(`${name}: ${(e as Error).message}`.slice(0, 120))
      }
    }
    const vorher = kalenderStand()
    const stand: KalenderStand = { versuch: new Date(jetzt).toISOString(), ok: false, fehler: fehler.join('; '), gemeldet: true }
    if (!vorher || vorher.ok || !vorher.gemeldet)
      protokolliereServer('schulkalender', `Schulkalender nicht abrufbar – ${bisher ? 'bisherige Daten bleiben' : 'ohne Daten gilt der 1. August'} (${stand.fehler})`)
    setzeServerWert(STAND_SCHLUESSEL, stand)
    setzeSchulkalender(bisher)
    return bisher
  })().finally(() => {
    laeuft = null
  })
  return laeuft
}

// ---------------------------------------------------------------- Uhr (Browsertests)

let testHeute: string | null = null
/** Heute in deutscher Zeit – in Browsertests verstellbar (SCHULAPPS_KALENDER_TESTUHR=1, /server/schulkalender/testuhr) */
export const kalenderHeute = (): string => testHeute ?? tagVon(Date.now())
export const setzeTestHeute = (tag: string | null): void => void (testHeute = tag)

/** Haken: Schuljahreswechsel prüfen (schuljahrWechsel.ts trägt sich ein – vermeidet einen Ring der Importe) */
export const kalenderHaken: { pruefen?: (heute: string) => unknown } = {}

/** Beim Start laden, bei Bedarf abrufen; danach alle 6 Stunden prüfen (Abruf höchstens wöchentlich) */
export function kalenderStarten(): void {
  kalenderLaden()
  const runde = async (): Promise<void> => {
    try {
      await kalenderAktualisieren()
    } catch {
      /* nächste Runde */
    }
    try {
      kalenderHaken.pruefen?.(kalenderHeute())
    } catch (e) {
      protokolliereServer('schuljahr', `Prüfung des Schuljahreswechsels fehlgeschlagen: ${(e as Error).message}`.slice(0, 200))
    }
  }
  void runde()
  setInterval(() => void runde(), 6 * 36e5).unref()
}

// ---------------------------------------------------------------- Route

export async function schulkalenderRoute(k: Anfrage): Promise<boolean> {
  const { url, req, res, sitzung } = k
  if (!url.pathname.startsWith('/server/schulkalender')) return false
  if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
  if (req.method === 'GET' && url.pathname === '/server/schulkalender') {
    const d = schulkalender() ?? gespeicherterKalender()
    const admin = sitzung.nutzer.rolle === 'admin'
    return (
      json(res, 200, {
        daten: d,
        ...(sitzung.nutzer.rolle !== 'schueler' ? { land: kalenderLand(), heute: kalenderHeute() } : {}),
        ...(admin ? { stand: kalenderStand(), wechsel: kalenderHaken.pruefen ? serverWert('schuljahr-wechsel', null) : null } : {})
      }),
      true
    )
  }
  if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
  if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
  if (sitzung.nutzer.rolle !== 'admin') return (json(res, 403, { fehler: 'Nur für die Verwaltung.' }), true)
  if (url.pathname === '/server/schulkalender/aktualisieren') {
    const d = await kalenderAktualisieren({ erzwingen: true })
    protokolliereServer('schulkalender', 'Schulkalender von Hand aktualisiert', sitzung.nutzer.id)
    return (json(res, 200, { daten: d, stand: kalenderStand() }), true)
  }
  if (url.pathname === '/server/schulkalender/testuhr' && process.env.SCHULAPPS_KALENDER_TESTUHR === '1') {
    const k0 = ((await k.koerper()) ?? {}) as Record<string, unknown>
    const heute = typeof k0.heute === 'string' && TAG_RE.test(k0.heute) ? k0.heute : null
    setzeTestHeute(heute)
    const ergebnis = heute ? kalenderHaken.pruefen?.(heute) : null
    return (json(res, 200, { heute: kalenderHeute(), ergebnis: ergebnis ?? null }), true)
  }
  return (json(res, 404, { fehler: 'Unbekannt.' }), true)
}

/** Lehrkräfte-Länder für den Rückfall (aus ihren Einstellungen; `ortVon` aus grammatik.ts) */
export function landAusLehrkraeften(ortVon: (id: string) => { land?: string }): string | null {
  return haeufigstesLand(
    alleNutzer()
      .filter((n) => n.rolle !== 'schueler')
      .map((n) => {
        try {
          return ortVon(n.id).land ?? null
        } catch {
          return null
        }
      })
  )
}
