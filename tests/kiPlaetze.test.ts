import { describe, expect, it } from 'vitest'
import { KiPlaetze } from '../src/main/services/ai/kiPlaetze'
import { ABBRUCH_MELDUNG, istAbbruch } from '../src/shared/abbruch'

/**
 * Wache für die gemeinsame Begrenzung der KI-Anfragen (Paket 3, 25.09.2026):
 * höchstens drei zugleich über ALLE Wege, wer wartet, wird gemeldet, und jede Anfrage lässt
 * sich abbrechen – wartend wie laufend.
 */

/** Eine Arbeit, die erst endet, wenn der Test es sagt */
function steuerbar<T = string>(): {
  arbeit: (signal: AbortSignal) => Promise<T>
  fertig: (w: T) => void
  signal: () => AbortSignal | undefined
  gestartet: () => boolean
} {
  let aufloesen: ((w: T) => void) | null = null
  let sig: AbortSignal | undefined
  let los = false
  return {
    arbeit: (signal) => {
      los = true
      sig = signal
      return new Promise<T>((ok) => (aufloesen = ok))
    },
    fertig: (w) => aufloesen?.(w),
    signal: () => sig,
    gestartet: () => los
  }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('KI-Plätze: höchstens drei zugleich', () => {
  it('startet die vierte Anfrage erst, wenn eine fertig ist, und meldet das Warten', async () => {
    const meldungen: string[] = []
    const plaetze = new KiPlaetze(3, (id, zustand) => meldungen.push(`${id}:${zustand}`))
    const a = [steuerbar(), steuerbar(), steuerbar(), steuerbar()]
    const laeufe = a.map((s, i) => plaetze.platz(`r${i}`, s.arbeit))
    await tick()
    expect(a.map((s) => s.gestartet())).toEqual([true, true, true, false])
    expect(plaetze.stand()).toEqual({ laufend: 3, wartend: 1 })
    expect(meldungen).toContain('r3:wartend')
    a[1].fertig('eins')
    await expect(laeufe[1]).resolves.toBe('eins')
    await tick()
    expect(a[3].gestartet()).toBe(true)
    expect(meldungen).toContain('r3:laufend')
    a[0].fertig('x')
    a[2].fertig('x')
    a[3].fertig('drei')
    await expect(laeufe[3]).resolves.toBe('drei')
    expect(plaetze.stand()).toEqual({ laufend: 0, wartend: 0 })
  })

  it('bedient Wartende der Reihe nach', async () => {
    const plaetze = new KiPlaetze(1)
    const reihenfolge: number[] = []
    const erste = steuerbar()
    const lauf1 = plaetze.platz('a', erste.arbeit)
    const spaeter = [1, 2, 3].map((n) =>
      plaetze.platz(`w${n}`, async () => {
        reihenfolge.push(n)
        return n
      })
    )
    await tick()
    erste.fertig('ok')
    await lauf1
    await Promise.all(spaeter)
    expect(reihenfolge).toEqual([1, 2, 3])
  })
})

describe('KI-Plätze: abbrechen', () => {
  it('nimmt eine wartende Anfrage aus der Schlange, ohne sie je zu starten', async () => {
    const plaetze = new KiPlaetze(1)
    const erste = steuerbar()
    const wartende = steuerbar()
    const lauf1 = plaetze.platz('a', erste.arbeit)
    const lauf2 = plaetze.platz('b', wartende.arbeit)
    await tick()
    expect(plaetze.abbrechen('b')).toBe(true)
    await expect(lauf2).rejects.toThrow(ABBRUCH_MELDUNG)
    expect(plaetze.stand().wartend).toBe(0)
    erste.fertig('ok')
    await lauf1
    expect(wartende.gestartet()).toBe(false)
  })

  it('gibt einer laufenden Anfrage das Signal und endet sofort mit dem Abbruch – auch wenn der Anbieter anders scheitert', async () => {
    const plaetze = new KiPlaetze(3)
    const s = steuerbar()
    const lauf = plaetze.platz('x', s.arbeit)
    await tick()
    plaetze.abbrechen('x')
    expect(s.signal()?.aborted).toBe(true)
    const fehler = await lauf.catch((e) => e)
    expect(istAbbruch(fehler)).toBe(true)
  })

  it('hält den Platz, bis die abgebrochene Arbeit wirklich endet', async () => {
    const plaetze = new KiPlaetze(1)
    const s = steuerbar()
    const lauf = plaetze.platz('x', s.arbeit)
    const naechste = steuerbar()
    const lauf2 = plaetze.platz('y', naechste.arbeit)
    await tick()
    plaetze.abbrechen('x')
    await lauf.catch(() => undefined)
    await tick()
    // Der Anbieter arbeitet noch – der nächste darf noch nicht los
    expect(naechste.gestartet()).toBe(false)
    s.fertig('verworfen')
    await tick()
    await tick()
    expect(naechste.gestartet()).toBe(true)
    naechste.fertig('ok')
    await expect(lauf2).resolves.toBe('ok')
  })

  it('merkt sich einen Abbruch, der vor der Anfrage ankommt', async () => {
    const plaetze = new KiPlaetze(3)
    expect(plaetze.abbrechen('spaet')).toBe(false)
    const s = steuerbar()
    await expect(plaetze.platz('spaet', s.arbeit)).rejects.toThrow(ABBRUCH_MELDUNG)
    expect(s.gestartet()).toBe(false)
  })

  /*
   * Paket 3b: Die Bild-KI von OpenAI überhört den Abbruch. Die Anfrage endet für die
   * Oberfläche sofort, der Platz bleibt belegt – und wer deshalb wartet, erfährt es.
   */
  it('sagt Wartenden, dass ein abgebrochenes Bild den Platz noch hält, und gibt ihn danach frei', async () => {
    const meldungen: Record<string, unknown>[] = []
    const plaetze = new KiPlaetze(1, (id, zustand, info) => meldungen.push({ id, zustand, ...info }))
    // `steuerbar` beachtet das Signal nicht – genau wie der Anbieter
    const bild = steuerbar()
    const lauf = plaetze.platz('b', bild.arbeit, 'bild')
    const text = steuerbar()
    const lauf2 = plaetze.platz('t', text.arbeit)
    await tick()
    expect(meldungen.at(-1)).toEqual({ id: 't', zustand: 'wartend', abgebrochen: 0, abgebrocheneBilder: 0 })
    plaetze.abbrechen('b')
    await expect(lauf).rejects.toThrow(ABBRUCH_MELDUNG)
    expect(meldungen.at(-1)).toEqual({ id: 't', zustand: 'wartend', abgebrochen: 1, abgebrocheneBilder: 1 })
    expect(text.gestartet()).toBe(false)
    bild.fertig('spätes Bild')
    await tick()
    await tick()
    expect(text.gestartet()).toBe(true)
    expect(meldungen.at(-1)).toMatchObject({ id: 't', zustand: 'laufend' })
    text.fertig('ok')
    await expect(lauf2).resolves.toBe('ok')
    expect(plaetze.stand()).toEqual({ laufend: 0, wartend: 0 })
  })

  it('erkennt den Abbruch auch am bloßen Meldungstext (so kommt er über die Brücke an)', () => {
    expect(istAbbruch(new Error(ABBRUCH_MELDUNG))).toBe(true)
    expect(istAbbruch(new Error('Anthropic: Limit erreicht (429).'))).toBe(false)
  })
})
