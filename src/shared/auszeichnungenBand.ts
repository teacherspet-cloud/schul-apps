/**
 * Umfang eines Lehrwerksbands für die Jahresreihen der Medaillen (10.10.2026, Entscheidung der Lehrkraft; Formeln in
 * shared/auszeichnungen.ts `jahresSchwellen`, Konzept recherche/achievements-medaillen-titel.md Abschnitt 7).
 *
 *  - Wörter: verschiedene Begriffe des Bands (Kernform, klein) – Grundlage für „Wortschatz sicher".
 *  - Kapitel: Units/Kapitel mit Wörtern – Grundlage für „Lehrwerk-Etappen".
 *  - Grammatik: Grammatikthemen des Bands aus der Grammatikliste (Green Line, Liste der Lehrkraft; nur neu eingeführte,
 *    keine Wiederholungen, keine optionalen Trailer) bzw. bei Latein die Grammatik-Stichwörter der Lektionen dieses
 *    Lernjahres (Pontes, Campus, prima …; Lernjahr = Jahrgang − 5, Latein ab Klasse 6).
 * Rein rechnend: Bände reicht der Server herein. Platzhalter ohne Wörter (¡Apúntate!, Découvertes) liefern null – dann
 * gelten die Jahrgangstabellen.
 */
import { istOptional, LEHRWERK_GRAMMATIK } from '../renderer/src/shared/lehrwerkGrammatik'
import { LEHRWERK_THEMEN } from '../renderer/src/shared/lehrwerkThemen'
import { kernform } from './vokabeltrainer'

export interface BandFuerZahlen {
  id: string
  name: string
  units: { name: string; sections: { name: string; entries: { term: string }[] }[] }[]
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const begriff = (t: string): string => kernform(String(t ?? '')).toLowerCase()

/** Verschiedene Wörter eines Bands (null ohne Wörter) */
export function bandWoerter(b: BandFuerZahlen): number | null {
  const s = new Set<string>()
  for (const u of b.units ?? []) for (const a of u.sections ?? []) for (const e of a.entries ?? []) if (e?.term && begriff(e.term)) s.add(begriff(e.term))
  return s.size || null
}

/** Kapitel eines Bands mit Wörtern (null ohne) */
export function bandKapitel(b: BandFuerZahlen): number | null {
  const s = new Set<string>()
  for (const u of b.units ?? []) if ((u.sections ?? []).some((a) => (a.entries ?? []).some((e) => e?.term))) s.add(u.name)
  return s.size || null
}

/** Band der Grammatikliste zu Kennung oder Name („green-line-3-nds" / „Green Line 3" → „Green Line 3") */
export function grammatikBandZu(...namen: string[]): string | undefined {
  for (const name of namen) {
    const n = norm(name ?? '')
    if (!n) continue
    const b = Object.keys(LEHRWERK_GRAMMATIK)
      .filter((x) => n.startsWith(norm(x)))
      .sort((a, c) => c.length - a.length)[0]
    if (b) return b
  }
  return undefined
}

/** Grammatikthemen eines Green-Line-Bands: neu eingeführte Punkte mit Katalogthema, ohne optionale Trailer */
export function grammatikImBand(band: string): number | null {
  const kapitel = LEHRWERK_GRAMMATIK[band]
  if (!kapitel) return null
  const s = new Set<string>()
  for (const [k, stationen] of Object.entries(kapitel)) {
    if (istOptional(k)) continue
    for (const punkte of Object.values(stationen)) for (const p of punkte) if (p.t.length && !p.w) s.add(norm(p.text))
  }
  return s.size || null
}

/** Lateinisches Lehrwerk zu einem Namen („Pontes", „prima.nova") */
export function lateinBuch(name: string): string | undefined {
  const n = norm(name)
  return n ? Object.keys(LEHRWERK_THEMEN).find((b) => LEHRWERK_THEMEN[b].fach === 'latein' && norm(b) === n) : undefined
}

/** Lernjahr in Latein aus dem Jahrgang (Latein als zweite Fremdsprache ab Klasse 6) */
export const lateinLernjahr = (jahrgang: number | null | undefined): number | null => (jahrgang && jahrgang >= 5 ? Math.max(1, jahrgang - 5) : null)

/** Grammatik-Stichwörter der Lektionen eines Lernjahres (mit „; " getrennt) – null, wenn das Lernjahr keine Lektionen hat */
export function grammatikLatein(buch: string, lernjahr: number | null): { grammatik: number; lektionen: number } | null {
  const b = lateinBuch(buch)
  if (!b || !lernjahr) return null
  const kap = Object.values(LEHRWERK_THEMEN[b].kapitel).filter((k) => k.lernjahr === lernjahr)
  if (!kap.length) return null
  const s = new Set<string>()
  for (const k of kap)
    for (const teil of String(k.grammatik ?? '').split(/\s*;\s*/))
      if (norm(teil)) s.add(norm(teil))
  return s.size ? { grammatik: s.size, lektionen: kap.length } : null
}

/** Band unter mehreren wählen: der zum Jahrgang (grade), sonst der höchste (Nummer am Ende des Namens) */
export function bandFuerJahr<B extends { name: string; grade?: number; band?: string }>(baende: B[], jahrgang: number | null | undefined): B | null {
  if (!baende.length) return null
  const passend = jahrgang ? baende.find((b) => Number(b.grade) === jahrgang) : undefined
  if (passend) return passend
  const nummer = (b: B): number => {
    const n = /(\d+)\s*$/.exec(b.name) ?? /(\d+)/.exec(String(b.band ?? ''))
    return n ? Number(n[1]) : /transition/i.test(b.name) ? 50 : 0
  }
  return [...baende].sort((a, b) => nummer(b) - nummer(a))[0]
}
