import { describe, expect, it } from 'vitest'
import { emptyAnswer, newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { Sheet, TaskBlock, TextBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { materialNummern } from '../src/renderer/src/modules/arbeitsblatt/didactics/integrity'
import { auswahlEintraege, auswahlWarnungen, blattMitAuswahl, pflichtMinuten, teilSchluessel } from '../src/renderer/src/modules/unterrichtsreihe/auswahl'
import { planUebernehmen } from '../src/renderer/src/modules/unterrichtsreihe/reihePlanungKi'
import { sichtbarBis, vollstaendigBearbeitet } from '../src/shared/blattFreigabe'

/* Unterrichtsreihe: KI-Planung und Auswahl je Schritt (05.10.2026) */
const text = (id: string, title: string): TextBlock => ({ ...(newBlock('text') as TextBlock), id, title, body: 'Inhalt' })
const aufgabe = (id: string, instruction: string, minutes: number, parts: string[] = []): TaskBlock => ({
  ...(newBlock('task') as TaskBlock),
  id,
  instruction,
  minutes,
  parts: parts.map((p, i) => ({ id: `${id}p${i}`, instruction: p, answer: emptyAnswer('lines'), solution: '' }))
})
const blatt = (): Sheet => ({
  id: 's',
  label: '',
  stars: 1,
  blocks: [
    text('m1', 'Quelle A'),
    text('m2', 'Quelle B'),
    aufgabe('t1', 'Beschreibe M1.', 10),
    aufgabe('t2', 'Erkläre M2.', 15, ['Teil eins', 'Teil zwei']),
    aufgabe('t3', 'Beurteile.', 20)
  ]
})

describe('Auswahl je Reihen-Schritt', () => {
  it('Ausgeblendetes fehlt, Materialnummern bleiben wie im Original, Aufgaben werden neu gezählt', () => {
    const neu = blattMitAuswahl(blatt(), { m1: 'aus', t1: 'aus', t3: 'frei', [teilSchluessel('t2', 't2p1')]: 'aus' })
    expect(neu.blocks.map((b) => b.id)).toEqual(['m2', 't2', 't3'])
    expect(materialNummern(neu.blocks).get('m2')).toBe('M2')
    const t2 = neu.blocks.find((b) => b.id === 't2') as TaskBlock
    expect(t2.parts.map((p) => p.id)).toEqual(['t2p0'])
    expect((neu.blocks.find((b) => b.id === 't3') as TaskBlock).freiwillig).toBe(true)
    // Original unverändert
    expect(blatt().blocks).toHaveLength(5)
    expect(auswahlEintraege(blatt()).map((e) => e.kennung)).toEqual(['M1', 'M2', 'Aufgabe 1', 'Aufgabe 2', 'Aufgabe 3'])
  })
  it('Warnung bei ausgeblendetem Material, auf das eine sichtbare Aufgabe verweist; Zeit nur der Pflichtaufgaben', () => {
    expect(auswahlWarnungen(blatt(), { m2: 'aus' }).join(' ')).toContain('M2')
    expect(auswahlWarnungen(blatt(), { t1: 'aus', t2: 'frei', t3: 'aus' }).join(' ')).toContain('keine Pflichtaufgabe')
    expect(pflichtMinuten(blatt(), { t3: 'frei' })).toBe(25)
  })
  it('Freiwillige Aufgaben halten das Freischalten nicht auf und zählen nicht für „vollständig"', () => {
    // Aufgaben 1 und 3 Pflicht, 2 freiwillig: Pflicht-Nummern [1, 3]
    expect(sichtbarBis([1, 3], {}, [], true)).toBe(1)
    expect(sichtbarBis([1, 3], { '1': [{ einschaetzung: 'teilweise' }] }, [], true)).toBe(Number.POSITIVE_INFINITY)
    expect(vollstaendigBearbeitet([1, 3], { '1': [{ einschaetzung: 'sicher' }], '3': [{ einschaetzung: 'teilweise' }] }, [])).toBe(true)
  })
})

describe('KI-Plan übernehmen', () => {
  it('Teile, Stunden (begrenzt), Lernziele nach Nummer, Platzhalter mit Beschreibung', () => {
    const plan = planUebernehmen(
      {
        hinweis: 'Plenum nicht vergessen.',
        teile: [
          {
            name: 'Einstieg',
            schritte: [
              {
                titel: 'Was weißt du schon?',
                art: 'diagnose',
                rolle: 'pflicht',
                stunde: 1,
                minuten: 10,
                beschreibung: 'Vorwissen',
                lernziele: [0, 7],
                material: '',
                begruendung: 'Start'
              },
              {
                titel: 'Quellenarbeit',
                art: 'arbeitsblatt',
                rolle: 'pflicht',
                stunde: 9,
                minuten: 30,
                beschreibung: 'Quellen vergleichen',
                lernziele: [1],
                material: 'gibtsnicht',
                begruendung: ''
              }
            ]
          },
          {
            name: 'Einstieg',
            schritte: [{ titel: 'X', art: 'unbekannt', rolle: 'forder', stunde: 2, minuten: 5, beschreibung: '', lernziele: [], material: '', begruendung: '' }]
          }
        ]
      },
      {
        lernziele: [
          { text: 'A', ichKann: 'a' },
          { text: 'B', ichKann: 'b' }
        ],
        stunden: ['einzel', 'doppel']
      },
      []
    )
    expect(plan.teile).toEqual(['Einstieg', 'Einstieg (2)'])
    expect(plan.schritte).toHaveLength(3)
    expect(plan.schritte[0].lernziele.map((l) => l.text)).toEqual(['A'])
    expect(plan.schritte[0].stunde).toBe(0)
    expect(plan.schritte[1].stunde).toBe(1)
    expect(plan.schritte[1].platzhalter?.beschreibung).toBe('Quellen vergleichen')
    expect(plan.schritte[1].minuten).toBe(30)
    expect(plan.schritte[2].inhalt.art).toBe('aufgabe')
    expect(plan.schritte[2].rolle).toBe('forder')
    expect(plan.materialEingesetzt).toBe(0)
    expect(plan.hinweis).toBe('Plenum nicht vergessen.')
  })
})
