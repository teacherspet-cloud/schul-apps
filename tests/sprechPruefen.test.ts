import { describe, expect, it } from 'vitest'
import { pruefAnfrage, pruefBerichtText, pruefErgebnisAnwenden, pruefRegeln } from '../src/shared/sprechen/pruefen'
import type { Grundlage } from '../src/shared/sprechen/erstellen'

/* Prüfung der Sprechkarten (21.10.2026): zweite Anfrage gegen die Vorgaben des Erzeugers – ohne echte KI */
const G: Grundlage = {
  sprache: 'en',
  jahrgang: 6,
  niveau: 'A2',
  quelle: 'Green Line 2, bis Unit 3',
  woerter: ['school', 'trip'],
  grammatikBekannt: ['simple past'],
  grammatikNeu: ['going to-future'],
  themen: ['Freizeit']
}

describe('Prüfanfrage der Sprechkarten', () => {
  it('nennt die Regeln des Erzeugers je Teil', () => {
    const r = pruefRegeln('dialog', G).join('\n')
    expect(r).toMatch(/year 6 \(CEFR target A2\)/)
    expect(r).toMatch(/NO unknown words/)
    expect(r).toMatch(/rollenspiel or infogap or diskussion/)
    expect(r).toMatch(/full information/)
    expect(pruefRegeln('monolog', { ...G, jahrgang: 11 }).join('\n')).toMatch(/compare and generalise/)
    expect(pruefRegeln('dialog', { ...G, jahrgang: 11 }).join('\n')).toMatch(/form must be diskussion;/)
    expect(pruefRegeln('interview', G).join('\n')).toMatch(/5–8 questions/)
  })
  it('Anfrage: Karten nummeriert, Schema mit Urteil und allen Kartenfeldern', () => {
    const q = pruefAnfrage('interview', [{ thema: 'School', fragen: ['a?'], id: 'x' }], G, ['Holidays'])
    expect(q.schemaName).toBe('sprechkarten_pruefung_interview')
    expect(q.user).toMatch(/1\. \{"thema":"School","fragen":\["a\?"\]\}/)
    expect(q.user).toMatch(/Already in the pool: Holidays/)
    const items = (q.schema as { properties: { urteile: { items: { required: string[] } } } }).properties.urteile.items
    expect(items.required).toEqual(['nr', 'ok', 'grund', 'thema', 'fragen'])
  })
})

describe('Urteile anwenden', () => {
  const karten = [
    { thema: 'School', fragen: ['a', 'b', 'c', 'd', 'e'] },
    { thema: 'Holidays', fragen: ['a', 'b', 'c', 'd', 'e'] },
    { thema: 'Free time', fragen: ['a', 'b', 'c', 'd', 'e'] },
    { thema: 'Family', fragen: ['a', 'b', 'c', 'd', 'e'] }
  ]
  it('streicht ok = false, übernimmt Korrekturen, behält leere Felder und Karten ohne Urteil, streicht Doppeltes', () => {
    const e = pruefErgebnisAnwenden(
      'interview',
      karten,
      {
        urteile: [
          { nr: 1, ok: true, grund: '', thema: 'My school', fragen: ['x', 'y', 'z', 'v', 'w'] },
          { nr: 2, ok: false, grund: 'zu schwer', thema: 'Holidays', fragen: [] },
          { nr: 3, ok: true, grund: '', thema: '', fragen: [] }
        ]
      },
      ['family']
    )
    expect(e.bestanden.map((k) => k.thema)).toEqual(['My school', 'Free time'])
    expect(e.bestanden[0].fragen).toEqual(['x', 'y', 'z', 'v', 'w'])
    expect(e.bestanden[1].fragen).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(e.gestrichen).toEqual([
      { titel: 'Holidays', grund: 'zu schwer' },
      { titel: 'Family', grund: 'gibt es schon im Pool' }
    ])
  })
  it('ohne Antwort bleiben alle; Bericht „x von y" mit Gründen', () => {
    expect(pruefErgebnisAnwenden('interview', karten, null).bestanden).toHaveLength(4)
    expect(pruefBerichtText({ geprueft: 8, bestanden: 6, gruende: ['zu schwer', 'zu schwer', 'Marke genannt'] })).toBe(
      '6 von 8 Karten bestanden die Prüfung – gestrichen u. a.: zu schwer; Marke genannt'
    )
    expect(pruefBerichtText({ geprueft: 3, bestanden: 0, gruende: [] })).toBe('0 von 3 Karten bestanden die Prüfung')
  })
})
