import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectedChars, overallRatio, rememberLength, remainingLabel, remainingSeconds } from '../src/renderer/src/shared/aiProgress'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k)
  })
})

describe('Fortschritt einer KI-Anfrage', () => {
  it('schätzt zunächst grob und lernt dann aus den Läufen', () => {
    const ersteSchaetzung = expectedChars('worksheet')
    expect(ersteSchaetzung).toBeGreaterThan(1000)
    rememberLength('worksheet', 12000)
    rememberLength('worksheet', 14000)
    expect(expectedChars('worksheet')).toBe(13000)
    // Andere Auftragsarten bleiben davon unberührt
    expect(expectedChars('listening_script')).toBe(ersteSchaetzung)
  })

  it('ignoriert Ausreißer nach unten und behält nur die letzten Läufe', () => {
    rememberLength('outline', 50)
    expect(expectedChars('outline')).toBe(expectedChars('unbekannt'))
    for (let i = 1; i <= 12; i++) rememberLength('outline', i * 1000)
    // Nur die letzten acht zählen: 5000 bis 12000, Mittel 8500
    expect(expectedChars('outline')).toBe(8500)
  })

  it('rechnet Schritte und laufende Anfrage zusammen', () => {
    expect(overallRatio(0, 4, 0)).toBe(0)
    expect(overallRatio(2, 4, 0.6)).toBeCloseTo(0.65, 5)
    // Der Balken wird nie voll, solange noch etwas läuft
    expect(overallRatio(4, 4, 1)).toBe(0.99)
    expect(overallRatio(1, 0, 0.5)).toBe(0)
  })

  it('nennt eine Restzeit erst, wenn sie etwas wert ist', () => {
    expect(remainingSeconds(0.05, 10000)).toBeNull()
    expect(remainingSeconds(0.5, 1000)).toBeNull()
    // Nach 30 s bei halbem Fortschritt bleiben etwa 30 s
    expect(remainingSeconds(0.5, 30000)).toBe(30)
    expect(remainingLabel(30)).toBe('noch etwa 30 Sek.')
    expect(remainingLabel(100)).toBe('noch etwa 1:40 Min.')
    expect(remainingLabel(null)).toBe('')
  })
})

describe('Fortschritt über zwei Abschnitte', () => {
  it('lässt das Ausformulieren höchstens bis zu seinem Anteil laufen', async () => {
    const { phaseRatio, RUN_PHASES } = await import('../src/renderer/src/shared/aiProgress')
    expect(phaseRatio('formulate', 0, 4)).toBe(0)
    expect(phaseRatio('formulate', 4, 4)).toBeCloseTo(RUN_PHASES.formulate, 5)
  })

  it('beginnt das Fertigstellen dort, wo das Ausformulieren aufhört', async () => {
    const { phaseRatio, RUN_PHASES } = await import('../src/renderer/src/shared/aiProgress')
    // Genau das war der Fehler: Der zweite Abschnitt fing wieder bei null an
    expect(phaseRatio('finish', 0, 3)).toBeCloseTo(RUN_PHASES.formulate, 5)
    expect(phaseRatio('finish', 3, 3)).toBeCloseTo(0.99, 5)
  })

  it('bezieht den laufenden Datenstrom in den Abschnitt ein', async () => {
    const { phaseRatio } = await import('../src/renderer/src/shared/aiProgress')
    expect(phaseRatio('formulate', 0, 2, 0.5)).toBeGreaterThan(0)
    expect(phaseRatio('formulate', 0, 2, 0.5)).toBeLessThan(phaseRatio('formulate', 1, 2))
  })

  it('erreicht nie ganz 100 Prozent, solange noch gearbeitet wird', async () => {
    const { phaseRatio } = await import('../src/renderer/src/shared/aiProgress')
    expect(phaseRatio('finish', 99, 100)).toBeLessThan(1)
  })

  it('läuft nie zurück', async () => {
    const { neverBackwards } = await import('../src/renderer/src/shared/aiProgress')
    expect(neverBackwards(0.7, 0.3)).toBe(0.7)
    expect(neverBackwards(0.3, 0.7)).toBe(0.7)
  })
})
