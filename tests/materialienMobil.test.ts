import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { bereichSetzen, leereThemen, materialSchluessel, type ThemenDaten } from '../src/shared/themen'
import {
  doppelteEinheiten,
  einheitSchluessel,
  einheitZuText,
  materialSuche,
  ohneReiheErzeugtes,
  pfadText,
  typChips,
  typVon,
  untertitel
} from '../src/shared/materialienMobil'
import { zuordnungAus } from '../src/shared/reiheMaterial'
import { automatischEinsortieren, bereichZumUeberthema, type ThemenMaterial } from '../src/renderer/src/shared/themenVorschlag'

/*
 * „Materialien" am Telefon (10.10.2026, Option 1): doppelte Themen aus Lehrwerk und frei getipptem Überthema, Art-Chips,
 * Suche über Thema und Unit, und die Regel für Material aus Unterrichtsreihen (nur Erzeugtes bleibt ausgeblendet).
 */

/** Wie die Analyse: „Green Line 2" › „Unit 1: The new boy" aus dem Lehrwerk, daneben „Green Line 2 Unit 1" frei getippt */
function analyseDaten(): ThemenDaten {
  let d = leereThemen()
  d = bereichSetzen(d, { id: 'band-gl2', fachId: 'englisch', name: 'Green Line 2', herkunft: 'lehrwerk' })
  d = bereichSetzen(d, { id: 'unit-gl2-1', fachId: 'englisch', name: 'Unit 1: The new boy', elternId: 'band-gl2', herkunft: 'lehrwerk' })
  d = bereichSetzen(d, { id: 'unit-gl2-2', fachId: 'englisch', name: 'Unit 2: London: here we come', elternId: 'band-gl2', herkunft: 'lehrwerk' })
  d = bereichSetzen(d, { id: 'frei-gl2-1', fachId: 'englisch', name: 'Green Line 2 Unit 1' })
  d = bereichSetzen(d, { id: 'frei-gl4-1', fachId: 'englisch', name: 'Green Line 4 Unit 1' })
  d = bereichSetzen(d, { id: 'weltkrieg', fachId: 'geschichte', name: 'Der Erste Weltkrieg' })
  return d
}

describe('Einheiten eines Lehrwerks erkennen', () => {
  it('Band und Unit aus verschiedenen Schreibweisen', () => {
    expect(einheitSchluessel('Green Line 2 › Unit 1: The new boy')).toBe('green line 2|unit 1')
    expect(einheitSchluessel('Green Line 2 Unit 1')).toBe('green line 2|unit 1')
    expect(einheitSchluessel('Green Line 2 – Unit 3 Wortliste')).toBe('green line 2|unit 3')
    expect(einheitSchluessel('Découvertes 1 Unité 4')).toBe('découvertes 1|unit 4')
    expect(einheitSchluessel('Green Line 2 Unit 12')).toBe('green line 2|unit 12')
  })
  it('kein Lehrwerk: null', () => {
    expect(einheitSchluessel('Der Erste Weltkrieg')).toBeNull()
    expect(einheitSchluessel('Unit 1')).toBeNull()
    expect(einheitSchluessel('Kl 7 Unit 2')).toBeNull()
    expect(einheitSchluessel('')).toBeNull()
  })
})

describe('Doppelte Themen zusammenführen', () => {
  it('der frei getippte Ordner gehört zur Lehrwerks-Unit – ein Band ohne Unit bleibt für sich', () => {
    const d = analyseDaten()
    const doppelt = doppelteEinheiten(d.bereiche)
    expect(doppelt.get('frei-gl2-1')).toBe('unit-gl2-1')
    // „Green Line 4" hat (noch) keine Lehrwerks-Unit: kein Ziel, der Ordner bleibt stehen
    expect(doppelt.has('frei-gl4-1')).toBe(false)
    // Die Unit selbst und Bereiche ohne Lehrwerk sind keine Doppel
    expect(doppelt.has('unit-gl2-1')).toBe(false)
    expect(doppelt.has('weltkrieg')).toBe(false)
    expect(pfadText(d.bereiche, d.bereiche.find((b) => b.id === 'unit-gl2-1')!)).toBe('Green Line 2 › Unit 1: The new boy')
  })

  it('nur im selben Fach', () => {
    let d = analyseDaten()
    d = bereichSetzen(d, { id: 'frei-anders', fachId: 'franzoesisch', name: 'Green Line 2 Unit 1' })
    expect(doppelteEinheiten(d.bereiche).has('frei-anders')).toBe(false)
  })

  it('Vokabelliste über ihre Quelle in der Unit', () => {
    const d = analyseDaten()
    expect(einheitZuText(d.bereiche, 'englisch', 'Green Line 2 – Unit 2')?.id).toBe('unit-gl2-2')
    expect(einheitZuText(d.bereiche, 'englisch', 'Irregular verbs')).toBeNull()
  })

  it('die Automatik sortiert ein Überthema „Green Line 2 Unit 1" in die Lehrwerks-Unit – nicht in den Doppel-Ordner', () => {
    const d = analyseDaten()
    const mat: ThemenMaterial = {
      moduleId: 'arbeitsblatt',
      id: 'ab1',
      name: 'My town – places and directions',
      thema: 'Places in town',
      fachId: 'englisch',
      grade: 6,
      updatedAt: '2026-10-10T08:00:00.000Z',
      ueberthema: 'Green Line 2 Unit 1'
    }
    expect(bereichZumUeberthema(mat, d.bereiche)?.id).toBe('unit-gl2-1')
    expect(automatischEinsortieren([mat], d, () => []).zuordnungen[materialSchluessel('arbeitsblatt', 'ab1')]).toMatchObject({ bereichId: 'unit-gl2-1' })
    // Ohne Lehrwerks-Unit bleibt es beim Namen
    expect(bereichZumUeberthema({ ...mat, ueberthema: 'Green Line 4 Unit 1' }, d.bereiche)?.id).toBe('frei-gl4-1')
  })

  it('auch über Wortähnlichkeit (ohne Überthema) kommt nichts Neues mehr in den Doppel-Ordner', () => {
    const d = analyseDaten()
    const vt: ThemenMaterial = { moduleId: 'vokabeltest', id: 'vt1', name: 'Green Line 2 – Unit 1', thema: '', fachId: 'englisch', grade: 6, updatedAt: '2026' }
    expect(automatischEinsortieren([vt], d, () => []).zuordnungen[materialSchluessel('vokabeltest', 'vt1')]?.bereichId).toBe('unit-gl2-1')
  })

  it('entsteht die Unit im selben Durchgang, kommt das Überthema mit hinein (kein zweiter Ordner)', () => {
    const vt: ThemenMaterial = { moduleId: 'vokabeltest', id: 'vt1', name: 'Green Line 2 – Unit 1', thema: 'Unit 1', fachId: 'englisch', grade: 6, updatedAt: '2026' }
    const ab: ThemenMaterial = { ...vt, moduleId: 'arbeitsblatt', id: 'ab1', name: 'My town', thema: 'Places', ueberthema: 'Green Line 2 Unit 1' }
    const katalog = [{ name: 'Unit 1: The new boy', quelle: 'lehrwerk' as const, pfad: ['Green Line 2'], zusatz: 'Green Line 2 unit 1' }]
    const r = automatischEinsortieren([vt, ab], leereThemen(), () => katalog)
    const namen = r.uebernahmen.map((u) => u.name)
    expect(namen).not.toContain('Green Line 2 Unit 1')
    const unit = r.uebernahmen.find((u) => u.name === 'Unit 1: The new boy')
    expect(unit?.schluessel).toContain(materialSchluessel('arbeitsblatt', 'ab1'))
  })
})

describe('Art-Chips', () => {
  it('Tests umfassen LZK, Grammatiktest, Klassenarbeit und Vokabeltest', () => {
    for (const id of ['lernzielkontrolle', 'grammatiktest', 'klassenarbeit', 'vokabeltest']) expect(typVon(id)).toBe('tests')
    expect(typVon('arbeitsblatt')).toBe('blaetter')
    expect(typVon('tafelbild')).toBe('tafel')
    expect(typVon('vokabelliste')).toBe('vokabellisten')
  })
  it('nur vorhandene Arten, „Alle" mit Gesamtzahl; bei nur einer Art keine Chips', () => {
    expect(typChips(['arbeitsblatt', 'lernzielkontrolle', 'klassenarbeit', 'arbeitsblatt'])).toEqual([
      { typ: 'alle', name: 'Alle', n: 4 },
      { typ: 'blaetter', name: 'Blätter', n: 2 },
      { typ: 'tests', name: 'Tests', n: 2 }
    ])
    expect(typChips(['arbeitsblatt', 'arbeitsblatt'])).toEqual([])
    expect(typChips([])).toEqual([])
  })
  it('Untertitel ohne Fach', () => {
    expect(untertitel('Arbeitsblatt', 9)).toBe('Arbeitsblatt · Kl. 9')
    expect(untertitel('Tafelbild')).toBe('Tafelbild')
  })
})

describe('Suche über Titel, Thema, Unit und Fach', () => {
  const liste = [
    { id: '1', name: 'My town', suchtext: 'my town englisch · klasse 6 · places in town' },
    { id: '2', name: 'Die Julikrise 1914', suchtext: 'die julikrise 1914 geschichte · klasse 9' }
  ]
  const pfad: Record<string, string> = { '1': 'Green Line 2 › Unit 1: The new boy Englisch', '2': 'Der Erste Weltkrieg Geschichte' }
  it('findet über den Pfad des Themas (Unit) und alle Wörter', () => {
    expect(materialSuche(liste, 'unit 1', (m) => pfad[m.id]).map((m) => m.id)).toEqual(['1'])
    expect(materialSuche(liste, 'weltkrieg julikrise', (m) => pfad[m.id]).map((m) => m.id)).toEqual(['2'])
    expect(materialSuche(liste, 'geschichte', (m) => pfad[m.id]).map((m) => m.id)).toEqual(['2'])
    expect(materialSuche(liste, '  ', (m) => pfad[m.id])).toEqual([])
  })
})

describe('Material aus Unterrichtsreihen (Regel vom 10.10.2026)', () => {
  const reihen = [
    {
      id: 'r1',
      titel: 'Der Erste Weltkrieg',
      material: [
        { moduleId: 'arbeitsblatt', docId: 'erzeugt', erzeugt: true },
        { moduleId: 'arbeitsblatt', docId: 'eigenes', erzeugt: false },
        { moduleId: 'arbeitsblatt', docId: 'alt' }
      ]
    }
  ]
  const liste = [
    { id: 'erzeugt', name: 'Der Erste Weltkrieg – Einstieg' },
    { id: 'eigenes', name: 'Die Julikrise 1914' },
    { id: 'alt', name: 'Der Erste Weltkrieg – Kriegsende' },
    { id: 'frei', name: 'Weimarer Verfassung' }
  ]
  it('nur Erzeugtes ist ausgeblendet – in die Reihe geholte eigene Blätter bleiben sichtbar', () => {
    const z = zuordnungAus(reihen)
    expect(ohneReiheErzeugtes(liste, z, false).map((m) => m.id)).toEqual(['eigenes', 'frei'])
    expect(ohneReiheErzeugtes(liste, z, true)).toHaveLength(4)
  })
  it('die Themenbereiche am PC folgen derselben Regel (nicht mehr jede Verknüpfung)', () => {
    const quelle = readFileSync('src/renderer/src/shared/components/Themenbereiche.tsx', 'utf8')
    expect(quelle).not.toContain('!reiheZuordnung.has(m.id)')
    expect(quelle).toContain('istReiheMaterial(reiheZuordnung.get(m.id), m.name)')
  })
})
