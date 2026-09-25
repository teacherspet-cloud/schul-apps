import { describe, expect, it } from 'vitest'
import { sanitizeSvg } from '../src/main/services/ai/svg'

describe('Zeichnungen von Claude (SVG)', () => {
  it('schneidet die Zeichnung aus der Antwort und ergänzt den Namensraum', () => {
    const svg = sanitizeSvg('Hier ist das Bild:\n<svg viewBox="0 0 512 512"><circle cx="256" cy="256" r="100"/></svg>\nViel Spaß!')
    expect(svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="100"/></svg>')
  })

  it('entfernt Skripte, Ereignisse und externe Verweise, behält interne Verweise', () => {
    const svg = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onclick="x()" fill="url(https://böse.de/a)" width="1"/>' +
        '<image href="https://böse.de/b.png"/><use href="#form"/><a href="https://böse.de">x</a><foreignObject><div/></foreignObject></svg>'
    )
    expect(svg).not.toMatch(/script|onclick|böse|foreignObject|<image/)
    expect(svg).toContain('fill="none"')
    expect(svg).toContain('href="#form"')
  })

  it('meldet eine fehlende Zeichnung verständlich', () => {
    expect(() => sanitizeSvg('Ich kann leider nicht zeichnen.')).toThrow(/keine gültige Zeichnung/)
  })
})
