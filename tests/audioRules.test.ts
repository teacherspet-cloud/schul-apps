import { describe, expect, it } from 'vitest'
import { AI_AUDIO_NOTE, audioRulesFor, hoerenIstPruefgegenstand, playsLabelFor } from '../src/renderer/src/modules/arbeitsblatt/didactics/audioRules'

/*
 * Zwei Regelwerke, die einander widersprechen – und beide sind richtig:
 *
 * KMK-Bildungsstandards fortgeführte Fremdsprache (2012): Der Hörtext wird zweimal gehört,
 * das Transkript bleibt beim Lehrkraft-Teil. Läge es der Klasse vor, prüfte man Lesen.
 *
 * EPA Geschichte 3.3.3: Auditive Medienprodukte müssen „während der Prüfung ständig
 * abrufbar sein" und sind „in verschriftlichter Form beizufügen (z. B. Redemanuskript,
 * Liedtext)". Dort ist die Aufnahme Material, nicht Prüfgegenstand.
 */
describe('Hörtext-Regeln je Fach', () => {
  it('erkennt, wo das Hören selbst geprüft wird', () => {
    expect(hoerenIstPruefgegenstand('englisch')).toBe(true)
    expect(hoerenIstPruefgegenstand('franzoesisch')).toBe(true)
    // Deutsch: „Verstehend zuhören" ist Kernbereich der Bildungsstandards (ESA/MSA 2022)
    expect(hoerenIstPruefgegenstand('deutsch')).toBe(true)
    expect(hoerenIstPruefgegenstand('daz')).toBe(true)
    expect(hoerenIstPruefgegenstand('geschichte')).toBe(false)
    expect(hoerenIstPruefgegenstand('biologie')).toBe(false)
  })

  it('hält in den Sprachen am zweimaligen Hören ohne Transkript fest', () => {
    const r = audioRulesFor('englisch')
    expect(r.plays).toBe(2)
    expect(r.transcriptOnSheet).toBe(false)
  })

  it('gibt im Sachfach die Aufnahme frei und legt das Transkript bei', () => {
    const r = audioRulesFor('geschichte')
    expect(r.plays).toBe(0)
    expect(r.transcriptOnSheet).toBe(true)
    expect(r.reason).toMatch(/ständig abrufbar/)
  })

  it('begründet beide Regeln nachvollziehbar', () => {
    // Die Begründung landet im Editor und im Lehrkraft-Hinweis – sie muss die Quelle nennen
    expect(audioRulesFor('englisch').reason).toMatch(/KMK/)
    expect(audioRulesFor('geschichte').reason).toMatch(/EPA Geschichte/)
  })

  it('beschriftet die Abspielzahl passend', () => {
    expect(playsLabelFor('englisch', 2)).toBe('zweimal hören')
    expect(playsLabelFor('englisch', 1)).toBe('einmal hören')
    // Im Sachfach ist die Zahl gleichgültig – die Aufnahme bleibt abrufbar
    expect(playsLabelFor('geschichte', 2)).toMatch(/so oft/)
    expect(playsLabelFor('geschichte', 1)).toMatch(/so oft/)
  })

  it('hat eine Kennzeichnung für KI-Aufnahmen', () => {
    // KMK-Handlungsempfehlung KI (10.10.2024): Kennzeichnung KI-generierter Produkte
    expect(AI_AUDIO_NOTE).toMatch(/Künstlicher Intelligenz/)
  })
})
