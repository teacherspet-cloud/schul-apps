import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { besterBand, landZuAusgabe, passtZurGruppe, schulformAuswahl, schulformName, vorwahlImAuswaehler } from '../src/shared/lehrwerkSchulform'
import { bandFuerJahrgang, type VorwahlBuch } from '../src/shared/lehrwerkVorwahl'
import { schulformVon } from '../src/shared/schulformen'
import { darfLehrwerkFach, fachDerSprache, pruefeFaecher, siehtLehrwerkPflege } from '../src/shared/fachobleute'

/* Jahrgang, Landesausgabe und Schulform je Lehrwerk; Vorwahl bei der Materialerstellung (12.10.2026) */

const buch = (id: string, o: Partial<VorwahlBuch> = {}): VorwahlBuch & { id: string } => ({
  id,
  name: id,
  language: 'en',
  units: [],
  ...o
})

describe('Landesausgabe ↔ Land', () => {
  it('erkennt das Bundesland in der Landesausgabe', () => {
    expect(landZuAusgabe('Niedersachsen')).toBe('NI')
    expect(landZuAusgabe('Ausgabe Nordrhein-Westfalen')).toBe('NW')
    expect(landZuAusgabe('NI')).toBe('NI')
    expect(landZuAusgabe('1. oder 2. Fremdsprache')).toBeUndefined()
    expect(landZuAusgabe('')).toBeUndefined()
  })

  it('Schulformen je Land aus shared/schulformen.ts, ohne Land alle (jede Kennung einmal)', () => {
    const ni = schulformAuswahl('NI').map((s) => s.value)
    expect(ni).toContain('gymnasium')
    expect(ni).toContain('oberschule')
    expect(ni).not.toContain('gemeinschaftsschule')
    const alle = schulformAuswahl().map((s) => s.value)
    expect(new Set(alle).size).toBe(alle.length)
    expect(alle).toContain('gemeinschaftsschule')
    expect(schulformName('gymnasium', 'NI')).toBe('Gymnasium')
  })
})

describe('Vorwahl des Lehrwerks', () => {
  const gl = [5, 6, 7].map((g, i) => buch(`green-line-${i + 1}`, { grade: g, stateId: 'NI', schoolTypeId: 'gymnasium' }))
  const real = buch('realschul-band', { grade: 6, stateId: 'NI', schoolTypeId: 'realschule' })
  const bayern = buch('bayern-band', { grade: 6, stateId: 'BY', schoolTypeId: 'gymnasium' })
  const frz = buch('decouvertes-1', { language: 'fr', grade: 6, schoolTypeId: 'gymnasium' })

  it('Jahrgang genau, Land und Schulform ohne Widerspruch', () => {
    const alle = [real, bayern, ...gl, frz]
    expect(besterBand(alle, { language: 'en', grade: 6, stateId: 'NI', schoolTypeId: 'gymnasium' })?.id).toBe('green-line-2')
    expect(besterBand(alle, { language: 'en', grade: 6, stateId: 'NI', schoolTypeId: 'realschule' })?.id).toBe('realschul-band')
    expect(besterBand(alle, { language: 'fr', grade: 6, stateId: 'NI', schoolTypeId: 'gymnasium' })?.id).toBe('decouvertes-1')
    // Ohne Jahrgang: die Reihenfolge der Liste (wie bisher)
    expect(besterBand(alle, { language: 'en', stateId: 'NI', schoolTypeId: 'gymnasium' })?.id).toBe('green-line-1')
  })

  it('Schulformen gleichen Profils passen über Ländergrenzen', () => {
    expect(passtZurGruppe(gl[0], { schoolTypeId: 'gymnasium' })).toBe(true)
    expect(passtZurGruppe(real, { schoolTypeId: 'gymnasium' })).toBe(false)
    expect(passtZurGruppe(gl[1], { grade: 7 })).toBe(true)
    expect(passtZurGruppe(gl[1], { grade: 7 }, 0)).toBe(false)
  })

  it('die zuletzt genutzte Auswahl gilt nur, wenn sie zu Fach, Jahrgang und Schulform passt', () => {
    const alle = [...gl, real, frz]
    const gruppe = { language: 'en', grade: 7, stateId: 'NI', schoolTypeId: 'gymnasium' }
    expect(vorwahlImAuswaehler(alle, gruppe, 'green-line-3')?.id).toBe('green-line-3')
    // Letzte Wahl ein Jahr daneben → der passende Band
    expect(vorwahlImAuswaehler(alle, gruppe, 'green-line-2')?.id).toBe('green-line-3')
    // Letzte Wahl anderes Fach → der passende Band
    expect(vorwahlImAuswaehler(alle, gruppe, 'decouvertes-1')?.id).toBe('green-line-3')
    // Ohne Lerngruppe: wie bisher die letzte Wahl
    expect(vorwahlImAuswaehler(alle, undefined, 'decouvertes-1')?.id).toBe('decouvertes-1')
    // Ohne Fach und Jahrgang wird nichts geraten
    expect(vorwahlImAuswaehler(alle, { stateId: 'NI' }, null)).toBeUndefined()
  })

  it('Sprachenlernen/Grammatik: Band für den Jahrgang ohne Widerspruch zu Land und Schulform', () => {
    const b = (id: string, o: Partial<VorwahlBuch>): VorwahlBuch => ({ id, name: id, language: 'fr', reihe: 'Découvertes', units: [], grade: 7, ...o })
    const liste = [b('by', { stateId: 'BY', schoolTypeId: 'gymnasium' }), b('real', { schoolTypeId: 'realschule' }), b('bund', {})]
    expect(bandFuerJahrgang(liste, 'Découvertes', 'fr', 7, { land: 'NI', schulform: 'gymnasium' })?.id).toBe('bund')
    expect(bandFuerJahrgang(liste, 'Découvertes', 'fr', 7, { land: 'NI', schulform: 'realschule' })?.id).toBe('real')
    expect(bandFuerJahrgang(liste, 'Découvertes', 'fr', 7, { land: 'BY', schulform: 'gymnasium' })?.id).toBe('by')
    // Nur widersprechende Bände: lieber einer als keiner
    expect(bandFuerJahrgang([liste[0]], 'Découvertes', 'fr', 7, { land: 'NI' })?.id).toBe('by')
  })
})

describe('mitgelieferte Lehrwerke: Jahrgang, Land und Schulform', () => {
  const dir = 'resources/lehrwerke'
  const buecher = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map(
      (f) =>
        JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
          id: string
          grade?: number
          stateId?: string
          schoolTypeId?: string
          edition?: string
          band?: string
        }
    )
  it.each(buecher.map((b) => [b.id, b] as const))('%s', (_id, b) => {
    expect(b.grade).toBeGreaterThanOrEqual(5)
    expect(b.grade).toBeLessThanOrEqual(13)
    expect(b.schoolTypeId).toBe('gymnasium')
    // Landesausgabe und Land stimmen überein; Schulform gibt es im Land
    expect(b.stateId).toBe(landZuAusgabe(b.edition))
    if (b.stateId) expect(schulformVon(b.stateId, b.schoolTypeId!)).toBeTruthy()
  })
  it('Bände: Jahrgang = erster Jahrgang der Reihe + Band − 1', () => {
    const jg = (id: string): number | undefined => buecher.find((b) => b.id === id)?.grade
    expect(jg('green-line-1')).toBe(5)
    expect(jg('green-line-6')).toBe(10)
    expect(jg('green-line-transition')).toBe(11)
    expect(jg('apuntate-2024-1')).toBe(6)
    expect(jg('decouvertes-2020-1')).toBe(6)
    expect(jg('decouvertes-serie-jaune-1')).toBe(6)
  })
})

describe('Fachobleute', () => {
  it('Admin darf alles, Fachobfrau/-mann das eigene Fach, sonst niemand', () => {
    expect(fachDerSprache('en')).toBe('englisch')
    expect(darfLehrwerkFach('admin', [], 'fr')).toBe(true)
    expect(darfLehrwerkFach('lehrkraft', ['englisch'], 'en')).toBe(true)
    expect(darfLehrwerkFach('lehrkraft', ['englisch'], 'fr')).toBe(false)
    expect(darfLehrwerkFach('lehrkraft', [], 'en')).toBe(false)
    expect(darfLehrwerkFach('schueler', ['englisch'], 'en')).toBe(false)
    expect(siehtLehrwerkPflege('lehrkraft', ['latein'])).toBe(true)
    expect(siehtLehrwerkPflege('lehrkraft', [])).toBe(false)
    expect(pruefeFaecher(['englisch', 'englisch', 'quatsch', 3, 'franzoesisch'])).toEqual(['englisch', 'franzoesisch'])
  })
})
