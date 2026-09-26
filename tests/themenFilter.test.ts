import { describe, expect, it } from 'vitest'
import { bereicheMitInhalt, bereichSetzen, leereThemen, type ThemenDaten } from '../src/shared/themen'

/*
 * „nur Arbeitsblätter" in der Bibliothek (Paket 15): nur Bereiche mit Materialien dieser Art –
 * rekursiv über Unterbereiche, samt Oberbereichen auf dem Weg –, eben angelegte trotzdem.
 */
function baum(): ThemenDaten {
  let d = bereichSetzen(leereThemen(), { id: 'welt1', fachId: 'geschichte', name: 'Der Erste Weltkrieg' })
  d = bereichSetzen(d, { id: 'ursachen', fachId: 'geschichte', name: 'Ursachen', elternId: 'welt1' })
  d = bereichSetzen(d, { id: 'balkan', fachId: 'geschichte', name: 'Balkan', elternId: 'ursachen' })
  d = bereichSetzen(d, { id: 'front', fachId: 'geschichte', name: 'Front', elternId: 'welt1' })
  d = bereichSetzen(d, { id: 'weimar', fachId: 'geschichte', name: 'Weimar' })
  d = bereichSetzen(d, { id: 'leer', fachId: 'geschichte', name: 'Leer' })
  return d
}

describe('Themenbereiche in der eingeschränkten Ansicht', () => {
  it('ein Blatt tief unten zeigt den ganzen Pfad, sonst nichts', () => {
    const ids = bereicheMitInhalt(baum(), new Map([['balkan', 1]]))
    expect([...ids].sort()).toEqual(['balkan', 'ursachen', 'welt1'])
  })

  it('leere und nur mit anderen Arten gefüllte Bereiche fallen weg (Zahl 0 zählt nicht)', () => {
    const ids = bereicheMitInhalt(
      baum(),
      new Map([
        ['weimar', 0],
        ['front', 2]
      ])
    )
    expect([...ids].sort()).toEqual(['front', 'welt1'])
  })

  it('eben angelegte Bereiche bleiben sichtbar – mit ihren Oberbereichen', () => {
    const ids = bereicheMitInhalt(baum(), new Map(), ['balkan', 'leer'])
    expect([...ids].sort()).toEqual(['balkan', 'leer', 'ursachen', 'welt1'])
  })

  it('unbekannte Kennungen stören nicht', () => {
    expect(bereicheMitInhalt(baum(), new Map([['weg', 3]]), ['auch-weg']).size).toBe(0)
  })
})
