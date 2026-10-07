import { describe, expect, it } from 'vitest'
import type { Reihe } from '../src/shared/reihe'
import type { Schulbuch } from '../src/renderer/src/shared/schulbuch/schulbuch'
import {
  buchPlanAnfrage,
  buchPlanUebernehmen,
  dauerAuswerten,
  dauerFaustwert,
  fuegeSeitenZusammen,
  phasenBudget,
  schritteMitUebernahme,
  schulformVorgaben,
  schuljahrVon,
  stundenAusUmfang,
  stundenImRaster,
  stundenRaster,
  verteile,
  vervielfaeltigteSeiten,
  zaehlerStand,
  type BuchErkennung
} from '../src/renderer/src/modules/unterrichtsreihe/reiheAusSchulbuch'

/* Reihe aus Schulbuchseiten (06.10.2026): Umfang, Stundenbudget, Prompt-Bau, Übernahme je Abschnitt, Seitenzähler – ohne KI */
const reihe = (mehr: Partial<Reihe> = {}): Reihe => ({
  id: 'r',
  titel: 'Unit 2',
  fachId: 'englisch',
  fachLabel: 'Englisch',
  stateId: 'NI',
  schoolTypeId: 'gymnasium',
  grade: 7,
  oberthema: 'London',
  lernziele: [],
  schritte: [],
  ...mehr
})

const seite = (seite: string, abschnitte: { kennung: string; art: string; text: string; bereich?: boolean }[]): Schulbuch => ({
  titel: 'Green Line 3',
  verlag: 'Klett',
  seiten: seite,
  abschnitte: abschnitte.map((a) => ({
    kennung: a.kennung,
    art: a.art,
    titel: '',
    seite,
    text: a.text,
    wahl: 'verweis',
    ...(a.bereich ? { bereich: { x: 10, y: 20, b: 50, h: 30 }, bild: 0 } : {})
  }))
})

const buch = (): BuchErkennung =>
  fuegeSeitenZusammen(
    [
      seite('38', [
        { kennung: 'Text', art: 'Verfassertext', text: 'A day in London …', bereich: true },
        { kennung: 'Nr. 1', art: 'Aufgaben', text: 'Find the sights.' }
      ]),
      null,
      seite('39', [{ kennung: 'Nr. 4', art: 'Aufgaben', text: 'Write a postcard.' }])
    ],
    ['data:image/png;a', 'data:image/png;b', 'data:image/png;c']
  )

describe('Reihe aus Schulbuch – Umfang und Budget', () => {
  it('rechnet Wochen × Wochenstunden × 0,85 und baut das Raster', () => {
    expect(stundenAusUmfang({ art: 'wochen', wochen: 6, wochenstunden: 4 })).toBe(20)
    expect(stundenAusUmfang({ art: 'wochen', wochen: 5, wochenstunden: 3 })).toBe(13)
    expect(stundenAusUmfang({ art: 'stunden', stunden: 0 })).toBe(1)
    expect(stundenRaster(13, 'doppel')).toEqual([...Array(6).fill('doppel'), 'einzel'])
    expect(stundenImRaster(stundenRaster(13, 'doppel'))).toBe(13)
    expect(stundenRaster(3, 'einzel')).toEqual(['einzel', 'einzel', 'einzel'])
  })
  it('verteilt das Budget ganzzahlig und genau; Reserve nur mit Klassenarbeit; mehr Übung an der Hauptschule', () => {
    expect(verteile(10, [1, 1, 1])).toEqual([4, 3, 3])
    const gym = phasenBudget(20, schulformVorgaben('NI', 'gymnasium'), true)
    expect(gym.reserve).toBe(3)
    expect(gym.reserve + gym.phasen.reduce((n, p) => n + p.stunden, 0)).toBe(20)
    const ohne = phasenBudget(20, schulformVorgaben('NI', 'gymnasium'), false)
    expect(ohne.reserve).toBe(0)
    const hs = phasenBudget(40, schulformVorgaben('NI', 'hauptschule'), false)
    const gy = phasenBudget(40, schulformVorgaben('NI', 'gymnasium'), false)
    const ueben = (b: typeof hs): number => b.phasen.find((p) => p.id === 'ueben')!.stunden
    expect(ueben(hs)).toBeGreaterThan(ueben(gy))
    expect(schulformVorgaben('NI', 'hauptschule').afb[0]).toBeGreaterThan(schulformVorgaben('NI', 'gymnasium').afb[0])
  })
  it('Dauer: Faustwert je Fach, KI-Antwort als geordnete Spanne mit Rückfall', () => {
    expect(dauerFaustwert('englisch')).toMatchObject({ min: 22, max: 38 })
    expect(dauerFaustwert('mathematik')).toMatchObject({ min: 12, max: 20 })
    const f = dauerFaustwert('geschichte')
    expect(dauerAuswerten({ min: 18, max: 12, begruendung: 'x' }, f)).toEqual({ min: 12, max: 18, begruendung: 'x' })
    expect(dauerAuswerten({ min: 0, max: 0 }, f)).toBe(f)
  })
})

describe('Reihe aus Schulbuch – Seiten, Prompt, Plan', () => {
  it('führt die Erkennung je Seite zusammen (Seiten ohne Schulbuch fallen weg, Seitenbild bleibt zugeordnet)', () => {
    const b = buch()
    expect(b.titel).toBe('Green Line 3')
    expect(b.abschnitte.map((a) => [a.kennung, a.seitenIndex])).toEqual([
      ['Text', 0],
      ['Nr. 1', 0],
      ['Nr. 4', 2]
    ])
    expect(b.abschnitte.every((a) => a.wahl === 'verweis')).toBe(true)
  })
  it('baut den Prompt mit Budget, Schulform, Kürzungsregeln, optionalen Schritten und Urheberrecht', () => {
    const r = reihe({ stunden: ['doppel', 'einzel'] })
    const v = schulformVorgaben('NI', 'gymnasium')
    const req = buchPlanAnfrage({
      reihe: r,
      kc: { auszug: ['Hörverstehen'], quelle: 'KC' },
      buch: buch(),
      stunden: r.stunden!,
      budget: phasenBudget(3, v, false),
      vorgaben: v,
      kuerzung: 'standard',
      mitKlassenarbeit: false
    })
    expect(req.system).toContain('Klasse 7')
    expect(req.user).toContain('[2] S. 39 Nr. 4')
    expect(req.user).toContain('STUNDENBUDGET (3 Unterrichtsstunden)')
    expect(req.user).toContain('80 min netto')
    expect(req.user).toContain('I 40 % / II 40 % / III 20 %')
    expect(req.user).toMatch(/fakultative, Spiel- und Projektteile → Doppelungen/)
    expect(req.user).toContain('"rolle": "optional"')
    expect(req.user).toContain('Buch S. 39, Nr. 4')
    expect(req.user).toMatch(/Tests und Diagnosen formulierst du immer neu/)
    expect(req.user).toContain('Noch keine Lernziele')
    expect(JSON.stringify(req.schema)).toContain('gestrichen')
  })
  it('übersetzt den Plan: Rollen, Stunden, Lernziele, Bezüge und Begründungen geprüft', () => {
    const b = buch()
    const plan = buchPlanUebernehmen(
      {
        lernziele: [{ text: 'Sehenswürdigkeiten beschreiben', ichKann: 'Ich kann …' }],
        teile: [
          {
            name: 'Einstieg',
            schritte: [
              {
                titel: 'Lesen',
                art: 'aufgabe',
                rolle: 'pflicht',
                phase: 'erarbeitung',
                afb: 'I',
                stunde: 1,
                minuten: 15,
                beschreibung: 'Lies den Text auf S. 38.',
                buch: [0, 99],
                lernziele: [0],
                begruendung: 'Input'
              },
              {
                titel: 'Extra',
                art: 'quatsch',
                rolle: 'optional',
                phase: 'ueben',
                afb: 'II',
                stunde: 9,
                minuten: 200,
                beschreibung: '',
                buch: [2],
                lernziele: [5],
                begruendung: 'Differenzierung'
              }
            ]
          }
        ],
        gestrichen: [
          { abschnitt: 1, begruendung: 'Doppelung' },
          { abschnitt: 1, begruendung: 'doppelt' },
          { abschnitt: 7, begruendung: 'gibt es nicht' }
        ],
        hinweis: 'Plenum'
      },
      reihe(),
      b,
      ['doppel', 'einzel']
    )
    expect(plan.lernziele).toHaveLength(1)
    const [a, x] = plan.schritte
    expect(a.lernziele[0].text).toBe('Sehenswürdigkeiten beschreiben')
    expect(plan.bezuege[a.id]).toEqual([0])
    expect(a.platzhalter?.begruendung).toBe('AFB I · Input')
    expect(x.rolle).toBe('optional')
    expect(x.inhalt.art).toBe('aufgabe')
    expect(x.stunde).toBe(1)
    expect(x.minuten).toBe(90)
    expect(plan.gestrichen).toEqual([{ abschnitt: 1, begruendung: 'Doppelung' }])
  })
  it('Übernahme: Standard Verweis; Abschrift und Bildausschnitt nur je Abschnitt – mit Quelle', () => {
    const b = buch()
    const plan = buchPlanUebernehmen(
      {
        lernziele: [],
        teile: [
          {
            name: 'T',
            schritte: [
              {
                titel: 'A',
                art: 'aufgabe',
                rolle: 'pflicht',
                phase: 'erarbeitung',
                afb: 'I',
                stunde: 1,
                minuten: 10,
                beschreibung: 'Arbeite mit dem Text.',
                buch: [0, 2],
                lernziele: [],
                begruendung: ''
              }
            ]
          }
        ],
        gestrichen: [],
        hinweis: ''
      },
      reihe(),
      b,
      ['einzel']
    )
    const nurVerweis = schritteMitUebernahme(plan, b, {}, {}, 'Englisch')[0]
    expect(nurVerweis.platzhalter?.uebernahme).toBeUndefined()
    expect(nurVerweis.platzhalter?.buch).toContain('NUR VERWEISEN')
    expect(nurVerweis.platzhalter?.buch).not.toContain('WÖRTLICH')
    expect(nurVerweis.platzhalter?.beschreibung).toContain('Buch S. 38, Text')
    const mit = schritteMitUebernahme(plan, b, { 0: 'text', 2: 'bild' }, { 2: 'data:image/jpeg;x' }, 'Englisch')[0]
    expect(mit.platzhalter?.uebernahme).toEqual([
      { kennung: 'Text', quelle: 'Green Line 3, Klett, S. 38, Text', text: 'A day in London …' },
      { kennung: 'Nr. 4', quelle: 'Green Line 3, Klett, S. 39, Nr. 4', bild: 'data:image/jpeg;x' }
    ])
    expect(mit.platzhalter?.buch).toContain('WÖRTLICH ALS MATERIAL ÜBERNEHMEN')
    expect(mit.platzhalter?.buch).toContain('BILDAUSSCHNITTE')
  })
  it('Seitenzähler: nur Abschriften/Ausschnitte zählen, je Seite einmal, Warnung ab 20', () => {
    const b = buch()
    expect(vervielfaeltigteSeiten(b, { 0: 'verweis', 2: 'verweis' })).toEqual([])
    expect(vervielfaeltigteSeiten(b, { 0: 'text', 1: 'bild', 2: 'text' })).toEqual(['38', '39'])
    const bisher = Array.from({ length: 18 }, (_, i) => String(i + 1))
    expect(zaehlerStand(bisher, ['38']).warnung).toBe(false)
    expect(zaehlerStand(bisher, ['38', '39'])).toMatchObject({ anzahl: 20, warnung: true, ueber: false })
    expect(zaehlerStand(bisher, ['38', '39', '40']).ueber).toBe(true)
    expect(zaehlerStand(['5'], ['5']).anzahl).toBe(1)
    expect(schuljahrVon(new Date(2026, 9, 6))).toBe('2026/27')
    expect(schuljahrVon(new Date(2027, 2, 1))).toBe('2026/27')
    expect(schuljahrVon(new Date(2027, 7, 1))).toBe('2027/28')
  })
})
