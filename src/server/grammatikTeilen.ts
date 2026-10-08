/**
 * Ein Grammatiktraining je Thema (08.10.2026, abgestimmt mit der Lehrkraft): Gibt die Lehrkraft mehrere Grammatikthemen
 * auf einmal frei („Bestimmter/unbestimmter Artikel · Das Verb be · Kurzantworten"), entsteht je Thema ein eigenes
 * Training mit seinen Regeln und Aufgaben – gleicher Kurs, gleiche Empfänger und Einstellungen. Bei den Lernenden steht
 * so jedes Thema als eigene Karte im Ordner.
 *
 * Zuordnung der Regeln zu den Themen:
 *  1. `regel.thema` (seit 08.10.2026 nennt die KI das Thema je Regelkarte, grammatikErzeugen.ts);
 *  2. sonst nach Wörtern des Regeltitels gegen die Themennamen (aus dem Titel, „ · " getrennt), mit wenigen Synonymen
 *     („a oder an" → Artikel); längere Treffer zählen mehr („Fragen und Kurzantworten mit be" → Kurzantworten);
 *  3. ohne Treffer das Thema der Regel davor (die KI schreibt die Regeln Thema für Thema), ganz vorn das erste Thema.
 * Aufgaben folgen ihrer Regel (`regelId`).
 *
 * `grammatikThemenTeilen` ist die einmalige Wartung für bereits freigegebene Trainings (wartung.ts): Die erste Gruppe
 * behält die Kennung (Links, Codes, Gäste bleiben), weitere Themen bekommen neue Zeilen; der Lernstand je Aufgabe zieht
 * mit um. Geschrieben wird über den geschützten Zugang (feldschutz.ts verschlüsselt schueler und daten).
 */
import { randomBytes } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { GrammatikPaket, GrammatikRegel } from '../shared/grammatiktrainer'

export interface ThemenGruppe {
  /** Themenname (Katalog-Bezeichnung) – Titel des Trainings */
  titel: string
  /** Katalog-Kennung, falls sie sich aus den Angaben der Freigabe ergibt („en.verb.be_have") */
  themaId: string
  paket: GrammatikPaket
  /** Angaben der Freigabe für dieses Thema (themen/teilformen eingeschränkt) */
  info: Record<string, unknown>
}

export interface Teilung {
  gruppen: ThemenGruppe[]
  /** Unsichere Zuordnungen – fürs Protokoll */
  hinweise: string[]
}

const STOPP = new Set([
  'und',
  'oder',
  'mit',
  'ohne',
  'im',
  'in',
  'am',
  'der',
  'die',
  'das',
  'den',
  'dem',
  'des',
  'ein',
  'eine',
  'einer',
  'einem',
  'von',
  'vom',
  'zu',
  'zum',
  'zur',
  'fuer',
  'auf',
  'bei',
  'als',
  'wie',
  'nach',
  'vs'
])

/** Wenige Synonyme der Themenwörter (Wort im Themennamen → Wörter, die in Regeltiteln dafür stehen) */
const SYNONYME: Record<string, string[]> = {
  artikel: ['a', 'an', 'the', 'artikel'],
  be: ['be', 'am', 'is', 'are', 'was', 'were'],
  have: ['have', 'has', 'had'],
  can: ['can', 'cant'],
  plural: ['plural', 'mehrzahl']
}

const woerter = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPP.has(w))

const passt = (a: string, b: string): boolean => a === b || (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a)))

/** Punkte eines Regeltitels für ein Thema: Summe der Längen der Wörter, die im Thema (oder als Synonym) vorkommen */
export function themenTreffer(regelTitel: string, thema: string): number {
  const themenWoerter = new Set(woerter(thema).flatMap((w) => [w, ...(SYNONYME[w] ?? [])]))
  let punkte = 0
  for (const w of new Set(woerter(regelTitel))) if ([...themenWoerter].some((t) => passt(w, t))) punkte += w.length
  return punkte
}

/** Themennamen aus einem Titel („A · B · C"), ohne Doppelte */
export const themenAusTitel = (titel: string): string[] => [
  ...new Set(
    titel
      .split(' · ')
      .map((t) => t.trim())
      .filter(Boolean)
  )
]

const gleich = (a: string, b: string): boolean => woerter(a).join(' ') === woerter(b).join(' ')

/**
 * Ein Paket nach Themen aufteilen. Ergebnis mit genau einer Gruppe, wenn es nichts zu teilen gibt (ein Thema,
 * Verbkarten, oder am Ende hat nur ein Thema Aufgaben).
 */
export function themenTeilung(paket: GrammatikPaket, info: Record<string, unknown>, titel: string): Teilung {
  const hinweise: string[] = []
  const einzeln: Teilung = { gruppen: [{ titel, themaId: '', paket, info }], hinweise }
  if (paket.verben?.length || paket.regeln.length < 2) return einzeln
  // Themen: aus dem Titel, sonst aus dem Paket-Thema; Themen der Regeln, die dort fehlen, hinten an
  const ausTitel = themenAusTitel(titel).length > 1 ? themenAusTitel(titel) : themenAusTitel(paket.thema ?? '')
  const themen = [...ausTitel]
  for (const r of paket.regeln) if (r.thema && !themen.some((t) => gleich(t, r.thema!))) themen.push(r.thema)
  if (themen.length < 2) return einzeln
  const themenIds = Array.isArray(info.themen) ? (info.themen as unknown[]).map(String) : []
  // Kennungen nur, wenn sie eindeutig zu den Namen im Titel passen (gleiche Anzahl, gleiche Reihenfolge wie beim Freigeben)
  const idVon = (i: number): string => (ausTitel.length === themenIds.length && i < ausTitel.length ? themenIds[i] : '')

  // Regeln zuordnen
  const zuordnung: number[] = []
  paket.regeln.forEach((r, i) => {
    if (r.thema) {
      const j = themen.findIndex((t) => gleich(t, r.thema!))
      if (j >= 0) return void (zuordnung[i] = j)
    }
    const punkte = themen.map((t) => themenTreffer(r.titel, t))
    const best = Math.max(...punkte)
    const beste = punkte.flatMap((p, j) => (p === best ? [j] : []))
    const davor = i > 0 ? zuordnung[i - 1] : -1
    if (best > 0 && beste.length === 1) return void (zuordnung[i] = beste[0])
    if (best > 0) {
      // Gleichstand: das Thema der Regel davor, wenn es dabei ist, sonst das erste der besten
      zuordnung[i] = beste.includes(davor) ? davor : beste[0]
      hinweise.push(`Regel „${r.titel}" passt gleich gut zu ${beste.map((j) => `„${themen[j]}"`).join(' und ')} → „${themen[zuordnung[i]]}"`)
      return
    }
    zuordnung[i] = davor >= 0 ? davor : 0
    hinweise.push(`Regel „${r.titel}" ohne Treffer im Titel → „${themen[zuordnung[i]]}" (${davor >= 0 ? 'wie die Regel davor' : 'erstes Thema'})`)
  })

  const regelThema = new Map(paket.regeln.map((r, i) => [r.id, zuordnung[i]]))
  const roh = themen.map((t, j) => ({
    titel: t,
    themaId: idVon(j),
    regeln: paket.regeln.filter((_, i) => zuordnung[i] === j).map((r): GrammatikRegel => ({ ...r, thema: t })),
    aufgaben: paket.aufgaben.filter((a) => (regelThema.get(a.regelId) ?? 0) === j)
  }))
  // Themen ohne Aufgaben: ihre Regeln gehen zum ersten Thema mit Aufgaben (Regeln ohne Aufgaben stören nicht)
  const mit = roh.filter((g) => g.aufgaben.length)
  if (mit.length < 2) return einzeln
  for (const g of roh)
    if (!g.aufgaben.length && g.regeln.length) {
      mit[0].regeln.push(...g.regeln)
      hinweise.push(`Thema „${g.titel}" ohne Aufgaben – Regeln bleiben bei „${mit[0].titel}"`)
    }
  const teilformen = Array.isArray(info.teilformen) ? (info.teilformen as unknown[]).map(String) : []
  return {
    gruppen: mit.map((g) => ({
      titel: g.titel,
      themaId: g.themaId,
      paket: { ...paket, thema: g.titel, regeln: g.regeln, aufgaben: g.aufgaben },
      info: g.themaId ? { ...info, themen: [g.themaId], teilformen: teilformen.filter((t) => t === g.themaId || t.startsWith(`${g.themaId}/`)) } : info
    })),
    hinweise
  }
}

// ---------------------------------------------------------------- Einmalige Wartung (wartung.ts)

const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function freierCode(d: DatabaseSync): string {
  for (;;) {
    const c = Array.from(randomBytes(6), (b) => CODE_ZEICHEN[b % CODE_ZEICHEN.length]).join('')
    if (!d.prepare('SELECT 1 FROM gram_zuweisungen WHERE code = ?').get(c)) return c
  }
}

const json = <T>(s: unknown, r: T): T => {
  try {
    return typeof s === 'string' && s ? (JSON.parse(s) as T) : r
  } catch {
    return r
  }
}

interface Stand {
  aufgaben?: Record<string, unknown>
  tage?: string[]
  rekorde?: Record<string, number>
  ansehen?: string[]
}

/**
 * Bestehende Kurs-Grammatik (art '') mit mehreren Themen teilen. Mehrfach aufrufbar – geteilte Trainings haben nur noch
 * ein Thema. Ergebnis: Anzahl geteilter Trainings; `melde` bekommt je Teilung eine Zeile (und Hinweise).
 */
export function grammatikThemenTeilen(d: DatabaseSync, melde: (zeile: string) => void = () => undefined): number {
  if (!d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'gram_zuweisungen'").get()) return 0
  const spalten = (d.prepare('PRAGMA table_info(gram_zuweisungen)').all() as { name: string }[]).map((s) => s.name)
  const hat = (s: string): boolean => spalten.includes(s)
  const standDa = Boolean(d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'gram_stand'").get())
  const gaesteDa = Boolean(d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'gram_gaeste'").get())
  // `art` ist verschlüsselt (feldschutz.ts, 08.10.2026) – Kurs-Grammatik (art '') nach dem Entschlüsseln auswählen
  const zeilen = (d.prepare('SELECT * FROM gram_zuweisungen ORDER BY erstellt, rowid').all() as Record<string, unknown>[]).filter(
    (z) => !hat('art') || !z.art
  )
  let geteilt = 0
  for (const z of zeilen) {
    const paket = json<GrammatikPaket | null>(z.paket, null)
    if (!paket || !Array.isArray(paket.regeln) || !Array.isArray(paket.aufgaben)) continue
    const info = json<Record<string, unknown>>(z.info, {})
    const { gruppen, hinweise } = themenTeilung(paket, info, String(z.titel ?? ''))
    if (gruppen.length < 2) continue
    const id = String(z.id)
    const ids = [id, ...gruppen.slice(1).map(() => randomBytes(8).toString('hex'))]
    const jeAufgabe = new Map<string, number>()
    gruppen.forEach((g, i) => g.paket.aufgaben.forEach((a) => jeAufgabe.set(a.id, i)))
    // Aufgaben, die nicht (mehr) im Paket stehen, bleiben beim ersten Thema
    const gruppeVon = (aid: string): number => jeAufgabe.get(aid) ?? 0
    const teilen = <T>(o: Record<string, T>): Record<string, T>[] => {
      const aus = gruppen.map(() => ({}) as Record<string, T>)
      for (const [k, v] of Object.entries(o)) aus[gruppeVon(k)][k] = v
      return aus
    }
    const problemAus = teilen(json<Record<string, number>>(z.problem_aus, {}))
    d.exec('BEGIN')
    try {
      // Erstes Thema: die bisherige Zeile
      const g0 = gruppen[0]
      const setze: [string, unknown][] = [
        ['titel', g0.titel],
        ['thema', g0.titel],
        ['paket', JSON.stringify(g0.paket)],
        ...(hat('info') ? ([['info', JSON.stringify(g0.info)]] as [string, unknown][]) : []),
        ...(hat('problem_aus') && z.problem_aus ? ([['problem_aus', JSON.stringify(problemAus[0])]] as [string, unknown][]) : [])
      ]
      d.prepare(`UPDATE gram_zuweisungen SET ${setze.map(([s]) => `${s} = ?`).join(', ')} WHERE id = ?`).run(...(setze.map(([, w]) => w) as never[]), id)
      // Weitere Themen: alle Spalten übernehmen, außer Kennung, Titel, Thema, Paket, Angaben, ausgeblendeten Problemen, Code
      for (let i = 1; i < gruppen.length; i++) {
        const g = gruppen[i]
        const werte: Record<string, unknown> = {
          ...z,
          id: ids[i],
          titel: g.titel,
          thema: g.titel,
          paket: JSON.stringify(g.paket),
          ...(hat('info') ? { info: JSON.stringify(g.info) } : {}),
          ...(hat('problem_aus') ? { problem_aus: z.problem_aus ? JSON.stringify(problemAus[i]) : '' } : {}),
          // Codes sind eindeutig: neuer Code, wenn das Training einen hatte
          ...(hat('code') ? { code: z.code ? freierCode(d) : '' } : {})
        }
        d.prepare(`INSERT INTO gram_zuweisungen (${spalten.join(', ')}) VALUES (${spalten.map(() => '?').join(', ')})`).run(
          ...(spalten.map((s) => werte[s] ?? null) as never[])
        )
        // Per Code beigetretene: auch in den neuen Trainings
        if (gaesteDa)
          for (const gast of d.prepare('SELECT nutzer_id, wieder FROM gram_gaeste WHERE zuweisung_id = ?').all(id) as { nutzer_id: string; wieder: string }[])
            d.prepare('INSERT OR IGNORE INTO gram_gaeste (zuweisung_id, nutzer_id, wieder) VALUES (?, ?, ?)').run(ids[i], gast.nutzer_id, gast.wieder)
      }
      // Lernstand: je Person die Aufgaben (und „nochmal ansehen") zum neuen Training; Übungstage auch dort, Rekorde bleiben
      let personen = 0
      if (standDa)
        for (const s of d.prepare('SELECT schueler_id, daten, aktualisiert FROM gram_stand WHERE zuweisung_id = ?').all(id) as {
          schueler_id: string
          daten: string
          aktualisiert: number
        }[]) {
          const st = json<Stand>(s.daten, {})
          const aufgaben = teilen(st.aufgaben ?? {})
          const ansehen = gruppen.map((_, i) => (st.ansehen ?? []).filter((a) => gruppeVon(a) === i))
          d.prepare('UPDATE gram_stand SET daten = ? WHERE zuweisung_id = ? AND schueler_id = ?').run(
            JSON.stringify({ ...st, aufgaben: aufgaben[0], ...(st.ansehen ? { ansehen: ansehen[0] } : {}) }),
            id,
            s.schueler_id
          )
          for (let i = 1; i < gruppen.length; i++) {
            if (!Object.keys(aufgaben[i]).length && !ansehen[i].length) continue
            d.prepare('INSERT OR REPLACE INTO gram_stand (zuweisung_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?)').run(
              ids[i],
              s.schueler_id,
              JSON.stringify({ aufgaben: aufgaben[i], tage: [...(st.tage ?? [])], ...(ansehen[i].length ? { ansehen: ansehen[i] } : {}) }),
              s.aktualisiert
            )
          }
          personen++
        }
      d.exec('COMMIT')
      geteilt++
      melde(
        // Ohne Titel (08.10.2026): das Diagnoseprotokoll nennt nur Kennungen und Zahlen
        `Grammatik ${id} in ${gruppen.length} Trainings geteilt: ${gruppen
          .map((g, i) => `${ids[i]} (${g.paket.regeln.length} Regeln, ${g.paket.aufgaben.length} Aufgaben)`)
          .join(' · ')}; Lernstand von ${personen} Personen aufgeteilt`
      )
      for (const h of hinweise) melde(`  Hinweis (${id}): ${h}`)
    } catch (e) {
      d.exec('ROLLBACK')
      melde(`Grammatik ${id} NICHT geteilt: ${e instanceof Error ? e.name : 'Fehler'}`)
    }
  }
  return geteilt
}
