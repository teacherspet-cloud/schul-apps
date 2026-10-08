import { describe, expect, it } from 'vitest'
import { musterFuer, personAus, pruefeHoertext, schuetzeAnfrage, schuetzeText, stelleWiederHer } from '../src/server/namensfilter'

/*
 * Namensschutz (02.10.2026) – Bedingung der Lehrkraft: Klarnamen von Lehrkräften und Schülern
 * gehen NIE an eine KI; fiktive Namen (Hörtexte) sind erlaubt; die Lehrkraft sieht alles in Klarnamen.
 */
const schule = musterFuer([
  personAus('Torge Kornahrens', 't.kornahrens')!,
  personAus('Lena Koch', 'lena.koch')!,
  personAus('Ayşe Yılmaz', 'ayse.yilmaz')!
])
const req = (user: string, system = 'Du schreibst Elternbriefe.') => ({ system, user, schemaName: 'x', schema: {} })

describe('Ersetzen vor der KI', () => {
  it('voller Name, umgedreht, Anrede, Initiale, Benutzername, Nachname allein', () => {
    const { req: r, z } = schuetzeAnfrage(
      req('Torge Kornahrens schreibt an Herrn Kornahrens. Kornahrens, Torge; T. Kornahrens; Mail t.kornahrens; Kornahrens kommt.'),
      schule
    )
    expect(r.user).not.toMatch(/Kornahrens|Torge|t\.kornahrens/)
    expect(r.user).toContain('[Person-1]')
    expect(z.anzahl).toBe(6)
    expect(r.system).toContain('Platzhalter')
  })
  it('Umlaute und Sonderzeichen; mehrere Personen bekommen verschiedene Platzhalter', () => {
    const { req: r } = schuetzeAnfrage(req('Ayşe Yılmaz und Torge Kornahrens'), schule)
    expect(r.user).toMatch(/^\[Person-(\d)\] und \[Person-(?!)\d\]$/)
  })
  it('Nachnamen, die gewöhnliche Wörter sind, allein NICHT – aber mit Vorname/Anrede schon', () => {
    const { req: r } = schuetzeAnfrage(req('Der Koch kocht. Frau Koch kommt. Lena Koch auch.'), schule)
    expect(r.user).toBe('Der Koch kocht. [Person-1] kommt. [Person-1] auch.')
  })
  it('fiktive Namen und Vornamen allein bleiben (Hörtexte)', () => {
    const { req: r, z } = schuetzeAnfrage(req('Anna: Hi Ben! Lena and Torge are late.'), schule)
    expect(r.user).toBe('Anna: Hi Ben! Lena and Torge are late.')
    expect(z.anzahl).toBe(0)
  })
  it('keine Teiltreffer in längeren Wörtern', () => {
    const { req: r } = schuetzeAnfrage(req('Die Kornahrensstraße ist lang.'), schule)
    expect(r.user).toBe('Die Kornahrensstraße ist lang.')
  })
})

describe('Wiedereinsetzen in der Antwort', () => {
  it('auch ohne Klammern und tief im JSON', () => {
    const { z } = schuetzeAnfrage(req('Torge Kornahrens'), schule)
    expect(stelleWiederHer({ brief: 'Mit freundlichen Grüßen, [Person-1]', liste: ['Person-1'] }, z)).toEqual({ brief: 'Mit freundlichen Grüßen, Torge Kornahrens', liste: ['Torge Kornahrens'] })
  })
  it('Websuche und Bildauftrag', () => {
    const { text, z } = schuetzeText('Foto von Lena Koch', schule)
    expect(text).toBe('Foto von [Person-1]')
    expect(stelleWiederHer('[Person-1]', z)).toBe('Lena Koch')
  })
})

describe('Sprachausgabe', () => {
  it('echte Namen sperren, fiktive durchlassen', () => {
    expect(() => pruefeHoertext({ id: 'a', turns: [{ voiceId: 'v', text: 'Hello, Mr Kornahrens!' }] }, schule)).toThrow(/echten Person/)
    expect(() => pruefeHoertext({ id: 'a', turns: [{ voiceId: 'v', text: 'Hello, Mr Smith! Hi Lena.' }] }, schule)).not.toThrow()
  })
})

describe('Namen zerlegen', () => {
  it('„Vorname Nachname" und „Nachname, Vorname"', () => {
    expect(personAus('Max von Mustermann')).toEqual({ vorname: 'Max von', nachname: 'Mustermann', benutzer: undefined })
    expect(personAus('Mustermann, Max')).toEqual({ vorname: 'Max', nachname: 'Mustermann', benutzer: undefined })
  })
})

/*
 * Klassenliste der Anfrage (08.10.2026): Namen der Lernenden auch einzeln und auch, wenn sie Wörter sind – ob die
 * Person gemeint ist, entscheidet personOderWort.ts lokal; die Antwort der KI bekommt die Klarnamen zurück.
 */
describe('Klassenliste: Person oder Wort, Ersetzen und Wiederherstellen', () => {
  const klasse = (namen: string[], sprache?: string, material?: string) =>
    musterFuer(
      namen.map((n) => ({ ...personAus(n)!, streng: true })),
      { sprache, material }
    )

  it('Gast „Rose": im Satz über die Person ersetzt, die Blume bleibt – Rundweg mit Wiederherstellen', () => {
    const m = klasse(['Rose', 'Ben', 'Mia'], 'de')
    const { req: r, z } = schuetzeAnfrage(req('Ich habe mit Rose gelernt. Die Rose blüht. Ben und Mia lachen.'), m)
    expect(r.user).toBe('Ich habe mit [Person-1] gelernt. Die Rose blüht. [Person-2] und [Person-3] lachen.')
    const antwort = stelleWiederHer({ feedback: '[Person-1] hat mit [Person-2] gut gearbeitet.' }, z)
    expect(antwort.feedback).toBe('Rose hat mit Ben gut gearbeitet.')
  })

  it('Vokabeltest: „rose" als Vokabel bleibt (Material), die Mitschülerin wird ersetzt', () => {
    const m = klasse(['Rose Klein'], 'en', 'Translate: die Rose → rose')
    const { req: r } = schuetzeAnfrage(req('Antwort A1: rose\nAntwort A2: I like Rose Klein'), m)
    expect(r.user).toBe('Antwort A1: rose\nAntwort A2: I like [Person-1]')
  })

  it('Otto, Sankt Martin, Mark: Wörter bleiben, Personen nicht', () => {
    const m = klasse(['Otto Berg', 'Martin Fuchs', 'Mark Weber'], 'de')
    const { req: r } = schuetzeAnfrage(
      req('Der Ottomotor ist alt. Zu Sankt Martin gab es Laternen. Das kostete 5 Mark. Otto sagt, Martin hat recht, und Mark fragt.'),
      m
    )
    expect(r.user).toContain('Der Ottomotor ist alt.')
    expect(r.user).toContain('Sankt Martin')
    expect(r.user).toContain('5 Mark')
    expect(r.user).not.toMatch(/Otto sagt|Martin hat|Mark fragt/)
  })

  it('Russisch mit Fallformen und kurze Namen', () => {
    const m = klasse(['Мартин', 'Роза', 'Ян'], 'ru')
    const { req: r } = schuetzeAnfrage(req('Я гуляю с Мартином и Розой. Красная роза. Ян говорит.'), m)
    expect(r.user).not.toMatch(/Мартин|Розой|Ян говорит/)
    expect(r.user).toContain('Красная роза')
  })

  it('Nachprüfung zählt nur Vorkommen, die eine Person meinen (kein Sperren wegen der Blume)', () => {
    const m = klasse(['Rose'], 'de')
    expect(() => schuetzeText('Die Rose blüht.', m)).not.toThrow()
    expect(schuetzeText('Die Rose blüht.', m).text).toBe('Die Rose blüht.')
  })

  it('Hörtext: eine Person der Klassenliste sperrt, die Blume nicht', () => {
    const m = klasse(['Rose'], 'de')
    const tts = (text: string) => ({ turns: [{ speaker: 'A', text }] }) as never
    expect(() => pruefeHoertext(tts('Die Rose blüht im Garten.'), m)).not.toThrow()
    expect(() => pruefeHoertext(tts('Hallo Rose, wie geht es dir?'), m)).toThrow()
  })
})
