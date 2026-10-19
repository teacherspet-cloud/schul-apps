/**
 * Aufgabenbank der Grammatik am Server (13.10.2026, mit der Lehrkraft abgestimmt; Regeln in shared/grammatikBank.ts).
 *
 * Schulweit EINMAL je Schlüssel (Teilbereich, gemischt je Punkt, gemischt je Unit): eine Regelkarte und die Aufgaben.
 * Lesen dürfen alle Lehrkräfte; ändern Admins und Fachobleute des Fachs (wie die Grammatikformen,
 * main/services/rolle.ts `darfLehrwerkSprache`). Ist für einen Schlüssel noch nichts hinterlegt, darf jede Lehrkraft
 * ihn füllen („Grammatik hinzufügen" ohne Aufgaben: die KI erzeugt sie, und sie bleiben für den nächsten Kurs).
 * Nach jedem Speichern baut grammatik.ts die Pakete der Kurse neu, die auf den Schlüssel verweisen.
 *
 *   GET  /server/grammatik-bank?sprache=en           → { zahlen, darf }   (Aufgaben je Schlüssel und Übungsart)
 *   POST /server/grammatik-bank/lesen   {schluessel[]} → { eintraege }
 *   POST /server/grammatik-bank/speichern {sprache, schluessel, regel, aufgaben} → { zahlen, kurse }
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { RESSOURCEN } from './pfade'
import { datenbank, protokolliereServer, serverWert } from './datenbank'
import { alsNutzer, json, type Anfrage } from './http'
import { imNutzer } from './kontext'
import { darfLehrwerkSprache } from '../main/services/rolle'
import { BANK_GRENZEN, paketBereinigt } from '../shared/grammatiktrainer'
import {
  formVon,
  istStufe,
  istUebung,
  ohneDoppelte,
  regelIdVon,
  schluesselGueltig,
  type BankAufgabe,
  type BankEintrag,
  type BankRegel,
  type BankZahlen,
  type Uebung
} from '../shared/grammatikBank'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS gram_bank (
  id TEXT PRIMARY KEY,
  sprache TEXT NOT NULL,
  schluessel TEXT NOT NULL,
  form TEXT NOT NULL DEFAULT '',
  uebung TEXT NOT NULL,
  pos INTEGER NOT NULL DEFAULT 0,
  bank_aufgabe TEXT NOT NULL,
  geaendert TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS gram_bank_schluessel ON gram_bank(schluessel);
CREATE TABLE IF NOT EXISTS gram_bank_regel (
  schluessel TEXT PRIMARY KEY,
  sprache TEXT NOT NULL,
  bank_regel TEXT NOT NULL,
  geaendert TEXT NOT NULL
);`

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    // Stufe je Aufgabe (13.10.2026): g grundlegend, m mittel, a anspruchsvoll – Bisheriges gilt als mittel
    const spalten = new Set((d.prepare('PRAGMA table_info(gram_bank)').all() as { name: string }[]).map((s) => s.name))
    if (!spalten.has('niveau')) d.exec("ALTER TABLE gram_bank ADD COLUMN niveau TEXT NOT NULL DEFAULT 'm'")
    bereit = true
    doppelteEinmal(d)
  }
  return d
}

/**
 * Grundbestand (19.10.2026, Wunsch der Lehrkraft: „sodass sie auch auf einem völlig neuen Server schon vorhanden wären"):
 * resources/grammatik-bank/grundbestand.json.gz ist die entschlüsselte Bank des Schulservers vom 19.10.2026. Ein Server
 * mit LEERER Bank spielt sie einmal ein (verschlüsselt wie jede Bank-Zeile); eine vorhandene Bank bleibt unberührt.
 * Gemerkt in `wartung` – danach bewusst Geleertes kommt nicht wieder. Aufgerufen beim Start des Servers (start.ts), nicht
 * beim ersten Zugriff – Tests mit eigener Datenbank bleiben leer.
 */
interface Grundbestand {
  regeln: { schluessel: string; sprache: string; bank_regel: unknown; geaendert: string }[]
  aufgaben: { id: string; sprache: string; schluessel: string; form: string; uebung: string; niveau: string; pos: number; bank_aufgabe: unknown; geaendert: string }[]
}
export const bankGrundbestand = (): number => grundbestandEinmal(db())
export function grundbestandEinmal(d: ReturnType<typeof datenbank>, datei = join(RESSOURCEN, 'grammatik-bank', 'grundbestand.json.gz')): number {
  const name = 'grammatik-bank-grundbestand-2026-10-19'
  try {
    d.exec('CREATE TABLE IF NOT EXISTS wartung (name TEXT PRIMARY KEY, erledigt TEXT NOT NULL)')
    if (d.prepare('SELECT 1 FROM wartung WHERE name = ?').get(name)) return 0
    const leer =
      !d.prepare('SELECT 1 FROM gram_bank LIMIT 1').get() && !d.prepare('SELECT 1 FROM gram_bank_regel LIMIT 1').get()
    let n = 0
    if (leer && existsSync(datei)) {
      const g = JSON.parse(gunzipSync(readFileSync(datei)).toString('utf8')) as Grundbestand
      d.exec('BEGIN')
      try {
        const regel = d.prepare('INSERT OR IGNORE INTO gram_bank_regel (schluessel, sprache, bank_regel, geaendert) VALUES (?, ?, ?, ?)')
        for (const r of g.regeln) regel.run(r.schluessel, r.sprache, JSON.stringify(r.bank_regel), r.geaendert)
        const rein = d.prepare(
          'INSERT OR IGNORE INTO gram_bank (id, sprache, schluessel, form, uebung, niveau, pos, bank_aufgabe, geaendert) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        for (const a of g.aufgaben) n += Number(rein.run(a.id, a.sprache, a.schluessel, a.form, a.uebung, a.niveau, a.pos, JSON.stringify(a.bank_aufgabe), a.geaendert).changes)
        d.exec('COMMIT')
      } catch (e) {
        d.exec('ROLLBACK')
        throw e
      }
    }
    d.prepare('INSERT OR REPLACE INTO wartung (name, erledigt) VALUES (?, ?)').run(name, new Date().toISOString())
    protokolliereServer('grammatik', `WARTUNG ${name}: ${leer ? `${n} Aufgaben eingespielt` : 'Bank schon gefüllt, nichts eingespielt'}`)
    return n
  } catch {
    // Beim nächsten Start erneut
    return 0
  }
}

/** Einmal (13.10.2026, Wunsch der Lehrkraft): Dopplungen in der Bank entfernen – beim ersten Zugriff, gemerkt in `wartung` */
function doppelteEinmal(d: ReturnType<typeof datenbank>): void {
  const name = 'grammatik-bank-doppelte-2026-10-13'
  try {
    d.exec('CREATE TABLE IF NOT EXISTS wartung (name TEXT PRIMARY KEY, erledigt TEXT NOT NULL)')
    if (d.prepare('SELECT 1 FROM wartung WHERE name = ?').get(name)) return
    const n = bankDoppelteEntfernen()
    d.prepare('INSERT OR REPLACE INTO wartung (name, erledigt) VALUES (?, ?)').run(name, new Date().toISOString())
    protokolliereServer('grammatik', `WARTUNG ${name}: ${n} doppelte Bank-Aufgaben entfernt`)
  } catch {
    // Beim nächsten Start erneut
  }
}

/** Je Schlüssel doppelte Aufgaben (gleicher Satz, gleiche Lösung) löschen – die erste bleibt; Kurse werden neu gebaut */
export function bankDoppelteEntfernen(): number {
  const schluessel = (db().prepare('SELECT DISTINCT schluessel FROM gram_bank').all() as { schluessel: string }[]).map((z) => z.schluessel)
  let n = 0
  const geaendert: string[] = []
  for (const e of bankEintraege(schluessel)) {
    const bleiben = new Set(ohneDoppelte(e.aufgaben).map((a) => a.id))
    const weg = e.aufgaben.filter((a) => !bleiben.has(a.id))
    if (!weg.length) continue
    for (const a of weg) db().prepare('DELETE FROM gram_bank WHERE id = ?').run(a.id)
    n += weg.length
    geaendert.push(e.schluessel)
  }
  if (geaendert.length) kurseNeu(geaendert)
  return n
}
export const bankZuruecksetzen = (): void => {
  bereit = false
}

const json_ = <T>(s: string | null | undefined, r: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : r
  } catch {
    return r
  }
}

/** Höchstens so viele Aufgaben je Schlüssel (5 Übungsarten × großzügig 40) */
export const BANK_JE_SCHLUESSEL = 200

/** Einträge in der Reihenfolge der Schlüssel (ohne Aufgaben und ohne Regel: weggelassen) */
export function bankEintraege(schluessel: readonly string[]): BankEintrag[] {
  const aus: BankEintrag[] = []
  for (const s of [...new Set(schluessel)]) {
    const r = db().prepare('SELECT bank_regel FROM gram_bank_regel WHERE schluessel = ?').get(s) as { bank_regel: string } | undefined
    const zeilen = db().prepare('SELECT id, uebung, niveau, bank_aufgabe FROM gram_bank WHERE schluessel = ? ORDER BY pos, rowid').all(s) as {
      id: string
      uebung: string
      niveau: string
      bank_aufgabe: string
    }[]
    if (!r && !zeilen.length) continue
    const regel = json_(r?.bank_regel, { titel: '', erklaerung: '', beispiele: [] } as BankRegel)
    const aufgaben = zeilen
      .map((z) => ({
        ...json_(z.bank_aufgabe, {} as BankAufgabe),
        id: z.id,
        uebung: z.uebung as Uebung,
        niveau: istStufe(z.niveau) ? z.niveau : ('m' as const)
      }))
      .filter((a) => istUebung(a.uebung) && a.art)
    aus.push({ schluessel: s, regel, aufgaben })
  }
  return aus
}

/** Aufgaben je Schlüssel und Übungsart einer Sprache */
export function bankZahlen(sprache: string): BankZahlen {
  const aus: BankZahlen = {}
  for (const z of db()
    .prepare('SELECT schluessel, uebung, niveau, COUNT(*) AS n FROM gram_bank WHERE sprache = ? GROUP BY schluessel, uebung, niveau')
    .all(sprache) as {
    schluessel: string
    uebung: string
    niveau: string
    n: number
  }[]) {
    if (!istUebung(z.uebung)) continue
    const e = (aus[z.schluessel] ??= {})
    e[z.uebung] = (e[z.uebung] ?? 0) + Number(z.n)
    const st = istStufe(z.niveau) ? z.niveau : 'm'
    ;((e.stufen ??= {})[z.uebung] ??= {})[st] = Number(z.n)
  }
  // Schlüssel mit Regelkarte, aber (noch) ohne Aufgaben
  for (const z of db().prepare('SELECT schluessel FROM gram_bank_regel WHERE sprache = ?').all(sprache) as { schluessel: string }[]) aus[z.schluessel] ??= {}
  return aus
}

/** Kern-Aufgaben (Erkennen, Bilden, Anwenden) je Form einer Sprache – Nenner der Medaille „Grammatik" */
export function bankKernJeForm(sprache: string): Record<string, number> {
  const aus: Record<string, number> = {}
  for (const z of db()
    .prepare("SELECT form, COUNT(*) AS n FROM gram_bank WHERE sprache = ? AND form != '' AND uebung IN ('erkennen', 'bilden', 'anwenden') GROUP BY form")
    .all(sprache) as { form: string; n: number }[])
    aus[z.form] = Number(z.n)
  return aus
}

/** Alle Mix-Schlüssel einer Sprache mit Aufgaben (gemischt je Punkt bzw. je Unit) */
export function bankMixe(sprache: string): string[] {
  return (db().prepare("SELECT DISTINCT schluessel FROM gram_bank WHERE sprache = ? AND form = ''").all(sprache) as { schluessel: string }[]).map(
    (z) => z.schluessel
  )
}

const leer = (s: string): boolean =>
  !db().prepare('SELECT 1 FROM gram_bank WHERE schluessel = ? LIMIT 1').get(s) && !db().prepare('SELECT 1 FROM gram_bank_regel WHERE schluessel = ?').get(s)

/** Regelkarte bereinigen */
function regelBereinigt(roh: unknown, schluessel: string): BankRegel {
  const r = (roh ?? {}) as Record<string, unknown>
  const text = (x: unknown, n: number): string =>
    String(x ?? '')
      .trim()
      .slice(0, n)
  return {
    titel: text(r.titel, 160) || schluessel.slice(0, 160),
    erklaerung: text(r.erklaerung, 900),
    beispiele: (Array.isArray(r.beispiele) ? r.beispiele : [])
      .map((x) => text(x, 240))
      .filter(Boolean)
      .slice(0, 6)
  }
}

/**
 * Einen Schlüssel ganz ersetzen (Regelkarte + Aufgaben). Bekannte Kennungen „b…" bleiben (Lernstand), neue bekommen
 * eine frische. Aufgaben ohne gültige Übungsart oder unbrauchbare (paketBereinigt) fallen weg.
 */
export function bankSpeichern(sprache: string, schluessel: string, regelRoh: unknown, aufgabenRoh: unknown): { aufgaben: number } {
  const regel = regelBereinigt(regelRoh, schluessel)
  // Ohne Dopplungen (13.10.2026): gleicher Satz mit gleicher Lösung nur einmal
  const roh = ohneDoppelte((Array.isArray(aufgabenRoh) ? aufgabenRoh : []) as { satz?: string; teile?: string[]; loesungen?: string[] }[]).slice(
    0,
    BANK_JE_SCHLUESSEL
  ) as Record<string, unknown>[]
  const regelId = regelIdVon(schluessel)
  // Kennungen vorab festlegen: vorhandene „b…" behalten, sonst neu – paketBereinigt behält sie dann
  const fremd = new Set((db().prepare('SELECT id FROM gram_bank WHERE schluessel != ?').all(schluessel) as { id: string }[]).map((z) => z.id))
  const vergeben = new Set<string>()
  const mitId = roh.map((a) => {
    let id = String(a?.id ?? '')
    if (!/^b[0-9a-f]{12}$/.test(id) || fremd.has(id) || vergeben.has(id)) id = `b${randomBytes(6).toString('hex')}`
    vergeben.add(id)
    return { ...a, id, regelId }
  })
  const paket = paketBereinigt(
    { thema: regel.titel, regeln: [{ id: regelId, ...regel, erklaerung: regel.erklaerung || regel.titel }], aufgaben: mitId },
    regel.titel,
    BANK_GRENZEN
  )
  const aufgaben = paket.aufgaben.filter((a): a is BankAufgabe => istUebung(a.uebung))
  const jetzt = new Date().toISOString()
  const d = db()
  d.exec('BEGIN')
  try {
    d.prepare('DELETE FROM gram_bank WHERE schluessel = ?').run(schluessel)
    d.prepare('INSERT OR REPLACE INTO gram_bank_regel (schluessel, sprache, bank_regel, geaendert) VALUES (?, ?, ?, ?)').run(
      schluessel,
      sprache,
      JSON.stringify(regel),
      jetzt
    )
    const rein = d.prepare(
      'INSERT INTO gram_bank (id, sprache, schluessel, form, uebung, niveau, pos, bank_aufgabe, geaendert) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    aufgaben.forEach((a, i) => {
      // Ohne Kennung, Regel und Stufe gespeichert – die vergibt das Paket des Kurses
      const { id, regelId: _r, stufe: _s, uebung, niveau, ...rest } = a
      void _r
      void _s
      rein.run(id, sprache, schluessel, formVon(schluessel), uebung, istStufe(niveau) ? niveau : 'm', i, JSON.stringify(rest), jetzt)
    })
    d.exec('COMMIT')
  } catch (e) {
    d.exec('ROLLBACK')
    throw e
  }
  return { aufgaben: aufgaben.length }
}

/** Kurse neu aufbauen – grammatik.ts trägt sich ein (vermeidet einen Kreis beim Laden) */
let kurseNeu: (schluessel: string[]) => number = () => 0
export function beiBankAenderung(fn: (schluessel: string[]) => number): void {
  kurseNeu = fn
}

export function grammatikBankRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    if (url.pathname !== '/server/grammatik-bank' && !url.pathname.startsWith('/server/grammatik-bank/')) return false
    if (req.method === 'POST' && typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nur aus der App.' }), true
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    const ich = sitzung.nutzer
    if (ich.rolle === 'schueler') return json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true
    const darf = (sprache: string): boolean => imNutzer(alsNutzer(ich, sitzung.kennung), () => darfLehrwerkSprache(sprache))
    const sprache = (x: unknown): string => (/^[a-z]{2,3}$/.test(String(x ?? '')) ? String(x) : '')

    if (req.method === 'GET' && url.pathname === '/server/grammatik-bank') {
      const s = sprache(url.searchParams.get('sprache'))
      if (!s) return json(res, 400, { fehler: 'Bitte eine Sprache angeben.' }), true
      // geleert (13.10.2026, wartungBankLoeschen.ts): KI-Entwürfe von davor verwirft die Oberfläche
      return json(res, 200, { zahlen: bankZahlen(s), darf: darf(s), geleert: serverWert<number>('grammatik-bank-geleert', 0) }), true
    }
    if (req.method === 'POST' && url.pathname === '/server/grammatik-bank/lesen') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const liste = (Array.isArray(k0.schluessel) ? k0.schluessel : []).filter(schluesselGueltig).slice(0, 80)
      return json(res, 200, { eintraege: bankEintraege(liste) }), true
    }
    if (req.method === 'POST' && url.pathname === '/server/grammatik-bank/speichern') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const s = sprache(k0.sprache)
      const schluessel = k0.schluessel
      if (!s || !schluesselGueltig(schluessel)) return json(res, 400, { fehler: 'Unbekannte Grammatikform.' }), true
      // Erstbefüllung darf jede Lehrkraft (abgestimmt: „Grammatik hinzufügen" ohne Aufgaben speichert das Erzeugte)
      if (!darf(s) && !leer(schluessel)) return json(res, 403, { fehler: 'Hinterlegte Aufgaben dürfen nur Admins und die Fachobleute des Fachs ändern.' }), true
      const { aufgaben } = bankSpeichern(s, schluessel, k0.regel, k0.aufgaben)
      const kurse = kurseNeu([schluessel])
      protokolliereServer('grammatik', `Aufgabenbank gespeichert: ${aufgaben} Aufgaben${kurse ? `, ${kurse} Kurs-Trainings aktualisiert` : ''}`, ich.id)
      return json(res, 200, { aufgaben, kurse, zahlen: bankZahlen(s) }), true
    }
    return json(res, 404, { fehler: 'Unbekannt.' }), true
  }
}
