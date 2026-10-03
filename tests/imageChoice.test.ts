import { describe, expect, it } from 'vitest'
import type { OnlineImageHit, StructuredRequest } from '../src/shared/types'
import { chooseImages, ImageServices } from '../src/renderer/src/shared/imageChoice'
import { findVocabPictures } from '../src/renderer/src/modules/vokabeltest/generation/pictures'
import { completeWorksheetImages } from '../src/renderer/src/modules/arbeitsblatt/generation/worksheetImages'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { ImageBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import type { PictureItem, TestSettings, VocabEntry } from '../src/renderer/src/modules/vokabeltest/model/types'

const hit = (id: string, title: string, source: OnlineImageHit['source'] = 'wikimedia'): OnlineImageHit => ({
  id,
  title,
  thumbnail: `https://t/${id}`,
  url: `https://u/${id}`,
  creator: 'Autor',
  license: 'CC0',
  source
})

/** Bildsuche ohne Netz: jede Anfrage liefert Treffer mit dem Suchbegriff im Titel */
function fakeServices(log: string[] = [], empty: string[] = []): ImageServices {
  return {
    searchOpenMoji: async (q) => (empty.includes(q) ? [] : [{ hexcode: `EMOJI-${q}`, annotation: q }]),
    openMojiPng: async (hex) => `data:image/png;base64,${hex}`,
    search: async (q, source) => {
      log.push(`${source}:${q}`)
      return empty.includes(q) ? [] : [hit(`${source}-${q}-1`, `${q} 1`, source), hit(`${source}-${q}-2`, `${q} 2`, source)]
    },
    fetchImage: async (url) => `data:image/jpeg;base64,${url}`,
    normalize: async (d) => d
  }
}

/** KI, die je Eintrag das Bild wählt, dessen Titel das gesuchte Wort enthält (oder 0) */
function fakeAi(fit: 'eindeutig' | 'brauchbar' | 'ungeeignet', calls: StructuredRequest[] = [], accept: (subject: string) => boolean = () => true) {
  return async <T>(req: StructuredRequest): Promise<T> => {
    calls.push(req)
    const entries = [...req.user.matchAll(/- id="([^"]+)": (.*)\n {2}Kandidaten: (.*)/g)]
    return {
      choices: entries.map(([, id, subject, cands]) => {
        const first = Number(/Bild (\d+)/.exec(cands)![1])
        return accept(subject) ? { id, image: first, fit, reason: 'passt' } : { id, image: 0, fit: 'ungeeignet', reason: 'mehrdeutig' }
      })
    } as T
  }
}

describe('KI-geprüfte Bildauswahl', () => {
  it('ordnet die gewählte Bildnummer über mehrere Einträge und Anfragen richtig zu', async () => {
    const cand = (n: string) => ({ kind: 'photo' as const, source: 'wikimedia' as const, title: n, credit: n, preview: `p-${n}`, load: async () => n })
    const items = Array.from({ length: 7 }, (_, i) => ({
      need: { id: `n${i}`, subject: `Ding ${i}`, queries: [], kinds: ['photo' as const] },
      candidates: [cand(`${i}a`), cand(`${i}b`), cand(`${i}c`), cand(`${i}d`)]
    }))
    const calls: StructuredRequest[] = []
    // KI wählt jeweils das zweite Bild des Eintrags
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      calls.push(req)
      const entries = [...req.user.matchAll(/- id="([^"]+)":.*\n {2}Kandidaten: Bild (\d+)/g)]
      return { choices: entries.map(([, id, first]) => ({ id, image: Number(first) + 1, fit: 'eindeutig', reason: '' })) } as T
    }
    const res = await chooseImages(items, 'Regeln', ai)
    expect(calls.length).toBe(2) // höchstens 20 Bilder je Anfrage
    expect(calls.every((c) => (c.images?.length ?? 0) <= 20)).toBe(true)
    for (let i = 0; i < 7; i++) expect(res.get(`n${i}`)?.candidate?.title).toBe(`${i}b`)
  })
})

describe('Vokabeltest: Bilder beschriften', () => {
  const settings = { targetLanguage: 'en', grade: 6, level: 'A2' } as TestSettings
  const vocab: VocabEntry[] = [
    { id: 'v1', term: 'ladder', translation: 'Leiter', imageKeywords: ['ladder'], imageHint: 'a wooden ladder' },
    { id: 'v2', term: 'bat', translation: 'Fledermaus', imageKeywords: ['bat animal'], imageHint: 'a bat, the flying animal' }
  ]
  const items = (): PictureItem[] => vocab.map((v) => ({ id: `i-${v.id}`, vocabId: v.id, answer: v.term, imageKeywords: v.imageKeywords! }))

  it('übernimmt nur eindeutige Bilder und prüft Piktogramme und Cliparts gemeinsam', async () => {
    const calls: StructuredRequest[] = []
    const list = items()
    const notes = await findVocabPictures(list, vocab, settings, { ai: fakeAi('eindeutig', calls), services: fakeServices() })
    expect(list.every((i) => i.image)).toBe(true)
    expect(notes).toEqual([])
    expect(calls).toHaveLength(1)
    expect(calls[0].user).toContain('Bedeutung: Fledermaus')
    expect(calls[0].user).toContain('nicht Schläger')
  })

  it('erzeugt ein Clipart, wenn kein Bild eindeutig ist, und prüft es ebenfalls', async () => {
    const prompts: string[] = []
    const list = items()
    // Suchbilder für „bat“ sind mehrdeutig, das erzeugte Clipart wird akzeptiert
    let round = 0
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      round++
      return fakeAi('eindeutig', [], (subject) => round > 1 || !subject.includes('bat'))<T>(req)
    }
    const notes = await findVocabPictures(list, vocab, settings, {
      ai,
      services: fakeServices(),
      generateImage: async (p) => (prompts.push(p), 'data:image/png;base64,KI')
    })
    expect(list[1].image?.source).toBe('ai')
    expect(prompts[0]).toContain('bat, the flying animal')
    expect(prompts[0]).toContain('Fledermaus')
    expect(notes).toEqual([])
  })

  it('ohne passendes Bild bleibt das Bild leer, mit Hinweis', async () => {
    const list = items()
    const notes = await findVocabPictures(list, vocab, settings, { ai: fakeAi('brauchbar'), services: fakeServices() })
    expect(list.every((i) => !i.image)).toBe(true) // „brauchbar“ reicht im Vokabeltest nicht
    expect(notes[0]).toContain('Kein eindeutiges Bild')
  })

  it('setzt ein Ersatzwort aus der ganzen Liste ein, wenn es zu einem Wort kein Bild gibt (03.10.2026)', async () => {
    const list = items()
    const weitere: VocabEntry[] = [{ id: 'v3', term: 'apple', translation: 'Apfel', imageKeywords: ['apple'], depictable: true }]
    // „bat“ ist nie eindeutig; erzeugen lässt sich nichts
    const ai = fakeAi('eindeutig', [], (subject) => !subject.includes('bat'))
    const notes = await findVocabPictures(list, vocab, settings, { ai, services: fakeServices() }, [...vocab, ...weitere])
    expect(list[1].answer).toBe('apple')
    expect(list[1].image).toBeTruthy()
    expect(notes[0]).toContain('Statt „bat“ steht jetzt „apple“')
  })

  it('nennt den Grund, wenn auch das erzeugte Bild verworfen wird', async () => {
    const list = items()
    const ai = fakeAi('eindeutig', [], (subject) => !subject.includes('bat'))
    const notes = await findVocabPictures(list, vocab, settings, { ai, services: fakeServices(), generateImage: async () => 'data:image/png;base64,KI' })
    expect(list[1].image).toBeUndefined()
    expect(notes[0]).toContain('KI-Bild verworfen: mehrdeutig')
  })

  it('meldet, wenn das KI-Bild gar nicht erzeugt werden konnte', async () => {
    const list = items()
    const ai = fakeAi('eindeutig', [], (subject) => !subject.includes('bat'))
    const notes = await findVocabPictures(list, vocab, settings, {
      ai,
      services: fakeServices(),
      generateImage: async () => {
        throw new Error('Codex hat kein Bild erzeugt')
      }
    })
    expect(notes[0]).toContain('KI-Bild nicht erzeugt: Codex hat kein Bild erzeugt')
  })
})

describe('Arbeitsblatt: Bilder für alle Fächer', () => {
  const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'biologie', subjectLabel: 'Biologie', topic: 'Zellen', grade: 7 }
  const block = (id: string, patch: Partial<ImageBlock> = {}): ImageBlock => ({
    id,
    type: 'image',
    description: 'Pflanzenzelle mit Zellwand, Chloroplasten und Vakuole',
    caption: 'Pflanzenzelle',
    widthPercent: 60,
    search: 'plant cell diagram',
    ...patch
  })
  const deps = (ai: ReturnType<typeof fakeAi>, generated: string[] = [], log: string[] = [], empty: string[] = []) => ({
    ai,
    services: fakeServices(log, empty),
    generateImage: async (p: string) => (generated.push(p), 'data:image/png;base64,KI'),
    variants: (q: string) => [q, q.split(' ').slice(0, 2).join(' ')]
  })

  it('sucht gleiche Bilder mehrerer Niveaufassungen nur einmal und setzt Bildnachweis', async () => {
    const log: string[] = []
    const a = block('a')
    const b = block('b')
    const stats = await completeWorksheetImages([a, b], meta, deps(fakeAi('eindeutig'), [], log))
    expect(stats.web).toBe(1)
    expect(a.image?.credit).toContain('Wikimedia Commons')
    expect(b.image?.dataUrl).toBe(a.image?.dataUrl)
    // eine Bildgruppe: genaue und lockerste Suchvariante, nicht je Niveaufassung erneut
    expect(log.filter((l) => l.startsWith('wikimedia:'))).toEqual(['wikimedia:plant cell diagram', 'wikimedia:Pflanzenzelle'])
  })

  it('ersetzt fehlende Bilder durch KI-Bilder, Originalquellen aber nie', async () => {
    const generated: string[] = []
    const normal = block('n', { search: 'nothing', caption: '', description: 'Schema der Fotosynthese' })
    const original = block('q', { search: 'nothing', original: true, caption: 'nothing' })
    const stats = await completeWorksheetImages([normal, original], meta, deps(fakeAi('eindeutig'), generated, [], ['nothing']))
    expect(normal.image?.source).toBe('ai')
    expect(generated[0]).toContain('Schema der Fotosynthese')
    expect(original.image).toBeUndefined()
    expect(original.warnings?.[0]).toContain('Bildquelle')
    // reused bleibt 0: Es wurde kein Vorrat früherer Blätter übergeben
    expect(stats).toEqual({ web: 0, ai: 1, missing: 1, reused: 0, gezeichnet: 0 })
  })

  it('„selbst wählen“ lässt die Platzhalter unverändert', async () => {
    const b = block('p')
    await completeWorksheetImages([b], { ...meta, imageSource: 'placeholder' }, deps(fakeAi('eindeutig')))
    expect(b.image).toBeUndefined()
  })
})

describe('Arbeitsblatt: Bildreihe', () => {
  it('sucht jedes Einzelbild separat und schreibt Bild und Hinweise zurück', async () => {
    const { completeWorksheetImages } = await import('../src/renderer/src/modules/arbeitsblatt/generation/worksheetImages')
    const { defaultMeta } = await import('../src/renderer/src/modules/arbeitsblatt/model/defaults')
    const { convertBlock } = await import('../src/renderer/src/modules/arbeitsblatt/generation/convert')
    const { createRng } = await import('../src/renderer/src/modules/vokabeltest/model/random')
    const block = convertBlock(
      {
        type: 'image',
        title: 'Tiere Australiens',
        imageDescription: 'vier Tiere',
        imageSearch: '',
        imageIsSource: false,
        imageItems: [
          { caption: 'kangaroo', description: 'ein Känguru', search: 'red kangaroo' },
          { caption: 'koala', description: 'ein Koala', search: 'koala' },
          { caption: '', description: 'ein Schnabeltier', search: 'nothing' }
        ]
      },
      createRng(1),
      []
    ) as ImageBlock
    expect(block.items).toHaveLength(3)
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'englisch', subjectLabel: 'Englisch', topic: 'Australia', grade: 7 }
    const stats = await completeWorksheetImages([block], meta, {
      ai: fakeAi('eindeutig'),
      services: fakeServices([], ['nothing']),
      variants: (q: string) => [q]
    })
    expect(stats).toEqual({ web: 2, ai: 0, missing: 1, reused: 0, gezeichnet: 0 })
    expect(block.items![0].image?.credit).toContain('Wikimedia')
    expect(block.items![2].image).toBeUndefined()
    expect(block.warnings?.some((w) => w.startsWith('Bild 3:'))).toBe(true)
  })
})

describe('Keine erfundenen Dokumente', () => {
  it('erzeugt keine KI-Bilder für Stimmzettel, Diagramme und Karten', async () => {
    const { needsRealMaterial } = await import('../src/renderer/src/modules/arbeitsblatt/generation/worksheetImages')
    expect(needsRealMaterial({ caption: 'M1: Stimmzettel zur Bundestagswahl', description: 'Muster eines Stimmzettels' })).toBe(true)
    expect(needsRealMaterial({ caption: 'Klimadiagramm', description: 'Diagramm mit Temperatur und Niederschlag' })).toBe(true)
    expect(needsRealMaterial({ caption: 'Igel', description: 'Foto eines Igels im Laub' })).toBe(false)
  })
})

describe('Suchvarianten', () => {
  it('lässt Füllwörter wie „isolated“ weg, die jede Wikimedia-Suche scheitern lassen', async () => {
    const { sourceSearchVariants } = await import('../src/renderer/src/shared/images')
    const v = sourceSearchVariants('double bass isolated')
    expect(v).toContain('double bass')
    expect(sourceSearchVariants('orchestral timpani isolated')).toContain('orchestral timpani')
  })
})

describe('Arbeitsblatt: Bilder eines früheren Blattes', () => {
  it('nimmt das bekannte Motiv und sucht dafür nicht erneut', async () => {
    const { completeWorksheetImages } = await import('../src/renderer/src/modules/arbeitsblatt/generation/worksheetImages')
    const { defaultMeta } = await import('../src/renderer/src/modules/arbeitsblatt/model/defaults')
    const { reusePool } = await import('../src/renderer/src/shared/imageReuse')

    const reuse = reusePool([
      {
        name: 'Übungsblatt Australien',
        blocks: [{ type: 'image', description: 'ein Känguru', search: 'red kangaroo', image: { dataUrl: 'data:image/png;base64,ALT', source: 'wikimedia' } }]
      }
    ])
    const block: ImageBlock = { id: 'i1', type: 'image', description: 'ein Känguru', search: 'red kangaroo', caption: 'M1', widthPercent: 60 }
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'englisch', subjectLabel: 'Englisch', topic: 'Australia', grade: 7 }

    // Die Bildsuche würde hier scheitern – dass trotzdem ein Bild steht, beweist den Vorrat
    const stats = await completeWorksheetImages([block], meta, {
      ai: fakeAi('eindeutig'),
      services: fakeServices([], ['red kangaroo']),
      variants: (q: string) => [q],
      reuse
    })
    expect(stats.reused).toBe(1)
    expect(stats.missing).toBe(0)
    expect(block.image?.dataUrl).toBe('data:image/png;base64,ALT')
    expect(block.warnings?.some((w: string) => w.includes('Übungsblatt Australien'))).toBe(true)
  })
})
