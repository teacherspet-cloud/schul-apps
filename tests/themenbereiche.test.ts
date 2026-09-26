import { describe, expect, it } from 'vitest'
import { bereichLoeschen, bereichSetzen, leereThemen, materialSchluessel, pruefeThemen, uebernehmen, verwaisteSchluessel, zuordnen } from '../src/shared/themen'
import {
  AB_MATERIALIEN,
  aehnlichkeit,
  einsortieren,
  sortiere,
  stichwoerter,
  umstellen,
  vorschauText,
  vorschlagen,
  type ThemenMaterial
} from '../src/renderer/src/shared/themenVorschlag'
import { katalogFuer } from '../src/renderer/src/shared/themenKatalog'
import { fachAnzeige, fachSchluessel } from '../src/renderer/src/shell/materialien'
import { ART_FARBEN, FEHLSICHTIGKEIT, simuliere } from '../src/renderer/src/shared/materialart'
import { farbabstand } from '../src/renderer/src/shared/fachfarben'

/*
 * Themenbereiche (Paket 10b): Vorschläge ohne KI, Automatik, Vorrang von Hand, Sortierung.
 * Die Beispielthemen sind so gewählt, wie sie in den Bibliotheken der Lehrkraft stehen –
 * mit zwei Schreibweisen (Foto-/Photosynthese), Programmwörtern im Namen und Einzelgängern.
 */
let n = 0
const mat = (thema: string, moduleId = 'arbeitsblatt', extra: Partial<ThemenMaterial> = {}): ThemenMaterial => ({
  moduleId,
  id: `m${++n}`,
  name: thema,
  thema,
  fachId: 'biologie',
  grade: 7,
  updatedAt: `2026-09-${String(10 + (n % 15)).padStart(2, '0')}T08:00:00Z`,
  ...extra
})

const biologie = (): ThemenMaterial[] => [
  mat('Fotosynthese'),
  mat('Photosynthese – Versuch mit Wasserpest', 'lernzielkontrolle'),
  mat('Die Zelle'),
  mat('Zellatmung und Gärung', 'lernzielkontrolle'),
  mat('Zellorganellen im Überblick', 'klassenarbeit'),
  mat('Ökosystem Wald'),
  mat('Ökosysteme im Vergleich', 'lernzielkontrolle'),
  mat('Verdauung beim Menschen')
]

describe('Fach über alle Programme', () => {
  it('macht aus Kennung, Namen und Sprachcode dasselbe Fach', () => {
    expect(fachSchluessel('Biologie')).toBe('biologie')
    expect(fachSchluessel('biologie')).toBe('biologie')
    expect(fachSchluessel('en')).toBe('englisch')
    expect(fachSchluessel('nl')).toBe('niederlaendisch')
    expect(fachSchluessel('Klingonisch')).toBe('klingonisch')
    expect(fachSchluessel(undefined)).toBe('ohne-fach')
    expect(fachAnzeige('niederlaendisch')).toBe('Niederländisch')
    expect(fachAnzeige('erdkunde')).toBe('Erdkunde / Geographie')
  })
})

describe('Wörter vergleichen', () => {
  it('behandelt Foto- und Photosynthese, Endungen und Programmwörter gleich', () => {
    expect(stichwoerter('Arbeitsblatt Photosynthese')).toEqual(stichwoerter('Fotosynthese'))
    expect(stichwoerter('Zellen')).toEqual(stichwoerter('Zelle'))
    expect(stichwoerter('Unit 3 – Vokabeltest')).toEqual(['unit3'])
    expect(aehnlichkeit(stichwoerter('Zelle'), stichwoerter('Zellatmung und Gärung'))).toBe(1)
    // Nur ein gemeinsames von zwei Wörtern – nicht ähnlich genug (Faustregel 0,6)
    expect(aehnlichkeit(stichwoerter('Verdauung beim Menschen'), stichwoerter('Evolution des Menschen'))).toBeLessThan(0.6)
    // „Unit 1" ist nicht „Unit 12"
    expect(aehnlichkeit(stichwoerter('Unit 1'), stichwoerter('Unit 12'))).toBe(0)
  })
})

describe('Vorschläge', () => {
  it('schlägt erst ab 8 Materialien im Fach etwas vor', () => {
    const acht = biologie()
    expect(acht).toHaveLength(AB_MATERIALIEN)
    expect(vorschlagen(acht.slice(0, 7), leereThemen(), 'biologie')).toEqual([])
    expect(vorschlagen(acht, leereThemen(), 'biologie').length).toBeGreaterThan(0)
  })

  it('gruppiert nach gemeinsamen Stichwörtern und lässt Einzelgänger außen vor', () => {
    const v = vorschlagen(biologie(), leereThemen(), 'biologie')
    const namen = Object.fromEntries(v.map((x) => [x.name, x.schluessel.length]))
    expect(namen).toEqual({ Zelle: 3, Fotosynthese: 2, Ökosystem: 2 })
    expect(vorschauText(v)).toBe('Zelle (3), Fotosynthese (2), Ökosystem (2)')
  })

  it('zählt mit Jahrgangsfilter nur diesen Jahrgang', () => {
    const liste = biologie().map((m, i) => (i < 4 ? { ...m, grade: 8 } : m))
    expect(vorschlagen(liste, leereThemen(), 'biologie', { jahrgang: 7 })).toEqual([])
  })

  it('nimmt belegte Lehrplanthemen als Namen, wenn mehrere Materialien dazu passen', () => {
    const liste = [...biologie(), mat('Imperialismus in Afrika'), mat('Imperialismus und Kolonisierung', 'lernzielkontrolle')].map((m) => ({
      ...m,
      fachId: 'geschichte'
    }))
    const v = vorschlagen(liste, leereThemen(), 'geschichte', { katalog: katalogFuer('geschichte') })
    const lehrplan = v.find((x) => x.herkunft === 'lehrplan')
    expect(lehrplan?.schluessel).toHaveLength(2)
    expect(lehrplan?.name).toBe('Imperialismus und Kolonisierung in Afrika')
  })

  it('ordnet Englisch nach der Unit des Lehrwerks im passenden Jahrgang', () => {
    const e = (name: string, moduleId = 'vokabeltest'): ThemenMaterial => mat(name, moduleId, { fachId: 'englisch', grade: 6 })
    const liste = [
      e('Green Line 2 – Unit 3'),
      e('Unit 3 present perfect', 'grammatiktest'),
      e('Unit 2 London'),
      e('Unit 2 going to future', 'arbeitsblatt'),
      e('Wetter'),
      e('Sport'),
      e('Feiertage'),
      e('Schule')
    ]
    const v = vorschlagen(liste, leereThemen(), 'englisch', { katalog: katalogFuer('englisch') })
    expect(v.map((x) => x.name).sort()).toEqual(['Unit 2: London: Wow!', 'Unit 3: Star of the internet'])
  })

  it('schlägt von Hand Zugeordnetes nicht noch einmal vor', () => {
    const liste = biologie()
    let d = bereichSetzen(leereThemen(), { id: 'bereich1', fachId: 'biologie', name: 'Stoffwechsel' })
    d = zuordnen(d, { [materialSchluessel('arbeitsblatt', liste[2].id)]: { bereichId: 'bereich1', von: 'hand', am: '' } })
    const v = vorschlagen(liste, d, 'biologie')
    expect(v.flatMap((x) => x.schluessel)).not.toContain(materialSchluessel('arbeitsblatt', liste[2].id))
  })
})

describe('Übernehmen und Automatik', () => {
  it('übernimmt Vorschläge, schaltet die Automatik ein und sortiert neue Materialien ein', () => {
    const liste = biologie()
    const v = vorschlagen(liste, leereThemen(), 'biologie')
    let id = 0
    const d = uebernehmen(leereThemen(), v, ['biologie'], () => `bereich${++id}`)
    expect(d.bereiche.map((b) => b.name)).toEqual(['Zelle', 'Fotosynthese', 'Ökosystem'])
    expect(d.automatik.biologie).toBe(true)
    expect(Object.values(d.zuordnungen).every((z) => z.von === 'auto')).toBe(true)

    const neu = [mat('Zellteilung (Mitose)'), mat('Ökosystem See'), mat('Blutkreislauf')]
    const sortiert = einsortieren([...liste, ...neu], d)
    const zelle = d.bereiche.find((b) => b.name === 'Zelle')!.id
    expect(sortiert[materialSchluessel('arbeitsblatt', neu[0].id)]).toMatchObject({ bereichId: zelle, von: 'auto' })
    expect(sortiert[materialSchluessel('arbeitsblatt', neu[1].id)]?.bereichId).toBe(d.bereiche.find((b) => b.name === 'Ökosystem')!.id)
    // Passt nirgends hin: bleibt ohne Bereich
    expect(sortiert[materialSchluessel('arbeitsblatt', neu[2].id)]).toBeUndefined()
  })

  it('fasst von Hand Zugeordnetes nie an – auch nicht ausdrücklich „Ohne Themenbereich"', () => {
    const liste = biologie()
    let d = uebernehmen(leereThemen(), [{ fachId: 'biologie', name: 'Zelle', schluessel: [] }], ['biologie'], () => 'bereich1')
    const hand = mat('Zellkern')
    const ohne = mat('Zellwand')
    d = zuordnen(d, { [materialSchluessel('arbeitsblatt', ohne.id)]: { bereichId: null, von: 'hand', am: '' } })
    d = bereichSetzen(d, { id: 'bereich2', fachId: 'biologie', name: 'Genetik' })
    d = zuordnen(d, { [materialSchluessel('arbeitsblatt', hand.id)]: { bereichId: 'bereich2', von: 'hand', am: '' } })
    const sortiert = einsortieren([...liste, hand, ohne], d)
    expect(sortiert[materialSchluessel('arbeitsblatt', hand.id)]).toBeUndefined()
    expect(sortiert[materialSchluessel('arbeitsblatt', ohne.id)]).toBeUndefined()
    // Auch ein übernommener Vorschlag verschiebt von Hand Zugeordnetes nicht
    const nochmal = uebernehmen(d, [{ fachId: 'biologie', name: 'Zelle', schluessel: [materialSchluessel('arbeitsblatt', hand.id)] }], [], () => 'x')
    expect(nochmal.zuordnungen[materialSchluessel('arbeitsblatt', hand.id)].bereichId).toBe('bereich2')
  })

  it('sortiert in einem Fach mit ausgeschalteter Automatik nichts ein – eingeschaltet ist sie seit Paket 12 von selbst', () => {
    const d = bereichSetzen(leereThemen(), { id: 'bereich1', fachId: 'biologie', name: 'Zelle' })
    expect(einsortieren([mat('Zellkern')], { ...d, automatik: { biologie: false } })).toEqual({})
    expect(Object.values(einsortieren([mat('Zellkern')], d))[0]?.bereichId).toBe('bereich1')
  })
})

describe('Bereiche anlegen und löschen', () => {
  it('weist doppelte Namen im selben Fach ab, erlaubt sie in einem anderen', () => {
    const d = bereichSetzen(leereThemen(), { id: 'bereich1', fachId: 'biologie', name: 'Ökologie' })
    expect(() => bereichSetzen(d, { id: 'bereich2', fachId: 'biologie', name: ' ökologie ' })).toThrow(/gibt es in diesem Fach schon/)
    expect(bereichSetzen(d, { id: 'bereich2', fachId: 'erdkunde', name: 'Ökologie' }).bereiche).toHaveLength(2)
  })

  it('verschiebt beim Löschen die Materialien nach „Ohne Themenbereich"', () => {
    let d = bereichSetzen(leereThemen(), { id: 'bereich1', fachId: 'biologie', name: 'Zelle' })
    d = zuordnen(d, { 'arbeitsblatt:a': { bereichId: 'bereich1', von: 'auto', am: '' } })
    d = bereichLoeschen(d, 'bereich1')
    expect(d.bereiche).toEqual([])
    expect(d.zuordnungen['arbeitsblatt:a'].bereichId).toBeNull()
  })

  it('verwirft beim Einlesen Zuordnungen zu Bereichen, die es nicht gibt', () => {
    const d = pruefeThemen({ bereiche: [], zuordnungen: { 'x:y': { bereichId: 'weg', von: 'hand', am: '' } }, automatik: { a: true, b: 'ja' } })
    expect(d.zuordnungen).toEqual({})
    expect(d.automatik).toEqual({ a: true })
  })

  it('räumt verwaiste Einträge erst nach einem Tag weg („Neu in diesem Bereich" vor dem ersten Sichern)', () => {
    const heute = Date.parse('2026-09-26T12:00:00Z')
    const d = zuordnen(bereichSetzen(leereThemen(), { id: 'bereich1', fachId: 'biologie', name: 'Zelle' }), {
      'arbeitsblatt:frisch': { bereichId: 'bereich1', von: 'hand', am: '2026-09-26T11:00:00Z' },
      'arbeitsblatt:alt': { bereichId: 'bereich1', von: 'hand', am: '2026-09-20T11:00:00Z' }
    })
    expect(verwaisteSchluessel(d, new Set(), heute)).toEqual(['arbeitsblatt:alt'])
  })
})

describe('Reihenfolge im Bereich', () => {
  const a = { moduleId: 'klassenarbeit', id: 'a', name: 'Zelle B', updatedAt: '2026-09-01T00:00:00Z' }
  const b = { moduleId: 'arbeitsblatt', id: 'b', name: 'Zelle a', updatedAt: '2026-09-03T00:00:00Z' }
  const c = { moduleId: 'lernzielkontrolle', id: 'c', name: 'Zelle 10', updatedAt: '2026-09-02T00:00:00Z' }
  const ids = (l: { id: string }[]): string[] => l.map((x) => x.id)

  it('sortiert nach Datum, Titel, Materialart und eigener Reihenfolge', () => {
    expect(ids(sortiere([a, b, c], 'neu'))).toEqual(['b', 'c', 'a'])
    expect(ids(sortiere([a, b, c], 'alt'))).toEqual(['a', 'c', 'b'])
    expect(ids(sortiere([a, b, c], 'titel'))).toEqual(['c', 'b', 'a'])
    expect(ids(sortiere([a, b, c], 'art', [], ['arbeitsblatt', 'lernzielkontrolle', 'klassenarbeit']))).toEqual(['b', 'c', 'a'])
    // Eigene Reihenfolge; nicht Erfasstes dahinter, neueste zuerst
    expect(ids(sortiere([a, b, c], 'eigen', ['klassenarbeit:a']))).toEqual(['a', 'b', 'c'])
  })

  it('setzt Gezogenes vor das Ziel', () => {
    expect(umstellen(['x', 'y', 'z'], ['z'], 'x')).toEqual(['z', 'x', 'y'])
    expect(umstellen(['x', 'y', 'z'], ['x', 'y'], null)).toEqual(['z', 'x', 'y'])
  })
})

describe('Kennfarben der Materialarten', () => {
  it('bleiben auch bei Rot-Grün- und Blau-Gelb-Schwäche unterscheidbar (ΔE₀₀ ≥ 10)', () => {
    const farben = Object.entries(ART_FARBEN)
    expect(farben.map(([k]) => k).sort()).toEqual(['arbeitsblatt', 'grammatiktest', 'klassenarbeit', 'lernzielkontrolle', 'vokabeltest'])
    for (const [sicht, matrix] of [['normal', null], ...Object.entries(FEHLSICHTIGKEIT)] as const)
      for (let i = 0; i < farben.length; i++)
        for (let j = i + 1; j < farben.length; j++) {
          const a = matrix ? simuliere(farben[i][1], matrix) : farben[i][1]
          const b = matrix ? simuliere(farben[j][1], matrix) : farben[j][1]
          expect(farbabstand(a, b), `${sicht}: ${farben[i][0]} ↔ ${farben[j][0]}`).toBeGreaterThanOrEqual(10)
        }
  })

  it('simuliert Fehlsichtigkeit plausibel: Rot und Grün rücken bei Deuteranopie zusammen', () => {
    const vorher = farbabstand('#c92a2a', '#2a7f38')
    const nachher = farbabstand(simuliere('#c92a2a', FEHLSICHTIGKEIT.deuteranopie), simuliere('#2a7f38', FEHLSICHTIGKEIT.deuteranopie))
    expect(nachher).toBeLessThan(vorher / 2)
  })
})
