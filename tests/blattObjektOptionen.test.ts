import { describe, expect, it } from 'vitest'
import { jahrBeschriftungen, linieSvg, objekteAus, objekteSvg } from '../src/shared/blattObjekte'
import { aufSkala } from '../src/renderer/src/modules/onlinetest/blattWerkzeuge'

/* Optionsmenü, Jahr an der Linie, jahresgenaues Einrasten (06.10.2026) */
describe('Zeitleiste: jahresgenau einrasten', () => {
  const skala = { art: 'skala' as const, x1: 100, y1: 200, x2: 300, y2: 200, a: 470, b: 480, einheit: 'year' as const, mitJahr: false }
  it('eng liegende Jahre (475/476) werden einzeln getroffen', () => {
    expect(aufSkala({ x: 200, y: 205 }, skala)?.wert).toBe('475')
    expect(aufSkala({ x: 211, y: 205 }, skala)?.wert).toBe('476')
    expect(aufSkala({ x: 211, y: 205 }, skala)?.x).toBe(220)
  })
  it('weit neben der Achse: kein Einrasten', () => {
    expect(aufSkala({ x: 200, y: 240 }, skala)).toBeNull()
  })
})

describe('Objekt-Optionen', () => {
  it('bereinigt und behält nur gültige Optionen', () => {
    const [k, l] = objekteAus([
      {
        id: 'k',
        s: 0,
        t: 'text',
        x: 1,
        y: 2,
        w: 100,
        text: 'Hallo',
        rand: '#dc2626',
        fuellung: '#fef9c3',
        textFarbe: '#111827',
        linienArt: 'strich',
        staerke: 3,
        fett: true,
        groesse: 'gross',
        pfeil: 'ende'
      },
      { id: 'l', s: 0, t: 'linie', x: 0, y: 0, x2: 100, y2: 0, pfeil: 'beide', jahr2: '1914', linienArt: 'punkt', fuellung: '#ffffff', farbe: 'rot' }
    ])
    expect(k).toMatchObject({ rand: '#dc2626', fuellung: '#fef9c3', textFarbe: '#111827', linienArt: 'strich', staerke: 3, fett: true, groesse: 'gross' })
    expect(k.pfeil).toBeUndefined()
    expect(l).toMatchObject({ pfeil: 'beide', jahr2: '1914', linienArt: 'punkt' })
    expect(l.fuellung).toBeUndefined()
    expect(l.farbe).toBeUndefined()
  })
  it('Jahreszahl entlang der Linie, nie kopfüber', () => {
    const [j] = jahrBeschriftungen({ id: 'l', s: 0, t: 'linie', x: 100, y: 0, x2: 0, y2: 0, jahr1: '1914' })
    expect(j.text).toBe('1914')
    expect(Math.abs(j.winkel)).toBeLessThanOrEqual(90)
    expect(jahrBeschriftungen({ id: 'l', s: 0, t: 'linie', x: 100, y: 0, x2: 0, y2: 0, jahr1: '1914', ohneJahr: true })).toEqual([])
  })
  it('Druck: Pfeilspitzen, Strichmuster, Kastenfarben', () => {
    const svg = linieSvg({ id: 'l', s: 0, t: 'linie', x: 0, y: 0, x2: 100, y2: 0, pfeil: 'beide', linienArt: 'strich' })
    expect(svg.match(/<polygon/g)).toHaveLength(2)
    expect(svg).toContain('stroke-dasharray')
    const k = objekteSvg(
      [{ id: 'k', s: 0, t: 'text', x: 0, y: 0, w: 100, text: 'A', fuellung: '#fef9c3', rand: '#dc2626', textFarbe: '#111827', fett: true }],
      794,
      1123
    )
    expect(k).toContain('fill="#fef9c3"')
    expect(k).toContain('stroke="#dc2626"')
    expect(k).toContain('font-weight="700"')
  })
})
