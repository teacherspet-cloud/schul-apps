import { describe, expect, it } from 'vitest'
import { briefAnfrage, briefAus, iservRegel, type Elternbrief } from '../src/renderer/src/modules/elternbrief/model'
import { pruefeBrief } from '../src/renderer/src/modules/elternbrief/bearbeiten'

/*
 * IServ-Rückmeldung im Elternbrief (23.10.2026, Wunsch der Lehrkraft; Knopf-Namen nach hilfe.iserv.de und
 * Elternanleitungen 2026): „Gelesen" bzw. „Ja, zusagen" / „Nein, ablehnen" und „Senden", Freitext, beide Wege mit Zettel.
 */
const meta = (x: Partial<Elternbrief['meta']>): Elternbrief['meta'] => ({
  title: '',
  anlass: 'Ausflug oder Wandertag',
  ton: 'freundlich',
  stichpunkte: 'Ausflug Auswandererhaus 10.11.2026, Kosten 10,25 €',
  klasse: '7b',
  absender: 'Frau Berg',
  datum: '2026-10-23',
  ruecklauf: false,
  ...x
})

describe('IServ-Rückmeldung im Elternbrief', () => {
  it('Zustimmen: konkret formulieren, Knöpfe „Ja, zusagen“ / „Nein, ablehnen“ und „Senden“, Frist fett', () => {
    const r = iservRegel(meta({ iserv: { art: 'zustimmung' }, rueckgabeBis: '2026-11-03' }))
    expect(r).toContain('„Ja, zusagen"')
    expect(r).toContain('„Nein, ablehnen"')
    expect(r).toContain('„Senden"')
    expect(r).toMatch(/bis \*\*/)
    expect(r).not.toContain('Rücklaufzettel')
  })
  it('Gelesen und Freitext; mit Zettel beide Wege', () => {
    const r = iservRegel(meta({ iserv: { art: 'gelesen', freitext: true }, ruecklauf: true }))
    expect(r).toContain('„Gelesen"')
    expect(r).toContain('Textfeld')
    expect(r).toContain('beide Wege')
    expect(iservRegel(meta({}))).toBe('')
  })
  it('steht im Auftrag an die KI, auch die Frist ohne Zettel', () => {
    const b = { version: 1, meta: meta({ iserv: { art: 'zustimmung' }, rueckgabeBis: '2026-11-03' }), text: null, uebersetzungen: [] } as unknown as Elternbrief
    const user = briefAnfrage(b, 'Testschule').user
    expect(user).toContain('ISERV-RÜCKMELDUNG')
    expect(user).toContain('RÜCKMELDUNG ÜBER ISERV BIS: Dienstag, 03.11.2026')
  })
  it('Prüfung meldet einen Brief ohne IServ-Hinweis', () => {
    const b = { version: 1, meta: meta({ iserv: { art: 'gelesen' } }), text: null, uebersetzungen: [] } as unknown as Elternbrief
    const t = briefAus({ betreff: 'Ausflug', anrede: 'Liebe Eltern,', absaetze: ['Wir fahren ins Auswandererhaus.'], gruss: 'Grüße' }, false)
    expect(pruefeBrief(b, t).join(' ')).toContain('IServ')
    const mit = briefAus({ betreff: 'Ausflug', anrede: 'Liebe Eltern,', absaetze: ['Bitte bestätigen Sie in IServ mit „Gelesen“.'], gruss: 'Grüße' }, false)
    expect(pruefeBrief(b, mit).join(' ')).not.toContain('IServ')
  })
})
