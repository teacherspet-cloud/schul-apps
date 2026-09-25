import { describe, expect, it } from 'vitest'
import { buildTextbooks, decodeCsv, detectColumns, guessLanguage, hasHeader, parseCsvRows } from '../src/renderer/src/modules/vokabeltest/input/textbookCsv'
import { markCount, NO_MARKS, sectionCount, sectionTotal, selectionName, textbookEntries } from '../src/renderer/src/modules/vokabeltest/steps/TextbookPicker'
import { MARK_BOX, MARK_EXPLAINED, MARK_GREY } from '../src/shared/types'

const CSV = `Lehrwerk;Band;Klasse;Unit;Abschnitt;Englisch;Deutsch;Wortart;Seite
Green Line;1;5;Welcome;Check-in;hello;hallo;;8
;;;;;goodbye;auf Wiedersehen;;8
;;;Unit 1;Station 1;the classroom;das Klassenzimmer;n;20
;;;;;"to sit, sat";sitzen;v;20
;;;;Station 2;ruler;Lineal;n;24
Green Line;2;6;1;Check-in;holiday;Ferien;n;10
`

describe('Schulbuch-Vokabeln: CSV-Import', () => {
  it('erkennt Spalten, Sprache und Kodierung (Excel-CSV mit Semikolon und Windows-1252)', () => {
    const bytes = new Uint8Array([...'Englisch;Deutsch\nladder;Leiter\nbig;gro'].map((c) => c.charCodeAt(0)).concat([0xdf]))
    expect(decodeCsv(bytes)).toContain('groß')
    const rows = parseCsvRows(CSV)
    expect(hasHeader(rows[0])).toBe(true)
    const map = detectColumns(rows[0])
    expect(map).toMatchObject({ book: 0, volume: 1, grade: 2, unit: 3, section: 4, term: 5, translation: 6, pos: 7, page: 8 })
    expect(guessLanguage(rows[0], map, ['Green Line'])).toBe('en')
    expect(guessLanguage(['Unit', 'Vokabel', 'Deutsch'], { term: 1 }, ['Découvertes 2'])).toBe('fr')
  })

  it('baut Lehrwerk → Unit → Abschnitt, übernimmt leere Zellen von oben und behält die Reihenfolge', () => {
    const rows = parseCsvRows(CSV)
    const books = buildTextbooks(rows.slice(1), detectColumns(rows[0]), { language: 'en' })
    expect(books.map((b) => [b.id, b.name, b.grade])).toEqual([
      ['green-line-1', 'Green Line 1', 5],
      ['green-line-2', 'Green Line 2', 6]
    ])
    const gl1 = books[0]
    expect(gl1.units.map((u) => u.name)).toEqual(['Welcome', 'Unit 1'])
    expect(gl1.units[0].sections[0]).toMatchObject({ name: 'Check-in', entries: [{ term: 'hello' }, { term: 'goodbye' }] })
    expect(gl1.units[1].sections.map((s) => [s.name, s.entries.length])).toEqual([
      ['Station 1', 2],
      ['Station 2', 1]
    ])
    expect(gl1.units[1].sections[0].entries[1]).toEqual({ term: 'to sit, sat', translation: 'sitzen', pos: 'v', page: '20' })
    // „1“ wird zu „Unit 1“, neuer Band beginnt ohne Abschnitt des alten
    expect(books[1].units[0]).toMatchObject({ name: 'Unit 1', sections: [{ name: 'Check-in' }] })
  })

  it('übernimmt gewählte Abschnitte wie eine hineingezogene Liste und benennt den Test', () => {
    const rows = parseCsvRows(CSV)
    const [gl1] = buildTextbooks(rows.slice(1), detectColumns(rows[0]), { language: 'en' })
    const entries = textbookEntries(gl1, 'Unit 1', ['Station 2'])
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ term: 'ruler', translation: 'Lineal', note: 'S. 24' })
    expect(entries[0].id).toBeTruthy()
    expect(selectionName(gl1, 'Unit 1', ['Station 2'], ['Station 1', 'Station 2'])).toBe('Green Line 1 – Unit 1, Station 2')
    expect(selectionName(gl1, 'Unit 1', ['Station 1', 'Station 2'], ['Station 1', 'Station 2'])).toBe('Green Line 1 – Unit 1')
  })

  it('lässt Kasten- und grau gedruckte Vokabeln nach Wunsch weg', () => {
    const book = {
      id: 'x',
      name: 'X',
      language: 'en',
      importedAt: '',
      units: [
        {
          name: 'Unit 1',
          sections: [
            {
              name: 'Station 1',
              entries: [
                { term: 'castle', translation: 'Burg' },
                { term: 'moat', translation: 'Burggraben', grey: true },
                { term: 'knight', translation: 'Ritter', inBox: true },
                { term: 'drawbridge', translation: 'Zugbrücke', grey: true, inBox: true }
              ]
            }
          ]
        }
      ]
    }
    const terms = (boxes: boolean, grey: boolean): string[] =>
      textbookEntries(book, 'Unit 1', ['Station 1'], { boxes, grey, explained: true }).map((e) => e.term)
    expect(terms(true, true)).toEqual(['castle', 'moat', 'knight', 'drawbridge'])
    expect(terms(false, true)).toEqual(['castle', 'moat'])
    expect(terms(true, false)).toEqual(['castle', 'knight'])
    expect(terms(false, false)).toEqual(['castle'])

    // Die angezeigte Zahl stimmt mit der Auswahl überein, auch wenn mehrere Kennzeichnungen zusammenfallen:
    // 1 ohne Kennzeichnung, 1 nur Kasten, 1 nur grau, 1 Kasten+grau, 1 erklärt
    const meta = { name: 'Station 1', marks: [1, 1, 1, 1, 1, 0, 0, 0] }
    expect(sectionTotal(meta)).toBe(5)
    expect(markCount(meta, MARK_BOX)).toBe(2)
    expect(markCount(meta, MARK_GREY)).toBe(2)
    expect(markCount(meta, MARK_EXPLAINED)).toBe(1)
    expect(sectionCount(meta, { boxes: true, grey: true, explained: true })).toBe(5)
    expect(sectionCount(meta, { boxes: false, grey: true, explained: true })).toBe(3)
    expect(sectionCount(meta, { boxes: true, grey: false, explained: true })).toBe(3)
    expect(sectionCount(meta, NO_MARKS)).toBe(1)
  })

  it('ohne Lehrwerk-Spalte gilt der eingegebene Name', () => {
    const books = buildTextbooks(
      [
        ['Unit 3', 'Station 1', 'castle', 'Burg'],
        ['', '', 'knight', 'Ritter']
      ],
      { unit: 0, section: 1, term: 2, translation: 3 },
      { bookName: 'Access 3', language: 'en' }
    )
    expect(books[0]).toMatchObject({ id: 'access-3', name: 'Access 3' })
    expect(books[0].units[0].sections[0].entries).toHaveLength(2)
  })
})
