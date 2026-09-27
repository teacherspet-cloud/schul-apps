import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { buildSheetForTest } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { systemPrompt } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { completeWorksheetImages } from '../src/renderer/src/modules/arbeitsblatt/generation/worksheetImages'
import { istZeitleiste, zeitleisteAusBeschreibung } from '../src/renderer/src/modules/arbeitsblatt/generation/zeitleiste'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { GridBlock, ImageBlock, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { diagramDrawing } from '../src/renderer/src/modules/arbeitsblatt/render/diagramSvg'
import { gridAlt } from '../src/renderer/src/modules/arbeitsblatt/render/BlockView'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import type { ImageServices } from '../src/renderer/src/shared/imageChoice'

/**
 * Wache für die gezeichnete Zeitleiste (27.09.2026): Auf dem Blatt „Julikrise 1914" stand statt
 * der Zeitleiste der Platzhalter „Bild wählen: Breite Zeitachse …" mit dem Hinweis, für
 * Diagramme werde kein KI-Bild erzeugt. Jetzt: Archivbild zuerst; findet sich keines, zeichnet
 * die App die Zeitleiste aus den Daten der Beschreibung – kein KI-Bild, kein Platzhalter.
 */

const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'geschichte', subjectLabel: 'Geschichte', topic: 'Julikrise 1914', grade: 9 }

const TIMELINE = {
  unit: 'day',
  from: '1914-06-28',
  to: '1914-08-04',
  step: 4,
  sections: [],
  yLabel: 'Eskalation',
  yLevels: ['regionaler Konflikt', 'diplomatische Eskalation', 'militärische Eskalation', 'europäischer Krieg'],
  strands: [],
  events: [
    { date: '1914-06-28', text: 'Attentat von Sarajevo', strand: 0, level: 0 },
    { date: '1914-07-23', text: 'Ultimatum an Serbien', strand: 0, level: 1 },
    { date: '1914-07-30', text: 'Russische Generalmobilmachung', strand: 0, level: 2 },
    { date: '1914-08-04', text: 'Einmarsch in Belgien', strand: 0, level: 3 }
  ]
}

const bild = (patch: Partial<ImageBlock> = {}): ImageBlock => ({
  id: 'zeit',
  type: 'image',
  ref: 'zeitleiste',
  description: 'Breite Zeitachse vom 28. Juni bis 4. August 1914. Die Ereigniskarten liegen auf vier ansteigenden Stufen …',
  caption: 'Zeitleiste der Julikrise vom 28. Juni bis 4. August 1914',
  widthPercent: 100,
  search: 'July crisis 1914 timeline',
  role: 'material',
  fn: 'organisation',
  ...patch
})

/** Text-KI: liefert die Zeitleiste als Daten; der Bildprüfer nimmt Kandidaten nur, wenn `annehmen` gesetzt ist */
const ki =
  (calls: StructuredRequest[], annehmen = false) =>
  async <T>(req: StructuredRequest): Promise<T> => {
    calls.push(req)
    if (req.schemaName === 'zeitleiste') return { timeline: TIMELINE } as T
    const entries = [...req.user.matchAll(/- id="([^"]+)": /g)]
    return {
      choices: entries.map(([, id]) =>
        annehmen ? { id, image: 1, fit: 'eindeutig', reason: 'passt' } : { id, image: 0, fit: 'ungeeignet', reason: 'Einwohnerentwicklung, nicht Julikrise' }
      )
    } as T
  }

const dienste = (treffer: boolean): ImageServices => ({
  searchOpenMoji: async () => [],
  openMojiPng: async (hex) => `data:image/png;base64,${hex}`,
  search: async (q) =>
    treffer
      ? [
          {
            id: `${q}-1`,
            title: 'Timeline July crisis',
            thumbnail: 'https://t/1',
            url: 'https://u/1',
            creator: 'Autor',
            license: 'CC0',
            source: 'wikimedia' as const
          }
        ]
      : [],
  fetchImage: async (url) => `data:image/jpeg;base64,${url}`,
  normalize: async (d) => d
})

describe('Zeitleiste aus der Beschreibung', () => {
  it('erkennt Zeitleisten-Beschreibungen', () => {
    expect(istZeitleiste(bild())).toBe(true)
    expect(istZeitleiste({ caption: 'Rotfuchs', description: 'Ein Fuchs im Wald' })).toBe(false)
  })

  it('macht aus der Beschreibung einen gezeichneten Baustein mit Ereignissen, Stufen und derselben Kennung', async () => {
    const calls: StructuredRequest[] = []
    const grid = await zeitleisteAusBeschreibung(bild(), meta, ki(calls))
    expect(grid?.type).toBe('grid')
    expect(grid?.ref).toBe('zeitleiste')
    expect(grid?.id).toBe('zeit')
    expect(grid?.title).toBe('Zeitleiste der Julikrise vom 28. Juni bis 4. August 1914')
    expect(grid?.diagram?.kind).toBe('zeitleiste')
    expect(grid?.diagram?.timeline.events).toHaveLength(4)
    expect(grid?.diagram?.timeline.yLevels).toHaveLength(4)
    expect(grid?.diagram?.timeline.events[1].level).toBe(1)
    expect(calls[0].user).toContain('Breite Zeitachse')
    // Die Zeichnung trägt die Ereignisse in Druckschrift – kein erfundener Text
    const zeichnung = diagramDrawing(grid!.diagram, 170)
    expect(zeichnung.svg).toContain('Attentat von Sarajevo')
    expect(zeichnung.svg).toContain('Einmarsch in Belgien')
    expect(zeichnung.svg).toContain('Eskalation')
    expect(zeichnung.widthMm).toBe(170)
    expect(gridAlt(grid as GridBlock)).toContain('1914-07-23 Ultimatum an Serbien')
  })

  it('ohne mindestens zwei Ereignisse bleibt es beim Platzhalter', async () => {
    const leer = async <T>(): Promise<T> => ({ timeline: { ...TIMELINE, events: [TIMELINE.events[0]] } }) as T
    expect(await zeitleisteAusBeschreibung(bild(), meta, leer)).toBeNull()
  })
})

describe('Bild-Pipeline: Archivbild zuerst, gezeichnete Zeitleiste als Rückfall', () => {
  it('ohne Archivbild wird die Zeitleiste gezeichnet und der Bild-Baustein ersetzt – kein KI-Bild', async () => {
    const calls: StructuredRequest[] = []
    const generated: string[] = []
    const ersetzt: { id: string; block: WsBlock }[] = []
    const b = bild()
    const stats = await completeWorksheetImages([b], meta, {
      ai: ki(calls),
      services: dienste(false),
      generateImage: async (p) => (generated.push(p), 'data:image/png;base64,KI'),
      variants: (q) => [q],
      ersetze: (id, block) => ersetzt.push({ id, block })
    })
    expect(stats).toEqual({ web: 0, ai: 0, missing: 0, reused: 0, gezeichnet: 1 })
    expect(generated).toHaveLength(0)
    expect(ersetzt).toHaveLength(1)
    expect(ersetzt[0].id).toBe('zeit')
    expect(ersetzt[0].block.type).toBe('grid')
    expect((ersetzt[0].block as GridBlock).diagram?.timeline.events).toHaveLength(4)
    expect(ersetzt[0].block.ref).toBe('zeitleiste')
  })

  it('ein passendes Archivbild hat Vorrang – dann wird nichts gezeichnet', async () => {
    const calls: StructuredRequest[] = []
    const ersetzt: unknown[] = []
    const b = bild()
    const stats = await completeWorksheetImages([b], meta, {
      ai: ki(calls, true),
      services: dienste(true),
      variants: (q) => [q],
      ersetze: (id, block) => ersetzt.push({ id, block })
    })
    expect(stats.web).toBe(1)
    expect(stats.gezeichnet).toBe(0)
    expect(b.image?.source).toBe('wikimedia')
    expect(ersetzt).toHaveLength(0)
    expect(calls.some((c) => c.schemaName === 'zeitleiste')).toBe(false)
  })

  it('ohne Rückruf zum Ersetzen bleibt der Hinweis – mit dem Weg über das KI-Menü', async () => {
    const calls: StructuredRequest[] = []
    const b = bild()
    const stats = await completeWorksheetImages([b], meta, { ai: ki(calls), services: dienste(false), variants: (q) => [q] })
    expect(stats.missing).toBe(1)
    expect(b.warnings?.[0]).toContain('Als Zeitleiste zeichnen lassen')
  })
})

describe('Die KI kann die Zeitleiste auch gleich als Baustein liefern', () => {
  it('grid mit variant „zeitleiste" und timeline wird zur gezeichneten Zeitleiste', () => {
    const s = buildSheetForTest({ blocks: [{ type: 'grid', variant: 'zeitleiste', title: 'Zeitleiste', ref: 'zeit', timeline: TIMELINE }] })
    const g = s.blocks[0] as GridBlock
    expect(g.type).toBe('grid')
    expect(g.diagram?.kind).toBe('zeitleiste')
    expect(g.diagram?.timeline.events).toHaveLength(4)
    expect(g.heightMm).toBeGreaterThanOrEqual(45)
    // Ohne Ereignisse bleibt es ein Gitternetz
    const leer = buildSheetForTest({ blocks: [{ type: 'grid', variant: 'karo', title: 'Karo' }] }).blocks[0] as GridBlock
    expect(leer.diagram).toBeUndefined()
  })

  it('der Auftrag verlangt Zeitleisten als Bild mit vollständigen Daten – Archiv zuerst, Zeichnung als Rückfall', () => {
    const prompt = systemPrompt(meta, profileFromMeta(meta))
    expect(prompt).toContain('zeichnet die App die Zeitleiste daraus selbst')
    expect(prompt).toContain('ALLE Ereignisse mit Datum')
  })
})
