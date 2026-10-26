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

// Regelkarte vor der Runde (26.10.2026, Entscheidung der Lehrkraft): beim ersten Üben einer Form und nach Fehlern
describe('Grammatik-Lern-App: Regeln vor der Runde', () => {
  const regeln = [
    { id: 'r1', titel: 'Simple past', erklaerung: 'x', beispiele: [] },
    { id: 'r2', titel: 'Fragen', erklaerung: 'y', beispiele: [] }
  ]
  const alle = [
    { id: 'a1', regelId: 'r1' },
    { id: 'a2', regelId: 'r1' },
    { id: 'b1', regelId: 'r2' }
  ]
  it('zeigt die Regel beim ersten Mal', async () => {
    const { regelnVorab } = await import('../src/shared/grammatiktrainer')
    expect(regelnVorab(alle, alle, {}, regeln).map((r) => r.id)).toEqual(['r1', 'r2'])
  })
  it('zeigt die Regel nach einer falschen letzten Antwort, nicht nach einer richtigen', async () => {
    const { regelnVorab } = await import('../src/shared/grammatiktrainer')
    const richtig = { versuche: 2, zuletzt: 1000, faellig: 1000 + 86_400_000 }
    const falsch = { versuche: 1, zuletzt: 2000, faellig: 2000 }
    // r1: zuletzt a2 (falsch) → zeigen; r2: richtig → nicht
    expect(regelnVorab(alle, alle, { a1: richtig, a2: falsch, b1: richtig }, regeln).map((r) => r.id)).toEqual(['r1'])
    // r1: zuletzt a1 (richtig, später als a2) → nicht zeigen
    expect(regelnVorab(alle, alle, { a1: { ...richtig, zuletzt: 3000 }, a2: falsch, b1: richtig }, regeln)).toEqual([])
  })
  it('nur Regeln der Runde, Reihenfolge der Aufgaben', async () => {
    const { regelnVorab } = await import('../src/shared/grammatiktrainer')
    expect(regelnVorab([alle[2], alle[0]], alle, {}, regeln).map((r) => r.id)).toEqual(['r2', 'r1'])
  })
})

// Zuordnen und Richtig/Falsch (26.10.2026, Entscheidung der Lehrkraft, ohne KI)
describe('Grammatik-Lern-App: Zuordnen und Richtig/Falsch', () => {
  const p = paketBereinigt({
    regeln: [{ id: 'r1', titel: 'if-clauses', erklaerung: 'x', beispiele: [] }],
    aufgaben: [
      {
        art: 'zuordnen',
        regelId: 'r1',
        anweisung: 'Verbinde.',
        paare: [
          { links: 'If it rains,', rechts: 'we will stay at home.' },
          { links: 'If I were you,', rechts: 'I would go.' },
          { links: 'If she had known,', rechts: 'she would have come.' }
        ]
      },
      {
        art: 'zuordnen',
        regelId: 'r1',
        anweisung: 'zu wenig',
        paare: [
          { links: 'a', rechts: 'b' },
          { links: 'c', rechts: 'd' }
        ]
      },
      {
        art: 'zuordnen',
        regelId: 'r1',
        anweisung: 'doppelt rechts',
        paare: [
          { links: 'a', rechts: 'x' },
          { links: 'b', rechts: 'x' },
          { links: 'c', rechts: 'y' }
        ]
      },
      { art: 'richtigfalsch', regelId: 'r1', anweisung: 'Richtig oder falsch?', satz: 'If it rains, we stay at home.', korrekt: true, loesungen: [] },
      {
        art: 'richtigfalsch',
        regelId: 'r1',
        anweisung: 'Richtig oder falsch?',
        satz: 'If he studys hard, he will pass.',
        korrekt: false,
        fehlerWort: 'studys',
        loesungen: ['studies']
      },
      {
        art: 'richtigfalsch',
        regelId: 'r1',
        anweisung: 'Richtig oder falsch?',
        satz: 'If he studys hard, he will pass.',
        korrekt: false,
        fehlerWort: 'studied',
        loesungen: ['studies']
      }
    ]
  })
  const z = p.aufgaben.filter((a) => a.art === 'zuordnen')
  const rf = p.aufgaben.filter((a) => a.art === 'richtigfalsch')
  it('bereinigt: Zuordnen braucht 3 Paare mit eindeutigen rechten Hälften, Falsch-Sätze ein Fehlerwort im Satz', () => {
    expect(z).toHaveLength(1)
    expect(z[0].loesungen[0]).toContain('If it rains, we will stay at home.')
    expect(rf.map((a) => a.korrekt)).toEqual([true, false])
    expect(rf[0].loesungen).toEqual(['If it rains, we stay at home.'])
    expect(rf[0].fehlerWort).toBeUndefined()
  })
  it('Zuordnen: alle richtig = richtig, Hälfte = fast, sonst falsch', () => {
    expect(pruefeGrammatik(z[0], '[0,1,2]').urteil).toBe('richtig')
    expect(pruefeGrammatik(z[0], '[0,1,0]').urteil).toBe('fast')
    expect(pruefeGrammatik(z[0], '[2,0,1]').urteil).toBe('falsch')
    expect(pruefeGrammatik(z[0], 'quatsch').urteil).toBe('falsch')
  })
  it('Richtig/Falsch: Beurteilung, Wort und Korrektur', () => {
    expect(pruefeGrammatik(rf[0], '{"richtig":true}').urteil).toBe('richtig')
    expect(pruefeGrammatik(rf[0], '{"richtig":false,"wort":"stay","korrektur":"stays"}').urteil).toBe('falsch')
    expect(pruefeGrammatik(rf[1], '{"richtig":true}').urteil).toBe('falsch')
    expect(pruefeGrammatik(rf[1], '{"richtig":false,"wort":"studys","korrektur":"Studies"}').urteil).toBe('richtig')
    expect(pruefeGrammatik(rf[1], '{"richtig":false,"wort":"studys","korrektur":"studied"}').urteil).toBe('fast')
    expect(pruefeGrammatik(rf[1], '{"richtig":false,"wort":"hard","korrektur":"studies"}')).toMatchObject({ urteil: 'fast', richtig: 'studys → studies' })
  })
})
