import { describe, expect, it } from 'vitest'
import {
  MIN_GEMEINSAM,
  schwelleKinder,
  vorwissenAus,
  vorwissenFuerGruppe,
  vorwissenText,
  type KindKurz,
  type KursDaten
} from '../src/shared/vorwissenLerngruppe'
import { teileVorwissen, vorwissenRegeln } from '../src/renderer/src/modules/arbeitsblatt/didactics/vorwissen/vorwissen'
import { vorwissenZeilen } from '../src/renderer/src/modules/unterrichtsreihe/grundlage'

/*
 * Vorwissen der Lerngruppe (13.10.2026, abgestimmt mit der Lehrkraft): eigener Kurs und fremde Kurse mit mindestens drei
 * gemeinsamen Lernenden, Schwächen nur als Anteile, keine Herkunft, keine Noten; Text fürs Feld und Regeln für die KI.
 */

const kind = (id: string, p: Partial<KindKurz> = {}): KindKurz => ({ id, vokSicher: null, wackelig: [], grammatik: [], blattSchwierig: [], bedarf: [], ...p })
const kurs = (p: Partial<KursDaten> = {}): KursDaten => ({ themen: [], lernziele: [], grammatik: [], testSchwerpunkte: [], kinder: [], ...p })

describe('vorwissenAus', () => {
  const eigen = kurs({
    themen: ['Reihe „Daily routines"', 'Grammatik: Simple present'],
    lehrwerk: 'Green Line 2, bis Unit 2',
    lernziele: [
      { text: 'Tagesablauf beschreiben', erreicht: 0.9 },
      { text: 'Fragen mit do/does bilden', erreicht: 0.3 }
    ],
    grammatik: [{ thema: 'Simple present', sicher: 0.8, fehler: ['Simple present: „he go" statt „he goes"'] }],
    testSchwerpunkte: ['Zeitform (Test „Unit 1")'],
    kinder: [
      kind('a', { vokSicher: 0.9, grammatik: [{ titel: 'Simple past', ampel: 'schwaeche' }], wackelig: ['often – oft'] }),
      kind('b', { vokSicher: 0.3, grammatik: [{ titel: 'Simple past', ampel: 'schwaeche' }], wackelig: ['often – oft'], bedarf: ['schwach'] }),
      kind('c', { vokSicher: 0.95, grammatik: [{ titel: 'Simple past', ampel: 'sicher' }] }),
      kind('d', { vokSicher: 0.92, grammatik: [{ titel: 'Simple past', ampel: 'sicher' }] })
    ]
  })

  it('fasst den eigenen Kurs zusammen: behandelt, sicher, unsicher mit Anteilen, häufige Fehler', () => {
    const v = vorwissenAus(eigen, [])
    expect(v.hier.behandelt).toEqual(['Lehrwerk Green Line 2, bis Unit 2', 'Reihe „Daily routines"', 'Grammatik: Simple present'])
    expect(v.hier.sicher).toContain('Simple present')
    expect(v.hier.sicher).toContain('Tagesablauf beschreiben')
    expect(v.hier.unsicher).toContain('Simple past (2 von 4)')
    expect(v.hier.unsicher).toContain('Fragen mit do/does bilden (erst 30 % erreicht)')
    expect(v.hier.unsicher.some((u) => u.startsWith('Wörter often – oft (2 von 4)'))).toBe(true)
    expect(v.hier.fehler).toEqual(['Simple present: „he go" statt „he goes"', 'Zeitform (Test „Unit 1")'])
    expect(v.spanne).toMatch(/1 von 4 brauchen mehr Unterstützung/)
    expect(v.andereKurse).toBe(0)
  })

  it('nimmt fremde Kurse erst ab drei gemeinsamen Lernenden – und nennt ihre Herkunft nicht', () => {
    const zuWenig = kurs({ themen: ['Reihe „Geheim"'], kinder: [kind('a'), kind('b')] })
    expect(vorwissenAus(eigen, [zuWenig]).andere.behandelt).toEqual([])
    const genug = kurs({
      themen: ['Reihe „Industrial Revolution"'],
      kinder: ['a', 'b', 'c'].map((id) => kind(id, { grammatik: [{ titel: 'Passiv', ampel: 'schwaeche' }] }))
    })
    const v = vorwissenAus(eigen, [genug])
    expect(MIN_GEMEINSAM).toBe(3)
    expect(v.andereKurse).toBe(1)
    expect(v.andere.behandelt).toEqual(['Reihe „Industrial Revolution"'])
    expect(v.andere.unsicher).toEqual(['Passiv (3 von 3)'])
    const text = vorwissenText(v)
    expect(text).toMatch(/^Aus diesem Kurs:\n/)
    expect(text).toMatch(/\n\nAus anderen Kursen:\nBehandelt: Reihe „Industrial Revolution"\nUnsicher: Passiv \(3 von 3\)/)
    expect(text).toMatch(/\n\nLeistungsspanne: /)
  })

  it('wiederholt unter „andere" nichts, was der eigene Kurs schon sagt', () => {
    const gleich = kurs({ themen: ['Grammatik: Simple present', 'Reihe „Neu"'], kinder: ['a', 'b', 'c'].map((id) => kind(id)) })
    expect(vorwissenAus(eigen, [gleich]).andere.behandelt).toEqual(['Reihe „Neu"'])
  })

  it('Schwelle für eine Schwäche der Gruppe: mindestens 2 bzw. 15 %', () => {
    expect(schwelleKinder(4)).toBe(2)
    expect(schwelleKinder(24)).toBe(4)
  })

  it('leerer Kurs ergibt leeren Text', () => {
    expect(vorwissenText(vorwissenAus(kurs(), []))).toBe('')
  })
})

describe('Vorwissen im Prompt', () => {
  const text = [
    'Aus diesem Kurs:',
    'Behandelt: Simple present',
    'Sicher: Tagesablauf beschreiben',
    'Unsicher: Simple past (6 von 24)',
    'Häufiger Fehler: „he go" statt „he goes"',
    '',
    'Leistungsspanne: etwa 6 von 24 brauchen mehr Unterstützung'
  ].join('\n')

  it('teilt Zeilen nach Art; Überschriften fallen weg', () => {
    expect(teileVorwissen(text)).toEqual({
      vorwissen: ['Simple present', 'Tagesablauf beschreiben (sicher)'],
      fehlvorstellungen: [],
      nochNicht: [],
      unsicher: ['Simple past (6 von 24)'],
      fehler: ['„he go" statt „he goes"'],
      spanne: ['etwa 6 von 24 brauchen mehr Unterstützung']
    })
  })

  it('Arbeitsblatt: Unsicheres festigen, Fehlern vorbeugen, differenzieren', () => {
    const r = vorwissenRegeln(text)
    expect(r).toMatch(/UNSICHER IN DER LERNGRUPPE/)
    expect(r).toMatch(/HÄUFIGE FEHLER DER LERNGRUPPE/)
    expect(r).toMatch(/Differenziere danach/)
    expect(r).not.toMatch(/Aus diesem Kurs/)
  })

  it('Reihe: Planung bekommt Förder- und Forderschritte nach der Leistungsspanne', () => {
    const z = vorwissenZeilen(text, true).join('\n')
    expect(z).toMatch(/VORWISSEN DER LERNGRUPPE/)
    expect(z).toMatch(/Förderschritt an passender Stelle/)
    expect(z).toMatch(/Forderschritte \("forder"\)/)
    expect(vorwissenZeilen('')).toEqual([])
  })

  it('Förderblatt setzt „sicher" nicht voraus, Forderblatt übt „unsicher" nicht; die Spanne fällt weg', () => {
    const f = vorwissenFuerGruppe(text, 'foerder')
    expect(f).not.toMatch(/Sicher:|Leistungsspanne/)
    expect(f).toMatch(/Unsicher: Simple past/)
    const g = vorwissenFuerGruppe(text, 'forder')
    expect(g).not.toMatch(/Unsicher:|Leistungsspanne/)
    expect(g).toMatch(/Sicher: Tagesablauf/)
    expect(vorwissenFuerGruppe('Aus diesem Kurs:\nLeistungsspanne: x', 'foerder')).toBe('')
  })
})
