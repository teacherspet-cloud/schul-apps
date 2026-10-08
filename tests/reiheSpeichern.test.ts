import { describe, expect, it } from 'vitest'
import { leererInhalt, standardErfolg, type Reihe, type Schritt } from '../src/shared/reihe'
import { aenderungenSeit, fuehreZusammen, istVeraltet, sofortVeroeffentlichen } from '../src/shared/reiheSpeichern'

/* Reihe speichern und veröffentlichen (08.10.2026): Konflikte, Zusammenführen, Änderungen für Lernende */
const schritt = (id: string, titel: string, extra: Partial<Schritt> = {}): Schritt => ({
  id,
  titel,
  lernziele: [],
  rolle: 'pflicht',
  erfolg: standardErfolg('aufgabe'),
  inhalt: leererInhalt('aufgabe'),
  ...extra
})
const reihe = (schritte: Schritt[], extra: Partial<Reihe> = {}): Reihe => ({
  id: 'r1',
  titel: 'Julikrise',
  fachId: 'geschichte',
  fachLabel: 'Geschichte',
  stateId: 'NI',
  schoolTypeId: 'gymnasium',
  grade: 9,
  oberthema: 'Erster Weltkrieg',
  lernziele: [],
  schritte,
  geaendert: '2026-10-08T10:00:00.000Z',
  ...extra
})

describe('Optimistisches Speichern', () => {
  it('lehnt nur ab, wenn der gespeicherte Stand neuer als die Basis ist – Aufträge dürfen immer', () => {
    expect(istVeraltet('2026-10-08T10:00:01.000Z', '2026-10-08T10:00:00.000Z')).toBe(true)
    expect(istVeraltet('2026-10-08T10:00:00.000Z', '2026-10-08T10:00:00.000Z')).toBe(false)
    expect(istVeraltet('2026-10-08T10:00:01.000Z', '2026-10-08T10:00:00.000Z', true)).toBe(false)
    // Ohne Basis (Altbestand, Testaufrufe) wie bisher
    expect(istVeraltet('2026-10-08T10:00:01.000Z', undefined)).toBe(false)
  })

  it('führt zusammen: eigene Änderungen bleiben, Ergebnisse von Aufträgen kommen dazu, neue Schritte beider Seiten bleiben', () => {
    const basis = reihe([schritt('a', 'Einstieg'), schritt('b', 'Quelle', { platzhalter: { beschreibung: 'Quelle M1' } }), schritt('c', 'Sicherung')])
    // Editor: Titel geändert, Schritt a umbenannt, neuer Schritt d hinter a, c gelöscht
    const lokal = { ...basis, titel: 'Die Julikrise 1914', schritte: [schritt('a', 'Bild als Einstieg'), schritt('d', 'Neu'), basis.schritte[1]] }
    // Server: Auftrag hat Platzhalter b gefüllt, Oberthema geändert, Schritt e am Ende ergänzt
    const server = {
      ...basis,
      geaendert: '2026-10-08T10:05:00.000Z',
      oberthema: 'Weg in den Krieg',
      schritte: [basis.schritte[0], { ...basis.schritte[1], platzhalter: undefined, kiEntwurf: true }, basis.schritte[2], schritt('e', 'Test')]
    }
    const z = fuehreZusammen(lokal, basis, server)
    expect(z.geaendert).toBe('2026-10-08T10:05:00.000Z')
    expect(z.titel).toBe('Die Julikrise 1914')
    expect(z.oberthema).toBe('Weg in den Krieg')
    expect(z.schritte.map((s) => s.id)).toEqual(['a', 'd', 'b', 'e'])
    expect(z.schritte[0].titel).toBe('Bild als Einstieg')
    expect(z.schritte[2].platzhalter).toBeUndefined()
    expect(z.schritte[2].kiEntwurf).toBe(true)
  })

  it('beide Seiten ändern denselben Schritt: der gefüllte Platzhalter des Auftrags gewinnt gegen den leeren', () => {
    const p = schritt('b', 'Quelle', { platzhalter: { beschreibung: 'x' } })
    const basis = reihe([p])
    const lokal = reihe([{ ...p, titel: 'Quelle M1' }])
    const server = reihe([{ ...p, platzhalter: undefined, kiEntwurf: true }], { geaendert: '2026-10-08T11:00:00.000Z' })
    const z = fuehreZusammen(lokal, basis, server)
    expect(z.schritte[0].platzhalter).toBeUndefined()
    expect(z.schritte[0].kiEntwurf).toBe(true)
  })

  it('Am Server gelöscht und hier unverändert: weg; hier geändert: bleibt', () => {
    const basis = reihe([schritt('a', 'A'), schritt('b', 'B')])
    const server = reihe([schritt('a', 'A')], { geaendert: '2026-10-08T11:00:00.000Z' })
    expect(fuehreZusammen(basis, basis, server).schritte.map((s) => s.id)).toEqual(['a'])
    const lokal = reihe([schritt('a', 'A'), schritt('b', 'B geändert')])
    expect(fuehreZusammen(lokal, basis, server).schritte.map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('Veröffentlichen für Lernende', () => {
  it('zählt nur, was Lernende sehen: Platzhalter, Stunden, Minuten und KI-Marken nicht', () => {
    const alt = reihe([schritt('a', 'A'), schritt('b', 'B')])
    expect(aenderungenSeit(alt, alt)).toBe(0)
    const nurLehrkraft = reihe([
      { ...schritt('a', 'A'), stunde: 2, minuten: 20, kiEntwurf: true, begruendung: 'weil' },
      schritt('b', 'B'),
      schritt('p', 'Platzhalter', { platzhalter: { beschreibung: 'später' } })
    ])
    expect(aenderungenSeit(alt, nurLehrkraft)).toBe(0)
  })

  it('zählt neue, entfernte und geänderte Schritte, Reihenfolge und Titel', () => {
    const alt = reihe([schritt('a', 'A'), schritt('b', 'B'), schritt('c', 'C')])
    const neu = reihe([schritt('b', 'B'), schritt('a', 'A geändert'), schritt('d', 'D')], { titel: 'Neu' })
    // Titel 1 + a geändert 1 + d neu 1 + c entfernt 1 + Reihenfolge 1
    expect(aenderungenSeit(alt, neu)).toBe(5)
    // Ohne veröffentlichten Stand: nichts offen
    expect(aenderungenSeit(null, neu)).toBe(0)
  })

  it('nicht zugewiesen: sofort veröffentlicht; zugewiesen: nur auf Wunsch', () => {
    expect(sofortVeroeffentlichen(0, false)).toBe(true)
    expect(sofortVeroeffentlichen(2, false)).toBe(false)
    expect(sofortVeroeffentlichen(2, true)).toBe(true)
  })
})
