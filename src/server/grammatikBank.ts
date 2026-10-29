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
import { bekannterWortschatz, formWoerter, fruehesteEinfuehrung, unbekannteWoerter, type Einfuehrung, type GrammatikBand, type WortschatzBand } from '../shared/lehrwerkWortschatz'
import { LEHRWERK_GRAMMATIK, reiheDesBands } from '../renderer/src/shared/lehrwerkGrammatik'
import { NEUE_REGELN, REGEL_PLATZHALTER_WARTUNG, istRegelPlatzhalter } from './grammatikRegelPlatzhalter'
import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { RESSOURCEN } from './pfade'
import { datenbank, protokolliereServer, serverWert } from './datenbank'
import { alsNutzer, json, type Anfrage } from './http'
import { imNutzer } from './kontext'
import { darfLehrwerkSprache } from '../main/services/rolle'
import { BANK_GRENZEN, paketBereinigt } from '../shared/grammatiktrainer'
import { aufgabeMangel, aufgabeNormalisiert } from '../shared/grammatikAufgabenRegeln'
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
    // Zurückgestellt (28.10.2026): Grund als Klartext-Spalte (keine Personendaten) – Zahlen und Pakete filtern danach
    if (!spalten.has('pruefen')) d.exec("ALTER TABLE gram_bank ADD COLUMN pruefen TEXT NOT NULL DEFAULT ''")
    bereit = true
    doppelteEinmal(d)
    maengelEinmal(d)
    regelPlatzhalterEinmal(d)
    ueberarbeitungEinmal(d)
    wortschatzEinmal(d)
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
        // Der Grundbestand stammt vom 19.10.2026 – die Regeln vom 28.10.2026 gleich darauf anwenden
        for (const name of MAENGEL_WARTUNGEN) d.prepare('DELETE FROM wartung WHERE name = ?').run(name)
        maengelEinmal(d)
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
    const zeilen = db().prepare('SELECT id, uebung, niveau, pruefen, bank_aufgabe FROM gram_bank WHERE schluessel = ? ORDER BY pos, rowid').all(s) as {
      id: string
      uebung: string
      niveau: string
      pruefen: string
      bank_aufgabe: string
    }[]
    if (!r && !zeilen.length) continue
    const regel = json_(r?.bank_regel, { titel: '', erklaerung: '', beispiele: [] } as BankRegel)
    const aufgaben = zeilen
      .map((z) => ({
        ...json_(z.bank_aufgabe, {} as BankAufgabe),
        id: z.id,
        uebung: z.uebung as Uebung,
        niveau: istStufe(z.niveau) ? z.niveau : ('m' as const),
        ...(z.pruefen ? { pruefen: z.pruefen } : {})
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
    .prepare("SELECT schluessel, uebung, niveau, COUNT(*) AS n FROM gram_bank WHERE sprache = ? AND pruefen = '' GROUP BY schluessel, uebung, niveau")
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
  // Zurückgestellte je Schlüssel (28.10.2026)
  for (const z of db()
    .prepare("SELECT schluessel, COUNT(*) AS n FROM gram_bank WHERE sprache = ? AND pruefen != '' GROUP BY schluessel")
    .all(sprache) as { schluessel: string; n: number }[])
    (aus[z.schluessel] ??= {}).zurueck = Number(z.n)
  // Schlüssel mit Regelkarte, aber (noch) ohne Aufgaben
  for (const z of db().prepare('SELECT schluessel FROM gram_bank_regel WHERE sprache = ?').all(sprache) as { schluessel: string }[]) aus[z.schluessel] ??= {}
  return aus
}

/** Kern-Aufgaben (Erkennen, Bilden, Anwenden) je Form einer Sprache – Nenner der Medaille „Grammatik" */
export function bankKernJeForm(sprache: string): Record<string, number> {
  const aus: Record<string, number> = {}
  for (const z of db()
    .prepare("SELECT form, COUNT(*) AS n FROM gram_bank WHERE sprache = ? AND form != '' AND pruefen = '' AND uebung IN ('erkennen', 'bilden', 'anwenden') GROUP BY form")
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
  // Regeln (28.10.2026): ohne KI richten, verbleibende Mängel als „zurückgestellt“ festhalten; ein Befund der Prüfung bleibt,
  // bis die Überarbeitung ihn ausdrücklich löscht (dann fehlt `pruefen`)
  const aufgaben = paket.aufgaben
    .filter((a): a is BankAufgabe => istUebung(a.uebung))
    .map((roh) => {
      const a = aufgabeNormalisiert(roh)
      const mangel = aufgabeMangel(a)
      const befund = roh.pruefen?.startsWith(BEFUND) ? roh.pruefen : ''
      const { pruefen: _p, ...ohne } = a
      void _p
      return { ...ohne, ...(mangel || befund ? { pruefen: mangel || befund } : {}) } as BankAufgabe
    })
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
      'INSERT INTO gram_bank (id, sprache, schluessel, form, uebung, niveau, pos, bank_aufgabe, geaendert, pruefen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    aufgaben.forEach((a, i) => {
      // Ohne Kennung, Regel und Stufe gespeichert – die vergibt das Paket des Kurses
      const { id, regelId: _r, stufe: _s, uebung, niveau, pruefen, ...rest } = a
      void _r
      void _s
      rein.run(id, sprache, schluessel, formVon(schluessel), uebung, istStufe(niveau) ? niveau : 'm', i, JSON.stringify(rest), jetzt, pruefen ?? '')
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


// ---------------------------------------------------------------- Mängel (28.10.2026)

/** Befund aus der Prüfung der Bank (Kennung → was falsch ist) – beginnt mit diesem Wort, damit Speichern ihn erhält */
// Zweiter Lauf (29.10.2026 abends): Wörter der geübten Form und weitere gleichwertige Lösungen zählen nicht mehr – fälschlich
// Zurückgestellte kommen zurück, neu Betroffene werden zurückgestellt
const WORTSCHATZ_WARTUNG = 'grammatik-bank-wortschatz-2-2026-10-29'

/** Wortschatz-Stand einer Bank-Kennung aus den mitgelieferten Lehrwerken (wie wortschatzStand in der Oberfläche) */
export function wortschatzStandServer(schluessel: string, sprache: string): { stelle: Einfuehrung; bekannt: Set<string> } | null {
  const ordner = join(RESSOURCEN, 'lehrwerke')
  if (!existsSync(ordner)) return null
  const baende = readdirSync(ordner)
    .filter((f) => f.endsWith('.json'))
    .map((f) => json_(readFileSync(join(ordner, f), 'utf8'), null as unknown as (WortschatzBand & { language?: string; reihe?: string }) | null))
    .filter((b): b is WortschatzBand & { language?: string; reihe?: string } => Boolean(b && b.language === sprache && LEHRWERK_GRAMMATIK[b.name] && b.units?.length))
  const reihen = new Map<string, typeof baende>()
  for (const b of baende) reihen.set(b.reihe || reiheDesBands(b.name), [...(reihen.get(b.reihe || reiheDesBands(b.name)) ?? []), b])
  let best: { stelle: Einfuehrung; baende: typeof baende; grade: number } | null = null
  for (const r0 of reihen.values()) {
    const r = [...r0].sort((x, y) => (x.grade ?? 99) - (y.grade ?? 99))
    const stelle = fruehesteEinfuehrung(schluessel, r.map((b) => ({ name: b.name, grammatik: LEHRWERK_GRAMMATIK[b.name] as unknown as GrammatikBand })))
    if (!stelle) continue
    const grade = r.find((b) => b.name === stelle.buch)?.grade ?? 99
    if (!best || grade < best.grade) best = { stelle, baende: r, grade }
  }
  return best ? { stelle: best.stelle, bekannt: bekannterWortschatz(best.baende, best.stelle) } : null
}

/**
 * Wortschatz der vorhandenen Aufgaben (29.10.2026, Auftrag der Lehrkraft für Green Line 1 Unit 1): Aufgaben der Formen,
 * die in Green Line 1, Unit 1 eingeführt werden, mit Wörtern, die an der Station der Form noch unbekannt sind, für die
 * Lernenden zurückstellen (Grund mit den Wörtern). Neue Aufgaben prüft die Erzeugung selbst.
 */
function wortschatzEinmal(d: ReturnType<typeof datenbank>): void {
  try {
    d.exec('CREATE TABLE IF NOT EXISTS wartung (name TEXT PRIMARY KEY, erledigt TEXT NOT NULL)')
    if (d.prepare('SELECT 1 FROM wartung WHERE name = ?').get(WORTSCHATZ_WARTUNG)) return
    const zeilen = d
      .prepare("SELECT id, sprache, schluessel, uebung, niveau, pruefen, bank_aufgabe FROM gram_bank WHERE pruefen = '' OR pruefen LIKE ?")
      .all(`${WORTSCHATZ_PRUEFEN}%`) as {
      id: string
      sprache: string
      schluessel: string
      uebung: string
      niveau: string
      pruefen: string
      bank_aufgabe: string
    }[]
    const stand = new Map<string, ReturnType<typeof wortschatzStandServer>>()
    const setzen = d.prepare('UPDATE gram_bank SET pruefen = ? WHERE id = ?')
    const schluessel = new Set<string>()
    let zurueck = 0
    let frei = 0
    d.exec('BEGIN')
    try {
      for (const z of zeilen) {
        if (!stand.has(z.schluessel)) stand.set(z.schluessel, wortschatzStandServer(z.schluessel, z.sprache))
        const ws = stand.get(z.schluessel)
        if (!ws || ws.stelle.buch !== 'Green Line 1' || ws.stelle.unit !== 'Unit 1') continue
        const b = bankAufgabeBereinigt({ ...json_(z.bank_aufgabe, {} as Record<string, unknown>), uebung: z.uebung, niveau: z.niveau }, z.id, z.schluessel)
        if (!b) continue
        const u = unbekannteWoerter(b.a, ws.bekannt, formWoerter(z.schluessel))
        // Mangel nach den Regeln geht vor (die Mängel-Wartung stellt ihn zurück)
        const neu = b.pruefen || (u.length ? `${WORTSCHATZ_PRUEFEN}${ws.stelle.buch}, ${ws.stelle.unit}, ${ws.stelle.abschnitt}): ${u.slice(0, 6).join(', ')}` : '')
        if (neu === z.pruefen) continue
        setzen.run(neu, z.id)
        if (neu) zurueck++
        else frei++
        schluessel.add(z.schluessel)
      }
      d.prepare('INSERT OR REPLACE INTO wartung (name, erledigt) VALUES (?, ?)').run(WORTSCHATZ_WARTUNG, new Date().toISOString())
      d.exec('COMMIT')
    } catch (e) {
      d.exec('ROLLBACK')
      throw e
    }
    protokolliereServer('grammatik', `WARTUNG ${WORTSCHATZ_WARTUNG}: ${zurueck} Aufgaben mit unbekanntem Wortschatz zurückgestellt, ${frei} wieder frei`)
    if (schluessel.size) setTimeout(() => void Promise.resolve().then(() => kurseNeu([...schluessel])).catch(() => undefined), 0)
  } catch {
    // Beim nächsten Start erneut
  }
}

const UEBERARBEITUNG_WARTUNG = 'grammatik-bank-ueberarbeitung-2026-10-29'

/** Eine Aufgabe so bereinigen wie beim Speichern; Mangel als `pruefen` */
export function bankAufgabeBereinigt(roh: Record<string, unknown>, id: string, schluessel: string): { a: BankAufgabe; pruefen: string } | null {
  const regelId = regelIdVon(schluessel)
  const [x] = paketBereinigt(
    { thema: schluessel, regeln: [{ id: regelId, titel: schluessel, erklaerung: schluessel, beispiele: [] }], aufgaben: [{ ...roh, id, regelId }] },
    schluessel,
    BANK_GRENZEN
  ).aufgaben
  if (!x || !istUebung(x.uebung)) return null
  const a = aufgabeNormalisiert(x as BankAufgabe)
  return { a, pruefen: aufgabeMangel(a) }
}

/**
 * Neufassung und Ergänzung von Hand (29.10.2026, Auftrag der Lehrkraft: „Kannst du die zurückgestellten Grammatikformen
 * überarbeiten und fehlende Stufen ergänzen – selber, ohne den Umweg über ChatGPT?"): resources/grammatik-bank/
 * ueberarbeitung-2026-10-29.json – „ersetzen" (Kennung → neue Fassung; Kennung, Übungsart und Stufe bleiben, der Lernstand
 * hängt daran) und „neu" (fehlende Stufen). Bereinigt und geprüft wie beim Speichern; ein verbleibender Mangel stellt zurück.
 */
/** Einzuspielende Dateien (Wartungsname → Datei in resources/grammatik-bank), in dieser Reihenfolge */
const EINSPIELEN: [string, string][] = [
  [UEBERARBEITUNG_WARTUNG, 'ueberarbeitung-2026-10-29.json'],
  // Green Line 1 Unit 1 (29.10.2026): fehlende Felder über den App-Weg im Handbetrieb erzeugt (tests/handbetrieb)
  ['grammatik-bank-greenline1-unit1-2026-10-29', 'greenline1-unit1-2026-10-29.json']
]

function ueberarbeitungEinmal(d: ReturnType<typeof datenbank>): void {
  for (const [name, datei] of EINSPIELEN) einspielen(d, name, datei)
}

function einspielen(d: ReturnType<typeof datenbank>, wartungsName: string, dateiName: string): void {
  try {
    d.exec('CREATE TABLE IF NOT EXISTS wartung (name TEXT PRIMARY KEY, erledigt TEXT NOT NULL)')
    if (d.prepare('SELECT 1 FROM wartung WHERE name = ?').get(wartungsName)) return
    const datei = join(RESSOURCEN, 'grammatik-bank', dateiName)
    if (!existsSync(datei)) return
    // Nur in eine vorhandene Bank – ein neuer Server ohne Grundbestand bleibt leer (Regelkarten machten sonst jede Form „bekannt")
    if (!d.prepare('SELECT 1 FROM gram_bank LIMIT 1').get()) return
    const u = json_(readFileSync(datei, 'utf8'), { ersetzen: {}, neu: [] } as {
      ersetzen?: Record<string, { schluessel: string; aufgabe: Record<string, unknown> }>
      neu?: { schluessel: string; aufgabe: Record<string, unknown> }[]
      /** Regelkarten neuer Schlüssel (nur, wo noch keine liegt) */
      regeln?: Record<string, BankRegel>
    })
    const jetzt = new Date().toISOString()
    const schluessel = new Set<string>()
    let ersetzt = 0
    let neu = 0
    let zurueck = 0
    d.exec('BEGIN')
    try {
      const setzen = d.prepare('UPDATE gram_bank SET bank_aufgabe = ?, pruefen = ?, geaendert = ? WHERE id = ?')
      for (const [k, regel] of Object.entries(u.regeln ?? {}))
        if (!d.prepare('SELECT 1 FROM gram_bank_regel WHERE schluessel = ?').get(k) && !istRegelPlatzhalter(regel))
          d.prepare('INSERT INTO gram_bank_regel (schluessel, sprache, bank_regel, geaendert) VALUES (?, ?, ?, ?)').run(k, k.replace(/^mix:/, '').split('.')[0], JSON.stringify(regel), jetzt)
      for (const [id, e] of Object.entries(u.ersetzen ?? {})) {
        const z = d.prepare('SELECT schluessel, uebung, niveau FROM gram_bank WHERE id = ?').get(id) as { schluessel: string; uebung: string; niveau: string } | undefined
        if (!z || z.schluessel !== e.schluessel) continue
        const b = bankAufgabeBereinigt({ ...e.aufgabe, uebung: z.uebung, niveau: z.niveau }, id, z.schluessel)
        if (!b) continue
        const { id: _i, regelId: _r, stufe: _s, uebung: _u, niveau: _n, pruefen: _p, ...rest } = b.a as BankAufgabe & { regelId?: string; stufe?: unknown }
        void [_i, _r, _s, _u, _n, _p]
        setzen.run(JSON.stringify(rest), b.pruefen, jetzt, id)
        ersetzt++
        if (b.pruefen) zurueck++
        schluessel.add(z.schluessel)
      }
      const rein = d.prepare(
        'INSERT INTO gram_bank (id, sprache, schluessel, form, uebung, niveau, pos, bank_aufgabe, geaendert, pruefen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      for (const e of u.neu ?? []) {
        // Nur zu Schlüsseln, die die Bank kennt (Aufgaben oder Regelkarte)
        if (!d.prepare('SELECT 1 FROM gram_bank WHERE schluessel = ? LIMIT 1').get(e.schluessel) && !d.prepare('SELECT 1 FROM gram_bank_regel WHERE schluessel = ?').get(e.schluessel))
          continue
        const id = `b${randomBytes(6).toString('hex')}`
        const b = bankAufgabeBereinigt(e.aufgabe, id, e.schluessel)
        if (!b) continue
        // Wortschatz nach Lehrwerksstand als Sicherung (29.10.2026)
        const ws = wortschatzStandServer(e.schluessel, e.schluessel.replace(/^mix:/, '').split('.')[0])
        const unbekannt = ws ? unbekannteWoerter(b.a, ws.bekannt, formWoerter(e.schluessel)) : []
        if (!b.pruefen && unbekannt.length) b.pruefen = `${WORTSCHATZ_PRUEFEN}${ws!.stelle.buch}, ${ws!.stelle.unit}, ${ws!.stelle.abschnitt}): ${unbekannt.slice(0, 6).join(', ')}`
        const pos = ((d.prepare('SELECT MAX(pos) AS p FROM gram_bank WHERE schluessel = ?').get(e.schluessel) as { p: number | null }).p ?? 0) + 1
        const { id: _i, regelId: _r, stufe: _s, uebung, niveau, pruefen: _p, ...rest } = b.a as BankAufgabe & { regelId?: string; stufe?: unknown }
        void [_i, _r, _s, _p]
        rein.run(id, e.schluessel.replace(/^mix:/, '').split('.')[0], e.schluessel, formVon(e.schluessel), uebung, istStufe(niveau) ? niveau : 'm', pos, JSON.stringify(rest), jetzt, b.pruefen)
        neu++
        if (b.pruefen) zurueck++
        schluessel.add(e.schluessel)
      }
      d.prepare('INSERT OR REPLACE INTO wartung (name, erledigt) VALUES (?, ?)').run(wartungsName, jetzt)
      d.exec('COMMIT')
    } catch (e) {
      d.exec('ROLLBACK')
      throw e
    }
    protokolliereServer('grammatik', `WARTUNG ${wartungsName}: ${ersetzt} ersetzt, ${neu} neu, davon ${zurueck} mit Mangel zurückgestellt`)
    if (schluessel.size) setTimeout(() => void Promise.resolve().then(() => kurseNeu([...schluessel])).catch(() => undefined), 0)
  } catch {
    // Beim nächsten Start erneut
  }
}

/** Regelkarten „x" einmal durch geschriebene ersetzen (29.10.2026, grammatikRegelPlatzhalter.ts) */
function regelPlatzhalterEinmal(d: ReturnType<typeof datenbank>): void {
  try {
    d.exec('CREATE TABLE IF NOT EXISTS wartung (name TEXT PRIMARY KEY, erledigt TEXT NOT NULL)')
    if (d.prepare('SELECT 1 FROM wartung WHERE name = ?').get(REGEL_PLATZHALTER_WARTUNG)) return
    const geaendert: string[] = []
    for (const [schluessel, regel] of Object.entries(NEUE_REGELN)) {
      const z = d.prepare('SELECT bank_regel FROM gram_bank_regel WHERE schluessel = ?').get(schluessel) as { bank_regel: string } | undefined
      if (!z || !istRegelPlatzhalter(json_(z.bank_regel, {} as BankRegel))) continue
      d.prepare('UPDATE gram_bank_regel SET bank_regel = ?, geaendert = ? WHERE schluessel = ?').run(JSON.stringify(regel), new Date().toISOString(), schluessel)
      geaendert.push(schluessel)
    }
    d.prepare('INSERT OR REPLACE INTO wartung (name, erledigt) VALUES (?, ?)').run(REGEL_PLATZHALTER_WARTUNG, new Date().toISOString())
    protokolliereServer('grammatik', `WARTUNG ${REGEL_PLATZHALTER_WARTUNG}: ${geaendert.length} Regelkarten ersetzt`)
    if (geaendert.length) setTimeout(() => void Promise.resolve().then(() => kurseNeu(geaendert)).catch(() => undefined), 0)
  } catch {
    // Beim nächsten Start erneut
  }
}

export const BEFUND = 'Befund: '
/** Anfang von `pruefen` bei Aufgaben mit Wörtern über dem Lehrwerksstand */
export const WORTSCHATZ_PRUEFEN = 'Wortschatz ('
/**
 * Läufe der Mängelprüfung über die ganze Bank – ein neuer Name, wenn die Regeln strenger werden. 28.10.2026 abends:
 * Selbsttest (shared/grammatikSelbsttest.ts) und „Satzanfang verrät die Lösung" (Frage der Lehrkraft).
 */
// 29.10.2026: „Möglichkeiten verraten die Lösung" (Befund der Lehrkraft: „Wähle alle Wortgruppen mit an")
const MAENGEL_WARTUNGEN = ['grammatik-bank-maengel-2026-10-28', 'grammatik-bank-selbsttest-2026-10-28', 'grammatik-bank-verraten-2026-10-29', 'grammatik-bank-ursachen-2026-10-29']

/**
 * Einmal (28.10.2026, nach der Prüfung der ganzen Bank): jede Aufgabe nach den Regeln richten (shared/
 * grammatikAufgabenRegeln.ts) und, was einen Mangel behält oder in der Prüfung als falsch gemeldet wurde
 * (resources/grammatik-bank/befunde-2026-10-28.json), für die Lernenden zurückstellen. Danach bauen die Kurse ihre
 * Pakete neu. Kennungen bleiben – der Lernstand hängt weiter an den Aufgaben.
 */
export function maengelEinmal(d: ReturnType<typeof datenbank>): { geaendert: number; zurueck: number } {
  const summe = { geaendert: 0, zurueck: 0 }
  for (const name of MAENGEL_WARTUNGEN) {
    const r = maengelLauf(d, name)
    summe.geaendert += r.geaendert
    summe.zurueck += r.zurueck
  }
  return summe
}

function maengelLauf(d: ReturnType<typeof datenbank>, MAENGEL_WARTUNG: string): { geaendert: number; zurueck: number } {
  try {
    d.exec('CREATE TABLE IF NOT EXISTS wartung (name TEXT PRIMARY KEY, erledigt TEXT NOT NULL)')
    if (d.prepare('SELECT 1 FROM wartung WHERE name = ?').get(MAENGEL_WARTUNG)) return { geaendert: 0, zurueck: 0 }
    const datei = join(RESSOURCEN, 'grammatik-bank', 'befunde-2026-10-28.json')
    const befunde = existsSync(datei) ? json_(readFileSync(datei, 'utf8'), {} as Record<string, string>) : {}
    const zeilen = d.prepare('SELECT id, schluessel, uebung, niveau, pruefen, bank_aufgabe FROM gram_bank').all() as {
      id: string
      schluessel: string
      uebung: string
      niveau: string
      pruefen: string
      bank_aufgabe: string
    }[]
    let geaendert = 0
    let zurueck = 0
    const schluessel = new Set<string>()
    const setzen = d.prepare('UPDATE gram_bank SET uebung = ?, pruefen = ?, bank_aufgabe = ? WHERE id = ?')
    d.exec('BEGIN')
    try {
      for (const z of zeilen) {
        const roh = json_(z.bank_aufgabe, {} as BankAufgabe)
        if (!roh.art || !istUebung(z.uebung)) continue
        const vorher = { ...roh, id: z.id, regelId: '', uebung: z.uebung as Uebung }
        const a = aufgabeNormalisiert(vorher)
        const befund = befunde[z.id] ? `${BEFUND}${String(befunde[z.id]).slice(0, 280)}` : ''
        // Zurückgestellt wegen des Wortschatzes (Lehrwerksstand, 29.10.2026) bleibt zurückgestellt – das ist kein Mangel der Regeln
        const pruefen = aufgabeMangel(a) || befund || (z.pruefen.startsWith(WORTSCHATZ_PRUEFEN) ? z.pruefen : '')
        const { id: _i, regelId: _r, uebung, pruefen: _p, ...rest } = a
        void _i
        void _r
        void _p
        const text = JSON.stringify(rest)
        if (uebung === z.uebung && pruefen === z.pruefen && text === JSON.stringify(roh)) continue
        setzen.run(uebung, pruefen, text, z.id)
        geaendert++
        if (pruefen) zurueck++
        schluessel.add(z.schluessel)
      }
      d.prepare('INSERT OR REPLACE INTO wartung (name, erledigt) VALUES (?, ?)').run(MAENGEL_WARTUNG, new Date().toISOString())
      d.exec('COMMIT')
    } catch (e) {
      d.exec('ROLLBACK')
      throw e
    }
    protokolliereServer('grammatik', `WARTUNG ${MAENGEL_WARTUNG}: ${geaendert} Aufgaben gerichtet, davon ${zurueck} zurückgestellt`)
    // Kurse neu bauen, sobald die Grammatik-Route geladen ist (beiBankAenderung trägt sie ein)
    if (schluessel.size) setTimeout(() => void Promise.resolve().then(() => kurseNeu([...schluessel])).catch(() => undefined), 0)
    return { geaendert, zurueck }
  } catch {
    // Beim nächsten Start erneut
    return { geaendert: 0, zurueck: 0 }
  }
}
