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
