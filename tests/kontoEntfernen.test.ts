import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Löschkonzept (23.10.2026, Prüfung des Schulträgers): „Konto löschen" entfernt ALLES der Person. Der Test liest alle
 * CREATE TABLE (und ADD COLUMN) aus src/server, legt die Tabellen an, schreibt je Tabelle mit Personenspalte eine Zeile
 * der Person und eine einer anderen Person und prüft nach kontoEntfernen: von der Person bleibt nichts (auch nicht in
 * Listen wie `schueler`/`mitglieder`, Verweisen und der Ablage), die andere Person bleibt unberührt.
 */
const ORDNER = mkdtempSync(join(tmpdir(), 'schulapps-konto-entfernen-'))
process.env.SCHULAPPS_DATEN = ORDNER

const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
const db = await import('../src/server/datenbank')
const { LISTEN_SPALTEN, PERSONEN_SPALTEN, VERWEISE, ANONYMISIEREN, WAISEN, personenSpaltenVon, tabellenMitSpalten, kontoHmac, loeschungenNachziehen } = await import(
  '../src/server/personDaten'
)

afterAll(() => rmSync(ORDNER, { recursive: true, force: true }))

const SERVER = join(__dirname, '..', 'src', 'server')

function quellen(): string[] {
  const aus: string[] = []
  const lauf = (o: string): void => {
    for (const n of readdirSync(o, { withFileTypes: true })) {
      if (n.isDirectory()) lauf(join(o, n.name))
      else if (n.name.endsWith('.ts')) aus.push(readFileSync(join(o, n.name), 'utf8'))
    }
  }
  lauf(SERVER)
  return aus
}

/** CREATE TABLE … ( … ) mit passender Klammer; ADD COLUMN aus Zeichenketten ohne Platzhalter */
function schemaAusQuellen(): { tabellen: Map<string, string>; spalten: string[] } {
  const tabellen = new Map<string, string>()
  const spalten: string[] = []
  for (const s of quellen()) {
    const re = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(/g
    let m: RegExpExecArray | null
    while ((m = re.exec(s))) {
      let tiefe = 1
      let i = m.index + m[0].length
      for (; i < s.length && tiefe > 0; i++) {
        if (s[i] === '(') tiefe++
        else if (s[i] === ')') tiefe--
      }
      const sql = s.slice(m.index, i)
      if (!sql.includes('${') && !tabellen.has(m[1])) tabellen.set(m[1], sql)
    }
    const alt = /(["'`])(ALTER TABLE \w+ ADD COLUMN (?:(?!\1).)*?)\1/g
    while ((m = alt.exec(s))) if (!m[2].includes('${')) spalten.push(m[2])
  }
  return { tabellen, spalten }
}

describe('kontoEntfernen lässt nichts zurück', () => {
  let anna: { id: string; benutzer: string }
  let ben: { id: string; benutzer: string }
  let gefunden: Map<string, string>

  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    db.datenbankFuerTests()
    const d = db.datenbank()
    const s = schemaAusQuellen()
    gefunden = s.tabellen
    for (const sql of s.tabellen.values()) d.exec(sql)
    for (const sql of s.spalten)
      try {
        d.exec(sql)
      } catch {
        // Spalte schon da
      }
    // Spalten, die krise.ts in einer Schleife ergänzt (23.10.2026)
    for (const sp of ['fall TEXT', 'art TEXT', 'erinnert INTEGER', 'erst_gesehen INTEGER', 'erst_gesehen_von TEXT'])
      try {
        d.exec(`ALTER TABLE krisen_hinweise ADD COLUMN ${sp}`)
      } catch {
        // schon da
      }
    anna = db.nutzerAnlegen({ benutzer: 'anna.abgang', name: 'Anna Abgang', rolle: 'schueler', quelle: 'iserv' })
    ben = db.nutzerAnlegen({ benutzer: 'ben.bleibt', name: 'Ben Bleibt', rolle: 'schueler', quelle: 'iserv' })

    d.exec('PRAGMA foreign_keys = OFF')
    for (const [tabelle, spalten] of tabellenMitSpalten(d)) {
      if (tabelle === 'nutzer') continue
      const person = personenSpaltenVon(d, tabelle, spalten)
      const listen = spalten.filter((x) => (LISTEN_SPALTEN as readonly string[]).includes(x))
      const verweise = VERWEISE[tabelle] ?? []
      if (!person.length && !listen.length) continue
      const info = d.prepare(`PRAGMA table_info(${tabelle})`).all() as { name: string; type: string }[]
      ;[anna, ben].forEach((p, i) => {
        const werte = info.map((c) => {
          if (person.includes(c.name)) return p.id
          if (verweise.includes(c.name)) return anna.id
          // Kinder ohne Fremdschlüssel hängen an der Elternzeile derselben Person
          const w = WAISEN.find((x) => x.tabelle === tabelle && x.spalte === c.name)
          if (w) return `${w.eltern}-${w.elternSpalte}-${i}`
          if (listen.includes(c.name)) return JSON.stringify(p === anna ? [anna.id, anna.benutzer, ben.id] : [ben.id, ben.benutzer, anna.benutzer])
          if (/INT/i.test(c.type)) return i + 1
          if (/BLOB/i.test(c.type)) return Buffer.from(`blob-${i}`)
          return `${tabelle}-${c.name}-${i}`
        })
        d.prepare(`INSERT INTO ${tabelle} (${info.map((c) => c.name).join(', ')}) VALUES (${info.map(() => '?').join(', ')})`).run(...(werte as never[]))
      })
    }
    d.exec('PRAGMA foreign_keys = ON')
    db.protokolliereServer('test', 'Eintrag der Person', anna.id)
    mkdirSync(join(ORDNER, 'nutzer', anna.id), { recursive: true })
    writeFileSync(join(ORDNER, 'nutzer', anna.id, 'einstellungen.json'), '{}')
    mkdirSync(join(ORDNER, 'nutzer', ben.id), { recursive: true })
  })

  it('findet die Tabellen mit Personenbezug in den Quellen', () => {
    for (const t of [
      'krisen_hinweise',
      'sprech_stand',
      'sprech_vorfaelle',
      'push_geraete',
      'push_wahl',
      'reihen_dateien',
      'teilnahmen',
      'blatt_abgaben',
      'feedback_abgaben',
      'vok_stand',
      'gram_stand',
      'achievements',
      'rekord_buch',
      'lern_wochen',
      'ki_nutzung',
      'plan_gesehen',
      'iserv_erkannt',
      'bewertung_spur',
      'datenschutz_kenntnis'
    ])
      expect(gefunden.has(t), t).toBe(true)
    expect(gefunden.size).toBeGreaterThan(50)
  })

  it('entfernt Zeilen, Listeneinträge, Verweise und Ablage – nur der Person', () => {
    const d = db.datenbank()
    db.kontoEntfernen(anna)
    expect(db.nutzerNachId(anna.id)).toBeNull()
    expect(db.nutzerNachId(ben.id)).not.toBeNull()
    let mitPerson = 0
    for (const [tabelle, spalten] of tabellenMitSpalten(d)) {
      if (tabelle === 'nutzer') continue
      const person = personenSpaltenVon(d, tabelle, spalten)
      for (const s of person) {
        const n = Number((d.prepare(`SELECT COUNT(*) AS n FROM ${tabelle} WHERE ${s} = ?`).get(anna.id) as { n: number }).n)
        expect(n, `${tabelle}.${s}`).toBe(0)
        if (!ANONYMISIEREN[tabelle]) {
          const b = Number((d.prepare(`SELECT COUNT(*) AS n FROM ${tabelle} WHERE ${s} = ?`).get(ben.id) as { n: number }).n)
          expect(b, `${tabelle}.${s} (andere Person)`).toBeGreaterThan(0)
        }
      }
      if (person.length) mitPerson++
      for (const s of spalten.filter((x) => (LISTEN_SPALTEN as readonly string[]).includes(x))) {
        for (const z of d.prepare(`SELECT ${s} AS ${s} FROM ${tabelle}`).all() as Record<string, string>[]) {
          const liste = JSON.parse(z[s]) as string[]
          expect(liste, `${tabelle}.${s}`).not.toContain(anna.id)
          expect(liste, `${tabelle}.${s}`).not.toContain(anna.benutzer)
        }
        expect(JSON.stringify(d.prepare(`SELECT ${s} AS ${s} FROM ${tabelle}`).all()), `${tabelle}.${s}`).toContain(ben.id)
      }
      for (const s of VERWEISE[tabelle] ?? [])
        expect(Number((d.prepare(`SELECT COUNT(*) AS n FROM ${tabelle} WHERE ${s} = ?`).get(anna.id) as { n: number }).n), `${tabelle}.${s}`).toBe(0)
    }
    expect(mitPerson).toBeGreaterThan(40)
    // Protokoll: Zeile bleibt (Nachweis), aber ohne Kennung
    expect(db.leseServerProtokoll(50).some((z) => z.nutzer_id === anna.id)).toBe(false)
    expect(db.leseServerProtokoll(50).some((z) => z.text === 'Eintrag der Person')).toBe(true)
    // Ablage
    expect(existsSync(join(ORDNER, 'nutzer', anna.id))).toBe(false)
    expect(existsSync(join(ORDNER, 'nutzer', ben.id))).toBe(true)
    expect(PERSONEN_SPALTEN.length).toBeGreaterThan(3)
  })

  it('Sprechtraining einer gelöschten Lehrkraft: Stand und Vorfälle ohne Freigabe gehen mit', () => {
    const d = db.datenbank()
    const lk = db.nutzerAnlegen({ benutzer: 'l.lehrer', name: 'L. Lehrer', rolle: 'lehrkraft', quelle: 'iserv' })
    d.prepare("INSERT INTO sprech_freigaben (id, lehrkraft_id, vok_id, teile, bis, erstellt) VALUES ('sf1', ?, 'v', '[]', 0, 'x')").run(lk.id)
    d.prepare("INSERT INTO sprech_stand (freigabe_id, schueler_id, daten, aktualisiert) VALUES ('sf1', ?, '{}', 1)").run(ben.id)
    d.prepare("INSERT INTO sprech_vorfaelle (id, freigabe_id, schueler_id, art, zeit) VALUES ('v1', 'sf1', ?, 'x', 1)").run(ben.id)
    db.kontoEntfernen(lk)
    expect(d.prepare("SELECT 1 FROM sprech_stand WHERE freigabe_id = 'sf1'").get()).toBeUndefined()
    expect(d.prepare("SELECT 1 FROM sprech_vorfaelle WHERE freigabe_id = 'sf1'").get()).toBeUndefined()
  })

  // Nachprüfung des Schulträgers (23.10.2026): Auswahl „Transkript nur für …" der Hörtexte (Benutzernamen, klein)
  it('Hörtext-Freigabe: die Person verschwindet aus transkript_wahl, die anderen bleiben', () => {
    const d = db.datenbank()
    const lk = db.nutzerAnlegen({ benutzer: 'h.hoer', name: 'H. Hoer', rolle: 'lehrkraft', quelle: 'iserv' })
    const carla = db.nutzerAnlegen({ benutzer: 'Carla.Geht', name: 'Carla Geht', rolle: 'schueler', quelle: 'iserv' })
    d.prepare("INSERT INTO hoertext_freigaben (kennung, nutzer_id, datei, erstellt, transkript_wahl) VALUES ('hk1', ?, 'a.mp3', 'x', ?)").run(
      lk.id,
      JSON.stringify({ wer: 'einzelne', schueler: ['carla.geht', 'ben.bleibt'] })
    )
    db.kontoEntfernen(carla)
    const z = d.prepare("SELECT transkript_wahl FROM hoertext_freigaben WHERE kennung = 'hk1'").get() as { transkript_wahl: string }
    expect(JSON.parse(z.transkript_wahl)).toEqual({ wer: 'einzelne', schueler: ['ben.bleibt'] })
  })

  it('vermerkt gelöschte Konten nur als HMAC und zieht Löschungen nach einer Wiederherstellung nach', () => {
    const d = db.datenbank()
    const zeilen = d.prepare('SELECT id_hmac, datum FROM geloeschte_konten').all() as { id_hmac: string; datum: string }[]
    expect(zeilen.some((x) => x.id_hmac === kontoHmac(anna.id))).toBe(true)
    expect(JSON.stringify(zeilen)).not.toContain(anna.id)
    expect(zeilen.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.datum))).toBe(true)
    // „Zurückgespielt": das Konto ist wieder da (alte Sicherung) – der Nachtlauf löscht es erneut, Ben bleibt
    d.prepare("INSERT INTO nutzer (id, benutzer, name, rolle, quelle, erstellt) VALUES (?, 'anna.zurueck', 'Anna', 'schueler', 'iserv', 'x')").run(anna.id)
    const weg: string[] = []
    expect(loeschungenNachziehen(d, (id) => (weg.push(id), db.kontoEntfernen({ id })))).toBe(1)
    expect(weg).toEqual([anna.id])
    expect(db.nutzerNachId(anna.id)).toBeNull()
    expect(db.nutzerNachId(ben.id)).not.toBeNull()
  })
})
