import { describe, expect, it } from 'vitest'
import { paginate, type MeasuredItem, type PagePlan } from '../src/renderer/src/shared/render/paginate'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'

/*
 * Seitenrand (30.09.2026, Befund der Lehrkraft: „die letzte Zeile einer Tabelle nur halb
 * sichtbar"). Der Umbruch darf keine Seite über ihren Platz hinaus füllen – auch nicht mit
 * dem Kopf eines Folgestücks (wiederholte Tabellenkopfzeile) und nicht mit dem Fuß. Die
 * Prüfung nach dem Setzen gibt Seiten, die trotzdem überliefen, per `abzug` weniger Platz.
 */

/** Höhe, die ein Seitenplan nach den gemessenen Werten belegt */
function belegt(plan: PagePlan, items: MeasuredItem[]): number {
  const je = new Map(items.map((i) => [i.id, i]))
  return plan.items.reduce((summe, it) => {
    const m = je.get(it.id)!
    if (!m.units) return summe + m.height
    const von = it.from ?? 0
    const bis = it.to ?? m.units.length
    const kopf = von === 0 ? (m.headHeight ?? 0) : (m.continuedHead ?? 0) + (m.unitRepeat?.[von] ?? 0)
    const fuss = bis >= m.units.length ? (m.footHeight ?? 0) : 0
    return summe + kopf + m.units.slice(von, bis).reduce((a, b) => a + b, 0) + fuss
  }, 0)
}

describe('Abzug aus der Prüfung nach dem Setzen', () => {
  it('eine Seite mit Abzug nimmt weniger auf – das Überstehende rutscht auf die nächste', () => {
    const items: MeasuredItem[] = [
      { id: 'a', height: 400 },
      { id: 'b', height: 400 },
      { id: 'c', height: 190 }
    ]
    expect(paginate(items, 1000, 1000)).toHaveLength(1)
    const mit = paginate(items, 1000, 1000, [20])
    expect(mit).toHaveLength(2)
    expect(mit[1].items[0].id).toBe('c')
  })

  it('der Abzug gilt nur für seine Seite', () => {
    const items: MeasuredItem[] = Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, height: 300 }))
    const plan = paginate(items, 900, 900, [0, 10])
    expect(plan.map((p) => p.items.length)).toEqual([3, 2, 1])
  })

  it('ohne Abzug bleibt alles wie bisher', () => {
    const items: MeasuredItem[] = [{ id: 't', height: 520, headHeight: 20, units: [100, 100, 100, 100, 100] }]
    expect(paginate(items, 340, 340)).toEqual(paginate(items, 340, 340, []))
  })
})

describe('Kopf eines Folgestücks', () => {
  it('die wiederholte Tabellenkopfzeile zählt auf der Folgeseite mit', () => {
    // Titel + Kopfzeile 60, Kopfzeile allein 35; zwölf Zeilen à 50 auf Seiten zu 400
    const tabelle: MeasuredItem = { id: 'tab', height: 60 + 600, headHeight: 60, continuedHead: 35, units: Array(12).fill(50), keepTogether: true }
    const plan = paginate([tabelle], 400, 400)
    for (const seite of plan) expect(belegt(seite, [tabelle])).toBeLessThanOrEqual(400)
    // Ohne den Folgekopf hätten auf Seite 2 sieben statt sechs Zeilen gestanden – 35 px zu viel
    expect(plan[1].items[0]).toMatchObject({ from: 6, continued: true })
    expect((plan[1].items[0].to ?? 0) - (plan[1].items[0].from ?? 0)).toBe(6)
  })
})

describe('Keine Seite läuft über (Zufallsblätter)', () => {
  it('500 zufällige Blätter mit Köpfen, Folgeköpfen, Füßen und Abzügen', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const r = createRng(seed)
      const items: MeasuredItem[] = Array.from({ length: 3 + Math.floor(r() * 12) }, (_, i) => {
        if (r() < 0.4) return { id: `b${i}`, height: 20 + r() * 300, keepWithNext: r() < 0.1 }
        const units = Array.from({ length: 1 + Math.floor(r() * 30) }, () => 10 + r() * 60)
        const headHeight = r() * 60
        const footHeight = r() < 0.3 ? r() * 30 : 0
        return {
          id: `u${i}`,
          height: headHeight + units.reduce((a, b) => a + b, 0) + footHeight,
          headHeight,
          footHeight,
          continuedHead: r() * 40,
          units,
          keepTogether: r() < 0.5
        }
      })
      const abzug = Array.from({ length: 8 }, () => (r() < 0.3 ? r() * 80 : 0))
      const plan = paginate(items, 700, 900, abzug)
      plan.forEach((seite, i) => {
        if (seite.overflow) return
        const platz = (i === 0 ? 700 : 900) - (abzug[i] ?? 0)
        expect(belegt(seite, items), `Blatt ${seed}, Seite ${i + 1}`).toBeLessThanOrEqual(platz + 0.5)
      })
    }
  })
})

/*
 * TEILEN AN NATÜRLICHEN STELLEN (01.10.2026, Wunsch der Lehrkraft: weniger Seiten, ohne dass die
 * Aufgabenstellung allein am Seitenende steht). Eigenschaften an Zufallsblättern mit gebundenen
 * Einheiten (`unitGlue`) und wiederholten Tabellenköpfen (`unitRepeat`):
 *   – kein Überlauf,
 *   – geteilt wird nur ZWISCHEN Einheiten, die Stücke schließen lückenlos aneinander an,
 *   – kein Stück endet mit einer gebundenen Einheit (Ausnahme: die Kette ist länger als eine
 *     ganze Seite und beginnt oben auf einer leeren Seite),
 *   – kein Stück besteht nur aus dem Kopf (Aufgabenstellung ohne Inhalt),
 *   – nichts wird ohne Not weitergeschoben: Was auf der Folgeseite oben steht, hätte unten nicht
 *     mehr gepasst.
 */
function zufallsBlatt(seed: number): { items: MeasuredItem[]; abzug: number[] } {
  const r = createRng(seed)
  const items: MeasuredItem[] = Array.from({ length: 3 + Math.floor(r() * 12) }, (_, i) => {
    if (r() < 0.35) return { id: `b${i}`, height: 20 + r() * 300 }
    const n = 1 + Math.floor(r() * 30)
    const units = Array.from({ length: n }, () => 10 + r() * 70)
    const headHeight = 10 + r() * 60
    const footHeight = r() < 0.3 ? r() * 30 : 0
    const unitGlue = units.map(() => r() < 0.25)
    const tabelle = r() < 0.3
    return {
      id: `u${i}`,
      height: headHeight + units.reduce((a, b) => a + b, 0) + footHeight,
      headHeight,
      footHeight,
      continuedHead: r() * 40,
      units,
      unitGlue,
      ...(tabelle ? { unitRepeat: units.map(() => 15 + r() * 20) } : {})
    }
  })
  return { items, abzug: Array.from({ length: 10 }, () => (r() < 0.3 ? r() * 80 : 0)) }
}

describe('Teilen an natürlichen Stellen (Zufallsblätter)', () => {
  it('2000 Blätter: kein Überlauf, Stücke lückenlos, nie gebunden oder nur Kopf am Seitenende, nichts ohne Not weitergeschoben', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const { items, abzug } = zufallsBlatt(seed)
      const je = new Map(items.map((i) => [i.id, i]))
      const plan = paginate(items, 700, 900, abzug)
      const platz = (i: number): number => (i === 0 ? 700 : 900) - (abzug[i] ?? 0)
      const ort = `Blatt ${seed}`
      // Stücke je Baustein in Reihenfolge
      const stuecke = new Map<string, { from: number; to: number; seite: number; erstes: boolean }[]>()
      plan.forEach((seite, s) => {
        if (!seite.overflow) expect(belegt(seite, items), `${ort}, Seite ${s + 1} läuft über`).toBeLessThanOrEqual(platz(s) + 0.5)
        seite.items.forEach((it, k) => {
          const m = je.get(it.id)!
          if (!m.units) return
          const liste = stuecke.get(it.id) ?? []
          liste.push({ from: it.from ?? 0, to: it.to ?? m.units.length, seite: s, erstes: k === 0 })
          stuecke.set(it.id, liste)
        })
      })
      for (const [id, liste] of stuecke) {
        const m = je.get(id)!
        const n = m.units!.length
        expect(liste[0].from, `${ort}: ${id} beginnt nicht bei der ersten Einheit`).toBe(0)
        expect(liste[liste.length - 1].to, `${ort}: ${id} endet nicht mit der letzten Einheit`).toBe(n)
        liste.forEach((st, k) => {
          expect(st.to, `${ort}: ${id} hat ein Stück nur aus dem Kopf`).toBeGreaterThan(st.from)
          if (k > 0) expect(st.from, `${ort}: ${id} Stücke schließen nicht aneinander an`).toBe(liste[k - 1].to)
          if (st.to < n && m.unitGlue?.[st.to - 1]) {
            // Erlaubt nur, wenn die gebundene Kette oben auf einer leeren Seite nicht ganz passt
            let kette = (st.from === 0 ? (m.headHeight ?? 0) : (m.continuedHead ?? 0) + (m.unitRepeat?.[st.from] ?? 0))
            for (let j = st.from; j < n; j++) {
              kette += m.units![j]
              if (!m.unitGlue?.[j]) break
            }
            expect(st.erstes && kette > platz(st.seite) + 0.5, `${ort}: ${id} endet auf Seite ${st.seite + 1} mit gebundener Einheit ${st.to - 1}`).toBe(true)
          }
        })
      }
      // Nichts ohne Not weitergeschoben: Der Anfang der Folgeseite hätte unten nicht mehr gepasst
      for (let s = 0; s + 1 < plan.length; s++) {
        const rest = platz(s) - belegt(plan[s], items)
        const oben = plan[s + 1].items[0]
        const m = je.get(oben.id)!
        let mindestens: number
        if (!m.units) mindestens = m.height
        else {
          const von = oben.from ?? 0
          mindestens = von === 0 ? (m.headHeight ?? 0) : 0
          const vorher = plan[s].items[plan[s].items.length - 1]
          // Fortsetzung desselben Bausteins: Der Kopf des Folgestücks entfiele, bliebe es auf der Seite
          if (von > 0 && vorher?.id !== oben.id) mindestens += (m.continuedHead ?? 0) + (m.unitRepeat?.[von] ?? 0)
          for (let j = von; j < m.units.length; j++) {
            mindestens += m.units[j] + (j === m.units.length - 1 ? (m.footHeight ?? 0) : 0)
            if (!m.unitGlue?.[j]) break
          }
        }
        expect(mindestens, `${ort}: Seite ${s + 1} lässt ${Math.round(rest)} px frei, oben auf Seite ${s + 2} stehen nur ${Math.round(mindestens)} px`).toBeGreaterThan(rest - 0.5)
      }
    }
  })

  it('ein langer teilbarer Baustein kostet keine angebrochene Seite mehr (früher: ganz weitergeschoben)', () => {
    // Seite 1 halb voll; eine Zuordnung mit 20 Zeilen (Kopf 60): früher „zusammenhalten" → 3 Seiten, jetzt 2
    const vorher: MeasuredItem = { id: 'text', height: 520 }
    const zuordnung: MeasuredItem = { id: 'z', height: 60 + 20 * 60, headHeight: 60, continuedHead: 25, units: Array(20).fill(60) }
    const plan = paginate([vorher, zuordnung], 1000, 1000)
    expect(plan).toHaveLength(2)
    expect(plan[0].items[1]).toMatchObject({ id: 'z', from: 0 })
  })
})
