import { describe, expect, it } from 'vitest'
import {
  checkSourceHeaders,
  hasMarkedCuts,
  headerLine,
  isSource,
  missingHeaderParts,
  sourceHeaderRules,
  wantsSourceHeader
} from '../src/renderer/src/modules/arbeitsblatt/didactics/sourceHeader'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { Sheet, TextBlock, WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'geschichte',
  subjectLabel: 'Geschichte',
  grade: 9,
  ...patch
})

const quelle = (patch: Partial<TextBlock> = {}): TextBlock => ({
  id: 'q1',
  type: 'text',
  title: 'Q1: Rede vor dem Reichstag',
  body: 'Wir wollen […] den Frieden.',
  lineNumbers: true,
  source: 'Stenographische Berichte, Bd. 306, S. 12.',
  glossary: [],
  sourceHeader: { author: 'Reichskanzler', date: '4. August 1914', textType: 'Rede', found: 'Stenographische Berichte' },
  ...patch
})

const blatt = (blocks: TextBlock[]): Sheet => ({ id: 's1', label: 'Arbeitsblatt', blocks })

/*
 * Belegte Grundlage: EPA Geschichte 3.3.3 – „Die Materialien sind entsprechend der
 * wissenschaftlichen Zitierweise genau zu benennen. Sie sind am Rand mit einer Zeilenzählung
 * zu versehen." „Kürzungen sind nur behutsam vorzunehmen und kenntlich zu machen."
 * Und 3.2.1: „Quellen sind die Grundlagen unseres Wissens von der Vergangenheit, nicht das
 * Wissen selbst" – ein Sachtext ist eine DARSTELLUNG, keine Quelle.
 */
describe('Materialkopf einer Quelle', () => {
  it('gilt in Geschichte und Politik, nicht in den Fremdsprachen', () => {
    expect(wantsSourceHeader(meta())).toBe(true)
    expect(wantsSourceHeader(meta({ subjectId: 'politik' }))).toBe(true)
    expect(wantsSourceHeader(meta({ subjectId: 'englisch' }))).toBe(false)
  })

  it('setzt die Angaben in eine Zeile', () => {
    expect(headerLine({ author: 'Reichskanzler', textType: 'Rede', date: '1914' })).toBe('Reichskanzler · Rede · 1914')
  })

  it('lässt fehlende Angaben einfach weg, statt Trennzeichen zu häufen', () => {
    expect(headerLine({ author: 'Bismarck', textType: '', date: '1871' })).toBe('Bismarck · 1871')
    expect(headerLine(undefined)).toBe('')
  })

  it('benennt, was fehlt', () => {
    expect(missingHeaderParts({ author: 'X', date: '', textType: '' })).toEqual(['Entstehungsdatum', 'Textsorte'])
    expect(missingHeaderParts({ author: 'X', date: '1914', textType: 'Rede' })).toEqual([])
  })

  it('erkennt gekennzeichnete Kürzungen', () => {
    // Die EPA verlangt, Kürzungen „kenntlich zu machen" – üblich sind […] oder [...]
    expect(hasMarkedCuts('Wir wollen […] den Frieden.')).toBe(true)
    expect(hasMarkedCuts('Wir wollen [...] den Frieden.')).toBe(true)
    expect(hasMarkedCuts('Wir wollen den Frieden.')).toBe(false)
  })

  it('unterscheidet Quelle und Darstellung', () => {
    /*
     * Der schärfste Unterschied zu allen anderen Fächern: Ein Sachtext ist in Geschichte
     * eine DARSTELLUNG und bekommt keinen Materialkopf.
     */
    expect(isSource(quelle())).toBe(true)
    expect(isSource(quelle({ title: 'Die Julikrise', sourceHeader: undefined }))).toBe(false)
  })
})

describe('Prüfung der Materialköpfe', () => {
  it('lässt eine vollständige Quelle unbeanstandet', () => {
    expect(checkSourceHeaders(blatt([quelle()]), meta())).toEqual([])
  })

  it('meldet fehlende Angaben einzeln benannt', () => {
    const t = checkSourceHeaders(blatt([quelle({ sourceHeader: { author: '', date: '', textType: 'Rede', found: '' } })]), meta())
    expect(t[0].message).toMatch(/Verfasser, Entstehungsdatum/)
    expect(t[0].message).toMatch(/Standortgebundenheit/)
  })

  it('meldet fehlende Zeilennummern', () => {
    // Ohne Zeilenzählung lassen sich Textbelege nicht angeben – und die verlangt die App beim Lesen
    const t = checkSourceHeaders(blatt([quelle({ lineNumbers: false })]), meta())
    expect(t.some((w) => /Zeilennummern/.test(w.message))).toBe(true)
  })

  it('rührt Darstellungen nicht an', () => {
    const sachtext = quelle({ title: 'Die Julikrise', sourceHeader: undefined, lineNumbers: false })
    expect(checkSourceHeaders(blatt([sachtext]), meta())).toEqual([])
  })

  it('greift nicht in anderen Fächern', () => {
    expect(checkSourceHeaders(blatt([quelle({ sourceHeader: undefined, lineNumbers: false })]), meta({ subjectId: 'biologie' }))).toEqual([])
  })
})

describe('Regel im KI-Auftrag', () => {
  it('verlangt die Unterscheidung Quelle/Darstellung', () => {
    const r = sourceHeaderRules(meta())
    expect(r).toMatch(/Unterscheide Quelle und Darstellung/)
    expect(r).toMatch(/Sach- oder Verfassertext ist eine DARSTELLUNG/)
  })

  it('nennt alle vier Angaben und die Zeilennummern', () => {
    const r = sourceHeaderRules(meta())
    for (const teil of ['Verfasser', 'Entstehungsdatum', 'Textsorte', 'wissenschaftlicher Zitierweise', 'lineNumbers']) {
      expect(r, teil).toContain(teil)
    }
  })

  it('verlangt gekennzeichnete Kürzungen und Worterklärungen im Glossar', () => {
    const r = sourceHeaderRules(meta())
    expect(r).toMatch(/\[…\] kenntlich gemacht/)
    expect(r).toMatch(/Glossar/)
  })

  it('schweigt in Fächern ohne Quellenarbeit', () => {
    expect(sourceHeaderRules(meta({ subjectId: 'englisch' }))).toBe('')
  })
})
