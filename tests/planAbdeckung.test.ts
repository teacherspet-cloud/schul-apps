import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import type { Reihe, StundenArt } from '../src/shared/reihe'
import { abdeckungText, planAufRaster, pruefeAbdeckung, verteileAufStunden } from '../src/renderer/src/modules/unterrichtsreihe/planAbdeckung'
import { planAnfrage, planeReihe, rohSchritte, type PlanRoh } from '../src/renderer/src/modules/unterrichtsreihe/reihePlanungKi'
import { planungsDidaktik } from '../src/renderer/src/modules/unterrichtsreihe/planungDidaktik'

/* KI-Planung (08.10.2026): jede Stunde belegt, Doppelstunde = eine Stunde, Nachfrage und feste Verteilung */
const P = (stunde: number, minuten: number, rolle: 'pflicht' | 'optional' = 'pflicht') => ({ stunde, minuten, rolle })
const STUNDEN: StundenArt[] = ['einzel', 'doppel', 'einzel']

const roh = (stunden: number[]): PlanRoh => ({
  hinweis: 'Plenum',
  // Reihenmuster (08.10.2026): mit Leitfrage, der letzte Schritt nimmt sie auf – sonst fragt der Gegencheck nach
  leitfrage: 'Warum kam es zum Krieg?',
  teile: [
    {
      name: 'Teil 1',
      schritte: stunden.map((s, i) => ({
        titel: `Schritt ${i + 1}`,
        art: 'aufgabe',
        rolle: 'pflicht',
        stunde: s,
        minuten: 20,
        beschreibung: 'b – zur Leitfrage',
        lernziele: [],
        material: '',
        begruendung: ''
      }))
    }
  ]
})

const reihe: Reihe = {
  id: 'r1',
  titel: 'Julikrise',
  fachId: 'geschichte',
  fachLabel: 'Geschichte',
  stateId: 'NI',
  schoolTypeId: 'gymnasium',
  grade: 9,
  oberthema: 'Erster Weltkrieg',
  lernziele: [],
  schritte: [],
  stunden: STUNDEN,
  niveau: { anspruch: 'grundlegend', sprache: 'mittel', stufen: 2 }
}

describe('Abdeckung der Stunden', () => {
  it('findet leere und überfüllte Stunden; nur Pflichtschritte zählen', () => {
    const a = pruefeAbdeckung([P(0, 30), P(0, 30, 'optional'), P(1, 95)], STUNDEN)
    expect(a.leer).toEqual([2])
    expect(a.ueberlang).toEqual([1])
    expect(a.summen).toEqual([30, 95, 0])
    expect(a.ok).toBe(false)
    expect(abdeckungText(a, STUNDEN)).toContain('Stunde 3')
    expect(abdeckungText(a, STUNDEN)).toContain('Stunde 2 mit 95 von 90 min')
    expect(pruefeAbdeckung([P(0, 30), P(1, 60), P(2, 40)], STUNDEN).ok).toBe(true)
  })

  it('Stundennummern außerhalb des Rasters zählen als Befund (Doppelstunde doppelt gezählt)', () => {
    // Die KI zählte die Doppelstunde als zwei Stunden: Nummern 1, 2, 3, 4
    const a = pruefeAbdeckung(rohSchritte(roh([1, 2, 3, 4])), STUNDEN)
    expect(a.ohneStunde).toBe(1)
    expect(a.ok).toBe(false)
  })

  it('verteilt fest: jede Stunde bekommt etwas, Reihenfolge bleibt, Überlänge wird gekürzt', () => {
    const schritte = [P(0, 30), P(0, 30), P(0, 30), P(0, 30), P(0, 30)]
    const v = verteileAufStunden(schritte, STUNDEN)
    expect(pruefeAbdeckung(v, STUNDEN).leer).toEqual([])
    const stunden = v.map((s) => s.stunde!)
    expect([...stunden].sort((a, b) => a - b)).toEqual(stunden)
    // Eingabe unverändert
    expect(schritte.every((s) => s.stunde === 0)).toBe(true)
    // Zu lange Schritte: Minuten passen danach in die Stunde
    const lang = verteileAufStunden([P(0, 80), P(0, 120), P(0, 70)], STUNDEN)
    expect(pruefeAbdeckung(lang, STUNDEN).ok).toBe(true)
  })

  it('weniger Schritte als Stunden: je Stunde einer, der Rest bleibt leer', () => {
    const v = verteileAufStunden([P(2, 10), P(2, 10)], STUNDEN)
    expect(v.map((s) => s.stunde)).toEqual([0, 1])
  })
})

describe('Plan auf das Stundenraster legen', () => {
  const schritte = [{ stunde: 0 }, { stunde: 1 }]
  it('unverändertes oder hinten verlängertes Raster: Stunden wie geplant', () => {
    expect(planAufRaster(['einzel', 'doppel'], ['einzel', 'doppel'], schritte, false).schritte).toEqual(schritte)
    const r = planAufRaster(['einzel', 'doppel', 'einzel'], ['einzel', 'doppel'], schritte, false)
    expect(r.stunden).toEqual(['einzel', 'doppel', 'einzel'])
    expect(r.versetzt).toBe(false)
  })
  it('Raster inzwischen umgestellt: Ersetzen nimmt das geplante, Anhängen setzt die Stunden dahinter', () => {
    const ersetzt = planAufRaster(['doppel'], ['einzel', 'doppel'], schritte, true)
    expect(ersetzt.stunden).toEqual(['einzel', 'doppel'])
    expect(ersetzt.schritte.map((s) => s.stunde)).toEqual([0, 1])
    const angehaengt = planAufRaster(['doppel'], ['einzel', 'doppel'], schritte, false)
    expect(angehaengt.stunden).toEqual(['doppel', 'einzel', 'doppel'])
    expect(angehaengt.schritte.map((s) => s.stunde)).toEqual([1, 2])
    expect(angehaengt.versetzt).toBe(true)
  })
})

describe('Planung mit Nachfrage (Attrappe statt KI)', () => {
  const kc = { auszug: [], quelle: '' }
  it('Anfrage nennt Stunde = Termin, Land und Schulform ausgeschrieben, Profil, Niveau, Einstieg und Lernkarten-Regel', () => {
    const a = planAnfrage(reihe, kc, [])
    expect(a.system).toContain('Niedersachsen')
    expect(a.system).not.toContain('Schulform gymnasium')
    expect(a.user).toContain('eine Doppelstunde zählt als EINE Stunde mit 90 min')
    expect(a.user).toContain('JEDE Stunde bekommt mindestens einen Schritt')
    expect(a.user).toContain('problemorientierter Einstieg')
    expect(a.user).toContain('Lernkarten (Begriffe SICHERN')
    expect(a.user).toContain('LERNGRUPPENPROFIL')
    expect(a.user).toContain('NIVEAU DER REIHE: Anspruch grundlegend, Sprache mittel')
    expect(a.user).toContain('2 Niveaustufen')
    expect(a.user).toContain('ALTERSSTUFE')
    expect(planungsDidaktik(reihe).length).toBeGreaterThanOrEqual(3)
  })

  it('fragt bei leeren Stunden einmal nach und übernimmt die neue Verteilung', async () => {
    const anfragen: StructuredRequest[] = []
    const antworten = [roh([1, 1, 2]), roh([1, 2, 3])]
    const ki = async <T,>(req: StructuredRequest): Promise<T> => {
      anfragen.push(req)
      return antworten.shift() as T
    }
    const meldungen: string[] = []
    const plan = await planeReihe(reihe, kc, [], ki, '', '', (m) => meldungen.push(m))
    expect(anfragen).toHaveLength(2)
    expect(anfragen[1].user).toContain('Ohne Schritt: Stunde 3')
    expect(anfragen[1].user).toContain('BISHERIGER PLAN')
    expect(meldungen[0]).toContain('verteilt')
    expect(plan.verteilung).toBe('nachgefragt')
    expect(plan.schritte.map((s) => s.stunde)).toEqual([0, 1, 2])
    expect(plan.stunden).toEqual(STUNDEN)
  })

  it('hilft auch die Nachfrage nicht, verteilt die App fest', async () => {
    let n = 0
    const ki = async <T,>(): Promise<T> => {
      n++
      return roh([1, 1, 1, 1]) as T
    }
    const plan = await planeReihe(reihe, kc, [], ki)
    expect(n).toBe(2)
    expect(plan.verteilung).toBe('fest')
    expect(pruefeAbdeckung(plan.schritte, STUNDEN).leer).toEqual([])
  })

  it('passt der Plan, keine Nachfrage', async () => {
    let n = 0
    const ki = async <T,>(): Promise<T> => {
      n++
      return roh([1, 2, 3]) as T
    }
    const plan = await planeReihe(reihe, kc, [], ki)
    expect(n).toBe(1)
    expect(plan.verteilung).toBe('ki')
  })
})

describe('Niveau der Reihe als Vorgabe der Schritte', () => {
  it('gilt für alle Schritte; die Vorgabe des Schritts nur im Expertenmodus', async () => {
    const { schrittNiveau } = await import('../src/renderer/src/modules/unterrichtsreihe/grundlage')
    const r = { niveau: { anspruch: 'grundlegend' as const, sprache: 'anspruchsvoll' as const, stufen: 2 as const } }
    const s = { kiVorgabe: { niveau: 'anspruchsvoll' as const, stufen: 3 as const } }
    expect(schrittNiveau(r, {}, true)).toEqual({ niveau: 'grundlegend', sprache: 'anspruchsvoll', stufen: 2 })
    expect(schrittNiveau(r, s, false)).toEqual({ niveau: 'grundlegend', sprache: 'anspruchsvoll', stufen: 2 })
    expect(schrittNiveau(r, s, true)).toEqual({ niveau: 'anspruchsvoll', sprache: 'anspruchsvoll', stufen: 3 })
    // jahrgangsgemäß, ein Niveau: keine Angabe
    expect(schrittNiveau({ niveau: { anspruch: 'mittel', sprache: 'mittel', stufen: 1 } }, {}, true)).toEqual({})
    expect(schrittNiveau({}, s, true)).toEqual({ niveau: 'anspruchsvoll', sprache: 'anspruchsvoll', stufen: 3 })
  })
})
