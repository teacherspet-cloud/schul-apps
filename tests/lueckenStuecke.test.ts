// Ausfüll-Listen im Lückentext (18.11.2026, Befund: „Maya's flat 1 Books on …: ___ 2 Colour …" in EINER Zeile)
import { describe, expect, it } from 'vitest'
import { lueckenStuecke } from '../src/renderer/src/modules/arbeitsblatt/render/Answers'

const arten = (s: string): string[] => lueckenStuecke(s).map((x) => `${x.art}:${x.text}`)

describe('lueckenStuecke – Zeilen, Nummern, Zwischenüberschriften', () => {
  it('Befund 5b: Nummern ohne Punkt und Zwischenüberschriften', () => {
    const src =
      "Maya's flat\n1 Books on Maya's shelves: [[twenty-five]]\n2 Colour of the cooker: [[blue]]\nLeo's house\n3 In Leo's bedroom: a bed, a desk and an [[armchair]]\n4 Room with the big mirror: the [[bathroom]]\n5 Name of Leo's dog: [[Bobby]]"
    expect(arten(src)).toEqual([
      "titel:Maya's flat",
      "punkt:1 Books on Maya's shelves: [[twenty-five]]",
      'punkt:2 Colour of the cooker: [[blue]]',
      "titel:Leo's house",
      "punkt:3 In Leo's bedroom: a bed, a desk and an [[armchair]]",
      'punkt:4 Room with the big mirror: the [[bathroom]]',
      "punkt:5 Name of Leo's dog: [[Bobby]]"
    ])
  })

  it('„Stichwort: [[Lösung]]" ohne Nummern: Zeile für Zeile', () => {
    const src = 'Flat number: [[24]]\nRooms in the flat: [[six]]\nLiving room: a green sofa, an old [[armchair]] and a TV'
    expect(lueckenStuecke(src).map((x) => x.art)).toEqual(['punkt', 'punkt', 'punkt'])
  })

  it('Fließtext bleibt ein Absatz; „1." und „-" wie bisher', () => {
    const prosa = 'Maya lives in a [[flat]] in London.\nShe has a brother. His name is [[Sam]].'
    expect(lueckenStuecke(prosa).map((x) => x.art)).toEqual(['absatz'])
    expect(lueckenStuecke('1. I [[am]] here.\n2. You [[are]] there.').map((x) => x.art)).toEqual(['punkt', 'punkt'])
    // Eine Zahl am Satzanfang ohne Lücke und Doppelpunkt ist kein Listenpunkt
    expect(lueckenStuecke('25 children are in the class.\nThey [[like]] it.').map((x) => x.art)).toEqual(['absatz'])
  })

  it('die Zeilen bleiben über start/ende genau adressierbar (Bearbeiten ersetzt nur das eine Stück)', () => {
    const src = "Maya's flat\n1 Books: [[25]]\n2 Cooker: [[blue]]"
    const st = lueckenStuecke(src)
    const zeilen = src.split('\n')
    for (const s of st) expect(zeilen.slice(s.start, s.ende).join('\n')).toBe(s.text)
  })
})
