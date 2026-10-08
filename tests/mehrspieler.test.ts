/**
 * Mehrspieler „Kooperativ"/„Versus" (08.10.2026): Lobby, Schwierigkeitsbänder, Handicap-Wertung, Inhalt ohne KI und
 * JEDES Regelmodul einmal durchgespielt – mit der Prüfung, dass keine Sicht eine Lösung vor dem Zug verrät.
 */
import { describe, expect, it } from 'vitest'
import type { Vokabel, WortStand } from '../src/shared/vokabeltrainer'
import type { GrammatikAufgabe } from '../src/shared/grammatiktrainer'
import { gramItems, leererInhalt, synonymeAus, verbFormenAus, vokItems, zeitSaetzeAus } from '../src/shared/mehrspieler/inhalt'
import { bandEinzeln, bandGemeinsam, gewichtVon, ziehe } from '../src/shared/mehrspieler/schwierigkeit'
import { aufraeumen, beitreten, einstellen, entfernen, lobbyNeu, startPruefen, verbindung, verlassen, PLATZ_HALTEN_MS, LOBBY_LEBT_MS } from '../src/shared/mehrspieler/lobby'
import { REGELN, angebotFuer, imJahrgang } from '../src/shared/mehrspieler/regeln'
import { antwortRichtig, type Basis, type Block, type Zug } from '../src/shared/mehrspieler/kern'
import { MEHRSPIELE, mehrspielInfo, type MehrspielId, type Schwierigkeit, type SpielInhalt } from '../src/shared/mehrspieler/typen'
import { hinweiseFuer } from '../src/shared/mehrspieler/spiele/beschreiben'
import { reiseRunde } from '../src/shared/mehrspieler/spiele/koop2'
import { slfGilt } from '../src/shared/mehrspieler/spiele/versus2'
import { berechneAchievements, LEERE_ZAEHLER } from '../src/shared/achievements'

// ---------------------------------------------------------------- Inhalt

const PAARE: [string, string, string?, string?][] = [
  ['weather', 'Wetter', 'The weather is nice today.', 'n'],
  ['sunny', 'sonnig', 'It is a sunny day in May.', 'adj'],
  ['cloud', 'Wolke', 'There is a big cloud over the town.', 'n'],
  ['rain', 'Regen', 'Do you like the rain in autumn?', 'n'],
  ['wind', 'Wind', 'The wind is very strong today.', 'n'],
  ['snow', 'Schnee', 'We play in the snow every winter.', 'n'],
  ['storm', 'Sturm', 'Is there a storm on the coast?', 'n'],
  ['dog', 'Hund', 'My dog runs in the park.', 'n'],
  ['garden', 'Garten', 'We have a small garden behind the house.', 'n'],
  ['run', 'rennen', 'I run to school every morning.', 'v'],
  ['go', 'gehen', 'We go to the cinema on Fridays.', 'v'],
  ['take', 'nehmen', 'Can you take the bus?', 'v'],
  ['grandma', 'Oma', 'My grandma lives in London.', 'n'],
  ['granny', 'Oma', 'Granny makes great cakes.', 'n'],
  ['street', 'Straße', 'The street is very long.', 'n'],
  ['road', 'Straße', 'This road goes to the sea.', 'n'],
  ['sea', 'Meer', 'The sea is blue and cold.', 'n'],
  ['train', 'Zug', 'The train leaves at nine.', 'n'],
  ['tent', 'Zelt', 'We sleep in a tent in summer.', 'n'],
  ['ticket', 'Fahrkarte', 'I need a ticket for the train.', 'n'],
  ['big', 'groß', 'London is a big city.', 'adj'],
  ['small', 'klein', 'My room is small but nice.', 'adj'],
  ['sad', 'traurig', 'Why are you so sad today?', 'adj'],
  ['glad', 'froh', 'I am glad you are here.', 'adj'],
  ['large', 'groß', 'The park is very large.', 'adj']
]
const WOERTER: Vokabel[] = PAARE.map(([term, translation, example, pos], i) => ({
  id: `w${i}`,
  term,
  translation,
  ...(example ? { example, exampleTranslation: `Satz ${i} auf Deutsch.` } : {}),
  ...(pos ? { pos } : {}),
  ...(i < 6 ? { bild: `data:image/svg+xml,bild${i}` } : {})
}))
const AUFGABEN: GrammatikAufgabe[] = [
  ...['went', 'played', 'saw', 'came', 'took', 'made'].map((l, i) => ({
    id: `g${i}`,
    art: 'luecke' as const,
    regelId: 'r1',
    anweisung: 'Setze ein.',
    satz: `Yesterday she ___ to the park number ${i}.`,
    vorgabe: '(go)',
    loesungen: [l]
  })),
  ...[0, 1, 2].map((i) => ({
    id: `f${i}`,
    art: 'fehler' as const,
    regelId: 'r1',
    anweisung: 'Finde den Fehler.',
    satz: `Last week he goed home with friend ${i}.`,
    fehlerWort: 'goed',
    loesungen: ['went']
  })),
  ...[0, 1, 2, 3].map((i) => ({
    id: `u${i}`,
    art: 'umformen' as const,
    regelId: 'r1',
    anweisung: 'Verneine.',
    satz: `She played tennis ${i}.`,
    vorgabe: 'Verneine den Satz.',
    loesungen: [`She did not play tennis ${i}.`]
  })),
  ...[0, 1, 2].map((i) => ({
    id: `s${i}`,
    art: 'satzbau' as const,
    regelId: 'r1',
    anweisung: 'Bilde den Satz.',
    satz: '',
    teile: ['They', 'visited', 'their', `aunt${i}`],
    loesungen: [`They visited their aunt${i}`]
  })),
  ...[0, 1, 2].map((i) => ({
    id: `t${i}`,
    art: 'uebersetzen' as const,
    regelId: 'r1',
    anweisung: 'Übersetze.',
    satz: `Ich sah ihn gestern ${i}.`,
    loesungen: [`I saw him yesterday ${i}`]
  }))
]

function vokInhalt(): SpielInhalt {
  const i = leererInhalt('vok', 'en')
  i.items = vokItems(WOERTER)
  i.synonyme = synonymeAus(WOERTER)
  i.verben = verbFormenAus(
    [
      { id: 'v1', de: 'gehen', formen: { inf: 'go', past: 'went', pp: 'gone' } },
      { id: 'v2', de: 'nehmen', formen: { inf: 'take', past: 'took', pp: 'taken' } },
      { id: 'v3', de: 'sehen', formen: { inf: 'see', past: 'saw', pp: 'seen' } },
      { id: 'v4', de: 'essen', formen: { inf: 'eat', past: 'ate', pp: 'eaten' } }
    ],
    [
      { id: 'inf', label: 'Infinitive' },
      { id: 'past', label: 'Simple past' },
      { id: 'pp', label: 'Past participle' }
    ]
  )
  return i
}
function gramInhalt(): SpielInhalt {
  const i = leererInhalt('gram', 'en')
  i.items = gramItems(AUFGABEN)
  i.zeitSaetze = zeitSaetzeAus([
    { themen: ['en.verb.past_simple'], aufgaben: AUFGABEN.slice(0, 3) },
    {
      themen: ['en.verb.will_future'],
      aufgaben: [0, 1, 2].map((k) => ({ id: `wf${k}`, art: 'luecke' as const, regelId: 'r2', anweisung: '', satz: `Tomorrow it ___ rain ${k}.`, loesungen: ['will'] }))
    },
    {
      themen: ['en.verb.present_simple'],
      aufgaben: [0, 1].map((k) => ({ id: `ps${k}`, art: 'luecke' as const, regelId: 'r3', anweisung: '', satz: `He always ___ tea ${k}.`, loesungen: ['drinks'] }))
    }
  ])
  return i
}

// ---------------------------------------------------------------- Durchspielen

const LEUTE = ['a', 'b', 'c', 'd']
type Z = Basis & Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function starte(id: MehrspielId, inhalt: SpielInhalt, n = 2, schwierigkeit: Schwierigkeit = 'mittel', jahrgang: number | null = 8): Z {
  const spieler = LEUTE.slice(0, n).map((x) => ({ id: x, name: `Kind ${x.toUpperCase()}.` }))
  const gemeinsam: Record<string, null> = Object.fromEntries(inhalt.items.map((i) => [i.id, null]))
  return REGELN[id].start({
    spiel: id,
    spieler,
    schwierigkeit,
    jahrgang,
    inhalt,
    band: { gemeinsam, je: Object.fromEntries(spieler.map((s) => [s.id, { ...gemeinsam }])) },
    saat: 4711,
    jetzt: 1_000_000
  }) as Z
}

const item = (z: Z, id: string) => z.inhalt.items.find((i) => i.id === id)!

/** Ein „perfekter" Zug je Spiel – aus dem inneren Zustand (nur im Test) */
function loeser(id: MehrspielId, z: Z, wer: string): Zug | null {
  switch (id) {
    case 'teammatch':
      return z.verteilung[wer]?.includes(z.korrekt) ? { aktion: 'antwort', wert: z.korrekt } : null
    case 'satzbaustelle':
    case 'bildergeschichte':
    case 'uebersetzung':
    case 'zeitstrahl': {
      const runde = z.runden[z.r]
      if (z.b >= 0 && runde?.benennen) return wer === z.bWer ? { aktion: 'antwort', wert: runde.benennen[z.b].loesung } : null
      const k = z.o.kacheln.find((x: any) => x.besitzer === wer && !x.gelegt && !x.falle && x.wert === z.o.ziel[z.o.gelegt.length]) // eslint-disable-line @typescript-eslint/no-explicit-any
      return k ? { aktion: 'legen', wert: k.id } : null
    }
    case 'fluchtraum': {
      const s = z.schloesser[z.s]
      if (!s.geloest[wer]) return { aktion: 'antwort', wert: s.aufgaben[wer].loesung }
      if (Object.values(s.geloest).every(Boolean))
        return { aktion: 'code', wert: z.spieler.filter((p) => p.id in s.ziffern).map((p) => s.ziffern[p.id]).join('') }
      return null
    }
    case 'beschreiben': {
      const erkl = z.spieler[z.erklaerer].id
      if (wer === erkl) return z.gewaehlt ? null : { aktion: 'hinweise', wert: z.hinweise.slice(0, 2).map((h: { id: string }) => h.id) }
      return z.gewaehlt ? { aktion: 'antwort', wert: item(z, z.reihe[z.r]).vok!.term } : null
    }
    case 'tauziehen':
    case 'woerterturm':
    case 'konjugation':
    case 'umbau':
    case 'kollokation':
    case 'synonyme':
      return z.fragen[wer] ? { aktion: 'antwort', wert: z.fragen[wer].loesung } : null
    case 'staffel': {
      const dran = z.teams[z.dran][z.laeufer[z.dran]]
      return dran === wer ? { aktion: 'antwort', wert: z.fragen[wer].loesung } : null
    }
    case 'schiffe': {
      const dran = z.teams[z.dran][z.laeufer[z.dran]]
      if (dran !== wer) return null
      if (!z.schiessen) return { aktion: 'antwort', wert: z.fragen[wer].loesung }
      const g = z.dran === 0 ? 1 : 0
      return { aktion: 'schuss', wert: String(z.flotte[g].find((f: number) => !(f in z.schuesse[g]))) }
    }
    case 'bingo': {
      const i = z.felder[wer].indexOf(z.rufe[z.ruf])
      if (i >= 0 && !z.markiert[wer][i]) return { aktion: 'feld', wert: String(i) }
      return z.zeitdruck ? null : { aktion: 'weiter' }
    }
    case 'wortkette':
      return z.spieler[z.dran].id === wer ? { aktion: 'antwort', wert: z.frage.loesung } : null
    case 'teammemory': {
      if (z.spieler[z.dran].id !== wer) return null
      if (z.offen.length === 1) return { aktion: 'karte', wert: String(z.karten.findIndex((k: any, i: number) => i !== z.offen[0] && k.item === z.karten[z.offen[0]].item)) } // eslint-disable-line @typescript-eslint/no-explicit-any
      return { aktion: 'karte', wert: String(z.karten.findIndex((_: unknown, i: number) => !z.gefunden.includes(i))) }
    }
    case 'kreuzwort': {
      const n = z.woerter.findIndex((w: any) => w.besitzer === wer && !w.geloest) // eslint-disable-line @typescript-eslint/no-explicit-any
      if (n < 0) return null
      return z.schwierigkeit === 'leicht' ? { aktion: `wort:${n}`, wert: z.woerter[n].wort } : { aktion: 'wort', wert: { [n]: z.woerter[n].wort } }
    }
    case 'fehlerdetektive':
    case 'sniper': {
      const f = item(z, z.reihe[z.r]).fehler!
      const finder = id === 'sniper' ? z.finder : z.gefunden
      if (!finder) return { aktion: 'wort', wert: String(f.satz.split(/\s+/).findIndex((w: string) => w.replace(/[^\p{L}\p{N}']/gu, '') === f.wort)) }
      const loes = id === 'sniper' ? z.verbessern : z.verbessert
      if (id === 'sniper') return finder === wer ? { aktion: 'antwort', wert: loes.loesung } : null
      const i = z.spieler.findIndex((s) => s.id === finder)
      return z.spieler[(i + 1) % z.spieler.length].id === wer ? { aktion: 'antwort', wert: loes.loesung } : null
    }
    case 'dialog': {
      const zeile = z.zeilen[z.z]
      const i = z.spieler.findIndex((s) => s.id === wer)
      return zeile && i % 2 === zeile.rolle ? { aktion: 'antwort', wert: zeile.frage.loesung } : null
    }
    case 'hoerkette':
      return z.spieler[z.hoerer].id === wer ? null : { aktion: 'antwort', wert: item(z, z.reihe[z.r]).vok!.term }
    case 'reiseplaner':
      return { aktion: 'reise', wert: String(z.runden[z.r].ziel) }
    case 'schnapp':
      return z.abgestimmt.includes(wer) ? null : { aktion: z.karten[z.k].passt ? 'schnapp' : 'nicht' }
    case 'galgen': {
      const b = [...z.wort[wer].toLowerCase()].find((c: string) => /\p{L}/u.test(c) && !z.geraten[wer].includes(c))
      return b ? { aktion: 'buchstabe', wert: b } : null
    }
    case 'buzzer': {
      if (!z.buzz && z.zweite === null) return { aktion: 'buzz' }
      return wer === z.buzz ? { aktion: 'antwort', wert: z.frage.loesung } : null
    }
    case 'auktion':
      return z.gebote[wer] ? null : { aktion: 'gebot', wert: `${z.aussagen[z.a].stimmt ? 'ja' : 'nein'}:20` }
    case 'domino': {
      if (z.spieler[z.dran].id !== wer) return null
      const s = z.steine.find((x: any) => x.besitzer === wer && !x.gelegt && x.k === z.offen) // eslint-disable-line @typescript-eslint/no-explicit-any
      return s ? { aktion: 'stein', wert: s.id } : { aktion: 'passen' }
    }
    case 'stadtland': {
      if (z.fertig.includes(wer)) return null
      const b = z.runden[z.r].buchstabe
      const w = z.inhalt.items.find((i) => i.vok?.term[0] === b)!.vok!
      return { aktion: 'antworten', wert: { wort: w.term, deutsch: w.translation } }
    }
  }
  return null
}

function durchspielen(id: MehrspielId, z: Z, max = 3000): { schritte: number; sichten: Block[][] } {
  const r = REGELN[id]
  let jetzt = 1_000_000
  const sichten: Block[][] = []
  for (let schritt = 0; schritt < max; schritt++) {
    if (z.ende) return { schritte: schritt, sichten }
    jetzt += 500
    for (const s of z.spieler) {
      if (z.ende) break
      const sicht = r.sicht(z, s.id, jetzt)
      sichten.push(sicht)
      const zug = loeser(id, z, s.id)
      if (zug) r.zug(z, s.id, zug, jetzt)
    }
    r.tick?.(z, jetzt)
  }
  throw new Error(`${id} endet nicht`)
}

const VOK_SPIELE = MEHRSPIELE.filter((s) => s.bereiche.includes('vok')).map((s) => s.id)
const GRAM_SPIELE = MEHRSPIELE.filter((s) => s.bereiche.includes('gram')).map((s) => s.id)

describe('Regelmodule – jedes Spiel einmal durchgespielt (Vokabeln)', () => {
  for (const id of VOK_SPIELE)
    it(`${id}`, () => {
      const inhalt = vokInhalt()
      expect(REGELN[id].passt(inhalt, true)).toBeNull()
      for (const n of [2, 3]) {
        const z = starte(id, inhalt, n, id === 'kreuzwort' ? 'mittel' : 'mittel')
        const { sichten } = durchspielen(id, z)
        expect(z.ende).toBe(true)
        // Keine Sicht enthält ein Feld „loesung" (die Lösung kommt nur als Rückmeldung als Text)
        for (const s of sichten) expect(JSON.stringify(s)).not.toMatch(/"(loesung|korrekt|ziffern|flotte)":/)
        const e = REGELN[id].ergebnis(z)
        expect(Object.keys(e.jeSpieler)).toHaveLength(n)
        expect(e.text.length).toBeGreaterThan(3)
      }
    })
})

describe('Regelmodule – alle Schwierigkeiten, vier Personen', () => {
  for (const id of VOK_SPIELE)
    it(`${id}`, () => {
      for (const [st, jg] of [
        ['leicht', 5],
        ['schwer', 9],
        ['unmoeglich', 11]
      ] as [Schwierigkeit, number][]) {
        const z = starte(id, vokInhalt(), 4, st, jg)
        durchspielen(id, z)
        expect(z.ende).toBe(true)
      }
    })
})

describe('Regelmodule – Grammatik', () => {
  for (const id of GRAM_SPIELE)
    it(`${id}`, () => {
      const inhalt = gramInhalt()
      expect(REGELN[id].passt(inhalt, true)).toBeNull()
      const z = starte(id, inhalt, 2)
      durchspielen(id, z)
      expect(z.ende).toBe(true)
    })
})

describe('Einzelne Regeln', () => {
  it('Team-Match: die richtige Antwort liegt auf genau einem Gerät; falsche Tipps kosten Herzen', () => {
    const z = starte('teammatch', vokInhalt(), 3)
    const mit = z.spieler.filter((s) => z.verteilung[s.id].includes(z.korrekt))
    expect(mit).toHaveLength(1)
    const falsch = z.spieler.map((s) => z.verteilung[s.id].find((o: string) => o !== z.korrekt)).find(Boolean)
    const wer = z.spieler.find((s) => z.verteilung[s.id].includes(falsch))!.id
    REGELN.teammatch.zug(z, wer, { aktion: 'antwort', wert: falsch }, 0)
    expect(z.herzen).toBe(2)
    expect(z.fehler[wer]).toHaveLength(1)
  })
  it('Satzbaustelle: falsches Teil zählt als Fehler, Reihenfolge stimmt', () => {
    const z = starte('satzbaustelle', vokInhalt(), 2)
    const falsch = z.o.kacheln.find((k: any) => k.wert !== z.o.ziel[0]) // eslint-disable-line @typescript-eslint/no-explicit-any
    REGELN.satzbaustelle.zug(z, falsch.besitzer, { aktion: 'legen', wert: falsch.id }, 0)
    expect(z.fehlerZahl).toBe(1)
    durchspielen('satzbaustelle', z)
    expect(REGELN.satzbaustelle.ergebnis(z).fehlerfrei).toBe(false)
  })
  it('Fluchtraum: Ziffern sieht nur, wer gelöst hat; falscher Code ist ein Fehlversuch; Uhr nur außerhalb von „leicht"', () => {
    const z = starte('fluchtraum', vokInhalt(), 2)
    const [a, b] = z.spieler.map((s) => s.id)
    REGELN.fluchtraum.zug(z, a, { aktion: 'antwort', wert: z.schloesser[0].aufgaben[a].loesung }, 0)
    const ziffer = String(z.schloesser[0].ziffern[a])
    expect(JSON.stringify(REGELN.fluchtraum.sicht(z, a, 0))).toContain(`Deine Ziffer: ${ziffer}`)
    expect(JSON.stringify(REGELN.fluchtraum.sicht(z, b, 0))).not.toContain('Deine Ziffer')
    REGELN.fluchtraum.zug(z, b, { aktion: 'antwort', wert: z.schloesser[0].aufgaben[b].loesung }, 0)
    REGELN.fluchtraum.zug(z, b, { aktion: 'code', wert: '0000' }, 0)
    expect(z.fehlversuche).toBe(1)
    expect(starte('fluchtraum', vokInhalt(), 2, 'leicht').bis).toBeNull()
    expect(starte('fluchtraum', vokInhalt(), 2, 'schwer', 5).bis).toBeNull()
  })
  it('Schiffe versenken: die gegnerische Flotte steht nie in der Sicht', () => {
    const z = starte('schiffe', vokInhalt(), 2)
    const a = z.spieler[0].id
    const sicht = REGELN.schiffe.sicht(z, a, 0) as Extract<Block, { typ: 'kacheln' }>[]
    const gegner = sicht.find((x) => x.typ === 'kacheln' && x.titel?.startsWith('Feld von'))!
    expect(gegner.kacheln.some((k) => k.status === 'schiff')).toBe(false)
  })
  it('Tauziehen: bei drei Personen gleicht ein Bot aus und zieht mit', () => {
    const z = starte('tauziehen', vokInhalt(), 3)
    expect(z.bot).toBe(1)
    let jetzt = 1_000_000
    for (let i = 0; i < 40; i++) REGELN.tauziehen.tick!(z, (jetzt += 1000))
    expect(z.seil).toBeGreaterThan(0)
  })
  it('Handicap: Punkte nach dem eigenen Band', () => {
    const inhalt = vokInhalt()
    const z = starte('tauziehen', inhalt, 2)
    const a = z.spieler[0].id
    const f = z.fragen[a]
    z.band.je[a][f.itemId] = 'unmoeglich'
    REGELN.tauziehen.zug(z, a, { aktion: 'antwort', wert: f.loesung }, 0)
    expect(z.punkte[a]).toBe(4)
  })
  it('Beschreib-Raten: Hinweise ohne Übersetzung, Rollen wechseln', () => {
    const h = hinweiseFuer(vokItems(WOERTER)[0])
    expect(h.map((x) => x.text).join(' ')).not.toContain('Wetter')
    const z = starte('beschreiben', vokInhalt(), 2)
    const vorher = z.erklaerer
    const erkl = z.spieler[z.erklaerer].id
    REGELN.beschreiben.zug(z, erkl, { aktion: 'hinweise', wert: ['anfang', 'laenge'] }, 0)
    const rater = z.spieler.find((s) => s.id !== erkl)!.id
    REGELN.beschreiben.zug(z, rater, { aktion: 'antwort', wert: item(z, z.reihe[0]).vok!.term }, 0)
    expect(z.erklaerer).not.toBe(vorher)
  })
  it('Reiseplaner: die Hinweise grenzen auf genau eine Reise ein', () => {
    const z = starte('reiseplaner', vokInhalt(), 3)
    for (let n = 0; n < 5; n++) {
      const r = reiseRunde(z, ['a', 'b', 'c'])
      const alle = Object.values(r.hinweise).flat()
      const passt = r.reisen.filter((reise) =>
        alle.every((h) => {
          const term = h.slice(2)
          const id = z.inhalt.items.find((i) => i.vok?.term === term)!.id
          return h.startsWith('✓') ? reise.includes(id) : !reise.includes(id)
        })
      )
      expect(passt).toEqual([r.reisen[r.ziel]])
    }
  })
  it('Stadt-Land-Fluss: nur Kurswörter zählen, der Server prüft', () => {
    const z = starte('stadtland', vokInhalt(), 2)
    expect(slfGilt(z, 'wort', 's', 'sunny')).toBe('w1')
    expect(slfGilt(z, 'wort', 's', 'sausage')).toBeNull()
    expect(slfGilt(z, 'deutsch', 's', 'Schnee')).toBe('w5')
    expect(slfGilt(z, 'verb', 'r', 'run')).toBe('w9')
    expect(slfGilt(z, 'nomen', 'r', 'run')).toBeNull()
  })
  it('Fehler-Sniper: falscher Tipp sperrt 3 Sekunden', () => {
    const z = starte('sniper', gramInhalt(), 2)
    const a = z.spieler[0].id
    REGELN.sniper.zug(z, a, { aktion: 'wort', wert: '0' }, 5000)
    expect(z.sperre[a]).toBe(8000)
    const f = item(z, z.reihe[0]).fehler!
    const i = f.satz.split(/\s+/).indexOf(f.wort)
    REGELN.sniper.zug(z, a, { aktion: 'wort', wert: String(i) }, 6000)
    expect(z.finder).toBeNull()
    REGELN.sniper.zug(z, a, { aktion: 'wort', wert: String(i) }, 8000)
    expect(z.finder).toBe(a)
  })
  it('Eingabeart und Zeitdruck nach Schwierigkeit und Klasse', () => {
    expect(starte('tauziehen', vokInhalt(), 2, 'schwer', 8).tippen).toBe(true)
    expect(starte('tauziehen', vokInhalt(), 2, 'schwer', 5).tippen).toBe(false)
    expect(starte('tauziehen', vokInhalt(), 2, 'leicht', 9).zeitdruck).toBe(false)
    expect(starte('tauziehen', vokInhalt(), 2, 'mittel', 6).zeitdruck).toBe(false)
    const z = starte('tauziehen', vokInhalt(), 2, 'schwer', 8)
    const f = z.fragen[z.spieler[0].id]
    expect(f.optionen).toEqual([])
    expect(antwortRichtig(f, f.loesung.toUpperCase())).toBe(true)
  })
})

describe('Angebot, Jahrgang, Inhalt', () => {
  it('Spiele ohne passenden Inhalt bleiben ausgeblendet; Jahrgangsband ±1', () => {
    const wenig = leererInhalt('vok', 'en')
    wenig.items = vokItems(WOERTER.slice(0, 7).map((w) => ({ ...w, example: undefined, bild: undefined })))
    const ids = angebotFuer(wenig, null).map((a) => a.id)
    expect(ids).toContain('teammatch')
    expect(ids).not.toContain('satzbaustelle')
    expect(ids).not.toContain('bildergeschichte')
    expect(ids).not.toContain('bingo')
    expect(angebotFuer(vokInhalt(), 8, false).map((a) => a.id)).not.toContain('hoerkette')
    expect(imJahrgang(mehrspielInfo('schnapp')!, 8)).toBe(false)
    expect(imJahrgang(mehrspielInfo('schnapp')!, 7)).toBe(true)
    expect(imJahrgang(mehrspielInfo('teammatch')!, 12)).toBe(true)
    expect(angebotFuer(gramInhalt(), 9).every((a) => mehrspielInfo(a.id)!.bereiche.includes('gram'))).toBe(true)
  })
  it('Fehlersätze aus Beispielsätzen, Synonyme, Zeitsätze', () => {
    const items = vokItems(WOERTER)
    expect(items.filter((i) => i.fehler).length).toBeGreaterThan(3)
    expect(synonymeAus(WOERTER).map((g) => g.woerter.sort().join())).toEqual(expect.arrayContaining(['grandma,granny', 'road,street']))
    expect(new Set(gramInhalt().zeitSaetze.map((s) => s.rang)).size).toBe(3)
  })
})

describe('Schwierigkeit', () => {
  const st = (versuche: number, falsch: number, fach: number): WortStand =>
    ({ fach, faellig: 0, frei: [], erkannt: 0, erkennenVersuche: 0, versuche, falsch, fehlerTexte: [], zuletzt: 0 }) as WortStand
  it('Bänder je Person und für die Gruppe', () => {
    expect(bandEinzeln(undefined)).toBeNull()
    expect(bandEinzeln(st(6, 0, 4))).toBe('leicht')
    expect(bandEinzeln(st(6, 1, 3))).toBe('mittel')
    expect(bandEinzeln(st(6, 2, 2))).toBe('schwer')
    expect(bandEinzeln(st(6, 4, 1))).toBe('unmoeglich')
    expect(bandGemeinsam([st(6, 0, 4), st(5, 0, 5)])).toBe('leicht')
    expect(bandGemeinsam([st(6, 0, 4), st(6, 4, 1)])).toBe('schwer')
    expect(gewichtVon('unmoeglich')).toBe(4)
  })
  it('Ziehen: Zielband zuerst, dann die Nachbarn', () => {
    const b = { a: 'leicht', b: 'mittel', c: 'schwer', d: 'unmoeglich', e: null } as const
    let n = 0
    const zufall = (): number => ((n = (n * 9301 + 49297) % 233280), n / 233280)
    expect(new Set(ziehe({ ...b }, 'schwer', 1, zufall))).toEqual(new Set(['c']))
    expect(new Set(ziehe({ ...b }, 'schwer', 3, zufall))).toEqual(new Set(['b', 'c', 'd']))
    expect(ziehe({ ...b }, 'leicht', 7, zufall)).toHaveLength(7)
  })
})

describe('Lobby', () => {
  const neu = () => lobbyNeu({ code: '123456', bereich: 'vok', kurs: 'k1', spiel: 'teammatch', host: { id: 'h', name: 'Hanna' }, jetzt: 0 })
  it('Beitreten bis zur Höchstzahl, Entfernte bleiben draußen, Host wandert weiter', () => {
    const l = neu()
    for (const id of ['b', 'c', 'd']) expect(beitreten(l, { id, name: id }, 1)).toBeNull()
    expect(beitreten(l, { id: 'e', name: 'e' }, 1)?.status).toBe(409)
    expect(entfernen(l, 'b', 'c', 2)?.status).toBe(403)
    expect(entfernen(l, 'h', 'c', 2)).toBeNull()
    expect(beitreten(l, { id: 'c', name: 'c' }, 3)?.status).toBe(403)
    expect(verlassen(l, 'h', 4)).toBe(false)
    expect(l.host).toBe('b')
  })
  it('Start erst ab der Mindestzahl und nur durch den Host; Einstellungen nur vom Host', () => {
    const l = neu()
    expect(startPruefen(l, 'h')?.status).toBe(409)
    beitreten(l, { id: 'b', name: 'b' }, 1)
    expect(startPruefen(l, 'b')?.status).toBe(403)
    expect(startPruefen(l, 'h')).toBeNull()
    expect(einstellen(l, 'b', { schwierigkeit: 'schwer' }, 2)?.status).toBe(403)
    expect(einstellen(l, 'h', { schwierigkeit: 'unmoeglich', spiel: 'bingo' }, 2)).toBeNull()
    expect(l.spiel).toBe('bingo')
    expect(einstellen(l, 'h', { spiel: 'zeitstrahl' }, 2)?.status).toBe(400)
  })
  it('Verbindungsabbruch: Platz 60 s gehalten, danach weg; nach 30 min abgelaufen', () => {
    const l = neu()
    beitreten(l, { id: 'b', name: 'b' }, 0)
    verbindung(l, 'b', false, 1000)
    expect(aufraeumen(l, 1000 + PLATZ_HALTEN_MS - 1).raus).toEqual([])
    beitreten(l, { id: 'b', name: 'b' }, 2000)
    expect(l.spieler.find((s) => s.id === 'b')?.verbunden).toBe(true)
    verbindung(l, 'b', false, 3000)
    expect(aufraeumen(l, 3000 + PLATZ_HALTEN_MS).raus).toEqual(['b'])
    expect(aufraeumen(l, LOBBY_LEBT_MS + 5000).abgelaufen).toBe(true)
  })
})

describe('Achievements „Zusammen"', () => {
  const mit = (z: Partial<typeof LEERE_ZAEHLER>) =>
    berechneAchievements({
      tage: [],
      wochenziel: 3,
      woerter: { gelernt: 0, sicher: 0, langzeit: 0 },
      lehrwerk: [],
      regeln: [],
      warSchwaeche: [],
      extrasGeschafft: 0,
      spiele: 0,
      zaehler: { ...LEERE_ZAEHLER, ...z }
    })
      .filter((a) => a.erreicht)
      .map((a) => a.id)
  it('Gruppe „Zusammen" mit Stufen', () => {
    const ids = mit({ koopRunden: 1, teamZiele: 10, versusSpiele: 5, faireSiege: 1, comebackSiege: 1, unmoeglich: 1, spielarten: 0b1111111 })
    for (const id of ['zusammen-erste', 'teamziel-1', 'teamziel-10', 'versus-5', 'fair-1', 'comeback-sieg', 'unmoeglich', 'alle-spielarten']) expect(ids).toContain(id)
    expect(ids).not.toContain('teamziel-25')
    expect(mit({ spielarten: 0b111111 })).not.toContain('alle-spielarten')
  })
  it('Beschreib-Raten zählt nicht', () => {
    expect(mehrspielInfo('beschreiben')!.achievements).toBe(false)
  })
})
