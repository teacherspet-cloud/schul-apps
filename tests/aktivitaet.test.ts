// Aufspiel-Sperre (25.10.2026, server/aktivitaet.ts): ruhig nur ohne laufende Anfragen und ohne Handlung in den letzten Minuten
import { describe, expect, it } from 'vitest'
import { Aktivitaet, RUHE_MINUTEN, vonInnen } from '../src/server/aktivitaet'

describe('Aktivität am Server', () => {
  it('ohne Handlungen ruhig; nach einer Handlung erst nach der Ruhezeit wieder', () => {
    let jetzt = 1_000_000
    const a = new Aktivitaet(() => jetzt)
    expect(a.bild()).toEqual({ laufend: 0, lehrkraftVorMinuten: null, ruhig: true })
    a.merkeLehrkraft()
    expect(a.bild().ruhig).toBe(false)
    jetzt += (RUHE_MINUTEN - 1) * 60_000
    expect(a.bild()).toMatchObject({ lehrkraftVorMinuten: RUHE_MINUTEN - 1, ruhig: false })
    jetzt += 60_000
    expect(a.bild()).toMatchObject({ lehrkraftVorMinuten: RUHE_MINUTEN, ruhig: true })
  })
  it('laufende Anfragen und Aufträge sperren – auch ohne frische Handlung', () => {
    const a = new Aktivitaet(() => 5)
    a.anfrageBeginnt()
    expect(a.bild()).toMatchObject({ laufend: 1, ruhig: false })
    a.anfrageEndet()
    a.anfrageEndet()
    expect(a.bild().laufend).toBe(0)
    expect(a.bild(2)).toMatchObject({ laufend: 2, ruhig: false })
    expect(a.bild(0).ruhig).toBe(true)
  })
  it('nur Anfragen aus dem Container selbst sehen das Bild', () => {
    expect(vonInnen('127.0.0.1')).toBe(true)
    expect(vonInnen('::1')).toBe(true)
    expect(vonInnen('::ffff:127.0.0.1')).toBe(true)
    expect(vonInnen('172.18.0.2')).toBe(false)
    expect(vonInnen(undefined)).toBe(false)
  })
})
