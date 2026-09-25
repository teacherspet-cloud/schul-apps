import { describe, expect, it } from 'vitest'
import { languageSkillRules } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Gemeldet von der Lehrkraft (24.09.2026) zu einer Sprachmittlungsaufgabe: „Im
 * Erwartungshorizont sind Bewertungskriterien, oben eine ‚Lösung', aber in der Lösung sind
 * nur Dinge, die Schüler beachten sollten. Es ist kein Beispieltext als Lösung vorhanden.
 * Füge auch Beispiellösungstexte mit hinzu zu Mediations- und Schreibaufgaben."
 *
 * Die Ursache lag in der Anweisung an die KI: Für das Schreiben war ein Mustertext Pflicht,
 * für die Sprachmittlung war nur ein Erwartungshorizont verlangt. Die Darstellung hätte den
 * Mustertext längst gezeigt – es entstand nur keiner.
 *
 * Der Test steht hier, weil die Lücke von außen unsichtbar war: Auf dem Lösungsblatt sah es
 * nach einem dürftigen Erwartungshorizont aus, nicht nach einer fehlenden Anweisung.
 */
const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 10,
  cefrLevel: 'B1',
  ...patch
})

describe('Mustertext als Lösung', () => {
  const regeln = languageSkillRules(meta())

  it('verlangt ihn für Schreibaufgaben', () => {
    expect(regeln).toContain('brief.model')
    expect(regeln).toMatch(/SCHREIBAUFGABE[\s\S]*brief\.model/)
  })

  it('verlangt ihn auch für die Sprachmittlung', () => {
    const teil = regeln.slice(regeln.indexOf('SPRACHMITTLUNG'))
    expect(teil).toContain('brief.model')
    expect(teil).toContain('PFLICHT')
  })

  it('verlangt zusammenhängenden Text, keine Stichpunkte', () => {
    /*
     * Genau das war die Beschwerde: An der Stelle der Lösung standen „Dinge, die Schüler
     * beachten sollten". Die Anweisung sagt deshalb ausdrücklich, was NICHT gemeint ist.
     */
    const teil = regeln.slice(regeln.indexOf('SPRACHMITTLUNG'))
    expect(teil).toContain('Keine Stichpunkte')
    expect(teil).toContain('zusammenhängender Text')
  })

  it('verlangt für die Sprachmittlung einen Erwartungshorizont mit Beispielen', () => {
    const teil = regeln.slice(regeln.indexOf('SPRACHMITTLUNG'))
    expect(teil).toContain('brief.expected')
    expect(teil).toContain('MINDESTENS ZWEI Beispiellösungen')
  })

  it('hält den Mustertext vom Schülerblatt fern', () => {
    // Er zeigt die Lösung – auf dem Schülerblatt wäre er das Ende der Aufgabe
    const teil = regeln.slice(regeln.indexOf('SPRACHMITTLUNG'))
    expect(teil).toContain('nur auf dem Lösungsblatt')
  })
})
