import { describe, expect, it } from 'vitest'
import { diktatBlattAus } from '../src/renderer/src/modules/arbeitsblatt/generation/diktatBlatt'
import { diktatInhalt, diktatRegeln, moeglicheFehler, niederschrift, STANDARD_DIKTAT, zaehleWoerter } from '../src/renderer/src/modules/arbeitsblatt/didactics/diktat'
import { notenvorschlag } from '../src/shared/diktat'
import type { DiktatBlock, TaskBlock, Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const meta = { subjectId: 'deutsch', subjectLabel: 'Deutsch', grade: 5, stateId: 'NI', topic: 'Im Zoo', title: '', skillFocus: 'diktat', cefrLevel: '', diktat: { ...STANDARD_DIKTAT } }
const ws = (diktat = meta.diktat): Worksheet => ({ meta: { ...meta, diktat }, sheets: [], sources: [], outline: null }) as unknown as Worksheet
const TEXT = 'Im Zoo / gibt es viele Tiere. / Der große Löwe / schläft im Gras. / Ich weiß, / dass er satt ist.'

describe('Diktatblatt (26.11.2026)', () => {
  it('klassisch: nur Diktat und Niederschrift, Zielwörter nur aus dem Text', () => {
    const w = diktatBlattAus(ws(), { title: 'Im Zoo', text: TEXT, zielwoerter: ['große', 'weiß', 'dass', 'Elefant'], phaenomene: ['s, ss oder ß'] })
    const [d, n] = w.sheets[0].blocks as [DiktatBlock, TaskBlock]
    expect(w.sheets[0].blocks.map((b) => b.type)).toEqual(['diktat', 'task'])
    expect(d.zielwoerter).toEqual(['große', 'weiß', 'dass'])
    expect(n.diktat).toBe(d.id)
    expect(n.answer.kind).toBe('lines')
    expect(n.solution).not.toContain('/')
    // Schülerblatt zeigt beim klassischen Diktat nichts vom Text
    expect(diktatInhalt(d, false, notenvorschlag)).toEqual([])
    const lehrkraft = diktatInhalt(d, true, notenvorschlag)
    expect(JSON.stringify(lehrkraft)).toContain('**große**')
  })
  it('Lückendiktat: Zielwörter werden Lücken', () => {
    const w = diktatBlattAus(ws({ ...STANDARD_DIKTAT, form: 'lueckendiktat' }), { text: TEXT, zielwoerter: ['große', 'dass'] })
    const n = w.sheets[0].blocks[1] as TaskBlock
    expect(n.answer.kind).toBe('gapText')
    expect(n.answer.gapText).toContain('Der [[große]] Löwe')
    expect(n.answer.gapText).toContain('[[dass]] er')
  })
  it('Laufdiktat: Schülerblatt zeigt Streifen je Satz', () => {
    const d = diktatBlattAus(ws({ ...STANDARD_DIKTAT, form: 'laufdiktat' }), { text: TEXT }).sheets[0].blocks[0] as DiktatBlock
    const t = diktatInhalt(d, false, notenvorschlag)
    expect(t[0].art).toBe('streifen')
    expect(t[0].art === 'streifen' && t[0].streifen).toHaveLength(3)
  })
  it('Zählen: Wörter und mögliche Fehler (Satzzeichen ohne Kommas)', () => {
    expect(zaehleWoerter(TEXT)).toBe(18)
    expect(moeglicheFehler(TEXT, false)).toBe(21)
    expect(moeglicheFehler(TEXT, true)).toBe(22)
    expect(niederschrift(diktatBlattAus(ws(), { text: TEXT }).sheets[0].blocks[0] as DiktatBlock).answer.count).toBeGreaterThanOrEqual(4)
  })
  it('Regeln: ohne Zusatzwahl keine weiteren Aufgaben, Wortzahl nach Klasse', () => {
    const r = diktatRegeln(meta as never, STANDARD_DIKTAT)
    expect(r).toContain('KEINE weiteren Aufgaben')
    expect(r).toContain('etwa 135 Wörtern')
    expect(diktatRegeln(meta as never, { ...STANDARD_DIKTAT, woerter: 90, zusatz: ['berichtigung'] })).toContain('in nachbereitung')
  })
})
