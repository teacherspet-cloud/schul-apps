import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { checkImages } from '../src/renderer/src/modules/arbeitsblatt/didactics/imageDesign'
import { istSchaltplan, schaltplanAusBeschreibung, zeichneSchaltplan } from '../src/renderer/src/modules/arbeitsblatt/generation/schaltplan'
import { completeWorksheetImages } from '../src/renderer/src/modules/arbeitsblatt/generation/worksheetImages'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { ImageBlock, ImageLabel, TaskBlock, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { layoutImageLabels, leitweg } from '../src/renderer/src/modules/arbeitsblatt/render/imageLabelLayout'
import { sanitizeSchaltplan, schaltplanZeichnen, verwaisteBeschriftungen, type SchaltplanSpec } from '../src/renderer/src/modules/arbeitsblatt/render/schaltplanSvg'
import { imageSizeFromDataUrl } from '../src/renderer/src/shared/imageSize'
import type { ImageServices } from '../src/renderer/src/shared/imageChoice'

/*
 * Wache für gezeichnete Schaltpläne (30.09.2026). Befund der Lehrkraft am Blatt „Wann leuchtet
 * die Lampe?" (Physik, Klasse 5): In M1 ragten Linien mit Punkten ins Bild, die „alle ins
 * Nirgendwo" zeigten, und Aufgabe 1 bot für dieselben Namen zusätzlich Schreiblinien 1–5.
 */

const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'physik', subjectLabel: 'Physik', topic: 'Wann leuchtet die Lampe?', grade: 5 }

/** So, wie die KI den Plan für M1 liefern soll: offen links, geschlossen rechts */
const M1_ROH = {
  kreise: [
    {
      titel: 'A: Schalter offen',
      quelle: { beschriftung: 'Batterie', leer: true },
      oben: [{ art: 'lampe', beschriftung: 'Lampe', leer: true }],
      unten: [{ art: 'schalter_offen', beschriftung: 'Unterbrechung', leer: true }],
      zweige: [{ bauteile: [{ art: 'leitung', beschriftung: 'Leitungen', leer: true }] }]
    },
    {
      titel: 'B: Schalter geschlossen',
      quelle: { beschriftung: '', leer: false },
      oben: [{ art: 'lampe', beschriftung: '', leer: false }],
      unten: [{ art: 'schalter_geschlossen', beschriftung: 'Schalter', leer: true }],
      zweige: []
    }
  ]
}

const PARALLEL: SchaltplanSpec = sanitizeSchaltplan({
  kreise: [
    {
      quelle: { beschriftung: 'Batterie' },
      oben: [{ art: 'schalter_offen', beschriftung: 'Schalter' }, { art: 'amperemeter', beschriftung: 'Strommessgerät' }],
      unten: [{ art: 'widerstand', beschriftung: 'Widerstand' }],
      zweige: [{ bauteile: [{ art: 'lampe', beschriftung: 'Lampe 1' }] }, { bauteile: [{ art: 'lampe', beschriftung: 'Lampe 2' }] }, { bauteile: [{ art: 'motor', beschriftung: 'Motor' }] }]
    }
  ]
})!

type P = { x: number; y: number }
/** Alle Strecken einer Beschriftungslinie – bis zum Knick am Bildrand */
function strecken(l: ImageLabel): [P, P][] {
  const weg = leitweg(l)
  const aus = weg[weg.length - 1]
  const knick = { x: l.side === 'left' ? Math.min(aus.x, 4) : Math.max(aus.x, 96), y: aus.y }
  const pts = [...weg, knick]
  return pts.slice(1).map((q, i) => [pts[i], q])
}

/** Schneiden sich eine waagerechte und eine senkrechte Strecke (echte Kreuzung, nicht am Ende)? */
function kreuzen([a, b]: [P, P], [c, d]: [P, P]): boolean {
  const waag = a.y === b.y ? [a, b] : c.y === d.y ? [c, d] : null
  const senk = a.x === b.x ? [a, b] : c.x === d.x ? [c, d] : null
  if (!waag || !senk || waag === senk) return false
  const [w1, w2] = waag
  const [s1, s2] = senk
  const x = s1.x
  const y = w1.y
  const innen = (v: number, p: number, q: number) => v > Math.min(p, q) + 0.05 && v < Math.max(p, q) - 0.05
  return innen(x, w1.x, w2.x) && innen(y, s1.y, s2.y)
}

describe('Schaltplan: Daten und Bereinigung', () => {
  it('erkennt Schaltpläne, aber nicht Fotos von Versuchsaufbauten', () => {
    expect(istSchaltplan({ caption: 'M1 Offener und geschlossener Stromkreis', description: 'Zwei einfache Stromkreise mit Batterie, Lampe und Schalter' })).toBe(true)
    expect(istSchaltplan({ caption: 'Schaltplan', description: 'Reihenschaltung' })).toBe(true)
    expect(istSchaltplan({ caption: 'Versuch', description: 'Foto eines Stromkreises auf dem Experimentiertisch' })).toBe(false)
    expect(istSchaltplan({ caption: 'Rotfuchs', description: 'Ein Fuchs im Wald' })).toBe(false)
  })

  it('verwirft Unbrauchbares: unbekannte Bauteile, leere Zweige, Kreise ohne Bauteil', () => {
    const s = sanitizeSchaltplan({
      kreise: [
        { quelle: {}, oben: [{ art: 'fluxkompensator' }, { art: 'lampe', beschriftung: ' Lampe ', leer: true }], unten: [], zweige: [{ bauteile: [] }] },
        { quelle: {}, oben: [], unten: [], zweige: [] },
        { quelle: {}, oben: [{ art: 'lampe' }], unten: [], zweige: [] }
      ]
    })
    expect(s?.kreise).toHaveLength(1)
    expect(s?.kreise[0].oben).toEqual([{ art: 'lampe', beschriftung: 'Lampe', leer: true }])
    expect(s?.kreise[0].zweige).toEqual([])
    expect(sanitizeSchaltplan({ kreise: [] })).toBeNull()
    expect(sanitizeSchaltplan(null)).toBeNull()
  })
})

describe('Schaltplan: Zeichnung und Anker', () => {
  const m1 = schaltplanZeichnen(sanitizeSchaltplan(M1_ROH)!)

  it('zeichnet DIN-Schaltzeichen, zwei Schaltkreise nebeneinander und ein lesbares Seitenverhältnis', () => {
    expect(m1.svg).toContain('<svg')
    // Lampe = Kreis mit Kreuz, Batterie mit dickem Minuspol, Schalterkontakte
    expect((m1.svg.match(/r="7"/g) ?? []).length).toBe(2)
    expect(m1.svg).toContain('stroke-width="4"')
    expect(m1.svg).toContain('A: Schalter offen')
    expect(m1.breite).toBeGreaterThan(m1.hoehe)
    expect(m1.anker.map((a) => a.art)).toEqual(['batterie', 'lampe', 'schalter_offen', 'leitung', 'batterie', 'lampe', 'schalter_geschlossen'])
  })

  it('jeder Beschriftungspunkt sitzt genau auf dem Anker seines Bauteils – keiner zeigt ins Leere', () => {
    expect(m1.labels.map((l) => l.text)).toEqual(['Batterie', 'Lampe', 'Unterbrechung', 'Leitungen', 'Schalter'])
    for (const l of m1.labels) {
      const a = m1.anker.find((k) => `sp-${k.key}` === l.id)!
      expect(a, l.text).toBeTruthy()
      expect(l.x).toBeCloseTo(a.x, 5)
      expect(l.y).toBeCloseTo(a.y, 5)
      expect(l.blank).toBe(true)
    }
    expect(verwaisteBeschriftungen(sanitizeSchaltplan(M1_ROH)!, m1.labels)).toEqual([])
  })

  it('Linkes Bild beschriftet links, rechtes rechts; Linien rechtwinklig und außerhalb der Leitungen', () => {
    expect(m1.labels.filter((l) => l.id.startsWith('sp-k0')).every((l) => l.side === 'left')).toBe(true)
    expect(m1.labels.filter((l) => l.id.startsWith('sp-k1')).every((l) => l.side === 'right')).toBe(true)
    for (const l of m1.labels) for (const [a, b] of strecken(l)) expect(a.x === b.x || a.y === b.y, `${l.text}: schräge Strecke`).toBe(true)
  })

  for (const [name, spec] of [
    ['M1 (offen/geschlossen)', sanitizeSchaltplan(M1_ROH)!],
    ['Parallelschaltung', PARALLEL]
  ] as const) {
    it(`${name}: keine Beschriftungslinie kreuzt eine andere`, () => {
      const { labels } = schaltplanZeichnen(spec)
      const alle = labels.map((l) => ({ l, s: strecken(l) }))
      const kreuzungen: string[] = []
      for (let i = 0; i < alle.length; i++)
        for (let j = i + 1; j < alle.length; j++)
          for (const s of alle[i].s) for (const t of alle[j].s) if (kreuzen(s, t)) kreuzungen.push(`${alle[i].l.text} × ${alle[j].l.text}`)
      expect(kreuzungen).toEqual([])
    })
  }

  it('Parallelschaltung: Knotenpunkte an den Abzweigen, gleich viele Schilder wie Beschriftungen', () => {
    const z = schaltplanZeichnen(PARALLEL)
    // drei Zweige → zwei innere Zweige mit je zwei Knotenpunkten
    expect((z.svg.match(/r="2.2"/g) ?? []).length).toBe(4)
    expect(z.labels).toHaveLength(7)
  })

  it('das Schild sitzt auf der Höhe, auf der die Linie das Bild verlässt – und Schilder überdecken sich nicht', () => {
    const { labels, svg } = schaltplanZeichnen(PARALLEL)
    const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    const groesse = imageSizeFromDataUrl(url)
    expect(groesse?.width).toBeGreaterThan(0)
    const gesetzt = layoutImageLabels(labels, { imageHeightMm: 60 })
    for (const l of labels) expect(gesetzt.get(l.id)!.side).toBe(l.side)
    const alle = [...gesetzt.values()]
    for (let i = 0; i < alle.length; i++)
      for (let j = i + 1; j < alle.length; j++)
        if (alle[i].side === alle[j].side) expect(Math.abs(alle[i].top - alle[j].top)).toBeGreaterThanOrEqual(alle[i].heightPct / 2 + alle[j].heightPct / 2 - 0.01)
  })

  it('ein verschobener Punkt verliert seinen Leitweg und wird von der Prüfung als verwaist gemeldet', () => {
    const spec = sanitizeSchaltplan(M1_ROH)!
    const labels = schaltplanZeichnen(spec).labels.map((l) => (l.text === 'Lampe' ? { ...l, x: l.x + 20, y: l.y + 30 } : l))
    const lampe = labels.find((l) => l.text === 'Lampe')!
    expect(leitweg(lampe)).toEqual([{ x: lampe.x, y: lampe.y }])
    expect(verwaisteBeschriftungen(spec, labels).map((l) => l.text)).toEqual(['Lampe'])
  })
})

// ---------- Ablauf beim Erstellen ----------

const bild = (patch: Partial<ImageBlock> = {}): ImageBlock => ({
  id: 'm1',
  type: 'image',
  ref: 'stromkreise',
  description: 'Zwei Schaltpläne nebeneinander: links ein offener Stromkreis mit Batterie, Lampe und geöffnetem Schalter, rechts derselbe Stromkreis mit geschlossenem Schalter.',
  caption: 'Offener und geschlossener Stromkreis',
  widthPercent: 100,
  search: 'open closed circuit diagram',
  role: 'material',
  fn: 'organisation',
  // So hatte die KI die Punkte geschätzt – ohne das Bild zu kennen
  labels: [
    { id: 'a', text: 'Leitungen', x: 22, y: 18, blank: true },
    { id: 'b', text: 'Lampe', x: 22, y: 42, blank: true }
  ],
  ...patch
})

const aufgabe = (labels: string[]): TaskBlock =>
  ({
    id: 't1',
    type: 'task',
    instruction: '**Benenne** anhand von M{stromkreise} die Bauteile und die Unterbrechung.',
    operator: 'benennen',
    afb: 'I',
    afbReason: '',
    socialForm: 'EA',
    answer: { ...emptyAnswer('labels'), count: labels.length, labels },
    parts: [],
    solution: 'Batterie, Leitungen, Schalter, Lampe; beim offenen Schalter besteht eine Unterbrechung.',
    points: 0,
    minutes: 8
  }) as TaskBlock

const ki =
  (calls: StructuredRequest[], plan: unknown = M1_ROH) =>
  async <T>(req: StructuredRequest): Promise<T> => {
    calls.push(req)
    if (req.schemaName === 'schaltplan') return plan as T
    return { choices: [] } as T
  }

const keineSuche = (gesucht: string[]): ImageServices => ({
  searchOpenMoji: async () => [],
  openMojiPng: async (hex) => `data:image/png;base64,${hex}`,
  search: async (q) => (gesucht.push(q), []),
  fetchImage: async (url) => `data:image/jpeg;base64,${url}`,
  normalize: async (d) => d
})

describe('Schaltplan beim Erstellen: gezeichnet statt gesucht, ein Beschriftungsweg', () => {
  it('die KI bekommt Beschreibung und die Begriffe der Aufgabe', async () => {
    const calls: StructuredRequest[] = []
    await schaltplanAusBeschreibung(bild(), meta, ki(calls), ['Batterie', 'Leitungen'])
    expect(calls[0].schemaName).toBe('schaltplan')
    expect(calls[0].user).toContain('offener Stromkreis')
    expect(calls[0].system).toContain('„Batterie", „Leitungen"')
  })

  it('M1: Begriffe der Aufgabe wandern als leere Linien an die Bauteile, die Aufgabe verzichtet auf die Liste', async () => {
    const b = bild()
    const t = aufgabe(['Batterie', 'Leitungen', 'Schalter', 'Lampe', 'Unterbrechung'])
    const ok = await zeichneSchaltplan([b], [b, t], meta, ki([]))
    expect(ok).toBe(true)
    expect(b.image?.dataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true)
    expect(b.image?.source).toBe('own')
    expect(b.schaltplan?.kreise).toHaveLength(2)
    // Die geschätzten Punkte sind ersetzt – jeder Punkt ankert am Bauteil
    expect(b.labels?.map((l) => l.id).every((id) => id.startsWith('sp-'))).toBe(true)
    expect(verwaisteBeschriftungen(b.schaltplan!, b.labels!)).toEqual([])
    expect(t.answer.kind).toBe('none')
    expect(t.instruction).toContain('(Linien an M{stromkreise})')
    // Die Prüfung meldet weder verwaiste Punkte noch einen doppelten Weg
    const befunde = checkImages({ id: 's', label: 'Blatt', blocks: [b, t] } as never, meta)
    expect(befunde.filter((f) => /Beschriftungspunkt|Doppelter Beschriftungsweg/.test(f.message))).toEqual([])
  })

  it('passt ein Begriff zu keinem Bauteil, bleibt die Liste der Aufgabe – und das Bild ohne Beschriftung', async () => {
    const b = bild()
    const t = aufgabe(['Batterie', 'Lampe', 'Glühwendel'])
    await zeichneSchaltplan([b], [b, t], meta, ki([]))
    expect(b.labels).toBeUndefined()
    expect(t.answer.kind).toBe('labels')
    expect(b.warnings?.[0]).toContain('ohne Beschriftung')
  })

  it('in der Bild-Pipeline: kein Archiv, kein KI-Bild – der Schaltplan wird gezeichnet', async () => {
    const gesucht: string[] = []
    const erzeugt: string[] = []
    const b = bild()
    const t = aufgabe(['Batterie', 'Leitungen', 'Schalter', 'Lampe', 'Unterbrechung'])
    const stats = await completeWorksheetImages([b, t] as WsBlock[], meta, {
      ai: ki([]),
      services: keineSuche(gesucht),
      generateImage: async (p) => (erzeugt.push(p), 'data:image/png;base64,KI'),
      variants: (q) => [q]
    })
    expect(stats.gezeichnet).toBe(1)
    expect(gesucht).toEqual([])
    expect(erzeugt).toEqual([])
    expect(b.schaltplan).toBeTruthy()
  })

  it('liefert die KI keinen Plan, läuft die gewöhnliche Suche – und geschätzte Punkte fallen weg, wenn die Aufgabe Linien bietet', async () => {
    const gesucht: string[] = []
    const b = bild()
    const t = aufgabe(['Batterie', 'Lampe'])
    await completeWorksheetImages([b, t] as WsBlock[], meta, {
      ai: ki([], { kreise: [] }),
      services: keineSuche(gesucht),
      generateImage: async () => 'data:image/png;base64,KI',
      variants: (q) => [q]
    })
    expect(gesucht.length).toBeGreaterThan(0)
    expect(b.image?.source).toBe('ai')
    expect(b.labels).toBeUndefined()
    expect(b.warnings?.join(' ')).toContain('geschätzten Beschriftungspunkte wurden entfernt')
    expect(t.answer.kind).toBe('labels')
  })

  it('ohne Aufgabe mit Liste bleiben geschätzte Punkte auf einem gefundenen Bild – mit Bitte um Prüfung', async () => {
    const b = bild({ description: 'Foto eines Stromkreises mit Glühlampe auf dem Experimentiertisch', caption: 'Versuchsaufbau' })
    await completeWorksheetImages([b] as WsBlock[], meta, {
      ai: ki([]),
      services: keineSuche([]),
      generateImage: async () => 'data:image/png;base64,KI',
      variants: (q) => [q]
    })
    expect(b.labels).toHaveLength(2)
    expect(b.warnings?.join(' ')).toContain('vor der Bildwahl geschätzt')
  })

  it('Prüfung: leere Linien am Bild UND nummerierte Linien in der Aufgabe = doppelter Beschriftungsweg', () => {
    const befunde = checkImages({ id: 's', label: 'Blatt', blocks: [bild(), aufgabe(['Batterie', 'Lampe'])] } as never, meta)
    expect(befunde.some((f) => f.message.startsWith('Doppelter Beschriftungsweg'))).toBe(true)
  })

  it('Prüfung: ein Punkt im gezeichneten Schaltplan, der an keinem Bauteil sitzt, wird gemeldet', () => {
    const spec = sanitizeSchaltplan(M1_ROH)!
    const labels = [...schaltplanZeichnen(spec).labels, { id: 'x', text: 'Widerstand', x: 50, y: 50 }]
    const befunde = checkImages({ id: 's', label: 'Blatt', blocks: [bild({ schaltplan: spec, labels })] } as never, meta)
    expect(befunde.find((f) => f.message.includes('auf kein Bauteil'))?.message).toContain('„Widerstand"')
  })
})
