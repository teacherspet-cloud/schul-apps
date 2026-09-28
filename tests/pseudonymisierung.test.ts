import { describe, expect, it } from 'vitest'
import { ersetzeNamen, findeNamen, setzeNamenEin } from '../src/shared/pseudonymisierung'

/*
 * Namen vor dem Senden an eine KI ersetzen (Großprogramm 0.4, Rechtspaket). Vorbelegt sind nur
 * Kopfzeilen; Namen im Text sind ein Vorschlag, den die Lehrkraft bestätigt.
 */
describe('Namen finden', () => {
  it('erkennt Kopfzeilen', () => {
    const f = findeNamen('Name: Lea Schmidt\nKlasse: 7b\n\nMein Wochenende war schön.')
    expect(f[0]).toMatchObject({ name: 'Lea Schmidt', herkunft: 'kopf' })
  })

  it('schlägt bekannte Vornamen mit Nachnamen vor und führt den Vornamen allein nicht doppelt', () => {
    const f = findeNamen('Heute hat Jonas Weber mit Mia gespielt. Danach ging Jonas nach Hause.')
    expect(f.map((x) => x.name)).toEqual(expect.arrayContaining(['Jonas Weber', 'Mia']))
    expect(f.find((x) => x.name === 'Jonas')).toBeUndefined()
    expect(f.find((x) => x.name === 'Jonas Weber')!.anzahl).toBe(2)
  })

  it('nimmt kein Funktionswort als Nachnamen', () => {
    expect(
      findeNamen('Anna und Ben lesen.')
        .map((x) => x.name)
        .sort()
    ).toEqual(['Anna', 'Ben'])
  })

  it('findet in einem Sachtext ohne Personen nichts', () => {
    expect(findeNamen('Die Fotosynthese findet in den Chloroplasten statt.')).toEqual([])
  })
})

describe('Ersetzen', () => {
  it('ersetzt vollen Namen, Vor- und Nachnamen einheitlich und stellt sie wieder her', () => {
    const text = 'Name: Lea Schmidt\nLea schreibt über ihren Hund. Frau Schmidt liest mit.'
    const r = ersetzeNamen(text, ['Lea Schmidt'])
    expect(r.text).toBe('Name: S1\nS1 schreibt über ihren Hund. Frau S1 liest mit.')
    expect(r.zuordnung).toEqual([{ kuerzel: 'S1', name: 'Lea Schmidt' }])
    expect(setzeNamenEin('S1 hat gut gearbeitet.', r.zuordnung)).toBe('Lea Schmidt hat gut gearbeitet.')
  })

  it('führt bestehende Kürzel fort und ersetzt keine Wortteile', () => {
    const r = ersetzeNamen('Ben und Benjamin', ['Benjamin'], [{ kuerzel: 'S1', name: 'Ben' }])
    expect(r.text).toBe('Ben und S2')
    expect(setzeNamenEin('S1 und S2, nicht S12', r.zuordnung)).toBe('Ben und Benjamin, nicht S12')
  })
})
