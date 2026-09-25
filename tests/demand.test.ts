import { describe, expect, it } from 'vitest'
import { checkDemand, demandRules, verbatimShare } from '../src/renderer/src/modules/arbeitsblatt/didactics/demand'

/** Der Materialtext M2 aus dem kritisierten Geschichtsblatt (gekürzt). */
const M2 =
  'Das Osmanische Reich beherrschte lange große Teile Südosteuropas. Im 19. Jahrhundert verlor es dort schrittweise Macht und Gebiete. ' +
  'Nationalismus bezeichnet die starke Bindung an eine Nation und ihren Anspruch auf politische Selbstbestimmung. ' +
  'Viele Bewegungen wollten einen eigenen Staat gründen oder Menschen ihrer Nation in einem Staat vereinen. ' +
  'Dabei beanspruchten verschiedene Staaten teils dieselben Gebiete.'

const textBlock = (glossary: { term: string; explanation: string }[] = []) => ({
  id: 'm2',
  type: 'text' as const,
  title: 'M2 Alte Herrschaft und neue Staaten',
  body: M2,
  glossary,
  lineNumbers: false,
  source: 'Autorentext'
})

const task = (afb: 'I' | 'II' | 'III', operator: string, solution: string, answer?: unknown) => ({
  id: 't1',
  type: 'task' as const,
  instruction: `${operator} anhand von M2 …`,
  operator,
  afb,
  afbReason: '',
  socialForm: 'EA' as const,
  answer: (answer ?? { kind: 'lines', count: 3 }) as never,
  parts: [],
  solution,
  points: 3,
  minutes: 5
})

const sheet = (blocks: unknown[]) => ({ id: 's', label: 'Blatt', blocks }) as never

describe('Operator und Anforderung', () => {
  it('erkennt wörtliche Übernahmen', () => {
    expect(verbatimShare('Viele Bewegungen wollten einen eigenen Staat gründen oder Menschen ihrer Nation vereinen', M2)).toBeGreaterThan(0.5)
    expect(verbatimShare('Die Großmächte nutzten die Schwäche aus, um eigene Einflusszonen abzustecken und Bündnisse zu schmieden', M2)).toBeLessThan(0.2)
  })

  it('meldet genau den Fall „Arbeite heraus“ mit abgeschriebener Lösung', () => {
    // Der Originalfall: Operator aus AFB II, Antwort steht wörtlich im Text
    const findings = checkDemand(
      sheet([
        textBlock(),
        task('II', 'Arbeite heraus', 'Viele Bewegungen wollten einen eigenen Staat gründen oder Menschen ihrer Nation in einem Staat vereinen.')
      ])
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('hoch')
    expect(findings[0].message).toContain('Arbeite heraus')
    expect(findings[0].message).toContain('Wiedergeben')
  })

  it('lässt dieselbe Lösung bei einem Operator des Anforderungsbereichs I zu', () => {
    const findings = checkDemand(
      sheet([textBlock(), task('I', 'Nenne', 'Viele Bewegungen wollten einen eigenen Staat gründen oder Menschen ihrer Nation in einem Staat vereinen.')])
    )
    expect(findings).toHaveLength(0)
  })

  it('lässt eine erschlossene Lösung bei AFB II in Ruhe', () => {
    const findings = checkDemand(
      sheet([
        textBlock(),
        task(
          'II',
          'Arbeite heraus',
          'Weil mehrere junge Staaten dieselben Räume für sich forderten, mussten ihre Ziele zwangsläufig aufeinanderprallen; der Rückzug der alten Macht öffnete dafür erst den Spielraum.'
        )
      ])
    )
    expect(findings).toHaveLength(0)
  })

  it('meldet Aufgabentabellen, die die Materialtabelle nachbilden', () => {
    const materialTable = {
      id: 'm3',
      type: 'table' as const,
      title: 'Interessen und Befürchtungen',
      headers: ['Akteur', 'Interessen', 'Mittel', 'Befürchtungen'],
      rows: [['Russland', 'Meerengen', 'Druck', 'Verdrängung']]
    }
    // Genau der zweite Kritikpunkt: „Charakterisiere“ in eine Tabelle mit denselben Spalten
    const answer = { kind: 'tableFill', count: 0, headers: ['Großmacht', 'Interessen', 'Mittel', 'Befürchtungen'], rows: [], solutionRows: [] }
    const findings = checkDemand(sheet([materialTable, task('II', 'Charakterisiere', 'Russland wollte Einfluss.', answer)]))
    expect(findings.some((f) => f.message.includes('dieselben Spalten'))).toBe(true)
  })

  it('meldet Begriffserklärungen, die den Text doppeln', () => {
    const doppelt = textBlock([{ term: 'der Nationalismus', explanation: 'starke Bindung an eine Nation und ihren Anspruch auf politische Selbstbestimmung' }])
    const findings = checkDemand(sheet([doppelt]))
    expect(findings.some((f) => f.message.includes('Nationalismus'))).toBe(true)
    expect(findings[0].message).toContain('IM Text benutzen')
    // Eine Erklärung, die im Text nicht vorkommt, ist in Ordnung
    const eigen = textBlock([{ term: 'die Pforte', explanation: 'im 19. Jahrhundert die übliche Bezeichnung für die Regierung in Konstantinopel' }])
    expect(checkDemand(sheet([eigen]))).toHaveLength(0)
  })

  it('schreibt die Regeln in den Auftrag', () => {
    const rules = demandRules()
    expect(rules).toContain('NICHT als fertiger Satz im Material')
    expect(rules).toContain('NIE dieselben Spalten')
    expect(rules).toContain('entweder im Text erklärt ODER im Glossar')
  })
})

describe('Aufgaben, die einen Beleg verlangen', () => {
  it('dürfen den Wortlaut des Materials in der Lösung haben', () => {
    const woertlich = 'Viele Bewegungen wollten einen eigenen Staat gründen oder Menschen ihrer Nation in einem Staat vereinen.'
    // „Belege am Text" verlangt genau diesen Wortlaut – das ist kein Mangel
    const beleg = checkDemand(sheet([textBlock(), task('II', 'Belege am Text', woertlich)]))
    expect(beleg).toHaveLength(0)
    // Ohne Belegauftrag bleibt es ein Befund
    expect(checkDemand(sheet([textBlock(), task('II', 'Arbeite heraus', woertlich)]))).toHaveLength(1)
  })
})
