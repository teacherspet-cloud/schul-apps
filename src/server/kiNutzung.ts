/**
 * KI-Nutzung der Lehrkräfte über die Schlüssel der SCHULE (09.10.2026, Auftrag des Admins).
 *
 * Für den Reiter „KI-Zugänge" der Verwaltung (Übersicht je Lehrkraft, Balken je Tag) und die
 * Zusammenfassung im Reiter „Server" (serverZustand.ts, `setzeKiNutzungQuelle`).
 *
 * DATENSCHUTZ – ausdrücklicher Wunsch des Admins: Gezählt wird NUR, was über einen API-Schlüssel
 * läuft, den die Schule in „KI-Zugänge" hinterlegt und freigegeben hat. Private Zugänge der
 * Lehrkräfte – eigenes Abo (Codex, Claude Code …) oder eigener API-Schlüssel – werden weder
 * gezählt noch angezeigt (`zugangsArt`, `mitKiNutzung`). Ebenso nichts von Lernenden: Aufrufe im
 * Namen eines Schülerkontos zählen nicht, und gespeichert werden je Tag und Lehrkraft nur Zahlen
 * (Art des Auftrags, Anbieter, Anzahl, Fehler, Limits) – keine Inhalte, keine Titel.
 * Die Zahlen liegen verschlüsselt in `ki_nutzung.daten` (feldschutz.ts) und werden nach
 * 90 Tagen gelöscht.
 */
import type { StructuredRequest } from '@shared/types'
import { istKompatibel } from '@shared/kiAnbieter'
import { alleNutzer, datenbank } from './datenbank'
import type { Aufruf } from './http'

// Arten der Aufträge und Limit-Erkennung: gemeinsam mit dem eigenen Verbrauch der Lehrkraft (09.10.2026, shared/kiArten.ts)
import { artVonSchema, istLimit, KI_ARTEN, type KiArt } from '@shared/kiArten'
export { artVonSchema, istLimit, KI_ARTEN, type KiArt }

export type Zugangsart = 'schule' | 'privat' | 'keiner'

/**
 * Über welchen Zugang läuft die Anfrage? Nur 'schule' wird gezählt.
 * Abo (Kommandozeilenprogramm) oder eigener Schlüssel der Lehrkraft = privat – auch wenn die
 * Schule für denselben Anbieter einen Schlüssel freigegeben hat (der eigene geht vor, settings.ts).
 */
export function zugangsArt(z: { abo: boolean; eigenerSchluessel: boolean; schulSchluessel: boolean }): Zugangsart {
  if (z.abo || z.eigenerSchluessel) return 'privat'
  return z.schulSchluessel ? 'schule' : 'keiner'
}

// ---------------------------------------------------------------- Speicher

interface Zahl {
  /** Anfragen */
  a: number
  /** Aufträge (verschiedene Fortschrittskennungen; ohne Kennung zählt jede Anfrage) */
  j: number
  /** Fehler */
  f: number
  /** davon Limits */
  l: number
}
/** Schlüssel „art|anbieter" → Zahlen */
type TagDaten = Record<string, Zahl>

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ki_nutzung (
  tag TEXT NOT NULL,
  nutzer_id TEXT NOT NULL,
  daten TEXT NOT NULL,
  PRIMARY KEY (tag, nutzer_id)
);`
const bereit = new WeakSet<object>()
const db = (): ReturnType<typeof datenbank> => {
  const d = datenbank()
  if (!bereit.has(d)) {
    d.exec(SCHEMA)
    bereit.add(d)
  }
  return d
}

const tagVon = (d: Date): string => d.toISOString().slice(0, 10)
const HALTEN_TAGE = 90

export interface Nutzungsfall {
  nutzerId: string
  anbieter: string
  art: KiArt
  ergebnis: 'ok' | 'fehler' | 'limit'
  neuerAuftrag: boolean
}

/** Zählt einen Aufruf. Fehler beim Zählen werden verschluckt – Zählen darf nie eine Anfrage scheitern lassen. */
export function merkeKiNutzung(f: Nutzungsfall, jetzt = new Date()): void {
  try {
    const d = db()
    const tag = tagVon(jetzt)
    const zeile = d.prepare('SELECT daten FROM ki_nutzung WHERE tag = ? AND nutzer_id = ?').get(tag, f.nutzerId) as { daten?: string } | undefined
    const daten = lies(zeile?.daten)
    const k = `${f.art}|${f.anbieter}`
    const z = (daten[k] ??= { a: 0, j: 0, f: 0, l: 0 })
    z.a += 1
    if (f.neuerAuftrag) z.j += 1
    if (f.ergebnis !== 'ok') z.f += 1
    if (f.ergebnis === 'limit') z.l += 1
    if (zeile) d.prepare('UPDATE ki_nutzung SET daten = ? WHERE tag = ? AND nutzer_id = ?').run(JSON.stringify(daten), tag, f.nutzerId)
    else d.prepare('INSERT INTO ki_nutzung (tag, nutzer_id, daten) VALUES (?, ?, ?)').run(tag, f.nutzerId, JSON.stringify(daten))
    d.prepare('DELETE FROM ki_nutzung WHERE tag < ?').run(tagVon(new Date(jetzt.getTime() - HALTEN_TAGE * 864e5)))
  } catch {
    // Zählen ist Beiwerk
  }
}

const lies = (s: string | undefined): TagDaten => {
  try {
    return s ? (JSON.parse(s) as TagDaten) : {}
  } catch {
    return {}
  }
}

function zeilenAb(tage: number, jetzt: Date): { tag: string; nutzer_id: string; daten: TagDaten }[] {
  try {
    const ab = tagVon(new Date(jetzt.getTime() - (tage - 1) * 864e5))
    return (db().prepare('SELECT tag, nutzer_id, daten FROM ki_nutzung WHERE tag >= ?').all(ab) as { tag: string; nutzer_id: string; daten: string }[]).map((z) => ({
      tag: z.tag,
      nutzer_id: z.nutzer_id,
      daten: lies(z.daten)
    }))
  } catch {
    return []
  }
}

/** Die letzten `tage` Tage (älteste zuerst) */
export function tageListe(tage: number, jetzt = new Date()): string[] {
  return Array.from({ length: tage }, (_, i) => tagVon(new Date(jetzt.getTime() - (tage - 1 - i) * 864e5)))
}

/** Für den Reiter „Server" (serverZustand.ts): Aufträge und Anfragen je Tag, nur über Schlüssel der Schule */
export function kiNutzungJeTag(tage: number, jetzt = new Date()): { tag: string; auftraege: number; anfragen: number }[] {
  const summe = new Map<string, { auftraege: number; anfragen: number }>()
  for (const z of zeilenAb(tage, jetzt)) {
    const s = summe.get(z.tag) ?? { auftraege: 0, anfragen: 0 }
    for (const w of Object.values(z.daten)) {
      s.auftraege += w.j
      s.anfragen += w.a
    }
    summe.set(z.tag, s)
  }
  return tageListe(tage, jetzt).map((tag) => ({ tag, ...(summe.get(tag) ?? { auftraege: 0, anfragen: 0 }) }))
}

export interface KiLehrkraftZeile {
  id: string
  name: string
  benutzer: string
  anfragen7: number
  anfragen30: number
  auftraege30: number
  /** Anfragen je Tag (30 Tage, älteste zuerst) – für die Verlaufslinie */
  verlauf: number[]
  arten: Partial<Record<KiArt, number>>
  anbieter: Record<string, number>
  fehler: number
  limits: number
}

export interface KiNutzungUebersicht {
  tage: string[]
  /** Anfragen je Tag und Art (gestapelte Balken) */
  jeTag: { tag: string; arten: Partial<Record<KiArt, number>>; summe: number }[]
  lehrkraefte: KiLehrkraftZeile[]
  /** Je Anbieter: wie viele Lehrkräfte ihn in 30 Tagen über die Schule genutzt haben */
  jeAnbieter: Record<string, { lehrkraefte: number; anfragen: number }>
  arten: typeof KI_ARTEN
}

/** Übersicht für den Reiter „KI-Zugänge" (nur Admin; nur Schlüssel der Schule; keine Lernenden) */
export function kiNutzungUebersicht(jetzt = new Date(), tage = 30): KiNutzungUebersicht {
  const liste = tageListe(tage, jetzt)
  const ab7 = liste[Math.max(0, liste.length - 7)]
  const index = new Map(liste.map((t, i) => [t, i]))
  const konten = new Map(alleNutzer().map((n) => [n.id, n]))
  const jeTag = liste.map((tag) => ({ tag, arten: {} as Partial<Record<KiArt, number>>, summe: 0 }))
  const lk = new Map<string, KiLehrkraftZeile>()
  const anbieterNutzer = new Map<string, Set<string>>()
  const anbieterAnfragen = new Map<string, number>()
  for (const z of zeilenAb(tage, jetzt)) {
    const konto = konten.get(z.nutzer_id)
    // Lernende nie (Zählung nimmt sie ohnehin nicht auf – doppelt sicher)
    if (konto?.rolle === 'schueler') continue
    const i = index.get(z.tag)
    if (i === undefined) continue
    const zeile =
      lk.get(z.nutzer_id) ??
      ({
        id: z.nutzer_id,
        name: konto?.name || konto?.benutzer || 'Gelöschtes Konto',
        benutzer: konto?.benutzer ?? '',
        anfragen7: 0,
        anfragen30: 0,
        auftraege30: 0,
        verlauf: liste.map(() => 0),
        arten: {},
        anbieter: {},
        fehler: 0,
        limits: 0
      } satisfies KiLehrkraftZeile)
    for (const [k, w] of Object.entries(z.daten)) {
      const [artRoh, anbieter = '?'] = k.split('|')
      const art = (artRoh in KI_ARTEN ? artRoh : 'sonstiges') as KiArt
      zeile.anfragen30 += w.a
      if (z.tag >= ab7) zeile.anfragen7 += w.a
      zeile.auftraege30 += w.j
      zeile.verlauf[i] += w.a
      zeile.arten[art] = (zeile.arten[art] ?? 0) + w.a
      zeile.anbieter[anbieter] = (zeile.anbieter[anbieter] ?? 0) + w.a
      zeile.fehler += w.f
      zeile.limits += w.l
      jeTag[i].arten[art] = (jeTag[i].arten[art] ?? 0) + w.a
      jeTag[i].summe += w.a
      ;(anbieterNutzer.get(anbieter) ?? anbieterNutzer.set(anbieter, new Set()).get(anbieter)!).add(z.nutzer_id)
      anbieterAnfragen.set(anbieter, (anbieterAnfragen.get(anbieter) ?? 0) + w.a)
    }
    lk.set(z.nutzer_id, zeile)
  }
  return {
    tage: liste,
    jeTag,
    lehrkraefte: [...lk.values()].sort((a, b) => b.anfragen30 - a.anfragen30),
    jeAnbieter: Object.fromEntries([...anbieterNutzer].map(([a, s]) => [a, { lehrkraefte: s.size, anfragen: anbieterAnfragen.get(a) ?? 0 }])),
    arten: KI_ARTEN
  }
}

// ---------------------------------------------------------------- Zählen beim Aufruf

/** Was die Zählung über den angemeldeten Nutzer und seinen Zugang wissen muss (für Tests austauschbar) */
export interface NutzungsUmgebung {
  nutzer: () => { id: string; rolle: string } | undefined
  /** Eingestellter Anbieter und Zugang (Abo/API) für Text bzw. Bild */
  einstellung: () => {
    textProvider: string
    access: Record<string, string>
    imageProvider: string
    imageAccess: Record<string, string>
  }
  /** Hat der Nutzer SELBST einen Schlüssel für diesen Anbieter? */
  eigenerSchluessel: (anbieter: string) => boolean
  /** Hat die Schule einen Schlüssel für diesen Anbieter freigegeben? */
  schulSchluessel: (anbieter: string) => boolean
  merke: (f: Nutzungsfall) => void
}

const KI_KANAELE = new Set(['ai:structured', 'ai:image', 'ai:websuche'])

/** Bereits gezählte Fortschrittskennungen (ein Auftrag mit mehreren Anfragen zählt einmal als Auftrag) */
const gesehen = new Map<string, number>()
const neuerAuftrag = (id: string | undefined): boolean => {
  if (!id) return true
  if (gesehen.has(id)) return false
  gesehen.set(id, Date.now())
  if (gesehen.size > 5000) for (const k of [...gesehen.keys()].slice(0, 1000)) gesehen.delete(k)
  return true
}

/** Umhüllt den Aufruf der Kanäle: zählt KI-Aufrufe über Schlüssel der Schule – sonst nichts */
export function mitKiNutzung(aufruf: Aufruf, u: NutzungsUmgebung): Aufruf {
  return async (kanal, args) => {
    if (!KI_KANAELE.has(kanal)) return aufruf(kanal, args)
    let fall: Omit<Nutzungsfall, 'ergebnis'> | null = null
    try {
      const n = u.nutzer()
      if (n && n.rolle !== 'schueler') {
        const e = u.einstellung()
        const req = kanal === 'ai:structured' && args[0] && typeof args[0] === 'object' ? (args[0] as StructuredRequest) : undefined
        const anbieter = kanal === 'ai:image' ? e.imageProvider : (req?.provider ?? e.textProvider)
        const abo = istKompatibel(anbieter) ? false : (kanal === 'ai:image' ? e.imageAccess[anbieter] : e.access[anbieter]) === 'subscription'
        const art = zugangsArt({ abo, eigenerSchluessel: u.eigenerSchluessel(anbieter), schulSchluessel: u.schulSchluessel(anbieter) })
        // NUR Schlüssel der Schule – private Zugänge werden nicht gezählt (Wunsch des Admins, Datenschutz)
        if (art === 'schule' && anbieter !== 'none') {
          fall = { nutzerId: n.id, anbieter, art: artVonSchema(req?.schemaName, kanal), neuerAuftrag: neuerAuftrag(req?.progressId ?? (typeof args[1] === 'string' ? args[1] : undefined)) }
        }
      }
    } catch {
      fall = null
    }
    try {
      const wert = await aufruf(kanal, args)
      if (fall) u.merke({ ...fall, ergebnis: 'ok' })
      return wert
    } catch (e) {
      const meldung = e instanceof Error ? e.message : String(e)
      const abbruch = e instanceof Error && (e.name === 'AbortError' || /abgebrochen/i.test(meldung))
      if (fall && !abbruch) u.merke({ ...fall, ergebnis: istLimit(meldung) ? 'limit' : 'fehler' })
      throw e
    }
  }
}
