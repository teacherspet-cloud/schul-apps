import { describe, expect, it } from 'vitest'
import { bereichSetzen, leereThemen, materialSchluessel, uebernehmen, zuordnen, type ThemenDaten, type Zuordnung } from '../src/shared/themen'
import { einsortierBilanz, neuEinsortierenPlan, type KatalogThema, type ThemenMaterial } from '../src/renderer/src/shared/themenVorschlag'

/*
 * „Alle Materialien automatisch einsortieren" (Paket 15): ein ganzes Fach neu ordnen – auf
 * Wunsch auch von Hand Zugeordnetes, das danach als automatisch gilt.
 */
let n = 0
const mat = (name: string, fachId = 'biologie'): ThemenMaterial => ({
  moduleId: 'arbeitsblatt',
  id: `m${++n}`,
  name,
  thema: name,
  fachId,
  grade: 7,
  updatedAt: '2026-09-26T08:00:00Z'
})
const k = (m: ThemenMaterial): string => materialSchluessel(m.moduleId, m.id)
const ohneKatalog = (): KatalogThema[] => []

function bio(): ThemenDaten {
  let d = bereichSetzen(leereThemen(), { id: 'oeko', fachId: 'biologie', name: 'Ökologie' })
  d = bereichSetzen(d, { id: 'zelle', fachId: 'biologie', name: 'Zelle' })
  d = bereichSetzen(d, { id: 'sonst', fachId: 'biologie', name: 'Sonstiges' })
  return d
}

/** Plan anwenden wie die Oberfläche (themenbereiche.tsx): erst Einträge, dann Übernahmen */
function anwenden(d: ThemenDaten, plan: ReturnType<typeof neuEinsortierenPlan>): ThemenDaten {
  let x = zuordnen(d, plan.zuordnungen)
  let i = 0
  if (plan.uebernahmen.length) x = uebernehmen(x, plan.uebernahmen, [], () => `neu${++i}xx`)
  return x
}

describe('Alle Materialien automatisch einsortieren', () => {
  it('Standard: nicht und automatisch Zugeordnetes wird neu einsortiert, von Hand Zugeordnetes bleibt', () => {
    const lose = mat('Ökologie im Wald')
    const falschAuto = mat('Die Zelle unter dem Mikroskop')
    const hand = mat('Exkursion ins Moor')
    const d = zuordnen(bio(), {
      [k(falschAuto)]: { bereichId: 'sonst', von: 'auto', am: '' },
      [k(hand)]: { bereichId: 'sonst', von: 'hand', am: '' }
    })
    const plan = neuEinsortierenPlan([lose, falschAuto, hand], d, 'biologie', ohneKatalog, 'auto')
    expect(plan.betroffen).toEqual([k(lose), k(falschAuto)])
    const nach = anwenden(d, plan)
    expect(nach.zuordnungen[k(lose)]).toMatchObject({ bereichId: 'oeko', von: 'auto' })
    expect(nach.zuordnungen[k(falschAuto)]).toMatchObject({ bereichId: 'zelle', von: 'auto' })
    expect(nach.zuordnungen[k(hand)]).toMatchObject({ bereichId: 'sonst', von: 'hand' })
    expect(einsortierBilanz(d, nach, plan.betroffen)).toEqual({ einsortiert: 1, verschoben: 1 })
  })

  it('„Alle": auch von Hand Zugeordnetes wird neu einsortiert und gilt danach als automatisch', () => {
    const hand = mat('Zellteilung')
    const handOhne = mat('Mein Wandertag')
    const handBleibt = mat('Exkursion')
    const d = zuordnen(bio(), {
      [k(hand)]: { bereichId: 'sonst', von: 'hand', am: '' },
      [k(handOhne)]: { bereichId: null, von: 'hand', am: '' },
      [k(handBleibt)]: { bereichId: 'sonst', von: 'hand', am: '' }
    })
    const plan = neuEinsortierenPlan([hand, handOhne, handBleibt], d, 'biologie', ohneKatalog, 'alle')
    const nach = anwenden(d, plan)
    expect(nach.zuordnungen[k(hand)]).toMatchObject({ bereichId: 'zelle', von: 'auto' })
    // Ohne passenden Bereich: bleibt, wo es war – aber automatisch gekennzeichnet
    expect(nach.zuordnungen[k(handBleibt)]).toMatchObject({ bereichId: 'sonst', von: 'auto' })
    // Ausdrücklich „ohne" von Hand: jetzt einfach noch nicht einsortiert
    expect(nach.zuordnungen[k(handOhne)]).toBeUndefined()
    expect(einsortierBilanz(d, nach, plan.betroffen)).toEqual({ einsortiert: 0, verschoben: 1 })
  })

  it('nichts geht verloren: ohne besseren Platz bleibt automatisch Einsortiertes, wo es ist', () => {
    const m = mat('Exkursion')
    const d = zuordnen(bio(), { [k(m)]: { bereichId: 'sonst', von: 'auto', am: '' } })
    const plan = neuEinsortierenPlan([m], d, 'biologie', ohneKatalog, 'auto')
    expect(plan.zuordnungen).toEqual({})
    expect(anwenden(d, plan).zuordnungen[k(m)]?.bereichId).toBe('sonst')
  })

  it('andere Fächer bleiben unberührt, auch bei ausgeschalteter Automatik wird einsortiert', () => {
    const fremd = mat('Ökologie der Stadt', 'erdkunde')
    const m = mat('Ökologie im Wald')
    const d = { ...bio(), automatik: { biologie: false } }
    const plan = neuEinsortierenPlan([fremd, m], d, 'biologie', ohneKatalog, 'auto')
    expect(plan.betroffen).toEqual([k(m)])
    expect(plan.zuordnungen[k(m)]).toMatchObject({ bereichId: 'oeko' } satisfies Partial<Zuordnung>)
  })

  it('neue Bereiche aus dem Lehrplan: von Hand Zugeordnetes kommt bei „Alle" mit hinein', () => {
    const katalog = (): KatalogThema[] => [{ name: 'Fotosynthese', quelle: 'lehrplan', pfad: ['Stoffwechsel'] }]
    const hand = mat('Fotosynthese')
    const d = zuordnen(bio(), { [k(hand)]: { bereichId: 'sonst', von: 'hand', am: '' } })
    const plan = neuEinsortierenPlan([hand], d, 'biologie', katalog, 'alle')
    expect(plan.uebernahmen.map((u) => u.name)).toEqual(['Fotosynthese'])
    expect(plan.zuordnungen[k(hand)]).toBeNull()
    const nach = anwenden(d, plan)
    const ziel = nach.bereiche.find((b) => b.name === 'Fotosynthese')
    expect(nach.zuordnungen[k(hand)]).toMatchObject({ bereichId: ziel?.id, von: 'auto' })
    // Im Standard bliebe es liegen
    expect(neuEinsortierenPlan([hand], d, 'biologie', katalog, 'auto').uebernahmen).toEqual([])
  })
})
