/**
 * Fehler der KI-Anbieter mit Angaben für die Wiederholung (22.10.2026, KI-Sicherheitsprüfung).
 *
 * Anlass: Die Pakete von OpenAI und Anthropic wiederholten selbst zweimal (maxRetries: 2), `mitWiederholung`
 * (wiederholung.ts) danach noch einmal – bei 429/5xx bis zu sechs Versuche je Anfrage, ohne Pause dazwischen. Jetzt
 * wiederholen die Pakete nicht mehr selbst (maxRetries: 0); die Anbieter hängen Status und – falls der Anbieter es
 * sagt – die Wartezeit aus „Retry-After" an den Fehler, und `mitWiederholung` wartet entsprechend (mit Zufallsanteil).
 *
 * Bewusst ohne Abhängigkeiten: läuft am PC, auf dem Server und in der iPad-App.
 */

export interface KiFehlerAngaben {
  /** HTTP-Status der Antwort, falls bekannt */
  status?: number
  /** Vom Anbieter verlangte Wartezeit in ms (Retry-After), falls bekannt */
  wartenMs?: number
  /** Lohnt ein zweiter Versuch nach einer Pause? (429 wegen Tempo, 5xx, „overloaded") – nicht bei Kontingent/Guthaben */
  voruebergehend?: boolean
}

export type KiFehler = Error & { ki?: KiFehlerAngaben }

/** Fehler mit Angaben für die Wiederholung */
export function kiFehler(meldung: string, angaben: KiFehlerAngaben = {}): KiFehler {
  return Object.assign(new Error(meldung), { ki: angaben })
}

export const kiAngaben = (e: unknown): KiFehlerAngaben | undefined => (e && typeof e === 'object' ? (e as KiFehler).ki : undefined)

/** Höchste Wartezeit, die wir einem Retry-After glauben – länger blockiert den Platz zu lange (Faustregel) */
export const MAX_WARTEN_MS = 30_000

/**
 * Wartezeit aus den Kopfzeilen: `retry-after-ms` (OpenAI), `retry-after` in Sekunden oder als HTTP-Datum.
 * Nimmt ein `Headers`-Objekt, einen einfachen Datensatz oder nichts.
 */
export function wartenAusKopf(kopf: unknown, jetzt = Date.now()): number | undefined {
  const lies = (name: string): string | undefined => {
    if (!kopf || typeof kopf !== 'object') return undefined
    const k = kopf as { get?: (n: string) => string | null } & Record<string, unknown>
    if (typeof k.get === 'function') return k.get(name) ?? undefined
    const v = k[name] ?? k[name.toLowerCase()]
    return typeof v === 'string' ? v : Array.isArray(v) ? String(v[0]) : undefined
  }
  const ms = Number(lies('retry-after-ms'))
  if (Number.isFinite(ms) && ms >= 0) return Math.min(ms, MAX_WARTEN_MS)
  const roh = lies('retry-after')?.trim()
  if (!roh) return undefined
  const s = Number(roh)
  if (Number.isFinite(s) && s >= 0) return Math.min(s * 1000, MAX_WARTEN_MS)
  const datum = Date.parse(roh)
  return Number.isFinite(datum) ? Math.min(Math.max(0, datum - jetzt), MAX_WARTEN_MS) : undefined
}

/** Ist ein Status vorübergehend? 408, 409 (Konflikt beim Anbieter), 429 (Tempo), 5xx, 529 */
export const voruebergehenderStatus = (status: number | undefined): boolean =>
  status === 408 || status === 409 || status === 429 || (typeof status === 'number' && status >= 500 && status < 600)

/** 429 wegen fehlendem Guthaben/Kontingent ist nicht vorübergehend – eine Wiederholung kostet nur Zeit */
export const kontingentLeer = (text: string): boolean => /insufficient_quota|quota|billing|credit balance|guthaben|resource.?exhausted.*(day|month)/i.test(text)
