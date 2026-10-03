import { describe, expect, it } from 'vitest'
import { abschrift, abschriftZaehlt, blattText, deckeln } from '../src/shared/abschrift'

const M1 =
  '<p>1914 scheiterte der deutsche Vormarsch an der Marne. Im Westen begann ein Stellungskrieg. Befestigte Linien erschwerten die Bewegung und schnelle Entscheidungen.</p>'

describe('Abschrift erkennen', () => {
  it('wörtlich übernommen: hoher Anteil', () => {
    const b = abschrift('1914 scheiterte der deutsche Vormarsch an der Marne. Im Westen begann ein Stellungskrieg.', blattText(M1))
    expect(b.anteil).toBeGreaterThan(0.9)
    expect(b.laengste).toBeGreaterThanOrEqual(10)
  })
  it('in eigenen Worten: kein Befund', () => {
    const b = abschrift('Nach der Marneschlacht kam der Angriff zum Stehen, danach gruben sich beide Seiten ein und es gab kaum Bewegung.', blattText(M1))
    expect(b.anteil).toBeLessThan(0.2)
  })
  it('Stil und Auszeichnung zählen nicht als Material', () => {
    expect(blattText('<style>.a{color:red}</style><b>Text</b>')).not.toContain('color')
  })
  it('deckelt die Einschätzung', () => {
    expect(deckeln('sicher', { anteil: 0.8, laengste: 30, woerter: 40 })).toBe('noch nicht')
    expect(deckeln('sicher', { anteil: 0.5, laengste: 12, woerter: 40 })).toBe('teilweise')
    expect(deckeln('sicher', { anteil: 0.1, laengste: 5, woerter: 40 })).toBe('sicher')
  })
  it('Zitieraufgaben sind ausgenommen', () => {
    expect(abschriftZaehlt('Zitiere zwei Belege aus M1.')).toBe(false)
    expect(abschriftZaehlt('Fasse M1 zusammen.')).toBe(true)
  })
})
