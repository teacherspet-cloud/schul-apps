import { describe, expect, it } from 'vitest'
import { paginate } from '../src/renderer/src/shared/render/paginate'
import { ankerAufraeumen, inhaltsForm, querBausteine, querNachAnkern, seiteUmschalten } from '../src/renderer/src/modules/arbeitsblatt/model/seitenformat'
import type { WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/* Hoch- und Querformat je Seitenabschnitt (06.10.2026) */
const text = (id: string, extra: Partial<WsBlock> = {}, body = 'kurz'): WsBlock =>
  ({ id, type: 'text', title: '', body, lineNumbers: false, source: '', glossary: [], ...extra }) as unknown as WsBlock
const tabelle = (id: string, spalten: number, extra: Partial<WsBlock> = {}): WsBlock =>
  ({ id, type: 'table', title: '', headers: Array.from({ length: spalten }, (_, i) => `S${i}`), rows: [], ...extra }) as unknown as WsBlock
const aufgabe = (id: string, extra: Partial<WsBlock> = {}): WsBlock =>
  ({ id, type: 'task', instruction: 'Tu was.', answer: { kind: 'lines', count: 3 }, parts: [], ...extra }) as unknown as WsBlock

describe('Seitenumbruch mit Querseiten', () => {
  it('Formatwechsel beginnt eine neue Seite; Überlauf bleibt im Format; eigene Höhen', () => {
    const items = [
      { id: 'a', height: 300 },
      { id: 'b', height: 300, quer: true },
      { id: 'c', height: 500, quer: true },
      { id: 'd', height: 100 }
    ]
    const seiten = paginate(items, 1000, 1000, [], { erste: 600, weitere: 600 })
    expect(seiten.map((s) => [s.items.map((i) => i.id).join(''), Boolean(s.quer)])).toEqual([
      ['a', false],
      ['b', true],
      ['c', true],
      ['d', false]
    ])
  })
  it('ohne Querhöhen bleibt alles hoch (Vokabeltest ohne Querseiten, alte Aufrufe)', () => {
    const seiten = paginate([{ id: 'a', height: 100, quer: true }], 1000, 1000)
    expect(seiten).toHaveLength(1)
    expect(seiten[0].quer).toBeUndefined()
  })
  it('erste Seite quer, wenn der erste Baustein quer steht', () => {
    const seiten = paginate([{ id: 'a', height: 100, quer: true }], 1000, 1000, [], { erste: 500, weitere: 600 })
    expect(seiten[0].quer).toBe(true)
  })
})

describe('Formatabschnitte', () => {
  it('Anker gelten bis zum nächsten Anker', () => {
    const b = [text('a'), aufgabe('b', { seitenFormat: 'quer' }), aufgabe('c'), text('d', { seitenFormat: 'hoch' }), aufgabe('e')]
    expect([...querNachAnkern(b)]).toEqual(['b', 'c'])
  })
  it('eine Seite umschalten: ab ihrem ersten Baustein neu, ab der nächsten Seite wie vorher – als Wahl der Lehrkraft', () => {
    const b = [text('a'), aufgabe('b'), aufgabe('c'), aufgabe('d')]
    const neu = seiteUmschalten(b, 'b', 'd', true)
    expect(neu.find((x) => x.id === 'b')).toMatchObject({ seitenFormat: 'quer', seitenFormatFest: true })
    expect(neu.find((x) => x.id === 'd')).toMatchObject({ seitenFormat: 'hoch', seitenFormatFest: true })
    expect([...querNachAnkern(neu)]).toEqual(['b', 'c'])
  })
  it('überflüssige Anker der KI entfallen, die der Lehrkraft bleiben', () => {
    const b = [text('a', { seitenFormat: 'hoch' }), aufgabe('b', { seitenFormat: 'hoch', seitenFormatFest: true })]
    const r = ankerAufraeumen(b)
    expect(r[0].seitenFormat).toBeUndefined()
    expect(r[1].seitenFormat).toBe('hoch')
  })
})

describe('Prüfung nach Maßen', () => {
  it('breite Tabelle im Hochabschnitt: quer samt Aufgabe dahinter', () => {
    const b = [text('a'), tabelle('t', 7), aufgabe('x'), aufgabe('y')]
    expect(inhaltsForm(b[1])).toBe('breit')
    expect([...querBausteine(b)]).toEqual(['t', 'x'])
  })
  it('Wahl der Lehrkraft (hoch) schlägt die Prüfung', () => {
    const b = [text('a'), tabelle('t', 7, { seitenFormat: 'hoch', seitenFormatFest: true }), aufgabe('x')]
    expect(querBausteine(b).size).toBe(0)
  })
  it('Querabschnitt der KI mit langem Fließtext und nichts Breitem: zurück ins Hochformat', () => {
    const b = [text('a', { seitenFormat: 'quer' }, 'x'.repeat(2000)), aufgabe('b')]
    expect(querBausteine(b).size).toBe(0)
  })
  it('Querabschnitt der KI mit breitem Inhalt bleibt', () => {
    const b = [aufgabe('a', { seitenFormat: 'quer' }), tabelle('t', 8), text('c', { seitenFormat: 'hoch' })]
    expect([...querBausteine(b)]).toEqual(['a', 't'])
  })
})
