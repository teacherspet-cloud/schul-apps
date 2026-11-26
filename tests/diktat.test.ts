import { describe, expect, it } from 'vitest'
import { notenvorschlag, werteDiktatAus } from '../src/shared/diktat'

const SOLL = 'Der Hund läuft schnell über die Straße. Ich glaube, dass er nach Hause will.'

describe('Diktat – Fehlerzählung ISB-nah (26.11.2026)', () => {
  it('fehlerfrei', () => {
    const a = werteDiktatAus(SOLL, SOLL)
    expect(a.fehler).toBe(0)
    expect(a.prozentRichtig).toBe(100)
    expect(a.notenvorschlag).toBe(1)
  })
  it('ein Fehler je Wort, Groß/klein voll, fehlender Punkt halb, Komma nicht angesagt', () => {
    const a = werteDiktatAus(SOLL, 'Der hund leuft schnell über die Strasse Ich glaube dass er nach Hause will.')
    const arten = a.stellen.filter((s) => s.fehler > 0).map((s) => `${s.art}:${s.soll}`)
    expect(arten).toEqual(['grossklein:Hund', 'schreibung:läuft', 'schreibung:Straße', 'zeichen:.'])
    expect(a.fehler).toBe(3.5)
  })
  it('fehlende und überzählige Wörter, Getrennt-/Zusammenschreibung', () => {
    const a = werteDiktatAus(SOLL, 'Der Hund läuft über die Straße. Ich glaube, dass er nachhause will gerne.')
    const arten = a.stellen.filter((s) => s.fehler > 0).map((s) => s.art)
    expect(arten).toEqual(['fehlt', 'getrenntzusammen', 'zuviel'])
  })
  it('Wiederholungsfehler einmal – außer das/dass', () => {
    const soll = 'Das Rad ist neu. Das Rad ist rot. Ich weiß, dass es schön ist, dass du kommst.'
    const a = werteDiktatAus(soll, 'Das Radd ist neu. Das Radd ist rot. Ich weiß, das es schön ist, das du kommst.')
    expect(a.stellen.filter((s) => s.wiederholung).map((s) => s.soll)).toEqual(['Rad'])
    expect(a.fehler).toBe(3)
  })
  it('Zählarten streng und nur Wörter', () => {
    const ist = 'Der Hund läuft schnell über die Straße Ich glaube dass er nach Hause will'
    expect(werteDiktatAus(SOLL, ist, { zaehlart: 'streng', kommasDiktiert: true, sechsAbProzent: 10 }).fehler).toBe(3)
    expect(werteDiktatAus(SOLL, ist, { zaehlart: 'woerter', kommasDiktiert: true, sechsAbProzent: 10 }).fehler).toBe(0)
  })
  it('Notenvorschlag: 10 % = 6, gleichmäßig dazwischen', () => {
    expect([0, 1, 2, 4, 6, 8, 10, 15].map((f) => notenvorschlag(f, 100, 10))).toEqual([1, 1, 2, 3, 4, 5, 6, 6])
  })
})

describe('Fehlerkategorien (26.11.2026)', () => {
  it('ordnet typische Fehler zu', async () => {
    const { fehlerKategorie } = await import('../src/shared/diktat')
    const f = (s: string, i: string, v = '', a = false): string => fehlerKategorie(s, i, v, a)
    expect(f('dass', 'das')).toBe('gleichklang')
    expect(f('Hund', 'hund')).toBe('gross_nomen')
    expect(f('Laufen', 'laufen', 'das')).toBe('gross_nominal')
    expect(f('Ihnen', 'ihnen')).toBe('gross_anrede')
    expect(f('Straße', 'Strasse')).toBe('slaute')
    expect(f('Hund', 'Hunt')).toBe('auslaut')
    expect(f('Bäume', 'Beume')).toBe('umlaut')
    expect(f('Biene', 'Bine')).toBe('ie')
    expect(f('gehen', 'geen')).toBe('silbenh')
    expect(f('Zahl', 'Zal')).toBe('dehnung')
    expect(f('Decke', 'Deke')).toBe('ck_tz')
    expect(f('Teller', 'Teler')).toBe('doppelkonsonant')
    expect(f('Vogel', 'Fogel')).toBe('fvph')
    expect(f('ruhig', 'ruhich')).toBe('nachsilben')
    expect(f('endlich', 'entlich')).toBe('gleichklang')
    expect(f('Fuchs', 'Fux')).toBe('besondere')
    expect(f('Theater', 'Teater')).toBe('fremdwoerter')
    expect(f('Strumpf', 'Strumf')).toBe('lauttreu')
  })
  it('Auswertung trägt die Kategorie', () => {
    const a = werteDiktatAus('Der Hund läuft über die Straße.', 'Der Hunt leuft über die Strasse.')
    expect(a.stellen.filter((s) => s.kategorie).map((s) => s.kategorie)).toEqual(['auslaut', 'umlaut', 'slaute'])
  })
})
