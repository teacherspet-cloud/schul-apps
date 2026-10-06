import { describe, expect, it } from 'vitest'
import { nachSpielfehler, spielWoerter } from '../src/shared/vokabelSpiele'
import { neuerStand, type Vokabel, type WortStand } from '../src/shared/vokabeltrainer'

/* Wortmischung und Wirkung der Spiele auf den Kasten (06.10.2026) */
const JETZT = 1_000_000_000_000
const woerter: Vokabel[] = Array.from({ length: 40 }, (_, i) => ({ id: `w${i}`, term: `word${i}`, translation: `Wort${i}` }))
const st = (fach: number, faellig: number): WortStand => ({ ...neuerStand(), fach, faellig })
const staende: Record<string, WortStand> = {}
woerter.forEach((w, i) => {
  if (i < 10)
    staende[w.id] = st(3, JETZT - 1) // fällig
  else if (i < 20)
    staende[w.id] = st(1, JETZT + 1e9) // wackelig (Fach 1)
  else if (i < 30) staende[w.id] = st(6, JETZT + 1e9) // sicher
  // 30–39: neu
})

describe('Wörter für die Spiele', () => {
  it('etwa 60 % fällig, 30 % wackelig, 10 % sicher – keine neuen', () => {
    const aus = spielWoerter(woerter, staende, 6, JETZT, 20)
    const zahl = (von: number, bis: number) => aus.filter((w) => Number(w.id.slice(1)) >= von && Number(w.id.slice(1)) < bis).length
    expect(aus).toHaveLength(20)
    expect(zahl(0, 10)).toBe(10) // 60 % von 20 = 12, es gibt aber nur 10 fällige
    expect(zahl(10, 20)).toBeGreaterThanOrEqual(6)
    expect(zahl(20, 30)).toBeGreaterThanOrEqual(2)
    expect(zahl(30, 40)).toBe(0)
  })
  it('zu wenige gelernt: neue füllen auf, damit das Spiel startet', () => {
    const aus = spielWoerter(woerter, { w0: st(1, 0) }, 6, JETZT)
    expect(aus).toHaveLength(6)
    expect(aus.some((w) => w.id === 'w0')).toBe(true)
  })
})

describe('Fehler im Spiel', () => {
  it('macht das Wort gleich wieder fällig; sicheres Wort ein Fach zurück; neues bleibt unberührt', () => {
    expect(nachSpielfehler(st(3, JETZT + 9e9), JETZT)).toMatchObject({ fach: 3, faellig: JETZT })
    expect(nachSpielfehler(st(6, JETZT + 9e9), JETZT)).toMatchObject({ fach: 5, faellig: JETZT })
    expect(nachSpielfehler(st(0, 0), JETZT).fach).toBe(0)
  })
})
