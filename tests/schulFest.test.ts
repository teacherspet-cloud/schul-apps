import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type AppSettings } from '../src/shared/types'
import type { SchulEinrichtung } from '../src/shared/schulEinrichtung'
import { mitFesterSchule, ohneSchulangaben, schuleFest } from '../src/shared/schulFest'

/*
 * Feste Schule für IServ-Lehrkräfte (09.10.2026): keine eigene Schulwahl; Schulname, Bundesland, Schulform und Anschrift
 * immer aus der Schul-Einrichtung der Verwaltung. Name, Funktion und Unterschrift bleiben persönlich.
 * Lokale Konten, Testkonten und die Exe behalten die Wahl.
 */
const ORDNER = mkdtempSync(join(tmpdir(), 'schulapps-schulfest-'))
vi.mock('electron', () => ({ app: { getPath: () => ORDNER } }))
const einstellungen = await import('../src/main/services/storage/settings')
afterAll(() => rmSync(ORDNER, { recursive: true, force: true }))

const SCHULE: SchulEinrichtung = {
  name: 'Lessing-Gymnasium',
  stateId: 'HB',
  schulformen: ['gymnasium', 'oberschule'],
  strasse: 'Schulstraße 1',
  plz: '27568',
  ort: 'Bremerhaven',
  telefon: '0471 123456',
  email: 'sekretariat@lessing.de'
}
const neu = (patch: Partial<AppSettings> = {}): AppSettings => ({ ...structuredClone(DEFAULT_SETTINGS), ...patch })

describe('Wer hat die Schule fest?', () => {
  it('nur IServ-Konten von Lehrkräften und Admins', () => {
    expect(schuleFest({ quelle: 'iserv', rolle: 'lehrkraft' })).toBe(true)
    expect(schuleFest({ quelle: 'iserv', rolle: 'admin' })).toBe(true)
    expect(schuleFest({ quelle: 'iserv', rolle: 'schueler' })).toBe(false)
    expect(schuleFest({ quelle: 'lokal', rolle: 'lehrkraft' })).toBe(false)
    expect(schuleFest({ quelle: 'test', rolle: 'lehrkraft' })).toBe(false)
    expect(schuleFest(null)).toBe(false)
  })
})

describe('Angaben der Schule gelten, persönliche bleiben', () => {
  const eigene = neu({
    schoolName: 'Alte Schule',
    defaults: { ...DEFAULT_SETTINGS.defaults, stateId: 'BY', schoolTypeId: 'realschule' },
    briefkopf: { lehrkraft: 'Frau Müller', funktion: 'Klassenleitung 6b', strasse: 'Alte Str. 9', ort: 'München', signieren: true }
  })
  it('überschreibt Schule und Anschrift, nicht Name/Funktion', () => {
    const s = mitFesterSchule(eigene, SCHULE)
    expect(s.schoolName).toBe('Lessing-Gymnasium')
    expect(s.defaults).toMatchObject({ stateId: 'HB', schoolTypeId: 'gymnasium' })
    expect(s.briefkopf).toMatchObject({ lehrkraft: 'Frau Müller', funktion: 'Klassenleitung 6b', signieren: true, strasse: 'Schulstraße 1', ort: 'Bremerhaven', plz: '27568' })
  })
  it('eine Schulform der Schule bleibt wählbar', () => {
    const s = mitFesterSchule(neu({ defaults: { ...DEFAULT_SETTINGS.defaults, schoolTypeId: 'oberschule' } }), SCHULE)
    expect(s.defaults.schoolTypeId).toBe('oberschule')
  })
  it('ohne eingerichtete Schule unverändert', () => {
    expect(mitFesterSchule(eigene, null)).toBe(eigene)
  })
  it('Änderungen an Schulangaben werden verworfen', () => {
    const p = ohneSchulangaben(
      { schoolName: 'X', defaults: { stateId: 'BY', schoolTypeId: 'realschule', abiturNach: 'G9' }, briefkopf: { lehrkraft: 'Herr A', ort: 'Y' }, showSchool: false },
      SCHULE
    )
    expect(p).toEqual({ defaults: { abiturNach: 'G9' }, briefkopf: { lehrkraft: 'Herr A' }, showSchool: false })
    expect(ohneSchulangaben({ defaults: { schoolTypeId: 'oberschule' } }, SCHULE)).toEqual({ defaults: { schoolTypeId: 'oberschule' } })
  })
})

describe('Einstellungen am Server', () => {
  afterEach(() => {
    einstellungen.setzeSchuleFest(null)
    einstellungen.setzeSchulRueckfall(null)
  })
  it('IServ-Konto: Schule aus der Verwaltung, eigene Schulangaben greifen nicht', () => {
    einstellungen.setzeSchulRueckfall(() => SCHULE)
    einstellungen.setzeSchuleFest(() => true)
    const s = einstellungen.setSettings({ schoolName: 'Eigene Schule', defaults: { stateId: 'BY' }, briefkopf: { lehrkraft: 'Frau B', strasse: 'Eigene Str. 1' } })
    expect(s.schoolName).toBe('Lessing-Gymnasium')
    expect(s.defaults.stateId).toBe('HB')
    expect(s.briefkopf).toMatchObject({ lehrkraft: 'Frau B', strasse: 'Schulstraße 1' })
  })
  it('lokales Konto bzw. Exe: eigene Wahl bleibt', () => {
    einstellungen.setzeSchulRueckfall(() => SCHULE)
    einstellungen.setzeSchuleFest(() => false)
    const s = einstellungen.setSettings({ schoolName: 'Eigene Schule', defaults: { stateId: 'BY' } })
    expect(s.schoolName).toBe('Eigene Schule')
    expect(s.defaults.stateId).toBe('BY')
  })
})
