import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/*
 * Testkonten (29.10.2026, Wunsch der Lehrkraft: „Max Mustermann" und „Torge K." in der Schülerliste der 5b – als
 * Testkonten ausblenden): wie die Vorschaukonten nicht in Listen und Auswertungen, das Konto selbst bleibt bestehen.
 */
const ordner = mkdtempSync(join(tmpdir(), 'testkonten-'))
vi.mock('electron', () => ({ app: { getPath: () => join(ordner, 'nutzer') } }))

const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
const { alleNutzer, datenbankFuerTests, nutzerAnlegen, nutzerNachId, testkontoSetzen, vorschauIds, zaehltMit } = await import('../src/server/datenbank')

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
})
afterAll(() => rmSync(ordner, { recursive: true, force: true }))

describe('Testkonten', () => {
  it('ausgeblendet aus alleNutzer und Auswertungen, wieder zählbar nach Aufheben', () => {
    const max = nutzerAnlegen({ benutzer: 'max.mustermann', name: 'Max Mustermann', rolle: 'schueler', quelle: 'test', gruppen: [{ id: 'klasse:5b', name: '5b' }] })
    const anna = nutzerAnlegen({ benutzer: 'anna.k', name: 'Anna K.', rolle: 'schueler', quelle: 'test', gruppen: [{ id: 'klasse:5b', name: '5b' }] })
    expect(alleNutzer().map((n) => n.id)).toContain(max.id)
    testkontoSetzen(max.id, true)
    expect(alleNutzer().map((n) => n.id)).not.toContain(max.id)
    expect(alleNutzer().map((n) => n.id)).toContain(anna.id)
    expect(alleNutzer(true).map((n) => n.id)).toContain(max.id)
    expect(vorschauIds().has(max.id)).toBe(true)
    expect(zaehltMit(nutzerNachId(max.id)!)).toBe(false)
    expect(zaehltMit(nutzerNachId(anna.id)!)).toBe(true)
    testkontoSetzen(max.id, false)
    expect(alleNutzer().map((n) => n.id)).toContain(max.id)
  })
})
