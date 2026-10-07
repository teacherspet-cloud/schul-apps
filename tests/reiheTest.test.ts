import { describe, expect, it } from 'vitest'
import { leererInhalt, standardErfolg, type Reihe, type Schritt, type SchrittArt } from '../src/shared/reihe'
import { fuegeEin, passenderTest, testGrundlage, testPlatzhalter } from '../src/renderer/src/modules/unterrichtsreihe/reiheTest'

/* „Test hier erstellen" (06.10.2026): Grundlage bis zur Stelle, Platzhalter an genau dieser Stelle, fertiger Auftrag erkannt */
const schritt = (id: string, art: SchrittArt, mehr: Partial<Schritt> = {}): Schritt => ({
  id,
  titel: id,
  lernziele: [],
  rolle: 'pflicht',
  erfolg: standardErfolg(art),
  inhalt: leererInhalt(art),
  ...mehr
})
const lz = (text: string) => ({ text, ichKann: `Ich kann ${text}` })

const reihe = (): Reihe => ({
  id: 'r',
  titel: 'Unit 2',
  fachId: 'englisch',
  fachLabel: 'Englisch',
  stateId: 'NI',
  schoolTypeId: 'gymnasium',
  grade: 7,
  oberthema: 'London',
  lernziele: [lz('über London sprechen')],
  schritte: [
    schritt('a', 'lernkarten', {
      lernziele: [lz('Wörter zu Sehenswürdigkeiten')],
      inhalt: { art: 'lernkarten', karten: [{ vorne: 'bridge', hinten: 'Brücke' }] }
    }),
    schritt('b', 'vokabeln', {
      inhalt: {
        art: 'vokabeln',
        titel: 'Unit 2',
        sprache: 'en',
        fach: 'Englisch',
        woerter: [
          { id: '1', term: 'Bridge', translation: 'Brücke' },
          { id: '2', term: 'tower', translation: 'Turm' }
        ]
      }
    }),
    schritt('c', 'aufgabe', {
      lernziele: [lz('simple past bilden')],
      inhalt: { ...(leererInhalt('aufgabe') as Extract<Schritt['inhalt'], { art: 'aufgabe' }>), anweisung: 'Write about your weekend.' }
    }),
    schritt('d', 'reflexion'),
    schritt('e', 'arbeitsblatt', { lernziele: [lz('Postkarte schreiben')], platzhalter: { beschreibung: 'Postkarte aus London (Buch S. 39, Nr. 4)' } })
  ]
})

describe('Test aus der Reihe', () => {
  it('nimmt nur die Schritte bis zur Stelle: Lernziele, Wörter (ohne Doppelte), Stoff und Hinweis „neu formulieren"', () => {
    const g = testGrundlage(reihe(), 3, 'lernzielkontrolle')
    expect(g.schritte).toBe(3)
    expect(g.lernziele.map((l) => l.text)).toEqual(['Wörter zu Sehenswürdigkeiten', 'simple past bilden'])
    expect(g.woerter.map((w) => w.term)).toEqual(['bridge', 'tower'])
    expect(g.stoff).toContain('Write about your weekend.')
    expect(g.stoff).not.toContain('Postkarte')
    expect(g.stoff).toMatch(/Formuliere alle Testaufgaben NEU/)
    expect(g.stoff).toMatch(/formativ/)
    expect(g.titel).toBe('Lernzielkontrolle: London')
  })
  it('am Ende: Lernziele der Reihe dazu; Platzhalter-Schritte zählen mit ihrer Beschreibung; Reflexion ist kein Stoff', () => {
    const g = testGrundlage(reihe(), 5, 'klassenarbeit')
    expect(g.lernziele[0].text).toBe('über London sprechen')
    expect(g.stoff).toContain('Postkarte aus London')
    expect(g.schritte).toBe(4)
    expect(g.stoff).toMatch(/Anforderungsbereiche I–III/)
  })
  it('Wiederholung früherer Reihen mit 10–20 %', () => {
    const g = testGrundlage(reihe(), 3, 'klassenarbeit', {
      anteil: 40,
      reihen: [{ titel: 'Unit 1', oberthema: 'School', lernziele: [lz('present progressive')] }]
    })
    expect(g.stoff).toContain('WIEDERHOLUNG (etwa 20 %')
    expect(g.stoff).toContain('Unit 1 (School): present progressive')
    expect(testGrundlage(reihe(), 3, 'klassenarbeit').stoff).not.toContain('WIEDERHOLUNG')
  })
  it('Platzhalter steht an genau der Stelle, im Teil des vorigen Schritts; Art nach Test', () => {
    const r = reihe()
    r.schritte[1].abschnitt = 'Teil 1'
    const p = testPlatzhalter('klassenarbeit', 'doc1', { titel: 'Klassenarbeit: London', lernziele: [] })
    expect(p.inhalt.art).toBe('praesenz')
    expect(p.titel).toContain('schriftlich')
    expect(p.test).toEqual({ modul: 'klassenarbeit', docId: 'doc1' })
    const neu = fuegeEin(r.schritte, 'b', p)
    expect(neu.map((x) => x.id)).toEqual(['a', 'b', p.id, 'c', 'd', 'e'])
    expect(neu[2].abschnitt).toBe('Teil 1')
    expect(fuegeEin(r.schritte, null, testPlatzhalter('lernzielkontrolle', 'x', { titel: 'T', lernziele: [] }))[0].inhalt.art).toBe('onlinetest')
  })
  it('erkennt den fertigen Erzeugungs-Auftrag des Test-Dokuments (nicht kleine Aufträge, nicht fremde Dokumente)', () => {
    const offen = [{ modul: 'lernzielkontrolle' as const, docId: 'd1', reiheId: 'r', schrittId: 's', zeit: 100 }]
    expect(passenderTest(offen, { moduleId: 'lernzielkontrolle', docId: 'd1', status: 'fertig', sperrt: true, ende: 200 })?.schrittId).toBe('s')
    expect(passenderTest(offen, { moduleId: 'lernzielkontrolle', docId: 'd1', status: 'laufend', sperrt: true })).toBeUndefined()
    expect(passenderTest(offen, { moduleId: 'lernzielkontrolle', docId: 'd1', status: 'fertig', sperrt: false, ende: 200 })).toBeUndefined()
    expect(passenderTest(offen, { moduleId: 'klassenarbeit', docId: 'd1', status: 'fertig', sperrt: true, ende: 200 })).toBeUndefined()
    expect(passenderTest(offen, { moduleId: 'lernzielkontrolle', docId: 'd1', status: 'fertig', sperrt: true, ende: 50 })).toBeUndefined()
  })
})
