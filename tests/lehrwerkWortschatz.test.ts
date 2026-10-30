import { describe, expect, it } from 'vitest'
import { unbekannteWoerter, wortformen } from '../src/shared/lehrwerkWortschatz'
import { wortschatzStandServer } from '../src/server/grammatikBank'

// Auftrag der Lehrkraft (29.10.2026): nur Wortschatz und Grammatik, die an der Station der Form bekannt sind
const aufgabe = (satz: string, loesungen: string[] = ['an'], weiter: Record<string, unknown> = {}) =>
  ({ id: 'x', regelId: 'r', art: 'luecke', anweisung: 'Setze ein.', satz, loesungen, ...weiter }) as never

describe('Wortschatz nach Lehrwerksstand', () => {
  const ws = wortschatzStandServer('en.noun.articles/a-an', 'en')!
  it('a/an wird in Green Line 1, Unit 1, Station 1 eingeführt', () => {
    expect(ws.stelle).toEqual({ buch: 'Green Line 1', unit: 'Unit 1', abschnitt: 'Station 1' })
  })
  it('„Ella has an hour for lunch." enthält Unbekanntes', () => {
    expect(unbekannteWoerter(aufgabe('Ella has ___ hour for lunch.'), ws.bekannt)).toEqual(expect.arrayContaining(['has', 'hour']))
  })
  it('Satz aus bekannten Wörtern ist in Ordnung; Namen, Kurzformen und deutsche Kontexte zählen nicht', () => {
    expect(unbekannteWoerter(aufgabe('This is ___ orange.', ['an'], { kontext: 'Du zeigst auf das Obst.' }), ws.bekannt)).toEqual([])
    expect(unbekannteWoerter(aufgabe("Ella isn't ___ ugly cat.", ['an']), ws.bekannt)).toEqual([])
  })
  it('Kurzformen werden aufgelöst', () => {
    expect(wortformen("I'm Tom. It isn't my bag.")).toEqual(['i', 'am', 'tom', 'it', 'is', 'not', 'my', 'bag'])
  })
  it('there is / there are erst ab Station 2', () => {
    expect(wortschatzStandServer('en.verb.there_is/fragen', 'en')!.stelle.abschnitt).toBe('Station 2')
  })
})

describe('Deutsches und Verbformen (Handbetrieb 29.10.2026)', () => {
  const bekannt = new Set(['the', 'desk', 'is', 'my', 'sing', 'ring', 'make', 'play', 'run', 'like', 'phone', 'mum', 'a', 'b'])
  const auf = (x: Record<string, unknown>) => ({ id: 'x', art: 'luecke', anweisung: '', satz: '', loesungen: [], ...x }) as never
  it('deutsche Wörter neben dem Englischen zählen nicht', () => {
    expect(unbekannteWoerter(auf({ art: 'zuordnen', paare: [{ links: 'unter dem Tisch', rechts: 'under the desk' }] }), bekannt)).toEqual(['under'])
    expect(unbekannteWoerter(auf({ art: 'umformen', satz: 'My phone is …', vorgabe: 'Emma statt Tom', loesungen: ['x'] }), bekannt)).not.toContain('statt')
    expect(unbekannteWoerter(auf({ art: 'lueckentext', satz: 'A: Mum! B: My phone …', luecken: [] }), bekannt)).toEqual([])
  })
  it('-ing und -ed bekannter Verben sind bekannt', () => {
    expect(unbekannteWoerter(auf({ satz: 'The phone is ringing. Mum is singing, making …, running, played, liked.' }), bekannt)).toEqual([])
  })
})

describe('Klasse der frühesten Einführung (Befund der Lehrkraft 29.10.2026)', () => {
  it('Past Progressive gehört nicht zu Green Line 1', () => {
    // Seit 30.10.2026 zählt der optionale Trailer 2 von Green Line 2 nicht mehr: eingeführt in Green Line 3 Unit 3
    const ws = wortschatzStandServer('en.verb.past_progressive/gleichzeitig', 'en')!
    expect(ws.stelle).toMatchObject({ buch: 'Green Line 3', unit: 'Unit 3' })
    expect(ws.jahrgang).toBe(7)
    expect(wortschatzStandServer('en.prep.basic/ort', 'en')!.jahrgang).toBe(5)
  })
})

describe('Deutsche Wörter über die Übersetzungen der Reihe (Nachtrag 29.10.2026)', () => {
  it('gebeugte deutsche Wörter zählen nicht, englische weiter', () => {
    const ws = wortschatzStandServer('en.verb.will_vs_goingto/vorhersage-signal', 'en')!
    const a = {
      id: 'x',
      art: 'zuordnen',
      anweisung: '',
      satz: '',
      loesungen: [],
      paare: [
        { links: 'Plan (vorher gefasster Entschluss)', rechts: "I'm going to visit my aunt." },
        { links: 'sichtbares Anzeichen', rechts: "Look! It's going to rain." },
        { links: 'Meinung', rechts: 'I think the critics will love it.' }
      ]
    } as never
    expect(unbekannteWoerter(a, ws.bekannt, [], ws.lexikon)).toEqual(['critics'])
  })
})

describe('Unregelmäßige Formen erst ab der Einführung der Zeitform', () => {
  it('Klasse 11: told/came bekannt; Green Line 1 Unit 1: went unbekannt', () => {
    const spaet = wortschatzStandServer('en.verb.will_vs_goingto/vorhersage-signal', 'en')!
    expect(spaet.bekannt.has('told') && spaet.bekannt.has('came')).toBe(true)
    const frueh = wortschatzStandServer('en.verb.there_is/fragen', 'en')!
    expect(frueh.bekannt.has('went')).toBe(false)
  })
})

describe('Grundwortschatz (Alltagswörter, 29.10.2026)', () => {
  it('weekend, party, pizza, London, myself gelten schon in Green Line 1 Unit 1 als bekannt', () => {
    const ws = wortschatzStandServer('en.verb.there_is/fragen', 'en')!
    for (const w of ['weekend', 'party', 'pizza', 'london', 'myself', 'baby']) expect(ws.bekannt.has(w)).toBe(true)
  })
})
