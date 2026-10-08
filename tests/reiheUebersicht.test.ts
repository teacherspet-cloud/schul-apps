import { describe, expect, it } from 'vitest'
import { leererInhalt, standardErfolg, type Reihe, type Schritt, type SchrittArt } from '@shared/reihe'
import { ansichtFuer, stundenGruppen, stundenTitel } from '../src/renderer/src/modules/unterrichtsreihe/stundenAnsicht'
import {
  blattZiele,
  buchSeiten,
  grundlageChips,
  grundlageEingabe,
  grundlageUmschalten,
  grundlageZeilen,
  kcAuszugFuer,
  merkeKcAuszug
} from '../src/renderer/src/modules/unterrichtsreihe/grundlage'

const schritt = (id: string, o: Partial<Schritt> = {}, art: SchrittArt = 'aufgabe'): Schritt => ({
  id,
  titel: `Schritt ${id}`,
  lernziele: [],
  rolle: 'pflicht',
  erfolg: standardErfolg(art),
  inhalt: leererInhalt(art),
  ...o
})

const reihe = (o: Partial<Reihe> = {}): Reihe => ({
  id: 'r1',
  titel: 'Wetter',
  fachId: 'englisch',
  fachLabel: 'Englisch',
  stateId: 'NI',
  schoolTypeId: 'gymnasium',
  grade: 7,
  oberthema: 'Weather',
  lernziele: [
    { text: 'Wetter beschreiben', ichKann: 'Ich kann das Wetter beschreiben.' },
    { text: 'Vorhersagen verstehen', ichKann: 'Ich kann Vorhersagen verstehen.' }
  ],
  schritte: [],
  ...o
})

describe('Stundenansicht', () => {
  it('gruppiert Schritte je Stunde, Teile als Zwischenüberschrift, Rest unter „Ohne Stunde"', () => {
    const r = reihe({
      stunden: ['einzel', 'doppel'],
      teile: ['Einstieg', 'Übung'],
      schritte: [
        schritt('a', { stunde: 0, abschnitt: 'Einstieg', minuten: 20 }),
        schritt('b', { stunde: 1, abschnitt: 'Einstieg', minuten: 30 }),
        schritt('c', { stunde: 1, abschnitt: 'Übung', minuten: 40 }),
        schritt('d', { abschnitt: 'Übung' }),
        schritt('e', { stunde: 9 })
      ]
    })
    const g = stundenGruppen(r)
    expect(g.map((x) => x.stunde)).toEqual([0, 1, null])
    expect(g[1].zeilen.map((z) => [z.schritt.id, z.teilWechsel])).toEqual([
      ['b', true],
      ['c', true]
    ])
    expect(g[1].summe).toBe(70)
    expect(g[1].ueberlang).toBe(false)
    expect(g[2].zeilen.map((z) => z.schritt.id)).toEqual(['d', 'e'])
    expect(stundenTitel(g[1])).toBe('Stunde 2 · Doppelstunde · 90 min')
    expect(stundenTitel(g[2])).toBe('Ohne Stunde')
  })

  it('warnt bei Überlänge und zählt nur Pflichtschritte', () => {
    const r = reihe({
      stunden: ['einzel'],
      schritte: [schritt('a', { stunde: 0, minuten: 40 }), schritt('b', { stunde: 0, minuten: 30, rolle: 'optional' }), schritt('c', { stunde: 0, minuten: 10 })]
    })
    const [g] = stundenGruppen(r)
    expect(g.summe).toBe(50)
    expect(g.ueberlang).toBe(true)
  })

  it('zeigt leere Stunden und keine „Ohne Stunde"-Gruppe, wenn alles verteilt ist', () => {
    const g = stundenGruppen(reihe({ stunden: ['einzel', 'einzel'], schritte: [schritt('a', { stunde: 0 })] }))
    expect(g).toHaveLength(2)
    expect(g[1].zeilen).toEqual([])
  })

  it('Ansicht: ohne Stundenraster Teile, Standard Stunden, Experte nach Wahl', () => {
    expect(ansichtFuer({ stunden: [] }, true, 'stunden')).toBe('teile')
    expect(ansichtFuer({ stunden: ['einzel'] }, false, 'teile')).toBe('stunden')
    expect(ansichtFuer({ stunden: ['einzel'] }, true, 'teile')).toBe('teile')
    expect(ansichtFuer({ stunden: ['einzel'] }, true, null)).toBe('stunden')
  })
})

describe('Grundlage der KI', () => {
  const kc = { quelle: 'Kerncurriculum NI Englisch', zeilen: Array.from({ length: 20 }, (_, i) => `Zeile ${i + 1}`) }
  const s1 = schritt('a', { titel: 'Einstieg' })
  const s2 = schritt('b', {
    lernziele: [{ text: 'Wetter beschreiben', ichKann: 'Ich kann …' }],
    minuten: 20,
    platzhalter: { beschreibung: 'Kurzer Auftrag', begruendung: 'Vorwissen aktivieren', buch: 'Lies VT1 auf S. 34-35.' }
  })
  const r = reihe({ schritte: [s1, s2] })

  it('baut Chips wie „Kerncurriculum Englisch 7 · 2 Lernziele · Schulbuch S. 34–35 · 20 min · 1 vorheriger Schritt"', () => {
    const c = grundlageChips(r, s2, kc)
    expect(c.map((x) => x.label)).toEqual([
      'Kerncurriculum Englisch 7',
      '2 Lernziele',
      'Schulbuch S. 34–35',
      '20 min',
      '1 vorheriger Schritt',
      'Didaktische Funktion'
    ])
    expect(c[0].zeilen).toHaveLength(15)
    expect(c.find((x) => x.id === 'buch')?.abwaehlbar).toBe(false)
  })

  it('ohne Kerncurriculum steht die Lerngruppe da (nicht abwählbar)', () => {
    const c = grundlageChips(r, s1, null)
    expect(c[0]).toMatchObject({ id: 'lerngruppe', label: 'Englisch · Jg. 7', abwaehlbar: false })
  })

  it('Eingaben enthalten Reihenziele, Auszug, Minuten, Funktion, Davor – Abgewähltes fehlt', () => {
    const e = grundlageEingabe(r, s2, kc)
    expect(e.reiheZiele).toEqual(['Vorhersagen verstehen'])
    expect(e.schrittZiele).toEqual(['Wetter beschreiben'])
    expect(e.kc?.zeilen).toHaveLength(15)
    expect(e).toMatchObject({ minuten: 20, funktion: 'Vorwissen aktivieren', davor: ['Einstieg'] })
    const zeilen = grundlageZeilen(e).join('\n')
    expect(zeilen).toContain('LERNZIELE DER REIHE')
    expect(zeilen).toContain('KERNCURRICULUM (Kerncurriculum NI Englisch)')
    expect(zeilen).toContain('etwa 20 Minuten')
    expect(zeilen).toContain('DIDAKTISCHE FUNKTION AN DIESER STELLE: Vorwissen aktivieren')

    const aus = { ...s2, grundlageAus: ['kc', 'lernziele', 'minuten', 'davor', 'funktion'] }
    const e2 = grundlageEingabe(r, aus, kc)
    expect(e2.kc).toBeUndefined()
    expect(e2.reiheZiele).toEqual([])
    expect(e2.schrittZiele).toEqual(['Wetter beschreiben'])
    expect(e2.minuten).toBeUndefined()
    expect(e2.funktion).toBeUndefined()
    expect(e2.davor).toEqual([])
    expect(e2.buch).toBe('Lies VT1 auf S. 34-35.')
    expect(grundlageChips(r, aus, kc).filter((c) => c.aus).map((c) => c.id)).toEqual(['kc', 'lernziele', 'minuten', 'davor', 'funktion'])
  })

  it('Lernziel-Feld des Arbeitsblatts nennt Auftrag, Funktion, Reihenziele und Kerncurriculum', () => {
    const t = blattZiele('Kurzer Auftrag', grundlageEingabe(r, s2, kc))
    expect(t.split('\n')[0]).toBe('Kurzer Auftrag')
    expect(t).toContain('- Wetter beschreiben')
    expect(t).toContain('Didaktische Funktion an dieser Stelle der Reihe: Vorwissen aktivieren')
    expect(t).toContain('Übergeordnete Lernziele der Reihe:\n- Vorhersagen verstehen')
    expect(t).toContain('Bezug zum Kerncurriculum (Kerncurriculum NI Englisch)')
  })

  it('Umschalten, Buchseiten, Speicher des Auszugs', () => {
    expect(grundlageUmschalten({}, 'kc')).toEqual(['kc'])
    expect(grundlageUmschalten({ grundlageAus: ['kc'] }, 'kc')).toBeUndefined()
    expect(buchSeiten('Lies M2 auf S. 12')).toBe('S. 12')
    expect(buchSeiten('ohne Seite')).toBe('')
    merkeKcAuszug(r, kc)
    expect(kcAuszugFuer(r)).toBe(kc)
    expect(kcAuszugFuer({ ...r, oberthema: 'Anderes' })).toBeNull()
    merkeKcAuszug(r, null)
    expect(kcAuszugFuer(r)).toBeNull()
  })
})
