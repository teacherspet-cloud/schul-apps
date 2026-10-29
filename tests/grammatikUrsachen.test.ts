/**
 * Ursachen nicht lösbarer Grammatikaufgaben (29.10.2026, Handbetrieb Green Line 1 Unit 1 – Prüfung und Blindprobe) und die
 * Mechaniken dagegen: Mängel, die neue Aufgaben gar nicht erst in die Bank lassen, und gleichwertige Kurz-/Langformen.
 */
import { describe, expect, it } from 'vitest'
import { aufgabeMangel, aufgabeNormalisiert, fehlerWortMehrfach, moeglichkeitenVerraten, vorgabeZusammengesetzt } from '../src/shared/grammatikAufgabenRegeln'
import { blindMehrdeutig, gruppeZurAntwort } from '../src/shared/grammatikBlindprobe'
import { kurzformTolerant, ohneKurzformen, paketBereinigt, pruefeGrammatik, type GrammatikAufgabe } from '../src/shared/grammatiktrainer'

const auf = (x: Partial<GrammatikAufgabe>): GrammatikAufgabe => ({ id: 'x', art: 'luecke', anweisung: 'Setze ein.', satz: '', loesungen: [], ...x }) as GrammatikAufgabe

describe('Mängel aus der Prüfung', () => {
  it('Präposition als freie Lücke ohne Grundwort – auch beim Anwenden', () => {
    expect(aufgabeMangel(auf({ uebung: 'anwenden', anweisung: 'Ergänze die passende Präposition.', satz: 'Tom is ___ bed.', loesungen: ['in'] }))).toMatch(
      /ohne Grundwort/
    )
    // Mit Grundwort gebildet: in Ordnung
    expect(aufgabeMangel(auf({ uebung: 'anwenden', satz: 'Mia ___ to school.', vorgabe: '(go)', loesungen: ['goes'] }))).toBe('')
  })

  it('Vorgabe nur zusammengesetzt („(can / ride)" → „can ride")', () => {
    expect(vorgabeZusammengesetzt('(can / ride)', ['can ride'])).toBe(true)
    expect(vorgabeZusammengesetzt("(can't / dance)", ["can't dance"])).toBe(true)
    // Gebildet: Verneinung bzw. Form ändert sich
    expect(vorgabeZusammengesetzt('(not / dance)', ["can't dance", 'cannot dance'])).toBe(false)
    // Echte Wahl: ein Wort
    expect(vorgabeZusammengesetzt('(since / for)', ['for'])).toBe(false)
    expect(aufgabeMangel(auf({ uebung: 'bilden', satz: 'My brother ___ a bike.', vorgabe: '(can / ride)', loesungen: ['can ride'] }))).toMatch(/abschreiben/)
  })

  it('Lückentext: Lücke ohne Grundwort, Möglichkeiten oder Wortkasten', () => {
    const a = auf({
      art: 'lueckentext',
      uebung: 'anwenden',
      satz: 'My bag is ___ the desk. The cat is ___ the bed.',
      luecken: [
        { vorgabe: '', loesungen: ['under'] },
        { vorgabe: '', loesungen: ['on'] }
      ]
    })
    expect(aufgabeMangel(a)).toMatch(/ohne Grundwort \(Lückentext\)/)
    expect(aufgabeMangel({ ...a, wortkasten: ['under', 'on'] })).not.toMatch(/ohne Grundwort/)
  })

  it('Fehlerwort mehrmals im Satz', () => {
    const a = auf({ art: 'fehler', satz: 'While my sister was reading, my brothers was watching TV.', fehlerWort: 'was', loesungen: ['were'] })
    expect(fehlerWortMehrfach(a)).toBe(true)
    expect(aufgabeMangel(a)).toMatch(/mehrmals/)
    expect(fehlerWortMehrfach({ satz: 'My brothers was at home.', fehlerWort: 'was' })).toBe(false)
  })

  it('Satzanfang mit der geübten Form fällt unter „Satzanfang verrät die Lösung"', () => {
    const a = auf({ art: 'umformen', uebung: 'bilden', satz: 'My hair is pink.', anfang: 'His', vorgabe: 'über Ryan (he)', loesungen: ['His hair is pink.'] })
    expect(aufgabeMangel(a)).toMatch(/Satzanfang verrät/)
    // Fragewort als Anfang, danach Umstellung: in Ordnung
    expect(
      aufgabeMangel(
        auf({ art: 'umformen', uebung: 'bilden', satz: 'Your grandparents have lived in Bristol since 2018.', anfang: 'How long', vorgabe: 'Frage mit How long', loesungen: ['How long have your grandparents lived in Bristol?'] })
      )
    ).toBe('')
  })

  it('Sortieren nach dem Anfangswort („Don\'t …" gegen alles andere)', () => {
    const a = auf({
      art: 'sortieren',
      anweisung: 'Aufforderung oder Verbot?',
      gruppen: ['Aufforderung (tu es)', 'Verbot (tu es nicht)'],
      elemente: [
        { text: 'Sit next to Ryan.', gruppe: 0 },
        { text: 'Bring your goggles.', gruppe: 0 },
        { text: 'Be polite.', gruppe: 0 },
        { text: "Don't sit on the table.", gruppe: 1 },
        { text: "Don't forget your goggles.", gruppe: 1 },
        { text: "Don't be rude.", gruppe: 1 }
      ]
    })
    expect(moeglichkeitenVerraten(a)).toBe(true)
    // Nach der Bedeutung sortiert (Fähigkeit/Erlaubnis): kein gemeinsames Anfangswort nur einer Gruppe
    expect(
      moeglichkeitenVerraten(
        auf({
          art: 'sortieren',
          gruppen: ['Fähigkeit', 'Erlaubnis'],
          elemente: [
            { text: 'I can swim.', gruppe: 0 },
            { text: 'Ben can ride a bike.', gruppe: 0 },
            { text: 'You can use my pen.', gruppe: 1 },
            { text: 'You can go home now.', gruppe: 1 },
            { text: 'You can sing very well.', gruppe: 0 },
            { text: 'Mia can use the computer now.', gruppe: 1 }
          ]
        })
      )
    ).toBe(false)
  })
})

describe('Kurz- und Langform gleichwertig', () => {
  it('ausgeschrieben', () => {
    expect(ohneKurzformen("isn't")).toBe('is not')
    expect(ohneKurzformen("don't eat in the library")).toBe('do not eat in the library')
    expect(ohneKurzformen("can't")).toBe('cannot')
    expect(ohneKurzformen("'s not")).toBe('is not')
    expect(ohneKurzformen("it's on the sofa")).toBe('it is on the sofa')
    // has bzw. Besitz bleiben
    expect(ohneKurzformen("she's been there")).toBe("she's been there")
    expect(ohneKurzformen("emma's bike")).toBe("emma's bike")
  })

  it('beim Prüfen der Antworten', () => {
    const l = auf({ uebung: 'bilden', satz: 'Is the cat on the bed? – No, it ___.', vorgabe: '(be – not)', loesungen: ["isn't"] })
    expect(pruefeGrammatik(l, 'is not').urteil).toBe('richtig')
    expect(pruefeGrammatik(l, "'s not").urteil).toBe('richtig')
    const f = auf({ art: 'fehler', satz: 'Ryan and Ruby isn\'t in the hall.', fehlerWort: "isn't", loesungen: ["aren't"] })
    expect(pruefeGrammatik(f, 'are not', "isn't").urteil).toBe('richtig')
    const r = auf({ art: 'richtigfalsch', satz: 'Not eat in the library!', fehlerWort: 'Not', korrekt: false, loesungen: ["Don't"] })
    expect(pruefeGrammatik(r, JSON.stringify({ richtig: false, wort: 'Not', korrektur: 'Do not' })).urteil).toBe('richtig')
  })

  it('nicht, wenn die Aufgabe die Kurzform übt', () => {
    const u = auf({ art: 'umformen', anweisung: 'Schreibe den Satz mit einer Kurzform.', satz: 'It is not my pen.', loesungen: ["It isn't my pen.", "It's not my pen."] })
    expect(kurzformTolerant(u)).toBe(false)
    expect(pruefeGrammatik(u, 'It is not my pen.').urteil).toBe('falsch')
    // Ohne Hinweis in der Anweisung: Ausgangssatz unterscheidet sich nur in der Kurzform
    expect(kurzformTolerant({ ...u, anweisung: 'Schreibe den Satz anders.' })).toBe(false)
  })
})

describe('Blindprobe: Gruppe beim Sortieren', () => {
  it('erkennt den Kern des Gruppennamens', () => {
    const g = ['its (Besitz)', "it's (= it is)"]
    expect(gruppeZurAntwort(g, 'its')).toBe(0)
    expect(gruppeZurAntwort(g, "it's")).toBe(1)
    expect(gruppeZurAntwort(g, "it's (= it is)")).toBe(1)
    expect(gruppeZurAntwort(['a', 'an'], 'the')).toBe(-1)
  })
})

describe('Blindprobe: weitere Berichtigungen', () => {
  it('gleichwertige Berichtigung bzw. ganzer berichtigter Satz ist keine zweite Lösung', () => {
    const f = auf({ art: 'fehler', satz: 'Not eat in the library, please!', fehlerWort: 'Not', loesungen: ["Don't"] })
    expect(blindMehrdeutig(f, { nr: 1, text: "Don't", wort: 'Not', liste: [], richtig: false, auch: ['Do not'] })).toBe(false)
    const r = auf({ art: 'richtigfalsch', satz: 'I want an own phone.', fehlerWort: 'an', korrekt: false, loesungen: ['my'] })
    expect(blindMehrdeutig(r, { nr: 1, text: 'my', wort: 'an', liste: [], richtig: false, auch: ['I want my own phone.'] })).toBe(false)
    // Echte zweite Berichtigung bleibt ein Befund
    expect(blindMehrdeutig(r, { nr: 1, text: 'my', wort: 'an', liste: [], richtig: false, auch: ['your'] })).toBe(true)
  })

  it('„Kurzantwort" ist keine Kurzform-Übung', () => {
    const l = auf({ anweisung: 'Ergänze die verneinte Kurzantwort.', satz: 'Is the cat on the bed? – No, it ___.', vorgabe: '(be – not)', loesungen: ["isn't"] })
    expect(kurzformTolerant(l)).toBe(true)
  })
})

describe('Lückentext: Nummern vor den Lücken', () => {
  it('fallen weg – die App nummeriert selbst', () => {
    const a = auf({ art: 'lueckentext', satz: 'There (1) ___ a cat. There (2) ___ two dogs.', luecken: [{ vorgabe: '(be)', loesungen: ['is'] }, { vorgabe: '(be)', loesungen: ['are'] }] })
    expect(aufgabeNormalisiert(a).satz).toBe('There ___ a cat. There ___ two dogs.')
  })
})

describe('Nie stumm kürzen', () => {
  it('lange Sortier-Elemente bleiben ganz; zu lange lassen die Aufgabe wegfallen', () => {
    const lang = 'Du siehst schwarze Wolken am Himmel und hörst schon den Donner – es regnet aber noch nicht.'
    const sort = (t: string) => ({ id: 's', art: 'sortieren', regelId: 'r', anweisung: 'Sortiere.', satz: '', loesungen: [], gruppen: ['will', 'going to'], elemente: [{ text: t, gruppe: 1 }, { text: 'Ich glaube, er kommt.', gruppe: 0 }, { text: 'Sicher gewinnt sie.', gruppe: 0 }, { text: 'Der Bus ist schon weg.', gruppe: 1 }] })
    const p = paketBereinigt({ thema: 'x', regeln: [{ id: 'r', titel: 'R', erklaerung: 'E', beispiele: [] }], aufgaben: [sort(lang)] } as never, 'x')
    expect(p.aufgaben[0].elemente![0].text).toBe(lang)
    const q = paketBereinigt({ thema: 'x', regeln: [{ id: 'r', titel: 'R', erklaerung: 'E', beispiele: [] }], aufgaben: [sort(lang.repeat(3))] } as never, 'x')
    expect(q.aufgaben).toHaveLength(0)
  })
})
