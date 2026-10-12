import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/*
 * Fachobleute (12.10.2026): Der Admin ernennt je Fach Lehrkräfte; sie bearbeiten gemeinsame Lehrwerke ihres Fachs
 * (Vokabeln, Grammatikformen). Server: Tabelle fach_obleute (verschlüsselt), Rechte in den Diensten (rolle.ts).
 */
const ordner = mkdtempSync(join(tmpdir(), 'fachobleute-'))
vi.mock('electron', () => ({ app: { getPath: () => join(ordner, 'nutzer') } }))

const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
const { datenbank, datenbankFuerTests, nutzerAnlegen } = await import('../src/server/datenbank')
const { alleFachobleute, fachobmannFaecher, setzeFachobmann } = await import('../src/server/fachobleute')
const { SENSIBEL } = await import('../src/server/feldschutz')
const { setzeFachobmannQuelle, setzeRolleQuelle } = await import('../src/main/services/rolle')
const { listeLehrwerkGrammatik, loescheLehrwerkGrammatik, speichereLehrwerkGrammatik } = await import('../src/main/services/storage/lehrwerkGrammatik')
const { LEHRWERK_GRAMMATIK, LEHRWERK_GRAMMATIK_EINGEBAUT, wendeGrammatikAn } = await import('../src/renderer/src/shared/lehrwerkGrammatik')

let rolle: 'admin' | 'lehrkraft' | 'schueler' = 'lehrkraft'
let faecher: string[] = []
const alteUmgebung = { server: process.env.SCHULAPPS_SERVER, daten: process.env.SCHULAPPS_DATEN }

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  process.env.SCHULAPPS_SERVER = '1'
  process.env.SCHULAPPS_DATEN = ordner
  setzeRolleQuelle(() => rolle)
  setzeFachobmannQuelle(() => faecher)
})
afterAll(() => {
  process.env.SCHULAPPS_SERVER = alteUmgebung.server
  process.env.SCHULAPPS_DATEN = alteUmgebung.daten
  if (alteUmgebung.server === undefined) delete process.env.SCHULAPPS_SERVER
  if (alteUmgebung.daten === undefined) delete process.env.SCHULAPPS_DATEN
  setzeRolleQuelle(() => 'admin')
  setzeFachobmannQuelle(() => [])
  wendeGrammatikAn([])
  rmSync(ordner, { recursive: true, force: true })
})

describe('Zuordnung je Lehrkraft (Server)', () => {
  it('speichert Fächer verschlüsselt, prüft Fächer und Rolle', () => {
    expect(SENSIBEL.fach_obleute).toContain('daten')
    const lk = nutzerAnlegen({ benutzer: 'f.fach', name: 'Fiona Fach', rolle: 'lehrkraft', quelle: 'test' })
    const sus = nutzerAnlegen({ benutzer: 's.schueler', name: 'Sam Schüler', rolle: 'schueler', quelle: 'test' })
    expect(setzeFachobmann(lk.id, ['englisch', 'quatsch', 'franzoesisch'])).toEqual(['englisch', 'franzoesisch'])
    expect(fachobmannFaecher(lk.id)).toEqual(['englisch', 'franzoesisch'])
    expect(alleFachobleute()).toEqual({ [lk.id]: ['englisch', 'franzoesisch'] })
    expect(setzeFachobmann(sus.id, ['englisch'])).toHaveProperty('fehler')
    // Klartext steht nicht in der Datenbank
    // (Alias: Spalten unter ihrem eigenen Namen entschlüsselt der Datenbankzugang beim Lesen)
    const roh = datenbank().prepare('SELECT daten AS x FROM fach_obleute WHERE nutzer_id = ?').get(lk.id) as { x: string }
    expect(roh.x).toMatch(/^v1:/)
    expect(roh.x).not.toContain('englisch')
    // Leere Liste: keine Fachobfrau mehr
    setzeFachobmann(lk.id, [])
    expect(alleFachobleute()).toEqual({})
  })
})

describe('Grammatikformen: Rechte und Überlagerung', () => {
  const eintrag = {
    lehrwerkId: 'green-line-1',
    buch: 'Green Line 1',
    sprache: 'en',
    kapitel: { 'Unit 1': { 'Station 1': [{ text: 'a/an', t: ['en.noun.articles/a-an'] }] } }
  }

  it('Lehrkraft ohne Fach darf nicht, Fachobfrau Englisch darf Englisch, nicht Französisch', () => {
    rolle = 'lehrkraft'
    faecher = []
    expect(() => speichereLehrwerkGrammatik(eintrag)).toThrow(/Fachobleute/)
    faecher = ['englisch']
    expect(speichereLehrwerkGrammatik(eintrag)).toHaveLength(1)
    expect(() => speichereLehrwerkGrammatik({ ...eintrag, lehrwerkId: 'decouvertes-2020-1', buch: 'Découvertes 1', sprache: 'fr' })).toThrow()
    // Sprache umstellen öffnet kein fremdes Fach: gespeichert ist Englisch
    faecher = ['franzoesisch']
    expect(() => speichereLehrwerkGrammatik({ ...eintrag, sprache: 'fr' })).toThrow()
  })

  it('gespeichert = sofort wirksam für alle Nutzer; Verwerfen stellt die eingebaute Liste her', () => {
    expect(Object.keys(LEHRWERK_GRAMMATIK['Green Line 1'])).toEqual(['Unit 1'])
    expect(listeLehrwerkGrammatik()[0]).not.toHaveProperty('von')
    rolle = 'lehrkraft'
    faecher = []
    expect(() => loescheLehrwerkGrammatik('green-line-1')).toThrow()
    rolle = 'admin'
    expect(loescheLehrwerkGrammatik('green-line-1')).toEqual([])
    expect(LEHRWERK_GRAMMATIK['Green Line 1']).toEqual(LEHRWERK_GRAMMATIK_EINGEBAUT['Green Line 1'])
  })
})
