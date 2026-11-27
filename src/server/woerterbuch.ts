/**
 * Wörterbuch-Suche auf dem Server (27.11.2026). Die Datenbank baut scripts/woerterbuch/bauen.py aus offenen Daten; sie
 * liegt unter <DATEN>/woerterbuch/woerterbuch.sqlite (wird einmal hochgeladen, nicht Teil des Server-Pakets) und wird
 * nur gelesen. Fehlt sie, meldet die Suche das freundlich – Blätter funktionieren weiter.
 *
 * Suche:
 *  1. genau (vereinheitlicht, ohne Akzente) – auch über gebeugte Formen („went" → go, „regis" → rex),
 *  2. Wortanfang (in Prüfungen nur 1 und 2),
 *  3. nur auf Arbeitsblättern: ähnliche Wörter bei Tippfehlern (Editierabstand ≤ 2, gleicher Anfangsbuchstabe).
 */
import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DATEN } from './pfade'
import { WOERTERBUCH_QUELLE, woerterbuchNorm, type WoerterbuchAntwort, type WoerterbuchEintrag, type WoerterbuchId } from '../shared/woerterbuecher'

let db: DatabaseSync | null = null
let fehltSeit = 0

export const woerterbuchDatei = (): string => process.env.SCHULAPPS_WOERTERBUCH || join(DATEN, 'woerterbuch', 'woerterbuch.sqlite')

function offen(): DatabaseSync | null {
  if (db) return db
  // Nicht bei jeder Anfrage auf der Platte nachsehen
  if (fehltSeit && Date.now() - fehltSeit < 60_000) return null
  const datei = woerterbuchDatei()
  if (!existsSync(datei)) {
    fehltSeit = Date.now()
    return null
  }
  db = new DatabaseSync(datei, { readOnly: true })
  return db
}

export const woerterbuchDa = (): boolean => offen() !== null

interface Zeile {
  id: number
  lemma: string
  wortart: string
  daten: string
}

/**
 * Zweiter Schulfilter beim Lesen (27.11.2026): Wiktionary markiert manche derben Bedeutungen nur als „slang" bzw.
 * „umgangssprachlich" (Befund beim Bau: en „cock" → „to copulate … fuck"). Bedeutungen mit eindeutig derben Wörtern
 * fallen weg. Faustregel, bewusst kurz – normale sexualkundliche Begriffe bleiben.
 */
const DERB = /(?<!\p{L})(fuck|cunt|wanker|wanking|bitch|whore|fick|vögeln|vögelt|wichs|hure|fotze|nutte)/iu

const eintrag = (z: Zeile, ueberForm?: string): WoerterbuchEintrag => {
  let daten: WoerterbuchEintrag['daten'] = {}
  try {
    daten = JSON.parse(z.daten) as WoerterbuchEintrag['daten']
  } catch {
    /* kaputter Eintrag: leer */
  }
  if (daten.bedeutungen) daten.bedeutungen = daten.bedeutungen.filter((b) => !DERB.test(b.text) && !(b.beispiele ?? []).some((x) => DERB.test(x)))
  return { lemma: z.lemma, wortart: z.wortart, ...(ueberForm ? { ueberForm } : {}), daten }
}

function abstand(a: string, b: string, grenze: number): number {
  if (Math.abs(a.length - b.length) > grenze) return grenze + 1
  const z = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let vor = z[0]
    z[0] = i
    let min = z[0]
    for (let j = 1; j <= b.length; j++) {
      const alt = z[j]
      z[j] = Math.min(z[j] + 1, z[j - 1] + 1, vor + (a[i - 1] === b[j - 1] ? 0 : 1))
      vor = alt
      if (z[j] < min) min = z[j]
    }
    if (min > grenze) return grenze + 1
  }
  return z[b.length]
}

/** Nachschlagen; `exakt` = Prüfung (keine ähnlichen Wörter). Wirft „fehlt", wenn die Datenbank nicht da ist. */
export function nachschlagen(wb: WoerterbuchId, eingabe: string, exakt: boolean): WoerterbuchAntwort {
  const d = offen()
  if (!d) throw new Error('fehlt')
  const q = woerterbuchNorm(eingabe).slice(0, 60)
  const aus: WoerterbuchAntwort = { treffer: [], quelle: WOERTERBUCH_QUELLE }
  if (!q) return aus
  const gesehen = new Set<number>()
  const dazu = (zs: Zeile[], form?: string): void => {
    for (const z of zs) {
      if (gesehen.has(z.id) || aus.treffer.length >= 12) continue
      gesehen.add(z.id)
      aus.treffer.push(eintrag(z, form))
    }
  }
  // 1. genau
  dazu(d.prepare('SELECT id, lemma, wortart, daten FROM eintrag WHERE wb = ? AND norm = ? ORDER BY rang LIMIT 8').all(wb, q) as unknown as Zeile[])
  // … und über gebeugte Formen
  const formen = d
    .prepare('SELECT e.id, e.lemma, e.wortart, e.daten FROM form f JOIN eintrag e ON e.id = f.lemma_id WHERE f.wb = ? AND f.norm = ? ORDER BY e.rang LIMIT 6')
    .all(wb, q) as unknown as Zeile[]
  dazu(formen, eingabe.trim())
  // 2. Wortanfang (nur, wenn genau nichts oder wenig kam)
  if (aus.treffer.length < 4) {
    const bis = `${q}￿`
    dazu(d.prepare('SELECT id, lemma, wortart, daten FROM eintrag WHERE wb = ? AND norm > ? AND norm < ? ORDER BY length(norm), rang LIMIT 8').all(wb, q, bis) as unknown as Zeile[])
  }
  // 3. ähnliche Wörter (nicht in Prüfungen)
  if (!exakt && !aus.treffer.length && q.length >= 3) {
    const kandidaten = d
      .prepare('SELECT DISTINCT norm, lemma FROM eintrag WHERE wb = ? AND norm >= ? AND norm < ? AND length(norm) BETWEEN ? AND ? LIMIT 4000')
      .all(wb, q[0], `${q[0]}￿`, q.length - 2, q.length + 2) as { norm: string; lemma: string }[]
    const grenze = q.length <= 5 ? 1 : 2
    aus.aehnlich = [
      ...new Set(
        kandidaten
          .map((k) => ({ k, a: abstand(q, k.norm, grenze) }))
          .filter((x) => x.a <= grenze)
          .sort((x, y) => x.a - y.a)
          .map((x) => x.k.lemma)
      )
    ].slice(0, 6)
  }
  return aus
}

/** Nur für Tests */
export function woerterbuchSchliessen(): void {
  db?.close()
  db = null
  fehltSeit = 0
}
