import { describe, expect, it } from 'vitest'
import { paketBereinigt, pruefeGrammatik, type GrammatikAufgabe } from '../src/shared/grammatiktrainer'
import { aufgabeMangel } from '../src/shared/grammatikAufgabenRegeln'
import { designFuer, designText } from '../src/shared/grammatikDesign'
import { AUFGABEN_JE_UEBUNG, aufZielGekuerzt, UEBUNG_ARTEN } from '../src/shared/grammatikBank'

// Grammatik-Neubeginn (28.10.2026): neue Formate nach Recherche und Abstimmung mit der Lehrkraft
const lies = (aufgaben: Record<string, unknown>[]): GrammatikAufgabe[] =>
  paketBereinigt({ thema: 't', regeln: [{ id: 'r', titel: 'R', erklaerung: 'E', beispiele: [] }], aufgaben: aufgaben.map((a, i) => ({ id: `x${i}`, regelId: 'r', anweisung: 'A', ...a })) }, 't').aufgaben

describe('Neue Grammatikformate', () => {
  it('Lückentext: liest Lücken und bewertet je Lücke', () => {
    const [a] = lies([
      {
        art: 'lueckentext',
        satz: 'Yesterday Tom ___ to the park. While he ___, it started to rain.',
        luecken: [
          { vorgabe: '(go)', loesungen: ['went'] },
          { vorgabe: '(walk)', loesungen: ['was walking'] }
        ],
        loesungen: []
      }
    ])
    expect(a.luecken).toHaveLength(2)
    expect(pruefeGrammatik(a, JSON.stringify(['went', 'was walking'])).urteil).toBe('richtig')
    expect(pruefeGrammatik(a, JSON.stringify(['went', 'walked'])).urteil).toBe('fast')
    expect(pruefeGrammatik(a, JSON.stringify(['goes', 'walked'])).urteil).toBe('falsch')
    expect(aufgabeMangel({ ...a, uebung: 'anwenden' })).toBe('')
  })

  it('Lückentext mit falscher Lückenzahl fällt weg', () => {
    expect(lies([{ art: 'lueckentext', satz: 'One ___ two.', luecken: [{ loesungen: ['a'] }, { loesungen: ['b'] }], loesungen: [] }])).toHaveLength(0)
  })

  it('Sätze verbinden: Satzanfang gehört dazu, Kommas tolerant außer bei Kommaregeln', () => {
    const [a] = lies([
      {
        art: 'verbinden',
        satz: 'I have a friend. She lives in York.',
        vorgabe: '(who)',
        anfang: 'I have a friend',
        loesungen: ['I have a friend who lives in York.']
      }
    ])
    expect(pruefeGrammatik(a, 'who lives in York.').urteil).toBe('richtig')
    expect(pruefeGrammatik(a, 'I have a friend, who lives in York').urteil).toBe('richtig')
    const streng = { ...a, kommaPruefen: true }
    expect(pruefeGrammatik(streng, 'I have a friend, who lives in York').urteil).not.toBe('richtig')
  })

  it('Markieren über die genannten Wörter, Sortieren nach Gruppen', () => {
    const [m] = lies([{ art: 'markieren', satz: 'She has lived here since 2010 and has worked at the zoo.', zielWoerter: ['has'], loesungen: [] }])
    expect(m.ziele).toEqual([1, 7])
    expect(pruefeGrammatik(m, JSON.stringify([1, 7])).urteil).toBe('richtig')
    expect(pruefeGrammatik(m, JSON.stringify([1])).urteil).toBe('fast')
    const [s] = lies([
      {
        art: 'sortieren',
        gruppen: ['countable', 'uncountable'],
        elemente: [
          { text: 'apple', gruppe: 0 },
          { text: 'water', gruppe: 1 },
          { text: 'chair', gruppe: 0 },
          { text: 'advice', gruppe: 1 }
        ],
        loesungen: []
      }
    ])
    expect(pruefeGrammatik(s, JSON.stringify([0, 1, 0, 1])).urteil).toBe('richtig')
    expect(pruefeGrammatik(s, JSON.stringify([0, 1, 0, 0])).urteil).toBe('fast')
  })

  it('Erkennen verlangt Auswahl – Tippformate sind dort ein Mangel', () => {
    const [a] = lies([{ art: 'frage', satz: 'She lives in York.', vorgabe: '(Where)', loesungen: ['Where does she live?'] }])
    expect(aufgabeMangel({ ...a, uebung: 'erkennen' })).toMatch(/Erkennen/)
    expect(aufgabeMangel({ ...a, uebung: 'bilden' })).toBe('')
    expect(UEBUNG_ARTEN.erkennen).toEqual(expect.arrayContaining(['markieren', 'sortieren', 'mehrfach']))
  })

  it('Kontext wird gelesen, Mengen je Stufe sind kleiner', () => {
    const [a] = lies([{ art: 'luecke', kontext: 'Look at those clouds!', satz: 'It ___ soon.', vorgabe: '(rain)', loesungen: ["is going to rain", "'s going to rain"] }])
    expect(a.kontext).toBe('Look at those clouds!')
    expect(Object.values(AUFGABEN_JE_UEBUNG).reduce((n, x) => n + x, 0)).toBe(13)
  })

  it('Übungsdesign der englischen Formen liegt vor', async () => {
    const d = await designFuer('en.verb.present_perfect/since-for')
    expect(d).not.toBeNull()
    expect(designText(d!)).toMatch(/ÜBUNGSDESIGN/)
    expect(await designFuer('fr.verb.passe_compose')).toBeNull()
  })

  it('Gespeichert wird nur bis zum Ziel, mit gemischten Formaten', () => {
    const l = [
      { uebung: 'erkennen' as const, art: 'auswahl', n: 1 },
      { uebung: 'erkennen' as const, art: 'auswahl', n: 2 },
      { uebung: 'erkennen' as const, art: 'auswahl', n: 3 },
      { uebung: 'erkennen' as const, art: 'sortieren', n: 4 },
      { uebung: 'fehler' as const, art: 'fehler', n: 5 },
      { uebung: 'fehler' as const, art: 'fehler', n: 6 }
    ]
    expect(aufZielGekuerzt(l, (u) => (u === 'erkennen' ? 2 : 1)).map((x) => x.n)).toEqual([1, 4, 5])
  })
})
