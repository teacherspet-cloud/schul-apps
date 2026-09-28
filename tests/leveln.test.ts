import { describe, expect, it } from 'vitest'
import { inZielsprache, levelAnweisung, levelbar, levelTitel } from '../src/renderer/src/modules/arbeitsblatt/generation/leveln'
import type { WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Leveln (Großprogramm 0.4, F1): Texte als neue Fassung leichter, anspruchsvoller, in Einfacher
 * oder Leichter Sprache, auf einer GER-Stufe oder mit DaZ-Worterklärungen. Originalquellen nie.
 */
const text = (over: Record<string, unknown> = {}): WsBlock =>
  ({ id: 't', type: 'text', title: 'Text', body: 'Ein Sachtext.', source: '', ...over }) as unknown as WsBlock
const meta = { subjectId: 'biologie', subjectLabel: 'Biologie', grade: 7, schoolTypeName: 'Gymnasium', cefrLevel: 'A2' as never }

describe('Leveln', () => {
  it('nur Texte und Kästen, nie Originalquellen oder leere Bausteine', () => {
    expect(levelbar(text()).ok).toBe(true)
    expect(levelbar(text({ source: 'Bismarck, Rede, 1878' })).ok).toBe(false)
    expect(levelbar(text({ source: 'x' })).grund).toMatch(/Originalquelle/)
    expect(levelbar(text({ body: '  ' })).ok).toBe(false)
    expect(levelbar({ id: 'a', type: 'task' } as unknown as WsBlock).ok).toBe(false)
    expect(levelbar({ id: 'k', type: 'infoBox', body: 'Merke …', title: 'Merke' } as unknown as WsBlock).ok).toBe(true)
  })

  it('Fremdsprachen: GER-Stufen statt Einfacher/Leichter Sprache; deutsche Texte im Fremdsprachenfach zählen nicht als Zielsprache', () => {
    expect(inZielsprache(text(), { subjectId: 'englisch' })).toBe(true)
    expect(inZielsprache(text({ language: 'de' }), { subjectId: 'englisch' })).toBe(false)
    expect(inZielsprache(text(), { subjectId: 'biologie' })).toBe(false)
  })

  it('die Aufträge nennen Norm, Regeln und den Schutz des Inhalts', () => {
    const einfach = levelAnweisung('einfach', meta)
    expect(einfach).toMatch(/DIN 8581-1/)
    expect(einfach).toMatch(/Biologie, Klasse 7, Gymnasium/)
    expect(einfach).toMatch(/nichts hinzuerfinden/)
    expect(levelAnweisung('leicht', meta)).toMatch(/DIN SPEC 33429.*\n[\s\S]*eigenen Zeile/)
    expect(levelAnweisung('glossar', meta)).toMatch(/TEXT SELBST NICHT VERÄNDERN[\s\S]*glossary/)
    expect(levelAnweisung('ger-A2', meta)).toMatch(/Niveau A2[\s\S]*glossary mit deutscher Bedeutung/)
    expect(levelAnweisung('ger-B2', meta)).not.toMatch(/glossary mit deutscher Bedeutung/)
    expect(levelTitel('ger-B1')).toBe('Auf Niveau B1 (GER)')
    expect(levelTitel('leicht')).toBe('In Leichter Sprache')
  })
})
