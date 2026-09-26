import { describe, expect, it } from 'vitest'
import {
  automatikAn,
  bereichLoeschen,
  bereichSetzen,
  bereichVerschieben,
  kinderVon,
  leereThemen,
  materialSchluessel,
  nachfahrenVon,
  obersterBereich,
  pfadVon,
  pruefeThemen,
  uebernehmen,
  zuordnen,
  type ThemenDaten
} from '../src/shared/themen'
import { pruefeLehrplan, type LehrplanDatei } from '../src/shared/lehrplan'
import { automatischEinsortieren, besterBereich, type ThemenMaterial } from '../src/renderer/src/shared/themenVorschlag'
import { katalogBaum, katalogFuer } from '../src/renderer/src/shared/themenKatalog'

/*
 * Themenbereiche mit Unterbereichen (Paket 12, Wunsch der Lehrkraft vom 26.09.2026) – mit ihrem
 * Beispiel: Geschichte „Der Balkan als Krisenherd Europas" ⊂ „Ursachen des Ersten Weltkriegs"
 * ⊂ „Der Erste Weltkrieg".
 */
let zaehler = 0
const neueId = (): string => `bereich${++zaehler}`

/** Die Hierarchie der Lehrkraft, von Hand angelegt */
function weltkrieg(): ThemenDaten {
  let d = bereichSetzen(leereThemen(), { id: 'welt1', fachId: 'geschichte', name: 'Der Erste Weltkrieg' })
  d = bereichSetzen(d, { id: 'ursachen', fachId: 'geschichte', name: 'Ursachen des Ersten Weltkriegs', elternId: 'welt1' })
  d = bereichSetzen(d, { id: 'balkan', fachId: 'geschichte', name: 'Der Balkan als Krisenherd Europas', elternId: 'ursachen' })
  return d
}

let n = 0
const mat = (name: string, fachId = 'geschichte', grade = 9): ThemenMaterial => ({
  moduleId: 'arbeitsblatt',
  id: `m${++n}`,
  name,
  thema: name,
  fachId,
  grade,
  updatedAt: '2026-09-26T08:00:00Z'
})

/** Eine Lehrplandatei im Format der Recherche (Paket 14) – mit dem Beispiel der Lehrkraft */
const LEHRPLAN: LehrplanDatei = pruefeLehrplan(
  {
    stateId: 'NI',
    stand: '2026-09-26',
    eintraege: [
      {
        fach: 'geschichte',
        schulformen: ['gymnasium'],
        jahrgaenge: [9, 10],
        thema: 'Der Erste Weltkrieg',
        unterthemen: [
          {
            thema: 'Ursachen des Ersten Weltkriegs',
            unterthemen: [{ thema: 'Der Balkan als Krisenherd Europas', herkunft: 'wortlaut' }]
          },
          { thema: 'Kriegsalltag an der Front', herkunft: 'zusammengefasst' },
          { thema: 'Verdun', beispiel: true }
        ],
        stichwoerter: ['Julikrise', 'Bündnissysteme']
      },
      { fach: 'geschichte', schulformen: ['realschule'], jahrgaenge: [9], thema: 'Nur Realschule' },
      { fach: '', thema: 'kaputt' }
    ]
  },
  'NI'
)!

describe('Datenmodell mit Unterbereichen', () => {
  it('Pfad, Kinder, Nachfahren und der oberste Bereich (= Überthema)', () => {
    const d = weltkrieg()
    expect(pfadVon(d, 'balkan').map((b) => b.name)).toEqual(['Der Erste Weltkrieg', 'Ursachen des Ersten Weltkriegs', 'Der Balkan als Krisenherd Europas'])
    expect(kinderVon(d, 'geschichte', null).map((b) => b.id)).toEqual(['welt1'])
    expect(nachfahrenVon(d, 'welt1').sort()).toEqual(['balkan', 'ursachen'])
    expect(obersterBereich(d, 'balkan')?.name).toBe('Der Erste Weltkrieg')
  })

  it('gleiche Namen unter verschiedenen Oberbereichen sind erlaubt, unter demselben nicht', () => {
    let d = weltkrieg()
    d = bereichSetzen(d, { id: 'welt2', fachId: 'geschichte', name: 'Der Zweite Weltkrieg' })
    d = bereichSetzen(d, { id: 'quel1', fachId: 'geschichte', name: 'Quellen', elternId: 'welt1' })
    expect(() => bereichSetzen(d, { id: 'quel2', fachId: 'geschichte', name: 'Quellen', elternId: 'welt2' })).not.toThrow()
    expect(() => bereichSetzen(d, { id: 'quel3', fachId: 'geschichte', name: 'quellen', elternId: 'welt1' })).toThrow(/gibt es dort schon/)
  })

  it('Umbenennen lässt den Bereich, wo er ist', () => {
    const d = bereichSetzen(weltkrieg(), { id: 'balkan', fachId: 'geschichte', name: 'Pulverfass Balkan' })
    expect(d.bereiche.find((b) => b.id === 'balkan')?.elternId).toBe('ursachen')
  })

  it('Verschieben: unter einen anderen Bereich, nach oben – aber nie in sich selbst', () => {
    let d = weltkrieg()
    d = bereichSetzen(d, { id: 'impe', fachId: 'geschichte', name: 'Imperialismus' })
    d = bereichVerschieben(d, 'balkan', 'impe')
    expect(pfadVon(d, 'balkan').map((b) => b.id)).toEqual(['impe', 'balkan'])
    d = bereichVerschieben(d, 'balkan', null)
    expect(pfadVon(d, 'balkan').map((b) => b.id)).toEqual(['balkan'])
    expect(() => bereichVerschieben(weltkrieg(), 'welt1', 'balkan')).toThrow(/eigenen Unterbereich/)
    expect(() => bereichVerschieben(weltkrieg(), 'welt1', 'welt1')).toThrow(/eigenen Unterbereich/)
  })

  it('Löschen nimmt die Unterbereiche mit; die Materialien rücken in den Oberbereich', () => {
    let d = weltkrieg()
    d = zuordnen(d, {
      'arbeitsblatt:a': { bereichId: 'balkan', von: 'hand', am: '' },
      'arbeitsblatt:b': { bereichId: 'ursachen', von: 'auto', am: '' }
    })
    d = bereichLoeschen(d, 'ursachen')
    expect(d.bereiche.map((b) => b.id)).toEqual(['welt1'])
    expect(d.zuordnungen['arbeitsblatt:a'].bereichId).toBe('welt1')
    expect(d.zuordnungen['arbeitsblatt:b'].bereichId).toBe('welt1')
    // Ganz oben gelöscht: nach „Ohne Themenbereich"
    expect(bereichLoeschen(d, 'welt1').zuordnungen['arbeitsblatt:a'].bereichId).toBeNull()
  })

  it('Migration: Dateien der Version 1 bleiben lesbar; kaputte Verweise und Kreise rücken nach oben', () => {
    const alt = pruefeThemen({
      version: 1,
      bereiche: [
        { id: 'a', fachId: 'biologie', name: 'Zelle', reihenfolge: 0, angelegt: '' },
        { id: 'b', fachId: 'biologie', name: 'Genetik', reihenfolge: 1, angelegt: '', elternId: 'fehlt' },
        { id: 'c', fachId: 'biologie', name: 'X', reihenfolge: 2, angelegt: '', elternId: 'd' },
        { id: 'd', fachId: 'biologie', name: 'Y', reihenfolge: 3, angelegt: '', elternId: 'c' },
        { id: 'e', fachId: 'chemie', name: 'Z', reihenfolge: 0, angelegt: '', elternId: 'a' }
      ],
      zuordnungen: { 'arbeitsblatt:x': { bereichId: 'a', von: 'hand', am: '' } },
      automatik: { biologie: true, chemie: false }
    })
    expect(alt.version).toBe(2)
    expect(alt.bereiche.every((b) => !b.elternId)).toBe(true)
    expect(alt.zuordnungen['arbeitsblatt:x'].bereichId).toBe('a')
    // Automatik: seit Paket 12 überall an, ausdrücklich ausgeschaltet bleibt aus
    expect(automatikAn(alt, 'biologie')).toBe(true)
    expect(automatikAn(alt, 'erdkunde')).toBe(true)
    expect(automatikAn(alt, 'chemie')).toBe(false)
  })

  it('Übernehmen mit Pfad legt fehlende Oberbereiche an und nutzt vorhandene', () => {
    let d = bereichSetzen(leereThemen(), { id: 'welt1', fachId: 'geschichte', name: 'Der Erste Weltkrieg' })
    d = uebernehmen(
      d,
      [
        {
          fachId: 'geschichte',
          name: 'Der Balkan als Krisenherd Europas',
          pfad: ['Der Erste Weltkrieg', 'Ursachen des Ersten Weltkriegs'],
          herkunft: 'lehrplan',
          schluessel: ['arbeitsblatt:x']
        }
      ],
      [],
      neueId
    )
    const balkan = d.bereiche.find((b) => b.name === 'Der Balkan als Krisenherd Europas')!
    expect(pfadVon(d, balkan.id).map((b) => b.name)).toEqual(['Der Erste Weltkrieg', 'Ursachen des Ersten Weltkriegs', 'Der Balkan als Krisenherd Europas'])
    expect(pfadVon(d, balkan.id)[0].id).toBe('welt1')
    expect(balkan.herkunft).toBe('lehrplan')
    expect(d.bereiche.find((b) => b.id === 'welt1')?.herkunft).toBeUndefined()
    expect(d.zuordnungen['arbeitsblatt:x']).toMatchObject({ bereichId: balkan.id, von: 'auto' })
  })
})

describe('Katalog als Baum – aus der Lehrplandatei, sonst aus den vorhandenen Daten', () => {
  it('liest Ober- und Unterthemen; „z. B."-Beispiele werden keine Bereiche; Schulform zählt', () => {
    const baum = katalogBaum('geschichte', LEHRPLAN, 'gymnasium')
    const wk = baum.find((k) => k.name === 'Der Erste Weltkrieg')!
    expect(wk.kinder.map((k) => k.name)).toEqual(['Ursachen des Ersten Weltkriegs', 'Kriegsalltag an der Front'])
    expect(wk.kinder[0].kinder[0].name).toBe('Der Balkan als Krisenherd Europas')
    expect(wk.zusatz).toContain('Verdun')
    expect(baum.some((k) => k.name === 'Nur Realschule')).toBe(false)
    const flach = katalogFuer('geschichte', LEHRPLAN, 'gymnasium').find((k) => k.name === 'Der Balkan als Krisenherd Europas')
    expect(flach?.pfad).toEqual(['Der Erste Weltkrieg', 'Ursachen des Ersten Weltkriegs'])
  })

  it('ohne Lehrplandatei: Rückfall auf die mitgebrachten Themen, Lehrwerk als Band › Unit', () => {
    expect(katalogBaum('geschichte', null).length).toBeGreaterThan(0)
    const englisch = katalogBaum('englisch', null)
    const band = englisch.find((k) => k.quelle === 'lehrwerk')
    expect(band?.kinder.length).toBeGreaterThan(0)
    expect(katalogFuer('englisch', null).find((k) => k.quelle === 'lehrwerk' && k.pfad)?.pfad?.[0]).toBe(band?.name)
  })

  it('eine beschädigte Datei gilt als nicht vorhanden', () => {
    expect(pruefeLehrplan({ eintraege: 'nein' }, 'NI')).toBeNull()
    expect(pruefeLehrplan(null, 'NI')).toBeNull()
  })
})

describe('Automatik: einsortieren in die Hierarchie', () => {
  const katalog = (fachId: string) => katalogFuer(fachId, LEHRPLAN, 'gymnasium')

  it('ein Material zum Balkan landet mit ganzem Pfad aus dem Lehrplan', () => {
    const m = mat('Der Balkan als Krisenherd Europas')
    const r = automatischEinsortieren([m], leereThemen(), katalog)
    expect(r.uebernahmen).toEqual([
      {
        fachId: 'geschichte',
        name: 'Der Balkan als Krisenherd Europas',
        pfad: ['Der Erste Weltkrieg', 'Ursachen des Ersten Weltkriegs'],
        herkunft: 'lehrplan',
        schluessel: [materialSchluessel('arbeitsblatt', m.id)]
      }
    ])
  })

  it('ein fast gleich benannter vorhandener Bereich wird genommen statt eines zweiten', () => {
    const d = bereichSetzen(leereThemen(), { id: 'eigen', fachId: 'geschichte', name: 'Erster Weltkrieg' })
    const r = automatischEinsortieren([mat('Kriegsalltag an der Front')], d, katalog)
    expect(r.uebernahmen[0]?.pfad).toEqual(['Erster Weltkrieg'])
  })

  it('passt es zu einem vorhandenen (Unter-)Bereich, kommt es dorthin – der tiefere gewinnt', () => {
    const d = weltkrieg()
    const m = mat('Ursachen des Ersten Weltkriegs – Bündnisse')
    const r = automatischEinsortieren([m], d, katalog)
    expect(r.zuordnungen[materialSchluessel('arbeitsblatt', m.id)]).toMatchObject({ bereichId: 'ursachen', von: 'auto' })
    expect(besterBereich(m, d.bereiche, new Map())?.id).toBe('ursachen')
  })

  it('ein genau gleiches Wort schlägt einen gemeinsamen Wortanfang – „Die Zelle" gehört nach „Zelle", nicht in „Zellorganellen"', () => {
    let d = bereichSetzen(leereThemen(), { id: 'zelle1', fachId: 'biologie', name: 'Zelle' })
    d = bereichSetzen(d, { id: 'organ1', fachId: 'biologie', name: 'Zellorganellen', elternId: 'zelle1' })
    const mitglieder = new Map([['organ1', [['zellorganell', 'ueberblick']]]])
    expect(besterBereich(mat('Die Zelle', 'biologie', 7), d.bereiche, mitglieder)?.id).toBe('zelle1')
    // Umgekehrt bleibt der Unterbereich richtig, wenn er genau getroffen wird
    expect(besterBereich(mat('Zellorganellen – Mitochondrien', 'biologie', 7), d.bereiche, mitglieder)?.id).toBe('organ1')
    // Gleichstand zwischen zwei Zweigen bleibt unentschieden
    const zwei = bereichSetzen(bereichSetzen(leereThemen(), { id: 'a1xx', fachId: 'biologie', name: 'Zelle' }), {
      id: 'b1xx',
      fachId: 'biologie',
      name: 'Zellen'
    })
    expect(besterBereich(mat('Die Zelle', 'biologie', 7), zwei.bereiche, new Map())).toBeNull()
  })

  it('von Hand Zugeordnetes bleibt; ausgeschaltete Automatik sortiert nichts; Unbelegtes bleibt ohne Bereich', () => {
    const m = mat('Der Balkan als Krisenherd Europas')
    const hand = zuordnen(weltkrieg(), { [materialSchluessel('arbeitsblatt', m.id)]: { bereichId: 'welt1', von: 'hand', am: '' } })
    expect(automatischEinsortieren([m], hand, katalog)).toEqual({ zuordnungen: {}, uebernahmen: [] })
    expect(automatischEinsortieren([m], { ...leereThemen(), automatik: { geschichte: false } }, katalog).uebernahmen).toEqual([])
    expect(automatischEinsortieren([mat('Mein Wandertag')], leereThemen(), katalog)).toEqual({ zuordnungen: {}, uebernahmen: [] })
  })

  it('der Jahrgang muss passen', () => {
    expect(automatischEinsortieren([mat('Der Balkan als Krisenherd Europas', 'geschichte', 6)], leereThemen(), katalog).uebernahmen).toEqual([])
  })
})

describe('Automatik ohne Ordner für ein einzelnes Blatt', () => {
  it('ein oberstes Thema ohne Oberthemen wird erst ab zwei Materialien ein Bereich', () => {
    const katalog = (fachId: string) => katalogFuer(fachId, LEHRPLAN, 'gymnasium')
    expect(automatischEinsortieren([mat('Kriegsalltag an der Front')], leereThemen(), katalog).uebernahmen).toHaveLength(1)
    const flach = pruefeLehrplan({ eintraege: [{ fach: 'geschichte', thema: 'Die Weimarer Republik', jahrgaenge: [9] }] }, 'NI')
    const k2 = (fachId: string) => katalogFuer(fachId, flach, 'gymnasium')
    expect(automatischEinsortieren([mat('Die Weimarer Republik')], leereThemen(), k2).uebernahmen).toEqual([])
    expect(
      automatischEinsortieren([mat('Die Weimarer Republik'), mat('Weimarer Republik – Krisenjahre')], leereThemen(), k2).uebernahmen[0]?.schluessel
    ).toHaveLength(2)
  })
})
