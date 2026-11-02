import { describe, expect, it } from 'vitest'
import { vokItems, leererInhalt } from '../src/shared/mehrspieler/inhalt'
import type { Band } from '../src/shared/mehrspieler/typen'
import type { Vokabel } from '../src/shared/vokabeltrainer'
import { eloSchritt, startTheta, stufenFuer, wahrscheinlichkeit } from '../src/shared/klassenspiel/adaptiv'
import { teamsBilden, tischeBilden, umsetzen } from '../src/shared/klassenspiel/teams'
import {
  antworten,
  geraetSicht,
  kennungAus,
  kNeu,
  kTakt,
  naechsteAufgabe,
  personDazu,
  teamsLosen,
  top3,
  vokKennung,
  type KBasis,
  type KInhalt
} from '../src/shared/klassenspiel/kern'
import { KLASSEN_REGELN } from '../src/shared/klassenspiel/regeln'
import { STANDARD_EINSTELLUNGEN, einstellungenBereinigt, type KlassenspielId } from '../src/shared/klassenspiel/typen'

const WOERTER: Vokabel[] = Array.from({ length: 40 }, (_, i) => ({
  id: `w${i}`,
  term: `word${i}`,
  translation: `Wort${i}`,
  example: `This is the word${i} in a sentence.`
})) as unknown as Vokabel[]

function inhalt(): KInhalt {
  const vok = leererInhalt('vok', 'en')
  vok.items = vokItems(WOERTER).map((i) => ({ ...i, id: vokKennung(i.id) }))
  return { sprache: 'en', vok, gram: leererInhalt('gram', 'en'), vorrang: [] }
}

function spiel(id: KlassenspielId, n: number, opt: Partial<typeof STANDARD_EINSTELLUNGEN> = {}): KBasis {
  const einst = { ...STANDARD_EINSTELLUNGEN, ...opt, spiel: id }
  const z = kNeu({ spiel: id, einst, jahrgang: 7, inhalt: inhalt(), saat: 42, jetzt: 0 })
  for (let i = 0; i < n; i++) {
    const band: Record<string, Band | null> = {}
    for (const it of z.inhalt.vok.items) band[it.id] = i % 3 === 0 ? 'leicht' : i % 3 === 1 ? 'mittel' : 'schwer'
    personDazu(z, `p${i}`, `Kind ${i}`, band, 0)
  }
  teamsLosen(z)
  const r = KLASSEN_REGELN[id]!
  r.start(z, 0)
  return z
}

/** Simulierte Antwort: richtig mit der Elo-Wahrscheinlichkeit einer „wahren" Fähigkeit */
function simuliere(z: KBasis, id: KlassenspielId, schritte: number, faehig: (wer: string) => number): void {
  const r = KLASSEN_REGELN[id]!
  let t = 1000
  let s = 7
  const zufall = (): number => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let k = 0; k < schritte && !z.ende; k++) {
    for (const wer of Object.keys(z.personen)) {
      if (z.ende) break
      let sicht = geraetSicht(z, r, wer, t)
      const knopf = sicht.find((b) => b.typ === 'knoepfe') as { knoepfe: { aktion: string; wert?: string }[] } | undefined
      if (knopf && r.zug) {
        const k0 = knopf.knoepfe[Math.floor(zufall() * knopf.knoepfe.length)]
        r.zug(z, wer, k0.aktion, k0.wert, t)
        sicht = geraetSicht(z, r, wer, t)
      }
      const a = z.personen[wer].aufgabe
      if (a && !r.geraetFrage) {
        if (r.frageZeigen && !r.frageZeigen(z, wer)) continue
        const ok = zufall() < wahrscheinlichkeit(faehig(wer), a.b)
        antworten(z, r, wer, ok ? a.frage.loesung : '###', (t += 200))
      } else {
        // Geteilte Karten: die eigene richtige Karte nur mit der Wahrscheinlichkeit, sonst eine andere eigene
        const f = sicht.find((b) => b.typ === 'frage') as { optionen: string[] } | undefined
        if (!f?.optionen.length) continue
        const loesung = (z as unknown as { frage: ({ aufgabe: { frage: { loesung: string } } } | null)[] }).frage?.[z.personen[wer].team]?.aufgabe.frage.loesung
        const ok = zufall() < wahrscheinlichkeit(faehig(wer), 0)
        const wahl = ok && loesung && f.optionen.includes(loesung) ? loesung : f.optionen.find((o) => o !== loesung) ?? f.optionen[0]
        antworten(z, r, wer, wahl, (t += 200))
      }
    }
    t += 1000
    kTakt(z, r, t)
  }
}

describe('Klassenspiele – Elo', () => {
  it('Startwert aus dem Lernstand, Schritt in die richtige Richtung', () => {
    expect(startTheta([])).toBe(0.7)
    expect(startTheta(['leicht', 'leicht'])).toBeGreaterThan(startTheta(['schwer', 'schwer']))
    expect(eloSchritt(0, 0, true, 0)).toBeGreaterThan(0)
    expect(eloSchritt(0, 0, false, 0)).toBeLessThan(0)
  })
  it('Stufen je Modus', () => {
    expect(stufenFuer('fest', 'leicht', 1)).toEqual([1, 2])
    expect(stufenFuer('level', 'mittel', 1)).toEqual([1])
    expect(stufenFuer('level', 'mittel', 6)).toEqual([4])
  })
  it('adaptiv: die Trefferquote pendelt sich bei etwa 78 % ein – für schwache, mittlere und starke Kinder', () => {
    // p1 hat lauter „mittlere" Wörter: Aufgaben reichen von b = −1,2 (erkennen) bis +1,0 (im Satz schreiben)
    for (const f of [-0.6, 0.5, 1.6]) {
      const z = spiel('expedition', 2, { dauer: 30 })
      delete z.personen.p0
      ;(z as unknown as { lager: number }).lager = -99 // nie fertig
      simuliere(z, 'expedition', 200, () => f)
      const p = z.personen.p1
      const spaet = p.n - 100
      expect(spaet).toBeGreaterThan(50)
      const quote = p.richtig / p.n
      expect(quote).toBeGreaterThan(0.6)
      expect(quote).toBeLessThan(0.92)
    }
  })
})

describe('Klassenspiele – Teams', () => {
  it('ausgeglichen nach θ, wiederholbar', () => {
    const leute = Array.from({ length: 27 }, (_, i) => ({ id: `p${i}`, theta: i / 10 }))
    const a = teamsBilden(leute, 3, { saat: 5 })
    const b = teamsBilden(leute, 3, { saat: 5 })
    expect(a.map((t) => t.mitglieder)).toEqual(b.map((t) => t.mitglieder))
    const summen = a.map((t) => t.mitglieder.reduce((s, id) => s + Number(id.slice(1)) / 10, 0))
    expect(Math.max(...summen) - Math.min(...summen)).toBeLessThan(1.5)
    expect(a.map((t) => t.mitglieder.length).sort()).toEqual([9, 9, 9])
  })
  it('Tische zu dritt, Rest zu zweit; Umsetzen hält alle Tische ≥ 2', () => {
    const leute = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, theta: i }))
    const t = tischeBilden(leute, { saat: 1 })
    expect(t.flat().sort()).toEqual(leute.map((l) => l.id).sort())
    expect(t.every((x) => x.length >= 2 && x.length <= 3)).toBe(true)
    const rang: Record<string, number> = {}
    for (const tisch of t) tisch.forEach((id, i) => (rang[id] = i + 1))
    const neu = umsetzen(t, rang)
    expect(neu.flat().sort()).toEqual(leute.map((l) => l.id).sort())
    expect(neu.every((x) => x.length >= 2)).toBe(true)
  })
})

describe('Klassenspiele – Spiele mit 30 Kindern', () => {
  for (const id of ['expedition', 'boss', 'rennen', 'puzzle', 'rekord', 'gebiet', 'turnier', 'wette'] as KlassenspielId[]) {
    it(`${id}: läuft, Sichten ohne Lösung bis zur Antwort, Ergebnis`, () => {
      const z = spiel(id, 30, { teams: 3 })
      const r = KLASSEN_REGELN[id]!
      // Vor der Antwort: Lösung steht nirgends in der Sicht (Schreiben: keine Optionen)
      const sicht = geraetSicht(z, r, 'p1', 0)
      const a = z.personen.p1.aufgabe
      const frage = sicht.find((b) => b.typ === 'frage') as { optionen: string[] } | undefined
      const wahl = sicht.find((b) => b.typ === 'knoepfe')
      expect(Boolean(frage || wahl)).toBe(true)
      if (a && a.stufe >= 3 && frage) expect(JSON.stringify(sicht)).not.toContain(`"${a.frage.loesung}"`)
      simuliere(z, id, 60, (w) => Number(w.slice(1)) / 15)
      const e = r.ergebnis(z)
      expect(e.text.length).toBeGreaterThan(5)
      expect(JSON.stringify(r.beamer(z, 0))).not.toContain('"loesung"')
      if (id === 'rennen' || id === 'gebiet') {
        expect(z.teams).toHaveLength(3)
        expect(e.teams).toHaveLength(3)
      }
      // Es wurde wirklich gespielt
      expect(Object.values(z.personen).reduce((s, p) => s + p.n, 0)).toBeGreaterThan(30)
      // Top 3: nie mehr als drei, nie ein letzter Platz
      expect(top3(z).length).toBeLessThanOrEqual(3)
    })
  }
  it('Boss: Angriffe gehen an andere, nicht an die Person mit dem Fehler', () => {
    const z = spiel('boss', 4) as KBasis & { angriffe: { item: string; von: string }[] }
    z.angriffe.push({ item: z.inhalt.vok.items[0].id, von: 'p0' })
    expect(KLASSEN_REGELN.boss!.vorschlag!(z, 'p0')).toBeNull()
    z.personen.p1.n = 2
    expect(KLASSEN_REGELN.boss!.vorschlag!(z, 'p1')).toBe(z.inhalt.vok.items[0].id)
  })
  it('Fehler kommen wieder (nach 3–5 Aufgaben) und landen in der Fehlerliste', () => {
    const z = spiel('expedition', 1)
    const r = KLASSEN_REGELN.expedition!
    geraetSicht(z, r, 'p0', 0)
    const item = z.personen.p0.aufgabe!.item
    antworten(z, r, 'p0', '###', 1)
    expect(z.personen.p0.fehler).toContain(item)
    const gesehen: string[] = []
    for (let i = 0; i < 6; i++) {
      gesehen.push(z.personen.p0.aufgabe!.item)
      antworten(z, r, 'p0', z.personen.p0.aufgabe!.frage.loesung, 2 + i)
    }
    expect(gesehen).toContain(item)
  })
})

describe('Klassenspiele – Kennungen und Einstellungen', () => {
  it('Kennungen hin und zurück', () => {
    expect(kennungAus('v:abc')).toEqual({ bereich: 'vok', orig: 'abc' })
    expect(kennungAus('g:g123:a9')).toEqual({ bereich: 'gram', form: 'g123', orig: 'a9' })
  })
  it('Einstellungen bereinigt', () => {
    expect(einstellungenBereinigt({ spiel: 'nix' })).toBeNull()
    const e = einstellungenBereinigt({ spiel: 'boss', dauer: 99, teams: 1, vok: false, gram: false })!
    expect(e.dauer).toBe(30)
    expect(e.teams).toBe(2)
    expect(e.vok).toBe(true)
    expect(e.schwierigkeit).toBe('adaptiv')
  })
  it('naechsteAufgabe meidet gerade Gesehenes', () => {
    const z = spiel('expedition', 1)
    const a = naechsteAufgabe(z, 'p0', 0)!
    z.personen.p0.zuletzt = [a.item]
    expect(naechsteAufgabe(z, 'p0', 0)!.item).not.toBe(a.item)
  })
})

describe('Klassenspiele – Stufe B', () => {
  it('Team-Puzzle: Karten verteilt, genau ein Gerät hat die richtige', () => {
    const z = spiel('puzzle', 11) as KBasis & { frage: ({ aufgabe: { frage: { loesung: string; optionen: string[] } }; karten: Record<string, string[]> } | null)[] }
    expect(z.teams.length).toBeGreaterThanOrEqual(3)
    for (const f of z.frage) {
      expect(f).toBeTruthy()
      const alle = Object.values(f!.karten).flat()
      expect(alle.sort()).toEqual([...f!.aufgabe.frage.optionen].sort())
      expect(Object.values(f!.karten).filter((k) => k.includes(f!.aufgabe.frage.loesung))).toHaveLength(1)
      expect(Object.values(f!.karten).every((k) => k.length >= 1)).toBe(true)
    }
  })
  it('Team-Puzzle: falsch kostet zwei Schritte, richtig bringt einen', () => {
    const z = spiel('puzzle', 6) as KBasis & { schritte: number[]; frage: ({ aufgabe: { frage: { loesung: string } }; karten: Record<string, string[]> } | null)[] }
    const r = KLASSEN_REGELN.puzzle!
    const f = z.frage[0]!
    const [werR] = Object.entries(f.karten).find(([, k]) => k.includes(f.aufgabe.frage.loesung))!
    antworten(z, r, werR, f.aufgabe.frage.loesung, 1)
    expect(z.schritte[0]).toBe(1)
    const g = z.frage[0]!
    const [werF, kF] = Object.entries(g.karten).find(([, k]) => k.some((o) => o !== g.aufgabe.frage.loesung))!
    antworten(z, r, werF, kF.find((o) => o !== g.aufgabe.frage.loesung), 2)
    expect(z.schritte[0]).toBe(0)
    // Fremde Karte zählt nicht
    expect(antworten(z, r, werF, 'gibt es nicht', 3)).toBeNull()
  })
  it('Turnier: Runde endet, wenn alle Tische fertig sind; Punkte 6/4/2; neu gesetzt', () => {
    const z = spiel('turnier', 9) as KBasis & { runde: number; punkte: number[]; tischRunde: { fragen: unknown[] }[] }
    const r = KLASSEN_REGELN.turnier!
    expect(z.tische.flat()).toHaveLength(9)
    expect(z.tischRunde.every((t) => t.fragen.length === 5)).toBe(true)
    for (let k = 0; k < 5; k++)
      for (const wer of Object.keys(z.personen)) {
        geraetSicht(z, r, wer, k)
        const a = z.personen[wer].aufgabe!
        antworten(z, r, wer, Number(wer.slice(1)) % 3 === 0 ? a.frage.loesung : '###', k)
      }
    expect(z.runde).toBe(2)
    // 3 Tische × (6 + 4 + 2) bzw. geteilte Plätze – Summe bleibt 36
    expect(z.punkte.reduce((s, x) => s + x, 0)).toBeCloseTo(36)
  })
  it('Tische mit allen gleich schnell: alle bekommen dieselbe Frage', () => {
    const z = spiel('turnier', 6) as KBasis & { tischRunde: { fragen: { item: string }[] }[] }
    const r = KLASSEN_REGELN.turnier!
    const tisch = z.tische[0]
    const items = tisch.map((wer) => (geraetSicht(z, r, wer, 0), z.personen[wer].aufgabe!.item))
    expect(new Set(items).size).toBe(1)
  })
  it('Gebiet: Sterne wählen, richtig erobert ein Feld mit dieser Sternzahl', () => {
    const z = spiel('gebiet', 4) as KBasis & { felder: { sterne: number; team: number | null }[]; wahl: Record<string, number | null> }
    const r = KLASSEN_REGELN.gebiet!
    expect(z.felder).toHaveLength(48)
    expect(r.frageZeigen!(z, 'p0')).toBe(false)
    expect(r.zug!(z, 'p0', 'sterne', '2', 0)).toBe(true)
    geraetSicht(z, r, 'p0', 0)
    const a = z.personen.p0.aufgabe!
    antworten(z, r, 'p0', a.frage.loesung, 1)
    const erobert = z.felder.filter((f) => f.team === z.personen.p0.team)
    expect(erobert).toHaveLength(1)
    expect(erobert[0].sterne).toBe(2)
    expect(z.wahl.p0).toBeNull()
  })
  it('Wett-Quiz: Einsatz zählt ±, private Rückmeldung je Einsatz', () => {
    const z = spiel('wette', 2) as KBasis & { konto: Record<string, number> }
    const r = KLASSEN_REGELN.wette!
    expect(r.zug!(z, 'p0', 'einsatz', '3', 0)).toBe(true)
    geraetSicht(z, r, 'p0', 0)
    antworten(z, r, 'p0', z.personen.p0.aufgabe!.frage.loesung, 1)
    expect(z.konto.p0).toBe(3)
    r.zug!(z, 'p0', 'einsatz', '2', 2)
    geraetSicht(z, r, 'p0', 2)
    antworten(z, r, 'p0', '###', 3)
    expect(z.konto.p0).toBe(1)
    expect(r.eigenText!(z, 'p0')).toContain('Bet 3: 1 of 1')
    // Ohne Einsatz keine Antwort
    expect(antworten(z, r, 'p0', 'x', 4)).toBeNull()
  })
  it('Rekord: Wert je Kind und Minute × Quote, Sieg nur über dem bisherigen Rekord', () => {
    const z = spiel('rekord', 2, { dauer: 3 })
    const r = KLASSEN_REGELN.rekord!
    z.rekordBisher = { wert: 999_999, text: '' }
    simuliere(z, 'rekord', 10, () => 2)
    const e = r.ergebnis(z)
    expect(e.sieg).toBe(false)
    expect(e.klassenwert).toBeGreaterThan(0)
  })
})

describe('Klassenspiele – Texte in der Zielsprache', () => {
  it('jeder Text in de, en, fr, es, it, la – Platzhalter überall gleich, Listen gleich lang', async () => {
    const { KT } = await import('../src/shared/klassenspiel/texte')
    for (const [k, f] of Object.entries(KT)) {
      const platz = (s: string): string => (s.match(/\{\d\}/g) ?? []).sort().join()
      const teile = (s: string): number => s.split('|').length
      for (const sp of ['de', 'en', 'fr', 'es', 'it', 'la'] as const) {
        expect(f[sp], `${k}/${sp}`).toBeTruthy()
        expect(platz(f[sp]), `${k}/${sp} Platzhalter`).toBe(platz(f.de))
        expect(teile(f[sp]), `${k}/${sp} Liste`).toBe(teile(f.de))
      }
    }
  })
  it('Rückfall Englisch für Sprachen ohne Fassung', async () => {
    const { kt } = await import('../src/shared/klassenspiel/texte')
    expect(kt('ru', 'uiPause')).toBe('Pause')
    expect(kt('fr', 'uiCode')).toContain('code')
  })
  it('Französischer Kurs: Teamnamen, Meldungen und Ergebnis auf Französisch', () => {
    const z = spiel('rennen', 6, { teams: 2 })
    z.sprache = 'fr'
    teamsLosen(z)
    KLASSEN_REGELN.rennen!.start(z, 0)
    expect(['Rouge', 'Bleue', 'Verte', 'Jaune', 'Violette', 'Orange']).toContain(z.teams[0].name)
    simuliere(z, 'rennen', 40, () => 3)
    const e = KLASSEN_REGELN.rennen!.ergebnis(z)
    expect(e.text).toMatch(/Équipe|Égalité/)
    const beamer = JSON.stringify(KLASSEN_REGELN.rennen!.beamer(z, 0))
    expect(beamer).toContain('Équipe')
    expect(beamer).not.toContain('Team ')
  })
})
