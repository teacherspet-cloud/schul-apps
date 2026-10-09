/**
 * Spielnamen und Spieltexte in der Zielsprache (09.10.2026) und die übertragenen Regeln: Schuss erst nach mehreren
 * richtigen Antworten, mehrteilige Aufgaben im Tauziehen, einsprachiges Bingo ab Klasse 7, Fallen in der Satzbaustelle.
 */
import { describe, expect, it } from 'vitest'
import { mehrBeschreibung, spielName, spielText, SPIELNAMEN_SCHLUESSEL, wortartVon } from '../src/shared/spielSprache'
import { MEHRSPIELE, type MehrspielId, type Schwierigkeit, type SpielInhalt } from '../src/shared/mehrspieler/typen'
import { SPIELE } from '../src/shared/vokabelSpiele'
import { GRAMMATIK_SPIELE } from '../src/shared/grammatiktrainer'
import { REGELN, angebotFuer } from '../src/shared/mehrspieler/regeln'
import { lehrwerkBisStand, leererInhalt, synonymeAus, vokItems } from '../src/shared/mehrspieler/inhalt'
import { bekannteWoerter, reiseRunde } from '../src/shared/mehrspieler/spiele/reiseplaner'
import { lexikonFuer } from '../src/shared/mehrspieler/reiseLexikon'
import type { Buch } from '../src/shared/vokabelLaufbahn'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Vokabel } from '../src/shared/vokabeltrainer'
import type { Basis, Block } from '../src/shared/mehrspieler/kern'

const W: [string, string, string, string][] = [
  ['weather', 'Wetter', 'The weather is nice today.', 'n'],
  ['cloud', 'Wolke', 'There is a big cloud over the town.', 'n'],
  ['rain', 'Regen', 'Do you like the rain in autumn?', 'n'],
  ['wind', 'Wind', 'The wind is very strong today.', 'n'],
  ['snow', 'Schnee', 'We play in the snow every winter.', 'n'],
  ['dog', 'Hund', 'My dog runs in the park.', 'n'],
  ['garden', 'Garten', 'We have a small garden behind the house.', 'n'],
  ['run', 'rennen', 'I run to school every morning.', 'v'],
  ['street', 'Straße', 'The street is very long.', 'n'],
  ['road', 'Straße', 'This road goes to the sea.', 'n'],
  ['sea', 'Meer', 'The sea is blue and cold.', 'n'],
  ['train', 'Zug', 'The train leaves at nine.', 'n'],
  ['tent', 'Zelt', 'We sleep in a tent in summer.', 'n'],
  ['ticket', 'Fahrkarte', 'I need a ticket for the train.', 'n'],
  ['big', 'groß', 'London is a big city.', 'adj'],
  ['small', 'klein', 'My room is small but nice.', 'adj'],
  ['sad', 'traurig', 'Why are you so sad today?', 'adj'],
  ['glad', 'froh', 'I am glad you are here.', 'adj']
]
const WOERTER: Vokabel[] = W.map(([term, translation, example, pos], i) => ({ id: `w${i}`, term, translation, example, exampleTranslation: `Satz ${i}.`, pos }))
function inhalt(sprache = 'en'): SpielInhalt {
  const i = leererInhalt('vok', sprache)
  i.items = vokItems(WOERTER)
  i.synonyme = synonymeAus(WOERTER)
  return i
}
type Z = Basis & Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
function starte(id: MehrspielId, i: SpielInhalt, n = 2, schwierigkeit: Schwierigkeit = 'mittel', jahrgang: number | null = 8): Z {
  const spieler = ['a', 'b', 'c', 'd'].slice(0, n).map((x) => ({ id: x, name: x.toUpperCase() }))
  const gemeinsam = Object.fromEntries(i.items.map((x) => [x.id, null]))
  return REGELN[id].start({
    spiel: id,
    spieler,
    schwierigkeit,
    jahrgang,
    inhalt: i,
    band: { gemeinsam, je: Object.fromEntries(spieler.map((s) => [s.id, { ...gemeinsam }])) },
    saat: 99,
    jetzt: 0
  }) as Z
}

describe('Spielnamen in der Zielsprache', () => {
  it('jedes Spiel hat einen Eintrag; Namen nur in der Zielsprache, Rückfall Englisch, DaZ Deutsch', () => {
    for (const s of MEHRSPIELE) expect(SPIELNAMEN_SCHLUESSEL).toContain(`mehr:${s.id}`)
    for (const s of SPIELE) expect(SPIELNAMEN_SCHLUESSEL).toContain(`vok:${s.id}`)
    for (const s of GRAMMATIK_SPIELE) expect(SPIELNAMEN_SCHLUESSEL).toContain(`gram:${s.id}`)
    expect(spielName('mehr', 'fluchtraum', 'en')).toBe('Escape Room')
    expect(spielName('mehr', 'fluchtraum', 'fr')).toBe("L'évasion")
    expect(spielName('mehr', 'fluchtraum', 'la')).toBe('Effugium')
    expect(spielName('mehr', 'tauziehen', 'en-GB')).toBe('Tug of War')
    expect(spielName('mehr', 'schiffe', 'en')).toBe('Battleships')
    expect(spielName('mehr', 'bingo', 'en')).toBe('Word Bingo')
    expect(spielName('mehr', 'satzbaustelle', 'en')).toBe('Sentence Builder')
    expect(spielName('mehr', 'teammatch', 'en')).toBe('Team Match')
    expect(spielName('mehr', 'fluchtraum', 'grc')).toBe('Ἀπόδρασις')
    expect(spielName('mehr', 'fluchtraum', 'sv')).toBe('Escape Room')
    expect(spielName('mehr', 'fluchtraum', 'de')).toBe('Fluchtraum')
    expect(spielName('vok', 'memory', 'es')).toBe('Memoria')
    expect(spielName('gram', 'fehlerjagd', 'it')).toBe("Trova l'errore")
    // Kein Name enthält einen deutschen Untertitel
    for (const k of SPIELNAMEN_SCHLUESSEL) {
      const [art, id] = k.split(':') as ['mehr', string]
      for (const sp of ['en', 'fr', 'es', 'it', 'la']) expect(spielName(art, id, sp)).not.toMatch(/\(/)
    }
  })
  it('Angebot: Name und Regel in der Zielsprache, Klasse 5–6 einfache Sprache', () => {
    const fr = angebotFuer(inhalt('fr'), 8)
    expect(fr.find((a) => a.id === 'tauziehen')!.name).toBe('Tir à la corde')
    expect(fr.find((a) => a.id === 'tauziehen')!.beschreibung).toMatch(/corde/)
    const en5 = angebotFuer(inhalt('en'), 5).find((a) => a.id === 'teammatch')!
    const en9 = angebotFuer(inhalt('en'), 9).find((a) => a.id === 'teammatch')!
    expect(en5.beschreibung).not.toBe(en9.beschreibung)
    expect(en5.beschreibung).toMatch(/phone/)
    expect(mehrBeschreibung('teammatch', 'Deutsch', 'de', 8)).toBe('Deutsch')
  })
  it('Spieltexte: Platzhalter, Rückfall, Wortarten', () => {
    expect(spielText('fr', 8, 'frageVon', 2, 10)).toBe('Question 2 sur 10')
    expect(spielText('ru', 8, 'frageVon', 2, 10)).toBe('Вопрос 2 из 10')
    expect(spielText('sv', 8, 'frageVon', 2, 10)).toBe('Question 2 of 10')
    expect(spielText('en', 5, 'bisBuchstabe', 2)).toBe('2 more right answers for the next letter.')
    expect(spielText('en', 8, 'bisBuchstabe', 2)).toBe('2 more correct answers until the next letter.')
    expect(wortartVon('(n)')).toBe('nomen')
    expect(wortartVon('adj.')).toBe('adj')
    expect(wortartVon('vt')).toBe('verb')
    expect(wortartVon('m./f.')).toBeNull()
  })
  it('Sichten im Spiel in der Zielsprache (Fragezusatz, Rückmeldung)', () => {
    const z = starte('tauziehen', inhalt('es'), 2, 'leicht')
    const f = (REGELN.tauziehen.sicht(z, 'a', 0) as Block[]).find((b) => b.typ === 'frage') as Extract<Block, { typ: 'frage' }>
    expect(f.zusatz).toBe('¿Qué significa?')
    REGELN.tauziehen.zug(z, 'a', { aktion: 'antwort', wert: 'falsch-falsch' }, 0)
    expect(JSON.stringify(REGELN.tauziehen.sicht(z, 'a', 0))).toContain('Respuesta correcta:')
  })
})

describe('Übertragene Regeln', () => {
  it('Schiffe versenken: Schuss erst nach 2 (mittel) bzw. 3 (schwer) richtigen Antworten; Ladung bleibt dem Team', () => {
    const z = starte('schiffe', inhalt(), 2, 'mittel')
    expect(z.noetig).toBe(2)
    expect(starte('schiffe', inhalt(), 2, 'schwer').noetig).toBe(3)
    expect(starte('schiffe', inhalt(), 2, 'schwer', 5).noetig).toBe(2)
    REGELN.schiffe.zug(z, 'a', { aktion: 'antwort', wert: z.fragen.a.loesung }, 0)
    expect(z.schiessen).toBe(false)
    expect(z.teams[z.dran]).toContain('a')
    REGELN.schiffe.zug(z, 'a', { aktion: 'schuss', wert: '0' }, 0)
    expect(Object.keys(z.schuesse[1])).toHaveLength(0)
    REGELN.schiffe.zug(z, 'a', { aktion: 'antwort', wert: z.fragen.a.loesung }, 0)
    expect(z.schiessen).toBe(true)
  })
  it('Tauziehen: ab „schwer" zieht erst die ganze Aufgabe (Summe), ein Fehler macht sie ungültig', () => {
    const z = starte('tauziehen', inhalt(), 2, 'schwer')
    expect(z.teile).toBe(2)
    expect(starte('tauziehen', inhalt(), 2, 'unmoeglich').teile).toBe(3)
    expect(starte('tauziehen', inhalt(), 2, 'mittel').teile).toBe(1)
    REGELN.tauziehen.zug(z, 'a', { aktion: 'antwort', wert: z.fragen.a.loesung }, 0)
    expect(z.seil).toBe(0)
    REGELN.tauziehen.zug(z, 'a', { aktion: 'antwort', wert: z.fragen.a.loesung }, 0)
    expect(z.seil).toBe(-4)
    REGELN.tauziehen.zug(z, 'a', { aktion: 'antwort', wert: z.fragen.a.loesung }, 0)
    REGELN.tauziehen.zug(z, 'a', { aktion: 'antwort', wert: 'xxx-falsch' }, 0)
    expect(z.stand.a).toEqual({ n: 0, p: 0 })
    expect(z.seil).toBe(-4)
  })
  it('Wort-Bingo: ab Klasse 7 Wörter im Feld und Umschreibung als Aufruf (ohne das Wort)', () => {
    const z = starte('bingo', inhalt(), 2, 'mittel', 8)
    const s = REGELN.bingo.sicht(z, 'a', 0) as Block[]
    const feld = s.find((b) => b.typ === 'kacheln') as Extract<Block, { typ: 'kacheln' }>
    const terme = new Set(WOERTER.map((w) => w.term))
    expect(feld.kacheln.every((k) => terme.has(k.text!))).toBe(true)
    const ruf = z.inhalt.items.find((i) => i.id === z.rufe[z.ruf])!
    const text = (s.find((b) => b.typ === 'text' && b.gross) as Extract<Block, { typ: 'text' }>).text
    expect(text).toMatch(/gap|same as/)
    expect(text.toLowerCase().split(/[^a-z]+/)).not.toContain(ruf.vok!.term)
    expect(s.some((b) => b.typ === 'vorlesen')).toBe(false)
    const klein = starte('bingo', inhalt(), 2, 'mittel', 6)
    const feldK = (REGELN.bingo.sicht(klein, 'a', 0) as Block[]).find((b) => b.typ === 'kacheln') as Extract<Block, { typ: 'kacheln' }>
    expect(feldK.kacheln.some((k) => terme.has(k.text!))).toBe(false)
  })
  it('Satzbaustelle: Fallen-Wörter ab Klasse 7 (eins) bzw. 9 (zwei), keins in Klasse 5–6', () => {
    const fallen = (jg: number): number => starte('satzbaustelle', inhalt(), 2, 'mittel', jg).runden[0].teile.filter((t: { falle?: boolean }) => t.falle).length
    expect(fallen(5)).toBe(0)
    expect(fallen(8)).toBe(1)
    expect(fallen(10)).toBe(2)
  })
  it('Team-Match: ab Klasse 9 verwechselbare Ablenker (ähnliche Schreibung bzw. gleiche Wortart)', () => {
    const z = starte('teammatch', inhalt(), 2, 'mittel', 10)
    const alle = Object.values(z.verteilung as Record<string, string[]>).flat()
    expect(alle).toContain(z.korrekt)
    expect(alle.length).toBe(6)
  })
})

describe('Reiseplaner: Lehrwerkswörter bis zum Stand der Klasse', () => {
  const lade = (n: string): Buch => JSON.parse(readFileSync(join(__dirname, '..', 'resources', 'lehrwerke', `${n}.json`), 'utf8')) as Buch
  const buecher = ['green-line-1', 'green-line-2', 'green-line-3'].map(lade)
  it('frühere Bände ganz, im aktuellen Band bis zur Stand-Unit – nie danach', () => {
    const w = lehrwerkBisStand(buecher, { buch: 'green-line-2', unit: 'Unit 2' })
    const bis = buecher[1].units.findIndex((u) => u.name === 'Unit 2')
    const band1 = buecher[0].units.reduce((n, u) => n + u.sections.reduce((m, s) => m + s.entries.length, 0), 0)
    const band2 = buecher[1].units.slice(0, bis + 1).reduce((n, u) => n + u.sections.reduce((m, s) => m + s.entries.length, 0), 0)
    expect(w.length).toBe(band1 + band2)
    // Keine Wörter aus späteren Units oder Bänden
    for (const x of w) {
      const [, band, ui] = x.id.split(':')
      expect(band === 'green-line-1' || (band === 'green-line-2' && Number(ui) <= bis)).toBe(true)
    }
    expect(w.some((x) => x.id.startsWith('b:green-line-3:'))).toBe(false)
    // Unbekannte Unit oder unbekanntes Buch: nichts
    expect(lehrwerkBisStand(buecher, { buch: 'green-line-2', unit: 'Unit 99' })).toEqual([])
    expect(lehrwerkBisStand(buecher, { buch: 'nix', unit: 'Unit 1' })).toEqual([])
  })
  it('Vorrang: von allen gekannte Wörter vor Lehrwerkswörtern vor dem Grundwortschatz', () => {
    const i = inhalt()
    i.items = []
    i.lehrwerk = ['the lake', 'an island', 'a ship']
    i.lehrwerkGemeinsam = ['a ship']
    const b = bekannteWoerter(i)
    expect(b.get('ship')).toBe(0)
    expect(b.get('lake')).toBe(1)
    expect(b.get('mountain')).toBeUndefined()
    // In einer Runde stehen bekannte Begriffe vorn
    const r = reiseRunde({ lex: lexikonFuer('en'), stufe: 9, schwierigkeit: 'leicht', runde: 0, spieler: ['a', 'b'], bekannt: b, zufall: () => 0.3 })!
    expect(r.reisen.some((x) => x.verkehr === 'schiff' || x.ziel === 'see' || x.ziel === 'insel')).toBe(true)
  })
})
