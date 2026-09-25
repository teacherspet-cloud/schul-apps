import { describe, expect, it } from 'vitest'
import { texToSvg } from '../src/renderer/src/shared/richtext/math'
import { parseRichText, plainText } from '../src/renderer/src/shared/richtext/parse'

describe('Textformat mit Formeln', () => {
  it('erkennt fett, kursiv, Formeln und Listen', () => {
    const blocks = parseRichText(
      'Die **Fläche** ist $A = \\frac{g \\cdot h}{2}$ (*Dreieck*).\n\n- erstens\n- zweitens $x^2$\n1. eins\n$$\\ce{2H2 + O2 -> 2H2O}$$'
    )
    expect(blocks.map((b) => b.t)).toEqual(['para', 'list', 'list', 'math'])
    const para = blocks[0]
    expect(para.t === 'para' && para.inlines).toEqual([
      { t: 'text', text: 'Die ' },
      { t: 'text', text: 'Fläche', bold: true },
      { t: 'text', text: ' ist ' },
      { t: 'math', tex: 'A = \\frac{g \\cdot h}{2}' },
      { t: 'text', text: ' (' },
      { t: 'text', text: 'Dreieck', italic: true },
      { t: 'text', text: ').' }
    ])
    expect(blocks[1].t === 'list' && blocks[1].ordered).toBe(false)
    expect(blocks[2].t === 'list' && blocks[2].ordered).toBe(true)
    expect(blocks[3]).toEqual({ t: 'math', tex: '\\ce{2H2 + O2 -> 2H2O}' })
  })

  it('Sternchen in Formeln sind keine Formatierung, \\$ bleibt ein Dollarzeichen', () => {
    const blocks = parseRichText('Preis: 5 \\$ und $a*b*c$')
    expect(blocks[0].t === 'para' && blocks[0].inlines).toEqual([
      { t: 'text', text: 'Preis: 5 $ und ' },
      { t: 'math', tex: 'a*b*c' }
    ])
    expect(plainText('**a** $x$')).toBe('a x')
  })

  it('setzt Mathe- und Chemieformeln als SVG, auch fehlerhafte ohne Absturz', () => {
    const frac = texToSvg('\\frac{a}{b} + x^2')
    expect(frac.svg.startsWith('<svg')).toBe(true)
    expect(frac.widthEx).toBeGreaterThan(1)
    expect(texToSvg('\\ce{2H2 + O2 -> 2H2O}', true).svg).toContain('<svg')
    expect(texToSvg('\\frac{a}{').svg).toContain('<svg')
    expect(texToSvg('a\fb').svg).toContain('<svg')
  })
})

describe('Nummerierte Überschriften', () => {
  it('behält die Startnummer („3. Umkehren“ bleibt 3.)', () => {
    const blocks = parseRichText('3. Umkehren: Ist das Dreieck rechtwinklig?')
    expect(blocks[0]).toMatchObject({ t: 'list', ordered: true, start: 3 })
  })
})
