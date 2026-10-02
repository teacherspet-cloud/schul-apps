import { describe, expect, it } from 'vitest'
import { musterFuer, personAus, pruefeHoertext, schuetzeAnfrage, schuetzeText, stelleWiederHer } from '../src/server/namensfilter'

/*
 * Namensschutz (02.10.2026) – Bedingung der Lehrkraft: Klarnamen von Lehrkräften und Schülern
 * gehen NIE an eine KI; fiktive Namen (Hörtexte) sind erlaubt; die Lehrkraft sieht alles in Klarnamen.
 */
const schule = musterFuer([
  personAus('Torge Kornahrens', 't.kornahrens')!,
  personAus('Lena Koch', 'lena.koch')!,
  personAus('Ayşe Yılmaz', 'ayse.yilmaz')!
])
const req = (user: string, system = 'Du schreibst Elternbriefe.') => ({ system, user, schemaName: 'x', schema: {} })

describe('Ersetzen vor der KI', () => {
  it('voller Name, umgedreht, Anrede, Initiale, Benutzername, Nachname allein', () => {
    const { req: r, z } = schuetzeAnfrage(
      req('Torge Kornahrens schreibt an Herrn Kornahrens. Kornahrens, Torge; T. Kornahrens; Mail t.kornahrens; Kornahrens kommt.'),
      schule
    )
    expect(r.user).not.toMatch(/Kornahrens|Torge|t\.kornahrens/)
    expect(r.user).toContain('[Person-1]')
    expect(z.anzahl).toBe(6)
    expect(r.system).toContain('Platzhalter')
  })
  it('Umlaute und Sonderzeichen; mehrere Personen bekommen verschiedene Platzhalter', () => {
    const { req: r } = schuetzeAnfrage(req('Ayşe Yılmaz und Torge Kornahrens'), schule)
    expect(r.user).toMatch(/^\[Person-(\d)\] und \[Person-(?!)\d\]$/)
  })
  it('Nachnamen, die gewöhnliche Wörter sind, allein NICHT – aber mit Vorname/Anrede schon', () => {
    const { req: r } = schuetzeAnfrage(req('Der Koch kocht. Frau Koch kommt. Lena Koch auch.'), schule)
    expect(r.user).toBe('Der Koch kocht. [Person-1] kommt. [Person-1] auch.')
  })
  it('fiktive Namen und Vornamen allein bleiben (Hörtexte)', () => {
    const { req: r, z } = schuetzeAnfrage(req('Anna: Hi Ben! Lena and Torge are late.'), schule)
    expect(r.user).toBe('Anna: Hi Ben! Lena and Torge are late.')
    expect(z.anzahl).toBe(0)
  })
  it('keine Teiltreffer in längeren Wörtern', () => {
    const { req: r } = schuetzeAnfrage(req('Die Kornahrensstraße ist lang.'), schule)
    expect(r.user).toBe('Die Kornahrensstraße ist lang.')
  })
})

describe('Wiedereinsetzen in der Antwort', () => {
  it('auch ohne Klammern und tief im JSON', () => {
    const { z } = schuetzeAnfrage(req('Torge Kornahrens'), schule)
    expect(stelleWiederHer({ brief: 'Mit freundlichen Grüßen, [Person-1]', liste: ['Person-1'] }, z)).toEqual({ brief: 'Mit freundlichen Grüßen, Torge Kornahrens', liste: ['Torge Kornahrens'] })
  })
  it('Websuche und Bildauftrag', () => {
    const { text, z } = schuetzeText('Foto von Lena Koch', schule)
    expect(text).toBe('Foto von [Person-1]')
    expect(stelleWiederHer('[Person-1]', z)).toBe('Lena Koch')
  })
})

describe('Sprachausgabe', () => {
  it('echte Namen sperren, fiktive durchlassen', () => {
    expect(() => pruefeHoertext({ id: 'a', turns: [{ voiceId: 'v', text: 'Hello, Mr Kornahrens!' }] }, schule)).toThrow(/echten Person/)
    expect(() => pruefeHoertext({ id: 'a', turns: [{ voiceId: 'v', text: 'Hello, Mr Smith! Hi Lena.' }] }, schule)).not.toThrow()
  })
})

describe('Namen zerlegen', () => {
  it('„Vorname Nachname" und „Nachname, Vorname"', () => {
    expect(personAus('Max von Mustermann')).toEqual({ vorname: 'Max von', nachname: 'Mustermann', benutzer: undefined })
    expect(personAus('Mustermann, Max')).toEqual({ vorname: 'Max', nachname: 'Mustermann', benutzer: undefined })
  })
})
