import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { mitSprachfach, PROGRAMM_FAECHER, PROGRAMM_REIHENFOLGE, programmPasst, programmSichtbar, sichtbareProgramme, SPRACH_FAECHER, startKarten } from '../src/renderer/src/shared/programmSichtbarkeit'

/*
 * Paket 12 (Wunsch der Lehrkraft, 26.09.2026): eigene Fächer blenden unpassende Programme aus;
 * einzeln wieder einblendbar; überall dieselbe Reihenfolge der Programme.
 */
const PROGRAMME = PROGRAMM_REIHENFOLGE.map((id) => ({ id, faecher: PROGRAMM_FAECHER[id] }))
const ids = (l: { id: string }[]): string[] => l.map((p) => p.id)

describe('Reihenfolge der Programme', () => {
  it('Arbeitsblätter, Vokabeltest, Grammatiktest, Lernzielkontrollen, Klassenarbeiten, Rückmeldung, Tafelbilder, Elternbriefe, Vokabellisten', () => {
    expect(PROGRAMM_REIHENFOLGE).toEqual([
      'arbeitsblatt',
      'vokabeltest',
      'grammatiktest',
      'lernzielkontrolle',
      'klassenarbeit',
      'rueckmeldung',
      'tafelbild',
      'elternbrief',
      'vokabelliste'
    ])
  })

  it('die Leiste (registry.ts) folgt derselben Reihenfolge', () => {
    const quelle = readFileSync('src/renderer/src/modules/registry.ts', 'utf8')
    const liste = quelle.slice(quelle.indexOf('export const modules'))
    // Die Verwaltung (03.10.2026 für alle) gehört zu keinem Fach – sie steht für alle in der Leiste
    const reihenfolge = [...liste.matchAll(/^ {4}id: '(\w+)'/gm)].map((m) => m[1]).filter((id) => id !== 'verwaltung')
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
      'tafelbild',
      'elternbrief'
    ])
  })

  it('Mathematik allein: mit Klassenarbeit (seit 29.09.2026 alle Fächer), ohne Vokabel- und Grammatikprogramme', () => {
    expect(ids(sichtbareProgramme(PROGRAMME, ['mathematik'], {}))).toEqual([
      'arbeitsblatt',
      'lernzielkontrolle',
      'klassenarbeit',
      'rueckmeldung',
      'tafelbild',
      'elternbrief'
    ])
  })

  it('Latein und DaZ zählen zu den Sprachfächern; Latein seit 29.09.2026, DaZ seit 30.09.2026 auch mit Klassenarbeiten', () => {
    expect(ids(sichtbareProgramme(PROGRAMME, ['daz'], {}))).toEqual(PROGRAMM_REIHENFOLGE)
    expect(ids(sichtbareProgramme(PROGRAMME, ['latein'], {}))).toEqual(PROGRAMM_REIHENFOLGE)
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

/*
 * Fachrelevanz (10.10.2026, Entscheidung der Lehrkraft): EINE Regel für Leiste, Telefon, iPad und Startseite; Onlinetest
 * für alle Fächer; Admins sehen alles; ohne Fächer alle Apps außer den Admin-Apps.
 */
describe('Fachrelevanz 10.10.2026', () => {
  // Wie registry.ts am Server: die Programme der Leiste plus die Server-Apps
  const SERVER = [
    ...PROGRAMME,
    { id: 'onlinetest', faecher: 'alle' as const },
    { id: 'laufendereihen', faecher: 'alle' as const },
    { id: 'freigaben', faecher: 'alle' as const },
    { id: 'sprachenlernen', faecher: SPRACH_FAECHER },
    { id: 'unterrichtsreihe', faecher: 'alle' as const },
    { id: 'meineklassen', faecher: 'alle' as const }
  ]

  it('Onlinetest ist für alle Fächer – auch für eine Geschichtslehrkraft (registry.ts)', () => {
    const quelle = readFileSync('src/renderer/src/modules/registry.ts', 'utf8')
    const block = quelle.slice(quelle.indexOf("id: 'onlinetest'"), quelle.indexOf("id: 'laufendereihen'"))
    expect(block).toContain("faecher: 'alle'")
    expect(block).not.toContain('SPRACH_FAECHER')
    expect(block).not.toMatch(/description: 'Vokabeltests am iPad/)
    expect(ids(sichtbareProgramme(SERVER, ['geschichte'], {}))).toContain('onlinetest')
    // Vokabel-Apps bleiben bei Sprachen
    expect(ids(sichtbareProgramme(SERVER, ['geschichte'], {}))).not.toContain('sprachenlernen')
    expect(ids(sichtbareProgramme(SERVER, ['geschichte'], {}))).not.toContain('vokabeltest')
  })

  it('Admins sehen alles – auch mit eigenen Fächern; die eigene Wahl unter „Programme anzeigen" gilt weiter', () => {
    expect(ids(sichtbareProgramme(SERVER, ['geschichte', 'mathematik'], {}, { admin: true }))).toEqual(ids(SERVER))
    expect(ids(sichtbareProgramme(SERVER, ['geschichte'], { tafelbild: false }, { admin: true }))).not.toContain('tafelbild')
    expect(programmSichtbar('vokabeltest', PROGRAMM_FAECHER.vokabeltest, ['mathematik'], {}, { admin: true })).toBe(true)
  })

  it('ohne Fächer: alle Apps', () => {
    expect(ids(sichtbareProgramme(SERVER, [], {}))).toEqual(ids(SERVER))
    expect(mitSprachfach([])).toBe(true)
    expect(mitSprachfach(['geschichte'])).toBe(false)
    expect(mitSprachfach(['latein'])).toBe(true)
  })

  it('Startseite „Auf einen Blick": Karte nur bei sichtbarer App; ohne Sprachfach heißt die letzte Karte „Termine"', () => {
    const geschichte = ids(sichtbareProgramme(SERVER, ['geschichte'], {}))
    expect(startKarten(geschichte)).toEqual({ reihen: true, tests: true, freigaben: true, termine: 'termine' })
    expect(startKarten(ids(sichtbareProgramme(SERVER, ['englisch'], {}))).termine).toBe('voll')
    expect(startKarten(['arbeitsblatt'])).toEqual({ reihen: false, tests: false, freigaben: false, termine: null })
    expect(startKarten(['rueckmeldung']).freigaben).toBe(true)
  })
})
