import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import type { Textbook } from '../src/shared/types'
// @ts-expect-error – reines Skript ohne Typen
import { bookFromCode, guessPos, parseGreenLine, splitLesson } from '../scripts/greenline-parse.mjs'
import { textbookEntries } from '../src/renderer/src/modules/vokabeltest/steps/TextbookPicker'

/** Zeilen wie in den Excel-Dateien: Englisch, Anmerkung, Deutsch, Vokabellektion, Kontext, Übersetzung, Merkhilfe */
const ROWS = [
  ['year', '', 'Jahr', 'GL1 - Unit 1 - Check-in', 'This is my first year.', 'Dies ist mein erstes Jahr.', ''],
  ['us', '', 'uns', 'GL1 - Unit 1 - Check-in', '', '', ''],
  ['friend', 'Br. E.', 'Freund', 'GL1 - Unit 1 - Station 1', '', '', ''],
  ['blog', '', 'Blog', 'GL1 - Media smart', '', '', '']
]

const BOX_ROWS = [['one', '', 'eins', 'GL1 - Unit 1 - Check-in - Numbers 0-12', '', '', '']]

describe('Green Line: Aufbau der Vokabellisten', () => {
  it('zerlegt die Spalte „Vokabellektion“ in Band, Unit, Abschnitt und Kasten', () => {
    expect(splitLesson('GL1 - Unit 2 - Station 1')).toEqual({
      code: 'GL1',
      unit: 'Unit 2',
      section: 'Station 1',
      box: ''
    })
    // Sonderteile ohne Abschnitt bekommen einen Sammelabschnitt
    expect(splitLesson('GL1 - Media smart')).toEqual({
      code: 'GL1',
      unit: 'Media smart',
      section: 'Wortschatz',
      box: ''
    })
    expect(splitLesson('GL1 - Hello - Station 1 - Numbers 0-12')).toEqual({
      code: 'GL1',
      unit: 'Hello',
      section: 'Station 1',
      box: 'Numbers 0-12'
    })
    expect(splitLesson('GL1')).toBeNull()
    expect(bookFromCode('GL1')).toMatchObject({
      id: 'green-line-1',
      name: 'Green Line 1',
      grade: 5
    })
  })

  it('baut Units und Abschnitte in der Reihenfolge des Buches und markiert Kasten-Vokabeln', () => {
    const book = parseGreenLine(ROWS, BOX_ROWS) as Textbook
    expect(book.id).toBe('green-line-1')
    expect(book.units.map((u) => u.name)).toEqual(['Unit 1', 'Media smart'])
    const checkIn = book.units[0].sections.find((s) => s.name === 'Check-in')!
    expect(checkIn.entries.map((e) => e.term)).toEqual(['year', 'us', 'one'])
    expect(checkIn.entries[0]).toMatchObject({
      translation: 'Jahr',
      pos: 'noun',
      example: 'This is my first year.',
      exampleTranslation: 'Dies ist mein erstes Jahr.'
    })
    // Anmerkung und Kastenname landen in der Notiz
    expect(book.units[0].sections[1].entries[0].note).toBe('Br. E.')
    expect(checkIn.entries[2]).toMatchObject({
      inBox: true,
      note: 'Kasten: Numbers 0-12'
    })
  })

  it('lässt Kasten-Vokabeln weg, wenn sie nicht zugeschaltet sind', () => {
    const book = parseGreenLine(ROWS, BOX_ROWS) as Textbook
    expect(
      textbookEntries(book, 'Unit 1', ['Check-in'], {
        boxes: true,
        grey: true,
        explained: true
      }).map((e) => e.term)
    ).toEqual(['year', 'us', 'one'])
    expect(
      textbookEntries(book, 'Unit 1', ['Check-in'], {
        boxes: false,
        grey: true,
        explained: true
      }).map((e) => e.term)
    ).toEqual(['year', 'us'])
    // Der Kasten gehört zu „Check-in“, nicht zur Unit insgesamt: Station 1 bleibt unberührt
    expect(
      textbookEntries(book, 'Unit 1', ['Station 1'], {
        boxes: true,
        grey: true,
        explained: true
      }).map((e) => e.term)
    ).toEqual(['friend'])
  })

  it('nimmt den Beispielsatz des Buches als Beispiel/Hinweis mit in die Vokabel', () => {
    const book = parseGreenLine(ROWS, BOX_ROWS) as Textbook
    const [year] = textbookEntries(book, 'Unit 1', ['Check-in'], {
      boxes: false,
      grey: true,
      explained: true
    })
    expect(year.note).toBe('This is my first year.')
    expect(year.pos).toBe('noun')
    // Anmerkung, Kastenname und Beispielsatz stehen zusammen in einem Feld
    const one = textbookEntries(book, 'Unit 1', ['Check-in'], {
      boxes: true,
      grey: true,
      explained: true
    })[2]
    expect(one.note).toBe('Kasten: Numbers 0-12')
    expect(
      textbookEntries(book, 'Unit 1', ['Station 1'], {
        boxes: false,
        grey: true,
        explained: true
      })[0].note
    ).toBe('Br. E.')
  })

  it('erschließt die Wortart aus Wort und Übersetzung', () => {
    // Verben am „to", Zahlwörter an der Ziffer, Substantive am großen Anfangsbuchstaben im Deutschen
    expect(guessPos('to look at', 'anschauen, ansehen')).toBe('verb')
    expect(guessPos('twenty', '20, zwanzig')).toBe('number')
    expect(guessPos('power socket', 'Steckdose')).toBe('noun')
    expect(guessPos('Monday', 'Montag')).toBe('noun')
    expect(guessPos('home', 'Zuhause, Heim')).toBe('noun')
    expect(guessPos('home', 'nach Hause')).toBe('adverb')
    // Sprachbezeichnungen sind im Deutschen kleingeschrieben, wenn sie als Adjektiv stehen
    expect(guessPos('English', 'englisch, Englisch, aus England')).toBe('adjective')
    expect(guessPos('ugly', 'hässlich')).toBe('adjective')
    expect(guessPos('really', 'wirklich')).toBe('adverb')
    expect(guessPos('we’re (= we are)', 'wir sind')).toBe('verb')
    expect(guessPos('he', 'er')).toBe('pronoun')
    expect(guessPos('next to', 'neben')).toBe('preposition')
    expect(guessPos('because', 'weil, da')).toBe('conjunction')
    expect(guessPos('It’s … turn.', '… ist dran.')).toBe('phrase')
    expect(guessPos('go to the cinema', 'ins Kino gehen')).toBe('phrase')
  })
})

describe('mitgelieferte Green-Line-Bände', () => {
  const bands: [string, string, number][] = [
    ['green-line-1', 'Green Line 1', 5],
    ['green-line-2', 'Green Line 2', 6],
    ['green-line-3', 'Green Line 3', 7],
    ['green-line-4', 'Green Line 4', 8],
    ['green-line-5', 'Green Line 5', 9],
    ['green-line-6', 'Green Line 6', 10],
    ['green-line-transition', 'Green Line Transition', 11]
  ]

  it('liefert alle Bände mit Jahrgang, Bundesland und Schulform', () => {
    for (const [id, name, grade] of bands) {
      const file = resolve(`resources/lehrwerke/${id}.json`)
      expect(existsSync(file), id).toBe(true)
      const book = JSON.parse(readFileSync(file, 'utf8')) as Textbook
      expect(book.name).toBe(name)
      // Green Line 1 → Klasse 5, Green Line 4 → Klasse 8, Transition → Klasse 11
      expect(book.grade, name).toBe(grade)
      expect(book.stateId).toBe('NI')
      expect(book.schoolTypeId).toBe('gymnasium')
      expect(book.language).toBe('en')
      const entries = book.units.flatMap((u) => u.sections.flatMap((s) => s.entries))
      expect(entries.length, name).toBeGreaterThan(400)
      expect(entries.every((e) => e.term.trim() && e.translation.trim() && e.pos)).toBe(true)
      // Grau gilt für Vokabeln ohne Kontextsatz (scripts/grey-without-example.mjs) sowie für
      // die von Hand nachgetragenen. Jede graue Vokabel muss also entweder ohne Beispielsatz
      // dastehen oder als Handarbeit gekennzeichnet sein.
      for (const e of entries.filter((x) => x.grey)) {
        const abgeleitet = e.greyBy === 'ohne-beispiel'
        expect(abgeleitet ? !e.example?.trim() : true, `${name}: ${e.term}`).toBe(true)
      }
      /*
       * Umgekehrt ist keine Vokabel ohne Beispielsatz übrig geblieben – AUSSER den
       * Kastenwörtern. Zu denen steht in den Verlagslisten fast nie ein Kontextsatz; die
       * Regel darüber laufen zu lassen, färbte sie fast vollständig grau und machte damit
       * den Schalter „Vokabeln aus Kästen einbeziehen" wirkungslos (Green Line 1, Unit 1:
       * mit und ohne Kästen dieselben 134 Wörter).
       */
      expect(
        entries.filter((e) => !e.example?.trim() && !e.grey && !e.inBox),
        name
      ).toHaveLength(0)
    }
  })
})

describe('mitgeliefertes Lehrwerk Green Line 1', () => {
  const file = resolve('resources/lehrwerke/green-line-1.json')

  it('enthält alle Units des Bandes mit Kasten-Vokabeln', () => {
    expect(existsSync(file)).toBe(true)
    const book = JSON.parse(readFileSync(file, 'utf8')) as Textbook
    expect(book.name).toBe('Green Line 1')
    expect(book.language).toBe('en')
    const entries = book.units.flatMap((u) => u.sections.flatMap((s) => s.entries))
    expect(entries).toHaveLength(1282)
    // Kennzeichnungen aus der bearbeiteten Fassung der Lehrkraft (scripts/apply-textbook-marks.mjs)
    expect(entries.filter((e) => e.inBox)).toHaveLength(414)
    /*
     * 227 grau: die von Hand gesetzten Markierungen der Lehrkraft plus die Wörter ohne
     * Kontextsatz, die NICHT in einem Kasten stehen. Vorher waren es 507 – die zusätzlichen
     * 280 waren Kastenwörter, die die Regel zu Unrecht erfasst hatte
     * (scripts/grey-without-example.mjs --kaesten hat sie zurückgenommen).
     */
    expect(entries.filter((e) => e.grey)).toHaveLength(227)
    // Kein Kastenwort ist über die Beispielsatz-Regel grau geworden
    expect(entries.filter((e) => e.inBox && e.greyBy === 'ohne-beispiel')).toHaveLength(0)
    // Nur noch 25: Von den 305 standen 280 in einem Kasten und sind damit zu Unrecht erfasst gewesen
    expect(entries.filter((e) => e.greyBy === 'ohne-beispiel')).toHaveLength(25)
    // Die von Hand gesetzten bleiben auch dann grau, wenn ein Beispielsatz vorliegt
    expect(entries.filter((e) => e.grey && !e.greyBy && e.example?.trim()).length).toBeGreaterThan(0)
    // Grau gedruckte Wörter sind nicht vorausgewählt – sie müssen nicht gelernt werden
    expect(textbookEntries(book, 'Unit 1', ['Station 2']).every((e) => e.include !== false || e.grey)).toBe(true)
    // Auftaktteil, vier Units und die Sonderteile
    expect(book.units.map((u) => u.name)).toEqual([
      'Hello',
      'Unit 1',
      'Media smart',
      'Unit 2',
      'Across cultures 1',
      'Unit 3',
      'Across cultures 2',
      'Unit 4',
      'Trailer'
    ])
    // Jede Vokabel hat Wort, Übersetzung und eine erschlossene Wortart
    expect(entries.every((e) => e.term.trim() && e.translation.trim() && e.pos)).toBe(true)
    // Der Kontextsatz aus der Datei ist als Beispiel mitgekommen
    expect(entries.filter((e) => e.example).length).toBeGreaterThan(700)

    // Kasten-Vokabeln hängen immer an einem Abschnitt, nie an der Unit als Ganzes
    for (const unit of book.units) {
      for (const section of unit.sections) {
        if (!section.entries.some((e) => e.inBox)) continue
        expect(section.name).not.toBe(unit.name)
      }
    }
  })
})
