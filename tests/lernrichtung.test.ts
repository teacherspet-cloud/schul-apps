/** Lernrichtung im Vokabeltraining (27.10.2026): Deutsch → Fremdsprache, Fremdsprache → Deutsch, beide */
import { describe, expect, it } from 'vitest'
import { abrufUebungFuer, nachAbfrage, uebungFuer, UEBUNGEN, type Uebung, type Vokabel, type WortStand } from '../src/shared/vokabeltrainer'
import { darstellungPruefen } from '../src/server/darstellungFelder'

const v: Vokabel = { id: 'a', term: 'house', translation: 'Haus' } as Vokabel
const stand = (fach: number): WortStand =>
  ({ fach, versuche: 3, falsch: 0, faellig: 0, zuletzt: 0, frei: [], fehlerTexte: [], erkannt: 0, erkennenVersuche: 0 } as unknown as WortStand)
const alle = (fach: number, richtung: 'defs' | 'fsde' | 'beide', abruf = false): Set<Uebung> => {
  const s = new Set<Uebung>()
  for (let i = 0; i < 200; i++) s.add((abruf ? abrufUebungFuer : uebungFuer)(stand(fach), v, i / 200, 0, richtung))
  return s
}
/** Übungen, in denen die Bedeutung gefragt ist (Fremdsprache steht da) */
const FS_DE: Uebung[] = ['auswahl', 'hoeren', 'freiDe']
/** Übungen, in denen die Vokabel entsteht (Deutsch steht da) */
const DE_FS: Uebung[] = ['auswahlFs', 'buchstaben', 'frei', 'luecke', 'luecken']

describe('Lernrichtung', () => {
  it('Deutsch → Fremdsprache: nie die Bedeutung erfragen', () => {
    for (const fach of [0, 1, 2, 3, 5]) for (const u of alle(fach, 'defs')) expect(FS_DE).not.toContain(u)
    expect(alle(1, 'defs')).toContain('auswahlFs')
  })
  it('Fremdsprache → Deutsch: erkennen, ab Fach 2 die Bedeutung schreiben – nie die Vokabel schreiben', () => {
    for (const fach of [1, 2, 3, 5]) for (const u of alle(fach, 'fsde')) expect(DE_FS).not.toContain(u)
    expect(alle(1, 'fsde')).toContain('auswahl')
    expect(alle(2, 'fsde')).toContain('freiDe')
    expect([...alle(4, 'fsde')].filter((u) => u === 'freiDe').length).toBe(1)
    expect(alle(3, 'fsde', true)).toEqual(new Set(['freiDe']))
  })
  it('beide: die bisherige Mischung', () => {
    expect(alle(1, 'beide')).toEqual(new Set(['auswahl', 'paar', 'auswahlFs', 'buchstaben']))
    expect(alle(1, 'beide')).toEqual(alle(1, 'beide'))
  })
  it('erster Kontakt bleibt die Lernkarte, die Bedeutung schreiben zählt wie frei schreiben', () => {
    expect(uebungFuer({ ...stand(0), versuche: 0 }, v, 0.5, 0, 'fsde')).toBe('karte')
    expect(UEBUNGEN).toContain('freiDe')
    const st = nachAbfrage(stand(3), 'freiDe', 'richtig', 'Haus', 1000)
    expect(st.fach).toBe(4)
    expect(st.frei.length).toBe(1)
  })
  it('Einstellung am Konto: nur die drei Werte', () => {
    expect(darstellungPruefen({ richtung: 'fsde' }).richtung).toBe('fsde')
    expect(darstellungPruefen({ richtung: 'quer' }).richtung).toBe('beide')
  })
})
