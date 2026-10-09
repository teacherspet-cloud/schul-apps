import { describe, expect, it } from 'vitest'
import { leererInhalt, type Schritt } from '../src/shared/reihe'
import {
  freigabenAus,
  loeschFrage,
  loeschPlan,
  materialVerweise,
  ohneReiheMaterial,
  suchtrefferMitReihen,
  zuordnungAus,
  type ReiheMitMaterial
} from '../src/shared/reiheMaterial'

/**
 * Material aus Unterrichtsreihen in den Bibliotheken (09.10.2026, Befund am Server: viele Blätter „Ursachen, Verlauf
 * und Folgen des Ersten Weltkriegs" aus einer Reihe): zunächst ausgeblendet, Zuordnung aus den Schritten abgeleitet
 * (kein Nachtragen am Dokument), Löschen der Reihe mit oder ohne Material.
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
const blatt = (quelle: string): Schritt['inhalt'] => ({
  ...(leererInhalt('arbeitsblatt') as Extract<Schritt['inhalt'], { art: 'arbeitsblatt' }>),
  quelle,
  titel: 'Blatt'
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
      { moduleId: 'arbeitsblatt', docId: 'ws1' },
      { moduleId: 'lernzielkontrolle', docId: 'lzk1' },
      { moduleId: 'grammatiktest', docId: 'gt1' },
      { moduleId: 'klassenarbeit', docId: 'ka1' }
    ])
  })

  it('übersteht unvollständige Reihen (ohne Schritte)', () => {
    expect(materialVerweise({ schritte: undefined as unknown as Schritt[] })).toEqual([])
  })

  it('ordnet jedes Dokument der zuerst genannten Reihe zu', () => {
    const z = zuordnungAus([
      { id: 'r1', titel: 'Erster Weltkrieg', material: [{ moduleId: 'arbeitsblatt', docId: 'ws1' }] },
      { id: 'r2', titel: 'Julikrise', material: [{ moduleId: 'arbeitsblatt', docId: 'ws1' }, { moduleId: 'vokabeltest', docId: 'vt1' }] },
      { id: 'r3', titel: 'Ohne Material' }
    ])
    expect(z.get('ws1')).toEqual({ reiheId: 'r1', titel: 'Erster Weltkrieg' })
    expect(z.get('vt1')).toEqual({ reiheId: 'r2', titel: 'Julikrise' })
    expect(z.size).toBe(2)
  })
})

describe('Bibliothek: Material aus Reihen zunächst ausgeblendet', () => {
  const z = zuordnungAus([{ id: 'r1', titel: 'Erster Weltkrieg', material: [{ moduleId: 'arbeitsblatt', docId: 'b' }, { moduleId: 'arbeitsblatt', docId: 'c' }] }])
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
  const z = zuordnungAus([{ id: 'r1', titel: 'Erster Weltkrieg', material: [{ moduleId: 'arbeitsblatt', docId: 'b' }] }])
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
        { moduleId: 'arbeitsblatt', docId: 'ws1' },
        { moduleId: 'arbeitsblatt', docId: 'ws2' },
        { moduleId: 'lernzielkontrolle', docId: 'lzk1' }
      ]
    },
    { id: 'r2', titel: 'Julikrise', material: [{ moduleId: 'arbeitsblatt', docId: 'ws2' }] },
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
