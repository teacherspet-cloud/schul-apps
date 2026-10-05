import { describe, expect, it } from 'vitest'
import { begrenzeStand, leseStand, startGroesse } from '../src/main/fensterStand'

/*
 * Fenstergröße und -lage werden gemerkt – aber nie so wiederhergestellt, dass das Fenster
 * außerhalb der angeschlossenen Bildschirme aufgeht (Wunsch der Lehrkraft, 25.09.2026).
 */
const HAUPT = { x: 0, y: 0, width: 1920, height: 1040 }
const ZWEITER = { x: 1920, y: 0, width: 1280, height: 984 }

describe('Fensterstand', () => {
  it('übernimmt einen sichtbaren Stand unverändert, auch maximiert', () => {
    const stand = { bounds: { x: 100, y: 50, width: 1300, height: 850 }, maximiert: true }
    expect(begrenzeStand(stand, [HAUPT])).toEqual(stand)
  })

  it('bleibt auf dem zweiten Bildschirm, wenn er noch da ist', () => {
    const stand = { bounds: { x: 2000, y: 40, width: 1100, height: 800 }, maximiert: false }
    expect(begrenzeStand(stand, [HAUPT, ZWEITER])?.bounds).toEqual(stand.bounds)
  })

  it('holt das Fenster mittig auf den Hauptbildschirm, wenn der zweite fehlt', () => {
    const b = begrenzeStand({ bounds: { x: 2000, y: 40, width: 1100, height: 800 }, maximiert: false }, [HAUPT])!.bounds
    expect(b).toEqual({ x: 410, y: 120, width: 1100, height: 800 })
  })

  it('schiebt ein halb herausragendes Fenster zurück und verkleinert es auf die Arbeitsfläche', () => {
    const b = begrenzeStand({ bounds: { x: 1500, y: -30, width: 2500, height: 1200 }, maximiert: false }, [HAUPT])!.bounds
    expect(b).toEqual({ x: 0, y: 0, width: 1920, height: 1040 })
  })

  it('verwirft Unplausibles', () => {
    expect(leseStand(null)).toBeNull()
    expect(leseStand({ bounds: { x: 0, y: 0, width: 'breit', height: 800 } })).toBeNull()
    expect(leseStand({ bounds: { x: 0, y: 0, width: 50, height: 50 } })).toBeNull()
    expect(leseStand({ bounds: { x: 1, y: 2, width: 1200, height: 800 }, maximiert: 'ja' })).toEqual({
      bounds: { x: 1, y: 2, width: 1200, height: 800 },
      maximiert: false
    })
  })
})

describe('startGroesse (05.10.2026: als Fenster, nicht bildschirmfüllend)', () => {
  it('kleiner Bildschirm: höchstens 85 %, mittig', () => {
    const r = startGroesse({ x: 0, y: 0, width: 1366, height: 728 })
    expect(r).toEqual({ x: 103, y: 55, width: 1161, height: 619 })
  })
  it('großer Bildschirm: Standardgröße, mittig', () => {
    expect(startGroesse({ x: 0, y: 0, width: 2560, height: 1400 })).toEqual({ x: 580, y: 250, width: 1400, height: 900 })
  })
})
