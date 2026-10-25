/**
 * Darstellung speichern (25.10.2026, Befund der Lehrkraft): „Wie Windows" sprang auf „Dunkel", „Frisch" auf „Abendrot".
 * Die Einmal-Umstellungen (dunkel 05.10., Abendrot 20.10.2026) dürfen nur beim ersten Laden alter Einstellungen
 * greifen, nicht bei jedem Speichern eines Patches ohne die Marken.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

const ORDNER = mkdtempSync(join(tmpdir(), 'schulapps-marken-'))
vi.mock('electron', () => ({ app: { getPath: () => join(ORDNER, 'nutzer') } }))
const einstellungen = await import('../src/main/services/storage/settings')

afterAll(() => rmSync(ORDNER, { recursive: true, force: true }))

describe('Darstellung bleibt, wie gewählt', () => {
  it('„Wie Windows" und „Frisch" überleben das Speichern und spätere Patches', () => {
    einstellungen.setSettings({ appearance: { colorScheme: 'auto' } })
    expect(einstellungen.getSettings().appearance.colorScheme).toBe('auto')
    einstellungen.setSettings({ appearance: { theme: 'teal' } })
    expect(einstellungen.getSettings().appearance.theme).toBe('teal')
    expect(einstellungen.getSettings().appearance.colorScheme).toBe('auto')
    // Ein Patch an anderer Stelle darf die Darstellung nicht zurücksetzen
    einstellungen.setSettings({ oberflaeche: 'experte' })
    expect(einstellungen.getSettings().appearance).toMatchObject({ colorScheme: 'auto', theme: 'teal', dunkelVorgabe: true, abendrotVorgabe: true })
  })
})
