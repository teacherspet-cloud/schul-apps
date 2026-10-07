import { describe, expect, it } from 'vitest'
import { bestimmungsAnteil, normiert, paketBereinigt, pruefeGrammatik, type GrammatikAufgabe } from '../src/shared/grammatiktrainer'

/**
 * Latein im Grammatiktraining (07.10.2026, abgestimmt mit der Lehrkraft): Bestimmen mit ALLEN Lesarten und Teilpunkten,
 * Mehrfachauswahl, Paradigma-Tabelle, Übersetzen mit Selbstvergleich; Längenzeichen zählen bei Antworten nicht.
 */
const KASUS = ['Nom.', 'Gen.', 'Dat.', 'Akk.', 'Abl.']
const roh = {
  regeln: [{ id: 'r1', titel: 'a-Deklination', erklaerung: 'Die a-Deklination …', beispiele: ['rosa pulchra'] }],
  aufgaben: [
    {
      art: 'bestimmen',
      regelId: 'r1',
      anweisung: 'Bestimme die Form.',
      satz: '',
      form: 'rosae',
      merkmale: ['Kasus', 'Numerus', 'Genus'],
      werte: [KASUS, ['Sg.', 'Pl.'], ['m.', 'f.', 'n.']],
      lesarten: [
        ['Gen.', 'Sg.', 'f.'],
        ['Dat.', 'Sg.', 'f.'],
        ['Nom.', 'Pl.', 'f.'],
        ['Nom.', 'Pl.', 'f.']
      ],
      loesungen: []
    },
    {
      art: 'tabelle',
      regelId: 'r1',
      anweisung: 'Ergänze die Tabelle.',
      satz: 'rosa, -ae f.',
      spalten: ['Sg.', 'Pl.'],
      zeilen: [
        { name: 'Nom.', loesungen: ['rosa', 'rosae'], vorgabe: [true, false] },
        { name: 'Abl.', loesungen: ['rosā', 'rosīs'], vorgabe: [false, false] }
      ],
      loesungen: []
    },
    { art: 'mehrfach', regelId: 'r1', anweisung: 'Welche Formen sind Ablativ?', satz: '', optionen: ['rosā', 'rosam', 'rosīs', 'rosae'], loesungen: ['rosā', 'rosīs'] },
    { art: 'uebersetzen', regelId: 'r1', anweisung: 'Übersetze.', satz: 'gladiō pugnat', loesungen: ['er kämpft mit dem Schwert', 'sie kämpft mit dem Schwert'] }
  ]
}
const p = paketBereinigt(roh, 'a-Deklination')
const nach = (art: string): GrammatikAufgabe => p.aufgaben.find((a) => a.art === art)!

describe('Latein: Pool bereinigen', () => {
  it('Bestimmen: nur gültige Lesarten, doppelte weg', () => {
    expect(nach('bestimmen').lesarten).toEqual([
      ['Gen.', 'Sg.', 'f.'],
      ['Dat.', 'Sg.', 'f.'],
      ['Nom.', 'Pl.', 'f.']
    ])
  })
  it('alle vier Arten bleiben', () => expect(p.aufgaben.map((a) => a.art)).toEqual(['bestimmen', 'tabelle', 'mehrfach', 'uebersetzen']))
})

describe('Latein: Antworten der echten KI (Praxislauf 07.10.2026)', () => {
  it('ausgeschriebene Werte und fehlende Auswahl: Aufgabe bleibt, Werte in Schulbuch-Schreibweise', () => {
    const q = paketBereinigt({
      regeln: roh.regeln,
      aufgaben: [
        { art: 'bestimmen', regelId: 'r1', anweisung: 'Bestimme.', satz: '', form: 'templa', merkmale: ['Kasus', 'Numerus', 'Genus'], werte: [], lesarten: [['Nominativ', 'Plural', 'Neutrum'], ['Akkusativ', 'Plural', 'Neutrum']], loesungen: [] }
      ]
    })
    expect(q.aufgaben).toHaveLength(1)
    expect(q.aufgaben[0].werte?.[0]).toContain('Abl.')
    expect(q.aufgaben[0].lesarten).toEqual([
      ['Nom.', 'Pl.', 'n.'],
      ['Akk.', 'Pl.', 'n.']
    ])
  })
  it('Tabelle mit einer Zelle zu wenig bleibt erhalten', () => {
    const q = paketBereinigt({
      regeln: roh.regeln,
      aufgaben: [
        { art: 'tabelle', regelId: 'r1', anweisung: 'Ergänze.', satz: 'servus', spalten: ['Sg.', 'Pl.'], zeilen: [{ name: 'Nom.', loesungen: ['servus', 'servī'], vorgabe: [true, false] }, { name: 'Gen.', loesungen: ['servī'], vorgabe: [false] }, { name: 'Dat.', loesungen: ['servō', 'servīs'], vorgabe: [] }], loesungen: [] }
      ]
    })
    expect(q.aufgaben).toHaveLength(1)
  })
})

describe('Latein: Bewertung', () => {
  it('Längenzeichen zählen nicht', () => expect(normiert('rosā')).toBe(normiert('rosa')))
  it('Bestimmen: alle Lesarten = richtig, eine = teilweise, falsche ziehen ab; „Genitiv" = „Gen."', () => {
    const a = nach('bestimmen')
    expect(pruefeGrammatik(a, JSON.stringify([['Gen.', 'Sg.', 'f.'], ['Dat.', 'Sg.', 'f.'], ['Nom.', 'Pl.', 'f.']])).urteil).toBe('richtig')
    expect(pruefeGrammatik(a, JSON.stringify([['Genitiv', 'Singular', 'f']])).urteil).toBe('fast')
    expect(bestimmungsAnteil(a, [['Gen.', 'Sg.', 'f.'], ['Akk.', 'Sg.', 'f.']]).anteil).toBe(0)
    expect(pruefeGrammatik(a, JSON.stringify([['Akk.', 'Sg.', 'f.']])).urteil).toBe('falsch')
  })
  it('Tabelle: ohne Längen richtig, Vorgabe zählt nicht mit', () => {
    const a = nach('tabelle')
    expect(pruefeGrammatik(a, JSON.stringify([['rosa', 'rosae'], ['rosa', 'rosis']])).urteil).toBe('richtig')
    expect(pruefeGrammatik(a, JSON.stringify([['rosa', 'rosae'], ['rosa', 'rosae']])).urteil).toBe('falsch')
  })
  it('Mehrfach: alle richtigen ohne falsche', () => {
    const a = nach('mehrfach')
    expect(pruefeGrammatik(a, JSON.stringify(['rosa', 'rosis'])).urteil).toBe('richtig')
    expect(pruefeGrammatik(a, JSON.stringify(['rosā'])).urteil).toBe('fast')
    expect(pruefeGrammatik(a, JSON.stringify(['rosam'])).urteil).toBe('falsch')
  })
  it('Übersetzen: wörtlich richtig, sonst entscheidet der Selbstvergleich', () => {
    const a = nach('uebersetzen')
    expect(pruefeGrammatik(a, 'Er kämpft mit dem Schwert.').urteil).toBe('richtig')
    expect(pruefeGrammatik(a, 'er kämpft durch das Schwert', undefined, 'fast').urteil).toBe('fast')
    expect(pruefeGrammatik(a, 'er kämpft').urteil).toBe('falsch')
  })
})
