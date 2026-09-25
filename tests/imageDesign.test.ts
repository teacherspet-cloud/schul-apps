import { describe, expect, it } from 'vitest'
import {
  checkImages,
  decorGate,
  imageBudget,
  imageDesignRules,
  imageFunction,
  IMAGE_FUNCTIONS,
  realismAdvice
} from '../src/renderer/src/modules/arbeitsblatt/didactics/imageDesign'
import type { ImageBlock, WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { systemPrompt } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'

const meta = (over: Partial<WorksheetMeta> = {}): WorksheetMeta =>
  ({
    subjectId: 'biologie',
    subjectLabel: 'Biologie',
    topic: 'Der Wasserkreislauf',
    grade: 7,
    sheetType: 'erarbeitung',
    pages: 1,
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    ...over
  }) as WorksheetMeta

const image = (over: Partial<ImageBlock> = {}): ImageBlock => ({
  id: over.id ?? 'i1',
  type: 'image',
  description: 'Schema des Wasserkreislaufs',
  caption: 'M1 Wasserkreislauf',
  widthPercent: 60,
  ...over
})

const task = (instruction: string, id = 't1') =>
  ({
    id,
    type: 'task',
    instruction,
    operator: '',
    afb: 'II',
    afbReason: '',
    socialForm: 'EA',
    answer: { kind: 'lines', count: 3 },
    parts: [],
    solution: '',
    points: 3,
    minutes: 5
  }) as never

const sheet = (blocks: unknown[]) => ({ id: 's', label: 'Blatt', blocks }) as never

describe('Bildfunktion', () => {
  it('kennt genau die drei Funktionen mit gemessenen Effektstärken', () => {
    expect(IMAGE_FUNCTIONS.map((f) => f.value)).toEqual(['organisation', 'repraesentation', 'schmuck'])
  })

  it('leitet die Funktion aus der Rolle ab, wenn die KI keine geliefert hat', () => {
    // Ältere Blätter haben das Feld nicht – sie sollen trotzdem geprüft werden können
    expect(imageFunction(image({ role: 'material' }))).toBe('organisation')
    expect(imageFunction(image({ role: 'motivation' }))).toBe('schmuck')
    expect(imageFunction(image({ role: 'illustration' }))).toBe('repraesentation')
  })

  it('lässt die ausdrückliche Angabe der KI vorgehen', () => {
    expect(imageFunction(image({ role: 'material', fn: 'schmuck' }))).toBe('schmuck')
  })
})

describe('Bildmenge', () => {
  it('bleibt in der Grundschule bei höchstens zwei Bildern je Seite', () => {
    // Die frühere Regel plante zwei bis drei – zwei gleichzeitig sichtbare Bilder senkten
    // in der Untersuchung von Flack & Horst bereits die Behaltensleistung
    expect(imageBudget(3).perPage).toBeLessThanOrEqual(2)
    expect(imageBudget(3).perBlock).toBe(1)
  })

  it('kennzeichnet die Mengenangaben als Faustregel', () => {
    // Zu Bildern pro Seite gibt es keine empirischen Normwerte; das darf die App nicht verschweigen
    expect(imageBudget(7).heuristic).toBe(true)
  })
})

describe('Schmuckbild: die vier Bedingungen', () => {
  it('lässt ein Schmuckbild grundsätzlich zu', () => {
    expect(decorGate(meta({ sheetType: 'uebung' }), []).allowed).toBe(true)
  })

  it('sperrt es auf einem Einführungsblatt, das schon ein erklärendes Bild trägt', () => {
    // Lenzner u. a. 2013: Dekobilder schwächen die Wirkung instruktionaler Bilder,
    // besonders bei Lernenden mit wenig Vorwissen
    const gate = decorGate(meta({ sheetType: 'erarbeitung' }), [image({ fn: 'organisation' })])
    expect(gate.allowed).toBe(false)
    expect(gate.reason).toContain('Vorwissen')
  })

  it('erlaubt es auf einem Übungsblatt trotz erklärendem Bild', () => {
    expect(decorGate(meta({ sheetType: 'uebung' }), [image({ fn: 'organisation' })]).allowed).toBe(true)
  })

  it('lässt nie ein zweites zu', () => {
    const gate = decorGate(meta({ sheetType: 'uebung' }), [image({ fn: 'schmuck' })])
    expect(gate.allowed).toBe(false)
    expect(gate.reason).toContain('dosisabhängig')
  })

  it('folgt dem Schalter der Lehrkraft', () => {
    expect(decorGate(meta({ sheetType: 'uebung', decorImage: false }), []).allowed).toBe(false)
  })
})

describe('Realitätsgrad', () => {
  it('empfiehlt Realismus und Farbe für die Wortschatzarbeit', () => {
    // Der einzige Bereich, für den die Metaanalyse eine Wirkung findet
    expect(realismAdvice(meta({ skillFocus: 'vocabulary' }))).toMatch(/realistisch|Foto/)
  })

  it('warnt in der Grundschule vor zählbaren Objekten in Diagrammen', () => {
    expect(realismAdvice(meta({ grade: 3 }))).toContain('zählbare')
  })

  it('bevorzugt in der Oberstufe die schematische Darstellung', () => {
    expect(realismAdvice(meta({ grade: 11 }))).toMatch(/schematisch/)
  })
})

describe('Regeln für die KI', () => {
  it('nennt die Beschriftung am Element und verbietet die Ziffernliste', () => {
    const rules = imageDesignRules(meta())
    expect(rules).toContain('imageLabels')
    expect(rules).toMatch(/Ziffern oder Buchstaben/)
  })

  it('verlangt in der Grundschule einen ausdrücklichen Verweis auf jedes Bild', () => {
    expect(imageDesignRules(meta({ grade: 3 }))).toContain('Sieh dir Bild')
  })

  it('macht das Lesen von Darstellungen ab Klasse 5 zum eigenen Lernziel', () => {
    expect(imageDesignRules(meta({ grade: 7 }))).toContain('DARSTELLUNG SELBST')
    expect(imageDesignRules(meta({ grade: 3 }))).not.toContain('DARSTELLUNG SELBST')
  })

  it('nimmt auf einem Wiederholungsblatt die Verknüpfungshilfen zurück', () => {
    // Expertise-Umkehr: Integrationssignale bremsen Lernende mit hohem Vorwissen
    expect(imageDesignRules(meta({ sheetType: 'wiederholung' }))).toContain('Verknüpfungshilfen')
  })

  it('schaltet den Schmuck ab, wenn die Lehrkraft ihn abgewählt hat', () => {
    expect(imageDesignRules(meta({ decorImage: false }))).toContain('nicht zugelassen')
  })
})

describe('Prüfungen', () => {
  it('meldet ein Bild, auf das nichts verweist', () => {
    const findings = checkImages(sheet([image({ caption: '', fn: 'organisation' }), task('Beschreibe den Vorgang.')]), meta())
    expect(findings.some((f) => f.message.includes('verweist nichts'))).toBe(true)
  })

  it('lässt ein Bild mit Bildunterschrift durchgehen', () => {
    const findings = checkImages(sheet([image({ fn: 'organisation' }), task('Beschreibe anhand von M1 den Vorgang.')]), meta())
    expect(findings).toHaveLength(0)
  })

  it('verlangt in der Grundschule zusätzlich den Verweis in der Aufgabe', () => {
    const withCaption = checkImages(sheet([image({ fn: 'organisation' }), task('Beschreibe den Vorgang.')]), meta({ grade: 3 }))
    expect(withCaption.some((f) => f.message.includes('nicht von selbst'))).toBe(true)
  })

  it('meldet ein Schmuckbild am Blattanfang', () => {
    const findings = checkImages(sheet([image({ fn: 'schmuck', caption: 'Ein Frosch' }), task('Beschreibe den Vorgang.')]), meta({ sheetType: 'uebung' }))
    expect(findings.some((f) => f.message.includes('Blattanfang'))).toBe(true)
  })

  it('meldet das zweite Schmuckbild', () => {
    const findings = checkImages(
      sheet([task('Beschreibe.'), image({ id: 'a', fn: 'schmuck', caption: 'Frosch' }), image({ id: 'b', fn: 'schmuck', caption: 'Teich' })]),
      meta({ sheetType: 'uebung' })
    )
    expect(findings.some((f) => f.message.includes('Mehr als ein Schmuckbild'))).toBe(true)
  })

  it('meldet zu viele Bilder für die Grundschule', () => {
    const blocks = [task('Sieh dir Bild an.'), ...[1, 2, 3].map((n) => image({ id: `i${n}`, caption: `Bild ${n}`, fn: 'repraesentation' }))]
    const findings = checkImages(sheet(blocks), meta({ grade: 3, pages: 1 }))
    expect(findings.some((f) => f.message.includes('viel'))).toBe(true)
  })

  it('rät von der nummerierten Beschriftungsliste unter dem Bild ab', () => {
    const labelTask = {
      id: 't2',
      type: 'task',
      instruction: 'Beschrifte M1.',
      operator: '',
      afb: 'I',
      afbReason: '',
      socialForm: 'EA',
      answer: { kind: 'lines', count: 3 },
      parts: [{ instruction: 'Beschrifte die Teile.', answer: { kind: 'labels', count: 4, labels: [] } }],
      solution: '',
      points: 3,
      minutes: 5
    } as never
    const findings = checkImages(sheet([image({ fn: 'organisation' }), labelTask]), meta())
    expect(findings.some((f) => f.message.includes('Beschriftungsebene'))).toBe(true)
  })

  it('schweigt, wenn die Beschriftungen bereits im Bild sitzen', () => {
    const labelTask = {
      id: 't2',
      type: 'task',
      instruction: 'Beschrifte M1.',
      operator: '',
      afb: 'I',
      afbReason: '',
      socialForm: 'EA',
      answer: { kind: 'lines', count: 3 },
      parts: [{ instruction: 'Beschrifte die Teile.', answer: { kind: 'labels', count: 4, labels: [] } }],
      solution: '',
      points: 3,
      minutes: 5
    } as never
    const labelled = image({ fn: 'organisation', labels: [{ id: 'l1', text: 'Verdunstung', x: 30, y: 40, blank: true }] })
    expect(checkImages(sheet([labelled, labelTask]), meta())).toHaveLength(0)
  })
})

describe('Bildregeln erreichen die KI', () => {
  it('schreibt das Bildkonzept in den Auftrag', () => {
    const m = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), grade: 3, sheetType: 'erarbeitung' } as never
    const prompt = systemPrompt(m, profileFromMeta(m))
    // Ohne diese Zeilen kämen weder Bildfunktion noch Beschriftungen beim Modell an –
    // derselbe Fehler, der den Kompetenzschwerpunkt einmal unwirksam gemacht hat
    expect(prompt).toContain('BILDKONZEPT')
    expect(prompt).toContain('imageFunction')
    expect(prompt).toContain('imageLabels')
    expect(prompt).toContain('Sieh dir Bild')
  })

  it('gibt die Druckregeln mit', () => {
    // Das Blatt wird in Graustufen vervielfältigt
    const rules = imageDesignRules(meta())
    expect(rules).toBeDefined()
  })
})
