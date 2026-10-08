import { describe, expect, it } from 'vitest'
import { grammatikSpielPasst, memoryPaare, paketBereinigt, richtigFalschSaetze, type GrammatikAufgabe } from '../src/shared/grammatiktrainer'
import { bekannteZeitformen, signalRunden, ZEITFORMEN_EN } from '../src/shared/signalwoerter'

/** Sprachenlernen (08.10.2026): Aufgaben bearbeiten, Förderaufgaben, neue Grammatikspiele */
const A = (x: Partial<GrammatikAufgabe>): GrammatikAufgabe =>
  ({ id: 'x', art: 'luecke', regelId: 'r1', anweisung: '', satz: '', loesungen: [], ...x } as GrammatikAufgabe)
const REGELN = [{ id: 'r1', titel: 'Simple past', erklaerung: 'Vergangenheit', beispiele: ['I played.'], stolperfallen: ['did + Grundform'] }]

describe('Aufgaben bearbeiten und Förderaufgaben', () => {
  it('behält Kennungen beim Löschen und Umordnen (der Lernstand hängt daran)', () => {
    const p = paketBereinigt({
      regeln: REGELN,
      aufgaben: [
        { id: 'a1', art: 'luecke', regelId: 'r1', anweisung: 'x', satz: 'I ___ home.', loesungen: ['went'] },
        { id: 'a2', art: 'luecke', regelId: 'r1', anweisung: 'x', satz: 'She ___ tea.', loesungen: ['drank'] },
        { id: 'a3', art: 'luecke', regelId: 'r1', anweisung: 'x', satz: 'We ___ a film.', loesungen: ['saw'] }
      ]
    })
    const bearbeitet = paketBereinigt({ ...p, aufgaben: [p.aufgaben[2], p.aufgaben[0]] })
    expect(bearbeitet.aufgaben.map((a) => a.id)).toEqual(['a3', 'a1'])
  })
  it('übernimmt Stufe, Tipp und Stolperfallen; ohne Kennung gibt es die nächste freie', () => {
    const p = paketBereinigt({
      regeln: REGELN,
      aufgaben: [
        { id: 'a2', art: 'luecke', regelId: 'r1', anweisung: 'x', satz: 'I ___ home.', loesungen: ['went'], stufe: 2, tipp: 'unregelmäßig!' },
        { art: 'luecke', regelId: 'r1', anweisung: 'x', satz: 'She ___ tea.', loesungen: ['drank'], stufe: 7 }
      ]
    })
    expect(p.regeln[0].stolperfallen).toEqual(['did + Grundform'])
    expect(p.aufgaben[0]).toMatchObject({ id: 'a2', stufe: 2, tipp: 'unregelmäßig!' })
    expect(p.aufgaben[1].id).toBe('a3')
    expect(p.aufgaben[1].stufe).toBeUndefined()
  })
})

describe('Neue Grammatikspiele', () => {
  const geuebt = [
    A({ id: 'a1', art: 'auswahl', satz: 'She ___ to school.', loesungen: ['goes'], optionen: ['go', 'goes', 'going'] }),
    A({ id: 'a2', art: 'fehler', satz: 'He go home.', fehlerWort: 'go', loesungen: ['goes'] }),
    A({ id: 'a3', art: 'luecke', satz: 'I ___ tea.', vorgabe: '(to drink)', loesungen: ['drink'] }),
    A({ id: 'a4', art: 'luecke', satz: 'They ___ fast.', vorgabe: '(to run)', loesungen: ['run'] })
  ]
  it('Richtig oder falsch?: richtige und falsche Sätze aus Auswahl, Fehler finden und Lücke', () => {
    const s = richtigFalschSaetze(geuebt, () => 0)
    expect(s).toContainEqual({ satz: 'She goes to school.', stimmt: true, aufgabeId: 'a1' })
    expect(s).toContainEqual({ satz: 'She go to school.', stimmt: false, aufgabeId: 'a1' })
    expect(s).toContainEqual({ satz: 'He go home.', stimmt: false, aufgabeId: 'a2' })
    expect(s).toContainEqual({ satz: 'He goes home.', stimmt: true, aufgabeId: 'a2' })
    expect(s.filter((x) => x.aufgabeId === 'a3')).toEqual([{ satz: 'I drink tea.', stimmt: true, aufgabeId: 'a3' }])
  })
  it('Formen-Memory: Paare aus Grundform und Tabellenzellen, Doppeltes nur einmal', () => {
    const tabelle = A({
      id: 't',
      art: 'tabelle',
      spalten: ['Sg.', 'Pl.'],
      zeilen: [
        { name: 'Nom.', loesungen: ['amīca', 'amīcae'], vorgabe: [true, false] },
        { name: 'Gen.', loesungen: ['amīcae', 'amīcārum'] }
      ]
    })
    const p = memoryPaare([...geuebt, tabelle])
    expect(p).toContainEqual({ links: 'to drink', rechts: 'drink', aufgabeId: 'a3' })
    expect(p).toContainEqual({ links: 'Nom. Pl.', rechts: 'amīcae', aufgabeId: 't' })
    expect(p.filter((x) => x.rechts === 'amīcae')).toHaveLength(1)
    expect(p.some((x) => x.links === 'Nom. Sg.')).toBe(false)
  })
  it('Spiele nur, wenn die Grammatik passt', () => {
    expect(grammatikSpielPasst('richtigfalsch', geuebt, 1, 0)).toBe(true)
    expect(grammatikSpielPasst('richtigfalsch', geuebt.slice(2), 1, 0)).toBe(false)
    expect(grammatikSpielPasst('tabellenpuzzle', geuebt, 1, 0)).toBe(false)
    expect(grammatikSpielPasst('signalwort', geuebt, 1, 1)).toBe(false)
    expect(grammatikSpielPasst('signalwort', geuebt, 1, 2)).toBe(true)
    expect(grammatikSpielPasst('regelzuordnen', geuebt, 1, 0)).toBe(false)
  })
  it('Signalwort-Sortierer: nur bekannte Zeitformen, jedes Signalwort eindeutig', () => {
    const z = bekannteZeitformen(['en.verb.present_simple/fragen', 'en.verb.past_simple', 'en.noun.plural'])
    expect(z.map((x) => x.id)).toEqual(['en.verb.present_simple', 'en.verb.past_simple'])
    const runden = signalRunden(z, 12, () => 0.5)
    expect(runden.every((r) => z.some((x) => x.id === r.richtig))).toBe(true)
    const alle = ZEITFORMEN_EN.flatMap((x) => x.signale.map((s) => s.toLowerCase()))
    expect(new Set(alle).size).toBe(alle.length)
    expect(signalRunden(z.slice(0, 1))).toEqual([])
  })
})
