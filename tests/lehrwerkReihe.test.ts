import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  filterOptionen,
  filtere,
  gruppiereReihen,
  keinFilter,
  lehrwerkOptionen,
  mitReihe,
  nachKlasse,
  reiheAusName,
  reiheTitel,
  sinnvolleSortierungen,
  wirksamerFilter,
  wirksameSortierung,
  type ReihenBuch
} from '../src/shared/lehrwerkReihe'
import { buildTextbooks, detectColumns, parseCsvRows } from '../src/renderer/src/modules/vokabeltest/input/textbookCsv'

/* Schulbuchreihen (Paket 15): Reihe, Ausgabe, Band; Filter und Sortierung der Vokabellisten-Übersicht */

const gl = (band: string, grade: number): ReihenBuch => ({
  id: `gl-${band}`,
  name: `Green Line ${band}`,
  language: 'en',
  grade,
  publisher: 'Klett',
  edition: 'Niedersachsen',
  reihe: 'Green Line',
  ausgabe: 'ab 2021',
  band
})
const GREEN_LINE = [gl('Transition', 11), gl('3', 7), gl('1', 5), gl('10', 14), gl('2', 6)]

describe('Reihe und Band aus dem Namen', () => {
  it('erkennt Zahl, Wort und „Band"', () => {
    expect(reiheAusName('Green Line 3')).toEqual({ reihe: 'Green Line', band: '3' })
    expect(reiheAusName('Green Line Transition')).toEqual({ reihe: 'Green Line', band: 'Transition' })
    expect(reiheAusName('Découvertes Band 2')).toEqual({ reihe: 'Découvertes', band: '2' })
    expect(reiheAusName('  Access   IV ')).toEqual({ reihe: 'Access', band: 'IV' })
    expect(reiheAusName('Mein Vokabelheft')).toEqual({ reihe: 'Mein Vokabelheft' })
  })

  it('Migration: ergänzt nur, was fehlt', () => {
    expect(mitReihe({ name: 'Green Line 3' })).toEqual({ name: 'Green Line 3', reihe: 'Green Line', band: '3' })
    expect(mitReihe({ name: 'GL 3', reihe: 'Green Line', band: '3' })).toEqual({ name: 'GL 3', reihe: 'Green Line', band: '3' })
    // Reihe von Hand gesetzt: der Band ist der Rest des Namens
    expect(mitReihe({ name: 'Camden Town Gymnasium 2', reihe: 'Camden Town Gymnasium' })).toMatchObject({ band: '2' })
  })

  it('die mitgelieferten Green-Line-Bände tragen Reihe, Ausgabe und Band', () => {
    const dir = join(__dirname, '..', 'resources', 'lehrwerke')
    for (const f of readdirSync(dir).filter((x) => x.startsWith('green-line'))) {
      const b = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      expect(b).toMatchObject({ reihe: 'Green Line', ausgabe: 'ab 2021', publisher: 'Klett', edition: 'Niedersachsen' })
      expect(`${b.reihe} ${b.band}`).toBe(b.name)
    }
  })

  it('Platzhalter-Bände (09.10.2026): ¡Apúntate! 2016/2024, Découvertes Série jaune und Découvertes ab 2020, Reihe + Band im Namen, ohne Wortschatz', () => {
    const dir = join(__dirname, '..', 'resources', 'lehrwerke')
    const platz = readdirSync(dir)
      .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
      .filter((b) => b.platzhalter)
    expect(platz.filter((b) => b.reihe === '¡Apúntate!' && b.ausgabe === 'ab 2016')).toHaveLength(5)
    expect(platz.filter((b) => b.reihe === '¡Apúntate!' && b.ausgabe === 'ab 2024')).toHaveLength(5)
    expect(platz.filter((b) => b.reihe === 'Découvertes Série jaune')).toHaveLength(5)
    expect(platz.filter((b) => b.reihe === 'Découvertes' && b.ausgabe === 'ab 2020')).toHaveLength(5)
    for (const b of platz) {
      expect(`${b.reihe} ${b.band}`).toBe(b.name)
      expect(b.units).toEqual([])
    }
    expect(new Set(platz.map((b) => b.id)).size).toBe(platz.length)
  })

  it('CSV-Import mit Spalten „Lehrwerk" und „Band": Reihe und Band kommen daraus', () => {
    const rows = parseCsvRows('Lehrwerk;Band;Klasse;Unit;Englisch;Deutsch\nCamden Town;2;6;Unit 1;dog;Hund\n')
    const [b] = buildTextbooks(rows.slice(1), detectColumns(rows[0]), { language: 'en' })
    expect(b).toMatchObject({ name: 'Camden Town 2', reihe: 'Camden Town', band: '2' })
  })
})

describe('Beschriftung und Gruppen', () => {
  it('Landesausgabe steht vor der Ausgabe', () => {
    expect(reiheTitel(gl('1', 5))).toBe('Green Line · Niedersachsen · Ausgabe ab 2021 · Klett')
    expect(reiheTitel({ id: 'x', name: 'Access 1', language: 'en' })).toBe('Access')
  })

  it('eine Karte je Reihe + Landesausgabe + Ausgabe + Verlag, Bände in ihrer Reihenfolge', () => {
    const g = gruppiereReihen([...GREEN_LINE, { ...gl('1', 5), id: 'alt', ausgabe: 'ab 2014' }], 'reihe')
    expect(g).toHaveLength(2)
    expect(g[0].titel).toContain('ab 2021')
    expect(g[0].baende.map((b) => b.band)).toEqual(['1', '2', '3', '10', 'Transition'])
  })

  it('Sortierung: Verlag, Ausgabe neueste zuerst, Klassenstufe flach', () => {
    const access = { id: 'a1', name: 'Access 1', language: 'en', grade: 5, publisher: 'Cornelsen', reihe: 'Access', band: '1', ausgabe: 'ab 2014' }
    const alle = [...GREEN_LINE, access]
    expect(gruppiereReihen(alle, 'reihe').map((x) => x.reihe)).toEqual(['Access', 'Green Line'])
    expect(gruppiereReihen(alle, 'verlag').map((x) => x.reihe)).toEqual(['Access', 'Green Line'])
    expect(gruppiereReihen(alle, 'ausgabe').map((x) => x.reihe)).toEqual(['Green Line', 'Access'])
    expect(nachKlasse(alle).map((b) => b.id)).toEqual(['a1', 'gl-1', 'gl-2', 'gl-3', 'gl-Transition', 'gl-10'])
  })

  it('Auswahlliste im Vokabeltest: gruppiert nach Reihe, Einträge heißen wie der Band', () => {
    const o = lehrwerkOptionen(GREEN_LINE, (c) => c)
    expect(o).toHaveLength(1)
    expect(o[0].group).toBe('Green Line · Niedersachsen · Ausgabe ab 2021 · Klett')
    expect(o[0].items.map((i) => i.label)).toEqual(['Green Line 1', 'Green Line 2', 'Green Line 3', 'Green Line 10', 'Green Line Transition'])
    const zwei = lehrwerkOptionen([...GREEN_LINE, { id: 'd', name: 'Découvertes 1', language: 'fr' }], (c) => (c === 'fr' ? 'Französisch' : 'Englisch'))
    expect(zwei.map((x) => x.group)).toEqual(['Englisch – Green Line · Niedersachsen · Ausgabe ab 2021 · Klett', 'Französisch – Découvertes'])
  })
})

describe('Filter nur, wenn sie etwas unterscheiden (Zusatz der Lehrkraft)', () => {
  it('heute nur Green Line bei Klett für Niedersachsen: kein Filter außer dem Fach', () => {
    expect(filterOptionen(GREEN_LINE)).toEqual({ verlag: [], reihe: [], land: [], ausgabe: [] })
    expect(filterOptionen([])).toEqual({ verlag: [], reihe: [], land: [], ausgabe: [] })
  })

  it('ab zwei Werten erscheint der Filter; fehlende Angaben zählen nicht als Wert', () => {
    const o = filterOptionen([...GREEN_LINE, { id: 'a', name: 'Access 1', language: 'en', publisher: 'Cornelsen', ausgabe: 'ab 2014' }])
    expect(o.verlag).toEqual(['Cornelsen', 'Klett'])
    expect(o.reihe).toEqual(['Access', 'Green Line'])
    expect(o.land).toEqual([])
    expect(o.ausgabe).toEqual(['ab 2021', 'ab 2014'])
  })

  it('eine gemerkte Wahl für einen ausgeblendeten Filter oder einen verschwundenen Wert filtert nicht still weiter', () => {
    const optionen = filterOptionen(GREEN_LINE)
    const wahl = wirksamerFilter({ ...keinFilter(), verlag: ['Cornelsen'], reihe: ['Access'] }, optionen)
    expect(wahl).toEqual(keinFilter())
    expect(filtere(GREEN_LINE, wahl)).toHaveLength(GREEN_LINE.length)
    const mehr = [...GREEN_LINE, { id: 'a', name: 'Access 1', language: 'en', publisher: 'Cornelsen' }]
    const w2 = wirksamerFilter({ verlag: ['Cornelsen', 'Westermann'] }, filterOptionen(mehr))
    expect(w2.verlag).toEqual(['Cornelsen'])
    expect(filtere(mehr, w2).map((b) => b.id)).toEqual(['a'])
  })

  it('Sortierungen, die nichts bewirken, fehlen; eine gemerkte gilt dann als „Reihe A–Z"', () => {
    expect(sinnvolleSortierungen(GREEN_LINE)).toEqual(['reihe', 'klasse'])
    expect(sinnvolleSortierungen([gl('1', 5)])).toEqual([])
    expect(wirksameSortierung('verlag', sinnvolleSortierungen(GREEN_LINE))).toBe('reihe')
    expect(wirksameSortierung('klasse', sinnvolleSortierungen(GREEN_LINE))).toBe('klasse')
    const mehr = [...GREEN_LINE, { id: 'a', name: 'Access 1', language: 'en', publisher: 'Cornelsen' }]
    expect(sinnvolleSortierungen(mehr)).toEqual(['reihe', 'verlag', 'ausgabe', 'klasse'])
  })
})
