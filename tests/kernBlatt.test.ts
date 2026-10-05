import { describe, expect, it } from 'vitest'
import { emptyAnswer, newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { lueckenTeile, onlineFassungAusBloecke, verteile } from '../src/renderer/src/modules/onlinetest/kernBlatt'
import { bewerte } from '../src/renderer/src/modules/onlinetest/kern'

/*
 * Onlinetest aus Grammatiktest/Lernzielkontrolle (05.10.2026): Aufgaben der Arbeitsblatt-Bausteine werden zur
 * Onlinefassung; eindeutige Antwortformen prüft der Kern selbst, Schreibaufgaben gehen an die KI, Zeichnen an
 * die Lehrkraft; Material wird zur Karte.
 */
const aufgabe = (id: string, punkte: number, a: Partial<TaskBlock['answer']>, mehr: Partial<TaskBlock> = {}): TaskBlock => {
  const b = newBlock('task') as TaskBlock
  return { ...b, id, points: punkte, instruction: `Aufgabe ${id}`, answer: { ...emptyAnswer(a.kind ?? 'lines'), ...a }, ...mehr }
}

describe('Onlinefassung aus Arbeitsblatt-Bausteinen', () => {
  it('Punkte verteilen (ganze Punkte, Rest vorne)', () => {
    expect(verteile(5, 3)).toEqual([2, 2, 1])
    expect(verteile(1, 3)).toEqual([1, 1, 1])
    expect(lueckenTeile('I [[am]] here and you [[are]] there.').map((t) => t.loesung)).toEqual(['am', 'are'])
  })

  it('Lücken, Auswahl, Richtig/Falsch, Zuordnung, Schreiben, Zeichnen – und Material', () => {
    const material = { ...newBlock('text'), id: 'm1' } as WsBlock
    const bloecke: WsBlock[] = [
      material,
      aufgabe('a', 2, { kind: 'gapText', gapText: 'She [[has]] got a dog and it [[is]] brown.' }),
      aufgabe('b', 1, { kind: 'multipleChoice', options: ['went', 'goed', 'gone'], correct: [0] }),
      aufgabe('c', 2, {
        kind: 'trueFalse',
        statements: [
          { text: 'X', isTrue: true },
          { text: 'Y', isTrue: false }
        ]
      }),
      aufgabe('d', 2, { kind: 'matching', left: ['L1', 'L2'], right: ['R1', 'R2'], pairs: [1, 0] }),
      aufgabe('e', 3, { kind: 'lines', count: 4 }, { solution: 'Weil die Mieten steigen.' }),
      aufgabe('f', 2, { kind: 'diagram' })
    ]
    const f = onlineFassungAusBloecke(bloecke, { materialHtml: (id) => (id === 'm1' ? '<p>Text</p>' : ''), stil: '.x{}', nummern: new Map() })
    expect(f.aufgaben.map((a) => a.art)).toEqual(['material', 'gapText', 'open', 'open', 'match', 'open', 'open'])
    expect(f.aufgaben[0].html).toBe('<p>Text</p>')
    expect(f.stil).toBe('.x{}')
    expect(f.punkte).toBe(12)
    const art = (id: string): string => f.loesungen[id]?.art
    expect(art('a.l0')).toBe('genau')
    expect(art('b.mc')).toBe('auswahl')
    expect(art('e.o')).toBe('ki')
    expect(art('f.d')).toBe('lehrkraft')
    // Richtige Antworten → volle Punkte in den eindeutigen Aufgaben
    const b = bewerte(f, {
      'a.l0': 'has',
      'a.l1': 'is',
      'b.mc': '0',
      'c.w0': 'true',
      'c.w1': 'false',
      'd.z0': '1',
      'd.z1': '0',
      'e.o': 'Weil Mieten steigen.',
      'f.d': 'Eine steigende Linie.'
    })
    const punkte = (prefix: string): number =>
      Object.entries(b)
        .filter(([k]) => k.startsWith(prefix))
        .reduce((s, [, v]) => s + v.punkte, 0)
    expect(punkte('a.')).toBe(2)
    expect(punkte('b.')).toBe(1)
    expect(punkte('c.')).toBe(2)
    expect(punkte('d.')).toBe(2)
    expect(b['e.o'].status).toBe('ki')
    expect(b['f.d'].status).toBe('lehrkraft')
    // Falsche Lücke → kein Punkt für diese Lücke
    const falsch = bewerte(f, { 'a.l0': 'have', 'a.l1': 'is' })
    expect(falsch['a.l0'].punkte).toBe(0)
    expect(falsch['a.l1'].punkte).toBe(1)
  })

  it('Mehrere richtige Antworten: je Möglichkeit „trifft zu", eine Einheit', () => {
    const f = onlineFassungAusBloecke([aufgabe('m', 2, { kind: 'multipleChoice', options: ['a', 'b', 'c'], correct: [0, 2] })], {
      materialHtml: () => '',
      stil: '',
      nummern: new Map()
    })
    expect(f.einheiten).toHaveLength(1)
    const gut = bewerte(f, { 'm.mc0': 'true', 'm.mc1': 'false', 'm.mc2': 'true' })
    expect(gut['m.mc'].punkte).toBe(2)
    const halb = bewerte(f, { 'm.mc0': 'true', 'm.mc1': 'false', 'm.mc2': 'false' })
    expect(halb['m.mc'].punkte).toBe(0)
  })
})
