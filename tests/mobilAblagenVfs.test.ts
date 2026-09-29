import { describe, expect, it, vi } from 'vitest'

/*
 * Die Ablage-Prüfungen des PCs noch einmal – gegen das Speicher-Dateisystem der iPad-App
 * (29.09.2026). `fs`, `os` und `path` sind hier dieselben Nachbildungen wie im Mobil-Build
 * (vite.mobil.config.ts): Sichern, Zurücksetzen, Wiederherstellen, Verbrauch, Protokoll und
 * automatische Sicherung müssen darauf genauso laufen wie auf der Festplatte.
 */
vi.mock('fs', async () => await import('../src/mobil/shims/fs'))
vi.mock('node:fs', async () => await import('../src/mobil/shims/fs'))
vi.mock('os', async () => await import('../src/mobil/shims/os'))
vi.mock('path', async () => {
  const p = (await vi.importActual<typeof import('path')>('path')).posix
  return { ...p, default: p }
})

const { vfs } = await import('../src/mobil/vfs/speicher')
vfs.zuruecksetzen()
vfs.einhaengen({ wurzel: '/tmp' })

await import('./wartung.test')
await import('./verlaesslichkeit.test')

describe('Nachbildung wirksam', () => {
  it('schreibt in den Speicher, nicht auf die Festplatte', async () => {
    const fs = await import('fs')
    const echt = await vi.importActual<typeof import('fs')>('fs')
    fs.writeFileSync('/tmp/mobil-probe.txt', 'x')
    expect(fs.existsSync('/tmp/mobil-probe.txt')).toBe(true)
    expect(vfs.istDatei('/tmp/mobil-probe.txt')).toBe(true)
    expect(echt.existsSync('/tmp/mobil-probe.txt')).toBe(false)
  })
})
