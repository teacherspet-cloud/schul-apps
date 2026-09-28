import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { fragenAusBlatt, fragenAusVokabeln, lueckenTeile, type LmsFrage } from '../src/renderer/src/shared/export/lms/fragen'
import { giftText, h5pInhalt, moodleXml } from '../src/renderer/src/shared/export/lms/formate'
import { h5pPaket } from '../src/renderer/src/shared/export/lms/LmsExport'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock, Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { sampleWorksheet } from './worksheetExport.test'

/*
 * Export in Lernplattformen (Großprogramm 0.4, F5): Aufgaben → Moodle-XML, GIFT, H5P; was nicht
 * geht, steht mit Grund im Bericht.
 */
const aufgabe = (answer: Partial<TaskBlock['answer']>, instruction = 'Aufgabe'): TaskBlock => {
  const t = newBlock('task') as TaskBlock
  return { ...t, instruction, answer: { ...t.answer, ...answer } as TaskBlock['answer'] }
}

const blatt = (): Worksheet => {
  const ws = sampleWorksheet()
  ws.sheets = [
    {
      id: 's',
      label: 'Blatt',
      blocks: [
        aufgabe({ kind: 'multipleChoice', options: ['Licht', 'Dunkelheit', 'Wasser'], correct: [0, 2] }, '**Kreuze an:** Was braucht die Pflanze?'),
        aufgabe(
          {
            kind: 'trueFalse',
            statements: [
              { text: 'Pflanzen atmen.', isTrue: true },
              { text: 'Zucker ist grün.', isTrue: false }
            ]
          },
          'Richtig oder falsch?'
        ),
        aufgabe({ kind: 'matching', left: ['CO₂', 'O₂'], right: ['Sauerstoff', 'Kohlenstoffdioxid'], pairs: [1, 0] }, 'Ordne zu.'),
        aufgabe({ kind: 'gapText', gapText: 'Pflanzen bilden [[Zucker|Glucose]] aus [[Wasser]].' }, 'Ergänze.'),
        aufgabe({ kind: 'lines', count: 4 }, 'Erkläre die Fotosynthese.'),
        aufgabe({ kind: 'ordering', items: ['a', 'b'], displayOrder: [1, 0] }, 'Ordne.')
      ]
    }
  ] as never
  return ws
}

/** Wohlgeformtheit ohne DOM: Tags außerhalb von CDATA müssen sich schließen */
function wohlgeformt(x: string): boolean {
  const ohne = x.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<\?xml[^>]*\?>/, '')
  const stapel: string[] = []
  for (const m of ohne.matchAll(/<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g)) {
    if (m[3]) continue
    if (m[1]) {
      if (stapel.pop() !== m[2]) return false
    } else stapel.push(m[2])
  }
  return stapel.length === 0 && !/&(?!amp;|lt;|gt;|quot;|#\d+;)/.test(ohne)
}

describe('Lernplattform', () => {
  it('übernimmt Auswahl, Richtig/Falsch, Zuordnung, Lückentext und freie Antworten; Reihenfolge mit Grund übersprungen', () => {
    const b = fragenAusBlatt(blatt())
    expect(b.fragen.map((f) => f.art)).toEqual(['mc', 'wf', 'wf', 'zuordnung', 'lueckentext', 'freitext'])
    expect(b.uebersprungen).toEqual([{ titel: 'Aufgabe 6', grund: expect.stringMatching(/Plugin/) }])
    const mc = b.fragen[0] as Extract<LmsFrage, { art: 'mc' }>
    expect(mc.frage).toBe('Kreuze an: Was braucht die Pflanze?')
    expect(mc.optionen.filter((o) => o.richtig).map((o) => o.text)).toEqual(['Licht', 'Wasser'])
    expect((b.fragen[3] as Extract<LmsFrage, { art: 'zuordnung' }>).paare[0]).toEqual({ links: 'CO₂', rechts: 'Kohlenstoffdioxid' })
  })

  it('Lückentext mit Alternativen', () => {
    expect(lueckenTeile('A [[x|y]] B')).toEqual([{ text: 'A ' }, { luecke: ['x', 'y'] }, { text: ' B' }])
  })

  it('Moodle-XML: wohlgeformt, alle Fragearten, Mehrfachauswahl mit Teilpunkten, Cloze', () => {
    const xml = moodleXml(fragenAusBlatt(blatt()).fragen, 'Fotosynthese & Co')
    expect(wohlgeformt(xml)).toBe(true)
    for (const typ of ['multichoice', 'truefalse', 'matching', 'cloze', 'essay']) expect(xml).toContain(`type="${typ}"`)
    expect(xml).toContain('<single>false</single>')
    expect(xml).toContain('fraction="50"')
    expect(xml).toContain('{1:SHORTANSWER:=Zucker~=Glucose}')
    expect(xml).toContain('Fotosynthese &amp; Co')
  })

  it('GIFT: Sonderzeichen maskiert, ein Lückentext mit zwei Lücken wird zu zwei Fragen', () => {
    const g = giftText(fragenAusBlatt(blatt()).fragen, 'Bio')
    expect(g).toMatch(/^\$CATEGORY: Bio/)
    expect(g).toContain('~%50%Licht')
    expect(g).toContain('{TRUE}')
    expect(g).toContain('=CO₂ -> Kohlenstoffdioxid')
    expect(g.match(/::Aufgabe 4 \(\d\)::/g)).toHaveLength(2)
    expect(giftText([{ art: 'kurz', titel: 'a:b', frage: 'x=1?', antworten: ['1'] }], 'K')).toContain('::a\\:b::x\\=1? {=1}')
  })

  it('H5P: Fragensatz als ZIP mit h5p.json und content.json; Zuordnung und Freitext gemeldet', () => {
    const b = fragenAusBlatt(blatt())
    const { nichtMoeglich } = h5pInhalt(b.fragen, 'Fotosynthese')
    expect(nichtMoeglich).toHaveLength(2)
    const dateien = unzipSync(h5pPaket(b, 'Fotosynthese').daten)
    expect(Object.keys(dateien).sort()).toEqual(['content/content.json', 'h5p.json'])
    const h5p = JSON.parse(strFromU8(dateien['h5p.json']))
    expect(h5p.mainLibrary).toBe('H5P.QuestionSet')
    const content = JSON.parse(strFromU8(dateien['content/content.json']))
    expect(content.questions.length).toBe(4)
  })

  it('Vokabeltest: je Vokabel eine Kurzantwort, Alternativen getrennt, ausgenommene Wörter fehlen', () => {
    const b = fragenAusVokabeln(
      [
        { id: '1', term: 'to go; to walk', translation: 'gehen' },
        { id: '2', term: 'house', translation: 'Haus', include: false }
      ],
      'Englisch'
    )
    expect(b.fragen).toEqual([{ art: 'kurz', titel: 'Vokabel 1', frage: 'Englisch: gehen', antworten: ['to go', 'to walk'] }])
  })
})
