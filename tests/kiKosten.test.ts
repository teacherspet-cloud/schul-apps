import { describe, expect, it } from 'vitest'
import { budgetBereinigen, budgetStand, buchstabe, kostenSchaetzen, preiseBereinigen, preisFuer } from '../src/shared/kiKosten'

// Kosten-Schätzung, Budget-Stufen und anonyme Buchstaben (10.10.2026, Verwaltung › KI-Zugänge)
describe('kiKosten', () => {
  it('Preis: Modell vor Anbieter, ohne Angabe undefined', () => {
    const p = { openai: { ein: 2 }, 'openai|gpt-x': { ein: 1, aus: 4 } }
    expect(preisFuer(p, 'openai', 'gpt-x')).toEqual({ ein: 1, aus: 4 })
    expect(preisFuer(p, 'openai', 'gpt-y')).toEqual({ ein: 2 })
    expect(preisFuer(p, 'mistral')).toBeUndefined()
    expect(preisFuer({ x: {} }, 'x')).toBeUndefined()
  })

  it('Kosten aus Eingabe/Ausgabe getrennt, mit nur einem Preis für alle Token', () => {
    expect(kostenSchaetzen(2_000_000, 500_000, { ein: 1.5, aus: 6 })).toEqual({ euro: 6, nurGesamtpreis: false })
    expect(kostenSchaetzen(2_000_000, 500_000, { ein: 2 })).toEqual({ euro: 5, nurGesamtpreis: true })
    expect(kostenSchaetzen(1000, 1000, undefined)).toEqual({ euro: null, nurGesamtpreis: false })
    expect(kostenSchaetzen(0, 0, { ein: 1, aus: 1 }).euro).toBe(0)
  })

  it('Budget: unter 80 % ok, ab 80 % Warnung, ab 100 % überschritten', () => {
    expect(budgetStand(79, 100)).toEqual({ anteil: 0.79, stufe: 'ok' })
    expect(budgetStand(80, 100).stufe).toBe('warnung')
    expect(budgetStand(99.9, 100).stufe).toBe('warnung')
    expect(budgetStand(100, 100).stufe).toBe('ueber')
    expect(budgetStand(250, 100)).toEqual({ anteil: 2.5, stufe: 'ueber' })
    expect(budgetStand(50, 0)).toEqual({ anteil: 0, stufe: 'ok' })
  })

  it('Buchstaben A … Z, AA …', () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(buchstabe)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA'])
  })

  it('Eingaben bereinigen', () => {
    expect(preiseBereinigen({ openai: { ein: '1,5', aus: -1 }, 'bad key!': { ein: 1 }, mistral: { ein: 'x' }, 'mistral|m-1': { aus: 3 } })).toEqual({
      openai: { ein: 1.5 },
      'mistral|m-1': { aus: 3 }
    })
    expect(budgetBereinigen({ art: 'euro', wert: '12,50' })).toEqual({ art: 'euro', wert: 12.5 })
    expect(budgetBereinigen({ art: 'token', wert: 0 })).toBeNull()
    expect(budgetBereinigen(null)).toBeNull()
  })
})
