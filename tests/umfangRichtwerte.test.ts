import { describe, expect, it } from 'vitest'
import { umfangRegeln } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { systemPrompt } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { buildLearnerProfile } from '../src/renderer/src/modules/arbeitsblatt/didactics/profile'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Wunsch der Lehrkraft (24.09.2026): Seitenzahl, Umfang des Schülertextes und Umfang des
 * Ausgangstextes sollen Vorschläge sein, die erhöht werden dürfen, „wenn der Aufgaben- und
 * Materialumfang dies erfordert".
 *
 * Eine Quelle lässt sich nicht auf 200 Wörter kürzen, ohne ihren Sinn zu verlieren, und vier
 * Inhaltspunkte brauchen mehr als 120 Wörter. Wer die Zahl erzwingt, bekommt entweder ein
 * überfülltes Blatt oder eine verstümmelte Aufgabe.
 */
const meta = (over: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  topic: 'A school trip',
  grade: 10,
  pages: 2,
  ...over
})

describe('Umfangsangaben sind Richtwerte', () => {
  it('nennt alle drei Vorgaben als Vorschlag', () => {
    const r = umfangRegeln(meta())
    expect(r).toContain('RICHTWERTE, KEINE OBERGRENZEN')
    expect(r).toContain('Seitenzahl')
    expect(r).toContain('Umfang des Schülertextes')
    expect(r).toContain('Umfang des Ausgangstextes')
  })

  it('nennt die eingestellte Seitenzahl', () => {
    expect(umfangRegeln(meta({ pages: 3 }))).toContain('(3)')
  })

  it('begrenzt das Überschreiten', () => {
    /*
     * Ohne Grenze käme aus „eine Seite" leicht ein vierseitiges Blatt. Eine Seite mehr und
     * ein Viertel mehr Wörter ist der Spielraum, den man beim Kopieren noch verkraftet.
     */
    const r = umfangRegeln(meta())
    expect(r).toContain('Höchstens EINE Seite mehr')
    expect(r).toContain('ein Viertel mehr Wörter')
  })

  it('verbietet das Unterschreiten', () => {
    // Weniger als gewünscht wäre keine Hilfe, sondern eine stillschweigende Kürzung
    expect(umfangRegeln(meta())).toContain('UNTERSCHREITE die Vorgaben nicht')
  })

  it('verlangt eine Begründung im Lehrkraft-Hinweis', () => {
    /*
     * Sonst merkt die Lehrkraft erst beim Ausdrucken, dass aus zwei Seiten vier geworden
     * sind – und weiß nicht, warum.
     */
    const r = umfangRegeln(meta())
    expect(r).toContain('teacherNote')
    expect(r).toContain('mit Grund und Zahl')
  })

  it('steht im Systemprompt', () => {
    const m = meta()
    expect(systemPrompt(m, buildLearnerProfile(m))).toContain('RICHTWERTE, KEINE OBERGRENZEN')
  })
})
