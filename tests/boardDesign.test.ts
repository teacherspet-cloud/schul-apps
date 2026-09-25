import { describe, expect, it } from 'vitest'
import {
  BOARD_CAPACITY,
  BOARD_FORMATS,
  BOARD_STRUCTURES,
  boardFormatInfo,
  boardList,
  boardRules,
  boardStructureById,
  boardStructuresFor,
  checkBoard,
  chosenFormats
} from '../src/renderer/src/modules/arbeitsblatt/didactics/boardDesign'

describe('Format des Tafelbildes', () => {
  it('ist immer Querformat – die Mitteltafel ist der Regelfall', () => {
    for (const f of BOARD_FORMATS) expect(f.ratio, f.value).toBeGreaterThan(1)
    // Standard-Mitteltafel 200 × 100 cm
    expect(boardFormatInfo().value).toBe('mitteltafel')
    expect(boardFormatInfo().ratio).toBe(2)
    expect(boardFormatInfo('volltafel').ratio).toBe(4)
    // A4 quer, nicht hoch
    expect(boardFormatInfo('heftseite').ratio).toBeCloseTo(1.414, 2)
  })

  it('schreibt Querformat und Platzgrenzen in den Auftrag', () => {
    const rules = boardRules({ subjectId: 'geschichte', grade: 9 }, 'mitteltafel')
    expect(rules).toContain('QUERFORMAT')
    expect(rules).toContain('200 × 100 cm')
    expect(rules).toContain(`höchstens ${BOARD_CAPACITY.maxBlocks} Felder`)
    expect(rules).toContain('LINKS die Aufgabe')
    expect(rules).toContain('AUFBAUSTUFEN')
    expect(rules).toContain('Leitfrage')
  })

  it('erlaubt ganze Sätze nur in den unteren Jahrgängen', () => {
    expect(boardRules({ subjectId: 'deutsch', grade: 5 }, 'mitteltafel')).toContain('ganze Sätze erlaubt')
    expect(boardRules({ subjectId: 'deutsch', grade: 10 }, 'mitteltafel')).toContain('KEINE ganzen Sätze')
  })
})

describe('Strukturformen', () => {
  it('beschreibt jede Form vollständig', () => {
    for (const s of BOARD_STRUCTURES) {
      expect(s.purpose.length, s.id).toBeGreaterThan(10)
      expect(s.construction.length, s.id).toBeGreaterThan(40)
    }
  })

  it('warnt davor, alles Mindmap zu nennen', () => {
    expect(boardStructureById('mindmap')!.purpose).toContain('AUSSCHLIESSLICH Ober- und Unterbegriffe')
    const rules = boardRules({ subjectId: 'politik', grade: 10 }, 'mitteltafel')
    expect(rules).toContain('Mindmap NUR bei Ober- und Unterbegriffen')
  })

  it('hält die Fachregeln fest', () => {
    // Zeitleiste: konstanter Maßstab, braucht Breite
    const zeit = boardStructureById('zeitstrahl')!
    expect(zeit.construction).toContain('KONSTANTEM Maßstab')
    expect(zeit.format).toBe('volltafel')
    // Wirkungsgefüge: Doppelpfeil für Rückkopplung
    expect(boardStructureById('wirkungsgefuege')!.construction).toContain('DOPPELPFEILE')
    // Konfliktanalyse: beide Seiten
    expect(boardStructureById('konfliktanalyse')!.construction).toContain('BEIDE Seiten')
  })

  it('bietet je Fach die passenden Formen an', () => {
    expect(boardStructuresFor('deutsch').map((s) => s.id)).toContain('figurenkonstellation')
    expect(boardStructuresFor('mathematik').map((s) => s.id)).not.toContain('figurenkonstellation')
    expect(boardStructuresFor('mathematik').map((s) => s.id)).toContain('ablauf')
    // Der Vergleich passt überall
    expect(boardStructuresFor('sport').map((s) => s.id)).toContain('vergleich')
  })
})

describe('Prüfung der Tafelfläche', () => {
  const board = (sections: { heading: string; points: string[] }[], title = 'Warum wurde der Balkan zum Krisenherd?') => ({ title, sections })

  it('nimmt ein passendes Tafelbild an', () => {
    expect(checkBoard(board([{ heading: 'Ursachen', points: ['Zerfall des Osmanischen Reiches', 'Nationalismus'] }]))).toHaveLength(0)
  })

  it('meldet fehlende oder nicht fragende Überschrift', () => {
    expect(checkBoard(board([], '')).join(' ')).toContain('fehlt die Überschrift')
    expect(checkBoard(board([], 'Der Balkan vor 1914')).join(' ')).toContain('keine Frage')
  })

  it('meldet zu viele Felder, zu viele Zeilen und zu lange Stichpunkte', () => {
    const viele = Array.from({ length: 6 }, (_, i) => ({ heading: `Feld ${i}`, points: ['kurz'] }))
    expect(checkBoard(board(viele)).join(' ')).toContain('Felder sind zu viel')
    const langeListe = [{ heading: 'A', points: Array.from({ length: 15 }, () => 'Punkt') }]
    expect(checkBoard(board(langeListe)).join(' ')).toContain('Zeilen passen nicht')
    const langerPunkt = [{ heading: 'A', points: ['x'.repeat(BOARD_CAPACITY.maxCharsPerLine + 10)] }]
    expect(checkBoard(board(langerPunkt)).join(' ')).toContain('passen nicht in eine Tafelzeile')
  })
})

describe('Je Format ein eigenes Tafelbild', () => {
  const plan = (format?: string) => ({ format, title: 'Frage?', sections: [] }) as never

  it('liest ältere Blätter mit nur einem Tafelbild weiter', () => {
    expect(boardList({ board: plan('display') })).toHaveLength(1)
    expect(chosenFormats({ board: plan('display') })).toEqual(['display'])
    // Ganz ohne Tafelbild gilt die Mitteltafel als Vorgabe
    expect(boardList({})).toHaveLength(0)
    expect(chosenFormats({})).toEqual(['mitteltafel'])
  })

  it('führt mehrere Tafelbilder nebeneinander', () => {
    const ws = { boards: [plan('mitteltafel'), plan('display')] }
    expect(boardList(ws)).toHaveLength(2)
    expect(chosenFormats(ws)).toEqual(['mitteltafel', 'display'])
  })

  it('plant jedes Tafelbild eigens für seine Fläche', () => {
    const display = boardRules({ subjectId: 'politik', grade: 9 }, 'display')
    expect(display).toContain('16:9')
    expect(display).toContain('EIGENS für diese Fläche')
    const tafel = boardRules({ subjectId: 'politik', grade: 9 }, 'mitteltafel')
    expect(tafel).toContain('200 × 100 cm')
    // Die Vorgaben unterscheiden sich wirklich, statt nur den Namen zu tauschen
    expect(display).not.toBe(tafel)
    expect(boardFormatInfo('display').ratio).toBeLessThan(boardFormatInfo('mitteltafel').ratio)
  })
})
