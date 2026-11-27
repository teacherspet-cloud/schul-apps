import { describe, expect, it } from 'vitest'
import { feedbackOhneLeck, verbesserungNahAmZitat } from '../src/shared/blattKiSchutz'
import { aufgabenFeedbackAus } from '../src/shared/blattFreigabe'

describe('Verbesserung im Randkommentar (27.11.2026)', () => {
  it('nah am Zitat: Rechtschreibung, Präposition, Ausdruck', () => {
    expect(verbesserungNahAmZitat('peope', 'people')).toBe(true)
    expect(verbesserungNahAmZitat('interested for', 'interested in')).toBe(true)
    expect(verbesserungNahAmZitat('make a photo', 'take a photo')).toBe(true)
    expect(verbesserungNahAmZitat('Donde vives?', '¿Dónde vives?')).toBe(true)
  })
  it('keine Lösung durch die Hintertür', () => {
    expect(verbesserungNahAmZitat('because', 'because the government limits the number of certificates every two weeks')).toBe(false)
    expect(verbesserungNahAmZitat('war', 'Versailler Vertrag Reparationen Gebietsverluste Kriegsschuld')).toBe(false)
  })
  it('nur bei Sprachfehlern, nie bei Inhalt oder Lob', () => {
    const fb = aufgabenFeedbackAus({
      einschaetzung: 'teilweise',
      gelungen: '',
      fehlt: '',
      schritt: '',
      markierungen: [
        { zitat: 'peope', art: 'fehler', text: 'Rechtschreibung', zeichen: 'R', verbesserung: 'people' },
        { zitat: 'in 1900', art: 'fehler', text: 'Datum passt nicht', zeichen: 'Inh', verbesserung: 'in 1919' },
        { zitat: 'good point', art: 'lob', text: 'Gut', zeichen: '', verbesserung: 'x' }
      ]
    })
    expect(fb.markierungen?.map((m) => m.verbesserung ?? null)).toEqual(['people', null, null])
  })
  it('Filter lässt die Verbesserung durch, streicht ferne', () => {
    const fb = aufgabenFeedbackAus({
      einschaetzung: 'teilweise',
      markierungen: [
        { zitat: 'peope', art: 'fehler', text: 'Rechtschreibung', zeichen: 'R', verbesserung: 'people' },
        { zitat: 'it', art: 'fehler', text: 'Ausdruck', zeichen: 'A', verbesserung: 'the government auctions certificates every two weeks' }
      ]
    })
    const { fb: aus } = feedbackOhneLeck(fb, 'The government auctions certificates every two weeks.', 'peope it')
    expect(aus.markierungen?.map((m) => m.verbesserung ?? null)).toEqual(['people', null])
  })
})
