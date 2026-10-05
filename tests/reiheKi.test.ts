import { describe, expect, it } from 'vitest'
import { emptyAnswer, newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { Sheet, TaskBlock, TextBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { materialNummern } from '../src/renderer/src/modules/arbeitsblatt/didactics/integrity'
import {
  aufgabenVerweise,
  automatischAus,
  auswahlEintraege,
  auswahlWarnungen,
  blattMitAuswahl,
  pflichtMinuten,
  teilSchluessel
} from '../src/renderer/src/modules/unterrichtsreihe/auswahl'
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

describe('Aufgabennummern in gekürzten Materialien (05.10.2026)', () => {
  const hilfe = (id: string, title: string, items: string[]) => ({ ...(newBlock('scaffold') as object), id, title, items }) as never
  const blattMitHilfen = (): Sheet => ({
    id: 's',
    label: '',
    stars: 1,
    blocks: [
      aufgabe('t1', 'Lies M1.', 5),
      aufgabe('t2', 'Fasse zusammen.', 5),
      aufgabe('t3', 'Vergleiche deine Ergebnisse aus Aufgabe 1 und Aufgabe 2.', 5, ['Nenne Unterschiede.', 'Bewerte.', 'Nutze dein Ergebnis aus c).']),
      aufgabe('t4', 'Beurteile mithilfe von Task 3 und tasks 1–3.', 5),
      hilfe('h2', 'Optional help cards for task 2', ['Tipp zu Aufgabe 2']),
      hilfe('h4', 'Help cards for task 4', ['Tipp zu Aufgabe 4, nicht zu M2 oder Seite 4'])
    ]
  })
  it('Verweise folgen der neuen Zählung, auch in Listen und anderen Sprachen; Material und Seiten bleiben', () => {
    const neu = blattMitAuswahl(blattMitHilfen(), { t2: 'aus' })
    const t3 = neu.blocks.find((b) => b.id === 't3') as TaskBlock
    const t4 = neu.blocks.find((b) => b.id === 't4') as TaskBlock
    // Aufgabe 2 fällt weg: alte 3 → 2, alte 4 → 3; der Verweis auf die ausgeblendete 2 wird gekennzeichnet
    expect(t3.instruction).toBe('Vergleiche deine Ergebnisse aus Aufgabe 1 und Aufgabe 2 (entfällt).')
    expect(auswahlWarnungen(blattMitHilfen(), { t2: 'aus' }).join(' ')).toContain('Aufgabe 3 verweist auf die ausgeblendete Aufgabe 2')
    expect(t4.instruction).toBe('Beurteile mithilfe von Task 2 und tasks 1–2.')
    const h4 = neu.blocks.find((b) => b.id === 'h4') as unknown as { title: string; items: string[] }
    expect(h4.title).toBe('Help cards for task 3')
    expect(h4.items[0]).toBe('Tipp zu Aufgabe 3, nicht zu M2 oder Seite 4')
  })
  it('Bausteine nur zu ausgeblendeten Aufgaben fallen mit weg – mit Hinweis', () => {
    const neu = blattMitAuswahl(blattMitHilfen(), { t2: 'aus' })
    expect(neu.blocks.some((b) => b.id === 'h2')).toBe(false)
    expect(automatischAus(blattMitHilfen(), { t2: 'aus' })).toEqual(['h2'])
    expect(auswahlWarnungen(blattMitHilfen(), { t2: 'aus' }).join(' ')).toContain('mit ausgeblendet')
  })
  it('Teilaufgaben rücken nach – Verweise innerhalb der Aufgabe und „Aufgabe 3c" von außen', () => {
    const b = blattMitHilfen()
    ;(b.blocks[3] as TaskBlock).instruction = 'Greife Aufgabe 3c auf.'
    const neu = blattMitAuswahl(b, { [teilSchluessel('t3', 't3p1')]: 'aus' })
    const t3 = neu.blocks.find((x) => x.id === 't3') as TaskBlock
    expect(t3.parts.map((p) => p.instruction)).toEqual(['Nenne Unterschiede.', 'Nutze dein Ergebnis aus b).'])
    expect((neu.blocks.find((x) => x.id === 't4') as TaskBlock).instruction).toBe('Greife Aufgabe 3b auf.')
  })
  it('Erkennung der Verweise', () => {
    expect(aufgabenVerweise('Aufgaben 2, 3 und 5; exercice 4; ejercicio 1 – nicht M3 oder S. 39')).toEqual([2, 3, 5, 4, 1])
  })
})
