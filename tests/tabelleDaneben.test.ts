import { describe, expect, it } from 'vitest'
import { tabelleZuGrossDaneben, tabellenHoeheDaneben } from '../src/renderer/src/modules/arbeitsblatt/didactics/tabelleDaneben'
import { seiteVon } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import type { TableBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

// Befund 03.11.2026 „Midterm elections": Faktenbox mit Sätzen stand als schmale Spalte neben Aufgabe 4
const FAKTENBOX = {
  title: 'Fact box: the Bundestag election in Germany',
  headers: ['Feature', 'Germany'],
  rows: [
    ['Turnout', 'In the Bundestag election of 2025, about 82 percent of eligible voters took part.'],
    ['Head of government', 'Voters do not elect the chancellor directly. The Bundestag (the German federal parliament) elects the chancellor with a majority.'],
    ['Removing the head of government', 'The Bundestag can replace the chancellor at any time, but only by electing a new chancellor with a majority (constructive vote of no confidence).'],
    ['Second chamber', 'Voters do not elect the Bundesrat. The governments of the 16 states send their members. The Bundesrat must agree to laws that affect the states.'],
    ['State elections', 'Each of the 16 states elects its own parliament (Landtag) on a different date. The results can change the majority in the Bundesrat.'],
    ['Two votes', 'With the first vote (Erststimme), voters choose a local candidate. The second vote (Zweitstimme) for a party decides how many seats each party gets.'],
    ['Rhythm', 'Normally every four years. All 630 seats of the Bundestag are elected on the same day.']
  ]
}
const STICHWORTE = { title: 'Dates', headers: ['Year', 'Event'], rows: [['1914', 'war begins'], ['1916', 'Verdun'], ['1918', 'armistice']] }

describe('Tabelle neben der Aufgabe (03.11.2026)', () => {
  it('Faktenbox mit Sätzen ist zu groß, Stichwort-Tabelle passt', () => {
    expect(tabellenHoeheDaneben(FAKTENBOX)).toBeGreaterThan(150)
    expect(tabelleZuGrossDaneben(FAKTENBOX)).toBe(true)
    expect(tabelleZuGrossDaneben(STICHWORTE)).toBe(false)
  })
  it('bestehende Blätter: große Tabelle steht untereinander, von Hand gewählt bleibt daneben', () => {
    const b = { id: 't', type: 'table', side: 'right', ...FAKTENBOX } as unknown as TableBlock
    expect(seiteVon(b)).toBeUndefined()
    expect(seiteVon({ ...b, seiteVonHand: true })).toBe('right')
    expect(seiteVon({ ...b, ...STICHWORTE })).toBe('right')
  })
})
