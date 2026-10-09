import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

/*
 * Reiter „Server" der Verwaltung (09.10.2026): Ampel-Regeln, Ringpuffer der Messwerte (8 Tage), Tageszahlen,
 * Fehler zusammenfassen und Sicherungen (Anlegen gepackt, die neuesten 14 bleiben) – alles im Temp-Ordner.
 */
const ORDNER = mkdtempSync(join(tmpdir(), 'schulapps-serverzustand-'))
process.env.SCHULAPPS_DATEN = ORDNER

const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
const db = await import('../src/server/datenbank')
const r = await import('../src/server/serverRegeln')
const zu = await import('../src/server/serverZustand')
const si = await import('../src/server/sicherungen')

afterAll(() => rmSync(ORDNER, { recursive: true, force: true }))
beforeEach(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  db.datenbankFuerTests()
})

const gesund: Parameters<typeof r.gesundheitPruefen>[0] = {
  speicherAnteil: 0.4,
  platteFrei: 0.6,
  zertifikatTage: 60,
  sicherungStunden: 5,
  fehler24h: 0,
  langsam24h: 0,
  anfragen24h: 1000
}

describe('Ampel', () => {
  it('alles im grünen Bereich → keine Befunde', () => {
    expect(r.gesundheitPruefen(gesund)).toEqual([])
    expect(r.gesamtStufe([])).toBe('ok')
  })

  it('meldet Speicher, Platte, Zertifikat, Sicherung, Fehler und Langsamkeit – dringendes zuerst', () => {
    const b = r.gesundheitPruefen({ speicherAnteil: 0.85, platteFrei: 0.04, zertifikatTage: 10, sicherungStunden: 40, fehler24h: 25, langsam24h: 80, anfragen24h: 1000 })
    expect(b.map((x) => x.stufe)).toEqual(['kritisch', 'warnung', 'warnung', 'warnung', 'warnung', 'warnung'])
    expect(b[0].titel).toMatch(/Platte.*4 %/)
    expect(b.some((x) => /Arbeitsspeicher.*85 %/.test(x.titel))).toBe(true)
    expect(b.some((x) => /Zertifikat läuft in 10 Tagen/.test(x.titel))).toBe(true)
    expect(b.some((x) => /40 Stunden/.test(x.titel))).toBe(true)
    expect(b.every((x) => x.tun.length > 10)).toBe(true)
  })

  it('Grenzen: genau 80 % Speicher und 15 % frei sind noch in Ordnung; fehlende Sicherung ist eine Warnung', () => {
    expect(r.gesundheitPruefen({ ...gesund, speicherAnteil: 0.8, platteFrei: 0.15 })).toEqual([])
    const ohne = r.gesundheitPruefen({ ...gesund, sicherungStunden: null })
    expect(ohne).toHaveLength(1)
    expect(ohne[0].titel).toMatch(/noch keine Sicherung/)
    expect(r.gesundheitPruefen({ ...gesund, zertifikatTage: -1 })[0]).toMatchObject({ stufe: 'kritisch', titel: expect.stringMatching(/abgelaufen/) })
  })

  it('wenige langsame Anfragen bei viel Betrieb sind kein Befund', () => {
    expect(r.gesundheitPruefen({ ...gesund, langsam24h: 30, anfragen24h: 100_000 })).toEqual([])
    expect(r.gesundheitPruefen({ ...gesund, langsam24h: 30, anfragen24h: 2000 })[0].stufe).toBe('hinweis')
  })
})

describe('Messwerte (Ringpuffer)', () => {
  it('speichert alle 5 Minuten und löscht nach 8 Tagen', () => {
    const jetzt = Date.UTC(2026, 9, 9, 12)
    const w = { cpu: 0.2, system: 0.5, prozess: 0.1, prozessByte: 200e6 }
    for (let i = 0; i < 10 * 288; i += 12) zu.messen(jetzt - i * zu.MESS_MS, w)
    zu.messen(jetzt, w)
    zu.messwerteAufraeumen(jetzt)
    const alle = zu.messwerte(0)
    expect(alle.length).toBeGreaterThan(0)
    expect(Math.min(...alle.map((m) => m.zeit))).toBeGreaterThanOrEqual(jetzt - zu.AUFHEBEN_MS)
    expect(alle.at(-1)).toMatchObject({ zeit: jetzt, cpu: 0.2, prozessByte: 200e6 })
  })

  it('verdichtet zu Stundenmitteln', () => {
    const h = Date.UTC(2026, 9, 9, 10)
    const v = r.verdichten(
      [
        { zeit: h, cpu: 0.2, system: 0.4, prozess: 0.1, prozessByte: 100 },
        { zeit: h + 30 * 60_000, cpu: 0.4, system: 0.6, prozess: 0.3, prozessByte: 300 },
        { zeit: h + 36e5, cpu: 1, system: 1, prozess: 1, prozessByte: 1 }
      ],
      36e5
    )
    expect(v).toHaveLength(2)
    expect(v[0].zeit).toBe(h)
    expect(v[0].cpu).toBeCloseTo(0.3)
    expect(v[0].prozessByte).toBe(200)
  })
})

describe('Nutzung je Tag', () => {
  it('zählt Konten einmal je Tag, Vorschaukonten nie, und füllt fehlende Tage mit 0', () => {
    const jetzt = Date.now()
    zu.kontoAktiv({ id: 'l1', rolle: 'lehrkraft' }, jetzt)
    zu.kontoAktiv({ id: 'l1', rolle: 'lehrkraft' }, jetzt)
    zu.kontoAktiv({ id: 's1', rolle: 'schueler', quelle: 'gast' }, jetzt)
    zu.kontoAktiv({ id: 's2', rolle: 'schueler' }, jetzt)
    zu.kontoAktiv({ id: 'v1', rolle: 'schueler', quelle: 'vorschau' }, jetzt)
    zu.anfrageGemessen(200, 200, jetzt)
    zu.anfrageGemessen(1500, 200, jetzt)
    zu.anfrageGemessen(30, 500, jetzt)
    const tage = zu.tagesZahlen(14, jetzt)
    expect(tage).toHaveLength(14)
    expect(tage.at(-1)).toMatchObject({ tag: r.tagVon(jetzt), lehrkraefte: 1, lernende: 2, anfragen: 3, langsam: 1, fehler: 1, ms: 1730 })
    expect(tage[0]).toMatchObject({ lehrkraefte: 0, anfragen: 0 })
    expect(zu.geradeAktiv(jetzt)).toEqual({ lehrkraefte: 1, lernende: 2 })
    // Schreiben verdoppelt nichts: Zähler als Delta, aktive Konten als Höchstwert
    zu.zaehlerSchreiben()
    zu.zaehlerSchreiben()
    expect(zu.tagesZahlen(14, jetzt).at(-1)).toMatchObject({ lehrkraefte: 1, lernende: 2, anfragen: 3, langsam: 1 })
    zu.anfrageGemessen(10, 200, jetzt)
    zu.zaehlerSchreiben()
    expect(zu.tagesZahlen(14, jetzt).at(-1)).toMatchObject({ anfragen: 4 })
    // Tabelle enthält nur Zahlen – keine Kennungen
    const zeilen = db.datenbank().prepare('SELECT * FROM server_tage').all() as Record<string, unknown>[]
    expect(JSON.stringify(zeilen)).not.toMatch(/l1|s1|s2/)
  })

  it('KI-Zusammenfassung summiert die Zeilen der angemeldeten Quelle je Tag', () => {
    const jetzt = Date.now()
    expect(zu.kiJeTag(14, jetzt)).toBeNull()
    const heute = r.tagVon(jetzt)
    zu.setzeKiNutzungQuelle(() => [
      { tag: heute, auftraege: 2, anfragen: 5 },
      { tag: heute, auftraege: 1, anfragen: 3 }
    ])
    const ki = zu.kiJeTag(14, jetzt)!
    expect(ki).toHaveLength(14)
    expect(ki.at(-1)).toEqual({ tag: heute, auftraege: 3, anfragen: 8 })
    zu.setzeKiNutzungQuelle(null)
  })
})

describe('Fehler zusammenfassen', () => {
  it('gleiche Meldung trotz anderer Zahlen und Kennungen = eine Gruppe, mit Hinweis', () => {
    const g = r.fehlerGruppieren([
      { zeit: '2026-10-09T08:00:00.000Z', quelle: 'server', text: 'FEHLER POST /api: database is locked (12 ms)' },
      { zeit: '2026-10-09T09:00:00.000Z', quelle: 'server', text: 'FEHLER POST /api: database is locked (340 ms)' },
      { zeit: '2026-10-09T07:00:00.000Z', quelle: 'browser', text: 'fehler /s/ | ChunkLoadError: Loading chunk 3f2a9c1b failed' },
      { zeit: '2026-10-09T07:30:00.000Z', quelle: 'browser', text: 'fehler /s/ | ChunkLoadError: Loading chunk 77aa00ffee failed' },
      { zeit: '2026-10-09T10:00:00.000Z', quelle: 'protokoll', text: 'anmeldung: Anmeldung mit Passwort fehlgeschlagen' },
      { zeit: '2026-10-09T06:00:00.000Z', quelle: 'server', text: 'FEHLER GET /x: etwas ganz anderes' }
    ])
    expect(g).toHaveLength(4)
    expect(g[0]).toMatchObject({ anzahl: 2, quelle: 'server', zuletzt: '2026-10-09T09:00:00.000Z' })
    expect(g[0].hinweis).toMatch(/Datenbank war kurz belegt/)
    expect(g[1].hinweis).toMatch(/alte Fassung/)
    expect(g.find((x) => x.quelle === 'protokoll')?.hinweis).toMatch(/Passwort/)
    expect(g.find((x) => /ganz anderes/.test(x.meldung))?.hinweis).toBe('')
  })

  it('erkennt Fehler in den Diagnosezeilen', () => {
    expect(r.diagnoseZeile('2026-10-09T08:00:00.000Z 1500 ms GET /a 200')).toEqual({ zeit: '2026-10-09T08:00:00.000Z', text: '1500 ms GET /a 200' })
    expect(r.istServerFehler('1500 ms GET /a 200')).toBe(false)
    expect(r.istServerFehler('1500 ms GET /a 502')).toBe(true)
    expect(r.istServerFehler('FEHLER POST /api: x')).toBe(true)
  })
})

describe('Sicherungen', () => {
  it('legt eine gepackte Sicherung an (Rechte, Name, Inhalt) und nie zwei gleichzeitig', async () => {
    const daten = mkdtempSync(join(tmpdir(), 'schulapps-sicherung-'))
    try {
      writeFileSync(join(daten, 'schulapps.db'), 'x'.repeat(5000))
      const a = si.sicherungStarten(daten, undefined, new Date('2026-10-09T12:34:00Z'), (ziel) => writeFileSync(ziel, 'INHALT'.repeat(1000)))
      expect(a.ok).toBe(true)
      expect(si.sicherungStarten(daten).ok).toBe(false)
      await a.fertig
      const namen = readdirSync(join(daten, 'sicherungen'))
      expect(namen).toEqual(['schulapps-2026-10-09-12-34.db.gz'])
      expect(gunzipSync(readFileSync(join(daten, 'sicherungen', namen[0]))).toString()).toBe('INHALT'.repeat(1000))
      expect(si.sicherungsStand()).toMatchObject({ laeuft: false, schritt: 'fertig', anteil: 1 })
      const liste = si.listeSicherungen(daten)
      expect(liste[0]).toMatchObject({ name: namen[0], ort: 'sicherungen' })
    } finally {
      rmSync(daten, { recursive: true, force: true })
    }
  })

  it('behält die neuesten 14 (nach Zeit), fremde Dateien und Sicherungen im Datenordner bleiben', () => {
    const daten = mkdtempSync(join(tmpdir(), 'schulapps-sicherung-'))
    try {
      const o = si.sicherungsOrdner(daten)
      const basis = Date.UTC(2026, 8, 1) / 1000
      for (let i = 0; i < 20; i++) {
        const p = join(o, `schulapps-2026-09-${String(i + 1).padStart(2, '0')}.db.gz`)
        writeFileSync(p, 'x')
        utimesSync(p, basis + i * 86400, basis + i * 86400)
      }
      writeFileSync(join(o, 'notiz.txt'), 'bleibt')
      writeFileSync(join(daten, 'sicherung-vor-iserv-abgleich-2026-10-01.db'), 'x')
      const weg = si.sicherungenAufraeumen(daten)
      expect(weg).toHaveLength(6)
      expect(weg).toContain('schulapps-2026-09-01.db.gz')
      expect(existsSync(join(o, 'schulapps-2026-09-20.db.gz'))).toBe(true)
      expect(existsSync(join(o, 'schulapps-2026-09-06.db.gz'))).toBe(false)
      expect(existsSync(join(o, 'schulapps-2026-09-07.db.gz'))).toBe(true)
      expect(existsSync(join(o, 'notiz.txt'))).toBe(true)
      const liste = si.listeSicherungen(daten)
      expect(liste.filter((s) => s.ort === 'sicherungen')).toHaveLength(14)
      expect(liste.some((s) => s.ort === 'daten')).toBe(true)
    } finally {
      rmSync(daten, { recursive: true, force: true })
    }
  })

  it('zuEntfernen betrifft nur schulapps-*.db[.gz]', () => {
    expect(
      r.zuEntfernen(
        [
          { name: 'schulapps-a.db.gz', zeit: 3 },
          { name: 'schulapps-b.db', zeit: 2 },
          { name: 'anderes.db.gz', zeit: 1 },
          { name: 'schulapps-c.db.gz', zeit: 1 }
        ],
        2
      )
    ).toEqual(['schulapps-c.db.gz'])
  })
})
