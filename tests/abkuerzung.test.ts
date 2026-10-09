import { describe, expect, it } from 'vitest'
import { abkuerzungAllgemein, abkuerzungAus, abkUeben, abkVergleich, abkSpiel, abkVoll, antwortTeile, platzhalterNormal } from '@shared/abkuerzung'
import { abkEintrag, TABELLEN } from '@shared/abkuerzungen'
import {
  abkUebungFuer,
  abrufUebungFuer,
  bewerte,
  bewerteMitAuchRichtig,
  ERKENNEN,
  nachAbfrage,
  neuerStand,
  satzMitLuecke,
  uebungFuer,
  type Vokabel,
  type WortStand
} from '@shared/vokabeltrainer'

const stand = (x: Partial<WortStand>): WortStand => ({ ...neuerStand(), ...x })
const vok = (term: string, translation = 'x'): Vokabel => ({ id: 'w', term, translation })

describe('Abkürzungen erkennen (allgemeine Regeln)', () => {
  it.each([
    ['YA = young adults', 'YA', 'young adults'],
    ['e.g. (= for example)', 'e.g.', 'for example'],
    ['sb. = somebody', 'sb.', 'somebody'],
    ['UK – United Kingdom', 'UK', 'United Kingdom'],
    ['Mr (= Mister)', 'Mr', 'Mister'],
    ['approx. = approximately', 'approx.', 'approximately'],
    ['z. B. = zum Beispiel', 'z. B.', 'zum Beispiel'],
    ['UK (United Kingdom)', 'UK', 'United Kingdom'],
    ['young adults (YA)', 'YA', 'young adults'],
    ['for example (= e.g.)', 'e.g.', 'for example'],
    ['km = kilometre', 'km', 'kilometre'],
    ['SNCF = Société nationale des chemins de fer français', 'SNCF', 'Société nationale des chemins de fer français'],
    ['BRD = Bundesrepublik Deutschland', 'BRD', 'Bundesrepublik Deutschland']
  ])('%s', (text, kurz, lang) => {
    expect(abkuerzungAllgemein(text)).toMatchObject({ kurz, lang })
  })

  it('Angaben in eckigen Klammern sind Rest', () => {
    expect(abkuerzungAllgemein('CV (= curriculum vitae) [BE]')).toEqual({ kurz: 'CV', lang: 'curriculum vitae', rest: '[BE]' })
  })

  it.each([
    'big = large',
    'fast = quick',
    'flat (BE)',
    '(to) play',
    'children (pl)',
    'sheep (pl sheep)',
    'to be keen on sth. = to like sth.',
    'gonna (= going to) [coll]',
    'gotta (= got to)',
    "ain't (= isn't/aren't)",
    "we're (= we are)",
    'That\'s … (= that is)',
    "I'd like to … (= I would like to)",
    'tis (= it is)',
    'dis (= this)',
    'fella (= fellow)',
    'doth (= does)',
    'Hello. = Hallo.',
    'to look forward – sich freuen',
    'OK – in Ordnung',
    'a = b = c',
    'house'
  ])('keine Abkürzung: %s', (text) => {
    expect(abkuerzungAllgemein(text)).toBeNull()
  })

  it('Anzeige', () => {
    const e = abkuerzungAus('YA (= young adults)')!
    expect(abkVoll(e)).toBe('YA = young adults')
    expect(abkSpiel(e)).toBe('YA (young adults)')
  })

  it('Antwort in zwei Teilen', () => {
    expect(antwortTeile('YA = young adults')).toEqual(['YA', 'young adults'])
    expect(antwortTeile('young adults (YA)')).toEqual(['young adults', 'YA'])
    expect(antwortTeile('YA – young adults')).toEqual(['YA', 'young adults'])
    expect(antwortTeile('young adults')).toBeNull()
  })
})

describe('Tabelle Green Line', () => {
  it('geht vor den allgemeinen Regeln', () => {
    // „PC" hat im Buch keine Langform – kein Paar
    expect(abkuerzungAus('PC')).toBeNull()
    expect(abkuerzungAus('Mr')).toBeNull()
    // „extra large (XL)" erkennt die allgemeine Regel nicht (X ≠ e) – die Tabelle schon
    expect(abkuerzungAllgemein('extra large (XL)')).toBeNull()
    expect(abkuerzungAus('extra large (XL)')).toMatchObject({ kurz: 'XL', lang: 'extra large' })
    expect(abkuerzungAus('metre (m)')).toMatchObject({ kurz: 'm', lang: 'metre' })
    expect(abkuerzungAus('the US (= the United States)')).toMatchObject({ kurz: 'the US', lang: 'the United States' })
  })

  it('Übungen je Eintrag', () => {
    expect(abkUeben('GCSE (= General Certificate of Secondary Education)')).toBe('aufloesen')
    expect(abkUeben('YA (= young adults)')).toBe('beide')
    expect(abkUeben('PC')).toBe('keine')
    expect(abkUeben('NATO = North Atlantic Treaty Organization')).toBe('beide')
  })

  it('jeder Eintrag ist vollständig und eindeutig', () => {
    const gesehen = new Set<string>()
    for (const t of TABELLEN)
      for (const x of t.eintraege) {
        expect(x.kurz && x.aussprache, x.term).toBeTruthy()
        expect(gesehen.has(x.term), x.term).toBe(false)
        gesehen.add(x.term)
        if (x.ueben !== 'keine') expect(x.lang, x.term).toBeTruthy()
      }
    expect(abkEintrag('YA (= young adults)')?.aussprache).toBe('Y. A., young adults')
  })
})

describe('Antworten prüfen', () => {
  const ya = 'YA (= young adults)'
  it.each(['YA', 'young adults', 'Young Adults', 'YA = young adults', 'YA (young adults)', 'young adults (YA)', 'YA - young adults'])('richtig: %s', (a) => {
    const r = bewerte(a, ya)
    expect(r.urteil).toBe('richtig')
    expect(r.richtig).toBe('YA = young adults')
  })

  it('kleingeschriebene Abkürzung zählt, die Rückmeldung nennt die Schreibweise', () => {
    const r = bewerte('ya', ya)
    expect(r.urteil).toBe('richtig')
    expect(r.hinweis).toContain('„YA“')
  })

  it('Tippfehler in der Langform: fast; falsche Abkürzung: falsch', () => {
    expect(bewerte('young adlts', ya).urteil).toBe('fast')
    expect(bewerte('YO', ya).urteil).toBe('falsch')
    expect(bewerte('YA = old people', ya).urteil).toBe('falsch')
    expect(bewerte('', ya).urteil).toBe('falsch')
  })

  it('Punkt-Abkürzungen ohne Punkte', () => {
    expect(bewerte('eg', 'e.g. (= for example)').urteil).toBe('richtig')
    expect(bewerte('for example', 'e.g. (= for example)').urteil).toBe('richtig')
    expect(bewerte('zum Beispiel', 'z. B. = zum Beispiel').urteil).toBe('richtig')
  })

  it('weitere richtige Antworten aus der Tabelle und von der Lehrkraft', () => {
    expect(bewerte('personal computer', 'PC').urteil).toBe('richtig')
    expect(bewerte('Mr.', 'Mr').urteil).toBe('richtig')
    expect(bewerte('somebody else', 'PC').urteil).toBe('falsch')
    expect(bewerteMitAuchRichtig('telly', 'TV (= television)', ['telly']).urteil).toBe('richtig')
    expect(bewerteMitAuchRichtig('telly', 'TV (= television)', ['telly']).richtig).toBe('TV = television')
  })

  it('Platzhalter sb/sth zählen ausgeschrieben', () => {
    expect(bewerte('to point at somebody/something', 'to point at sb/sth').urteil).toBe('richtig')
    expect(bewerte('to give someone something', 'to give sb sth').urteil).toBe('richtig')
    expect(bewerte('to give sb. sth.', 'to give sb sth').urteil).toBe('richtig')
    expect(bewerte('jemandem etwas schulden', 'jmdm. etw. schulden').urteil).toBe('richtig')
    expect(platzhalterNormal('sb’s')).toBe(platzhalterNormal("somebody's"))
  })

  it('Onlinetest: streng, Groß-/Kleinschreibung der Abkürzung markiert', () => {
    const e = abkuerzungAus(ya)!
    expect(abkVergleich('YA', e)).toBe('genau')
    expect(abkVergleich('Young adults', e)).toBe('genau')
    expect(abkVergleich('young adults (YA)', e)).toBe('genau')
    expect(abkVergleich('ya', e)).toBe('schreibweise')
    expect(abkVergleich('young adutls', e)).toBeNull()
  })

  it('Übungen „Abkürzung schreiben" und „auflösen"', async () => {
    const { bewerteAbkuerzung } = await import('@shared/vokabeltrainer')
    const e = abkuerzungAus(ya)!
    expect(bewerteAbkuerzung('YA', e, 'kurz').urteil).toBe('richtig')
    expect(bewerteAbkuerzung('young adults', e, 'kurz').urteil).toBe('falsch')
    expect(bewerteAbkuerzung('young adults', e, 'lang').urteil).toBe('richtig')
    expect(bewerteAbkuerzung('YA', e, 'lang').urteil).toBe('falsch')
    expect(bewerteAbkuerzung('YA = young adults', e, 'lang').urteil).toBe('richtig')
  })
})

describe('Übungsauswahl', () => {
  const ya = vok('YA (= young adults)', 'Jugend-')
  it('nur für Abkürzungen und nicht beim ersten Kontakt', () => {
    expect(abkUebungFuer(stand({ fach: 2, versuche: 3 }), vok('house'), 0.99)).toBeNull()
    expect(abkUebungFuer(stand({ fach: 0, versuche: 0 }), ya, 0.99)).toBeNull()
    expect(abkUebungFuer(stand({ fach: 2, versuche: 3 }), vok('PC'), 0.99)).toBeNull()
  })
  it('Richtung nach Fach und Tabelle', () => {
    expect(abkUebungFuer(stand({ fach: 1, versuche: 1 }), ya, 0.9)).toBe('abkKurz')
    expect(abkUebungFuer(stand({ fach: 3, versuche: 5 }), ya, 0.9)).toBe('abkLang')
    expect(abkUebungFuer(stand({ fach: 3, versuche: 5 }), ya, 0.5)).toBeNull()
    expect(abkUebungFuer(stand({ fach: 1, versuche: 1 }), vok('GCSE (= General Certificate of Secondary Education)'), 0.9)).toBe('abkLang')
  })
  it('gemischt in die Runden, ohne die übrigen Übungen zu verändern', () => {
    expect(uebungFuer(stand({ fach: 3, versuche: 5 }), ya, 0.5, 0.9)).toBe('abkLang')
    expect(uebungFuer(stand({ fach: 3, versuche: 5 }), vok('house'), 0.5, 0.9)).toBe('frei')
    expect(uebungFuer(stand({ fach: 0, versuche: 0 }), ya, 0.5, 0.99)).toBe('karte')
    const u = abrufUebungFuer(stand({ fach: 1, versuche: 1 }), ya, 0.5, 0.9)
    expect(u).toBe('abkKurz')
    expect(ERKENNEN.includes(u)).toBe(false)
  })
  it('zählt wie eine Schreibübung (rückt über Fach 2 hinaus)', () => {
    const st = nachAbfrage(stand({ fach: 2, versuche: 3 }), 'abkLang', 'richtig', 'young adults', 1_000_000)
    expect(st.fach).toBe(3)
    expect(st.frei).toEqual([])
  })
  it('Lückensatz findet Langform oder Abkürzung als ganzes Wort', () => {
    expect(satzMitLuecke('She loves YA novels.', 'YA (= young adults)')?.loesung).toBe('YA')
    expect(satzMitLuecke('The player is good.', 'YA (= young adults)')).toBeNull()
    expect(satzMitLuecke('Books for young adults are popular.', 'YA (= young adults)')?.loesung).toBe('young adults')
  })
})
