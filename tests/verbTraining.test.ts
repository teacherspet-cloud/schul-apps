import { describe, expect, it } from 'vitest'
import { formPasst, spaltenDerForm, verbAufgaben, verbKarten, verbSchluesselVonWort, bereinigeVerbKarten } from '../src/shared/verbTraining'
import { paketBereinigt, pruefeGrammatik } from '../src/shared/grammatiktrainer'
import { SPIELE, VERBSPIELE } from '../src/shared/vokabelSpiele'
import { GRAMMATIK_SPIELE } from '../src/shared/grammatiktrainer'
import { bingoLinien } from '../src/renderer/src/modules/lernen/spiele/SpieleHoerenBild'
import { musterDer } from '../src/renderer/src/modules/lernen/spiele/SpieleVerben'

/**
 * Unregelmäßige Verben für Lernende und neue Spiele (07.10.2026, Plan-Modus mit der Lehrkraft): Karten aus der
 * Verbliste, Prüfung ohne KI (Varianten, Längenzeichen), Paket im Grammatiktraining, Ids der Spiele.
 */
const E = (id: string, inf: string, past: string, pp: string, de: string) => ({ id, formen: { inf, past, pp, de } })
const liste = [
  E('1', '(to) be', 'was/were', 'been', 'sein'),
  E('2', 'go', 'went', 'gone', 'gehen'),
  E('3', 'cut', 'cut', 'cut', 'schneiden'),
  E('4', 'buy', 'bought', 'bought', 'kaufen'),
  E('5', 'sing', 'sang', 'sung', 'singen'),
  E('6', 'burn', 'burnt/burned', 'burnt/burned', 'brennen')
]
const karten = verbKarten(liste, 'en')

describe('Verbkarten', () => {
  it('Grundform als Medienschlüssel, Formen ohne Deutsch', () => {
    expect(karten.map((k) => k.schluessel)).toEqual(['be', 'go', 'cut', 'buy', 'sing', 'burn'])
    expect(karten[0].formen).toEqual({ inf: '(to) be', past: 'was/were', pp: 'been' })
    expect(karten[0].de).toBe('sein')
    expect(verbSchluesselVonWort('(to) go')).toBe('go')
  })
  it('Formen prüfen: Varianten, „to", Längenzeichen', () => {
    expect(formPasst('burned', 'burnt/burned')).toBe(true)
    expect(formPasst('to be', '(to) be')).toBe(true)
    expect(formPasst('were', 'was/were')).toBe(true)
    expect(formPasst('goed', 'went')).toBe(false)
    expect(formPasst('rēxī', 'rexi')).toBe(true)
  })
  it('mehrdeutige Formen gehören in jede passende Spalte', () => {
    expect(spaltenDerForm(karten[2], 'cut')).toEqual(['inf', 'past', 'pp'])
    expect(spaltenDerForm(karten[3], 'bought')).toEqual(['past', 'pp'])
  })
  it('Muster je Verb', () => {
    const m = musterDer(karten, 'en')
    expect(m.get('3')?.id).toBe('AAA')
    expect(m.get('4')?.id).toBe('ABB')
    expect(m.get('5')?.id).toBe('IAU')
  })
  it('bereinigt fremde Karten', () => {
    expect(bereinigeVerbKarten([{ id: 'x', formen: { inf: 'go' }, schluessel: 'go' }, ...karten]).length).toBe(6)
  })
})

describe('Grammatiktraining: Freigabe „Unregelmäßige Verben"', () => {
  const paket = paketBereinigt({ thema: 'Verben', regeln: [{ id: 'verben', titel: 'Unregelmäßige Verben', erklaerung: 'Formen lernen.', beispiele: [] }], aufgaben: verbAufgaben(karten, 'en'), verben: karten, verbSprache: 'en' })
  it('je Verb eine Karte, Verben und Sprache bleiben im Paket', () => {
    expect(paket.aufgaben).toHaveLength(6)
    expect(paket.verben).toHaveLength(6)
    expect(paket.verbSprache).toBe('en')
  })
  it('Karte prüfen: Grundform vorgegeben, Varianten zählen', () => {
    const go = paket.aufgaben[1]
    expect(pruefeGrammatik(go, JSON.stringify([['go', 'went', 'gone']])).urteil).toBe('richtig')
    const burn = paket.aufgaben[5]
    expect(pruefeGrammatik(burn, JSON.stringify([['burn', 'burned', 'burnt']])).urteil).toBe('richtig')
    expect(pruefeGrammatik(go, JSON.stringify([['go', 'goed', 'goed']])).urteil).toBe('falsch')
  })
})

describe('Spiele', () => {
  it('12 neue Vokabelspiele, Verbspiele auch im Grammatiktraining', () => {
    for (const id of ['hoermemory', 'richtiggehoert', 'buchstaben', 'hoerbingo', 'bildmemory', 'wasfehlt', 'aufdecken', 'wortbild', ...VERBSPIELE])
      expect(SPIELE.some((s) => s.id === id), id).toBe(true)
    expect(GRAMMATIK_SPIELE.filter((s) => s.verben).map((s) => s.id)).toEqual(['verbtrio', 'verbblitz', 'bildverb', 'muster'])
  })
  it('Bingo: Reihen, Spalten, Diagonalen', () => {
    expect(bingoLinien(3)).toHaveLength(8)
    expect(bingoLinien(3)).toContainEqual([0, 4, 8])
    expect(bingoLinien(4)).toHaveLength(10)
  })
})

describe('Tabelle: ganze Zelle mit Varianten', () => {
  it('„was/were" und „was / were" zählen wie „was"', () => {
    const p = paketBereinigt({ thema: 'V', regeln: [{ id: 'verben', titel: 'V', erklaerung: 'V', beispiele: [] }], aufgaben: verbAufgaben(karten, 'en'), verben: karten, verbSprache: 'en' })
    const be = p.aufgaben[0]
    expect(pruefeGrammatik(be, JSON.stringify([['(to) be', 'was/were', 'been']])).urteil).toBe('richtig')
    expect(pruefeGrammatik(be, JSON.stringify([['(to) be', 'was / were', 'been']])).urteil).toBe('richtig')
  })
})
