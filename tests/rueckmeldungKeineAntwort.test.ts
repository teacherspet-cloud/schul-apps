import { describe, expect, it } from 'vitest'
import { klartext, ohneKiTest, trenneNachAufgabe, trennHinweis, trennungAnwenden } from '../src/renderer/src/modules/rueckmeldung/abgabeTrennen'
import { canaryText } from '../src/renderer/src/shared/aiCanary'
import type { Abgabe } from '../src/renderer/src/modules/rueckmeldung/model/types'

/*
 * Fehlerbericht 29.09.2026: Die Word-Fassung der Klassenarbeit (Aufgabe, M1, Erwartungshorizont,
 * Mustertext, unsichtbarer KI-Test) landete als Abgabe – im Textfeld stand rohes HTML samt
 * base64-Bild, die KI folgte dem KI-Test („Hamlet") und das Blatt zeigte das Material.
 */
const kiTest = canaryText('Hamlet', 'en')
// Die Grundlage aus der Klassenarbeit enthält auch den Kopfkasten
const aufgaben = 'i Test\n• Time: 60 minutes\nPart 1: Mediation\nYou help organise a Macbeth film evening for your British partner school.\nWrite an email based on M1, selecting and explaining the review’s relevant findings.'
const wordHtml = (schueler: string): string =>
  `<p>${kiTest}</p><table><tr><td><p><strong>i  Test</strong></p><p>•    Time: 60 minutes</p></td></tr></table>` +
  `<p><strong>Part 1: Mediation</strong></p><p><strong> 1 </strong>  <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABYCAYAAAAKsfL4" />  You help organise a Macbeth film evening for your British partner school.</p>` +
  `<p><strong>Write</strong> an email based on M1, selecting and explaining the review’s relevant findings.</p>${schueler}`

describe('Word-Abgaben: Text statt HTML, ohne KI-Test', () => {
  it('HTML wird zu Zeilen, eingebettete Bilder verschwinden', () => {
    const t = klartext('<p>Dear Sam,</p><p>I think <strong>the film</strong> is &quot;great&quot;.<img src="data:image/png;base64,AAAA" /></p>')
    expect(t).toBe('Dear Sam,\nI think the film is "great".')
    expect(klartext('Hallo <3 Eddie')).toBe('Hallo <3 Eddie')
  })

  it('der unsichtbare KI-Test fällt weg, das Kennwort wird erkannt', () => {
    const r = ohneKiTest(`${kiTest}\nDear Sam, the film is great.`)
    expect(r.text).toBe('Dear Sam, the film is great.')
    expect(r.kennwoerter).toContain('Hamlet')
  })
})

describe('Keine Schülerantwort erkennbar', () => {
  it('Lehrerfassung (Erwartungshorizont, Mustertext): Text leer, deutlicher Hinweis, rückgängig machbar', () => {
    const html = wordHtml('<p><strong>Erwartungshorizont</strong></p><p>Describe how Kurzel presents Macbeth’s violence. 10 P.</p><p><strong>Mustertext</strong></p><p>Dear Sam, …</p>')
    const e = trenneNachAufgabe(html, aufgaben)
    expect(e.keineAntwort).toBe('lehrerfassung')
    expect(e.text).toBe('')
    const a = trennungAnwenden({ id: 'a', kuerzel: 'S1', name: '', dateiname: 'Test.docx', text: html, bilder: [] } as Abgabe, e, 'abgleich')
    expect(a.text).toBe('')
    expect(a.textOriginal).toBe(html)
    expect(trennHinweis(a)).toMatch(/Keine Schülerantwort erkennbar.*Lehrerfassung/)
  })

  it('nur Aufgabe und Material: leer', () => {
    const e = trenneNachAufgabe(wordHtml(''), aufgaben)
    expect(e.keineAntwort).toBe('leer')
  })

  it('echte Abgabe unter dem Aufgabenblatt: nur der Schülertext bleibt, ohne HTML und KI-Test', () => {
    const e = trenneNachAufgabe(wordHtml('<p>Dear Sam,</p><p>I would recommend the film because it changes Lady Macbeth.</p>'), aufgaben)
    expect(e.keineAntwort).toBeUndefined()
    expect(e.text).toContain('Dear Sam,')
    expect(e.text).toContain('I would recommend the film')
    expect(e.text).not.toMatch(/<p>|base64|Kennwort|Formale Vorgabe|You help organise/)
  })
})
