import { describe, expect, it } from 'vitest'
import { paginate } from '../src/renderer/src/shared/render/paginate'
import { aufAbsaetze, zeilenBaender, zeilenEinheiten, zeilenSchnitte, type AbsatzMessung } from '../src/renderer/src/modules/arbeitsblatt/render/zeilenTeilung'

/*
 * Befund der Lehrkraft (02.10.2026, wiederholt): „Materialblöcke werden komplett auf die nächste
 * Seite verschoben, obwohl wahrscheinlich 5 Zeilen des Blocks noch auf die vorherige Seite gepasst
 * hätten." Materialtexte werden seitdem zwischen ZEILEN umbrochen.
 */

/** Ein Absatz aus `n` Zeilen à 24 px (Schrift 16 px, Glyphenbox 18 px, 3 px Durchschuss je Seite) */
const zeilenRects = (n: number, start = 0): { top: number; bottom: number }[] =>
  Array.from({ length: n }, (_, i) => ({ top: start + i * 24 + 3, bottom: start + i * 24 + 21 }))

const absatz = (nr: number, n: number, hoehe = n * 24, marken: AbsatzMessung['marken'] = []): AbsatzMessung => {
  const { schnitte, zeilenJe } = zeilenSchnitte(zeilenBaender(zeilenRects(n)))
  return { absatz: nr, hoehe, schnitte, zeilenJe, marken }
}

describe('Zeilen eines Absatzes', () => {
  it('fasst die Textstücke einer Zeile zusammen – auch fett oder kleiner gesetzte', () => {
    const rects = [
      { top: 3, bottom: 21 },
      { top: 5, bottom: 19 }, // kleiner gesetzt, dieselbe Zeile
      { top: 27, bottom: 45 },
      { top: 26, bottom: 46 } // etwas größer, dieselbe Zeile
    ]
    expect(zeilenBaender(rects)).toEqual([
      { top: 3, bottom: 21 },
      { top: 26, bottom: 46 }
    ])
  })

  it('schneidet in der Mitte zwischen zwei Zeilen – an der Grenze der Zeilenboxen', () => {
    const { schnitte, zeilenJe } = zeilenSchnitte(zeilenBaender(zeilenRects(3)))
    expect(schnitte).toEqual([24, 48])
    expect(zeilenJe).toEqual([1, 1, 1])
  })

  it('schneidet nie durch eine Formel oder ein Bild – die Zeilen bilden dann eine Einheit', () => {
    // Eine hohe Formel reicht von Zeile 2 in Zeile 3 hinein
    const { schnitte, zeilenJe } = zeilenSchnitte(zeilenBaender(zeilenRects(4)), [{ top: 30, bottom: 60 }])
    expect(schnitte).toEqual([24, 72])
    expect(zeilenJe).toEqual([1, 2, 1])
  })

  it('ein Absatz aus einer Zeile hat keine Schnittstelle', () => {
    expect(zeilenSchnitte(zeilenBaender(zeilenRects(1)))).toEqual({ schnitte: [], zeilenJe: [1] })
  })
})

describe('Einheiten eines Materialtexts', () => {
  it('je Zeile eine Einheit; die letzte trägt den Abstand zum nächsten Absatz', () => {
    const { units, lines, karte } = zeilenEinheiten([absatz(0, 3, 80), absatz(1, 2)])
    expect(units).toEqual([24, 24, 32, 24, 24])
    expect(units.reduce((a, b) => a + b, 0)).toBe(80 + 48)
    expect(lines).toEqual([1, 1, 1, 1, 1])
    expect(karte.map((k) => [k.absatz, k.oben, k.unten, k.erste, k.letzte])).toEqual([
      [0, 0, 24, true, false],
      [0, 24, 48, false, false],
      [0, 48, 80, false, true],
      [1, 0, 24, true, false],
      [1, 24, 48, false, true]
    ])
  })

  it('Anmerkungen stehen bei der Zeile ihrer Ziffer, solche ohne Stelle bei der letzten Einheit', () => {
    const { karte } = zeilenEinheiten(
      [
        absatz(0, 3, 72, [
          { nr: 1, mitte: 10 },
          { nr: 2, mitte: 60 }
        ]),
        { absatz: 1, hoehe: 40, schnitte: [], zeilenJe: [0], marken: [] } // Worterklärungen
      ],
      [3]
    )
    expect(karte.map((k) => k.noten)).toEqual([[1], [], [2], [3]])
  })
})

describe('Seitenumbruch mit Zeilen-Einheiten', () => {
  it('ein Text aus EINEM Absatz wird geteilt, statt ganz auf die nächste Seite zu wandern', () => {
    // Kopf 40, ein Absatz aus 20 Zeilen à 24 px; auf Seite 1 sind noch 170 px frei → Kopf + 5 Zeilen
    const { units, lines, karte } = zeilenEinheiten([absatz(0, 20)])
    const plan = paginate(
      [
        { id: 'vor', height: 1000 - 170 },
        { id: 't', height: 40 + 480, headHeight: 40, continuedHead: 20, units, unitLines: lines }
      ],
      1000,
      1000
    )
    expect(plan.length).toBe(2)
    const erstes = plan[0].items[1]
    const zweites = plan[1].items[0]
    expect(erstes).toMatchObject({ id: 't', from: 0, to: 5, lineStart: 0, lineCount: 5 })
    // Zeilennummern laufen auf der Folgeseite weiter
    expect(zweites).toMatchObject({ id: 't', from: 5, to: 20, lineStart: 5, lineCount: 15, continued: true })
    // Zurück auf Absätze: derselbe Absatz auf beiden Seiten, geschnitten nach Zeile 5
    expect(aufAbsaetze(erstes, karte)).toMatchObject({ from: 0, to: 1, absatzBis: 120 })
    expect(aufAbsaetze(erstes, karte).absatzAb).toBeUndefined()
    expect(aufAbsaetze(zweites, karte)).toMatchObject({ from: 0, to: 1, absatzAb: 120, lineStart: 5 })
    expect(aufAbsaetze(zweites, karte).absatzBis).toBeUndefined()
  })

  it('Kopf und erste Zeile bleiben zusammen – passt nicht einmal das, wandert der Text', () => {
    const { units, lines } = zeilenEinheiten([absatz(0, 10)])
    // 60 px frei: Kopf 40 + Zeile 24 = 64 > 60
    const plan = paginate(
      [
        { id: 'vor', height: 940 },
        { id: 't', height: 40 + 240, headHeight: 40, units, unitLines: lines }
      ],
      1000,
      1000
    )
    expect(plan[0].items.map((i) => i.id)).toEqual(['vor'])
    expect(plan[1].items[0]).toMatchObject({ id: 't', from: 0, to: 10 })
  })

  it('keine Mindestzeilenzahl: auch eine einzelne Zeile darf unten stehen (Entscheidung 01.10.2026)', () => {
    const { units } = zeilenEinheiten([absatz(0, 10)])
    const plan = paginate(
      [
        { id: 'vor', height: 930 },
        { id: 't', height: 40 + 240, headHeight: 40, units }
      ],
      1000,
      1000
    )
    expect(plan[0].items[1]).toMatchObject({ id: 't', from: 0, to: 1 })
  })

  it('der Fuß (Wortzahl, Quelle) steht nur unter dem letzten Stück', () => {
    const { units, karte } = zeilenEinheiten([absatz(0, 10)])
    // 200 frei: Kopf 40 + 6 Zeilen = 184; mit Fuß 30 würde erst die letzte Zeile ihn tragen
    const plan = paginate(
      [
        { id: 'vor', height: 800 },
        { id: 't', height: 40 + 240 + 30, headHeight: 40, footHeight: 30, units }
      ],
      1000,
      1000
    )
    const stuecke = plan.flatMap((p) => p.items.filter((i) => i.id === 't')).map((i) => aufAbsaetze(i, karte))
    expect(stuecke.length).toBe(2)
    // Erstes Stück endet im Absatz → blockview zeigt keinen Fuß; letztes endet am Absatzende → Fuß
    expect(stuecke[0].absatzBis).toBeDefined()
    expect(stuecke[1].absatzBis).toBeUndefined()
  })

  it('Fußnoten wandern mit der Zeile ihrer Ziffer', () => {
    const { units, karte } = zeilenEinheiten([absatz(0, 10, 240, [{ nr: 1, mitte: 8 * 24 + 10 }])])
    const noteUnits = karte.map((k) => (k.noten.length ? 50 : 0))
    const plan = paginate(
      [
        { id: 'vor', height: 700 },
        { id: 't', height: 40 + 240, headHeight: 40, units, noteUnits, noteRule: 10 }
      ],
      1000,
      1000
    )
    // 300 frei: ohne Fußnote passten Kopf + 10 Zeilen (280); mit Fußnote (50 + 10) nur bis Zeile 8
    const erstes = aufAbsaetze(plan[0].items[1], karte)
    const zweites = aufAbsaetze(plan[1].items[0], karte)
    expect(erstes.noten).toEqual([])
    expect(zweites.noten).toEqual([1])
    expect(plan[0].items[1]).toMatchObject({ from: 0, to: 8 })
  })

  it('ganze Absätze ohne Schnitt bekommen keine Rahmenmaße', () => {
    const { units, karte } = zeilenEinheiten([absatz(0, 2), absatz(1, 2), absatz(2, 2)])
    // 40 + 4 Zeilen = 136 → Schnitt genau an der Absatzgrenze
    const plan = paginate(
      [
        { id: 'vor', height: 860 },
        { id: 't', height: 40 + 144, headHeight: 40, units }
      ],
      1000,
      1000
    )
    const erstes = aufAbsaetze(plan[0].items[1], karte)
    const zweites = aufAbsaetze(plan[1].items[0], karte)
    expect(erstes).toMatchObject({ from: 0, to: 2 })
    expect(zweites).toMatchObject({ from: 2, to: 3 })
    expect(erstes.absatzBis).toBeUndefined()
    expect(zweites.absatzAb).toBeUndefined()
  })
})
