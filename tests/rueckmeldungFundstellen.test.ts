import { describe, expect, it } from 'vitest'
import { woerterInZeilen } from '../src/renderer/src/modules/arbeitsblatt/render/zeilenTeilung'
import type { Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { fundstellenRegel, fundstellenText, kiAufgaben, mitZeilen } from '../src/renderer/src/modules/rueckmeldung/fundstellen'
import { aufgabeAnfrage, erwartungsEntwurfAnfrage } from '../src/renderer/src/modules/rueckmeldung/aufgabeAusMaterial'

/*
 * Befund der Lehrkraft (23.10.2026): Erwartungshorizont und Bewertungstabelle der Rückmeldung waren
 * allgemein und gingen nicht auf das Material ein; Zeilenangaben müssen aus dem Material stammen,
 * wie die Lernenden es bekommen.
 */

describe('Wörter den gedruckten Zeilen zuordnen', () => {
  it('Wörter mit gleicher Höhe bilden eine Zeile, hochgestellte Ziffern fehlen schon', () => {
    const w = (text: string, zeile: number, kleiner = false) => ({ text, top: zeile * 24 + (kleiner ? 5 : 3), bottom: zeile * 24 + (kleiner ? 19 : 21) })
    expect(woerterInZeilen([w('The', 0), w('town', 0), w('council', 0, true), w('decided,', 1), w('that', 1), w('pupils', 2)])).toEqual([
      'The town council',
      'decided, that',
      'pupils'
    ])
  })
})

const blatt = (lineNumbers: boolean): Worksheet =>
  ({
    meta: { subjectId: 'englisch' },
    sheets: [
      {
        id: 's1',
        label: 'Blatt',
        blocks: [
          { id: 't1', type: 'text', title: 'School rules', body: 'x', lineNumbers, source: '', glossary: [] },
          { id: 'a1', type: 'task', instruction: 'Summarise M1.', parts: [], answer: { kind: 'lines', count: 4 }, afb: 'I', operator: 'summarise', socialForm: 'EA', minutes: 10 }
        ]
      }
    ]
  }) as unknown as Worksheet

describe('Material für die KI', () => {
  it('Texte mit Zeilennummern Zeile für Zeile, mit Materialnummer', () => {
    const text = fundstellenText(blatt(true), new Map([['t1', ['The town council decided', 'that pupils must not']]]))
    expect(text).toContain('M1 Text „School rules“ – MIT ZEILENNUMMERN')
    expect(text).toContain('Z. 1: The town council decided\nZ. 2: that pupils must not')
    expect(text).toContain('Summarise M1.')
    expect(mitZeilen({ aufgaben: '', fundstellen: text })).toBe(true)
  })

  it('ohne Zeilennummern: Hinweis auf Kurzzitate, Regel ohne Zeilenangaben', () => {
    const text = fundstellenText(blatt(false), new Map())
    expect(text).toContain('OHNE Zeilennummern')
    const g = { aufgaben: 'alt', fundstellen: text }
    expect(kiAufgaben(g)).toBe(text)
    expect(fundstellenRegel(g, 'tabelle')).toContain('KEINE Zeilenangaben')
  })

  it('hinterlegter Text, wenn nichts frisch gelesen ist – übertragene Dateien tragen „Z. n:“ schon', () => {
    expect(kiAufgaben({ aufgaben: 'Aufgabe 1' })).toBe('Aufgabe 1')
    expect(mitZeilen({ aufgaben: 'Material:\nZ. 1: Once upon a time' })).toBe(true)
  })
})

describe('Anfragen an die KI', () => {
  it('Erwartungshorizont: konkret am Material mit Fundstelle, bisheriger wird konkretisiert', () => {
    const user = erwartungsEntwurfAnfrage('M1 …\nZ. 1: The town council decided', 'Englisch', 9, 'englisch', '[Entwurf der KI – bitte prüfen]\nAufgabe 1: Inhalt zusammenfassen').user
    expect(user).toContain('MATERIALBEZUG')
    expect(user).toContain('(M1, Z. 12–15)')
    expect(user).toContain('BISHERIGER ERWARTUNGSHORIZONT:\nAufgabe 1: Inhalt zusammenfassen')
    expect(user).not.toContain('[Entwurf der KI')
  })

  it('hochgeladenes Material: vollständig und mit gedruckter Zählung übertragen', () => {
    const user = aufgabeAnfrage([{ fileName: 'a.pdf', text: 'Text' }]).user
    expect(user).toContain('VOLLSTÄNDIG')
    expect(user).toContain('„Z. n: “')
    expect(user).not.toContain('die ersten Sätze')
  })
})
