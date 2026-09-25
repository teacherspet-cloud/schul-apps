import { describe, expect, it } from 'vitest'
import {
  checkNarration,
  hasVerbatimQuote,
  isDeconstruction,
  narrationNote,
  narrationRules,
  wantsNarration
} from '../src/renderer/src/modules/arbeitsblatt/didactics/narration'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { Sheet, WorksheetMeta, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'geschichte',
  subjectLabel: 'Geschichte',
  grade: 8,
  ...patch
})

const erzaehlung = (body: string, fictional = true): WsBlock => ({
  id: 'e1',
  type: 'text',
  title: 'Ein Tag im Jahr 1524',
  body,
  lineNumbers: false,
  source: '',
  glossary: [],
  narration: { perspective: 'ich', fictional }
})

const aufgabe = (instruction: string): WsBlock => ({
  id: 't1',
  type: 'task',
  instruction,
  operator: instruction.split(' ')[0],
  afb: 'II',
  afbReason: '',
  socialForm: 'EA',
  minutes: 8,
  points: 0,
  solution: '',
  answer: emptyAnswer('lines'),
  parts: []
})

const blatt = (blocks: WsBlock[]): Sheet => ({ id: 's1', label: 'Arbeitsblatt', blocks })

/*
 * Entscheidung der Lehrkraft (23.09.2026): Die Ich-Erzählung aus der Innensicht ist erlaubt.
 * Sie ist die fachdidaktisch umstrittenste Form – Pandel lehnt sie ab, Körber hält sie für
 * nicht bewertbar, Memminger und Rox-Helmer halten sie unter AUFLAGEN für tragfähig.
 * Genau diese Auflagen sind hier fest eingebaut und nicht abwählbar.
 */
describe('Geschichtserzählung', () => {
  it('gilt in Geschichte und Politik', () => {
    expect(wantsNarration(meta())).toBe(true)
    expect(wantsNarration(meta({ subjectId: 'englisch' }))).toBe(false)
  })

  it('weist die Erzählung als Darstellung aus, nicht als Quelle', () => {
    expect(narrationNote({ perspective: 'er', fictional: false })).toMatch(/keine Quelle aus der Zeit/)
  })

  it('nennt die erfundene Figur ausdrücklich erfunden', () => {
    /*
     * Die Auflage, unter der die Ich-Form überhaupt vertretbar ist. Ohne sie suggeriert der
     * Text Authentizität, und wer ihn für eine Quelle hält, lernt beim Analysieren das
     * Falsche.
     */
    const n = narrationNote({ perspective: 'ich', fictional: true })
    expect(n).toMatch(/erfunden/)
    expect(n).toMatch(/aus Quellen erschlossen/)
  })

  it('schweigt ohne Erzählung', () => {
    expect(narrationNote(undefined)).toBe('')
  })
})

describe('Wörtliche Zitate in der Erzählung', () => {
  it('erkennt ein Zitat in Anführungszeichen', () => {
    // Körber 2025: KEINE der von ChatGPT zitierten Quellen war verifizierbar
    expect(hasVerbatimQuote('Der Bauer rief: „Wir wollen unsere alten Rechte zurückhaben!"')).toBe(true)
  })

  it('hält einen einzelnen Begriff nicht für ein Zitat', () => {
    expect(hasVerbatimQuote('Man sprach von den „Zwölf Artikeln".')).toBe(false)
  })

  it('meldet das Zitat als Fehler', () => {
    const t = checkNarration(
      blatt([erzaehlung('Er rief: „Wir wollen unsere alten Rechte endlich zurückhaben!"'), aufgabe('**Erkläre** die Perspektive.')]),
      meta()
    )
    expect(t.some((w) => /wörtliches Zitat/.test(w.message))).toBe(true)
  })

  it('lässt eine Paraphrase durch', () => {
    const t = checkNarration(
      blatt([erzaehlung('Die Bauern forderten ihre alten Rechte zurück.'), aufgabe('**Erkläre**, aus welcher Perspektive erzählt wird.')]),
      meta()
    )
    expect(t).toEqual([])
  })
})

describe('Dekonstruktion ist Pflicht', () => {
  it('erkennt eine Aufgabe zur Perspektive oder Absicht', () => {
    expect(isDeconstruction('**Erkläre**, aus welcher Perspektive erzählt wird.')).toBe(true)
    expect(isDeconstruction('**Beurteile** die Absicht des Verfassers.')).toBe(true)
    expect(isDeconstruction('**Nenne** drei Forderungen der Bauern.')).toBe(false)
  })

  it('meldet, wenn sie fehlt', () => {
    /*
     * Ohne sie wirkt der Text wie „die eine Geschichte". Das FUER-Modell führt Dekonstruktion
     * als eigene Teilkompetenz der Methodenkompetenz.
     */
    const t = checkNarration(blatt([erzaehlung('Die Bauern forderten ihre Rechte.'), aufgabe('**Nenne** drei Forderungen.')]), meta())
    expect(t[0].message).toMatch(/Dekonstruktion/)
    expect(t[0].message).toMatch(/die eine Geschichte/)
  })

  it('greift nur, wenn es überhaupt eine Erzählung gibt', () => {
    expect(checkNarration(blatt([aufgabe('**Nenne** drei Forderungen.')]), meta())).toEqual([])
  })

  it('greift nicht in anderen Fächern', () => {
    const s = blatt([erzaehlung('Er rief: „Das ist ein sehr langes wörtliches Zitat hier."')])
    expect(checkNarration(s, meta({ subjectId: 'biologie' }))).toEqual([])
  })
})

describe('Gütekriterien im KI-Auftrag', () => {
  it('trennt Erzählung und Quelle', () => {
    const r = narrationRules(meta())
    expect(r).toMatch(/DARSTELLUNG, keine Quelle/)
    expect(r).toMatch(/Erfinde KEINE Quellen/)
  })

  it('erlaubt die erfundene Figur nur mit Kennzeichnung im Text', () => {
    expect(narrationRules(meta())).toMatch(/erfundene erzählende Figur ist erlaubt.*im Text selbst/s)
  })

  it('verbietet Teleologie und Anachronismen', () => {
    // NRW-Kernlehrplanentwurf 2025: „Vermeidung unhistorischer Linearitätsnarrative", „Kontingenzen"
    const r = narrationRules(meta())
    expect(r).toMatch(/Keine Teleologie/)
    expect(r).toMatch(/nicht verwirklichte Alternativen/)
    expect(r).toMatch(/Keine Anachronismen/)
  })

  it('verlangt mehrere Sichtweisen und eine Kontroverse', () => {
    // Entscheidung der Lehrkraft: mehrere Sichtweisen IN EINEM Text
    const r = narrationRules(meta())
    expect(r).toMatch(/Mehrere Sichtweisen kommen im selben Text vor/)
    expect(r).toMatch(/Kontroverse/)
  })

  it('unterscheidet Deutung und Tatsache', () => {
    // Rüsens narrative Triftigkeit
    expect(narrationRules(meta())).toMatch(/als Deutungen formuliert/)
  })

  it('schweigt in Fächern ohne Erzählung', () => {
    expect(narrationRules(meta({ subjectId: 'englisch' }))).toBe('')
  })
})
