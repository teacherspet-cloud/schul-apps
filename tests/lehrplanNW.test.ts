import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { bereichsName, istKompetenzsatz, MAX_WOERTER, pruefeLehrplan } from '../src/shared/lehrplan'
import { katalogBaum, type KatalogKnoten } from '../src/renderer/src/shared/themenKatalog'

/*
 * Lehrplan-Themen NRW (28.09.2026, recherche/lehrplaene/NW – amtliche Kernlehrpläne Sek I aus dem
 * Lehrplannavigator, Wortlaut der Inhaltsfelder und Schwerpunkte). Dieselben Wachen wie für NI.
 */
const ROH = JSON.parse(readFileSync(resolve(__dirname, '../resources/lehrplaene/NW.json'), 'utf8')) as { quellen: { id: string; url: string }[] }
const NW = pruefeLehrplan(ROH, 'NW')

describe('Lehrplandatei NRW', () => {
  it('ist gültig, mit Quellen und vielen Einträgen', () => {
    expect(NW).not.toBeNull()
    expect(ROH.quellen.length).toBeGreaterThan(50)
    expect(NW!.eintraege.length).toBeGreaterThan(800)
    for (const q of ROH.quellen) expect(q.url, q.id).toMatch(/^https:\/\//)
  })

  it('kein Bereichsname ist Kompetenzsatz oder zu lang', () => {
    const alle: string[] = []
    const gehe = (u: { thema: string; unterthemen?: unknown[] }[] | undefined): void => {
      for (const x of u ?? []) {
        alle.push(x.thema)
        gehe(x.unterthemen as never)
      }
    }
    for (const e of NW!.eintraege) {
      alle.push(e.thema)
      gehe(e.unterthemen)
    }
    const namen = alle.map(bereichsName).filter((n): n is NonNullable<typeof n> => n !== null)
    for (const n of namen) {
      expect(istKompetenzsatz(n.name), n.name).toBe(false)
      expect(n.name.split(/\s+/).length, n.name).toBeLessThanOrEqual(MAX_WOERTER)
    }
  })

  it('der Katalog hat Themen für die Kernfächer am Gymnasium, ohne doppelte Ebenen', () => {
    for (const fach of ['englisch', 'deutsch', 'mathematik', 'geschichte', 'erdkunde', 'biologie', 'chemie', 'physik']) {
      expect(katalogBaum(fach, NW!, 'gymnasium').length, fach).toBeGreaterThan(0)
    }
    const doppelt: string[] = []
    const gehe = (k: KatalogKnoten[], eltern: string): void => {
      for (const x of k) {
        if (x.name.toLocaleLowerCase('de') === eltern.toLocaleLowerCase('de')) doppelt.push(x.name)
        gehe(x.kinder, x.name)
      }
    }
    for (const fach of new Set(NW!.eintraege.map((e) => e.fach))) gehe(katalogBaum(fach, NW!, 'gymnasium'), '')
    expect(doppelt).toEqual([])
  })
})
