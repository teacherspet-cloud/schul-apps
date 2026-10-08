/**
 * Personenbezogene Daten verschlüsselt speichern (02.10.2026, Auftrag der Lehrkraft: „Stell sicher,
 * dass alle personenbezogenen Daten verschlüsselt sind … Die Klarnamen sollen nur lokal auf dem
 * Server sein, damit Lehrkräfte diese den Schülern zuordnen können").
 *
 * Datenbank: Die Spalten in `SENSIBEL` liegen nur verschlüsselt vor (AES-256-GCM mit dem
 * Hauptschlüssel des Servers, geheim.ts). Das geschieht hier zentral im Datenbankzugang, damit
 * keine der vielen Abfragen es vergessen kann:
 *  - Schreiben: Bei INSERT (mit Spaltenliste) und UPDATE … SET spalte = ? werden die Werte der
 *    sensiblen Spalten verschlüsselt.
 *  - Lesen: Werte sensibler Spalten, die verschlüsselt sind, kommen entschlüsselt zurück.
 *  - Benutzernamen (nutzer.benutzer) sind Suchschlüssel: In der Spalte steht ein HMAC („k1:…"),
 *    der Benutzername selbst verschlüsselt in `benutzer_v`. `WHERE benutzer = ?` funktioniert so
 *    weiter, ohne dass der Name im Klartext gespeichert ist.
 *  - Bestehende Daten werden beim ersten Zugriff auf eine Tabelle umgeschrieben.
 *
 * Dateien (Material, Einstellungen, Rückmeldungen der Nutzer): shims/fs.ts verschlüsselt alles,
 * was der Server unter <DATEN>/nutzer und <DATEN>/fach schreibt.
 *
 * Grenzen (bewusst): Gruppen- und Klassennamen („10b"), Fächer und Zeiten bleiben lesbar – sie
 * werden für Sortierung und Zuordnung gebraucht und nennen keine Person.
 */
import type { DatabaseSync, StatementSync } from 'node:sqlite'
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'
import { entschluessle, hauptschluessel, verschluessle } from './geheim'

/** Tabelle → sensible Spalten */
export const SENSIBEL: Record<string, string[]> = {
  nutzer: ['name', 'gruppen', 'benutzer_v', 'iserv_sub'],
  lerngruppen: ['mitglieder'],
  teilnahmen: ['antworten', 'bewertung', 'vorfaelle'],
  onlinetest_tinte: ['png', 'text'],
  feedback_freigaben: ['schueler'],
  feedback_abgaben: ['fassungen'],
  blatt_freigaben: ['schueler', 'auswertung'],
  blatt_abgaben: ['antworten', 'tinte', 'aufgaben_feedback', 'hilfen'],
  // Grammatik-Lern-App (06.10.2026)
  gram_zuweisungen: ['schueler'],
  gram_stand: ['daten'],
  fach_kopien: ['titel'],
  reihen_zuweisungen: ['schueler'],
  reihen_stand: ['daten'],
  reihen_dateien: ['daten', 'name'],
  vok_zuweisungen: ['schueler'],
  vok_stand: ['daten'],
  vok_laufbahn: ['daten'],
  // Persönlicher Zugangscode der Gäste – für die Lehrkraft lesbar (08.10.2026), sonst nur als Prüfwert
  vok_gaeste: ['code_v'],
  tafel_freigaben: ['schueler'],
  // Schüler-Startseite (06.10.2026): Wochen-Schnappschuss und Lerntipp je Person (lernstand.ts)
  lern_wochen: ['daten']
}
const SPALTEN = new Set(Object.values(SENSIBEL).flat())

const BLOB_KOPF = Buffer.from('SAE1')

/** Suchschlüssel für Benutzernamen (deterministisch, nicht umkehrbar) */
export function kennung(benutzer: string): string {
  const k = createHmac('sha256', hauptschluessel()).update('benutzer-kennung').digest()
  return `k1:${createHmac('sha256', k).update(benutzer.trim().toLowerCase()).digest('hex')}`
}

const istKennung = (s: unknown): boolean => typeof s === 'string' && s.startsWith('k1:')

function blobZu(b: Uint8Array): Buffer {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', hauptschluessel(), iv)
  const daten = Buffer.concat([c.update(b), c.final()])
  return Buffer.concat([BLOB_KOPF, iv, c.getAuthTag(), daten])
}

function blobVon(b: Uint8Array): Uint8Array {
  const buf = Buffer.from(b)
  if (buf.length < 32 || !buf.subarray(0, 4).equals(BLOB_KOPF)) return b
  const d = createDecipheriv('aes-256-gcm', hauptschluessel(), buf.subarray(4, 16))
  d.setAuthTag(buf.subarray(16, 32))
  return Buffer.concat([d.update(buf.subarray(32)), d.final()])
}

/** Einen Wert für eine sensible Spalte verschlüsseln (schon Verschlüsseltes bleibt) */
export function zu(wert: unknown): unknown {
  if (wert === null || wert === undefined) return wert
  if (wert instanceof Uint8Array) return Buffer.from(wert.subarray(0, 4)).equals(BLOB_KOPF) ? wert : blobZu(wert)
  if (typeof wert !== 'string') return wert
  return wert.startsWith('v1:') ? wert : verschluessle(wert)
}

/** Einen gelesenen Wert entschlüsseln (Klartext aus alten Zeilen bleibt, wie er ist) */
export function von(wert: unknown): unknown {
  if (typeof wert === 'string' && wert.startsWith('v1:')) return entschluessle(wert)
  if (wert instanceof Uint8Array) return blobVon(wert)
  return wert
}

function zeileVon<T>(z: T): T {
  if (!z || typeof z !== 'object') return z
  const r = z as Record<string, unknown>
  for (const k of Object.keys(r)) if (SPALTEN.has(k)) r[k] = von(r[k])
  // Nutzer: der Benutzername steht verschlüsselt in benutzer_v, in benutzer nur der Suchschlüssel
  if ('benutzer_v' in r && typeof r.benutzer_v === 'string' && r.benutzer_v) r.benutzer = r.benutzer_v
  return z
}

/** Zuordnung Platzhalter → Spalte für INSERT/UPDATE; dazu „WHERE benutzer = ?" in nutzer */
interface Plan {
  tabelle: string
  /** je Platzhalter: 'zu' = verschlüsseln, 'kennung' = Suchschlüssel, null = unverändert */
  art: ('zu' | 'kennung' | null)[]
}

/** Werte einer Liste auf oberster Ebene trennen („?, 'a,b', NULL" → 3 Teile) */
function teile(s: string): string[] {
  const aus: string[] = []
  let tiefe = 0
  let inText = false
  let aktuell = ''
  for (const ch of s) {
    if (ch === "'") inText = !inText
    if (!inText && ch === '(') tiefe++
    if (!inText && ch === ')') tiefe--
    if (!inText && tiefe === 0 && ch === ',') {
      aus.push(aktuell.trim())
      aktuell = ''
    } else aktuell += ch
  }
  if (aktuell.trim()) aus.push(aktuell.trim())
  return aus
}

const zaehle = (s: string): number => (s.replace(/'[^']*'/g, '').match(/\?/g) ?? []).length

export function planFuer(sql: string): Plan | null {
  const s = sql.replace(/\s+/g, ' ').trim()
  const ins = /^INSERT (?:OR \w+ )?INTO (\w+) \(([^)]*)\) VALUES \((.*)\)(.*)$/i.exec(s)
  if (ins) {
    const tabelle = ins[1].toLowerCase()
    const sens = SENSIBEL[tabelle]
    if (!sens && tabelle !== 'nutzer') return null
    const spalten = ins[2].split(',').map((x) => x.trim().toLowerCase())
    const werte = teile(ins[3])
    const art: Plan['art'] = []
    werte.forEach((w, i) => {
      const n = zaehle(w)
      for (let k = 0; k < n; k++)
        art.push(w === '?' && tabelle === 'nutzer' && spalten[i] === 'benutzer' ? 'kennung' : w === '?' && sens?.includes(spalten[i]) ? 'zu' : null)
    })
    return { tabelle, art }
  }
  const upd = /^UPDATE (\w+) SET (.*?)( WHERE .*)?$/i.exec(s)
  if (upd) {
    const tabelle = upd[1].toLowerCase()
    const sens = SENSIBEL[tabelle]
    if (!sens) return null
    const art: Plan['art'] = []
    for (const zuw of teile(upd[2])) {
      const m = /^(\w+) = \?$/.exec(zuw)
      const n = zaehle(zuw)
      for (let k = 0; k < n; k++) art.push(m && sens.includes(m[1].toLowerCase()) ? 'zu' : null)
    }
    if (upd[3]) for (let k = 0; k < zaehle(upd[3]); k++) art.push(tabelle === 'nutzer' && /benutzer = \?/i.test(upd[3]) ? 'kennung' : null)
    return { tabelle, art }
  }
  // Suche nach Benutzername
  if (/\bFROM nutzer\b/i.test(s) && /\bbenutzer = \?/i.test(s)) {
    const vor = s.slice(0, s.search(/\bbenutzer = \?/i))
    const idx = zaehle(vor)
    const art: Plan['art'] = Array.from({ length: zaehle(s) }, (_, i) => (i === idx ? 'kennung' : null))
    return { tabelle: 'nutzer', art }
  }
  return null
}

function werteFuer(plan: Plan | null, werte: unknown[]): unknown[] {
  if (!plan) return werte
  return werte.map((w, i) => (plan.art[i] === 'zu' ? zu(w) : plan.art[i] === 'kennung' && typeof w === 'string' && !istKennung(w) ? kennung(w) : w))
}

const migriert = new WeakMap<DatabaseSync, Set<string>>()

/** Vorhandene Zeilen einer Tabelle verschlüsseln (einmal je Start und Tabelle) */
export function migriere(d: DatabaseSync, tabelle: string): void {
  const fertig = migriert.get(d) ?? new Set<string>()
  migriert.set(d, fertig)
  if (fertig.has(tabelle)) return
  const da = d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabelle)
  if (!da) return
  fertig.add(tabelle)
  const spalten = new Set((d.prepare(`PRAGMA table_info(${tabelle})`).all() as { name: string }[]).map((s) => s.name))
  if (tabelle === 'nutzer' && !spalten.has('benutzer_v')) {
    d.exec("ALTER TABLE nutzer ADD COLUMN benutzer_v TEXT NOT NULL DEFAULT ''")
    spalten.add('benutzer_v')
  }
  const sens = (SENSIBEL[tabelle] ?? []).filter((s) => spalten.has(s))
  const zeilen = d.prepare(`SELECT rowid AS _r, * FROM ${tabelle}`).all() as Record<string, unknown>[]
  for (const z of zeilen) {
    const neu: Record<string, unknown> = {}
    for (const s of sens) {
      const v = z[s]
      if (v === null || v === undefined || v === '') continue
      const schon = typeof v === 'string' ? v.startsWith('v1:') : v instanceof Uint8Array && Buffer.from(v.subarray(0, 4)).equals(BLOB_KOPF)
      if (!schon) neu[s] = zu(v)
    }
    if (tabelle === 'nutzer' && typeof z.benutzer === 'string' && !istKennung(z.benutzer)) {
      neu.benutzer_v = zu(z.benutzer)
      neu.benutzer = kennung(z.benutzer)
    }
    const k = Object.keys(neu)
    if (!k.length) continue
    d.prepare(`UPDATE ${tabelle} SET ${k.map((x) => `${x} = ?`).join(', ')} WHERE rowid = ?`).run(...(k.map((x) => neu[x]) as never[]), z._r as never)
  }
}

/** Den Datenbankzugang umhüllen: Schreiben verschlüsselt, Lesen entschlüsselt */
export function geschuetzt(d: DatabaseSync): DatabaseSync {
  const prepare = d.prepare.bind(d)
  const tabellenIn = (sql: string): string[] => Object.keys(SENSIBEL).filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(sql))
  const umhuellt = (sql: string): StatementSync => {
    for (const t of tabellenIn(sql)) migriere(d, t)
    const st = prepare(sql)
    const plan = planFuer(sql)
    return new Proxy(st, {
      get(ziel, name, empf) {
        if (name === 'run') return (...w: unknown[]) => ziel.run(...(werteFuer(plan, w) as never[]))
        if (name === 'get') return (...w: unknown[]) => zeileVon(ziel.get(...(werteFuer(plan, w) as never[])))
        if (name === 'all') return (...w: unknown[]) => ziel.all(...(werteFuer(plan, w) as never[])).map((z) => zeileVon(z))
        const v = Reflect.get(ziel, name, empf) as unknown
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(ziel) : v
      }
    })
  }
  return new Proxy(d, {
    get(ziel, name, empf) {
      if (name === 'prepare') return umhuellt
      const v = Reflect.get(ziel, name, empf) as unknown
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(ziel) : v
    }
  })
}
