import { beforeEach, describe, expect, it } from 'vitest'
import { useMaskottchen, maskottchenBild } from '../src/renderer/src/shared/maskottchenStore'
import { useAppSettings } from '../src/renderer/src/shared/settingsStore'
import { illustrationenAktiv, platziereIllustrationen, platziereKopfUndSchluss, poseFuer } from '../src/renderer/src/modules/arbeitsblatt/generation/illustrationen'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer, newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock, Worksheet, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { MASKOTTCHEN_POSEN, maskottchenId, posePrompt } from '../src/shared/maskottchen'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function blatt(grade: number, blocks: WsBlock[]): Worksheet {
  const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), grade, subjectId: 'mathematik', subjectLabel: 'Mathematik', topic: 'Brüche' }
  return { meta, design: {} as never, outline: null, sheets: [{ id: 's', label: 'Blatt', blocks }], sources: [] } as unknown as Worksheet
}

const aufgabe = (id: string, operator = 'Berechne', kind: 'lines' | 'grid' | 'diagram' = 'grid'): WsBlock => ({
  ...(newBlock('task') as TaskBlock),
  id,
  operator,
  instruction: `${operator} etwas.`,
  answer: { ...emptyAnswer(kind), count: 6 }
})

beforeEach(() => {
  useMaskottchen.setState({ liste: [{ id: 'pengu', name: 'Professor Pengu', beschreibung: 'Pinguin', quelle: 'ki', angelegt: '2026', vorlage: PNG, posen: { winkend: PNG, zeigend: PNG } }], geladen: true })
  useAppSettings.setState((s) => ({ settings: { ...s.settings, illustrationen: { bisKlasse: 6, standardId: 'pengu' } } }))
})

describe('Maskottchen: Speicher und Posen', () => {
  it('kennt zwölf Posen mit eigenem Zweck', () => {
    expect(MASKOTTCHEN_POSEN).toHaveLength(12)
    expect(new Set(MASKOTTCHEN_POSEN.map((p) => p.id)).size).toBe(12)
    expect(posePrompt('ein Pinguin mit Brille', MASKOTTCHEN_POSEN[2])).toContain('ein Pinguin mit Brille')
    expect(maskottchenId('Professor Pengu')).toBe('professor-pengu')
    expect(maskottchenId('Fiona Füchsin')).toBe('fiona-fuechsin')
  })
  it('liefert die Pose, sonst „winkend", sonst die Vorlage – ohne Figur nichts', () => {
    expect(maskottchenBild('pengu', 'zeigend')).toBe(PNG)
    expect(maskottchenBild(undefined, 'denkend')).toBe(PNG)
    useMaskottchen.setState({ liste: [] })
    expect(maskottchenBild('pengu', 'zeigend')).toBeUndefined()
  })
})

describe('Illustrationen: wann und wo', () => {
  it('gelten bis zur eingestellten Klasse; ausdrückliche Wahl am Blatt geht vor', () => {
    expect(illustrationenAktiv({ grade: 5 })).toBe(true)
    expect(illustrationenAktiv({ grade: 7 })).toBe(false)
    expect(illustrationenAktiv({ grade: 9, illustrationen: { an: true } })).toBe(true)
    expect(illustrationenAktiv({ grade: 3, illustrationen: { an: false } })).toBe(false)
    useMaskottchen.setState({ liste: [] })
    expect(illustrationenAktiv({ grade: 5 })).toBe(false)
  })

  it('wählt Posen nach dem Zweck des Bausteins', () => {
    const meta = { subjectId: 'mathematik' }
    expect(poseFuer({ ...newBlock('infoBox'), variant: 'merke' } as WsBlock, meta)).toBe('zeigend')
    expect(poseFuer({ ...newBlock('infoBox'), variant: 'regel' } as WsBlock, meta)).toBe('warnend')
    expect(poseFuer(aufgabe('a', 'Beurteile'), meta)).toBe('denkend')
    expect(poseFuer(aufgabe('b', 'Zeichne', 'diagram'), meta)).toBe('zeichnend')
    expect(poseFuer(aufgabe('c', 'Berechne', 'grid'), meta)).toBe('rechnend')
    expect(poseFuer(newBlock('text') as WsBlock, meta)).toBeNull()
  })

  it('setzt Gruß am Kopf, Figuren an Kästen und höchstens drei Aufgaben, Lob am Schluss', async () => {
    const ws = blatt(5, [
      newBlock('learningGoals') as WsBlock,
      { ...newBlock('infoBox'), id: 'merke', variant: 'merke' } as WsBlock,
      aufgabe('a1', 'Beurteile'),
      aufgabe('a2', 'Beurteile'),
      aufgabe('a3', 'Beurteile'),
      aufgabe('a4', 'Beurteile'),
      { ...newBlock('selfCheck'), id: 'check' } as WsBlock
    ])
    const neu = await platziereIllustrationen(ws)
    const b = neu.sheets[0].blocks
    expect(b[0].illustration?.pose).toBe('winkend')
    expect(b[0].illustration?.bubble).toBeTruthy()
    expect(b[1].illustration?.pose).toBe('zeigend')
    expect(b.filter((x) => x.type === 'task' && x.illustration).length).toBe(3)
    expect(b[6].illustration?.pose).toBe('jubelnd')
    // Ohne Maskottchen-Recht (Klasse 8) bleibt alles leer
    const alt = await platziereIllustrationen(blatt(8, [aufgabe('x')]))
    expect(alt.sheets[0].blocks.some((x) => x.illustration)).toBe(false)
  })

  it('Sprechblasentexte kommen von der KI, sonst feste Sätze', async () => {
    const ws = blatt(4, [newBlock('learningGoals') as WsBlock, aufgabe('a1')])
    const mitKi = await platziereIllustrationen(ws, { ai: async () => ({ gruss: 'Hallo, kleine Bruchrechner!', schluss: 'Klasse gemacht!', tipp: '' }) as never })
    expect(mitKi.sheets[0].blocks[0].illustration?.bubble).toBe('Hallo, kleine Bruchrechner!')
    expect(mitKi.sheets[0].blocks[1].illustration?.bubble).toBe('Klasse gemacht!')
    const ohne = await platziereIllustrationen(ws, { ai: async () => { throw new Error('aus') } })
    expect(ohne.sheets[0].blocks[0].illustration?.bubble).toBe('Hallo! Los geht’s.')
  })

  it('Arbeiten: nur Kopf (winkend) und Schluss (jubelnd), keine Sprechblasen', () => {
    const ws = platziereKopfUndSchluss(blatt(5, [newBlock('infoBox') as WsBlock, aufgabe('a1', 'Beurteile'), aufgabe('a2')]))
    const b = ws.sheets[0].blocks
    expect(b[0].illustration).toEqual({ maskottchenId: undefined, pose: 'winkend' }.maskottchenId === undefined ? { pose: 'winkend' } : b[0].illustration)
    expect(b[1].illustration).toBeUndefined()
    expect(b[2].illustration?.pose).toBe('jubelnd')
    expect(b[2].illustration?.bubble).toBeUndefined()
  })
})
