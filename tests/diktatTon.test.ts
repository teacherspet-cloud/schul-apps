import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { diktatZeilen, tonAktuell, tonFingerabdruck } from '../src/renderer/src/modules/arbeitsblatt/diktatVertonung'
import { abschnittGrenzen } from '../src/renderer/src/modules/onlinetest/DiktatAbspieler'
import { BlockInhalt } from '../src/renderer/src/modules/arbeitsblatt/render/baustein/blockview'
import { WsContext, type WsContextValue } from '../src/renderer/src/modules/arbeitsblatt/render/WsContext'
import type { DiktatBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const d: DiktatBlock = {
  id: 'd1',
  type: 'diktat',
  title: 'Zoo',
  form: 'klassisch',
  text: 'Im Zoo / gibt es viele Tiere. / Ich weiß, / dass er satt ist!',
  phaenomene: [],
  zielwoerter: [],
  kommasDiktiert: false,
  zaehlart: 'isb',
  sechsAbProzent: 10
}

describe('Vorlesestimme fürs Diktat (26.11.2026)', () => {
  it('ein Sinnabschnitt je Zeile, Satzschlusszeichen angesagt, Kommas nur wenn diktiert', () => {
    expect(diktatZeilen(d)).toEqual(['Im Zoo', 'gibt es viele Tiere … Punkt.', 'Ich weiß,', 'dass er satt ist … Ausrufezeichen.'])
    expect(diktatZeilen({ ...d, kommasDiktiert: true })[2]).toBe('Ich weiß – Komma –')
  })
  it('Aufnahme gilt nur für den Text, mit dem sie entstand', () => {
    const mit = { ...d, ton: { url: '/h/abc', zeitmarken: [0, 1.5, 4, 5.2], fingerabdruck: tonFingerabdruck(d) } }
    expect(tonAktuell(mit)).toBe(true)
    expect(tonAktuell({ ...mit, text: `${d.text} Neu.` })).toBe(false)
  })
  it('Schülerblatt trägt nur den Anker, nicht den Text', () => {
    const ctx: WsContextValue = { mode: 'print', taskNumbers: new Map(), materialNumbers: new Map(), showStars: false, taskStyle: { numberStyle: 'circle', showSocialFormIcons: false } }
    const mit = { ...d, ton: { url: '/h/abc', zeitmarken: [0, 1.5], fingerabdruck: tonFingerabdruck(d) } }
    const html = renderToStaticMarkup(createElement(WsContext.Provider, { value: ctx }, createElement(BlockInhalt, { block: mit })))
    expect(html).toContain('data-diktat-ton="/h/abc"')
    expect(html).not.toContain('Tiere')
  })
  it('Abschnittsgrenzen aus den Zeitmarken', () => {
    const t = { url: '/h/abc', zeitmarken: [0, 1.5, 4], sekunden: 7 }
    expect(abschnittGrenzen(t, 1, 0)).toEqual([1.5, 4])
    expect(abschnittGrenzen(t, 2, 0)).toEqual([4, 7])
  })
})
