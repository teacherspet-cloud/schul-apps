import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'

/*
 * Netzzugang beim Start (30.09.2026). Die Lehrkraft: „Der Netzzugang ist nach jedem Neustart
 * aus." Jetzt schaltet er sich wieder ein, sobald er einmal eingerichtet war – abschaltbar. Ein
 * PC, an dem nie jemand den Zugang eingeschaltet hat, öffnet weiterhin keinen Port. Und der Port
 * bleibt stabil: Ist er beim Start kurz belegt (Rest des eigenen Servers), wird gewartet statt
 * auf einen anderen auszuweichen – auf ihn zeigen die Adresse im iPad und die Firewall-Freigabe.
 */
vi.mock('electron', () => ({ app: { getVersion: () => '9.9.9-test' } }))

const { lanBeimStart, startLan, stopLan } = await import('../src/main/services/lanServer')

afterEach(() => stopLan())

describe('Netzzugang beim Programmstart', () => {
  it('bleibt aus, solange er nie eingerichtet wurde', () => {
    expect(lanBeimStart(undefined)).toBe(false)
    expect(lanBeimStart({ pin: '123456' })).toBe(false)
  })

  it('geht an, sobald er einmal lief oder zuletzt lief', () => {
    expect(lanBeimStart({ pin: '123456', eingerichtet: true })).toBe(true)
    expect(lanBeimStart({ pin: '123456', zuletztAn: true })).toBe(true)
    // Auch nach dem Ausschalten per Schalter: eingerichtet ist eingerichtet
    expect(lanBeimStart({ pin: '123456', eingerichtet: true, zuletztAn: false })).toBe(true)
  })

  it('folgt der ausdrücklichen Einstellung', () => {
    expect(lanBeimStart({ pin: '123456', eingerichtet: true, autoStart: false })).toBe(false)
    expect(lanBeimStart({ pin: '123456', autoStart: true })).toBe(true)
  })

  it('startet nie ohne gültige PIN', () => {
    expect(lanBeimStart({ pin: '', autoStart: true })).toBe(false)
    expect(lanBeimStart({ pin: '12', eingerichtet: true })).toBe(false)
  })
})

describe('Port bleibt stabil', () => {
  it('wartet kurz auf den gewünschten Port, wenn er gerade noch belegt ist', async () => {
    // Einen freien Port suchen und kurz selbst belegen – wie ein Rest des eigenen Servers
    const belegt = createServer()
    await new Promise<void>((ok) => belegt.listen(0, '0.0.0.0', ok))
    const port = (belegt.address() as { port: number }).port
    setTimeout(() => belegt.close(), 900)
    const stand = await startLan({ port, pin: '135790', wurzel: tmpdir(), aufruf: async () => null })
    expect(stand.port).toBe(port)
    expect(stand.wunschPort).toBe(port)
  })

  it('weicht aus, wenn der Port dauerhaft belegt ist – und sagt es', async () => {
    const belegt = createServer()
    await new Promise<void>((ok) => belegt.listen(0, '0.0.0.0', ok))
    const port = (belegt.address() as { port: number }).port
    try {
      const stand = await startLan({ port, pin: '135790', wurzel: tmpdir(), aufruf: async () => null })
      expect(stand.port).not.toBe(port)
      expect(stand.wunschPort).toBe(port)
    } finally {
      belegt.close()
    }
  })
})
