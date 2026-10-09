import { describe, expect, it } from 'vitest'
import { nachnameSchluessel, namenVergleich } from '../src/shared/namenListe'
import { abgleichText, freigabeAbgleich, schonImKurs, type BestehendeGrammatik } from '../src/renderer/src/modules/lernen/kurs/freigabeAbgleich'
import { mehrAnzahl } from '../src/renderer/src/modules/lernen/grammatikErzeugen'

/* Sprachenlernen, Runde 08.10.2026: Nachnamen-Sortierung, Abgleich im Dialog „Grammatik hinzufügen", „+ Aufgaben" */

describe('Nach Vor- oder Nachnamen sortieren', () => {
  it('Nachname = letztes Wort, bei Gästen der Anfangsbuchstabe; Komma = „Nachname, Vorname"', () => {
    expect(nachnameSchluessel('Anna Müller')).toBe('Müller Anna')
    expect(nachnameSchluessel('Lea Marie  Yilmaz')).toBe('Yilmaz Lea Marie')
    expect(nachnameSchluessel('Ben S.')).toBe('S. Ben')
    expect(nachnameSchluessel('Müller, Anna')).toBe('Müller Anna')
    expect(nachnameSchluessel('Tom')).toBe('Tom')
  })
  it('sortiert nach Nachnamen, bei Gleichheit nach Vornamen; Vorname wie bisher', () => {
    const namen = ['Ben S.', 'Anna Schmidt', 'Carl Abel', 'Anna K.', 'Zoe Schmidt']
    expect([...namen].sort((a, b) => namenVergleich(a, b, 'nachname'))).toEqual(['Carl Abel', 'Anna K.', 'Ben S.', 'Anna Schmidt', 'Zoe Schmidt'])
    expect([...namen].sort((a, b) => namenVergleich(a, b))).toEqual(['Anna K.', 'Anna Schmidt', 'Ben S.', 'Carl Abel', 'Zoe Schmidt'])
  })
  it('Namen ausgeblendet: Ersatznamen bleiben in Zahlenfolge', () => {
    const ersatz = ['Lernende/r 10', 'Lernende/r 2', 'Lernende/r 1']
    expect([...ersatz].sort((a, b) => namenVergleich(a, b, 'nachname'))).toEqual(['Lernende/r 1', 'Lernende/r 2', 'Lernende/r 10'])
  })
})

describe('Grammatik hinzufügen: Abgleich mit dem Kurs', () => {
  const bestehend: BestehendeGrammatik[] = [
    { id: 'g1', themen: ['past'], status: 'offen' },
    { id: 'g2', themen: ['future', 'will'], status: 'offen' },
    { id: 'g3', themen: ['plural'], status: 'entfernt' },
    { id: 'g4', themen: ['perfect'], status: 'beendet' },
    { id: 'g5', themen: [], status: 'offen' },
    { id: 'e1', themen: ['going-to'], status: 'entwurf' }
  ]
  // 09.10.2026: schon Freigegebenes steht nicht mehr zur Wahl, der Dialog entfernt nichts
  it('nicht zur Wahl: freigegeben (auch abgeschlossen) und Entwürfe, nicht Entferntes', () => {
    expect(schonImKurs(bestehend).sort()).toEqual(['future', 'going-to', 'past', 'perfect', 'will'])
  })
  it('nichts gewählt: nichts zu tun', () => {
    expect(freigabeAbgleich([], bestehend)).toEqual({ erzeugen: [], wiederherstellen: [] })
  })
  it('neu angehakt → Aufgaben; früher entfernt → zurück; schon Freigegebenes wird nie doppelt erzeugt', () => {
    const r = freigabeAbgleich(['past', 'will', 'plural', 'adverbs', 'adverbs', 'going-to'], bestehend)
    expect(r).toEqual({ erzeugen: ['adverbs'], wiederherstellen: ['g3'] })
    expect(abgleichText(r)).toBe('1 neu (KI erstellt Aufgaben) · 1 zurückholen')
  })
  it('Thema in einem entfernten UND einem aktiven Training: nicht zurückholen (steht schon im Kurs)', () => {
    const b2: BestehendeGrammatik[] = [...bestehend, { id: 'g6', themen: ['past'], status: 'entfernt' }]
    expect(freigabeAbgleich(['past'], b2)).toEqual({ erzeugen: [], wiederherstellen: [] })
  })
})

describe('+ Aufgaben', () => {
  it('Anzahl 4–20', () => {
    expect([0, 3, 4, 12.4, 20, 99, Number.NaN].map(mehrAnzahl)).toEqual([4, 4, 4, 12, 20, 20, 10])
  })
})
