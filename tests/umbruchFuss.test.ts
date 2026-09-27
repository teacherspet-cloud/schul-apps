import { describe, expect, it } from 'vitest'
import { paginate } from '../src/renderer/src/shared/render/paginate'
import { ohneWebseitenKopf } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'

/*
 * PDF „Test" (27.09.2026): Ein Absatz rutschte auf die nächste Seite, obwohl er noch gepasst
 * hätte – die Verteilung rechnete den Fuß des Textes (Wortzahl, Quelle) dem ERSTEN Stück an.
 * Jetzt zählt er nur beim letzten. Dazu: Die Kopfzeilen der Webseite sind kein Lesetext.
 */

describe('Fuß eines geteilten Textes', () => {
  it('der Fuß belastet nur das Stück mit der letzten Einheit', () => {
    // Fünf Absätze à 100, Kopf 20, Fuß 60; Seiten 340: ohne Fußregel passten nur zwei Absätze auf Seite 1
    const plan = paginate([{ id: 't', height: 20 + 500 + 60, headHeight: 20, footHeight: 60, units: [100, 100, 100, 100, 100] }], 340, 340)
    expect(plan.length).toBe(2)
    expect(plan[0].items[0]).toMatchObject({ id: 't', from: 0, to: 3 })
    expect(plan[1].items[0]).toMatchObject({ id: 't', from: 3, to: 5, continued: true })
    expect(plan[1].overflow).toBe(false)
  })

  it('das letzte Stück nimmt seinen Fuß mit – passt er nicht mehr, wandert die letzte Einheit', () => {
    // Zwei Absätze à 100, Fuß 60; Seite 1 hat 250 frei: 20 + 100 + (100 + 60) = 280 > 250
    const plan = paginate([{ id: 't', height: 20 + 200 + 60, headHeight: 20, footHeight: 60, units: [100, 100] }], 250, 400)
    expect(plan[0].items[0]).toMatchObject({ from: 0, to: 1 })
    expect(plan[1].items[0]).toMatchObject({ from: 1, to: 2 })
  })

  it('ohne Fuß bleibt alles wie bisher', () => {
    const plan = paginate([{ id: 't', height: 320, headHeight: 20, units: [100, 100, 100] }], 340, 340)
    expect(plan.length).toBe(1)
    expect(plan[0].items[0]).toMatchObject({ from: 0, to: 3 })
  })
})

describe('Kopfzeilen der Webseite', () => {
  it('werden vor dem Lesetext abgeschnitten', () => {
    expect(ohneWebseitenKopf('Webseite: Kritik zu Macbeth | epd Film\nAdresse: https://www.epd-film.de/x\n\nSchön ist wüst …')).toBe('Schön ist wüst …')
    expect(ohneWebseitenKopf('Ein Text ohne Kopf.')).toBe('Ein Text ohne Kopf.')
    expect(ohneWebseitenKopf('Adresse: https://a.de\nText')).toBe('Text')
  })
})
