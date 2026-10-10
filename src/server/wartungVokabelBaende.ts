/**
 * Band je Vokabel-Abschnitt nachtragen (10.10.2026, Befund der Lehrkraft; Regeln und Ursache: shared/vokabelBaende.ts).
 *
 * Einmalige Wartung `vokabel-baende-2026-10-10`: Jeder Kurs (vok_zuweisungen) bekommt je Abschnitt ohne Lehrwerk-Kennung
 * das Lehrwerk (und, wo der Titel sie nicht nennt, die Unit) – aus dem Band im Titel bzw. über die Wörter. Kandidaten sind
 * die Lehrwerke der Reihe aus der Herkunft des Kurses und die Bände, die Titel nennen (gemeinsame, eigene Importe der
 * Lehrkraft, mitgelieferte). Wörter, Kennungen, Freigabezeit und Lernstand bleiben unverändert.
 *
 * Wörter, Titel und Herkunft sind verschlüsselt (feldschutz.ts): gelesen und geschrieben wird über den geschützten
 * Zugang, den `datenbank()` der Wartung übergibt. Das Protokoll nennt nur Zahlen.
 */
import type { DatabaseSync } from 'node:sqlite'
import { baendeErgaenzen, type TeilMitBand } from '../shared/vokabelBaende'
import { bandImTitel, vergleich, type WortBasis } from '../shared/abschnitteTeilen'
import type { Quelle } from '../shared/vokabelLaufbahn'
import { alleLehrwerke } from './wartungAbschnitteTeilen'

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

type Buch = ReturnType<typeof alleLehrwerke>[number]

/** Infrage kommende Lehrwerke: die Reihe der Herkunft (gleiche Reihe bzw. gleicher Kennungsstamm) und die genannten Bände */
export function kandidaten(buecher: Buch[], quelle: Partial<Quelle> | null, titel: string[]): Buch[] {
  const kennung = quelle?.lehrwerk ?? ''
  const eigenes = buecher.find((b) => b.id === kennung)
  const stamm = kennung.replace(/-?\d+$/, '')
  const genannt = new Set(titel.map(bandImTitel).filter(Boolean).map(vergleich))
  return buecher.filter(
    (b) =>
      b.id === kennung ||
      genannt.has(vergleich(b.name)) ||
      (eigenes?.reihe && b.reihe === eigenes.reihe && b.language === eigenes.language) ||
      (stamm.length >= 3 && (b.id ?? '').replace(/-?\d+$/, '') === stamm)
  )
}

export function vokabelBaende(d: DatabaseSync): string {
  if (!tabelleDa(d, 'vok_zuweisungen')) return 'keine Kurse – nichts geändert'
  for (const s of ['woerter', 'quelle', 'teile', 'titel', 'erstellt', 'lehrkraft_id'])
    if (!spalteDa(d, 'vok_zuweisungen', s)) return `Spalte ${s} fehlt – nichts geändert`
  const jeLehrkraft = new Map<string, Buch[]>()
  let kurse = 0
  let abschnitte = 0
  for (const z of d.prepare('SELECT id, lehrkraft_id, titel, woerter, quelle, teile, erstellt FROM vok_zuweisungen').all() as Record<string, unknown>[]) {
    try {
      const woerter = json<WortBasis[]>(z.woerter, [])
      if (!Array.isArray(woerter) || !woerter.length) continue
      const gespeichert = json<TeilMitBand[]>(z.teile, [])
      // Ohne `teile`: ein Abschnitt mit dem Kurstitel (server/vokabeln.ts `teileVon`)
      const teile: TeilMitBand[] =
        Array.isArray(gespeichert) && gespeichert.length ? gespeichert : [{ titel: String(z.titel ?? ''), anzahl: woerter.length, zeit: Date.parse(String(z.erstellt ?? '')) || 0 }]
      if (teile.every((t) => t.lehrwerk)) continue
      const lk = String(z.lehrkraft_id ?? '')
      if (!jeLehrkraft.has(lk)) jeLehrkraft.set(lk, alleLehrwerke(lk))
      const quelle = json<Partial<Quelle> | null>(z.quelle, null)
      const buecher = kandidaten(jeLehrkraft.get(lk)!, quelle, [String(z.titel ?? ''), ...teile.map((t) => t.titel)])
      const neu = baendeErgaenzen(teile, woerter, buecher)
      if (!neu) continue
      d.prepare('UPDATE vok_zuweisungen SET teile = ? WHERE id = ?').run(JSON.stringify(neu), String(z.id))
      kurse++
      abschnitte += neu.filter((t, i) => t.lehrwerk && !teile[i].lehrwerk).length
    } catch {
      // ein kaputter Kurs hält die übrigen nicht auf
    }
  }
  return `${abschnitte} Abschnitte in ${kurse} Kursen mit Band versehen`
}

export const VOKABEL_BAENDE: [string, (d: DatabaseSync) => string] = ['vokabel-baende-2026-10-10', vokabelBaende]
