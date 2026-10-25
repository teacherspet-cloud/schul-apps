/**
 * Rückmeldung – mehrere Bilder (25.10.2026, Wunsch der Lehrkraft): zusammen hochgeladene Fotos wahlweise als eine
 * Abgabe mit Seiten; Seiten wieder trennen; eine Abgabe an die vorherige anhängen; Kürzel bleiben fortlaufend.
 */
import { describe, expect, it } from 'vitest'
import { bilderZusammenfassen, mitVorherigerZusammenlegen, nurBilder, seitenTrennen } from '../src/renderer/src/modules/rueckmeldung/abgabeAnlegen'
import type { Abgabe, Rueckmeldung } from '../src/renderer/src/modules/rueckmeldung/model/types'

const bild = (name: string, ...seiten: string[]) => ({ fileName: name, text: '', kind: 'image', pageImages: seiten })
const textDatei = (name: string, text: string) => ({ fileName: name, text, kind: 'text' })
const abgabe = (id: string, kuerzel: string, bilder: string[], text = ''): Abgabe => ({ id, kuerzel, name: '', dateiname: `${id}.jpg`, text, bilder })
const dok = (abgaben: Abgabe[]): { d: Rueckmeldung; update: (fn: (d: Rueckmeldung) => void) => void } => {
  const d = { abgaben } as unknown as Rueckmeldung
  return { d, update: (fn) => fn(d) }
}

describe('Rückmeldung: mehrere Bilder', () => {
  it('fasst nur Bilder zusammen, Textdateien bleiben eigene Abgaben', () => {
    const g = [bild('a.jpg', 'A'), textDatei('t.txt', 'Hallo'), bild('b.jpg', 'B'), bild('c.jpg', 'C')]
    expect(g.map(nurBilder)).toEqual([true, false, true, true])
    const z = bilderZusammenfassen(g)
    expect(z).toHaveLength(2)
    expect(z[0].fileName).toBe('a.jpg (+2)')
    expect(z[0].pageImages).toEqual(['A', 'B', 'C'])
    expect(z[1].fileName).toBe('t.txt')
    // Ein einzelnes Bild bleibt, wie es ist
    expect(bilderZusammenfassen([bild('a.jpg', 'A')])).toEqual([bild('a.jpg', 'A')])
  })

  it('trennt Seiten in einzelne Abgaben an derselben Stelle mit fortlaufenden Kürzeln', () => {
    const { d, update } = dok([abgabe('x', 'S1', ['A', 'B', 'C']), abgabe('y', 'S2', ['D'])])
    seitenTrennen(update, 'x')
    expect(d.abgaben.map((a) => a.kuerzel)).toEqual(['S1', 'S3', 'S4', 'S2'])
    expect(d.abgaben.map((a) => a.bilder)).toEqual([['A'], ['B'], ['C'], ['D']])
    expect(d.abgaben[0].id).toBe('x')
    expect(d.abgaben[1].dateiname).toBe('x.jpg – Seite 2')
    // Abgaben mit Text oder nur einer Seite bleiben unverändert
    seitenTrennen(update, 'y')
    expect(d.abgaben).toHaveLength(4)
  })

  it('hängt eine Abgabe an die vorherige an – nur Bilder ohne Text', () => {
    const { d, update } = dok([abgabe('x', 'S1', ['A']), abgabe('y', 'S2', ['B']), abgabe('z', 'S3', [], 'Text')])
    mitVorherigerZusammenlegen(update, 'y')
    expect(d.abgaben).toHaveLength(2)
    expect(d.abgaben[0].bilder).toEqual(['A', 'B'])
    expect(d.abgaben[0].dateiname).toBe('x.jpg (+1)')
    mitVorherigerZusammenlegen(update, 'z')
    expect(d.abgaben).toHaveLength(2)
    mitVorherigerZusammenlegen(update, 'x')
    expect(d.abgaben).toHaveLength(2)
  })
})
