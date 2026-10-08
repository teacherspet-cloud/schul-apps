import { describe, expect, it, vi } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { REST_TAKT_MS, ruhigesZiel } from '../src/renderer/src/shared/restzeit'

/*
 * Ruhiger KI-Stand (08.10.2026, Befund der Lehrkraft): Die Plakette am Reihen-Schritt sprang zwischen „Wartet – Platz 2"
 * und „Entsteht …" hin und her, die Restzeit bei jeder Schätzung. Jetzt: „Wartet" nur vor der ersten Anfrage, danach
 * bleibt es bei „Entsteht" mit leisem Hinweis; die Restzeit folgt nur deutlichen Änderungen oder alle 10 Sekunden.
 */
const speicher = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k)
})
const offen = new Map<string, (v: unknown) => void>()
let platz: ((p: { id: string; zustand: 'wartend' | 'laufend'; platz?: number }) => void) | null = null
;(globalThis as unknown as { window: unknown }).window = {
  api: {
    ai: {
      onProgress: () => () => undefined,
      onPlatz: (cb: typeof platz) => {
        platz = cb
        return () => undefined
      },
      structured: (req: StructuredRequest) => new Promise((ok) => offen.set(req.progressId!, ok)),
      image: () => new Promise<string>(() => undefined),
      websuche: async () => [],
      cancel: async () => undefined
    }
  }
}

const { starteAuftrag, useAuftraege, wartetKurz, wartetVorStart } = await import('../src/renderer/src/shared/auftraege')
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
const auftrag = () => useAuftraege.getState().auftraege.at(-1)!
const REQ: StructuredRequest = { system: '', user: '', schemaName: 'probe', schema: {} }

describe('Stand eines Auftrags', () => {
  it('„Wartet – Platz n" nur vor der ersten Anfrage, danach „Entsteht" mit kurzem Warten', async () => {
    const lauf = starteAuftrag({
      moduleId: 'unterrichtsreihe',
      docId: 'r1',
      titel: 'Schritt',
      art: 'Probe',
      eingabe: {},
      sperrt: false,
      arbeit: async (_e, k) => {
        await k.ai(REQ)
        await k.ai({ ...REQ, schemaName: 'zweite' })
        return 'ok'
      },
      ablegen: async () => undefined
    })
    await tick()
    const [erste, antwort1] = [...offen.entries()].at(-1)!
    platz!({ id: erste, zustand: 'wartend', platz: 2 })
    expect(wartetVorStart(auftrag())).toBe(true)
    expect(auftrag().platz).toBe(2)
    platz!({ id: erste, zustand: 'laufend' })
    expect(auftrag().status).toBe('laufend')
    expect(auftrag().gestartet).toBe(true)
    offen.delete(erste)
    antwort1({ ok: true })
    await tick()
    await tick()
    const [zweite, antwort2] = [...offen.entries()].at(-1)!
    expect(zweite).not.toBe(erste)
    platz!({ id: zweite, zustand: 'wartend', platz: 1 })
    // Wartet wieder auf einen Platz – aber der Auftrag hat schon gearbeitet: kein „Wartet – Platz 1"
    expect(auftrag().status).toBe('wartend')
    expect(wartetVorStart(auftrag())).toBe(false)
    expect(wartetKurz(auftrag())).toBe(true)
    platz!({ id: zweite, zustand: 'laufend' })
    expect(wartetKurz(auftrag())).toBe(false)
    antwort2({ ok: true })
    await lauf
    expect(auftrag().status).toBe('fertig')
  })

  it('kein Aufblitzen von „laufend", solange eine neue Anfrage noch nicht gemeldet ist', async () => {
    offen.clear()
    const lauf = starteAuftrag({
      moduleId: 'unterrichtsreihe',
      docId: 'r2',
      titel: 'Schritt',
      art: 'Probe',
      eingabe: {},
      sperrt: false,
      arbeit: async (_e, k) => {
        await Promise.all([k.ai(REQ), new Promise((r) => setTimeout(r, 5)).then(() => k.ai({ ...REQ, schemaName: 'b' }))])
        return 'ok'
      },
      ablegen: async () => undefined
    })
    await tick()
    const [a, okA] = [...offen.entries()].at(-1)!
    platz!({ id: a, zustand: 'wartend', platz: 3 })
    expect(auftrag().status).toBe('wartend')
    // Zweite Anfrage kommt dazu – noch ohne Meldung des Hauptprozesses: bleibt „wartend"
    await new Promise((r) => setTimeout(r, 10))
    expect(offen.size).toBe(2)
    expect(auftrag().status).toBe('wartend')
    const b = [...offen.keys()].find((k) => k !== a)!
    platz!({ id: b, zustand: 'laufend' })
    expect(auftrag().status).toBe('laufend')
    for (const [id, ok] of [...offen]) if (id !== a) ok({})
    platz!({ id: a, zustand: 'laufend' })
    okA({})
    await lauf
  })
})

describe('Ruhige Restzeit', () => {
  it('kleine Änderungen erst nach 10 Sekunden, deutliche sofort (geglättet)', () => {
    const nun = 1_000_000
    const erst = ruhigesZiel(undefined, nun + 120_000, nun)
    expect(erst.ziel).toBe(nun + 120_000)
    // 10 % mehr nach 2 s: bleibt
    expect(ruhigesZiel(erst, nun + 2000 + 130_000, nun + 2000)).toBe(erst)
    // 10 % mehr nach 10 s: folgt geglättet
    const spaeter = ruhigesZiel(erst, nun + REST_TAKT_MS + 130_000, nun + REST_TAKT_MS)
    expect(spaeter.ziel).toBeGreaterThan(erst.ziel)
    expect(spaeter.ziel).toBeLessThan(nun + REST_TAKT_MS + 130_000)
    expect(spaeter.seit).toBe(nun + REST_TAKT_MS)
    // Doppelt so lange nach 1 s: deutlich – folgt sofort
    const deutlich = ruhigesZiel(erst, nun + 1000 + 240_000, nun + 1000)
    expect(deutlich.ziel).toBeGreaterThan(erst.ziel)
  })
})
