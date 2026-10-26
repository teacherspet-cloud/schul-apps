// Redeeinleitungen in Satzanfängen (26.10.2026): einleitendes Verb im Indikativ, Konjunktiv nur im wiedergegebenen Inhalt
import { describe, expect, it } from 'vitest'
import { redeeinleitungIndikativ, satzanfaengeNachbessern } from '../src/renderer/src/modules/arbeitsblatt/didactics/redeeinleitung'
import { convertBlock } from '../src/renderer/src/modules/arbeitsblatt/generation/convert'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import { scaffoldRules } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'

describe('Redeeinleitung', () => {
  it('setzt das einleitende Verb in den Indikativ – nur am Anfang, nach kurzem Subjekt', () => {
    expect(redeeinleitungIndikativ('Er schildere, dass …')).toBe('Er schildert, dass …')
    expect(redeeinleitungIndikativ('Er betone, …')).toBe('Er betont, …')
    expect(redeeinleitungIndikativ('Er führe an, dass …')).toBe('Er führt an, dass …')
    expect(redeeinleitungIndikativ('Die Autorin stelle fest, dass …')).toBe('Die Autorin stellt fest, dass …')
    expect(redeeinleitungIndikativ('Manfred Wichmann erkläre, …')).toBe('Manfred Wichmann erklärt, …')
    expect(redeeinleitungIndikativ('Er komme zu dem Schluss, dass …')).toBe('Er kommt zu dem Schluss, dass …')
  })
  it('lässt richtige Satzanfänge und den Konjunktiv im Inhalt stehen', () => {
    for (const s of [
      'Er betont, die USA hätten …',
      'Wichmann erläutert, dass …',
      'Der Text verdeutlicht, dass …',
      'Weil er meine, …',
      'Dadurch veränderte sich …',
      'Es sei …'
    ])
      expect(redeeinleitungIndikativ(s)).toBe(s)
  })
  it('bessert nur betroffene Einträge einer Sprachhilfe nach', () => {
    const block = {
      groups: [
        { label: 'Wiedergeben', items: [{ text: 'Er schildere, dass …' }, { text: 'Er betont, dass …' }] },
        { label: 'Andere', items: [{ text: 'Dafür spricht, dass …' }] }
      ]
    }
    const neu = satzanfaengeNachbessern(block)
    expect(neu.groups[0].items.map((i) => i.text)).toEqual(['Er schildert, dass …', 'Er betont, dass …'])
    expect(neu.groups[1]).toBe(block.groups[1])
    expect(satzanfaengeNachbessern(neu)).toBe(neu)
  })
  it('greift beim Umwandeln der KI-Antwort und steht im Auftrag an die KI', () => {
    const b = convertBlock(
      {
        type: 'phrases',
        title: 'Sprachhilfe zu Aufgabe 2',
        body: 'Für Aufgabe 2',
        phraseGroups: [{ label: 'Distanziert zusammenfassen', items: [{ text: 'Er schildere, dass …' }] }]
      },
      createRng(3),
      [],
      'du'
    ) as { groups: { items: { text: string }[] }[] }
    expect(b.groups[0].items[0].text).toBe('Er schildert, dass …')
    expect(scaffoldRules(defaultMeta('NI', 'gymnasium', 'Gymnasium'))).toMatch(/Indikativ/)
  })
})
