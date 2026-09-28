import { describe, expect, it } from 'vitest'
import { rasterAlsTabelle, rasterAnfrage, rasterAus } from '../src/renderer/src/shared/bewertung/raster'
import { rasterAufteilung } from '../src/renderer/src/modules/arbeitsblatt/auftraege'

/*
 * Bewertungsraster (Großprogramm 0.4, F2): Kriterien × Leistungsstufen, Punkte genau auf die
 * Aufgabe verteilt, als Tabelle im Lösungsteil.
 */
const antwort = {
  stufen: [
    { name: 'voll erfüllt', punkte: 100 },
    { name: 'teilweise erfüllt', punkte: 50 },
    { name: 'nicht erfüllt', punkte: 0 }
  ],
  kriterien: [
    { name: 'Inhaltspunkte', bereich: 'inhalt', beschreibungen: ['alle drei Punkte', 'zwei Punkte', 'höchstens einer'], punkte: 7 },
    { name: 'Aufbau', bereich: 'darstellung', beschreibungen: ['klar gegliedert', 'erkennbar', 'ungeordnet'], punkte: 3 },
    { name: '', bereich: 'inhalt', beschreibungen: [], punkte: 5 },
    { name: 'Sprache', bereich: 'darstellung', beschreibungen: ['treffend'], punkte: 3 }
  ]
}

describe('Bewertungsraster', () => {
  it('Punkte genau auf die Aufgabe, leere Kriterien weg, Beschreibungen passend zur Stufenzahl', () => {
    const r = rasterAus(antwort, 'Raster', 20)
    expect(r.kriterien.map((k) => k.name)).toEqual(['Inhaltspunkte', 'Aufbau', 'Sprache'])
    expect(r.kriterien.reduce((n, k) => n + (k.punkte ?? 0), 0)).toBe(20)
    expect(r.kriterien[2].beschreibungen).toEqual(['treffend', '', ''])
    expect(() => rasterAus({ stufen: [{ name: 'x' }], kriterien: [] }, 'R', 0)).toThrow()
  })

  it('ohne Punkte: keine Punktangaben', () => {
    const r = rasterAus(antwort, 'Raster', 0)
    expect(r.kriterien.every((k) => k.punkte === undefined)).toBe(true)
    const t = rasterAlsTabelle(r)
    expect(t.rows.flat().join(' ')).not.toMatch(/P\.\)/)
  })

  it('als Tabelle: Kopf mit den Stufen, Bereich vor dem Kriterium, Punkte je Stufe', () => {
    const t = rasterAlsTabelle(rasterAus(antwort, 'Bewertungsraster zu Aufgabe 2', 10))
    expect(t.title).toBe('Bewertungsraster zu Aufgabe 2')
    expect(t.headers).toEqual(['Kriterium', 'voll erfüllt', 'teilweise erfüllt', 'nicht erfüllt'])
    expect(t.rows[0][0]).toMatch(/^Inhalt: \*\*Inhaltspunkte\*\* \(\d+ P\.\)$/)
    expect(t.rows[0][1]).toMatch(/alle drei Punkte \(\d+ P\.\)/)
  })

  it('die Anfrage verlangt Summe und Aufteilung; Aufteilung nur bei Schreibaufgaben in Sprachen und Deutsch', () => {
    const a = rasterAnfrage({ system: 'S', aufgabe: 'Schreibe einen Brief', punkte: 30, aufteilung: { inhalt: 70, zweiter: 'Darstellung' } })
    expect(a.schemaName).toBe('bewertungsraster')
    expect(a.user).toMatch(/GENAU 30/)
    expect(a.user).toMatch(/„inhalt" zusammen 70 %.*„darstellung" zusammen 30 %/)
    expect(rasterAufteilung('deutsch', true)).toEqual({ inhalt: 70, zweiter: 'Darstellung' })
    expect(rasterAufteilung('englisch', true)).toEqual({ inhalt: 40, zweiter: 'Sprache' })
    expect(rasterAufteilung('geschichte', true)).toBeUndefined()
    expect(rasterAufteilung('englisch', false)).toBeUndefined()
  })
})
