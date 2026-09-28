import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { pruefeLehrplan } from '../src/shared/lehrplan'
import { lehrplanVorschlaege } from '../src/renderer/src/shared/lehrplanVorschlaege'
import { suggestAll } from '../src/renderer/src/shared/components/optionsFilter'

/*
 * Themenvorschläge der Klassenarbeit aus dem Lehrplan für jedes Fach (Großprogramm 0.4): gefiltert
 * nach Schulform und Jahrgang, gruppiert nach Oberthema, jeder Eintrag nur einmal.
 */
const lade = (land: string) => pruefeLehrplan(JSON.parse(readFileSync(resolve(__dirname, `../resources/lehrplaene/${land}.json`), 'utf8')), land)!

describe('Themenvorschläge aus dem Lehrplan', () => {
  it('Bayern, Gymnasium, Geschichte Klasse 8: die Lernbereiche der Jahrgangsstufe', () => {
    const g = lehrplanVorschlaege(lade('BY'), 'geschichte', 'gymnasium', 'BY', 8)
    const alle = g.flatMap((x) => [x.group, ...x.items])
    expect(alle.some((t) => /Industrialisierung/.test(t))).toBe(true)
    // Klasse 5 (Antike) gehört nicht dazu
    const g5 = lehrplanVorschlaege(lade('BY'), 'geschichte', 'gymnasium', 'BY', 5).flatMap((x) => x.items)
    expect(g5.some((t) => /Industrialisierung/.test(t))).toBe(false)
  })

  it('für jedes Fach der Klassenarbeit in NRW Vorschläge, ohne doppelte Einträge', () => {
    for (const fach of ['englisch', 'franzoesisch', 'deutsch', 'geschichte', 'politik', 'erdkunde']) {
      const g = lehrplanVorschlaege(lade('NW'), fach, 'gymnasium', 'NW', 9)
      expect(g.length, fach).toBeGreaterThan(0)
      const items = g.flatMap((x) => x.items)
      expect(new Set(items).size, fach).toBe(items.length)
    }
  })

  it('ohne Lehrplandatei gelten die mitgebrachten Themen des Landes', () => {
    const g = lehrplanVorschlaege(null, 'geschichte', 'gymnasium', 'NI', 8)
    expect(g.flatMap((x) => x.items).length).toBeGreaterThan(0)
  })

  it('der Filter durchsucht auch gruppierte Listen', () => {
    const daten = [
      { group: 'Industrialisierung', items: [{ value: 'Soziale Frage', label: 'Soziale Frage' }] },
      { group: 'Antike', items: [{ value: 'Rom', label: 'Rom' }] }
    ]
    const f = (search: string) => suggestAll({ options: daten, search, limit: 40 } as never) as typeof daten
    expect(f('')).toHaveLength(2)
    expect(f('ro').map((g) => g.group)).toEqual(['Antike'])
    // Steht ein Vorschlag schon genau im Feld, bleibt die ganze Liste zum Durchsehen
    expect(f('Rom')).toHaveLength(2)
    expect(f('Industrial').map((g) => g.group)).toEqual(['Industrialisierung'])
  })
})
