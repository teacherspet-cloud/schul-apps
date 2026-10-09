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
import type { KiArt } from '@shared/kiArten'
import { leererTag, monatSchluessel, tagSchluessel, type LimitEreignis, type VerbrauchsDaten, type VerbrauchsTag } from '@shared/verbrauch'

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

/*
 * Seit 09.10.2026 (Einstellungen › KI-Zugang › Verbrauch mit Diagrammen) liegen in derselben Datei zusätzlich
 * `_tage` (Tag → Anbieter- und Auftragsart-Zähler, 120 Tage) und `_limits` (die letzten erreichten Limits).
 * Die Monatsschlüssel bleiben wie bisher – ältere Fassungen lesen die Datei weiter.
 */
type Datei = Verbrauch & { _tage?: Record<string, VerbrauchsTag>; _limits?: LimitEreignis[] }

const LEER: Zaehler = { anfragen: 0, wiederholungen: 0, eingabe: 0, ausgabe: 0, bilder: 0, ttsZeichen: 0 }
const TAGE_HALTEN = 120
const LIMITS_HALTEN = 30

let dateiOverride: string | null = null
export function setzeVerbrauchsDatei(pfad: string | null): void {
  dateiOverride = pfad
}
const datei = (): string => dateiOverride ?? join(app.getPath('userData'), 'verbrauch.json')

function lesen(): Datei {
  try {
    return existsSync(datei()) ? (JSON.parse(readFileSync(datei(), 'utf8')) as Datei) : {}
  } catch {
    return {}
  }
}

const IST_MONAT = /^\d{4}-\d{2}$/

/** Nur die Monate (wie bis 09.10.2026) */
export function leseVerbrauch(): Verbrauch {
  return Object.fromEntries(Object.entries(lesen()).filter(([k]) => IST_MONAT.test(k))) as Verbrauch
}

/** Monate, Tage und Limits für die Oberfläche (verbrauch:get) */
export function verbrauchsDaten(): VerbrauchsDaten {
  const d = lesen()
  return { monate: leseVerbrauch(), tage: d._tage ?? {}, limits: d._limits ?? [] }
}

export const monat = (d = new Date()): string => monatSchluessel(d)
const tagVon = (d = new Date()): string => tagSchluessel(d)

function aufraeumen(v: Datei, jetzt: Date): void {
  const grenze = tagVon(new Date(jetzt.getTime() - TAGE_HALTEN * 864e5))
  for (const t of Object.keys(v._tage ?? {})) if (t < grenze) delete v._tage![t]
  if (v._limits) v._limits = v._limits.filter((l) => l.zeit.slice(0, 10) >= grenze).slice(-LIMITS_HALTEN)
}

/**
 * Zählt dazu. Fehler beim Schreiben werden verschluckt – zählen darf nie eine Anfrage scheitern lassen.
 * `art` (seit 09.10.2026): wofür die Anfrage war (shared/kiArten.ts) – für das Ringdiagramm „nach Programm".
 */
export function merkeVerbrauch(anbieter: string, modell: string, teil: Partial<Zaehler>, art?: KiArt, jetzt = new Date()): void {
  try {
    const v = lesen()
    const m = ((v as Verbrauch)[monat(jetzt)] ??= {})
    const k = `${anbieter} · ${modell || 'Standard'}`
    const z = { ...LEER, ...(m[k] ?? {}) }
    for (const [feld, wert] of Object.entries(teil) as [keyof Zaehler, number][]) if (Number.isFinite(wert)) z[feld] += wert
    m[k] = z
    // Je Tag und Anbieter
    const tag = ((v._tage ??= {})[tagVon(jetzt)] ??= leererTag())
    const a = (tag.anbieter[anbieter] ??= {})
    for (const [feld, wert] of Object.entries(teil) as [keyof Zaehler, number][]) if (Number.isFinite(wert) && wert) a[feld] = (a[feld] ?? 0) + wert
    // Aufrufe: Anfragen, sonst Bilder, sonst eine Vertonung (Token-Meldungen der Anbieter zählen nicht doppelt)
    const stueck = teil.anfragen ?? teil.bilder ?? (teil.ttsZeichen ? 1 : 0)
    if (stueck) a.n = (a.n ?? 0) + stueck
    if (art && stueck) tag.arten[art] = (tag.arten[art] ?? 0) + stueck
    aufraeumen(v, jetzt)
    writeAtomic(datei(), JSON.stringify(v, null, 1))
  } catch {
    // Zählen ist Beiwerk
  }
}

/** Ein Limit (429, Kontingent, Guthaben) ist erreicht – für die Hervorhebung im Verbrauch (09.10.2026) */
export function merkeLimit(anbieter: string, meldung: string, art?: KiArt, jetzt = new Date()): void {
  try {
    const v = lesen()
    const tag = ((v._tage ??= {})[tagVon(jetzt)] ??= leererTag())
    const a = (tag.anbieter[anbieter] ??= {})
    a.limits = (a.limits ?? 0) + 1
    // Nur der Anfang der Meldung, ohne Inhalte der Anfrage
    ;(v._limits ??= []).push({ zeit: jetzt.toISOString(), anbieter, ...(art ? { art } : {}), meldung: meldung.replace(/\s+/g, ' ').slice(0, 160) })
    aufraeumen(v, jetzt)
    writeAtomic(datei(), JSON.stringify(v, null, 1))
  } catch {
    // Zählen ist Beiwerk
  }
}
