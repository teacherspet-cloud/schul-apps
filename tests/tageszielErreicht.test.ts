import { describe, expect, it } from 'vitest'
import { freiwilligeWoerter, neuerStand, TAG, tagesRunde, type Vokabel, type WortStand } from '../src/shared/vokabeltrainer'

/**
 * Befund der Lehrkraft 28.10.2026: „Heute üben · 20 Wörter“ blieb nach dem Üben bei 20, bei allen Lernenden. Am Schulserver
 * hatten sie 30–110 fällige Wiederholungen aus den Vortagen; die Runde füllte sich daraus immer wieder auf 20 auf.
 */
const JETZT = Date.UTC(2026, 9, 28, 12)
const liste: Vokabel[] = Array.from({ length: 80 }, (_, i) => ({ id: `w${i}`, term: `word${i}`, translation: `Wort${i}` }))
const gestern = (): WortStand => ({ ...neuerStand(), fach: 1, versuche: 1, zuletzt: JETZT - TAG, erstmals: JETZT - TAG, faellig: JETZT - 3600_000 })

describe('Tagesziel erreicht', () => {
  it('nach so vielen geübten Wörtern wie das Tagesziel ist die Runde geschafft', () => {
    // 60 Wörter von gestern fällig, 20 noch neu
    const staende: Record<string, WortStand> = {}
    for (const v of liste.slice(0, 60)) staende[v.id] = gestern()
    expect(tagesRunde(liste, staende, JETZT, 20).woerter).toHaveLength(20)
    // Die 20 der Runde geübt (neue zuerst): danach nichts mehr Pflicht, die fälligen Wiederholungen bleiben freiwillig
    for (const v of tagesRunde(liste, staende, JETZT, 20).woerter)
      staende[v.id] = { ...(staende[v.id] ?? neuerStand()), fach: 2, versuche: 2, zuletzt: JETZT, erstmals: staende[v.id]?.erstmals ?? JETZT, faellig: JETZT + 3 * TAG }
    const r = tagesRunde(liste, staende, JETZT, 20)
    expect(r.woerter).toHaveLength(0)
    expect(r.extra).toBe(60)
    // Freiwillig weiter: zuerst die fälligen Wiederholungen
    expect(freiwilligeWoerter(liste, staende, JETZT).every((v) => staende[v.id].faellig <= JETZT)).toBe(true)
  })

  it('nach der Hälfte bleibt die andere Hälfte', () => {
    const staende: Record<string, WortStand> = {}
    for (const v of liste.slice(0, 60)) staende[v.id] = gestern()
    for (const v of liste.slice(0, 10)) staende[v.id] = { ...staende[v.id], fach: 2, versuche: 2, zuletzt: JETZT, faellig: JETZT + 3 * TAG }
    expect(tagesRunde(liste, staende, JETZT, 20).woerter).toHaveLength(10)
  })
})
