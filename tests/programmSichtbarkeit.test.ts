import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { PROGRAMM_FAECHER, PROGRAMM_REIHENFOLGE, programmPasst, programmSichtbar, sichtbareProgramme } from '../src/renderer/src/shared/programmSichtbarkeit'

/*
 * Paket 12 (Wunsch der Lehrkraft, 26.09.2026): eigene Fächer blenden unpassende Programme aus;
 * einzeln wieder einblendbar; überall dieselbe Reihenfolge der Programme.
 */
const PROGRAMME = PROGRAMM_REIHENFOLGE.map((id) => ({ id, faecher: PROGRAMM_FAECHER[id] }))
const ids = (l: { id: string }[]): string[] => l.map((p) => p.id)

describe('Reihenfolge der Programme', () => {
  it('Arbeitsblätter, Vokabeltest, Grammatiktest, Lernzielkontrollen, Klassenarbeiten, Vokabellisten', () => {
    expect(PROGRAMM_REIHENFOLGE).toEqual([
      'arbeitsblatt',
      'vokabeltest',
      'grammatiktest',
      'lernzielkontrolle',
      'klassenarbeit',
      'vokabelliste',
      'rueckmeldung',
      'elternbrief'
    ])
  })

  it('die Leiste (registry.ts) folgt derselben Reihenfolge', () => {
    const quelle = readFileSync('src/renderer/src/modules/registry.ts', 'utf8')
    const liste = quelle.slice(quelle.indexOf('export const modules'))
    const reihenfolge = [...liste.matchAll(/^ {4}id: '(\w+)'/gm)].map((m) => m[1])
    expect(reihenfolge).toEqual(PROGRAMM_REIHENFOLGE)
    // Jedes Programm trägt seine Fächer aus der zentralen Zuordnung
    for (const id of reihenfolge) expect(liste).toContain(`faecher: PROGRAMM_FAECHER.${id}`)
  })
})

describe('Programme nach eigenen Fächern', () => {
  it('ohne gewählte Fächer ist alles sichtbar', () => {
    expect(ids(sichtbareProgramme(PROGRAMME, [], {}))).toEqual(PROGRAMM_REIHENFOLGE)
    expect(ids(sichtbareProgramme(PROGRAMME, undefined, undefined))).toEqual(PROGRAMM_REIHENFOLGE)
  })

  it('Geschichte und Mathematik: keine Vokabel- und Grammatikprogramme, Klassenarbeit bleibt (Geschichte)', () => {
    expect(ids(sichtbareProgramme(PROGRAMME, ['geschichte', 'mathematik'], {}))).toEqual([
      'arbeitsblatt',
      'lernzielkontrolle',
      'klassenarbeit',
      'rueckmeldung',
      'elternbrief'
    ])
  })

  it('Mathematik allein: auch die Klassenarbeit fällt weg (Mathematik gehört nicht zu den Fächern der Klassenarbeit)', () => {
    expect(ids(sichtbareProgramme(PROGRAMME, ['mathematik'], {}))).toEqual(['arbeitsblatt', 'lernzielkontrolle', 'rueckmeldung', 'elternbrief'])
  })

  it('Latein und DaZ zählen zu den Sprachfächern', () => {
    for (const fach of ['latein', 'daz'])
      expect(ids(sichtbareProgramme(PROGRAMME, [fach], {}))).toEqual([
        'arbeitsblatt',
        'vokabeltest',
        'grammatiktest',
        'lernzielkontrolle',
        'vokabelliste',
        'rueckmeldung',
        'elternbrief'
      ])
  })

  it('Englisch, Französisch und Spanisch: alles sichtbar (Klassenarbeit seit Phase G auch in Französisch und Spanisch)', () => {
    for (const fach of ['englisch', 'franzoesisch', 'spanisch']) expect(ids(sichtbareProgramme(PROGRAMME, [fach], {}))).toEqual(PROGRAMM_REIHENFOLGE)
  })

  it('die eigene Wahl geht der Regel vor – in beide Richtungen; null nimmt sie zurück', () => {
    expect(programmSichtbar('vokabeltest', PROGRAMM_FAECHER.vokabeltest, ['mathematik'], { vokabeltest: true })).toBe(true)
    expect(programmSichtbar('arbeitsblatt', PROGRAMM_FAECHER.arbeitsblatt, ['mathematik'], { arbeitsblatt: false })).toBe(false)
    expect(programmSichtbar('vokabeltest', PROGRAMM_FAECHER.vokabeltest, ['mathematik'], { vokabeltest: null })).toBe(false)
  })

  it('„alle" passt zu jedem Fach', () => {
    expect(programmPasst('alle', ['sport'])).toBe(true)
  })
})
