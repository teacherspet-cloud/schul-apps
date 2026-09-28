import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { bereichsName, istKompetenzsatz, MAX_WOERTER, pruefeLehrplan, type LehrplanUnterthema } from '../src/shared/lehrplan'
import { katalogBaum, type KatalogKnoten } from '../src/renderer/src/shared/themenKatalog'

/*
 * Dieselben Wachen für JEDE Lehrplandatei unter resources/lehrplaene (Großprogramm 0.4,
 * Landesdaten): Eine neu gelieferte Datei (Bayern, Baden-Württemberg …) ist damit ohne eigenen
 * Test abgedeckt. Regeln wie für NI/NRW: gültig, Quellen mit Adresse, keine Kompetenzsätze als
 * Bereichsnamen, Themen für die Kernfächer am Gymnasium, keine doppelten Ebenen.
 */
const ORDNER = resolve(__dirname, '../resources/lehrplaene')
const DATEIEN = readdirSync(ORDNER).filter((f) => /^[A-Z]{2}\.json$/.test(f))

describe.each(DATEIEN)('Lehrplandatei %s', (datei) => {
  const land = datei.slice(0, 2)
  const roh = JSON.parse(readFileSync(resolve(ORDNER, datei), 'utf8')) as { stateId: string; quellen?: { id: string; url?: string }[]; eintraege: { quelle?: string }[] }
  const lp = pruefeLehrplan(roh, land)

  it('ist gültig und gehört zum Land', () => {
    expect(lp).not.toBeNull()
    expect(roh.stateId).toBe(land)
    expect(lp!.eintraege.length).toBeGreaterThan(100)
  })

  it('jede Quelle hat eine Adresse, jeder Eintrag eine bekannte Quelle', () => {
    const ids = new Set((roh.quellen ?? []).map((q) => q.id))
    for (const q of roh.quellen ?? []) expect(q.url ?? '', q.id).toMatch(/^https:\/\//)
    for (const e of roh.eintraege) if (e.quelle) expect(ids.has(e.quelle), e.quelle).toBe(true)
  })

  it('kein Bereichsname ist Kompetenzsatz oder zu lang', () => {
    const alle: string[] = []
    const gehe = (u: LehrplanUnterthema[] | undefined): void => {
      for (const x of u ?? []) {
        alle.push(x.thema)
        gehe(x.unterthemen)
      }
    }
    for (const e of lp!.eintraege) {
      alle.push(e.thema)
      gehe(e.unterthemen)
    }
    const falsch = alle
      .map(bereichsName)
      .filter((n): n is NonNullable<typeof n> => n !== null)
      .filter((n) => istKompetenzsatz(n.name) || n.name.split(/\s+/).length > MAX_WOERTER)
      .map((n) => n.name)
    expect(falsch).toEqual([])
  })

  it('der Katalog hat Themen für die Kernfächer am Gymnasium, ohne doppelte Ebenen', () => {
    for (const fach of ['englisch', 'deutsch', 'mathematik', 'geschichte']) expect(katalogBaum(fach, lp!, 'gymnasium').length, fach).toBeGreaterThan(0)
    const doppelt: string[] = []
    const gehe = (k: KatalogKnoten[], eltern: string): void => {
      for (const x of k) {
        if (x.name.toLocaleLowerCase('de') === eltern.toLocaleLowerCase('de')) doppelt.push(x.name)
        gehe(x.kinder, x.name)
      }
    }
    for (const fach of new Set(lp!.eintraege.map((e) => e.fach))) gehe(katalogBaum(fach, lp!, 'gymnasium'), '')
    expect(doppelt).toEqual([])
  })
})
