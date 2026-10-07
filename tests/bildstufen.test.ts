import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stufenReihe, stufeVon } from '../src/shared/medienbank'

/**
 * Bildstufen der Vokabelbilder (07.10.2026): je Wort ein Bild je Altersstufe. Lernende sehen das ihrer Stufe,
 * sonst das der nächstliegenden; das bisherige Bild gilt als Stufe 5–6; „ohne Bild" gilt nur für die eigene Stufe.
 */

const ordner = mkdtempSync(join(tmpdir(), 'bildstufen-'))
process.env.SCHULAPPS_SERVER = '1'
process.env.SCHULAPPS_DATEN = ordner
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nie-benutzt' } }))
const { bildSetzen, bildLoeschen, medienFuer, ohneBildMerken } = await import('../src/main/services/storage/medienbank')
afterAll(() => rmSync(ordner, { recursive: true, force: true }))

// Kleinstes gültiges PNG (1 × 1)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const bild = (n: string): { dataUrl: string; herkunft: 'ki'; nachweis: string } => ({ dataUrl: PNG, herkunft: 'ki', nachweis: n })

describe('Stufe zur Klasse', () => {
  it('teilt die Klassen in vier Stufen; unbekannt = 5–6', () => {
    expect([1, 4, 5, 6, 7, 10, 11, 13].map(stufeVon)).toEqual(['s1', 's1', 's2', 's2', 's3', 's3', 's4', 's4'])
    expect(stufeVon(undefined)).toBe('s2')
    expect(stufeVon(null)).toBe('s2')
  })
  it('Rückfall: nächstliegende Stufe, bei Gleichstand die ältere', () => {
    expect(stufenReihe('s2')).toEqual(['s2', 's3', 's1', 's4'])
    expect(stufenReihe('s1')).toEqual(['s1', 's2', 's3', 's4'])
    expect(stufenReihe('s4')).toEqual(['s4', 's3', 's2', 's1'])
  })
})

describe('Medienbank mit Bildstufen', () => {
  it('Bestand ist Stufe 5–6 und dient anderen Stufen als Rückfall', () => {
    bildSetzen('en', 'bus', bild('alt'))
    expect(medienFuer('en', ['bus'], { stufe: 's2' }).bus.bild?.nachweis).toBe('alt')
    const s3 = medienFuer('en', ['bus'], { stufe: 's3' }).bus
    expect(s3.bild?.nachweis).toBe('alt')
    expect(s3.bildStufe).toBe('s2')
    expect(s3.bildStufenDa).toEqual(['s2'])
  })
  it('eigenes Bild je Stufe; die anderen bleiben unberührt', () => {
    bildSetzen('en', 'bus', bild('jugend'), 's3')
    expect(medienFuer('en', ['bus'], { stufe: 's3' }).bus.bild?.nachweis).toBe('jugend')
    expect(medienFuer('en', ['bus'], { stufe: 's4' }).bus.bild?.nachweis).toBe('jugend')
    expect(medienFuer('en', ['bus'], { stufe: 's2' }).bus.bild?.nachweis).toBe('alt')
    expect(medienFuer('en', ['bus'], { stufe: 's1' }).bus.bild?.nachweis).toBe('alt')
    expect(medienFuer('en', ['bus']).bus.bildStufenDa).toEqual(['s2', 's3'])
    // Lernende (mit Fassung) bekommen dieselbe Auflösung
    expect(medienFuer('en', ['bus'], { stufe: 's4', lage: 'w' }).bus.bild?.nachweis).toBe('jugend')
  })
  it('Löschen trifft nur die genannte Stufe', () => {
    bildLoeschen('en', 'bus', 's3')
    expect(medienFuer('en', ['bus'], { stufe: 's3' }).bus.bild?.nachweis).toBe('alt')
    expect(medienFuer('en', ['bus']).bus.bildStufenDa).toEqual(['s2'])
  })
  it('„ohne Bild" gilt nur für die eigene Stufe und endet mit einem Bild', () => {
    bildSetzen('en', 'hope', bild('szene'), 's3')
    ohneBildMerken('en', 'hope', 's1')
    expect(medienFuer('en', ['hope'], { stufe: 's1' }).hope.bild).toBeUndefined()
    expect(medienFuer('en', ['hope'], { stufe: 's2' }).hope.bild?.nachweis).toBe('szene')
    expect(medienFuer('en', ['hope']).hope.ohneBild).toEqual(['s1'])
    bildSetzen('en', 'hope', bild('doch'), 's1')
    expect(medienFuer('en', ['hope'], { stufe: 's1' }).hope.bild?.nachweis).toBe('doch')
    expect(medienFuer('en', ['hope']).hope.ohneBild).toBeUndefined()
  })
  it('ein nur als „ohne Bild" gemerktes Wort bleibt erhalten', () => {
    ohneBildMerken('en', 'although', 's2')
    expect(medienFuer('en', ['although']).although?.ohneBild).toEqual(['s2'])
  })
})
