import { describe, expect, it } from 'vitest'
import { AntwortZuGross, begrenzteAntwort, istLokal, istPrivateAdresse, pruefeZiel, ZielAbgelehnt } from '../src/main/services/netz/zieladresse'

/*
 * Sicherheitsbefund vom 27.09.2026: Adressen aus KI-Antworten oder vom Tablet dürfen weder das
 * eigene Netz erreichen noch beliebig große Antworten in den Speicher laden.
 */

describe('Zielprüfung', () => {
  it('erkennt private und besondere Adressen', () => {
    for (const a of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.178.1',
      '169.254.1.1',
      '0.0.0.0',
      '100.64.0.1',
      '::1',
      'fe80::1',
      'fd00::1',
      '::ffff:192.168.0.1'
    ]) {
      expect(istPrivateAdresse(a), a).toBe(true)
    }
    for (const a of ['8.8.8.8', '172.32.0.1', '91.198.174.192', '2a02:ec80:300:ed1a::1']) expect(istPrivateAdresse(a), a).toBe(false)
  })

  it('weist Rechnernamen des eigenen Netzes ab', () => {
    for (const h of ['localhost', 'drucker', 'router.local', 'nas.home', 'x.internal', '[::1]', '192.168.0.5']) expect(istLokal(h), h).toBe(true)
    for (const h of ['upload.wikimedia.org', 'www.epd-film.de']) expect(istLokal(h), h).toBe(false)
  })

  it('prüft Protokoll, Zugangsdaten, Namen und die aufgelöste Adresse', async () => {
    const oeffentlich = async (): Promise<string[]> => ['91.198.174.192']
    const privat = async (): Promise<string[]> => ['91.198.174.192', '127.0.0.1']
    await expect(pruefeZiel('http://example.org/a', oeffentlich)).rejects.toBeInstanceOf(ZielAbgelehnt)
    await expect(pruefeZiel('https://user:pw@example.org/a', oeffentlich)).rejects.toThrow(/Zugangsdaten/)
    await expect(pruefeZiel('https://localhost/a', oeffentlich)).rejects.toThrow(/eigenen Netz/)
    await expect(pruefeZiel('https://192.168.1.1/a', oeffentlich)).rejects.toThrow(/eigenen Netz/)
    // DNS-Rebinding: der Name klingt harmlos, zeigt aber auf den eigenen Rechner
    await expect(pruefeZiel('https://harmlos.example/a', privat)).rejects.toThrow(/zeigt in das eigene Netz/)
    await expect(pruefeZiel('https://kaputt.example/a', async () => [])).rejects.toThrow(/nicht auflösen/)
    const ok = await pruefeZiel('https://upload.wikimedia.org/x.jpg', oeffentlich)
    expect(ok.hostname).toBe('upload.wikimedia.org')
  })

  it('liest Antworten nur bis zur Grenze', async () => {
    const bytes = (n: number): ArrayBuffer => new Uint8Array(n).fill(7).buffer
    const antwort = (n: number, laenge?: number): Response =>
      new Response(bytes(n), { headers: laenge !== undefined ? { 'content-length': String(laenge) } : {} })
    expect((await begrenzteAntwort(antwort(1000), 2000)).byteLength).toBe(1000)
    await expect(begrenzteAntwort(antwort(3000), 2000)).rejects.toBeInstanceOf(AntwortZuGross)
    // Angekündigte Größe reicht schon
    await expect(begrenzteAntwort(antwort(10, 5_000_000), 2000)).rejects.toBeInstanceOf(AntwortZuGross)
  })
})
