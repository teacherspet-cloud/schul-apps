import { describe, expect, it } from 'vitest'
import { antwortSpracheAus } from '../src/renderer/src/modules/rueckmeldung/antwortSprache'
import { deutschMoeglich } from '../src/renderer/src/modules/rueckmeldung/sprachErkennung'
import { spracheErgaenzen, teileAusArbeit, type BewertungsTeil } from '../src/renderer/src/modules/rueckmeldung/teilbewertung'
import type { Exam } from '../src/renderer/src/modules/klassenarbeit/model/types'

/*
 * Antwortsprache je Teil (29.09.2026, Wunsch der Lehrkraft): Bei der Macbeth-Sprachmittlung
 * (deutsche Rezension M1 → E-Mail an die britische Partnerschule) wurde nicht erkannt, dass die
 * Antwort auf Englisch verlangt ist.
 */
const macbeth =
  'Part 1: Mediation\nYou help organise a Macbeth film evening for your British partner school. A student coordinator has asked whether Justin Kurzel’s 2015 adaptation would support a discussion …, and you have found the German review M1.\nWrite an email based on M1, selecting and explaining the review’s relevant findings and giving a reasoned recommendation about screening the film.'

describe('Antwortsprache aus der Aufgabe', () => {
  it('Macbeth-Sprachmittlung: Englisch verlangt – Deutsch ist falsch', () => {
    expect(antwortSpracheAus(macbeth, 'englisch')).toBe('zielsprache')
    expect(deutschMoeglich({ aufgaben: macbeth }, antwortSpracheAus(macbeth, 'englisch'))).toBe(false)
  })

  it('ins Deutsche bzw. für deutschsprachige Adressaten: Deutsch', () => {
    expect(antwortSpracheAus('Sprachmittlung: Fasse den Artikel für deine Eltern zusammen.', 'englisch')).toBe('deutsch')
    expect(antwortSpracheAus('Your German grandparents want to know what the article says.', 'englisch')).toBe('deutsch')
    expect(antwortSpracheAus('Explique à ton correspondant ce que dit l’article.', 'franzoesisch')).toBe('zielsprache')
    expect(antwortSpracheAus('Escribe un correo a tu amigo.', 'spanisch')).toBe('zielsprache')
  })

  it('unklar bleibt unklar', () => {
    expect(antwortSpracheAus('Mediation: Your friend Paul asks you about the text.', 'englisch')).toBeUndefined()
  })
})

describe('Antwortsprache je Teil', () => {
  it('ergänzt fehlende Angaben: ein Teil → aus der ganzen Aufgabe, Schreiben → Zielsprache', () => {
    const t = (art: BewertungsTeil['art'], titel: string): BewertungsTeil => ({ id: titel, titel, art, quelle: 'material' })
    expect(spracheErgaenzen([t('sprachmittlung', 'Part 1: Mediation')], macbeth, 'englisch')[0].ergebnisSprache).toBe('zielsprache')
    const zwei = spracheErgaenzen([t('sonstig', 'Reading'), t('schreiben', 'Writing')], macbeth, 'englisch')
    expect(zwei.map((x) => x.ergebnisSprache)).toEqual([undefined, 'zielsprache'])
    expect(spracheErgaenzen([t('schreiben', 'Writing')], 'x', 'deutsch')[0].ergebnisSprache).toBeUndefined()
  })

  it('Klassenarbeit: Schreiben in der Zielsprache, Sprachmittlung aus dem Text des Teils', () => {
    const exam = {
      meta: { subjectId: 'englisch' },
      parts: [
        { id: 'p1', formatId: 'en-writing', label: 'Writing', weight: 60, points: 30, blocks: [{ text: 'Write an article.' }] },
        { id: 'p2', formatId: 'en-mediation', label: 'Mediation', weight: 40, points: 20, blocks: [{ task: 'Fasse den Text auf Deutsch für deine Eltern zusammen.' }] }
      ]
    } as unknown as Exam
    expect(teileAusArbeit(exam).teile.map((x) => x.ergebnisSprache)).toEqual(['zielsprache', 'deutsch'])
  })

  it('mit Teilen: Deutsch nur möglich, wenn ein Teil Deutsch verlangt oder eine Sprachmittlung offen ist', () => {
    const t = (ergebnisSprache?: 'deutsch' | 'zielsprache') => ({ titel: 'Mediation', art: 'sprachmittlung', ergebnisSprache })
    expect(deutschMoeglich({ aufgaben: macbeth, teile: [t('zielsprache')] })).toBe(false)
    expect(deutschMoeglich({ aufgaben: macbeth, teile: [t()] })).toBe(true)
  })
})
