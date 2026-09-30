/**
 * „Vorschlag der App umsetzen" und Standardvorlage „Farbband" – Wünsche der Lehrkraft (30.09.2026).
 *
 * 1. Vorschläge im Hinweis zur Seitenzahl, die sich ohne KI umsetzen lassen (Schreibraum, Bilder,
 *    Hilfekarten), wirken mit einem Klick – eine kleine Stufe mit Untergrenzen.
 * 2. Neue Materialien und neue Installationen starten mit „Farbband"; eine bewusst gewählte
 *    Standardvorlage der Lehrkraft bleibt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BILD_MIN_PROZENT,
  bildBausteine,
  bilderKleiner,
  lokaleVorschlaegeAnwenden,
  lokalUmsetzbar,
  schreibraumBausteine,
  schreibraumKnapper,
  vorschlagKurz
} from '../src/renderer/src/modules/arbeitsblatt/didactics/seitenAktionen'
import { platzVorschlaege, seitenAbweichung } from '../src/renderer/src/modules/arbeitsblatt/didactics/seiten'
import { emptyAnswer, newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { ImageBlock, Sheet, TaskBlock, WorkspaceBlock, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { kreisLage, kreisRadius } from '../src/renderer/src/shared/components/Kreismenue'
import { STANDARD_DESIGN_ID, presetDesigns, standardDesign } from '../src/shared/design'
import { testingRules } from '../src/renderer/src/modules/grammatiktest/model/testRules'
import { emptyKurztest } from '../src/renderer/src/modules/lernzielkontrolle/model/defaults'

// Einstellungen im Speicher statt auf der Platte
const dateien = new Map<string, unknown>()
vi.mock('../src/main/services/storage/settings', () => ({
  readJson: <T>(f: string, fallback: T): T => (dateien.has(f) ? (structuredClone(dateien.get(f)) as T) : fallback),
  writeJson: (f: string, v: unknown): void => void dateien.set(f, structuredClone(v))
}))
const { listDesigns, saveDesign, setDefaultDesign } = await import('../src/main/services/storage/designs')

const aufgabe = (answer: Partial<TaskBlock['answer']>, parts: Partial<TaskBlock['answer']>[] = []): TaskBlock => {
  const t = newBlock('task') as TaskBlock
  t.answer = { ...emptyAnswer(answer.kind ?? 'lines'), ...answer }
  t.parts = parts.map((p, i) => ({ id: `p${i}`, instruction: '', solution: '', answer: { ...emptyAnswer(p.kind ?? 'lines'), ...p } }))
  return t
}
const bild = (widthPercent: number, role?: ImageBlock['role']): ImageBlock => ({ ...(newBlock('image') as ImageBlock), widthPercent, ...(role ? { role } : {}) })

describe('Schreibraum um eine Stufe knapper', () => {
  it('verringert Linien, Kästchenzeilen, freie Flächen und Schreibflächen – auch in Teilaufgaben', () => {
    const t = aufgabe({ kind: 'lines', count: 12 }, [{ kind: 'grid', count: 8 }, { kind: 'space', heightMm: 60 }])
    const w: WorkspaceBlock = { ...(newBlock('workspace') as WorkspaceBlock), heightMm: 40 }
    const blocks: WsBlock[] = [t, w]
    expect(schreibraumKnapper(blocks)).toBe(2)
    expect(t.answer.count).toBe(9)
    expect(t.parts[0].answer.count).toBe(6)
    expect(t.parts[1].answer.heightMm).toBe(45)
    expect(w.heightMm).toBe(30)
  })

  it('hält die Untergrenzen ein und bietet danach nichts mehr an', () => {
    const t = aufgabe({ kind: 'lines', count: 2 })
    const g = aufgabe({ kind: 'grid', count: 3 })
    const s = aufgabe({ kind: 'space', heightMm: 18 })
    const blocks: WsBlock[] = [t, g, s]
    schreibraumKnapper(blocks)
    expect([t.answer.count, g.answer.count, s.answer.heightMm]).toEqual([1, 2, 15])
    expect(schreibraumBausteine(blocks)).toHaveLength(0)
    expect(schreibraumKnapper(blocks)).toBe(0)
  })

  it('lässt Aufgaben ohne Schreibraum (Ankreuzen, Zuordnen) unberührt', () => {
    const mc = aufgabe({ kind: 'multipleChoice', count: 3 })
    expect(schreibraumBausteine([mc])).toHaveLength(0)
  })
})

describe('Bilder um ein Fünftel kleiner', () => {
  it('verkleinert, aber Material nie unter die halbe Breite', () => {
    const a = bild(60)
    const m = bild(55, 'material')
    const klein = bild(BILD_MIN_PROZENT.sonst)
    expect(bildBausteine([a, m, klein])).toHaveLength(2)
    expect(bilderKleiner([a, m, klein])).toBe(2)
    expect(a.widthPercent).toBe(48)
    expect(m.widthPercent).toBe(BILD_MIN_PROZENT.material)
    expect(klein.widthPercent).toBe(BILD_MIN_PROZENT.sonst)
  })
})

describe('Vorschläge im Hinweis zur Seitenzahl', () => {
  const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), pages: 1, pagesBis: 0 }
  const blatt = (blocks: WsBlock[]): Sheet => ({ id: 's', label: 'Arbeitsblatt', blocks })

  it('bietet Schreibraum und Bilder als umsetzbare Faustregeln an – statt eines reinen Textvorschlags', () => {
    const s = blatt([aufgabe({ kind: 'lines', count: 8 }), bild(70)])
    const a = seitenAbweichung(meta, s, 2)!
    expect(a.vorschlaege.map((v) => v.art)).toEqual(['schreibraumKnapper', 'bilderKleiner'])
    expect(a.vorschlaege.every(lokalUmsetzbar)).toBe(true)
    expect(a.vorschlaege.some((v) => v.art === 'sonstiges')).toBe(false)
  })

  it('ohne Schreibraum und Bilder bleibt der Textvorschlag – ohne Knopf', () => {
    const s = blatt([newBlock('text')])
    const a = seitenAbweichung(meta, s, 2)!
    expect(a.vorschlaege.map((v) => v.art)).toEqual(['sonstiges'])
    expect(lokalUmsetzbar(a.vorschlaege[0])).toBe(false)
  })

  it('setzt mehrere Vorschläge in einem Zug um – jede Art nur einmal', () => {
    const t = aufgabe({ kind: 'lines', count: 8 })
    const b = bild(70)
    const hilfe = { ...(newBlock('scaffold') as WsBlock), variant: 'tipp' } as WsBlock
    const blocks: WsBlock[] = [hilfe, t, b]
    const vorschlaege = [...platzVorschlaege(blatt(blocks)), ...platzVorschlaege(blatt(blocks))]
    vorschlaege.push({ richtung: 'weniger', art: 'hilfenAufKarten', text: '', lokal: true })
    const ergebnis = lokaleVorschlaegeAnwenden(blocks, vorschlaege)
    expect(ergebnis).toEqual([
      { art: 'schreibraumKnapper', geaendert: 1 },
      { art: 'bilderKleiner', geaendert: 1 },
      { art: 'hilfenAufKarten', geaendert: 1 }
    ])
    expect(t.answer.count).toBe(6)
    expect(b.widthPercent).toBe(56)
    expect((hilfe as { variant: string }).variant).toBe('hilfekarten')
  })

  it('kurze Namen für das Kreismenü; KI-Vorschläge sind als solche erkennbar', () => {
    expect(vorschlagKurz({ richtung: 'weniger', art: 'schreibraumKnapper', text: '' })).toBe('Schreibraum knapper')
    expect(vorschlagKurz({ richtung: 'weniger', art: 'materialKuerzen', text: '' })).toContain('(KI)')
    expect(lokalUmsetzbar({ richtung: 'weniger', art: 'materialKuerzen', text: '' })).toBe(false)
  })
})

describe('Kreismenü: Lage der Einträge', () => {
  it('beginnt oben und verteilt gleichmäßig', () => {
    const r = kreisRadius(4)
    expect(kreisLage(0, 4, r)).toEqual({ x: 0, y: -r })
    expect(kreisLage(1, 4, r)).toEqual({ x: r, y: 0 })
    expect(kreisLage(2, 4, r)).toEqual({ x: 0, y: r })
    expect(kreisRadius(8)).toBeGreaterThan(kreisRadius(3))
  })
})

describe('Grammatiktest: Regelhinweise mit umsetzbarem Vorschlag', () => {
  it('„einbetten" nur, solange der Schalter aus ist', () => {
    const basis = { stateId: 'NI', subjectId: 'englisch', grade: 7, graded: true, embedded: false } as Parameters<typeof testingRules>[0]
    expect(testingRules(basis).some((r) => r.aktion === 'einbetten')).toBe(true)
    expect(testingRules({ ...basis, embedded: true }).some((r) => r.aktion)).toBe(false)
  })
})

describe('Standardvorlage „Farbband"', () => {
  beforeEach(() => dateien.clear())

  it('ist in den mitgelieferten Vorlagen die einzige Standardvorlage', () => {
    const standard = presetDesigns().filter((d) => d.isDefault)
    expect(standard.map((d) => d.id)).toEqual([STANDARD_DESIGN_ID])
    expect(standardDesign().name).toBe('Farbband')
    expect(emptyKurztest('NI', 'gymnasium', 'Gymnasium').design.id).toBe(STANDARD_DESIGN_ID)
  })

  it('neue Installation: Farbband ist Standard', () => {
    expect(listDesigns().find((d) => d.isDefault)?.id).toBe(STANDARD_DESIGN_ID)
  })

  it('alte Installation mit dem Werksstandard „Klassisch": wird einmalig auf Farbband umgestellt', () => {
    dateien.set(
      'worksheet-designs.json',
      presetDesigns().map((d) => ({ ...d, isDefault: d.id === 'preset-klassisch' }))
    )
    dateien.set('worksheet-designs-version.json', { version: 3 })
    expect(listDesigns().find((d) => d.isDefault)?.id).toBe(STANDARD_DESIGN_ID)
    // Danach wieder Klassisch gewählt: bleibt so
    setDefaultDesign('preset-klassisch')
    expect(listDesigns().find((d) => d.isDefault)?.id).toBe('preset-klassisch')
  })

  it('eine selbst gewählte andere Standardvorlage bleibt', () => {
    dateien.set(
      'worksheet-designs.json',
      presetDesigns().map((d) => ({ ...d, isDefault: d.id === 'preset-schlicht' }))
    )
    dateien.set('worksheet-designs-version.json', { version: 3 })
    expect(listDesigns().find((d) => d.isDefault)?.id).toBe('preset-schlicht')
  })

  it('als Standard vermerkte Wahl „Klassisch" überlebt die Umstellung', () => {
    dateien.set(
      'worksheet-designs.json',
      presetDesigns().map((d) => ({ ...d, isDefault: d.id === 'preset-klassisch' }))
    )
    dateien.set('worksheet-designs-version.json', { version: 3, standardGewaehlt: true })
    expect(listDesigns().find((d) => d.isDefault)?.id).toBe('preset-klassisch')
  })

  it('eine eigene Vorlage als Standard speichern gilt als bewusste Wahl', () => {
    listDesigns()
    const eigen = { ...standardDesign(), id: 'eigen', name: 'Eigene', isDefault: true }
    saveDesign(eigen)
    expect(dateien.get('worksheet-designs-version.json')).toMatchObject({ standardGewaehlt: true })
    expect(listDesigns().find((d) => d.isDefault)?.id).toBe('eigen')
  })
})
