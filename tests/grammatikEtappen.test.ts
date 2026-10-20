import { describe, expect, it } from 'vitest'
import { aktuelleEtappe, etappenDerRegel, etappenUebersicht, freieAufgaben } from '../src/shared/grammatikEtappen'
import type { GrammatikAufgabe } from '../src/shared/grammatiktrainer'
import type { WortStand } from '../src/shared/vokabeltrainer'

/*
 * Etappen (20.10.2026, abgestimmt): statt knapp 200 sichtbarer Übungen je Form kleine Etappen – Erkennen, Bilden,
 * Anwenden (Grundstufe), Profi (höhere Stufe), Bonus (Unterscheiden/Fehler). Weiter ab 80 % beim ersten Versuch richtig.
 */
const a = (id: string, uebung: GrammatikAufgabe['uebung'], niveau: GrammatikAufgabe['niveau'] = 'm', regelId = 'r1'): GrammatikAufgabe =>
  ({ id, art: 'luecke', regelId, anweisung: '', satz: '', loesungen: ['x'], uebung, niveau }) as GrammatikAufgabe
const st = (erster: 'r' | 'f'): WortStand => ({ fach: 1, faellig: 0, versuche: 1, falsch: erster === 'f' ? 1 : 0, erster }) as WortStand

/** Gymnasium: mittel + anspruchsvoll, je Kern-Art 8 mittel und 8 anspruchsvoll, Zusatz je 8 */
const gymnasium = (): GrammatikAufgabe[] => [
  ...(['erkennen', 'bilden', 'anwenden'] as const).flatMap((u) => [
    ...Array.from({ length: 8 }, (_, i) => a(`${u}-m${i}`, u, 'm')),
    ...Array.from({ length: 8 }, (_, i) => a(`${u}-a${i}`, u, 'a'))
  ]),
  ...(['unterscheiden', 'fehler'] as const).flatMap((u) => Array.from({ length: 8 }, (_, i) => a(`${u}-${i}`, u, 'm')))
]

describe('Etappen im Grammatiktrainer', () => {
  it('Gymnasium: Erkennen, Bilden, Anwenden mit „mittel", Profi mit „anspruchsvoll", Bonus – je ~8 statt 64', () => {
    const e = etappenDerRegel(gymnasium(), {})
    expect(e.map((x) => [x.id, x.aufgaben.length])).toEqual([
      ['erkennen', 8],
      ['bilden', 8],
      ['anwenden', 8],
      ['profi', 24],
      ['bonus', 16]
    ])
    expect(e.map((x) => x.frei)).toEqual([true, false, false, false, false])
    expect(aktuelleEtappe(e)?.id).toBe('erkennen')
  })

  it('Grundstufe aus dem Paket: Realschule (grundlegend + mittel) – Profi ist dann „mittel"', () => {
    const l = [a('e-g', 'erkennen', 'g'), a('e-m', 'erkennen', 'm'), a('b-g', 'bilden', 'g')]
    expect(etappenDerRegel(l, {}).map((x) => [x.id, x.aufgaben])).toEqual([
      ['erkennen', ['e-g']],
      ['bilden', ['b-g']],
      ['profi', ['e-m']]
    ])
  })

  it('weiter ab 80 % beim ersten Versuch richtig (mind. 5) – nicht erst nach allen Übungen', () => {
    const l = gymnasium()
    const vier = Object.fromEntries(['erkennen-m0', 'erkennen-m1', 'erkennen-m2', 'erkennen-m3'].map((id) => [id, st('r')]))
    expect(etappenDerRegel(l, vier)[1].frei).toBe(false)
    const fuenf = { ...vier, 'erkennen-m4': st('r') }
    const e = etappenDerRegel(l, fuenf)
    expect(e[0].geschafft).toBe(true)
    expect(e[1].frei).toBe(true)
    expect(aktuelleEtappe(e)?.id).toBe('bilden')
    // 3 von 5 richtig (60 %): noch nicht
    const schwach = { ...vier, 'erkennen-m0': st('f'), 'erkennen-m1': st('f'), 'erkennen-m4': st('r') }
    expect(etappenDerRegel(l, schwach)[1].frei).toBe(false)
  })

  it('niemand sitzt fest: alle Übungen der Etappe bearbeitet → weiter, auch unter 80 %', () => {
    const l = gymnasium()
    const alle = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`erkennen-m${i}`, st(i < 4 ? 'r' : 'f')]))
    expect(etappenDerRegel(l, alle)[1].frei).toBe(true)
  })

  it('Aufgaben ohne Übungsart (ältere Trainings): eine offene Etappe wie bisher', () => {
    const e = etappenDerRegel([a('x1', undefined), a('x2', undefined)], {})
    expect(e).toHaveLength(1)
    expect(e[0].frei).toBe(true)
  })

  it('freie Übungen und Übersicht für Lernraum/Regal', () => {
    const p = { regeln: [{ id: 'r1', titel: 'A', erklaerung: '', beispiele: [] }], aufgaben: gymnasium() }
    expect(freieAufgaben(p, {}).size).toBe(8)
    const u = etappenUebersicht(p, { 'erkennen-m0': st('r') })
    expect(u).toEqual({ geschafft: 0, gesamt: 5, aktuell: { name: 'Erkennen', offen: 7, gesamt: 8 }, offen: 7 })
  })
})
