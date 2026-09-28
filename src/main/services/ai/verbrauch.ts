/**
 * Verbrauchszählung (27.09.2026, Großprogramm 0.4, Paket Verlässlichkeit).
 *
 * Bis dahin wusste die App nicht, wie viel sie verbraucht: `usage` der Anbieter wurde nie
 * gelesen. Jetzt zählt sie je Monat, Anbieter und Modell die Anfragen, Wiederholungen,
 * Eingabe- und Ausgabe-Token (soweit der Anbieter sie meldet), Bilder und vertonte Zeichen.
 * Eine Kostenrechnung ist das bewusst nicht – Preise ändern sich und hängen am Vertrag; die
 * Zahlen zeigen, wofür das Kontingent draufgeht.
 */
import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { writeAtomic } from '../storage/atomar'

export interface Zaehler {
  anfragen: number
  wiederholungen: number
  eingabe: number
  ausgabe: number
  bilder: number
  ttsZeichen: number
}

/** Monat (JJJJ-MM) → „anbieter · modell" → Zähler */
export type Verbrauch = Record<string, Record<string, Zaehler>>

const LEER: Zaehler = { anfragen: 0, wiederholungen: 0, eingabe: 0, ausgabe: 0, bilder: 0, ttsZeichen: 0 }

let dateiOverride: string | null = null
export function setzeVerbrauchsDatei(pfad: string | null): void {
  dateiOverride = pfad
}
const datei = (): string => dateiOverride ?? join(app.getPath('userData'), 'verbrauch.json')

export function leseVerbrauch(): Verbrauch {
  try {
    return existsSync(datei()) ? (JSON.parse(readFileSync(datei(), 'utf8')) as Verbrauch) : {}
  } catch {
    return {}
  }
}

export const monat = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Zählt dazu. Fehler beim Schreiben werden verschluckt – zählen darf nie eine Anfrage scheitern lassen. */
export function merkeVerbrauch(anbieter: string, modell: string, teil: Partial<Zaehler>, jetzt = new Date()): void {
  try {
    const v = leseVerbrauch()
    const m = (v[monat(jetzt)] ??= {})
    const k = `${anbieter} · ${modell || 'Standard'}`
    const z = { ...LEER, ...(m[k] ?? {}) }
    for (const [feld, wert] of Object.entries(teil) as [keyof Zaehler, number][]) if (Number.isFinite(wert)) z[feld] += wert
    m[k] = z
    writeAtomic(datei(), JSON.stringify(v, null, 1))
  } catch {
    // Zählen ist Beiwerk
  }
}
