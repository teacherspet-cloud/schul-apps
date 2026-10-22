/**
 * Bildlizenzen (22.10.2026, Prüfung des Schulträgers, Punkt 12 – shared/bildLizenz.ts): keine NC-/ND-Bilder für
 * Schulmaterial, Nachweis für Lernende („KI-generiert“ bzw. Urheber · Lizenz).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { istKiBild, lernendenNachweis, lizenzErlaubt, lizenzSperrgrund, nurZulaessige } from '../src/shared/bildLizenz'

describe('Lizenzfilter', () => {
  it('sperrt NC und ND in allen Schreibweisen', () => {
    for (const l of ['BY-NC-SA 2.0', 'BY-NC 2.0', 'CC BY-ND 4.0', 'cc by-nc-nd 3.0', 'Attribution-NonCommercial 4.0', 'NoDerivatives', 'BY NC', 'nicht kommerziell'])
      expect(lizenzErlaubt(l), l).toBe(false)
  })
  it('lässt freie Lizenzen und unbekannte Angaben durch', () => {
    for (const l of ['BY 2.0', 'BY-SA 4.0', 'CC0 1.0', 'PDM 1.0', 'Public domain', 'Pixabay-Inhaltslizenz', 'siehe Dateiseite', '', undefined, 'CC BY-SA 3.0 de', 'Standard'])
      expect(lizenzErlaubt(l), String(l)).toBe(true)
  })
  it('nennt den Grund und filtert Listen', () => {
    expect(lizenzSperrgrund('BY-NC-ND 2.0')).toBe('Lizenz nicht kommerziell (NC) und keine Bearbeitung (ND) – für Schulmaterial nicht zulässig')
    expect(lizenzSperrgrund('BY 2.0')).toBeNull()
    const treffer = [{ l: 'BY 2.0' }, { l: 'BY-NC 2.0' }, { l: 'CC0' }]
    expect(nurZulaessige(treffer, (t) => t.l).map((t) => t.l)).toEqual(['BY 2.0', 'CC0'])
  })
  it('Wikimedia-/Openverse-Suche filtert im Hauptprozess (images.ts)', () => {
    const quelle = readFileSync(join(__dirname, '..', 'src', 'main', 'services', 'images', 'images.ts'), 'utf8')
    expect(quelle).toContain('nurZulaessige(await searchWikimedia(query)')
    expect(quelle).toContain('license_type=commercial,modification')
  })
})

describe('Nachweis für Lernende', () => {
  it('KI-Bilder heißen „KI-generiert“', () => {
    expect(istKiBild({ herkunft: 'ki' })).toBe(true)
    expect(istKiBild({ nachweis: 'KI-generiert' })).toBe(true)
    expect(lernendenNachweis({ herkunft: 'ki', nachweis: 'KI-generiert' })).toBe('KI-generiert')
  })
  it('Bilder aus der Suche mit Urheber und Lizenz', () => {
    expect(lernendenNachweis({ herkunft: 'suche', nachweis: 'Hund · Max Muster · BY 2.0 · openverse' })).toBe('Bild: Hund · Max Muster · BY 2.0 · openverse')
    expect(lernendenNachweis({ herkunft: 'wikimedia', urheber: 'Erika', lizenz: 'CC BY-SA 4.0' })).toBe('Bild: Erika · CC BY-SA 4.0')
  })
  it('eigene Bilder und OpenMoji ohne Zeile', () => {
    expect(lernendenNachweis({ herkunft: 'own', nachweis: 'foto.jpg' })).toBeNull()
    expect(lernendenNachweis({})).toBeNull()
  })
})
