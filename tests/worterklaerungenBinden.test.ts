// Worterklärungen und Seitenumbruch eines Materialtexts (19.11.2026, zwei Befunde „Welcome to my home!")
import { describe, expect, it } from 'vitest'
import { bindeTextzeilen, paginate, paginateDicht, VERDICHTEN_MIN, VERDICHTEN_SPAR, type MeasuredItem } from '../src/renderer/src/shared/render/paginate'

/*
 * 15 Textzeilen à 22 px, dahinter die Liste der Worterklärungen als leere Einheit (ihre Einträge zählen bei den Zeilen
 * ihrer Ziffern, je 18 px, Rahmen 12 px). Wortzahl 20 px Fuß.
 */
const N = 15
const units = [...Array.from({ length: N }, () => 22), 0]
const text = (ziffernIn: number[]): MeasuredItem => {
  const noteUnits = units.map((_, k) => (ziffernIn.includes(k) ? 18 : 0))
  return {
    id: 'm1',
    height: 30 + N * 22 + 20,
    headHeight: 30,
    footHeight: 20,
    units,
    unitLines: units.map((_, k) => (k < N ? 1 : 0)),
    noteUnits,
    noteRule: 12,
    notenJeStueck: true,
    verdichtbar: true,
    unitGlue: bindeTextzeilen(units.length, [], true)
  }
}

describe('Zeilen eines Materialtexts binden', () => {
  it('erste zwei, letzte zwei Zeilen und die letzte mit der Liste', () => {
    const g = bindeTextzeilen(units.length, [], true)
    expect(g.map((x, k) => (x ? k : -1)).filter((k) => k >= 0)).toEqual([0, N - 2, N - 1])
  })
  it('kurzer Text: nur die letzte Zeile mit der Liste', () => {
    expect(bindeTextzeilen(3, [], true)).toEqual([false, true, false])
  })
  it('einzeiliger Absatz (Sprecher) bleibt bei der Zeile danach', () => {
    const einzeilig = units.map((_, k) => k === 5)
    expect(bindeTextzeilen(units.length, [], true, einzeilig)[5]).toBe(true)
  })
})

describe('Worterklärungen je Stück', () => {
  it('Befund 2: Ziffer schon in Zeile 1 – Seite 1 bleibt voll, nicht nur eine Zeile', () => {
    const davor = { id: 'ziele', height: 400 }
    // Platz: Ziele + Kopf + 8 Zeilen + Erklärungen der Zeilen 0 und 3 samt Rahmen
    const platz = 400 + 30 + 8 * 22 + 2 * 18 + 12 + 1
    const p = paginate([davor, text([0, 3, 9, 14])], platz, 1000)
    expect(p[0].items[1]).toMatchObject({ id: 'm1', from: 0, to: 8 })
    expect(p[1].items[0]).toMatchObject({ id: 'm1', from: 8, to: units.length, continued: true })
  })
  it('die Erklärungen einer Zeile wandern mit ihr – passt sie nicht mehr, geht die Zeile mit', () => {
    const davor = { id: 'ziele', height: 400 }
    // Zeile 7 trägt eine Ziffer: Ihre Erklärung passt nicht mehr → Zeile 7 beginnt Seite 2
    const platz = 400 + 30 + 8 * 22 + 18 + 12 + 5
    const p = paginate([davor, text([0, 7])], platz, 1000)
    expect(p[0].items[1]).toMatchObject({ from: 0, to: 7 })
  })
  it('Rahmen je Stück: zwei Texte auf einer Seite zahlen ihn beide', () => {
    const a = { ...text([0]), id: 'a', verdichtbar: false }
    const b = { ...text([0]), id: 'b', verdichtbar: false }
    const je = 30 + N * 22 + 20 + 18 + 12
    expect(paginate([a, b], 2 * je, 2000)).toHaveLength(1)
    expect(paginate([a, b], 2 * je - 6, 2000).length).toBeGreaterThan(1)
  })
  it('keine einzelne Zeile unten auf der Seite', () => {
    const davor = { id: 'ziele', height: 500 }
    const p = paginate([davor, text([])], 500 + 30 + 22 + 5, 1000)
    expect(p[0].items.map((i) => i.id)).toEqual(['ziele'])
    expect(p[1].items[0]).toMatchObject({ id: 'm1', from: 0 })
  })
})

describe('Seite leicht verdichten statt Text zerreißen', () => {
  const davor = { id: 'kasten', height: 300 }
  const ganz = 30 + N * 22 + 20 + 18 + 12
  it('fehlt wenig: ganzer Text auf Seite 1, Seite verkleinert, das Folgende auf Seite 2', () => {
    const p = paginate([davor, text([3]), { id: 'a1', height: 100 }], 300 + ganz - 40, 1000)
    expect(p[0].items.map((i) => i.id)).toEqual(['kasten', 'm1'])
    expect(p[0].items[1]).toMatchObject({ from: 0, to: units.length })
    expect(p[0].massstab).toBeGreaterThanOrEqual(VERDICHTEN_MIN)
    expect(p[0].massstab).toBeLessThan(1)
    expect(p[1].items.map((i) => i.id)).toEqual(['a1'])
  })
  it('fehlt viel: wird geteilt, keine Verkleinerung', () => {
    const p = paginate([davor, text([3])], 300 + 200, 1000)
    expect(p[0].massstab).toBeUndefined()
    expect(p[1].items[0]).toMatchObject({ id: 'm1', continued: true })
  })
  it('ohne verdichtbar (Aufgaben, Tabellen): nie verkleinert', () => {
    const p = paginate([davor, { ...text([3]), verdichtbar: false }], 300 + ganz - 40, 1000)
    expect(p[0].massstab).toBeUndefined()
  })
})

describe('Stärker verdichten nur, wenn es eine Seite spart', () => {
  // Wie im Befund: Text braucht 89 % (unter VERDICHTEN_MIN), danach eine Aufgabe, die nur ganz passt
  const davor = { id: 'ziele', height: 340 }
  const ganz = 30 + N * 22 + 20 + 18 + 12
  const platz = Math.floor((340 + ganz) * 0.875)
  it('spart es eine Seite: ganzer Text auf Seite 1 mit Maßstab unter 90 %', () => {
    const aufgabe = { id: 'a2', height: platz - 40 }
    const p = paginateDicht([davor, text([3]), aufgabe], platz, platz)
    expect(p).toHaveLength(2)
    expect(p[0].massstab).toBeLessThan(VERDICHTEN_MIN)
    expect(p[0].massstab).toBeGreaterThanOrEqual(VERDICHTEN_SPAR)
  })
  it('spart es keine: geteilt wie gewohnt', () => {
    const p = paginateDicht([davor, text([3]), { id: 'a2', height: 100 }], platz, platz)
    expect(p[0].massstab).toBeUndefined()
  })
})
