import { describe, expect, it } from 'vitest'
import { collectReusable, findReusable, imageNeedKey, reusePool } from '../src/renderer/src/shared/imageReuse'
import { PICTOGRAMS, pictogramById, pictogramForInstruction, pictogramForSocialForm } from '../src/renderer/src/modules/arbeitsblatt/render/pictograms'

const ref = (name: string) => ({ dataUrl: `data:image/png;base64,${name}`, source: 'wikimedia' as const })

const imageBlock = (description: string, search?: string, image = ref('x')) => ({
  type: 'image',
  description,
  search,
  image
})

describe('Bilder wiederverwenden', () => {
  it('schlüsselt Bilder nach dem Bedarf, nicht nach dem Baustein', () => {
    // Derselbe Bedarf auf zwei Blättern soll dasselbe Bild bekommen
    expect(imageNeedKey('Ein Fuchs im Wald', 'red fox')).toBe(imageNeedKey('Ein ganz anderer Text', 'red fox'))
  })

  it('hält Originalquellen und gewöhnliche Bilder auseinander', () => {
    expect(imageNeedKey('Karikatur', 'daumier', true)).not.toBe(imageNeedKey('Karikatur', 'daumier', false))
  })

  it('sammelt auch die Einzelbilder einer Bildreihe', () => {
    const blocks = [
      {
        type: 'image',
        description: 'Vier Tiere',
        items: [
          { description: 'Ein Fuchs', search: 'red fox', image: ref('fuchs') },
          { description: 'Ein Dachs', search: 'badger', image: ref('dachs') }
        ]
      }
    ]
    expect(collectReusable(blocks, 'Waldtiere')).toHaveLength(2)
  })

  it('übergeht Bausteine ohne Bild', () => {
    expect(collectReusable([{ type: 'image', description: 'noch leer' }], 'Blatt')).toHaveLength(0)
  })

  it('findet das Bild eines früheren Blattes bei gleichem Bedarf', () => {
    const pool = reusePool([{ name: 'Übungsblatt Wasserkreislauf', blocks: [imageBlock('Schema des Wasserkreislaufs', 'water cycle diagram')] }])
    const found = findReusable(pool, 'Schema des Wasserkreislaufs', 'water cycle diagram')
    expect(found?.from).toBe('Übungsblatt Wasserkreislauf')
  })

  it('findet es auch bei deutlich überschneidenden Suchwörtern', () => {
    const pool = reusePool([{ name: 'Blatt', blocks: [imageBlock('Schema', 'water cycle diagram')] }])
    expect(findReusable(pool, 'Schema', 'water cycle diagram evaporation')).toBeDefined()
  })

  it('nimmt kein Bild, das nur ungefähr passt', () => {
    // Als Abrufhilfe wertlos und als Material falsch
    const pool = reusePool([{ name: 'Blatt', blocks: [imageBlock('Ein Fuchs', 'red fox')] }])
    expect(findReusable(pool, 'Ein Dachs im Winterwald', 'european badger snow')).toBeUndefined()
  })

  it('tauscht keine Originalquelle gegen ein gewöhnliches Bild', () => {
    const pool = reusePool([{ name: 'Blatt', blocks: [{ ...imageBlock('Karikatur zum Wiener Kongress', 'congress vienna caricature'), original: false }] }])
    expect(findReusable(pool, 'Karikatur zum Wiener Kongress', 'congress vienna caricature', true)).toBeUndefined()
  })

  it('lässt bei gleichem Bedarf das zuerst genannte Blatt gewinnen', () => {
    // Die Aufrufer übergeben die Blätter nach Nähe zum Thema
    const pool = reusePool([
      { name: 'Näher am Thema', blocks: [imageBlock('Schema', 'water cycle', ref('a'))] },
      { name: 'Weiter weg', blocks: [imageBlock('Schema', 'water cycle', ref('b'))] }
    ])
    expect(findReusable(pool, 'Schema', 'water cycle')?.from).toBe('Näher am Thema')
  })
})

describe('Piktogramme', () => {
  it('liefert alle Symbole flächig, ohne Konturlinien', () => {
    // Flächige Umsetzungen werden als leichter erkennbar bewertet (DBSV)
    for (const p of PICTOGRAMS) {
      expect(p.paths.length).toBeGreaterThan(0)
      for (const d of p.paths) expect(d).toMatch(/^[Mm]/)
    }
  })

  it('hat zu jeder Sozialform ein Symbol', () => {
    for (const form of ['EA', 'PA', 'GA', 'Plenum', 'Rollenspiel']) {
      expect(pictogramForSocialForm(form), form).toBeDefined()
    }
  })

  it('trägt zu jedem Symbol eine Bezeichnung für den Alternativtext', () => {
    for (const p of PICTOGRAMS) expect(p.label.trim().length).toBeGreaterThan(2)
  })

  it('erkennt eindeutige Handlungsverben', () => {
    expect(pictogramForInstruction('Schreibe einen kurzen Text.')?.id).toBe('schreiben')
    expect(pictogramForInstruction('Lies den Text M1.')?.id).toBe('lesen')
    expect(pictogramForInstruction('Markiere alle Verben.')?.id).toBe('markieren')
    expect(pictogramForInstruction('Vergleiche die beiden Quellen.')?.id).toBe('vergleichen')
  })

  it('setzt lieber kein Symbol als ein falsches', () => {
    expect(pictogramForInstruction('Beurteile die Folgen für die Bevölkerung.')).toBeUndefined()
    expect(pictogramForInstruction('')).toBeUndefined()
  })

  it('kennt keine doppelten Kennungen', () => {
    const ids = PICTOGRAMS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('findet ein Symbol über seine Kennung', () => {
    expect(pictogramById('hausaufgabe')?.label).toBe('Hausaufgabe')
    expect(pictogramById('gibtsnicht')).toBeUndefined()
  })
})

describe('Piktogramme neu gestalten lassen', () => {
  it('fordert einen neongrünen Hintergrund, damit die App ihn ausschneiden kann', async () => {
    const { pictogramPrompt, pictogramById } = await import('../src/renderer/src/modules/arbeitsblatt/render/pictograms')
    const { KEY_GREEN } = await import('../src/renderer/src/shared/imageCleanup')
    const prompt = pictogramPrompt(pictogramById('partnerarbeit')!)
    expect(prompt).toContain(KEY_GREEN)
    expect(prompt.toLowerCase()).toContain('chroma key')
  })

  it('gibt der KI dieselben Gestaltungsregeln wie dem mitgelieferten Satz', async () => {
    const { pictogramPrompt, pictogramById } = await import('../src/renderer/src/modules/arbeitsblatt/render/pictograms')
    const prompt = pictogramPrompt(pictogramById('schreiben')!)
    // Flächig statt linear, und lesbar nach der Graustufen-Kopie
    expect(prompt.toLowerCase()).toContain('solid filled')
    expect(prompt.toLowerCase()).toContain('greyscale')
    // Schrift im Bild wäre unbrauchbar
    expect(prompt.toLowerCase()).toContain('no text')
    expect(prompt).toContain('Schreibe')
  })

  it('nimmt den Gestaltungswunsch der Lehrkraft auf', async () => {
    const { pictogramPrompt, pictogramById } = await import('../src/renderer/src/modules/arbeitsblatt/render/pictograms')
    expect(pictogramPrompt(pictogramById('lesen')!, 'kindlich und rund')).toContain('kindlich und rund')
  })
})

describe('Aussparungen in Symbolen', () => {
  it('kennzeichnet Symbole mit Loch, damit die Aussparung nicht unsichtbar wird', async () => {
    const { pictogramById } = await import('../src/renderer/src/modules/arbeitsblatt/render/pictograms')
    // Ohne evenodd läge der Haken farbgleich auf der Scheibe – das Symbol wäre eine volle Fläche
    expect(pictogramById('kontrolle')?.evenodd).toBe(true)
    expect(pictogramById('rollenspiel')?.evenodd).toBe(true)
  })

  it('setzt die Aussparung als Teilpfad in denselben Pfad', async () => {
    const { PICTOGRAMS } = await import('../src/renderer/src/modules/arbeitsblatt/render/pictograms')
    // Nur innerhalb eines Pfades wirkt evenodd; getrennte Pfade überdecken sich weiterhin
    for (const p of PICTOGRAMS.filter((x) => x.evenodd)) {
      expect(
        p.paths.some((d) => (d.match(/[Mm]/g) ?? []).length > 1),
        p.id
      ).toBe(true)
    }
  })
})
