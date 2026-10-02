import { beforeEach, describe, expect, it } from 'vitest'
import { DROSSEL_MS, geaenderteBausteine, useZwischenstaende, zwischenstandsMelder } from '../src/renderer/src/shared/zwischenstand'

/*
 * Live-Vorschau während der Erzeugung (02.10.2026): Zwischenstände werden kopiert, gedrosselt und
 * markieren, was neu oder geändert ist. Abgelegt wird nichts – der Stand lebt nur im Speicher.
 */

const blatt = (bloecke: { id: string; text: string }[]): unknown => ({ sheets: [{ id: 's1', blocks: bloecke.map((b) => ({ ...b, type: 'text' })) }] })

/** Uhr zum Vorspulen: geplante Aufrufe laufen erst, wenn die Zeit erreicht ist */
function testUhr(): { jetzt: () => number; planen: (fn: () => void, ms: number) => unknown; aufheben: (h: unknown) => void; vor: (ms: number) => void } {
  let zeit = 10_000
  let plan: { fn: () => void; um: number; h: number }[] = []
  let n = 0
  return {
    jetzt: () => zeit,
    planen: (fn, ms) => {
      plan.push({ fn, um: zeit + ms, h: ++n })
      return n
    },
    aufheben: (h) => {
      plan = plan.filter((p) => p.h !== h)
    },
    vor: (ms) => {
      zeit += ms
      const faellig = plan.filter((p) => p.um <= zeit)
      plan = plan.filter((p) => p.um > zeit)
      faellig.forEach((p) => p.fn())
    }
  }
}

describe('Zwischenstände der Live-Vorschau', () => {
  beforeEach(() => useZwischenstaende.setState({ staende: {} }))

  it('markiert neue und geänderte Bausteine, nicht die unveränderten – auch in Arbeiten mit Teilen und Tafelelementen', () => {
    const alt = blatt([
      { id: 'a', text: 'eins' },
      { id: 'b', text: 'zwei' }
    ])
    const neu = blatt([
      { id: 'a', text: 'eins' },
      { id: 'b', text: 'zwei, überarbeitet' },
      { id: 'c', text: 'drei' }
    ])
    expect(geaenderteBausteine(alt, neu).sort()).toEqual(['b', 'c'])
    expect(geaenderteBausteine(null, alt).sort()).toEqual(['a', 'b'])
    // Arbeit: Teile mit Fassungen; Tafelbild: Flächen mit Elementen
    expect(geaenderteBausteine({ parts: [{ blocks: [{ id: 'x', v: 1 }] }] }, { parts: [{ blocks: [{ id: 'x', v: 2 }] }] })).toEqual(['x'])
    expect(
      geaenderteBausteine(
        { tafeln: [{ elemente: [{ id: 'k1', text: 'A' }] }] },
        {
          tafeln: [
            {
              elemente: [
                { id: 'k1', text: 'A' },
                { id: 'k2', text: 'B' }
              ]
            }
          ]
        }
      )
    ).toEqual(['k2'])
    // Prüfhinweise allein sind keine Änderung, die aufleuchten soll
    expect(geaenderteBausteine({ blocks: [{ id: 'w', t: 1 }] }, { blocks: [{ id: 'w', t: 1, warnings: ['x'] }] })).toEqual([])
  })

  it('zeigt sofort, dann höchstens einen Stand je Sekunde – der letzte gewinnt, Markierungen werden gesammelt', () => {
    const uhr = testUhr()
    const m = zwischenstandsMelder('a1', uhr)
    m.zeige(blatt([{ id: 'a', text: '1' }]), { was: 'Teil 1' })
    expect(useZwischenstaende.getState().staende.a1.nr).toBe(1)
    expect(useZwischenstaende.getState().staende.a1.markiert).toEqual(['a'])

    m.zeige(
      blatt([
        { id: 'a', text: '1' },
        { id: 'b', text: '2' }
      ]),
      { was: 'Teil 2' }
    )
    m.zeige(
      blatt([
        { id: 'a', text: '1' },
        { id: 'b', text: '2' },
        { id: 'c', text: '3' }
      ]),
      { was: 'Teil 3' }
    )
    // Noch innerhalb der Sperrzeit: nichts Neues zu sehen
    expect(useZwischenstaende.getState().staende.a1.nr).toBe(1)
    uhr.vor(DROSSEL_MS)
    const z = useZwischenstaende.getState().staende.a1
    expect(z.nr).toBe(2)
    expect(z.was).toBe('Teil 3')
    expect([...z.markiert].sort()).toEqual(['b', 'c'])
  })

  it('kopiert den Stand – spätere Änderungen der Erzeugung erreichen die Vorschau nicht', () => {
    const m = zwischenstandsMelder('a2', testUhr())
    const stand = { blocks: [{ id: 'a', text: 'vorher' }] }
    m.zeige(stand)
    stand.blocks[0].text = 'nachher'
    expect((useZwischenstaende.getState().staende.a2.stand as typeof stand).blocks[0].text).toBe('vorher')
  })

  it('räumt beim Ende ab und nimmt danach nichts mehr an – auch keinen noch wartenden Stand', () => {
    const uhr = testUhr()
    const m = zwischenstandsMelder('a3', uhr)
    m.zeige({ blocks: [{ id: 'a' }] })
    m.zeige({ blocks: [{ id: 'a' }, { id: 'b' }] })
    m.ende()
    uhr.vor(DROSSEL_MS)
    m.zeige({ blocks: [{ id: 'c' }] })
    expect(useZwischenstaende.getState().staende.a3).toBeUndefined()
  })
})
