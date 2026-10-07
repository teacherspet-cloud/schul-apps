import { describe, expect, it, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { eigeneWerte, nurEigeneFaecher, WEITERE_FAECHER_HINWEIS } from '../src/renderer/src/shared/haeufig'
import { AlleOptionen, NurExperte, OptionenBereich } from '../src/renderer/src/shared/components/NurExperte'
import { MantineProvider } from '@mantine/core'

// Beim Zeichnen auf dem Server liest zustand nur den Anfangszustand – der Modus kommt deshalb aus einer Attrappe
let modus: 'standard' | 'experte' | undefined
vi.mock('../src/renderer/src/shared/settingsStore', () => ({ useExperte: () => modus !== 'standard' }))

/* Standard- und Expertenmodus (07.10.2026) */
describe('Fachauswahl im Standardmodus', () => {
  const optionen = [
    { group: 'Eigene Fächer', items: [{ value: 'englisch', label: 'Englisch' }] },
    {
      group: 'Andere Fächer',
      items: [
        { value: 'physik', label: 'Physik' },
        { value: 'chemie', label: 'Chemie' }
      ]
    }
  ]
  const suche = (o: typeof optionen, s: string): typeof optionen =>
    o.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(s.toLowerCase())) })).filter((g) => g.items.length)
  const eigene = new Set(['englisch'])

  it('ohne Suchtext nur eigene Fächer, das gewählte und den Hinweis', () => {
    const r = nurEigeneFaecher(optionen, '', eigene, 'chemie', suche)
    expect(r.map((o) => ('value' in o ? o.value : ''))).toEqual(['englisch', 'chemie', WEITERE_FAECHER_HINWEIS])
    expect(r.at(-1)).toMatchObject({ disabled: true })
  })
  it('mit Suchtext alle Fächer', () => {
    const r = nurEigeneFaecher(optionen, 'phy', eigene, null, suche)
    expect(JSON.stringify(r)).toContain('physik')
  })
  it('ohne eigenes Fach in der Liste bleibt alles', () => {
    expect(nurEigeneFaecher(optionen, '', new Set(['latein']), null, suche)).toBe(optionen)
  })
  it('eigene Fächer auch dort, wo der Wert der Fachname ist (Meine Klassen, Onlinetest)', () => {
    expect(eigeneWerte(['englisch'], [{ value: 'Englisch', label: 'Englisch' }, { value: 'Physik', label: 'Physik' }])).toEqual(['Englisch'])
  })
})

describe('NurExperte und „Alle Optionen"', () => {
  const zeige = (oberflaeche?: 'standard' | 'experte', bereich = true): string => {
    modus = oberflaeche
    const inhalt = [h(NurExperte, { key: 'a', geaendert: 'Fassungen A/B', children: h('span', null, 'FEIN') }), h('span', { key: 'b' }, 'GROB'), h(AlleOptionen, { key: 'c' })]
    return renderToStaticMarkup(h(MantineProvider, null, bereich ? h(OptionenBereich, null, inhalt) : inhalt))
  }
  it('Expertenmodus (auch ohne Angabe – bestehende Nutzer): alles sichtbar, kein Notausgang', () => {
    for (const m of [undefined, 'experte'] as const) {
      const html = zeige(m)
      expect(html).toContain('FEIN')
      expect(html).not.toContain('data-alle-optionen')
    }
  })
  it('Standardmodus: Feineinstellung verborgen, Notausgang da', () => {
    const html = zeige('standard')
    expect(html).not.toContain('FEIN')
    expect(html).toContain('GROB')
    expect(html).toContain('Alle Optionen')
  })
  it('ohne Bereich bleibt alles sichtbar (lieber zu viel als unerreichbar)', () => {
    expect(zeige('standard', false)).toContain('FEIN')
  })
})
