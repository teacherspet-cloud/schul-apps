/**
 * Übungsvorrang (12.10.2026, shared/uebungsVorrang.ts): neueste Freigabe bzw. Testabschnitte zuerst, Test-Vorlauf,
 * Spiele zu ~70 % aus dem Vorrang; Abschnitte eines Tests (shared/testAbschnitte.ts); Grammatik heute
 * (shared/grammatikVorrang.ts).
 */
import { describe, expect, it } from 'vitest'
import { abschnitteOrdnen, tageszielVorTest, TEST_NEU_HOECHSTENS, vorrangSetzen, type VorrangAbschnitt } from '../src/shared/uebungsVorrang'
import { neuerStand, neueWoerter, sitzungsWoerter, tagesRunde, TAG, type Vokabel, type WortStand } from '../src/shared/vokabeltrainer'
import { spielWoerter } from '../src/shared/vokabelSpiele'
import { abschnitteAusThema, testAuswahlAus, testKeysBereinigt, vorbelegung } from '../src/shared/testAbschnitte'
import { kursTerminMitOnlinetests, kursTestMitOnlinetests, type OnlineTermin } from '../src/shared/onlinetestTermin'
import { aufgabeFreigabe, grammatikHeute } from '../src/shared/grammatikVorrang'
import type { GrammatikAufgabe, GrammatikPaket } from '../src/shared/grammatiktrainer'

const JETZT = Date.UTC(2026, 9, 12, 10, 0, 0)
const w = (id: string): Vokabel => ({ id, term: id, translation: id })
const ids = (l: { id: string }[]): string[] => l.map((x) => x.id)

describe('Abschnitte ordnen', () => {
  it('neueste Freigabe zuerst, zusammen freigeschaltete vom im Buch spätesten rückwärts (27.10.2026), ohne Zeit rückwärts', () => {
    const a: VorrangAbschnitt[] = [
      { ids: ['a1'], zeit: JETZT - 20 * TAG, stelle: 0 },
      { ids: ['b1'], zeit: JETZT - 2 * TAG, stelle: 1 },
      { ids: ['c1'], zeit: JETZT - 2 * TAG + 60_000, stelle: 2 },
      { ids: ['x1'], zeit: 0, stelle: 3 },
      { ids: ['y1'], zeit: 0, stelle: 4 }
    ]
    const { reihe, neu } = abschnitteOrdnen(a)
    expect(reihe.map((x) => x.ids[0])).toEqual(['c1', 'b1', 'a1', 'y1', 'x1'])
    expect([...neu].map((x) => x.ids[0])).toEqual(['c1', 'b1'])
  })

  it('Testabschnitte vor allen anderen', () => {
    const { reihe } = abschnitteOrdnen([
      { ids: ['alt'], zeit: JETZT - 30 * TAG, stelle: 0, test: true },
      { ids: ['neu'], zeit: JETZT - TAG, stelle: 1 }
    ])
    expect(reihe.map((x) => x.ids[0])).toEqual(['alt', 'neu'])
  })
})

describe('neue Wörter und fällige Wiederholungen', () => {
  const liste = vorrangSetzen(
    [w('a1'), w('a2'), w('b1'), w('b2'), w('c1')],
    [
      { ids: ['a1', 'a2'], zeit: JETZT - 10 * TAG, stelle: 0 },
      { ids: ['b1', 'b2'], zeit: JETZT - TAG, stelle: 1 },
      { ids: ['c1'], zeit: JETZT - 5 * TAG, stelle: 2 }
    ]
  )

  it('neue Wörter: zuletzt freigeschalteter Abschnitt zuerst, darin Lehrwerk-Reihenfolge', () => {
    expect(ids(neueWoerter(liste, {}, JETZT))).toEqual(['b1', 'b2', 'c1', 'a1', 'a2'])
    expect(liste.find((v) => v.id === 'b1')?.vorrang).toBe('neu')
    expect(liste.find((v) => v.id === 'a1')?.vorrang).toBeUndefined()
  })

  it('ohne Rang bleibt es beim zufälligen, je Tag festen Mischen', () => {
    const roh = [w('a'), w('b'), w('c'), w('d')]
    expect(ids(neueWoerter(roh, {}, JETZT)).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(neueWoerter(roh, {}, JETZT))).toEqual(ids(neueWoerter(roh, {}, JETZT)))
  })

  it('neue Wörter vor fälligen Wiederholungen (27.10.2026, Entscheidung der Lehrkraft)', () => {
    const st = (faellig: number): WortStand => ({ ...neuerStand(), fach: 3, versuche: 3, faellig, zuletzt: JETZT - 10 * TAG })
    const staende = { a1: st(JETZT - 5 * TAG), a2: st(JETZT - 4 * TAG) }
    expect(ids(sitzungsWoerter(liste, staende, JETZT, 2))).toEqual(['b1', 'b2', 'a1', 'a2'])
    // Tagesrunde mit Ziel 2: die beiden neuen, dann eine Wiederholung bis zur Zehner-Grenze
    expect(ids(tagesRunde(liste, staende, JETZT, 2).woerter)).toEqual(['b1', 'b2', 'a1', 'a2'])
  })

  it('fällige aus der neuesten Freigabe vor älteren fälligen', () => {
    const st = (faellig: number): WortStand => ({ ...neuerStand(), fach: 3, versuche: 3, faellig, zuletzt: JETZT - 10 * TAG })
    const staende = { a1: st(JETZT - 5 * TAG), b1: st(JETZT - TAG), c1: st(JETZT - 3 * TAG) }
    expect(ids(sitzungsWoerter(liste, staende, JETZT, 0)).slice(0, 3)).toEqual(['b1', 'a1', 'c1'])
  })
})

describe('Test-Vorlauf', () => {
  const test = vorrangSetzen(
    Array.from({ length: 40 }, (_, i) => w(`t${i}`)),
    [{ ids: Array.from({ length: 40 }, (_, i) => `t${i}`), zeit: JETZT - 20 * TAG, stelle: 0, test: true }]
  )

  it('verteilt die ungeübten Testwörter auf die Tage bis 3 Tage vor dem Test', () => {
    // Test in 10 Tagen: bis 3 Tage vorher bleiben 8 Tage (heute eingeschlossen) → 40 / 8 = 5 (unter dem Ziel 10)
    expect(tageszielVorTest(10, test, {}, JETZT + 10 * TAG, JETZT)).toBe(10)
    // Test in 5 Tagen: 3 Tage → 14 je Tag
    expect(tageszielVorTest(10, test, {}, JETZT + 5 * TAG, JETZT)).toBe(14)
    // Test morgen: alles sofort, höchstens 30
    expect(tageszielVorTest(10, test, {}, JETZT + TAG, JETZT)).toBe(TEST_NEU_HOECHSTENS)
    // kein Test / vorbei: Ziel der Lehrkraft
    expect(tageszielVorTest(10, test, {}, null, JETZT)).toBe(10)
    expect(tageszielVorTest(10, test, {}, JETZT - TAG, JETZT)).toBe(10)
  })

  it('heute schon gelernte Testwörter zählen mit (das Ziel sinkt nicht im Lauf des Tages)', () => {
    const staende: Record<string, WortStand> = {}
    for (let i = 0; i < 14; i++) staende[`t${i}`] = { ...neuerStand(), fach: 1, versuche: 1, zuletzt: JETZT, erstmals: JETZT }
    expect(tageszielVorTest(10, test, staende, JETZT + 5 * TAG, JETZT)).toBe(14)
    expect(tagesRunde(test, staende, JETZT, 14).woerter.length).toBe(0)
  })

  it('ein höheres Ziel der Lehrkraft bleibt', () => {
    expect(tageszielVorTest(40, test, {}, JETZT + TAG, JETZT)).toBe(40)
  })
})

describe('Spiele', () => {
  const gelernt = (fach: number): WortStand => ({ ...neuerStand(), fach, versuche: 2, faellig: JETZT + 5 * TAG, zuletzt: JETZT - TAG })
  it('~70 % aus den Vorrang-Abschnitten, Test vor neuester Freigabe', () => {
    const woerter: Vokabel[] = [
      ...Array.from({ length: 6 }, (_, i): Vokabel => ({ ...w(`t${i}`), vorrang: 'test' })),
      ...Array.from({ length: 6 }, (_, i): Vokabel => ({ ...w(`n${i}`), vorrang: 'neu' })),
      ...Array.from({ length: 20 }, (_, i) => w(`r${i}`))
    ]
    const staende = Object.fromEntries(woerter.map((v) => [v.id, gelernt(3)]))
    let z = 1
    const zufall = (): number => (z = (z * 16807) % 2147483647) / 2147483647
    const pool = spielWoerter(woerter, staende, 6, JETZT, 16, zufall)
    expect(pool).toHaveLength(16)
    const vorne = pool.filter((v) => v.vorrang).length
    expect(vorne).toBe(Math.round(16 * 0.7))
    expect(pool.filter((v) => v.vorrang === 'test')).toHaveLength(6)
  })
})

describe('Abschnitte eines Tests', () => {
  it('Vorbelegung: seit dem letzten Test, sonst die neueste (freie) Freigabe', () => {
    const e = [
      { key: 'U1 S1', zeit: JETZT - 30 * TAG },
      { key: 'U1 S2', zeit: JETZT - 10 * TAG },
      { key: 'U2 S1', zeit: JETZT - 2 * TAG },
      { key: 'U2 S2', zeit: JETZT + 3 * TAG }
    ]
    expect(vorbelegung(e, JETZT - 20 * TAG, JETZT)).toEqual(['U1 S2', 'U2 S1', 'U2 S2'])
    expect(vorbelegung(e, null, JETZT)).toEqual(['U2 S1'])
    expect(vorbelegung([], null, JETZT)).toEqual([])
  })

  it('gespeicherte Auswahl lesen und bereinigen', () => {
    expect(testAuswahlAus('')).toEqual({ keys: null })
    expect(testAuswahlAus('{"keys":["a","a","b"],"letzter":5}')).toEqual({ keys: ['a', 'b'], letzter: 5 })
    expect(testAuswahlAus('kaputt')).toEqual({ keys: null })
    const bekannt = new Set(['a', 'b'])
    expect(testKeysBereinigt(undefined, bekannt)).toBeUndefined()
    expect(testKeysBereinigt(null, bekannt)).toBeNull()
    expect(testKeysBereinigt(['a', 'x'], bekannt)).toEqual(['a'])
  })

  it('Onlinetest: Abschnitte aus dem Thema', () => {
    const teile = [
      { key: 'U2', titel: 'Unit 2 · Station 1', unit: 'Unit 2', name: 'Station 1' },
      { key: 'U3a', titel: 'Station 1', unit: 'Unit 3', name: 'Check-in, Station 1' },
      { key: 'U3b', titel: 'Station 2', unit: 'Unit 3', name: 'Station 2' },
      { key: 'U30', titel: 'Station 1', unit: 'Unit 30', name: 'Station 1' }
    ]
    expect(abschnitteAusThema('Green Line 3 - Unit 3 - Station 2', teile)).toEqual(['U3b'])
    expect(abschnitteAusThema('Unit 3', teile)).toEqual(['U3a', 'U3b'])
    expect(abschnitteAusThema('Wortschatz Herbst', teile)).toEqual([])
  })

  it('Termin mit Quelle: der frühere von Kurstermin und Onlinetest', () => {
    const online: (OnlineTermin & { thema: string })[] = [
      { lerngruppeId: 'g', art: 'Vokabeltest', fach: 'Englisch', zielsprache: 'en', termin: '2026-10-15', thema: 'Unit 3' }
    ]
    const kurs = { lerngruppe_id: 'g', fach: 'Englisch', sprache: 'en', test_termin: JETZT + 10 * TAG }
    const t = kursTestMitOnlinetests(kurs, online, JETZT)
    expect(t?.online?.thema).toBe('Unit 3')
    expect(kursTerminMitOnlinetests(kurs, online, JETZT)).toBe(t?.termin)
    expect(kursTestMitOnlinetests({ ...kurs, test_termin: JETZT + TAG }, online, JETZT)?.online).toBeNull()
  })
})

describe('Grammatik heute', () => {
  const a = (id: string, regelId: string, stufe?: 1 | 2 | 3): GrammatikAufgabe =>
    ({ id, art: 'luecke', regelId, anweisung: '', satz: `${id} ___`, loesungen: ['x'], ...(stufe ? { stufe } : {}) } as GrammatikAufgabe)
  const erstellt = JETZT - 30 * TAG
  const spaeter = `m${(JETZT - TAG).toString(36)}`

  it('Freigabezeit aus der Kennung angehängter Aufgaben', () => {
    expect(aufgabeFreigabe(`${spaeter}-1`, erstellt)).toBe(JETZT - TAG)
    expect(aufgabeFreigabe('a1', erstellt)).toBe(erstellt)
  })

  it('zuletzt angehängte Aufgaben zuerst, sonst Stufe und Regel wie bisher', () => {
    const paket = {
      regeln: [{ id: 'r1' }, { id: 'r2' }],
      aufgaben: [a('a1', 'r2'), a('a2', 'r1'), a(`${spaeter}-1`, 'r1'), a(`${spaeter}-2`, 'r2', 1)]
    } as unknown as GrammatikPaket
    expect(grammatikHeute(paket, {}, { erstellt, jetzt: JETZT })).toEqual([`${spaeter}-1`, `${spaeter}-2`, 'a2', 'a1'])
    expect(grammatikHeute(paket, {}, { erstellt, jetzt: JETZT, neuJeTag: 2 })).toHaveLength(2)
  })

  it('alle Aufgaben möglich (17.10.2026): ohne Tagesgrenze, Tagesrunde ist der Anfang davon', () => {
    const paket = {
      regeln: [{ id: 'r1' }],
      aufgaben: Array.from({ length: 30 }, (_, i) => a(`a${i}`, 'r1'))
    } as unknown as GrammatikPaket
    const heute = grammatikHeute(paket, {}, { erstellt, jetzt: JETZT })
    const alle = grammatikHeute(paket, {}, { erstellt, jetzt: JETZT, alle: true })
    expect(heute).toHaveLength(10)
    expect(alle).toHaveLength(30)
    expect(alle.slice(0, 10)).toEqual(heute)
  })
})
