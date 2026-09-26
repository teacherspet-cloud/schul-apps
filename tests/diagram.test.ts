import { mkdirSync, writeFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { datumText, datumZahl, defaultDiagram, parseDatum, sanitizeDiagram, sanitizeTimeline } from '../src/renderer/src/modules/arbeitsblatt/model/diagram'
import { diagramDrawing } from '../src/renderer/src/modules/arbeitsblatt/render/diagramSvg'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { convertAnswer } from '../src/renderer/src/modules/arbeitsblatt/generation/convert'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import type { DiagramSpec } from '../src/renderer/src/modules/arbeitsblatt/model/types'

describe('Zeitangaben der Zeitleiste', () => {
  it('liest Jahr, Monat, Tag und Jahre vor Christus', () => {
    expect(parseDatum('1914-07-28')).toEqual({ year: 1914, month: 7, day: 28 })
    expect(parseDatum('1914-07')).toEqual({ year: 1914, month: 7, day: 1 })
    expect(parseDatum('-500')).toEqual({ year: -500, month: 1, day: 1 })
    expect(parseDatum('Sommer 1914')).toBeNull()
  })
  it('rechnet in die Einheit der Achse um und beschriftet', () => {
    expect(datumZahl('1914', 'year')).toBe(1914)
    expect(datumZahl('1914-07', 'month')).toBe(1914 * 12 + 6)
    expect(datumZahl('1914-07-29', 'day')! - datumZahl('1914-07-28', 'day')!).toBe(1)
    expect(datumText(-500, 'year')).toBe('500 v. Chr.')
    expect(datumText(-66000000, 'year')).toBe('vor 66 Mio. J.')
    expect(datumText(1914 * 12 + 6, 'month')).toBe('Jul 1914')
    expect(datumText(datumZahl('1914-07-28', 'day')!, 'day')).toBe('28.7.')
    expect(datumText(datumZahl('1914-07-28', 'day')!, 'day', true)).toBe('28.7.1914')
  })
})

describe('Bereinigung der Diagramm-Angaben', () => {
  it('liefert bei Unsinn brauchbare Achsen', () => {
    const d = sanitizeDiagram({ kind: 'koordinaten', axes: { xMin: 5, xMax: 5, xStep: 0, yMin: 0, yMax: 1000, yStep: 1 } as never })
    expect(d.axes.xMax).toBeGreaterThan(d.axes.xMin)
    expect(d.axes.xStep).toBeGreaterThan(0)
    expect((d.axes.yMax - d.axes.yMin) / d.axes.yStep).toBeLessThanOrEqual(40)
  })
  it('hält die Zeitleiste in Ordnung: Ende nach Anfang, höchstens 40 Marken, unlesbare Ereignisse weg', () => {
    const t = sanitizeTimeline({ unit: 'day', from: '1914-07-28', to: '1914-08-04', step: 1, events: [{ date: '1914-07-28', text: 'Kriegserklärung an Serbien' }, { date: 'irgendwann', text: 'x' }] })
    expect(t.events).toHaveLength(1)
    const zuViele = sanitizeTimeline({ unit: 'year', from: '1000', to: '2000', step: 1 })
    expect((2000 - 1000) / zuViele.step).toBeLessThanOrEqual(40)
    const verkehrt = sanitizeTimeline({ unit: 'year', from: '1950', to: '1900', step: 10 })
    expect(datumZahl(verkehrt.to, 'year')!).toBeGreaterThan(datumZahl(verkehrt.from, 'year')!)
  })
  it('die leere Antwort „diagram" trägt ein Koordinatensystem; die KI-Antwort wird bereinigt übernommen', () => {
    expect(emptyAnswer('diagram').diagram?.kind).toBe('koordinaten')
    const a = convertAnswer(
      { kind: 'diagram', diagram: { kind: 'zeitleiste', heightMm: 60, timeline: { unit: 'day', from: '1914-07-28', to: '1914-08-04', step: 1, yLevels: ['Drohung', 'Ultimatum', 'Mobilmachung', 'Krieg'], events: [{ date: '1914-08-01', text: 'Mobilmachung', strand: 0, level: -1 }] } } },
      createRng(1)
    )
    expect(a.kind).toBe('diagram')
    expect(a.diagram?.kind).toBe('zeitleiste')
    expect(a.diagram?.timeline.yLevels).toHaveLength(4)
    expect(a.diagram?.timeline.events[0].level).toBeUndefined()
  })
})

describe('Zeichnung der Zeichenflächen', () => {
  const beispiele: { name: string; spec: DiagramSpec }[] = [
    { name: 'Koordinatensystem', spec: { ...defaultDiagram('koordinaten'), axes: { ...defaultDiagram('koordinaten').axes, xLabel: 'Zeit t in s', yLabel: 'Weg s in m', xMin: 0, xMax: 12, xStep: 1, yMin: -2, yMax: 8, yStep: 1 } } },
    { name: 'Millimeterpapier', spec: { ...defaultDiagram('mm'), axes: { ...defaultDiagram('mm').axes, xLabel: 'U in V', yLabel: 'I in mA', xMax: 8, yMax: 6 } } },
    { name: 'Klimadiagramm', spec: defaultDiagram('klima') },
    { name: 'Schrägbild', spec: defaultDiagram('schraegbild') },
    { name: 'Spannungskurve', spec: { ...defaultDiagram('spannung'), xCategories: ['Exposition', 'Steigerung', 'Wendepunkt', 'Verzögerung', 'Katastrophe'], yLevels: ['ruhig', 'angespannt', 'dramatisch', 'explosiv'] } },
    {
      name: 'Zeitleiste Julikrise',
      spec: {
        ...defaultDiagram('zeitleiste'),
        heightMm: 70,
        timeline: {
          unit: 'day',
          from: '1914-07-28',
          to: '1914-08-04',
          step: 1,
          sections: [],
          yLabel: 'Eskalation',
          yLevels: ['Drohung', 'Ultimatum', 'Mobilmachung', 'Kriegserklärung'],
          strands: [],
          events: [
            { date: '1914-07-28', text: 'Ö-U erklärt Serbien den Krieg', level: 3 },
            { date: '1914-07-30', text: 'Russische Mobilmachung', level: 2 },
            { date: '1914-08-01', text: 'Dt. Kriegserklärung an Russland', level: 3 },
            { date: '1914-08-04', text: 'Großbritannien tritt ein', level: 3 }
          ]
        }
      }
    },
    {
      name: 'Zeitleiste Stränge',
      spec: { ...defaultDiagram('zeitleiste'), heightMm: 75, timeline: { unit: 'year', from: '1945', to: '1990', step: 5, sections: [], yLabel: '', yLevels: [], strands: ['BRD', 'DDR', 'Welt'], events: [{ date: '1949', text: 'Gründung', strand: 0 }, { date: '1949', text: 'Gründung', strand: 1 }, { date: '1961', text: 'Mauerbau', strand: 1 }, { date: '1989', text: 'Mauerfall', strand: 1 }] } }
    },
    {
      name: 'Zeitleiste Erdzeitalter',
      spec: { ...defaultDiagram('zeitleiste'), heightMm: 50, timeline: { unit: 'year', from: '-4600000000', to: '0', step: 500000000, sections: [{ from: '-4600000000', to: '-600000000', unit: 'year', step: 1000000000 }, { from: '-600000000', to: '-66000000', unit: 'year', step: 100000000 }, { from: '-66000000', to: '0', unit: 'year', step: 10000000 }], yLabel: '', yLevels: [], strands: [], events: [] } }
    }
  ]

  it('zeichnet alle Arten als gültiges SVG in Millimetern mit Abbildungshinweis', () => {
    const teile: string[] = []
    for (const b of beispiele) {
      const d = diagramDrawing(b.spec, 160)
      expect(d.svg.startsWith('<svg')).toBe(true)
      expect(d.svg).toContain(`viewBox="0 0 ${d.widthMm} ${d.heightMm}"`)
      expect(d.widthMm).toBeLessThanOrEqual(160)
      expect(d.widthMm).toBeGreaterThan(60)
      expect(d.heightMm).toBeGreaterThan(30)
      expect(d.frame.hinweis.length).toBeGreaterThan(20)
      teile.push(`<h3>${b.name}</h3><div style="border:1px dashed #999;display:inline-block">${d.svg}</div><p style="font:11px monospace;max-width:160mm">${d.frame.hinweis}</p>`)
    }
    mkdirSync('test-results', { recursive: true })
    writeFileSync('test-results/diagramme.html', `<!doctype html><meta charset="utf-8"><body style="font-family:Arial;padding:10mm">${teile.join('')}</body>`)
  })

  it('Zeitleiste: Marken, Stufen, Ereignisse und Bruchzeichen stehen im Bild', () => {
    const d = diagramDrawing(beispiele[5].spec, 160)
    expect(d.svg).toContain('28.7.')
    expect(d.svg).toContain('4.8.')
    expect(d.svg).toContain('Ultimatum')
    expect(d.svg).toContain('Mauerbau'.length ? 'Russische Mobilmachung' : '')
    expect(d.frame.hinweis).toContain('Stufen von unten nach oben')
    const erd = diagramDrawing(beispiele[7].spec, 160)
    expect(erd.svg).toContain('vor 4,6 Mrd. J.')
    expect(erd.svg).toContain('heute')
    expect(erd.frame.hinweis).toContain('Abschnitt 3')
  })

  it('Schrägbild: drei Achsen mit Beschriftung', () => {
    const d = diagramDrawing(beispiele[3].spec, 160)
    expect(d.svg).toContain('x₁')
    expect(d.svg).toContain('x₂')
    expect(d.svg).toContain('x₃')
    expect(d.frame.hinweis).toContain('45°')
  })
})
