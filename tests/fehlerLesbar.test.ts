// Falsche Antworten lesbar (18.11.2026, Befund im „Vorwissen der Lerngruppe": „[0,2,1,4,3]" statt „I my | we our …")
import { describe, expect, it } from 'vitest'
import { fehlerLesbar, type GrammatikAufgabe } from '../src/shared/grammatiktrainer'

const auf = (x: Partial<GrammatikAufgabe>): GrammatikAufgabe => ({ id: 'a', art: 'luecke', regelId: 'r', anweisung: '', satz: '', loesungen: [], ...x })

describe('fehlerLesbar', () => {
  it('Zuordnen: nur die falsch verbundenen Paare, mit ihrer richtigen Entsprechung', () => {
    const a = auf({
      art: 'zuordnen',
      paare: [
        { links: 'I', rechts: 'my' },
        { links: 'we', rechts: 'our' },
        { links: 'they', rechts: 'their' },
        { links: 'she', rechts: 'her' },
        { links: 'he', rechts: 'his' }
      ],
      loesungen: ['I my | we our | they their | she her | he his']
    })
    expect(fehlerLesbar(a, '[0,2,1,4,3]')).toEqual({ antwort: 'we their | they our | she his | he her', richtig: 'we our | they their | she her | he his' })
  })

  it('Lückentext: nur die falschen Lücken', () => {
    const a = auf({
      art: 'lueckentext',
      luecken: [{ loesungen: ["Don't be"] }, { loesungen: ["don't forget"] }, { loesungen: ["don't take"] }, { loesungen: ["Don't ride"] }]
    })
    expect(fehlerLesbar(a, JSON.stringify(["Don't", "don't", "don't take", "Don't"]))).toEqual({
      antwort: "Don't | don't | Don't",
      richtig: "Don't be | don't forget | Don't ride"
    })
  })

  it('Sortieren: Element → gewählte Gruppe statt richtiger Gruppe', () => {
    const a = auf({
      art: 'sortieren',
      gruppen: ['a', 'an'],
      elemente: [
        { text: 'uniform', gruppe: 0 },
        { text: 'orange', gruppe: 1 },
        { text: 'horse', gruppe: 0 }
      ]
    })
    expect(fehlerLesbar(a, '[1,1,1]')).toEqual({ antwort: 'uniform → an, horse → an', richtig: 'uniform → a, horse → a' })
  })

  it('Mehrfachwahl, Markieren, Richtig/Falsch, Tabelle', () => {
    expect(fehlerLesbar(auf({ art: 'mehrfach', loesungen: ['exercise'] }), '["uniform","house","ice cream"]')).toEqual({ antwort: 'uniform, house, ice cream', richtig: 'exercise' })
    expect(fehlerLesbar(auf({ art: 'markieren', satz: 'Look at the big dog.', ziele: [0] }), '[3]')).toEqual({ antwort: 'big', richtig: 'Look' })
    expect(fehlerLesbar(auf({ art: 'richtigfalsch', korrekt: false, fehlerWort: 'goed', loesungen: ['went'] }), '{"richtig":true}')).toEqual({
      antwort: 'Satz für richtig gehalten',
      richtig: 'goed → went'
    })
    const t = auf({ art: 'tabelle', spalten: ['Plural'], zeilen: [{ name: 'child', loesungen: ['children'] }] })
    expect(fehlerLesbar(t, '[["childs"]]')).toEqual({ antwort: 'child Plural: childs', richtig: 'child Plural: children' })
  })

  it('Textantworten bleiben, wie sie sind; gekürztes JSON fällt weg statt Zahlensalat', () => {
    expect(fehlerLesbar(auf({ art: 'luecke', loesungen: ['goes'] }), 'gos')).toEqual({ antwort: 'gos', richtig: 'goes' })
    expect(fehlerLesbar(auf({ art: 'imperativ' as never, loesungen: ['come'] }), '[1]')).toBeNull()
    expect(fehlerLesbar(auf({ art: 'zuordnen', paare: [{ links: 'a', rechts: 'b' }] }), '[0,2,1,4')).toBeNull()
  })
})
