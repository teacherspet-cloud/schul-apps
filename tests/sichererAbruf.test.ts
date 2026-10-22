import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { pruefendesLookup, sichererAbruf } from '../src/server/sichererAbruf'

/*
 * DNS-Rebinding (22.10.2026, offener Punkt der KI-Sicherheitsprüfung): Die Namensauflösung der Verbindung selbst lehnt
 * interne Ziele ab – auch wenn ein Name bei der Vorprüfung noch auf eine öffentliche Adresse zeigte.
 */
describe('Abruf mit prüfender Namensauflösung', () => {
  const auflösen = (adressen: { address: string; family: number }[]) =>
    ((_h: string, _o: unknown, cb: (e: Error | null, l: unknown) => void) => cb(null, adressen)) as never

  it('interne Adresse bei der Verbindung → abgelehnt; öffentliche → durchgelassen', async () => {
    const ergebnis = (adressen: { address: string; family: number }[], all = false) =>
      new Promise<{ err: string | null; adr: unknown }>((ok) =>
        pruefendesLookup('ki.example', { all }, (err, adr) => ok({ err: err?.message ?? null, adr }), auflösen(adressen))
      )
    expect((await ergebnis([{ address: '10.0.0.5', family: 4 }])).err).toMatch(/interne Adressen/)
    expect((await ergebnis([{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }])).err).toMatch(/interne/)
    const offen = await ergebnis([{ address: '93.184.216.34', family: 4 }])
    expect(offen.err).toBeNull()
    expect(offen.adr).toBe('93.184.216.34')
    expect((await ergebnis([{ address: '93.184.216.34', family: 4 }], true)).adr).toEqual([{ address: '93.184.216.34', family: 4 }])
  })

  it('ein Name, der auf 127.0.0.1 zeigt, wird beim echten Abruf abgelehnt', async () => {
    const srv = createServer((_q, r) => r.end('geheim'))
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
    const port = (srv.address() as AddressInfo).port
    try {
      await expect(sichererAbruf(`http://localhost:${port}/`)).rejects.toThrow(/interne Adressen/)
    } finally {
      srv.close()
    }
  })
})
