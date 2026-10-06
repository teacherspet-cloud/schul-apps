import { describe, expect, it } from 'vitest'
import { grammatikRekord, paketBereinigt, pruefeGrammatik, regelBeispiele, woerterVon } from '../src/shared/grammatiktrainer'

const roh = {
  regeln: [
    { id: 'r1', titel: 'Simple past', erklaerung: 'Regelmäßig: -ed.', beispiele: ['She played.'] },
    { id: 'r2', titel: 'Fragen', erklaerung: 'Did + Grundform.', beispiele: ['Did you play?'] },
    { id: 'kaputt', titel: '', erklaerung: 'ohne Titel', beispiele: [] }
  ],
  aufgaben: [
    { art: 'luecke', regelId: 'r1', anweisung: 'Setze ein.', satz: 'We ___ yesterday.', vorgabe: '(play)', loesungen: ['played'] },
    { art: 'luecke', regelId: 'r1', anweisung: 'ohne Lücke', satz: 'We played yesterday.', loesungen: ['played'] },
    { art: 'auswahl', regelId: 'r1', satz: 'I ___ it.', loesungen: ['watched'], optionen: ['watch', 'watches'] },
    { art: 'auswahl', regelId: 'r1', satz: 'I ___ it.', loesungen: ['watched'], optionen: ['watch', 'Watched', 'watches'] },
    { art: 'fehler', regelId: 'r1', satz: 'Yesterday I play tennis.', fehlerWort: 'play', loesungen: ['played'] },
    { art: 'fehler', regelId: 'r1', satz: 'Yesterday I play tennis.', fehlerWort: 'plays', loesungen: ['played'] },
    { art: 'satzbau', regelId: 'r2', satz: '', teile: ['Did', 'you', 'play?'], loesungen: [] },
    { art: 'satzbau', regelId: 'r2', satz: '', teile: ['Did', 'you'], loesungen: ['Did you'] },
    { art: 'umformen', regelId: 'unbekannt', satz: 'She played.', vorgabe: 'Verneine.', loesungen: ["She didn't play.", 'She did not play.'] },
    { art: 'quatsch', satz: 'x', loesungen: ['x'] },
    { art: 'luecke', regelId: 'r1', satz: 'We ___ yesterday.', loesungen: ['played'] }
  ]
}

describe('Grammatik-Lern-App: Pool bereinigen', () => {
  const p = paketBereinigt(roh, 'Simple past')
  it('streicht unbrauchbare Aufgaben und Doppeltes', () => {
    expect(p.aufgaben.map((a) => a.art)).toEqual(['luecke', 'auswahl', 'fehler', 'satzbau', 'umformen'])
  })
  it('Regeln ohne Titel fallen weg, unbekannte Regel-Kennung wird zur ersten', () => {
    expect(p.regeln.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(p.aufgaben.find((a) => a.art === 'umformen')?.regelId).toBe('r1')
  })
  it('Satzbau ohne Lösung bekommt den Satz aus den Teilen', () => {
    expect(p.aufgaben.find((a) => a.art === 'satzbau')?.loesungen).toEqual(['Did you play?'])
  })
  it('Thema aus dem Auftrag, wenn die KI keins liefert', () => expect(p.thema).toBe('Simple past'))
})

describe('Grammatik-Lern-App: Antworten prüfen', () => {
  const p = paketBereinigt(roh)
  const art = (a: string) => p.aufgaben.find((x) => x.art === a)!
  it('ganz oder gar nicht – kurze Formen ohne „fast"', () => {
    expect(pruefeGrammatik(art('luecke'), ' Played ').urteil).toBe('richtig')
    expect(pruefeGrammatik(art('luecke'), 'plaied').urteil).toBe('falsch')
  })
  it('Umformen: Kurz- und Langform, Satzzeichen am Ende egal, ein Tippfehler = fast', () => {
    expect(pruefeGrammatik(art('umformen'), 'She did not play').urteil).toBe('richtig')
    expect(pruefeGrammatik(art('umformen'), 'She didn’t play.').urteil).toBe('richtig')
    expect(pruefeGrammatik(art('umformen'), "She didn't plai.").urteil).toBe('fast')
  })
  it('Fehler finden: falsches Wort angetippt = falsch, auch mit richtiger Korrektur', () => {
    expect(pruefeGrammatik(art('fehler'), 'played', 'play').urteil).toBe('richtig')
    expect(pruefeGrammatik(art('fehler'), 'played', 'tennis').urteil).toBe('falsch')
  })
  it('Satzbau: Reihenfolge zählt', () => {
    expect(pruefeGrammatik(art('satzbau'), 'Did you play?').urteil).toBe('richtig')
    expect(pruefeGrammatik(art('satzbau'), 'you Did play?').urteil).toBe('falsch')
  })
  it('Wörter ohne Satzzeichen', () => expect(woerterVon('Yesterday, I play tennis.')).toEqual(['Yesterday', 'I', 'play', 'tennis']))
})

describe('Grammatik-Lern-App: Spiele', () => {
  it('Regel zuordnen nutzt Regelbeispiele und gelöste Lückensätze', () => {
    const b = regelBeispiele(paketBereinigt(roh))
    expect(b).toContainEqual({ satz: 'We played yesterday.', regelId: 'r1' })
    expect(b).toContainEqual({ satz: 'Did you play?', regelId: 'r2' })
  })
  it('Rekord: mehr ist besser, erster Wert zählt immer', () => {
    expect(grammatikRekord('formenblitz', 5, undefined)).toBe(true)
    expect(grammatikRekord('formenblitz', 5, 6)).toBe(false)
    expect(grammatikRekord('formenblitz', 7, 6)).toBe(true)
  })
})
