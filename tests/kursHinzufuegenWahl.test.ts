import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bandStand, naechsteGrammatik, vorwahlBuch, type VorwahlBuch, type VorwahlDaten } from '../src/shared/lehrwerkVorwahl'
import { abschnittAnsicht } from '../src/renderer/src/modules/lernen/kurs/AbschnittWahl'

/*
 * „Vokabeln/Grammatik hinzufügen" klarer (10.10.2026, Wunsch der Lehrkraft): richtiger Band vorgewählt, für den GANZEN Kurs
 * Freigegebenes ausgeblendet (Einzel-Freigaben nicht), Vorschlag „als Nächstes" nach dem letzten freigegebenen Abschnitt.
 */
const buch = (id: string): VorwahlBuch & { units: { name: string; sections: { name: string; entries: { term: string; translation: string }[] }[] }[] } =>
  JSON.parse(readFileSync(`resources/lehrwerke/${id}.json`, 'utf8'))
const GL1 = buch('green-line-1')
const GL2 = buch('green-line-2')
const unit1 = GL1.units.find((u) => u.name === 'Unit 1')!
const unit2 = GL1.units.find((u) => u.name === 'Unit 2')!
// Zwischen Unit 1 und Unit 2 steht „Media smart" (Buchreihenfolge)
const media = GL1.units[GL1.units.indexOf(unit1) + 1]

const basis: VorwahlDaten = {
  sprache: 'en',
  jahrgang: 5,
  kursLehrwerk: 'green-line-1',
  kursUnits: [],
  stand: null,
  klassenLehrwerke: [],
  ueblicheLehrwerke: [],
  // „Hello", Unit 1 und „Media smart" ganz für den Kurs freigegeben
  freigegeben: [
    ...GL1.units[0].sections.map((s) => ({ lehrwerk: 'green-line-1', buch: 'Green Line 1', unit: GL1.units[0].name, abschnitt: s.name })),
    ...unit1.sections.map((s) => ({ lehrwerk: '', buch: 'Green Line 1', unit: 'Unit 1', abschnitt: s.name })),
    ...media.sections.map((s) => ({ lehrwerk: 'green-line-1', buch: 'Green Line 1', unit: media.name, abschnitt: s.name }))
  ],
  // Unit 2 · Station 1 nur für eine Person (Wiederholerin) – zählt nicht als freigegeben
  einzeln: [{ lehrwerk: 'green-line-1', buch: 'Green Line 1', unit: 'Unit 2', abschnitt: 'Station 1', lernende: 1 }]
}

describe('Abschnitte im Dialog', () => {
  it('blendet Freigegebenes aus, Einzel-Freigaben bleiben, Vorschlag ist der nächste Abschnitt', () => {
    const st = bandStand(GL1, basis)
    expect(st.naechster).toEqual({ unit: 'Unit 2', abschnitt: unit2.sections[0].name })
    const a = abschnittAnsicht(GL1, basis, false)
    expect(a.units.map((u) => u.name)).not.toContain('Unit 1')
    expect(a.versteckt).toBe(GL1.units[0].sections.length + unit1.sections.length + media.sections.length)
    const u2 = a.units.find((u) => u.name === 'Unit 2')!
    expect(u2.abschnitte[0].vorschlag).toBe(true)
    expect(u2.abschnitte.find((x) => x.name === 'Station 1')).toMatchObject({ frei: false, einzeln: 1 })
    // „Bereits freigegebene zeigen": Unit 1 wieder da, als freigegeben markiert
    const alle = abschnittAnsicht(GL1, basis, true)
    expect(alle.units.find((u) => u.name === 'Unit 1')?.abschnitte.every((x) => x.frei)).toBe(true)
  })

  it('ohne Freigegebenes im Band kein Vorschlag; nur Einzel-Freigaben auch nicht', () => {
    expect(bandStand(GL2, basis).naechster).toBeNull()
    expect(bandStand(GL1, { ...basis, freigegeben: [] }).naechster).toBeNull()
    expect(abschnittAnsicht(GL1, { ...basis, freigegeben: [] }, false).versteckt).toBe(0)
  })

  it('mehrere Bände im Kurs: der neueste ist vorgewählt', () => {
    const b = vorwahlBuch({ ...basis, kursLehrwerke: ['green-line-1', 'green-line-2'] }, [GL1, GL2])
    expect(b?.id).toBe('green-line-2')
    expect(vorwahlBuch(basis, [GL1, GL2])?.id).toBe('green-line-1')
  })
})

describe('Grammatik als Nächstes', () => {
  const eintraege = [
    { kapitel: 'Unit 1 · Station 1', ids: ['a'], sicher: true },
    { kapitel: 'Unit 1 · Station 2', ids: ['b'], sicher: true },
    { kapitel: 'Unit 2', ids: ['x'], sicher: false },
    { kapitel: 'Unit 2 · Station 1', ids: ['c'], sicher: true }
  ]
  it('nach der letzten freigegebenen Form, Unsicheres zählt nicht', () => {
    expect(naechsteGrammatik(eintraege, ['a', 'b'])).toEqual({ id: 'c', kapitel: 'Unit 2 · Station 1' })
    expect(naechsteGrammatik(eintraege, [])).toEqual({ id: 'a', kapitel: 'Unit 1 · Station 1' })
    expect(naechsteGrammatik(eintraege, ['b'])).toEqual({ id: 'c', kapitel: 'Unit 2 · Station 1' })
    expect(naechsteGrammatik(eintraege, ['a', 'b', 'c'])).toBeNull()
  })
})

describe('Grammatik als Nächstes – Wiederholungen', () => {
  it('eine später wiederholte Form verschiebt den Stand nicht', () => {
    const e = [
      { kapitel: 'Unit 1 · Station 1', ids: ['a'], sicher: true },
      { kapitel: 'Unit 1 · Station 3', ids: ['p'], sicher: true },
      { kapitel: 'Unit 1 · Station 3', ids: ['m'], sicher: true },
      { kapitel: 'Unit 2 · Station 3', ids: ['p'], sicher: true }
    ]
    expect(naechsteGrammatik(e, ['a', 'p'])).toEqual({ id: 'm', kapitel: 'Unit 1 · Station 3' })
  })
})
