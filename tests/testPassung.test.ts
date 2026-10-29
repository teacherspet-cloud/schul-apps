import { describe, expect, it } from 'vitest'
import { grammatikPassung, vokabelPassung, wortSchluessel } from '../src/renderer/src/shell/testPassung'

// Befund der Lehrkraft (29.10.2026): empfohlen wurden Vokabeltests anderer Bände und Klassen
describe('Passung vorhandener Tests zum Termin', () => {
  const termin = {
    woerter: [{ term: 'weather' }, { term: 'sunny' }],
    freigeschaltet: ['weather', 'sunny', 'cloud', 'to rain', 'the wind'],
    grammatik: ['en.verb.past_progressive/gleichzeitig']
  }
  it('Vokabeltest aus den freigeschalteten Wörtern passt', () => {
    const p = vokabelPassung(['weather', 'sunny', 'cloud', 'rain'], termin)
    expect(p.passt).toBe(true)
    expect(p.grund).toMatch(/100 %/)
  })
  it('Vokabeltest eines anderen Bands passt nicht, auch wenn der Titel „Unit 2" hat', () => {
    expect(vokabelPassung(['castle', 'knight', 'dragon', 'weather'], termin).passt).toBe(false)
  })
  it('zu wenige Wörter passen nicht', () => {
    expect(vokabelPassung(['weather'], termin).passt).toBe(false)
  })
  it('Wortvergleich ohne „to"/Artikel und Satzzeichen', () => {
    expect(wortSchluessel('to rain')).toBe('rain')
    expect(wortSchluessel('The wind!')).toBe('wind')
  })
  it('Grammatiktest passt über das Thema', () => {
    expect(grammatikPassung(['en.verb.past_progressive'], termin).passt).toBe(true)
    expect(grammatikPassung(['en.verb.present_perfect'], termin).passt).toBe(false)
  })
})
