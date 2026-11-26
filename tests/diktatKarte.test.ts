import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import DiktatKarte from '../src/renderer/src/modules/arbeitsblatt/steps/DiktatKarte'
import { DIKTAT_SCHWERPUNKTE, STANDARD_DIKTAT } from '../src/renderer/src/modules/arbeitsblatt/didactics/diktat'

describe('Diktat-Einstellungen (26.11.2026)', () => {
  it('zeigt Form, alle Schwerpunkte als Mehrfachauswahl, Wortzahl und Zusätze', () => {
    const html = renderToStaticMarkup(
      createElement(MantineProvider, null, createElement(DiktatKarte, { setup: { ...STANDARD_DIKTAT, schwerpunkte: ['auslaut'] }, klasse: 5, onChange: () => undefined }))
    )
    expect(html).toContain('Rechtschreibschwerpunkte (mehrere möglich)')
    expect(html.match(/data-diktat-schwerpunkt=/g)).toHaveLength(DIKTAT_SCHWERPUNKTE.length)
    expect(html).toContain('etwa 135 Wörter')
    expect(html).toContain('Berichtigungsbogen')
  })
})
