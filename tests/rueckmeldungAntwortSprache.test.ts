import { describe, expect, it } from 'vitest'
import { antwortSpracheAus, ergebnisAufDeutsch, sprachmittlungsSprache } from '../src/renderer/src/modules/rueckmeldung/antwortSprache'
import { deutschMoeglich } from '../src/renderer/src/modules/rueckmeldung/sprachErkennung'
import { spracheErgaenzen, teileAusArbeit, teileAusKi, type BewertungsTeil } from '../src/renderer/src/modules/rueckmeldung/teilbewertung'
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
    expect(antwortSpracheAus('Your friend Paul asks you about the text.', 'englisch')).toBeUndefined()
  })

  // 23.10.2026, Wunsch der Lehrkraft: Eine Sprachmittlung verlangt das Ergebnis in der Regel in der Zielsprache
  it('Sprachmittlung ohne Angabe zur Richtung: Zielsprache', () => {
    expect(antwortSpracheAus('Mediation: Your friend Paul asks you about the text.', 'englisch')).toBe('zielsprache')
    expect(antwortSpracheAus('Médiation : Ton ami Paul te pose des questions sur le texte.', 'franzoesisch')).toBe('zielsprache')
    expect(antwortSpracheAus('Mediación: Tu amigo Pablo te pregunta por el artículo.', 'spanisch')).toBe('zielsprache')
    // Deutscher Ausgangstext mit „deine Eltern" darin macht daraus keine Sprachmittlung ins Deutsche
    const quelle = Array(12).fill('Viele Jugendliche besprechen mit deinen Eltern und Lehrern, wie die neue Regel an der Schule umgesetzt wird.').join(' ')
    expect(antwortSpracheAus(`Mediation\n${quelle}\nYour partner school asks about the new rule.`, 'englisch')).toBe('zielsprache')
    expect(sprachmittlungsSprache(quelle)).toBe('zielsprache')
    expect(sprachmittlungsSprache('Fasse den Text auf Deutsch zusammen.')).toBe('deutsch')
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
        { id: 'p2', formatId: 'en-mediation', label: 'Mediation', weight: 40, points: 20, blocks: [{ type: 'task', instruction: 'Fasse den Text auf Deutsch für deine Eltern zusammen.' }] }
      ]
    } as unknown as Exam
    expect(teileAusArbeit(exam).teile.map((x) => x.ergebnisSprache)).toEqual(['zielsprache', 'deutsch'])
    // Ohne Angabe zur Richtung (deutscher Ausgangstext, englische Aufgabe ohne Adressat): Zielsprache (23.10.2026)
    const ohne = {
      meta: { subjectId: 'englisch' },
      parts: [{ id: 'p1', formatId: 'en-mediation', label: 'Mediation', weight: 100, points: 20, blocks: [{ text: 'Die Stadt baut ein neues Schwimmbad.' }, { task: 'Mediation: Sum up the article.' }] }]
    } as unknown as Exam
    expect(teileAusArbeit(ohne).teile[0].ergebnisSprache).toBe('zielsprache')
  })

  // Befund der Lehrkraft (23.10.2026, Shakespeare-Klausur): „in German-speaking theatre" galt als „auf Deutsch"
  it('Klassenarbeit: Richtung der Sprachmittlung nur aus den Arbeitsanweisungen, „German-speaking" ist keine Forderung', () => {
    const exam = {
      meta: { subjectId: 'englisch' },
      parts: [
        {
          id: 'p1',
          formatId: 'en-mediation',
          label: 'Mediation',
          weight: 100,
          points: 20,
          blocks: [
            { type: 'text', title: 'Shakespeare auf deutschen Bühnen', body: 'Viele Stücke wurden auf Deutsch gespielt; die deutsche Sprache …', glossary: [] },
            {
              type: 'task',
              instruction: 'Outline why Shakespeare’s plays were extensively adapted in German-speaking theatre.',
              parts: [],
              solution: 'Hinweis: sinngemäße Wiedergabe ins Englische, auch eine deutsche Zusammenfassung wäre falsch.',
              brief: { situation: 'Your British pen friend asks you.', audience: 'pen friend', textType: 'email', purpose: 'inform', words: 200, model: 'Dear Sam, …' }
            }
          ]
        }
      ]
    } as unknown as Exam
    expect(teileAusArbeit(exam).teile[0].ergebnisSprache).toBe('zielsprache')
  })

  it('Ergebnis auf Deutsch nur bei echter Forderung', () => {
    expect(ergebnisAufDeutsch('Outline why plays were adapted in German-speaking theatre.')).toBe(false)
    expect(ergebnisAufDeutsch('You have found an article in German.')).toBe(false)
    expect(ergebnisAufDeutsch('Lies den deutschen Text.')).toBe(false)
    expect(ergebnisAufDeutsch('Fasse den Text auf Deutsch zusammen.')).toBe(true)
    expect(ergebnisAufDeutsch('Explain the main points to your grandma in German.')).toBe(true)
    expect(ergebnisAufDeutsch('Translate the key ideas into German.')).toBe(true)
    expect(ergebnisAufDeutsch('Explique à ta grand-mère en allemand ce que dit l’article.')).toBe(true)
    expect(ergebnisAufDeutsch('Un article en allemand.')).toBe(false)
  })

  it('KI ohne Angabe zur Richtung: Sprachmittlung in der Zielsprache, andere Teile offen', () => {
    const k = teileAusKi([{ titel: 'Mediation', art: 'sprachmittlung' }, { titel: 'Reading', art: 'sonstig' }], { stateId: 'NI', grade: 10, schoolTypeId: 'gymnasium' })
    expect(k?.teile.map((x) => x.ergebnisSprache)).toEqual(['zielsprache', undefined])
  })

  it('mit Teilen: Deutsch nur möglich, wenn ein Teil Deutsch verlangt oder eine Sprachmittlung offen ist', () => {
    const t = (ergebnisSprache?: 'deutsch' | 'zielsprache') => ({ titel: 'Mediation', art: 'sprachmittlung', ergebnisSprache })
    expect(deutschMoeglich({ aufgaben: macbeth, teile: [t('zielsprache')] })).toBe(false)
    expect(deutschMoeglich({ aufgaben: macbeth, teile: [t()] })).toBe(true)
  })
})
