import { describe, expect, it } from 'vitest'
import { zahlEingabe, zahlSchritt, zahlVerlassen, type ZahlEreignis, type ZahlWert } from '../src/renderer/src/shared/zahlEntwurf'

/**
 * Zahlenfelder lassen sich beim Tippen leeren (01.10.2026, Befund „aus 60 wird 6045").
 * Nachgespielt wird ein Feld „Bearbeitungszeit" mit dem Aufrufer `Number(v) || 45`.
 */
function feld(start: number): { tippen: (...e: ZahlEreignis[]) => void; anzeige: () => ZahlWert; wert: () => number } {
  let wert = start
  let entwurf: ZahlWert | null = null
  return {
    tippen: (...ereignisse) => {
      for (const e of ereignisse) {
        const neu = zahlSchritt(entwurf, e)
        entwurf = neu.entwurf
        if (neu.melden !== null) wert = Number(neu.melden) || 45
      }
    },
    anzeige: () => entwurf ?? wert,
    wert: () => wert
  }
}

describe('Zahlenfeld mit Entwurf', () => {
  it('meldet nur fertige Zahlen sofort', () => {
    expect(zahlEingabe(45)).toBe(45)
    expect(zahlEingabe(0)).toBe(0)
    expect(zahlEingabe('')).toBeNull()
    expect(zahlEingabe('-')).toBeNull()
    expect(zahlEingabe('1.')).toBeNull()
    expect(zahlEingabe(Number.NaN)).toBeNull()
  })

  it('meldet beim Verlassen nur ein leeres Feld (als „")', () => {
    expect(zahlVerlassen('')).toBe('')
    expect(zahlVerlassen('  ')).toBe('')
    expect(zahlVerlassen(null)).toBeNull()
    expect(zahlVerlassen(60)).toBeNull()
    expect(zahlVerlassen('-')).toBeNull()
  })

  it('Alles markieren + Rücktaste leert das Feld, ohne auf den Standard zu springen', () => {
    const f = feld(60)
    f.tippen({ art: 'eingabe', wert: '' })
    expect(f.anzeige()).toBe('')
    expect(f.wert()).toBe(60)
  })

  it('danach „45" tippen ergibt 45 – nicht 6045 oder 4545', () => {
    const f = feld(60)
    f.tippen({ art: 'eingabe', wert: '' }, { art: 'eingabe', wert: 4 }, { art: 'eingabe', wert: 45 })
    expect(f.anzeige()).toBe(45)
    expect(f.wert()).toBe(45)
    f.tippen({ art: 'verlassen' })
    expect(f.anzeige()).toBe(45)
  })

  it('leer verlassen setzt den Standard des Aufrufers', () => {
    const f = feld(60)
    f.tippen({ art: 'eingabe', wert: '' }, { art: 'verlassen' })
    expect(f.wert()).toBe(45)
    expect(f.anzeige()).toBe(45)
  })

  it('eine getippte 0 bleibt im Feld stehen, auch wenn der Aufrufer sie ersetzt', () => {
    const f = feld(60)
    f.tippen({ art: 'eingabe', wert: '' }, { art: 'eingabe', wert: 0 })
    expect(f.anzeige()).toBe(0)
    f.tippen({ art: 'eingabe', wert: 5 })
    expect(f.wert()).toBe(5)
  })
})
