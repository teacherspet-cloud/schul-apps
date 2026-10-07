import { describe, expect, it } from 'vitest'
import { LEHRWERKE_LATEIN } from '../src/renderer/src/shared/lehrwerkeLatein'
import { kapitelFolge } from '../src/renderer/src/shared/lehrwerkThemen'
import { GRAMMAR_TOPICS, teilformenFuer } from '../src/renderer/src/modules/arbeitsblatt/didactics/grammar'
import { lehrwerkeMitGrammatik, ordneZu, unitEintraege, zerlegeGrammatik } from '../src/renderer/src/modules/arbeitsblatt/didactics/grammatikAuswahl'
import { ZUORDNUNG_LA } from '../src/renderer/src/modules/arbeitsblatt/didactics/zuordnungLatein'

/**
 * Lateinische Lehrwerke (07.10.2026): Pontes, Campus A, prima., prima.nova – Grammatik je Lektion aus den Synopsen,
 * zugeordnet zu den Katalogthemen la.*; Länderausgaben getrennt.
 */
const la = GRAMMAR_TOPICS.filter((t) => t.subject === 'latein')

describe('Latein-Lehrwerke', () => {
  it('Zuordnungstabelle nennt nur vorhandene Themen und Teilformen', () => {
    for (const z of ZUORDNUNG_LA) {
      for (const id of z.ids) expect(la.some((t) => t.id === id), id).toBe(true)
      if (z.ids.length === 1)
        for (const teil of z.teile ?? [])
          expect(
            teilformenFuer(la.find((t) => t.id === z.ids[0])!, { subjectId: 'latein', grade: 12 }).some((x) => x.teil.id === teil),
            `${z.ids[0]}/${teil}`
          ).toBe(true)
    }
  })
  it('fast alle Angaben sind sicher zugeordnet', () => {
    const alle = Object.entries(LEHRWERKE_LATEIN).flatMap(([b, w]) =>
      Object.values(w.kapitel).flatMap((k) => zerlegeGrammatik(k.grammatik ?? '').map((p) => ({ b, p, z: ordneZu('latein', p, b) })))
    )
    const sicher = alle.filter((x) => x.z.sicher).length
    const ohne = alle.filter((x) => !x.z.ids.length).map((x) => x.p)
    console.log(`Latein: ${sicher} von ${alle.length} Angaben sicher zugeordnet; ohne Vorschlag: ${ohne.join(' | ')}`)
    expect(sicher / alle.length).toBeGreaterThan(0.85)
  })
  it('Lehrwerke je Fach und Land', () => {
    expect(lehrwerkeMitGrammatik('latein', 'NI').sort()).toEqual(['Campus A', 'Pontes', 'prima.', 'prima.nova'])
    expect(lehrwerkeMitGrammatik('latein', 'BY')).toEqual([])
    expect(lehrwerkeMitGrammatik('latein', 'RP')).toEqual(expect.arrayContaining(['Pontes', 'prima.']))
    expect(lehrwerkeMitGrammatik('englisch')).toContain('Green Line 1')
    expect(lehrwerkeMitGrammatik('englisch')).not.toContain('Pontes')
  })
  it('Pontes Lektion 1: Deklinationen und Präsens vorgeschlagen', () => {
    expect(kapitelFolge('Pontes')[1]).toBe('Lektion 1')
    const e = unitEintraege('latein', 'Pontes', 'Lektion 1', 'nur')
    const ids = new Set(e.filter((x) => x.sicher).flatMap((x) => x.ids))
    expect(ids.has('la.form.subst_ao')).toBe(true)
    expect(ids.has('la.form.konj_praes')).toBe(true)
  })
})
