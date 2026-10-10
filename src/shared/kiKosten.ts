/**
 * Geschätzte KI-Kosten, Budget und anonyme Bezeichnungen (10.10.2026, Verwaltung › KI-Zugänge).
 *
 * Reine Rechnungen ohne Speicher – gemeinsam für den Server (server/kiNutzung.ts) und die Oberfläche
 * (verwaltung/KiNutzung.tsx). Preise trägt der Admin selbst ein (je 1 Mio. Eingabe-/Ausgabe-Token, je Anbieter
 * oder je Anbieter und Modell); ohne Preise gibt es keine Euro-Werte. Alles ist ausdrücklich eine SCHÄTZUNG –
 * Preise ändern sich und hängen am Vertrag.
 */

/** Preis in Euro je 1 Million Token */
export interface KiPreis {
  ein?: number
  aus?: number
}

/** Schlüssel „anbieter" (gilt für alle Modelle) oder „anbieter|modell" (geht vor) */
export type KiPreise = Record<string, KiPreis>

export interface KiBudget {
  art: 'token' | 'euro'
  /** Token bzw. Euro je Monat */
  wert: number
}

export type BudgetStufe = 'ok' | 'warnung' | 'ueber'

export const BUDGET_WARNUNG_AB = 0.8

const gueltig = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

/** Preis für Anbieter und Modell: zuerst „anbieter|modell", sonst „anbieter"; ohne jede Angabe undefined */
export function preisFuer(preise: KiPreise, anbieter: string, modell?: string): KiPreis | undefined {
  const p = (modell ? preise[`${anbieter}|${modell}`] : undefined) ?? preise[anbieter]
  if (!p || (!gueltig(p.ein) && !gueltig(p.aus))) return undefined
  return p
}

export interface KostenErgebnis {
  /** Euro (geschätzt); null = kein Preis für diesen Anbieter */
  euro: number | null
  /** Nur ein Preis bekannt (Eingabe ODER Ausgabe) – der eine galt für alle Token */
  nurGesamtpreis: boolean
}

/**
 * Kosten aus Eingabe- und Ausgabe-Token. Fehlt einer der beiden Preise, gilt der andere für alle Token
 * (Hinweis „nurGesamtpreis"). Ohne Preis: null.
 */
export function kostenSchaetzen(eingabe: number, ausgabe: number, preis: KiPreis | undefined): KostenErgebnis {
  if (!preis) return { euro: null, nurGesamtpreis: false }
  const ein = gueltig(preis.ein) ? preis.ein : undefined
  const aus = gueltig(preis.aus) ? preis.aus : undefined
  if (ein === undefined && aus === undefined) return { euro: null, nurGesamtpreis: false }
  const e = Math.max(0, eingabe || 0)
  const o = Math.max(0, ausgabe || 0)
  if (ein !== undefined && aus !== undefined) return { euro: (e * ein + o * aus) / 1e6, nurGesamtpreis: false }
  const einer = (ein ?? aus) as number
  return { euro: ((e + o) * einer) / 1e6, nurGesamtpreis: true }
}

/** Anteil am Monatsbudget und Stufe: ab 80 % Warnung (orange), ab 100 % überschritten (rot) */
export function budgetStand(verbraucht: number, budget: number): { anteil: number; stufe: BudgetStufe } {
  if (!gueltig(budget) || budget <= 0) return { anteil: 0, stufe: 'ok' }
  const anteil = Math.max(0, verbraucht || 0) / budget
  return { anteil, stufe: anteil >= 1 ? 'ueber' : anteil >= BUDGET_WARNUNG_AB ? 'warnung' : 'ok' }
}

/** A, B, … Z, AA, AB, … – Bezeichnung nach Rang (0 = A) */
export function buchstabe(rang: number): string {
  let n = Math.max(0, Math.floor(rang))
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

/** Prüft eingegebene Preise (Verwaltung): nur Zahlen 0–10.000, gültige Schlüssel, höchstens 200 Einträge */
export function preiseBereinigen(roh: unknown): KiPreise {
  const aus: KiPreise = {}
  if (!roh || typeof roh !== 'object') return aus
  for (const [k, v] of Object.entries(roh as Record<string, unknown>).slice(0, 200)) {
    if (!/^[a-z0-9_-]{1,40}(\|[\w.:/ -]{1,120})?$/i.test(k) || !v || typeof v !== 'object') continue
    const p = v as Record<string, unknown>
    const zahl = (x: unknown): number | undefined => {
      const n = typeof x === 'string' ? Number(x.replace(',', '.')) : x
      return gueltig(n) && n <= 10000 ? n : undefined
    }
    const ein = zahl(p.ein)
    const ausP = zahl(p.aus)
    if (ein === undefined && ausP === undefined) continue
    aus[k] = { ...(ein !== undefined ? { ein } : {}), ...(ausP !== undefined ? { aus: ausP } : {}) }
  }
  return aus
}

/** Prüft ein eingegebenes Budget; null = kein Budget */
export function budgetBereinigen(roh: unknown): KiBudget | null {
  if (!roh || typeof roh !== 'object') return null
  const b = roh as Record<string, unknown>
  const art = b.art === 'euro' ? 'euro' : b.art === 'token' ? 'token' : null
  const wert = typeof b.wert === 'string' ? Number(b.wert.replace(',', '.')) : b.wert
  if (!art || !gueltig(wert) || wert <= 0 || wert > 1e12) return null
  return { art, wert }
}
