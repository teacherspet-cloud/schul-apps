import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/*
 * Einspielen der Grammatikbank-Dateien (29.10.2026, Befund beim Aufspielen von Green Line 5 Unit 1): Aufgaben zu ganz
 * neuen Formen fielen still weg, weil die mitgelieferten Regelkarten nie angelegt wurden. Jetzt: Karten neuer Schlüssel
 * anlegen, Aufgaben einspielen, gleiche Aufgaben nie doppelt.
 */
const ordner = mkdtempSync(join(tmpdir(), 'einspielen-'))
vi.mock('electron', () => ({ app: { getPath: () => join(ordner, 'nutzer') } }))

const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
const { datenbank, datenbankFuerTests } = await import('../src/server/datenbank')

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  // Eine vorhandene Bank (eingespielt wird nur in eine vorhandene)
  const d = datenbank()
  d.exec(`CREATE TABLE IF NOT EXISTS gram_bank (id TEXT PRIMARY KEY, sprache TEXT NOT NULL, schluessel TEXT NOT NULL, form TEXT NOT NULL,
    uebung TEXT NOT NULL, niveau TEXT NOT NULL DEFAULT 'm', pos INTEGER NOT NULL, bank_aufgabe TEXT NOT NULL, geaendert TEXT NOT NULL, pruefen TEXT NOT NULL DEFAULT '')`)
  d.prepare("INSERT INTO gram_bank (id, sprache, schluessel, form, uebung, niveau, pos, bank_aufgabe, geaendert) VALUES ('x', 'en', 'en.verb.be_have/be', 'en.verb.be_have', 'erkennen', 'm', 1, '{}', '2026-10-01')").run()
})
afterAll(() => rmSync(ordner, { recursive: true, force: true }))

describe('Einspielen', () => {
  it('neue Formen von Green Line 5 Unit 1 kommen mit Regelkarte an, nichts doppelt', async () => {
    const { bankZahlen } = await import('../src/server/grammatikBank')
    bankZahlen('en')
    const d = datenbank()
    const datei = JSON.parse(readFileSync('resources/grammatik-bank/greenline5-unit1-2026-10-29.json', 'utf8')) as { neu: { schluessel: string }[]; regeln: Record<string, unknown> }
    const k = 'en.focus.cleft/it-cleft'
    expect(d.prepare('SELECT 1 FROM gram_bank_regel WHERE schluessel = ?').get(k)).toBeTruthy()
    const n = (d.prepare('SELECT COUNT(*) AS n FROM gram_bank WHERE schluessel = ?').get(k) as { n: number }).n
    expect(n).toBe(datei.neu.filter((e) => e.schluessel === k).length)
    const frei = (d.prepare("SELECT COUNT(*) AS n FROM gram_bank WHERE schluessel LIKE 'en.focus.%' AND pruefen = ''").get() as { n: number }).n
    expect(frei).toBeGreaterThan(500)
  }, 120_000)
})
