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
