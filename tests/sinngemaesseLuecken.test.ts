// Verstehensaufgaben mit Lücken (18.11.2026, Befund 5b „Complete the statements according to M1": mal rot fürs
// Abschreiben, mal rot für eigene Worte, mal grün fürs Abschreiben). Eine Regel: bewertet wird der Inhalt.
import { describe, expect, it } from 'vitest'
import { autoBefund, autoPruefen, sinngemaesseLuecken } from '../src/shared/blattPruefung'
import { aufgabenFeedbackAnfrage, type BlattAufgabe, type BlattFeld } from '../src/shared/blattFreigabe'

const feld = (id: string, bezug: string, text: string): BlattFeld => ({ id, nr: 3, art: 'luecke', seite: 0, bezug, text })
const aufgabe = (anweisung: string, loesungen: string[]): BlattAufgabe => ({
  nr: 3,
  anweisung,
  erwartung: 'Sinngemäße Antworten zählen.',
  schluessel: { teile: [{ teil: -1, art: 'luecke', loesungen }] }
})
const VERSTEHEN = '**Complete** the statements according to M1. Use your own words.'
const felder = [feld('f0', '-1.luecke.0', 'On Saturdays Dad likes to'), feld('f1', '-1.luecke.1', 'In the bathroom there is')]

describe('sinngemäße Lücken', () => {
  it('erkennt Verstehensaufgaben mit Lücken – nicht Grammatik-Lücken', () => {
    expect(sinngemaesseLuecken(aufgabe(VERSTEHEN, ['watch football']))).toBe(true)
    expect(sinngemaesseLuecken(aufgabe('**Fill in** the missing information from M1 using 1 to 3 words.', ['25']))).toBe(true)
    expect(sinngemaesseLuecken({ ...aufgabe('**Complete** the sentences with the simple past.', ['went']), erwartung: '' })).toBe(false)
  })

  it('wörtlich wie die Musterlösung = grün; anderer Wortlaut = keine rote Marke, die KI entscheidet nach dem Inhalt', () => {
    const a = aufgabe(VERSTEHEN, ['watch football / watch football on TV', 'no bath'])
    const e = autoPruefen([a], felder, { f0: 'watch football on TV', f1: 'only a shower' })
    expect(e.marken.f0).toEqual({ m: 'r', w: 'watch football on TV' })
    expect(e.marken.f1).toBeUndefined()
    expect(e.aufgaben['3']).toMatchObject({ richtig: 1, gesamt: 1, nurAuto: false, offen: ['f1'] })
    const b = autoBefund(a, felder, { f0: 'watch football on TV', f1: 'only a shower' })!
    expect(b.einschaetzung).toBeUndefined()
    expect(b.text).toMatch(/NICHT WÖRTLICH WIE DIE MUSTERLÖSUNG – nach dem Inhalt beurteilen/)
    expect(b.text).not.toMatch(/FALSCH/)
  })

  it('Grammatik-Lücken bleiben streng (falsch = rot)', () => {
    const a = { ...aufgabe('**Complete** the sentences with the simple past.', ['went', 'saw']), erwartung: '' }
    const e = autoPruefen([a], felder, { f0: 'goed', f1: 'saw' })
    expect(e.marken.f0?.m).toBe('f')
    expect(e.aufgaben['3']).toMatchObject({ richtig: 1, gesamt: 2, nurAuto: true })
  })

  it('der KI-Auftrag: Abschreiben ist kein Mangel, keine Abschrift-Deckelung, keine roten Sprachmarken', () => {
    const a = aufgabe(VERSTEHEN, ['watch football'])
    const req = aufgabenFeedbackAnfrage(a, 'watches football on TV', [], 'en', { abschrift: { anteil: 0.9, laengste: 4 } as never })
    expect(req.user).toMatch(/VERSTEHENSAUFGABE MIT LÜCKEN/)
    expect(req.user).toMatch(/Abschreiben ist hier KEIN Mangel/)
    expect(req.user).not.toMatch(/BEFUND \(automatisch gezählt, verlässlich\)/)
    expect(req.user).not.toMatch(/EIGENE LEISTUNG/)
    expect(req.user).not.toMatch(/SPRACHE WIE IN EINER KORRIGIERTEN ARBEIT/)
    // Offene Aufgaben (erklären …) behalten die strengen Regeln
    const offen: BlattAufgabe = { nr: 4, anweisung: '**Explain** why Maya likes her room. Use your own words.', erwartung: '' }
    const r2 = aufgabenFeedbackAnfrage(offen, 'x', [], 'en', { abschrift: { anteil: 0.9, laengste: 4 } as never })
    expect(r2.user).toMatch(/EIGENE LEISTUNG/)
    expect(r2.user).toMatch(/BEFUND \(automatisch gezählt, verlässlich\)/)
  })
})
