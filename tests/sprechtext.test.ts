import { describe, expect, it } from 'vitest'
import { ausspracheRegeln, buchstabiert, fingerabdruck, kurzGesprochen, plsLexikon, sprechText, sprechTextFuerWort, wirdBuchstabiert } from '@shared/sprechtext'
import { gitterform, spielform } from '@shared/vokabelSpiele'
import { vokItems } from '@shared/mehrspieler/inhalt'
import { vergleiche } from '@renderer/modules/onlinetest/kern'

describe('Sprechtext für Abkürzungen', () => {
  it('buchstabiert je Sprache mit Punkt und Leerzeichen', () => {
    expect(buchstabiert('YA')).toBe('Y. A.')
    expect(buchstabiert('SNCF', 'fr')).toBe('S. N. C. F.')
    expect(buchstabiert('BRD', 'de')).toBe('B. R. D.')
    expect(buchstabiert('B&B')).toBe('B. and B.')
    expect(buchstabiert('B&B', 'fr')).toBe('B. et B.')
    expect(buchstabiert('CO2', 'de')).toBe('C. O. 2')
  })

  it('Akronyme als Wort, römische Zahlen und OK bleiben', () => {
    expect(wirdBuchstabiert('NASA')).toBe(false)
    expect(kurzGesprochen('NASA')).toBe('Nasa')
    expect(kurzGesprochen('OTAN', 'fr')).toBe('Otan')
    expect(wirdBuchstabiert('XIV')).toBe(false)
    expect(wirdBuchstabiert('OK')).toBe(false)
    expect(wirdBuchstabiert('BBC')).toBe(true)
  })

  it('Kürzel und Platzhalter je Sprache ausgeschrieben', () => {
    expect(sprechText('e.g. a cat', 'en')).toBe('for example a cat')
    // Schrägstrich als Pause (09.10.2026, nie „slash")
    expect(sprechText('to point at sb/sth', 'en')).toBe('to point at somebody … something')
    expect(sprechText("to be in sb's shoes", 'en')).toBe("to be in somebody's shoes")
    expect(sprechText('Mrs Smith and Mr Brown', 'en')).toBe('Missus Smith and Mister Brown')
    expect(sprechText('jmdm. etw. schulden, z. B. Geld', 'de')).toBe('jemandem etwas schulden, zum Beispiel Geld')
    expect(sprechText('parler à qn de qc', 'fr')).toBe("parler à quelqu'un de quelque chose")
    expect(sprechText('p. ej. la casa', 'es')).toBe('por ejemplo la casa')
    expect(sprechText('It is 25 °C.', 'en')).toBe('It is 25 degrees Celsius.')
    expect(sprechText('No. 5', 'en')).toBe('number 5')
    expect(sprechText('No.', 'en')).toBe('No.')
  })

  it('Initialwörter im Satz, ohne doppelten Punkt; Angaben in Klammern bleiben', () => {
    expect(sprechText('I watch the BBC.', 'en')).toBe('I watch the B. B. C.')
    expect(sprechText('the UK is big', 'en')).toBe('the U. K. is big')
    expect(sprechText('soccer [AE]', 'en')).toBe('soccer [AE]')
    // Betonte Wörter in Großbuchstaben bleiben
    expect(sprechText('look at ME! NOBODY thinks so. OK?', 'en')).toBe('look at ME! NOBODY thinks so. OK?')
    expect(sprechText('Ich will MICH UNTER allen', 'de')).toBe('Ich will MICH UNTER allen')
    expect(sprechText('According to the WHO and the NHS', 'en')).toBe('According to the W. H. O. and the N. H. S.')
    expect(sprechText('Die BRD und die DDR', 'de')).toBe('Die B. R. D. und die D. D. R.')
    // nur Kürzel: Initialwörter übernimmt das Aussprache-Wörterbuch
    expect(sprechText('the UK, e.g. London', 'en', true)).toBe('the UK, for example London')
  })

  it('Wörter ohne Abkürzung bleiben genau, wie sie sind (vorhandene Aufnahmen gelten weiter)', () => {
    for (const w of ['house', 'to go', '(to) play', 'children [pl]', 'Hello.', 'I’m …', 'sheep (pl sheep)']) expect(sprechTextFuerWort({ term: w }, 'en')).toBe(w)
  })

  it('Vokabel-Einträge: eigene Aussprache, Tabelle, allgemeines Paar', () => {
    expect(sprechTextFuerWort({ term: 'YA (= young adults)', aussprache: 'why ay' }, 'en')).toBe('why ay')
    expect(sprechTextFuerWort({ term: 'YA (= young adults)' }, 'en')).toBe('Y. A., young adults')
    expect(sprechTextFuerWort({ term: 'Mr' }, 'en')).toBe('Mister')
    expect(sprechTextFuerWort({ term: 'degree Celsius (°C)' }, 'en')).toBe('degree Celsius')
    expect(sprechTextFuerWort({ term: 'UK – United Kingdom' }, 'en')).toBe('U. K., United Kingdom')
    expect(sprechTextFuerWort({ term: 'e.g. (= for example)' }, 'en')).toBe('for example')
    expect(sprechTextFuerWort({ term: 'Mr (= Mister)' }, 'en')).toBe('Mister')
    expect(sprechTextFuerWort({ term: 'z. B. = zum Beispiel' }, 'de')).toBe('zum Beispiel')
    expect(sprechTextFuerWort({ term: 'SNCF = Société nationale des chemins de fer français' }, 'fr')).toBe('S. N. C. F., Société nationale des chemins de fer français')
    expect(sprechTextFuerWort({ term: 'NATO = North Atlantic Treaty Organization' }, 'en')).toBe('Nato, North Atlantic Treaty Organization')
  })
})

describe('Aussprache-Wörterbuch (PLS)', () => {
  it('Regeln nur für buchstabierte Initialwörter außerhalb von Klammern', () => {
    expect(ausspracheRegeln(['The BBC and the UK.', 'NASA [AE] UK', 'soccer [AE]'], 'en')).toEqual([
      { von: 'BBC', zu: 'B. B. C.' },
      { von: 'UK', zu: 'U. K.' }
    ])
  })

  it('PLS mit Alias-Regeln, Sprache und maskierten Zeichen', () => {
    const pls = plsLexikon([{ von: 'R&D', zu: 'R. and D.' }, { von: 'YA', zu: 'Y. A.' }], 'en')
    expect(pls).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(pls).toContain('xmlns="http://www.w3.org/2005/01/pronunciation-lexicon"')
    expect(pls).toContain('xml:lang="en-GB"')
    expect(pls).toContain('<grapheme>R&amp;D</grapheme>')
    expect(pls).toContain('<grapheme>YA</grapheme>\n    <alias>Y. A.</alias>')
    expect(plsLexikon([], 'fr')).toContain('xml:lang="fr-FR"')
  })

  it('Fingerabdruck stabil und verschieden', () => {
    expect(fingerabdruck('a')).toBe(fingerabdruck('a'))
    expect(fingerabdruck('a')).not.toBe(fingerabdruck('b'))
    expect(fingerabdruck('a')).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('Spiele und Onlinetest', () => {
  it('Spiele zeigen „YA (young adults)", das Gitter die Langform', () => {
    expect(spielform('YA (= young adults)')).toBe('YA (young adults)')
    expect(spielform('UK – United Kingdom')).toBe('UK (United Kingdom)')
    expect(spielform('house')).toBe('house')
    expect(gitterform('YA (= young adults)')).toBe('YOUNGADULTS')
  })

  it('Mehrspieler: Abkürzung und Langform zählen', () => {
    const [i] = vokItems([{ id: 'a', term: 'YA (= young adults)', translation: 'Jugend-' }])
    expect(i.loesung).toBe('YA (young adults)')
    expect(i.alternativen).toEqual(expect.arrayContaining(['YA', 'young adults', 'YA = young adults']))
  })

  it('Onlinetest: Abkürzung, Langform, beides; Schreibung der Abkürzung markiert', () => {
    expect(vergleiche('YA', ['YA = young adults'])).toBe('richtig')
    expect(vergleiche('Young adults', ['YA = young adults'])).toBe('richtig')
    expect(vergleiche('YA (young adults)', ['YA = young adults'])).toBe('richtig')
    expect(vergleiche('ya', ['YA = young adults'])).toBe('nurGross')
    expect(vergleiche('old people', ['YA = young adults'])).toBe('falsch')
    expect(vergleiche('personal computer', ['PC'])).toBe('richtig')
    expect(vergleiche('to give somebody something', ['to give sb sth'])).toBe('richtig')
    expect(vergleiche('house', ['house'])).toBe('richtig')
  })
})
