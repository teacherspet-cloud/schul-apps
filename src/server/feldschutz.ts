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
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { entschluessle, hauptschluessel, schluesselObjekt, verschluessle } from './geheim'

/** Tabelle → sensible Spalten */
export const SENSIBEL: Record<string, string[]> = {
  nutzer: ['name', 'gruppen', 'benutzer_v', 'iserv_sub'],
  // IServ-Anmeldung eines Gastkontos (09.10.2026): Benutzername und Kennung verschlüsselt, gesucht wird über benutzer_k (HMAC)
  konto_iserv: ['benutzer_v', 'iserv_sub'],
  // Klassen-/Kursnamen und IServ-Gruppe seit 08.10.2026 ebenfalls (Wunsch der Lehrkraft: alles verschlüsselt)
  lerngruppen: ['name', 'iserv_gruppe', 'mitglieder'],
  // Grund und Verlassen der Seite sind Angaben zur Person (Aufsicht), 08.10.2026
  teilnahmen: ['antworten', 'bewertung', 'vorfaelle', 'grund', 'verlassen'],
  onlinetest_tinte: ['png', 'text'],
  // Material der Lehrkraft (in den Ablagen ohnehin verschlüsselt) und Kopfangaben/Hinweise, 08.10.2026
  onlinetests: ['titel', 'fassungen', 'einstellungen'],
  feedback_freigaben: ['schueler', 'titel', 'vorlage'],
  feedback_abgaben: ['fassungen'],
  blatt_freigaben: ['schueler', 'auswertung', 'titel', 'thema', 'html', 'aufgaben', 'loesung', 'merk', 'einstellungen', 'themenbereich'],
  blatt_abgaben: ['antworten', 'tinte', 'aufgaben_feedback', 'hilfen', 'freigeschaltet'],
  // Grammatik-Lern-App (06.10.2026); `art` verrät Förder-/Forderaufgaben einzelner Lernender (08.10.2026)
  gram_zuweisungen: ['schueler', 'titel', 'thema', 'paket', 'info', 'art', 'problem_aus'],
  gram_stand: ['daten'],
  fach_kopien: ['titel'],
  reihen: ['titel', 'daten', 'veroeffentlicht'],
  // Verknüpfungen und freigegebene Haltepunkte: nur Kennungen – trotzdem verschlüsselt (im Zweifel verschlüsseln, 08.10.2026)
  reihen_zuweisungen: ['schueler', 'halte_frei', 'verknuepft'],
  reihen_stand: ['daten'],
  reihen_dateien: ['daten', 'name'],
  // entfernt: entfernte Abschnitte samt Wörtern (08.10.2026)
  vok_zuweisungen: ['schueler', 'titel', 'woerter', 'quelle', 'verben', 'teile', 'ueberschrift', 'problem_aus', 'entfernt'],
  vok_stand: ['daten'],
  vok_laufbahn: ['daten'],
  // Persönlicher Zugangscode der Gäste – für die Lehrkraft lesbar (08.10.2026), sonst nur als Prüfwert (codePruefwert)
  vok_gaeste: ['code_v'],
  // Rekordbuch der Lernenden (08.10.2026)
  rekord_buch: ['daten'],
  // Achievements der Lernenden (08.10.2026)
  achievements: ['daten'],
  tafel_freigaben: ['schueler', 'titel', 'thema', 'bilder'],
  hoertext_freigaben: ['titel'],
  // Schüler-Startseite (06.10.2026): Wochen-Schnappschuss und Lerntipp je Person (lernstand.ts)
  lern_wochen: ['daten'],
  // Darstellung der Lernenden (Leseschrift, Vorlesen, Zeilenabstand …) und Prüfprotokoll, 08.10.2026
  nutzer_darstellung: ['daten'],
  protokoll: ['text'],
  // Ausgeblendeter Handlungsbedarf (09.10.2026): Merkmale mit Kennungen Betroffener – im Zweifel verschlüsseln
  klassen_ausgeblendet: ['merkmal'],
  // KI-Nutzung der Lehrkräfte über Schlüssel der Schule (09.10.2026, kiNutzung.ts): nur Zahlen, trotzdem verschlüsselt
  ki_nutzung: ['daten'],
  // Erinnerungen zum Üben (10.10.2026, erinnerungen.ts): Einstellungen samt eigenem Text, Push-Geräte (Endpunkt, Schlüssel)
  push_wahl: ['daten'],
  push_geraete: ['daten'],
  // Schuljahreswechsel (10.10.2026, schuljahrWechsel.ts): alte/neue Klassennamen, Mitglieder, Lernstände für „Rückgängig"
  schuljahr_wechsel: ['daten'],
  // Klassen und Kurse aus IServ (10.10.2026, iservKursgruppen.ts): Mitgliedschaften je Person und erkannte Kurse der Lehrkraft
  iserv_erkannt: ['daten'],
  iserv_kursgruppen: ['daten']
}
const SPALTEN = new Set(Object.values(SENSIBEL).flat())

const BLOB_KOPF = Buffer.from('SAE1')

/** Suchschlüssel für Benutzernamen (deterministisch, nicht umkehrbar) */
export function kennung(benutzer: string): string {
  const k = createHmac('sha256', hauptschluessel()).update('benutzer-kennung').digest()
  return `k1:${createHmac('sha256', k).update(benutzer.trim().toLowerCase()).digest('hex')}`
}

/**
 * Merkmal einer fehlgeschlagenen Anmeldung (10.10.2026, Reiter „Server": Rateversuche erkennen): HMAC des Benutzernamens
 * bzw. der Adresse mit eigenem, aus dem Hauptschlüssel abgeleiteten Schlüssel, gekürzt auf 16 Hexzeichen – gleiche
 * Konten/Adressen lassen sich gruppieren, ohne dass Name oder Adresse im Protokoll stehen. Bewusst nicht `kennung()`:
 * Das Merkmal lässt sich so nicht mit der Spalte nutzer.benutzer verknüpfen.
 */
export function anmeldeMerkmal(art: 'konto' | 'adresse', wert: string): string {
  const k = createHmac('sha256', hauptschluessel()).update(`anmeldung-merkmal-${art}`).digest()
  const norm = art === 'konto' ? wert.trim().toLowerCase() : wert.trim().replace(/^::ffff:/i, '')
  return `${art === 'konto' ? 'k' : 'a'}:${createHmac('sha256', k).update(norm).digest('hex').slice(0, 16)}`
}

const istKennung = (s: unknown): boolean => typeof s === 'string' && s.startsWith('k1:')

function blobZu(b: Uint8Array): Buffer {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', schluesselObjekt(), iv)
  const daten = Buffer.concat([c.update(b), c.final()])
  return Buffer.concat([BLOB_KOPF, iv, c.getAuthTag(), daten])
}

function blobVon(b: Uint8Array): Uint8Array {
  const buf = Buffer.from(b)
  if (buf.length < 32 || !buf.subarray(0, 4).equals(BLOB_KOPF)) return b
  const d = createDecipheriv('aes-256-gcm', schluesselObjekt(), buf.subarray(4, 16))
  d.setAuthTag(buf.subarray(16, 32))
  return Buffer.concat([d.update(buf.subarray(32)), d.final()])
}

/** Zahlen in sensiblen Spalten (z. B. teilnahmen.verlassen) kommen beim Lesen wieder als Zahl zurück */
const ZAHL = '\u0001z:'

/** Einen Wert für eine sensible Spalte verschlüsseln (schon Verschlüsseltes bleibt) */
export function zu(wert: unknown): unknown {
  if (wert === null || wert === undefined) return wert
  if (wert instanceof Uint8Array) return Buffer.from(wert.subarray(0, 4)).equals(BLOB_KOPF) ? wert : blobZu(wert)
  if (typeof wert === 'number' || typeof wert === 'bigint') return verschluessle(`${ZAHL}${String(wert)}`)
  if (typeof wert !== 'string') return wert
  return wert.startsWith('v1:') ? wert : verschluessle(wert)
}

/** Einen gelesenen Wert entschlüsseln (Klartext aus alten Zeilen bleibt, wie er ist) */
export function von(wert: unknown): unknown {
  if (typeof wert === 'string' && wert.startsWith('v1:')) {
    let klar: string
    try {
      klar = entschluessle(wert)
    } catch {
      // Klartext, der zufällig mit „v1:" beginnt (z. B. ein Titel) – unverändert lassen
      return wert
    }
    return klar.startsWith(ZAHL) ? Number(klar.slice(ZAHL.length)) : klar
  }
  if (wert instanceof Uint8Array) {
    try {
      return blobVon(wert)
    } catch {
      return wert
    }
  }
  return wert
}

/**
 * Prüfwert für Zugangscodes der Gäste (08.10.2026, Befund der Prüfung: ungesalzenes SHA-256 eines 6–8-stelligen Codes
 * ist offline in Minuten durchprobiert). HMAC mit dem Hauptschlüssel über den bisherigen SHA-256 – so lassen sich
 * vorhandene Prüfwerte ohne den Code umstellen (`codePruefwertAusAlt`, wartung.ts) und alle Zeilen haben eine Form.
 */
export function codePruefwert(code: string): string {
  return codePruefwertAusAlt(createHash('sha256').update(code.toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex'))
}

/** Einen alten SHA-256-Prüfwert (64 Hexzeichen) in die neue Form bringen; alles andere bleibt */
export function codePruefwertAusAlt(alt: string): string {
  if (!/^[0-9a-f]{64}$/.test(alt)) return alt
  const k = createHmac('sha256', hauptschluessel()).update('code-pruefwert').digest()
  return `h2:${createHmac('sha256', k).update(alt).digest('hex')}`
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
  const ins = /^INSERT (?:OR \w+ )?INTO (\w+) \(([^)]*)\) VALUES \(/i.exec(s)
  if (ins) {
    const tabelle = ins[1].toLowerCase()
    const sens = SENSIBEL[tabelle]
    if (!sens && tabelle !== 'nutzer') return null
    const spalten = ins[2].split(',').map((x) => x.trim().toLowerCase())
    // VALUES-Liste bis zur passenden Klammer lesen (08.10.2026: Die gierige Suche bis zur letzten Klammer schloss bei
    // „ON CONFLICT(a)" den letzten Wert aus – rekord_buch.daten blieb so unverschlüsselt)
    const ab = ins[0].length
    let tiefe = 1
    let ende = ab
    for (; ende < s.length && tiefe > 0; ende++) {
      if (s[ende] === '(') tiefe++
      else if (s[ende] === ')') tiefe--
    }
    const werte = teile(s.slice(ab, ende - 1))
    const rest = s.slice(ende)
    const art: Plan['art'] = []
    werte.forEach((w, i) => {
      const n = zaehle(w)
      for (let k = 0; k < n; k++)
        art.push(w === '?' && tabelle === 'nutzer' && spalten[i] === 'benutzer' ? 'kennung' : w === '?' && sens?.includes(spalten[i]) ? 'zu' : null)
    })
    // Platzhalter danach (z. B. „DO UPDATE SET daten = ?"): sensible Spalten ebenfalls verschlüsseln
    for (const zuw of rest.split(/,| SET | WHERE /i)) {
      const m = /(\w+) = \?/.exec(zuw)
      for (let k = 0; k < zaehle(zuw); k++) art.push(m && sens?.includes(m[1].toLowerCase()) ? 'zu' : null)
    }
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

/** Feste Werte im SQL-Text (Zahl, 'Text', NULL) – stammen aus dem Code, nie von Personen */
const istLiteral = (w: string): boolean => /^(?:'(?:[^']|'')*'|NULL|-?\d+(?:\.\d+)?)$/i.test(w.trim())

/**
 * Schreibt die Anweisung eine sensible Spalte so, dass sie NICHT verschlüsselt würde? (08.10.2026: „fail closed" –
 * ein unbekanntes Muster ist ein Fehler, kein stiller Klartext.) Erlaubt sind für sensible Spalten: Platzhalter `?`,
 * feste Werte, eine andere sensible Spalte derselben Tabelle (Kopie des Chiffrats), `excluded.<sensibel>` und
 * COALESCE aus solchen. Liefert die Beanstandung oder null.
 */
export function schreibFehler(sql: string): string | null {
  const s = sql.replace(/\s+/g, ' ').trim()
  const kopf = /^(?:INSERT(?: OR \w+)?|REPLACE) INTO (\w+)|^UPDATE (?:OR \w+ )?(\w+) SET /i.exec(s)
  if (!kopf) return null
  const tabelle = (kopf[1] ?? kopf[2]).toLowerCase()
  const sens = SENSIBEL[tabelle]
  if (!sens) return null
  const sensibel = (x: string): boolean => sens.includes(x.toLowerCase())
  const wertOk = (w: string): boolean => {
    const t = w.trim()
    if (t === '?' || istLiteral(t)) return true
    const ex = /^(?:excluded\.)?(\w+)$/i.exec(t)
    if (ex) return sensibel(ex[1])
    const co = /^COALESCE\((.*)\)$/i.exec(t)
    return Boolean(co) && teile(co![1]).every(wertOk)
  }
  const zuweisungenOk = (liste: string): string | null => {
    for (const zuw of teile(liste)) {
      const m = /^(\w+) = (.+)$/s.exec(zuw.trim())
      if (!m) return `unbekannte Zuweisung „${zuw.trim().slice(0, 60)}"`
      if (sensibel(m[1]) && !wertOk(m[2])) return `${tabelle}.${m[1]} = ${m[2].slice(0, 40)}`
    }
    return null
  }
  if (kopf[1]) {
    const ins = /^(?:INSERT(?: OR \w+)?|REPLACE) INTO (\w+) \(([^)]*)\) VALUES \(/i.exec(s)
    if (!ins) return `${tabelle}: INSERT ohne Spaltenliste und VALUES`
    const spalten = ins[2].split(',').map((x) => x.trim().toLowerCase())
    let tiefe = 1
    let ende = ins[0].length
    for (; ende < s.length && tiefe > 0; ende++) {
      if (s[ende] === '(') tiefe++
      else if (s[ende] === ')') tiefe--
    }
    const werte = teile(s.slice(ins[0].length, ende - 1))
    if (werte.length !== spalten.length) return `${tabelle}: ${spalten.length} Spalten, ${werte.length} Werte`
    for (let i = 0; i < spalten.length; i++) if (sensibel(spalten[i]) && !(werte[i] === '?' || istLiteral(werte[i]))) return `${tabelle}.${spalten[i]} = ${werte[i]}`
    const rest = s.slice(ende).trim()
    if (rest.startsWith(',')) return `${tabelle}: mehrere VALUES-Zeilen`
    const upd = /DO UPDATE SET (.*?)(?: WHERE .*)?$/i.exec(rest)
    return upd ? zuweisungenOk(upd[1]) : null
  }
  const upd = /^UPDATE (?:OR \w+ )?\w+ SET (.*?)(?: WHERE .*)?$/i.exec(s)
  return upd ? zuweisungenOk(upd[1]) : `${tabelle}: unbekannte UPDATE-Form`
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

/**
 * Zähler der Schreibzugriffe auf `nutzer` (09.10.2026, Leistung): datenbank.ts merkt sich `alleNutzer()` (Entschlüsseln
 * aller Konten) und rechnet neu, sobald sich der Zähler ändert.
 */
export const nutzerSchreibzaehler = { stand: 0 }
const SCHREIBT_NUTZER = /^\s*(?:INSERT|UPDATE|DELETE|REPLACE)\b[\s\S]*?\bnutzer\b/i

/** Den Datenbankzugang umhüllen: Schreiben verschlüsselt, Lesen entschlüsselt */
export function geschuetzt(d: DatabaseSync): DatabaseSync {
  const prepare = d.prepare.bind(d)
  const muster = Object.keys(SENSIBEL).map((t) => [t, new RegExp(`\\b${t}\\b`, 'i')] as const)
  const tabellenIn = (sql: string): string[] => muster.filter(([, m]) => m.test(sql)).map(([t]) => t)
  /*
   * Vorbereitete Anweisungen je SQL-Text wiederverwenden (09.10.2026, Leistung): Prüfen, Planen und Vorbereiten kosteten
   * bei jedem Aufruf (z. B. je Lernende/r ein Lernstand). Nach Schemaänderungen bereitet SQLite selbst neu vor.
   */
  const fertig = new Map<string, StatementSync>()
  const umhuellt = (sql: string): StatementSync => {
    const da = fertig.get(sql)
    if (da) return da
    for (const t of tabellenIn(sql)) migriere(d, t)
    const fehler = schreibFehler(sql)
    if (fehler) throw new Error(`Feldschutz: Diese Anweisung würde Personenbezogenes unverschlüsselt schreiben (${fehler}).`)
    const st = prepare(sql)
    const plan = planFuer(sql)
    // „zuletzt gesehen" (stündlich je Sitzung) zählt nicht – höchstens 30 s alt in der gemerkten Liste
    const nutzerSchreiben = SCHREIBT_NUTZER.test(sql) && !/^\s*UPDATE nutzer SET zuletzt = \? WHERE id = \?\s*$/i.test(sql)
    const p = new Proxy(st, {
      get(ziel, name, empf) {
        if (name === 'run')
          return (...w: unknown[]) => {
            const r = ziel.run(...(werteFuer(plan, w) as never[]))
            if (nutzerSchreiben) nutzerSchreibzaehler.stand++
            return r
          }
        if (name === 'get') return (...w: unknown[]) => zeileVon(ziel.get(...(werteFuer(plan, w) as never[])))
        if (name === 'all') return (...w: unknown[]) => ziel.all(...(werteFuer(plan, w) as never[])).map((z) => zeileVon(z))
        const v = Reflect.get(ziel, name, empf) as unknown
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(ziel) : v
      }
    })
    if (fertig.size > 500) fertig.clear()
    fertig.set(sql, p)
    return p
  }
  return new Proxy(d, {
    get(ziel, name, empf) {
      if (name === 'prepare') return umhuellt
      const v = Reflect.get(ziel, name, empf) as unknown
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(ziel) : v
    }
  })
}
