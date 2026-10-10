/**
 * Zusammengefasste Vokabel-Abschnitte teilen (09.10.2026, Befund der Lehrkraft; Regeln: shared/abschnitteTeilen.ts).
 *
 * Einmalige Wartung `abschnitte-teilen-2026-10-09`: jeder Kurs (vok_zuweisungen) mit Herkunft aus dem Lehrwerk, dessen
 * Abschnitt mehrere Lehrwerk-Abschnitte nennt („Unit 1: Check-in, Station 1, Station 2"), bekommt je Abschnitt einen
 * eigenen Teil. Wortkennungen, Freigabezeit und Lernstand (vok_stand, je Wortkennung) bleiben unverändert.
 * Außerdem beim Speichern (server/vokabeln.ts: neuer Kurs und „Vokabeln hinzufügen"), falls ein älterer Stand der App
 * noch einen zusammengefassten Abschnitt schickt.
 *
 * Wörter, Titel und Herkunft sind verschlüsselt (feldschutz.ts): gelesen und geschrieben wird über den geschützten
 * Zugang, den `datenbank()` der Wartung übergibt. Lehrwerke liest `fs` (am Server die entschlüsselnde Fassung).
 * Das Protokoll nennt nur Zahlen.
 */
import type { DatabaseSync } from 'node:sqlite'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'node:path'
import { DATEN, RESSOURCEN } from './pfade'
import { kursAbschnitteTeilen, vergleich, type BuchFuerTeilen, type TeilBasis, type WortBasis } from '../shared/abschnitteTeilen'
import type { Quelle } from '../shared/vokabelLaufbahn'

const tabelleDa = (d: DatabaseSync, t: string): boolean => Boolean(d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t))
const spalteDa = (d: DatabaseSync, t: string, s: string): boolean =>
  (d.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((x) => x.name === s)

const json = <T>(roh: unknown, ersatz: T): T => {
  try {
    return typeof roh === 'string' && roh ? (JSON.parse(roh) as T) : ersatz
  } catch {
    return ersatz
  }
}

// ---------------------------------------------------------------- Lehrwerke synchron lesen (kurz zwischengespeichert)

const ordnerVon = (lehrkraftId: string): string[] => [
  // Vom Admin bearbeitete gemeinsame Fassung, eigene Importe der Lehrkraft, mitgelieferte
  join(DATEN, 'lehrwerke'),
  ...(/^[a-z0-9-]{6,64}$/.test(lehrkraftId) ? [join(DATEN, 'nutzer', lehrkraftId, 'lehrwerke')] : []),
  join(RESSOURCEN, 'lehrwerke')
]
// Klein halten (Speicher am Server knapp): höchstens zwei Lehrwerke für 2 Minuten (ein Band sind einige MB)
const dateiCache = new Map<string, { buch: BuchFuerTeilen | null; zeit: number }>()
function lies(datei: string, merken = true): BuchFuerTeilen | null {
  const c = dateiCache.get(datei)
  if (c && Date.now() - c.zeit < 2 * 60_000) return c.buch
  let buch: BuchFuerTeilen | null = null
  try {
    const b = JSON.parse(readFileSync(datei, 'utf8')) as BuchFuerTeilen
    if (b && typeof b.name === 'string' && Array.isArray(b.units)) buch = b
  } catch {
    buch = null
  }
  if (merken && buch) {
    if (dateiCache.size >= 2) dateiCache.delete(dateiCache.keys().next().value!)
    dateiCache.set(datei, { buch, zeit: Date.now() })
  }
  return buch
}

/** Lehrwerk zur Kennung; nennt der Titel einen anderen Band, das Lehrwerk mit diesem Namen */
export function buchSync(kennung: string, bandName: string, lehrkraftId = ''): BuchFuerTeilen | null {
  const ordner = ordnerVon(lehrkraftId)
  const passtName = (b: BuchFuerTeilen | null): boolean => !bandName || (b !== null && vergleich(b.name) === vergleich(bandName))
  if (/^[A-Za-z0-9_-]{2,80}$/.test(kennung))
    for (const o of ordner) {
      const datei = join(o, `${kennung}.json`)
      if (!existsSync(datei)) continue
      const b = lies(datei)
      if (b && passtName(b)) return b
      if (b) break
    }
  if (!bandName) return null
  for (const o of ordner) {
    if (!existsSync(o)) continue
    let dateien: string[] = []
    try {
      dateien = readdirSync(o).filter((f) => f.endsWith('.json'))
    } catch {
      continue
    }
    for (const f of dateien) {
      // Beim Suchen nach dem Namen nur das gefundene Lehrwerk merken
      const b = lies(join(o, f), false)
      if (b && passtName(b)) return lies(join(o, f))
    }
  }
  return null
}

/**
 * Name des Lehrwerks zur Kennung (10.10.2026, Bände je Abschnitt): „green-line-2" → „Green Line 2",
 * „apuntate-2016-1" → „¡Apúntate! 1" – auch eigene Importe der Lehrkraft und Platzhalter-Lehrwerke ohne Units.
 * '' = unbekannt (dann bildet kursAbschnitte.ts den Namen aus der Kennung). Nur Namen werden gemerkt (klein).
 */
const namenCache = new Map<string, string>()
export function lehrwerkName(kennung: string, lehrkraftId = ''): string {
  if (!/^[A-Za-z0-9_-]{2,80}$/.test(kennung)) return ''
  const schluessel = `${lehrkraftId}|${kennung}`
  const da = namenCache.get(schluessel)
  if (da !== undefined) return da
  let name = ''
  for (const o of ordnerVon(lehrkraftId)) {
    const datei = join(o, `${kennung}.json`)
    if (!existsSync(datei)) continue
    name = lies(datei, false)?.name ?? ''
    if (name) break
  }
  if (namenCache.size > 500) namenCache.clear()
  namenCache.set(schluessel, name)
  return name
}

/** Alle Lehrwerke mit Units (gemeinsame, eigene Importe, mitgelieferte; je Kennung die erste Fassung) – für die Wartung */
export function alleLehrwerke(lehrkraftId = ''): (BuchFuerTeilen & { reihe?: string; language?: string })[] {
  const aus = new Map<string, BuchFuerTeilen & { reihe?: string; language?: string }>()
  for (const o of ordnerVon(lehrkraftId)) {
    if (!existsSync(o)) continue
    let dateien: string[] = []
    try {
      dateien = readdirSync(o).filter((f) => f.endsWith('.json'))
    } catch {
      continue
    }
    for (const f of dateien) {
      const b = lies(join(o, f), false) as (BuchFuerTeilen & { reihe?: string; language?: string }) | null
      const id = b?.id || f.replace(/\.json$/, '')
      if (b && b.units.length && !aus.has(id)) aus.set(id, { ...b, id })
    }
  }
  return [...aus.values()]
}

/** Beim Speichern: Abschnitte teilen, falls nötig – null = unverändert */
export function abschnitteBeimSpeichern<T extends TeilBasis, W extends WortBasis>(
  teile: T[],
  woerter: W[],
  quelleJson: string,
  lehrkraftId: string
): { teile: T[]; woerter: W[] } | null {
  try {
    const quelle = json<Partial<Quelle> | null>(quelleJson, null)
    if (!quelle?.lehrwerk) return null
    return kursAbschnitteTeilen(teile, woerter, quelle, (k, band) => buchSync(k, band, lehrkraftId))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- Einmalige Wartung

export function abschnitteTeilen(d: DatabaseSync): string {
  if (!tabelleDa(d, 'vok_zuweisungen')) return 'keine Kurse – nichts geändert'
  for (const s of ['woerter', 'quelle', 'teile', 'titel', 'erstellt']) if (!spalteDa(d, 'vok_zuweisungen', s)) return `Spalte ${s} fehlt – nichts geändert`
  let kurse = 0
  let abschnitte = 0
  let fehler = 0
  for (const z of d.prepare("SELECT id, lehrkraft_id, titel, woerter, quelle, teile, erstellt FROM vok_zuweisungen").all() as Record<
    string,
    unknown
  >[]) {
    // Herkunft ist verschlüsselt – erst nach dem Lesen prüfen
    if (!z.quelle) continue
    try {
      const woerter = json<WortBasis[]>(z.woerter, [])
      if (!Array.isArray(woerter) || woerter.length < 2) continue
      const gespeichert = json<TeilBasis[]>(z.teile, [])
      // Ohne `teile`: ein Abschnitt mit dem Kurstitel (server/vokabeln.ts `teileVon`)
      const teile = Array.isArray(gespeichert) && gespeichert.length ? gespeichert : [{ titel: String(z.titel ?? ''), anzahl: woerter.length, zeit: Date.parse(String(z.erstellt ?? '')) || 0 }]
      const r = abschnitteBeimSpeichern(teile, woerter, String(z.quelle ?? ''), String(z.lehrkraft_id ?? ''))
      if (!r) continue
      d.prepare('UPDATE vok_zuweisungen SET woerter = ?, teile = ? WHERE id = ?').run(JSON.stringify(r.woerter), JSON.stringify(r.teile), String(z.id))
      kurse++
      abschnitte += r.teile.length - teile.length
    } catch {
      fehler++
    }
  }
  return `${kurse} Kurse mit zusammengefassten Abschnitten geteilt (${abschnitte} Abschnitte mehr)${fehler ? `, ${fehler} übersprungen` : ''}`
}

/** Eintrag für wartung.ts */
export const ABSCHNITTE_TEILEN: [string, (d: DatabaseSync) => string] = ['abschnitte-teilen-2026-10-09', abschnitteTeilen]
