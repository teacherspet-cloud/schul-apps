import { describe, expect, it } from 'vitest'
import { vollstaendigeElemente } from '../src/renderer/src/shared/teilJson'

/* Live-Vorschau (02.10.2026): aus einer unfertigen Antwort nur die vollständigen Bausteine */
describe('vollstaendigeElemente', () => {
  const ganz = JSON.stringify({ title: 'T', blocks: [{ type: 'text', body: 'a } [ "x"' }, { type: 'task', parts: [{ a: 1 }] }, { type: 'infoBox' }], seiten: [] })

  it('liest alle Elemente einer fertigen Antwort', () => {
    expect(vollstaendigeElemente(ganz, 'blocks')).toHaveLength(3)
  })

  it('liefert bei jedem Zwischenstand nur abgeschlossene Elemente – nie ein halbes', () => {
    let vorher = 0
    for (let n = 0; n <= ganz.length; n++) {
      const e = vollstaendigeElemente(ganz.slice(0, n), 'blocks')
      expect(e.length).toBeGreaterThanOrEqual(vorher)
      vorher = e.length
    }
    expect(vollstaendigeElemente(ganz.slice(0, ganz.indexOf('"task"')), 'blocks')).toEqual([{ type: 'text', body: 'a } [ "x"' }])
  })

  it('findet das Feld nur auf oberster Ebene und nicht im Text', () => {
    const t = JSON.stringify({ note: '"blocks": [1]', inner: { blocks: [{ x: 1 }] }, blocks: [{ y: 2 }] })
    expect(vollstaendigeElemente(t, 'blocks')).toEqual([{ y: 2 }])
    expect(vollstaendigeElemente('{"title":"T"', 'blocks')).toEqual([])
  })
})
