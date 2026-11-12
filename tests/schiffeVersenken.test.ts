/**
 * Schiffe versenken (Umbau 12.11.2026, abgestimmt mit der Lehrkraft): Lernende stellen ihre Flotte selbst auf (7×7,
 * Schlachtschiff 4, Kreuzer 3, zwei Zerstörer 2), drehen Schiffe waagerecht/senkrecht, und vor dem Schuss werden die
 * Aufgaben mit den Treffern schwerer (sicher gelernte Wörter eine Stufe höher, Schreiben auch in Klasse 5–6).
 */
import { describe, expect, it } from 'vitest'
import { REGELN } from '../src/shared/mehrspieler/regeln'
import { leererInhalt, synonymeAus, vokItems } from '../src/shared/mehrspieler/inhalt'
import { einpassen, formatDerStufe, platzFrei, SCHIFFSTYPEN, schiffFelder } from '../src/shared/mehrspieler/spiele/staffel'
import type { Schwierigkeit, SpielInhalt, Band } from '../src/shared/mehrspieler/typen'
import type { Basis, Block } from '../src/shared/mehrspieler/kern'
import type { Vokabel } from '../src/shared/vokabeltrainer'

const W = ['weather', 'cloud', 'rain', 'wind', 'snow', 'dog', 'garden', 'street', 'sea', 'train', 'tent', 'ticket']
const WOERTER: Vokabel[] = W.map((term, i) => ({ id: `w${i}`, term, translation: `de-${term}`, example: `I like the ${term} very much.`, exampleTranslation: `Satz ${i}.`, pos: 'n' }))
function inhalt(): SpielInhalt {
  const i = leererInhalt('vok', 'en')
  i.items = vokItems(WOERTER)
  i.synonyme = synonymeAus(WOERTER)
  return i
}
type Z = Basis & Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
function starte(schwierigkeit: Schwierigkeit = 'mittel', jahrgang = 8, band: Band | null = null): Z {
  const i = inhalt()
  const spieler = ['a', 'b'].map((x) => ({ id: x, name: x.toUpperCase() }))
  const gemeinsam = Object.fromEntries(i.items.map((x) => [x.id, band]))
  return REGELN.schiffe.start({
    spiel: 'schiffe',
    spieler,
    schwierigkeit,
    jahrgang,
    inhalt: i,
    band: { gemeinsam, je: Object.fromEntries(spieler.map((s) => [s.id, { ...gemeinsam }])) },
    saat: 7,
    jetzt: 0
  }) as Z
}
const zug = (z: Z, wer: string, aktion: string, wert?: unknown): void => REGELN.schiffe.zug(z, wer, { aktion, wert }, 0)

describe('Schiffe versenken – Flotte aufstellen', () => {
  it('beginnt mit leerem Hafen und eigener Aufstellung, Gegnerflotte nie sichtbar', () => {
    const z = starte()
    expect(z.phase).toBe('legen')
    const sicht = REGELN.schiffe.sicht(z, 'a', 0) as Block[]
    const f = sicht.find((b) => b.typ === 'flotte') as Extract<Block, { typ: 'flotte' }>
    expect(f.groesse).toBe(7)
    expect(f.schiffe.map((s) => s.laenge)).toEqual([4, 3, 2, 2])
    expect(f.schiffe.map((s) => s.name)).toEqual(['Battleship', 'Cruiser', 'Destroyer', 'Destroyer'])
    expect(f.schiffe.every((s) => s.platz === null)).toBe(true)
    // Was Team b legt, sieht Team a nicht
    zug(z, 'b', 'zufall')
    const f2 = (REGELN.schiffe.sicht(z, 'a', 0) as Block[]).find((b) => b.typ === 'flotte') as Extract<Block, { typ: 'flotte' }>
    expect(f2.schiffe.every((s) => s.platz === null)).toBe(true)
  })

  it('legen, am Rand einpassen, Überlappen ablehnen, drehen, zurück in den Hafen', () => {
    const z = starte()
    zug(z, 'a', 'legen', { s: 0, feld: 5, quer: 'true' }) // wie vom Server: Werte als Text; Zeile 0, Spalte 5 → rückt auf Spalte 3
    expect(z.plaetze[0][0]).toEqual({ feld: 3, quer: true })
    expect(schiffFelder(z.plaetze[0][0], 4)).toEqual([3, 4, 5, 6])
    zug(z, 'a', 'legen', { s: 1, feld: 4, quer: false }) // würde das Schlachtschiff kreuzen
    expect(z.plaetze[0][1]).toBeNull()
    zug(z, 'a', 'legen', { s: 1, feld: 7, quer: true })
    expect(schiffFelder(z.plaetze[0][1], 3)).toEqual([7, 8, 9])
    // Drehen: waagerecht → senkrecht am selben Bug
    zug(z, 'a', 'drehen', 1)
    expect(z.plaetze[0][1]).toEqual({ feld: 7, quer: false })
    expect(schiffFelder(z.plaetze[0][1], 3)).toEqual([7, 14, 21])
    // Drehen am unteren Rand rückt das Schiff hoch
    zug(z, 'a', 'legen', { s: 2, feld: 48, quer: true })
    expect(z.plaetze[0][2]).toEqual({ feld: 47, quer: true })
    zug(z, 'a', 'drehen', 2)
    expect(z.plaetze[0][2]).toEqual({ feld: 40, quer: false })
    zug(z, 'a', 'hafen', 2)
    expect(z.plaetze[0][2]).toBeNull()
  })

  it('„Fertig" erst mit allen Schiffen; Spiel beginnt, wenn beide Teams fertig sind; „ändern" geht bis dahin', () => {
    const z = starte()
    zug(z, 'a', 'fertig')
    expect(z.bereit[0]).toBe(false)
    zug(z, 'a', 'zufall')
    zug(z, 'a', 'fertig')
    expect(z.bereit[0]).toBe(true)
    zug(z, 'a', 'aendern')
    expect(z.bereit[0]).toBe(false)
    zug(z, 'a', 'fertig')
    zug(z, 'b', 'zufall')
    zug(z, 'b', 'fertig')
    expect(z.phase).toBe('spiel')
    expect(z.flotte[0]).toHaveLength(11)
    expect(new Set(z.flotte[0]).size).toBe(11)
    // Nach dem Start ändert niemand mehr die Flotte
    zug(z, 'a', 'aendern')
    zug(z, 'a', 'hafen', 0)
    expect(z.plaetze[0][0]).not.toBeNull()
  })

  it('verlässt ein ganzes Team die Aufstellung, wird für es zufällig aufgestellt', () => {
    const z = starte()
    zug(z, 'a', 'zufall')
    zug(z, 'a', 'fertig')
    z.weg.push('b')
    REGELN.schiffe.weg!(z, 'b')
    expect(z.phase).toBe('spiel')
  })

  it('Hilfsfunktionen: einpassen und Überlappung', () => {
    expect(einpassen(6, true, 4)).toEqual({ feld: 3, quer: true })
    expect(einpassen(48, false, 2)).toEqual({ feld: 41, quer: false })
    const pl = SCHIFFSTYPEN.map(() => null) as ({ feld: number; quer: boolean } | null)[]
    pl[0] = { feld: 0, quer: true }
    expect(platzFrei(pl, 1, { feld: 2, quer: false })).toBe(false)
    expect(platzFrei(pl, 1, { feld: 7, quer: true })).toBe(true)
  })
})

describe('Schiffe versenken – Aufgaben werden schwerer', () => {
  const spiel = (z: Z): void => {
    for (const w of ['a', 'b']) zug(z, w, 'zufall'), zug(z, w, 'fertig')
  }
  const treffen = (z: Z, n: number): void => {
    // Team a trifft n Felder von Team b (direkt im Zustand, nur für den Test)
    for (const f of z.flotte[1].slice(0, n)) z.schuesse[1][f] = true
  }

  it('Stufen nach Treffern: erkennen → Wort finden → schreiben → Lückensatz', () => {
    const z = starte()
    spiel(z)
    const art = (): string => {
      const f = z.fragen.a
      return f.tippen ? (f.frage.includes('___') ? 'luecke' : 'schreiben') : f.frage.startsWith('de-') ? 'finden' : 'erkennen'
    }
    expect(art()).toBe('erkennen')
    const neu = (): void => {
      // nächste Frage für a wie im Spiel
      zug(z, 'a', 'antwort', 'x') // falsch → Zug geht an b
      zug(z, 'b', 'antwort', 'x') // falsch → zurück an a, neue Frage
    }
    treffen(z, 3)
    neu()
    expect(art()).toBe('finden')
    treffen(z, 6)
    neu()
    expect(art()).toBe('schreiben')
    treffen(z, 9)
    neu()
    expect(art()).toBe('luecke')
    // Anzeige der Stufe
    const st = (REGELN.schiffe.sicht(z, 'a', 0) as Block[]).filter((b) => b.typ === 'fortschritt') as Extract<Block, { typ: 'fortschritt' }>[]
    expect(st.some((b) => /level 4 of 4 – Fill the gap/.test(b.titel))).toBe(true)
  })

  it('sicher gelernte Wörter eine Stufe höher; schreiben auch in Klasse 5', () => {
    const z = starte('mittel', 5, 'leicht')
    spiel(z)
    expect(z.fragen.a.tippen).toBeFalsy()
    expect(z.fragen.a.frage.startsWith('de-')).toBe(true) // Stufe 2: Wort finden (statt erkennen)
    const item = z.inhalt.items[0]
    expect(formatDerStufe(item, 2)).toEqual({ art: 'abrufen', tippen: true })
    expect(formatDerStufe(item, 3).art).toBe('luecke')
  })

  it('Treffer melden versenkte Schiffe mit Namen', () => {
    const z = starte()
    spiel(z)
    z.dran = 0
    z.laeufer = [0, 0]
    z.schiessen = true
    const fs = schiffFelder(z.plaetze[1][3], 2)!
    zug(z, 'a', 'schuss', String(fs[0]))
    expect(z.letzte?.text).toBe('Hit!')
    z.dran = 0
    z.schiessen = true
    zug(z, 'a', 'schuss', String(fs[1]))
    expect(z.letzte?.text).toBe('Hit and sunk: Destroyer!')
  })
})
