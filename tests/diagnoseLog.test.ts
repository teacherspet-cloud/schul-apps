import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { adresseOhneCodes, bereinige, leseDiagnose, protokoll } from '../src/server/diagnose'
import { kiAblagenAufraeumen } from '../src/server/kiAblage'
import { fehlerKurz } from '../src/server/datenbank'

/* Diagnose-Protokolle zeilenweise verschlüsselt, ohne Codes und Inhalte (08.10.2026) */
describe('Diagnose-Protokolle', () => {
  let ordner = ''
  const vorher = process.env.SCHULAPPS_DATEN
  beforeEach(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    ordner = mkdtempSync(join(tmpdir(), 'diag-'))
    process.env.SCHULAPPS_DATEN = ordner
  })
  afterEach(() => {
    process.env.SCHULAPPS_DATEN = vorher
    rmSync(ordner, { recursive: true, force: true })
  })

  it('schreibt jede Zeile verschlüsselt und liest sie entschlüsselt zurück', () => {
    protokoll('browser', 'fehler /s/t/AB12CD?name=Lena | Cannot read x | ort | schueler | Safari')
    protokoll('langsam', '1200 ms GET /s/api/vokabeln/zugang?code=XY9Z 200')
    const roh = readFileSync(join(ordner, 'protokolle', 'browser.log'), 'utf8')
    expect(roh).toMatch(/^v1:/)
    expect(roh).not.toMatch(/Lena|AB12CD|Cannot/)
    const [z] = leseDiagnose('browser')
    expect(z).toContain('/s/t/…')
    expect(z).toContain('Cannot read x')
    expect(z).not.toMatch(/Lena|AB12CD/)
    expect(leseDiagnose('langsam')[0]).toContain('GET /s/api/vokabeln/zugang 200')
    expect(leseDiagnose('langsam')[0]).not.toContain('XY9Z')
  })

  it('Altzeilen im Klartext bleiben lesbar', () => {
    mkdirSync(join(ordner, 'protokolle'), { recursive: true })
    writeFileSync(join(ordner, 'protokolle', 'langsam.log'), '2026-10-08T07:00:00Z alt\n')
    protokoll('langsam', 'neu')
    const zeilen = leseDiagnose('langsam')
    expect(zeilen[0]).toBe('2026-10-08T07:00:00Z alt')
    expect(zeilen[1]).toMatch(/ neu$/)
  })

  it('Adressen: Abfrageteil, Anker und Codes in Schülerpfaden fallen weg, /s/api bleibt lesbar', () => {
    expect(adresseOhneCodes('https://meineschulapps.de/s/vt/K7P2QX?x=1#a')).toBe('https://meineschulapps.de/s/vt/…')
    expect(adresseOhneCodes('/s/gt/ABC123')).toBe('/s/gt/…')
    expect(adresseOhneCodes('/s/r/r9x/schritt')).toBe('/s/r/…/schritt')
    expect(adresseOhneCodes('/s/api/reihen/abc')).toBe('/s/api/reihen/abc')
    expect(adresseOhneCodes('/daten/nutzer/ab12cd34/material.json')).toBe('/daten/nutzer/…/material.json')
  })

  it('Inhalte: zitierter Text und SyntaxError-Meldungen werden entfernt', () => {
    expect(bereinige('Fehler beim Titel „Lenas Referat“ und "Max" sowie \'Tom\' gesehen')).not.toMatch(/Lena|Max|Tom/)
    expect(bereinige('error | SyntaxError: Unexpected token L in JSON at position 3: {"name":"Lena"} | ort')).toBe(
      'error | SyntaxError (Inhalt entfernt) | ort'
    )
    expect(fehlerKurz(new SyntaxError('Unexpected token in {"name":"Lena"}'))).toBe('SyntaxError')
    expect(fehlerKurz(new Error('Schritt „Lenas Plakat" fehlt'))).toBe('Error: Schritt … fehlt')
  })
})

describe('Ablagen der KI-Programme', () => {
  let daten = ''
  beforeEach(() => {
    daten = mkdtempSync(join(tmpdir(), 'ki-'))
  })
  afterEach(() => rmSync(daten, { recursive: true, force: true }))

  const lege = (p: string, inhalt = 'x'): void => {
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, inhalt)
  }

  it('entfernt Verläufe, Protokolle, SQLite und Bilder; Anmeldung bleibt', () => {
    const codex = join(daten, 'nutzer', 'u1', 'ki', 'codex')
    const claude = join(daten, 'nutzer', 'u1', 'ki', 'claude')
    for (const f of ['auth.json', 'config.toml', 'installation_id', 'models_cache.json']) lege(join(codex, f))
    for (const f of ['logs_2.sqlite', 'logs_2.sqlite-wal', 'memories_1.sqlite', 'state_5.sqlite-shm', 'history.jsonl'])
      lege(join(codex, f), 'Antwort von [Person-1]')
    lege(join(codex, 'sessions', '2026', 'x.jsonl'))
    lege(join(codex, 'log', 'codex-tui.log'))
    lege(join(codex, 'generated_images', 't1', 'bild.png'))
    lege(join(claude, '.credentials.json'))
    lege(join(claude, 'projects', 'p', 's.jsonl'))
    lege(join(daten, 'nutzer', 'u1', 'ki', 'tmp', 'abc', 'bild-0.png'))
    lege(join(daten, 'system', 'ki', 'codex', 'state_5.sqlite'))
    lege(join(daten, 'nutzer', 'u1', 'material.json'))
    const n = kiAblagenAufraeumen(daten, Date.now(), 0)
    expect(n).toBe(11)
    expect(readdirSync(codex).sort()).toEqual(['auth.json', 'config.toml', 'installation_id', 'models_cache.json'])
    expect(readdirSync(claude)).toEqual(['.credentials.json'])
    expect(readdirSync(join(daten, 'nutzer', 'u1', 'ki', 'tmp'))).toEqual([])
    expect(existsSync(join(daten, 'system', 'ki', 'codex', 'state_5.sqlite'))).toBe(false)
    expect(existsSync(join(daten, 'nutzer', 'u1', 'material.json'))).toBe(true)
    if (process.platform !== 'win32') {
      expect(statSync(join(codex, 'auth.json')).mode & 0o777).toBe(0o600)
      expect(statSync(codex).mode & 0o777).toBe(0o700)
    }
  })

  it('lässt frische Einträge laufender Aufrufe stehen', () => {
    const codex = join(daten, 'nutzer', 'u1', 'ki', 'codex')
    lege(join(codex, 'logs_2.sqlite'))
    lege(join(daten, 'nutzer', 'u1', 'ki', 'tmp', 'laeuft', 'schema.json'))
    lege(join(codex, 'history.jsonl'))
    const alt = (Date.now() - 60 * 60 * 1000) / 1000
    utimesSync(join(codex, 'history.jsonl'), alt, alt)
    expect(kiAblagenAufraeumen(daten)).toBe(1)
    expect(existsSync(join(codex, 'logs_2.sqlite'))).toBe(true)
    expect(existsSync(join(daten, 'nutzer', 'u1', 'ki', 'tmp', 'laeuft'))).toBe(true)
  })
})
