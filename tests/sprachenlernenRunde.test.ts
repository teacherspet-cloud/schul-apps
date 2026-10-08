import { describe, expect, it } from 'vitest'
import { nachnameSchluessel, namenVergleich } from '../src/shared/namenListe'
import { freigabeAbgleich, vorabGewaehlt, type BestehendeGrammatik } from '../src/renderer/src/modules/lernen/kurs/freigabeAbgleich'
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
  it('vorab angehakt: freigegeben (auch abgeschlossen) und Entwürfe, nicht Entferntes', () => {
    expect(vorabGewaehlt(bestehend).sort()).toEqual(['future', 'going-to', 'past', 'perfect', 'will'])
  })
  it('unverändert gespeichert: nichts zu tun', () => {
    expect(freigabeAbgleich(vorabGewaehlt(bestehend), bestehend)).toEqual({ erzeugen: [], entfernen: [], wiederherstellen: [] })
  })
  it('neu angehakt → Aufgaben; schon Freigegebenes → keine neuen; abgehakt → entfernen; wieder angehakt → zurück', () => {
    const r = freigabeAbgleich(['past', 'will', 'plural', 'adverbs', 'adverbs', 'going-to'], bestehend)
    expect(r.erzeugen).toEqual(['adverbs'])
    // g2 bleibt (ein Thema noch angehakt), g4 abgehakt; Entwurf und Training ohne Thema bleiben unberührt
    expect(r.entfernen).toEqual(['g4'])
    expect(r.wiederherstellen).toEqual(['g3'])
  })
  it('alles abgehakt: entfernt jedes Training mit Thema, nie Entwürfe', () => {
    expect(freigabeAbgleich([], bestehend)).toEqual({ erzeugen: [], entfernen: ['g1', 'g2', 'g4'], wiederherstellen: [] })
  })
})

describe('+ Aufgaben', () => {
  it('Anzahl 4–20', () => {
    expect([0, 3, 4, 12.4, 20, 99, Number.NaN].map(mehrAnzahl)).toEqual([4, 4, 4, 12, 20, 20, 10])
  })
})
