import { describe, expect, it } from 'vitest'
import { erkenneWortart, mitNennform } from '../src/renderer/src/modules/vokabeltest/input/lateinNennform'
import type { VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'

/*
 * Die Beispiele stammen aus den frei zugänglichen Pontes-Vokabellisten (Klett), die in der
 * Recherche vom 24.09.2026 als einzige Primärquelle für Nennform-Konventionen zu bekommen
 * waren. Sie decken die Fälle ab, die im Vokabeltest auseinandergehalten werden müssen –
 * denn die Wortart entscheidet, welche Form abgefragt wird.
 */
const v = (term: string, pos?: string, translation = 'x'): VocabEntry => ({ id: 'x', term, translation, pos })

describe('Wortart aus der Nennform erkennen', () => {
  it('erkennt Substantive am Genus', () => {
    expect(erkenneWortart('servī m.', 'servus')).toBe('substantiv')
    expect(erkenneWortart('carminis n.', 'carmen')).toBe('substantiv')
    expect(erkenneWortart('uxōris f.', 'uxor')).toBe('substantiv')
  })

  it('erkennt Substantive auch mit Akkusativ statt Genitiv', () => {
    /*
     * Belegt für Pontes: In den Anfangslektionen steht der Akkusativ, später der Genitiv.
     * Beides muss durchgehen – sonst fiele der halbe Anfangsunterricht durchs Raster.
     */
    expect(erkenneWortart('avum m.', 'avus')).toBe('substantiv')
    expect(erkenneWortart('familiam f.', 'familia')).toBe('substantiv')
  })

  it('erkennt Verben an den Stammformen', () => {
    expect(erkenneWortart('cantō, cantāvī, cantātum', 'cantāre')).toBe('verb')
    expect(erkenneWortart('cupiō, cupīvī (cupītum)', 'cupere')).toBe('verb')
  })

  it('erkennt Adjektive an den weiteren Endungen', () => {
    expect(erkenneWortart('-a, -um', 'praeclārus')).toBe('adjektiv')
    expect(erkenneWortart('omne', 'omnis')).toBe('adjektiv')
  })

  it('erkennt Präpositionen am Kasus', () => {
    expect(erkenneWortart('Präp. + Abl.', 'cum')).toBe('praeposition')
    expect(erkenneWortart('+ Akk.', 'propter')).toBe('praeposition')
  })

  it('erkennt Wortarten ohne Nennform', () => {
    expect(erkenneWortart('Adv.', 'hodiē')).toBe('adverb')
    expect(erkenneWortart('Konj.', 'et')).toBe('sonstiges')
    expect(erkenneWortart('', 'quondam')).toBe('sonstiges')
  })
})

describe('Nennform aus der eingelesenen Zeile holen', () => {
  it('nimmt die dritte Spalte, wenn es eine gibt', () => {
    const e = mitNennform(v('servus', 'servī m.'))
    expect(e.term).toBe('servus')
    expect(e.nennform).toBe('servī m.')
    expect(e.wordClass).toBe('substantiv')
  })

  it('trennt die Nennform vom Lemma, wenn beides in einer Spalte steht', () => {
    // So kopiert man es aus einem Vokabelheft: „servus, servī m."
    const e = mitNennform(v('servus, servī m.'))
    expect(e.term).toBe('servus')
    expect(e.nennform).toBe('servī m.')
    expect(e.wordClass).toBe('substantiv')
  })

  it('zerlegt ein Lemma nicht, wenn nach dem Komma nichts steht', () => {
    const e = mitNennform(v('nihil,'))
    expect(e.term).toBe('nihil,')
    expect(e.nennform).toBeUndefined()
  })

  it('lässt eine schon vorhandene Nennform unangetastet', () => {
    const e = mitNennform({ ...v('servus'), nennform: 'servī m.', wordClass: 'substantiv' })
    expect(e.nennform).toBe('servī m.')
  })

  it('kommt mit einer Vokabel ohne jede Zusatzangabe zurecht', () => {
    const e = mitNennform(v('saepe'))
    expect(e.wordClass).toBe('sonstiges')
    expect(e.nennform).toBeUndefined()
  })
})
