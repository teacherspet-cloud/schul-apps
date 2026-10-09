import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

/*
 * Keine stillen Sicherungslücken mehr (27.09.2026): Lehrwerke, Vokabel-Bibliothek und Maskottchen
 * fehlten jahrelang in der Sicherung, weil beim Anlegen einer neuen Ablage niemand an die Liste in
 * wartung.ts dachte. Dieser Test durchsucht den Hauptprozess nach allen Ablagen unter userData und
 * verlangt, dass jede entweder gesichert wird oder ausdrücklich als „nicht sichern" begründet ist.
 */
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nie-benutzt' } }))
const { SICHERUNG_DATEIEN, SICHERUNG_ORDNER } = await import('../src/main/services/storage/wartung')

/** Absichtlich nicht gesichert – mit Grund */
const NICHT_SICHERN: Record<string, string> = {
  'secrets.json': 'API-Schlüssel stünden in der Sicherung im Klartext',
  'fenster.json': 'Fensterlage dieses Bildschirms',
  sicherungen: 'die Sicherungen selbst',
  'protokoll.log': 'Fehlerprotokoll dieses Rechners',
  'verbrauch.json': 'Verbrauchszählung dieses Rechners',
  'aussprache-woerterbuecher.json': 'Kennungen der Aussprache-Wörterbücher bei ElevenLabs (09.10.2026) – entstehen beim Vertonen von selbst neu',
  ki: 'Server (02.10.2026): Anmeldung der KI-Programme je Nutzer – Zugangsdaten, gehören nie in eine Sicherung'
}

function dateien(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? dateien(p) : p.endsWith('.ts') ? [p] : []
  })
}

describe('Ablagen unter userData', () => {
  it('jede Ablage des Hauptprozesses wird gesichert oder ist begründet ausgenommen', () => {
    const gefunden = new Set<string>()
    for (const f of dateien('src/main')) {
      const text = readFileSync(f, 'utf8')
      for (const m of text.matchAll(/getPath\('userData'\),\s*'([^']+)'/g)) gefunden.add(m[1])
      for (const m of text.matchAll(/(?:readJson|writeJson)(?:<[^>]*>)?\('([^']+)'/g)) gefunden.add(m[1])
      for (const m of text.matchAll(/const [A-Z_]*FILE[A-Z_]* = '([^']+\.json)'/g)) gefunden.add(m[1])
    }
    expect(gefunden.size).toBeGreaterThan(8)
    const bekannt = new Set([...SICHERUNG_ORDNER(), ...SICHERUNG_DATEIEN(), ...Object.keys(NICHT_SICHERN)])
    const fehlt = [...gefunden].filter((n) => !bekannt.has(n))
    expect(fehlt, `Nicht in der Sicherung und nicht begründet ausgenommen: ${fehlt.join(', ')}`).toEqual([])
  })
})
