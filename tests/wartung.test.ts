import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/*
 * Sichern, Zurücksetzen, Wiederherstellen – gegen einen Wegwerf-Ordner statt gegen das echte
 * Benutzerprofil. Wunsch der Lehrkraft (25.09.2026): das Wiederherstellen nachholen; und
 * ausdrücklich: „die vokabellisten und lehrwerke sollen auch bei zurücksetzen unbedingt
 * erhalten bleiben!"
 */
let wurzel = ''
vi.mock('electron', () => ({ app: { getPath: () => wurzel } }))

const { pruefeSicherung, sicherung, werkszustand, wiederherstellen } = await import('../src/main/services/storage/wartung')

const schreibe = (pfad: string, inhalt: string): void => {
  mkdirSync(join(wurzel, pfad, '..'), { recursive: true })
  writeFileSync(join(wurzel, pfad), inhalt)
}

beforeEach(() => {
  wurzel = mkdtempSync(join(tmpdir(), 'schulapps-wartung-'))
  schreibe('arbeitsblaetter/a1.json', '{"titel":"Weimar"}')
  schreibe('klassenarbeiten/k1.json', '{"titel":"KA 1"}')
  schreibe('settings.json', '{"schoolName":"Testschule"}')
  schreibe('secrets.json', 'GEHEIM')
  schreibe('lehrwerke/green-line.json', '{"units":[]}')
})
afterEach(() => rmSync(wurzel, { recursive: true, force: true }))

describe('Sicherung wiederherstellen', () => {
  it('bringt nach dem Zurücksetzen alles zurück – ohne die Zugänge', () => {
    const { daten } = sicherung()
    werkszustand()
    expect(existsSync(join(wurzel, 'arbeitsblaetter/a1.json'))).toBe(false)
    expect(existsSync(join(wurzel, 'secrets.json'))).toBe(false)

    const vorschau = pruefeSicherung(daten)
    expect(vorschau.ordner).toEqual([
      { ordner: 'arbeitsblaetter', eintraege: 1 },
      { ordner: 'klassenarbeiten', eintraege: 1 }
    ])
    expect(vorschau.dateien).toEqual(['settings.json'])

    wiederherstellen(daten)
    expect(readFileSync(join(wurzel, 'arbeitsblaetter/a1.json'), 'utf8')).toBe('{"titel":"Weimar"}')
    expect(readFileSync(join(wurzel, 'settings.json'), 'utf8')).toContain('Testschule')
    // Der KI-Schlüssel stand nie in der Sicherung
    expect(existsSync(join(wurzel, 'secrets.json'))).toBe(false)
  })

  it('lässt die Lehrwerke in jedem Schritt unberührt', () => {
    const { daten } = sicherung()
    expect(new TextDecoder().decode(daten)).not.toContain('green-line')
    werkszustand()
    wiederherstellen(daten)
    expect(readFileSync(join(wurzel, 'lehrwerke/green-line.json'), 'utf8')).toBe('{"units":[]}')
  })

  it('führt zusammen: Vorhandenes bleibt, Gleichnamiges wird ersetzt', () => {
    const { daten } = sicherung()
    schreibe('arbeitsblaetter/neu.json', '{"titel":"Neu"}')
    schreibe('arbeitsblaetter/a1.json', '{"titel":"geändert"}')
    wiederherstellen(daten)
    expect(existsSync(join(wurzel, 'arbeitsblaetter/neu.json'))).toBe(true)
    expect(readFileSync(join(wurzel, 'arbeitsblaetter/a1.json'), 'utf8')).toBe('{"titel":"Weimar"}')
  })

  it('weist fremde Dateien ab, bevor etwas geschrieben wird', () => {
    expect(() => pruefeSicherung(new TextEncoder().encode('kein json'))).toThrow(/keine Sicherung/)
    expect(() => wiederherstellen(new TextEncoder().encode('{"version":7}'))).toThrow(/unbekannten Version/)
  })

  it('schreibt nie außerhalb der Materialordner', () => {
    const boese = { version: 1, arbeitsblaetter: { '../settings.json': Buffer.from('überschrieben').toString('base64') }, 'secrets.json': 'eA==' }
    wiederherstellen(new TextEncoder().encode(JSON.stringify(boese)))
    expect(readFileSync(join(wurzel, 'settings.json'), 'utf8')).toContain('Testschule')
    expect(readFileSync(join(wurzel, 'secrets.json'), 'utf8')).toBe('GEHEIM')
  })
})
