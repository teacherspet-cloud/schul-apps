import { describe, expect, it } from 'vitest'
import { erkenneSchulbuch, quelleVon, schulbuchText } from '../src/renderer/src/shared/schulbuch/schulbuch'

/* Schulbuchseiten als Grundlage (Phase 6b, 05.10.2026) */
const BILD = 'data:image/png;base64,iVBORw0KGgo='
const antwort = {
  istSchulbuch: true,
  titel: 'Geschichte und Geschehen 2',
  verlag: 'Klett',
  seiten: '38–39',
  abschnitte: [
    { kennung: 'VT1', art: 'Verfassertext', titel: 'Der Weg in den Krieg', seite: '38', text: 'Im Sommer 1914 …' },
    { kennung: 'M2', art: 'Quelle', titel: 'Brief eines Soldaten', seite: '39', text: 'Liebe Mutter …' },
    { kennung: 'Aufgaben', art: 'Aufgaben', titel: '', seite: '39', text: '1. Beschreibe …' }
  ]
}

describe('Schulbuch-Erkennung', () => {
  it('erkennt Abschnitte; Vorgabe verweisen, Aufgabenblöcke weglassen; Bilder gehen mit', async () => {
    let bilder: string[] | undefined
    const sb = await erkenneSchulbuch([BILD], async <T>(req: { images?: string[] }) => ((bilder = req.images), antwort as T))
    expect(bilder).toEqual([BILD])
    expect(sb?.abschnitte.map((a) => [a.kennung, a.wahl])).toEqual([
      ['VT1', 'verweis'],
      ['M2', 'verweis'],
      ['Aufgaben', 'weg']
    ])
  })
  it('kein Schulbuch bzw. keine Bilder: null, ohne KI-Anfrage ohne Bilder', async () => {
    let fragen = 0
    const ki = async <T>(): Promise<T> => (fragen++, { ...antwort, istSchulbuch: false }) as T
    expect(await erkenneSchulbuch([BILD], ki)).toBeNull()
    expect(await erkenneSchulbuch(['kein-bild'], ki)).toBeNull()
    expect(fragen).toBe(1)
  })
  it('Text für die KI: verweisen ohne Abdruck, übernehmen mit Quelle, Weggelassenes fehlt', async () => {
    const sb = (await erkenneSchulbuch([BILD], async <T>() => antwort as T))!
    sb.abschnitte[1].wahl = 'text'
    const t = schulbuchText(sb)
    expect(t).toContain('NUR VERWEISEN')
    expect(t).toContain('Lies VT1 auf S. 38 in deinem Schulbuch')
    expect(t).toContain('WÖRTLICH ALS MATERIAL ÜBERNEHMEN')
    expect(t).toContain('Liebe Mutter')
    expect(t).toContain(`Quelle: ${quelleVon(sb, sb.abschnitte[1])}`)
    expect(quelleVon(sb, sb.abschnitte[1])).toBe('Geschichte und Geschehen 2, Klett, S. 39, M2')
    expect(t).not.toContain('1. Beschreibe')
  })
})
