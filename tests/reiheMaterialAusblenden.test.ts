import { describe, expect, it } from 'vitest'
import { leererInhalt, type Schritt } from '../src/shared/reihe'
import {
  freigabenAus,
  loeschFrage,
  loeschPlan,
  istReiheMaterial,
  materialVerweise,
  nameAusReihe,
  ohneReiheMaterial,
  suchtrefferMitReihen,
  zuordnungAus,
  type ReiheMitMaterial
} from '../src/shared/reiheMaterial'

/**
 * Material aus Unterrichtsreihen in den Bibliotheken (09.10.2026, Befund am Server: viele Blätter „Ursachen, Verlauf
 * und Folgen des Ersten Weltkriegs" aus einer Reihe): zunächst ausgeblendet, Zuordnung aus den Schritten abgeleitet
 * (kein Nachtragen am Dokument), Löschen der Reihe mit oder ohne Material. Seit 10.10.2026 nur Material, das für die
 * Reihe ENTSTANDEN ist – in eine Reihe geholtes eigenes Material bleibt sichtbar.
 */

const schritt = (id: string, teil: Partial<Schritt> = {}): Schritt => ({
  id,
  titel: `Schritt ${id}`,
  lernziele: [],
  rolle: 'pflicht',
  erfolg: { art: 'abgabe' },
  inhalt: leererInhalt('aufgabe'),
  ...teil
})
const blatt = (quelle: string, teil: Partial<Extract<Schritt['inhalt'], { art: 'arbeitsblatt' }>> = { erzeugt: true }): Schritt['inhalt'] => ({
  ...(leererInhalt('arbeitsblatt') as Extract<Schritt['inhalt'], { art: 'arbeitsblatt' }>),
  quelle,
  titel: 'Blatt',
  ...teil
})

describe('Zuordnung aus den Schritten (statt Nachtragen am Dokument)', () => {
  it('nennt Arbeitsblätter, Tests und Onlinefassungen je einmal – auch Altbestand ohne Marke', () => {
    const verweise = materialVerweise({
      schritte: [
        schritt('a', { inhalt: blatt('ws1') }),
        schritt('b', { inhalt: blatt('') }),
        schritt('c', {
          test: { modul: 'lernzielkontrolle', docId: 'lzk1' },
          inhalt: { art: 'onlinetest', test: null, zeitMin: 20, blatt: { art: 'Lernzielkontrolle', fach: 'Geschichte', fassungen: [], quelle: 'lzk1' } }
        }),
        schritt('d', { inhalt: { art: 'onlinetest', test: null, zeitMin: 20, blatt: { art: 'Grammatiktest', fach: 'Englisch', fassungen: [], quelle: 'gt1' } } }),
        schritt('e', { test: { modul: 'klassenarbeit', docId: 'ka1' } }),
        schritt('f', { inhalt: blatt('ws1') }),
        schritt('g')
      ]
    })
    expect(verweise).toEqual([
      { moduleId: 'arbeitsblatt', docId: 'ws1', erzeugt: true },
      { moduleId: 'lernzielkontrolle', docId: 'lzk1', erzeugt: true },
      { moduleId: 'grammatiktest', docId: 'gt1', erzeugt: true },
      { moduleId: 'klassenarbeit', docId: 'ka1', erzeugt: true }
    ])
  })

  it('übersteht unvollständige Reihen (ohne Schritte)', () => {
    expect(materialVerweise({ schritte: undefined as unknown as Schritt[] })).toEqual([])
  })

  it('ordnet jedes Dokument der zuerst genannten Reihe zu', () => {
    const z = zuordnungAus([
      { id: 'r1', titel: 'Erster Weltkrieg', material: [{ moduleId: 'arbeitsblatt', docId: 'ws1', erzeugt: true }] },
      { id: 'r2', titel: 'Julikrise', material: [{ moduleId: 'arbeitsblatt', docId: 'ws1', erzeugt: true }, { moduleId: 'vokabeltest', docId: 'vt1' }] },
      { id: 'r3', titel: 'Ohne Material' }
    ])
    expect(z.get('ws1')).toEqual({ reiheId: 'r1', titel: 'Erster Weltkrieg', erzeugt: true })
    expect(z.get('vt1')).toEqual({ reiheId: 'r2', titel: 'Julikrise' })
    expect(z.size).toBe(2)
  })

  it('nimmt die Reihe, die das Dokument erzeugt hat, wenn eine andere es nur hereingeholt hat', () => {
    const z = zuordnungAus([
      { id: 'r1', titel: 'Wiederholung', material: [{ moduleId: 'arbeitsblatt', docId: 'ws1', erzeugt: false }] },
      { id: 'r2', titel: 'Julikrise', material: [{ moduleId: 'arbeitsblatt', docId: 'ws1', erzeugt: true }] }
    ])
    expect(z.get('ws1')).toEqual({ reiheId: 'r2', titel: 'Julikrise', erzeugt: true })
  })
})

describe('Nur für die Reihe ENTSTANDENES Material ist ausgeblendet (10.10.2026)', () => {
  it('Marke am Schritt: erzeugt, hereingeholt, Tests immer erzeugt', () => {
    const v = materialVerweise({
      schritte: [
        schritt('a', { inhalt: blatt('neu', { erzeugt: true }) }),
        schritt('b', { inhalt: blatt('eigen', { erzeugt: false }) }),
        schritt('c', { test: { modul: 'vokabeltest', docId: 'vt1' } })
      ]
    })
    expect(v).toEqual([
      { moduleId: 'arbeitsblatt', docId: 'neu', erzeugt: true },
      { moduleId: 'arbeitsblatt', docId: 'eigen', erzeugt: false },
      { moduleId: 'vokabeltest', docId: 'vt1', erzeugt: true }
    ])
  })

  it('Altbestand ohne Marke: deutliche Spuren des Erzeugens zählen, sonst unklar', () => {
    const v = materialVerweise({
      schritte: [
        schritt('a', { kiEntwurf: true, inhalt: blatt('ki', { erzeugt: undefined }) }),
        schritt('b', { inhalt: blatt('rolle', { erzeugt: undefined, zweck: 'abschluss' }) }),
        schritt('c', { inhalt: blatt('schrittweise', { erzeugt: undefined, schrittweiseGrund: 'lange Aufgaben' }) }),
        schritt('d', { inhalt: blatt('alt', { erzeugt: undefined }) })
      ]
    })
    expect(v.map((m) => [m.docId, m.erzeugt])).toEqual([
      ['ki', true],
      ['rolle', true],
      ['schrittweise', true],
      ['alt', undefined]
    ])
  })

  it('dasselbe Blatt in zwei Schritten: erzeugt geht vor hereingeholt', () => {
    const v = materialVerweise({ schritte: [schritt('a', { inhalt: blatt('ws', { erzeugt: false }) }), schritt('b', { inhalt: blatt('ws', { erzeugt: true }) })] })
    expect(v).toEqual([{ moduleId: 'arbeitsblatt', docId: 'ws', erzeugt: true }])
  })

  it('unklarer Altbestand: der Name verrät Erzeugtes, sonst bleibt es sichtbar', () => {
    expect(nameAusReihe('Erster Weltkrieg – Julikrise', 'Erster Weltkrieg')).toBe(true)
    expect(nameAusReihe('erster weltkrieg', 'Erster Weltkrieg')).toBe(true)
    expect(nameAusReihe('Erster Weltkrieg im Überblick', 'Erster Weltkrieg')).toBe(false)
    expect(nameAusReihe('Mein Blatt', 'Erster Weltkrieg')).toBe(false)
    expect(nameAusReihe('', 'Erster Weltkrieg')).toBe(false)
    const verweis = { reiheId: 'r1', titel: 'Erster Weltkrieg' }
    expect(istReiheMaterial(verweis, 'Erster Weltkrieg – Julikrise')).toBe(true)
    expect(istReiheMaterial(verweis, 'Quellenarbeit Julikrise')).toBe(false)
    expect(istReiheMaterial(verweis)).toBe(false)
    // Marke geht vor Name
    expect(istReiheMaterial({ ...verweis, erzeugt: false }, 'Erster Weltkrieg – Julikrise')).toBe(false)
    expect(istReiheMaterial({ ...verweis, erzeugt: true }, 'Mein Blatt')).toBe(true)
    expect(istReiheMaterial(undefined, 'Erster Weltkrieg')).toBe(false)
  })

  it('Bibliothek: eigenes, in die Reihe geholtes Blatt bleibt sichtbar (mit Marke), Erzeugtes nicht', () => {
    const z = zuordnungAus([
      {
        id: 'r1',
        titel: 'Erster Weltkrieg',
        material: [
          { moduleId: 'arbeitsblatt', docId: 'neu', erzeugt: true },
          { moduleId: 'arbeitsblatt', docId: 'eigen', erzeugt: false },
          { moduleId: 'arbeitsblatt', docId: 'altNeu' },
          { moduleId: 'arbeitsblatt', docId: 'altEigen' }
        ]
      }
    ])
    const liste = [
      { id: 'neu', name: 'Erster Weltkrieg – Ursachen' },
      { id: 'eigen', name: 'Quellenarbeit' },
      { id: 'altNeu', name: 'Erster Weltkrieg – Folgen' },
      { id: 'altEigen', name: 'Karikaturen 1914' }
    ]
    const r = ohneReiheMaterial(liste, (e) => e.id, z, { einblenden: false, name: (e) => e.name })
    expect(r.sichtbar.map((e) => e.id)).toEqual(['eigen', 'altEigen'])
    expect(r.ausReihen).toBe(2)
    // Die Marke bleibt für alle verknüpften
    expect(z.has('eigen')).toBe(true)
    // Suche: hereingeholtes eigenes Material ist ein gewöhnlicher Treffer
    expect(suchtrefferMitReihen([liste[0], liste[1]], (e) => e.id, z, false, (e) => e.name)).toEqual({ liste: [liste[1]], nurReihe: false })
  })

  it('Reihe und Material löschen: hereingeholtes Material bleibt stehen', () => {
    const reihen: ReiheMitMaterial[] = [
      {
        id: 'r1',
        titel: 'Erster Weltkrieg',
        material: [
          { moduleId: 'arbeitsblatt', docId: 'neu', erzeugt: true },
          { moduleId: 'arbeitsblatt', docId: 'eigen', erzeugt: false },
          { moduleId: 'arbeitsblatt', docId: 'altNeu' },
          { moduleId: 'arbeitsblatt', docId: 'altEigen' }
        ]
      }
    ]
    const namen: Record<string, string> = { altNeu: 'Erster Weltkrieg – Folgen', altEigen: 'Karikaturen 1914' }
    expect(loeschPlan('r1', reihen, (id) => namen[id]).loeschen.map((m) => m.docId)).toEqual(['neu', 'altNeu'])
    // Ohne Namen zählt nur die Marke
    expect(loeschPlan('r1', reihen).loeschen.map((m) => m.docId)).toEqual(['neu'])
    expect(loeschFrage('r1', reihen, [], (id) => namen[id]).anzahl).toBe(2)
  })
})

describe('Bibliothek: Material aus Reihen zunächst ausgeblendet', () => {
  const z = zuordnungAus([{ id: 'r1', titel: 'Erster Weltkrieg', material: [{ moduleId: 'arbeitsblatt', docId: 'b', erzeugt: true }, { moduleId: 'arbeitsblatt', docId: 'c', erzeugt: true }] }])
  const liste = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const id = (e: { id: string }): string => e.id

  it('blendet aus und zählt, was zu Reihen gehört', () => {
    const r = ohneReiheMaterial(liste, id, z, { einblenden: false })
    expect(r.sichtbar.map(id)).toEqual(['a'])
    expect(r.ausReihen).toBe(2)
  })

  it('zeigt alles, wenn eingeblendet', () => {
    expect(ohneReiheMaterial(liste, id, z, { einblenden: true }).sichtbar.map(id)).toEqual(['a', 'b', 'c'])
  })

  it('lässt das gerade offene Dokument stehen (aus der Reihe geöffnet)', () => {
    expect(ohneReiheMaterial(liste, id, z, { einblenden: false, offen: 'c' }).sichtbar.map(id)).toEqual(['a', 'c'])
  })

  it('ändert ohne Reihen nichts (Exe ohne Server)', () => {
    const r = ohneReiheMaterial(liste, id, new Map(), { einblenden: false })
    expect(r.sichtbar).toBe(liste)
    expect(r.ausReihen).toBe(0)
  })
})

describe('Suche: nur Treffer aus Reihen erscheinen doch – mit Hinweis', () => {
  const z = zuordnungAus([{ id: 'r1', titel: 'Erster Weltkrieg', material: [{ moduleId: 'arbeitsblatt', docId: 'b', erzeugt: true }] }])
  const id = (e: { id: string }): string => e.id

  it('blendet Reihen-Material aus, solange es andere Treffer gibt', () => {
    expect(suchtrefferMitReihen([{ id: 'a' }, { id: 'b' }], id, z, false)).toEqual({ liste: [{ id: 'a' }], nurReihe: false })
  })

  it('zeigt Reihen-Material, wenn die Suche nur solches findet', () => {
    expect(suchtrefferMitReihen([{ id: 'b' }], id, z, false)).toEqual({ liste: [{ id: 'b' }], nurReihe: true })
  })

  it('kein Hinweis ohne Treffer oder wenn eingeblendet', () => {
    expect(suchtrefferMitReihen([], id, z, false)).toEqual({ liste: [], nurReihe: false })
    expect(suchtrefferMitReihen([{ id: 'a' }, { id: 'b' }], id, z, true)).toEqual({ liste: [{ id: 'a' }, { id: 'b' }], nurReihe: false })
  })
})

describe('Reihe löschen: mit oder ohne Material', () => {
  const reihen: ReiheMitMaterial[] = [
    {
      id: 'r1',
      titel: 'Erster Weltkrieg',
      material: [
        { moduleId: 'arbeitsblatt', docId: 'ws1', erzeugt: true },
        { moduleId: 'arbeitsblatt', docId: 'ws2', erzeugt: true },
        { moduleId: 'lernzielkontrolle', docId: 'lzk1', erzeugt: true }
      ]
    },
    { id: 'r2', titel: 'Julikrise', material: [{ moduleId: 'arbeitsblatt', docId: 'ws2', erzeugt: true }] },
    { id: 'r3', titel: 'Leer', material: [] }
  ]

  it('löscht nur Material, das keine andere Reihe nutzt', () => {
    const plan = loeschPlan('r1', reihen)
    expect(plan.loeschen.map((m) => m.docId)).toEqual(['ws1', 'lzk1'])
    expect(plan.bleibt.map((m) => m.docId)).toEqual(['ws2'])
  })

  it('bietet drei Wege mit Material, sonst die schlichte Rückfrage', () => {
    expect(loeschFrage('r1', reihen)).toEqual({ anzahl: 2, bleibt: 1, freigegeben: 0, wahl: ['mit-material', 'nur-reihe', 'abbrechen'] })
    expect(loeschFrage('r3', reihen).wahl).toEqual(['nur-reihe', 'abbrechen'])
    // Nur geteiltes Material: nichts zu löschen außer der Reihe
    expect(loeschFrage('r2', reihen)).toEqual({ anzahl: 0, bleibt: 1, freigegeben: 0, wahl: ['nur-reihe', 'abbrechen'] })
  })

  it('nennt Freigaben an Lernende aus dem zu löschenden Material', () => {
    const freigaben = [{ einstellungen: { quelle: { docId: 'ws1' } } }, { einstellungen: { quelle: { docId: 'ws1' } } }, { einstellungen: { quelle: null } }, {}]
    expect(loeschFrage('r1', reihen, freigaben).freigegeben).toBe(2)
    expect(freigabenAus([{ moduleId: 'arbeitsblatt', docId: 'ws2' }], freigaben)).toBe(0)
  })

  it('nach „Nur die Reihe löschen" ist das Material gewöhnliches Material', () => {
    const rest = reihen.filter((r) => r.id !== 'r1')
    const z = zuordnungAus(rest)
    expect(z.has('ws1')).toBe(false)
    expect(z.has('lzk1')).toBe(false)
    // ws2 gehört weiter zur anderen Reihe
    expect(z.get('ws2')?.titel).toBe('Julikrise')
  })
})
