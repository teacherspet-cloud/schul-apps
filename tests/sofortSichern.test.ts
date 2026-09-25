import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dokumentName, sichereAlles, verzoegerteSicherung } from '../src/renderer/src/shared/autosave'

/*
 * Anstehende Sicherungen werden sofort ausgeführt statt verworfen.
 *
 * Anlass (25.09.2026): Jedes Programm sicherte mit ein bis zweieinhalb Sekunden Verzögerung.
 * Wer in dieser Zeit „Neu …" drückte, ein anderes Dokument öffnete, das Programm wechselte
 * oder das Fenster schloss, verlor die letzte Änderung – die wartende Sicherung wurde beim
 * Aufräumen einfach gelöscht.
 */

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('Verzögertes Sichern', () => {
  it('sichert nach der Wartezeit genau einmal, auch bei vielen Änderungen', async () => {
    const speichern = vi.fn(async () => undefined)
    const s = verzoegerteSicherung(speichern, () => undefined)
    s.plane(1500)
    s.plane(1500)
    s.plane(1500)
    await vi.advanceTimersByTimeAsync(1499)
    expect(speichern).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(speichern).toHaveBeenCalledTimes(1)
    s.beende()
  })

  it('sichereAlles führt Anstehendes SOFORT aus', async () => {
    const speichern = vi.fn(async () => undefined)
    const s = verzoegerteSicherung(speichern, () => undefined)
    s.plane(1500)
    await sichereAlles()
    expect(speichern).toHaveBeenCalledTimes(1)
    // Danach steht nichts mehr an – die Wartezeit löst keinen zweiten Lauf aus
    await vi.advanceTimersByTimeAsync(2000)
    expect(speichern).toHaveBeenCalledTimes(1)
    s.beende()
  })

  it('sichereAlles wartet, bis das Speichern wirklich fertig ist', async () => {
    let fertig = false
    const s = verzoegerteSicherung(
      async () => {
        await new Promise((r) => setTimeout(r, 300))
        fertig = true
      },
      () => undefined
    )
    s.plane(1500)
    const alles = sichereAlles()
    await vi.advanceTimersByTimeAsync(300)
    await alles
    expect(fertig).toBe(true)
    s.beende()
  })

  it('ohne Anstehendes tut sichereAlles nichts', async () => {
    const speichern = vi.fn(async () => undefined)
    const s = verzoegerteSicherung(speichern, () => undefined)
    await sichereAlles()
    expect(speichern).not.toHaveBeenCalled()
    s.beende()
  })

  it('beim Abmelden wird Anstehendes gesichert, nicht verworfen', async () => {
    const speichern = vi.fn(async () => undefined)
    const s = verzoegerteSicherung(speichern, () => undefined)
    s.plane(1500)
    s.beende()
    await vi.advanceTimersByTimeAsync(0)
    expect(speichern).toHaveBeenCalledTimes(1)
    // Abgemeldet: sichereAlles kennt sie nicht mehr
    s.plane(1500)
    await sichereAlles()
    expect(speichern).toHaveBeenCalledTimes(1)
  })

  it('läuft nie doppelt gleichzeitig – sonst entstünden zwei Bibliothekseinträge', async () => {
    let gleichzeitig = 0
    let hoechstens = 0
    const s = verzoegerteSicherung(
      async () => {
        gleichzeitig++
        hoechstens = Math.max(hoechstens, gleichzeitig)
        await new Promise((r) => setTimeout(r, 100))
        gleichzeitig--
      },
      () => undefined
    )
    s.plane(10)
    await vi.advanceTimersByTimeAsync(10) // erster Lauf beginnt
    s.plane(10)
    const alles = sichereAlles() // zweiter Lauf, während der erste noch schreibt
    await vi.advanceTimersByTimeAsync(300)
    await alles
    expect(hoechstens).toBe(1)
    s.beende()
  })

  it('ein Fehler beim Sichern hält die übrigen nicht auf', async () => {
    const fehler = vi.fn()
    const kaputt = verzoegerteSicherung(async () => {
      throw new Error('Platte voll')
    }, fehler)
    const gut = vi.fn(async () => undefined)
    const heil = verzoegerteSicherung(gut, () => undefined)
    kaputt.plane(1000)
    heil.plane(1000)
    await sichereAlles()
    expect(fehler).toHaveBeenCalledTimes(1)
    expect(gut).toHaveBeenCalledTimes(1)
    kaputt.beende()
    heil.beende()
  })
})

describe('Name eines Entwurfs', () => {
  it('wandert mit dem Thema mit, solange niemand ihn geändert hat', () => {
    // Erste Sicherung beim Tippen: „Photo"
    const erster = dokumentName('d1', '', 'Photo')
    expect(erster).toBe('Photo')
    // Nächste Sicherung: gespeichert ist „Photo", das Thema heißt inzwischen „Photosynthese"
    expect(dokumentName('d1', erster, 'Photosynthese')).toBe('Photosynthese')
  })

  it('ein selbst vergebener Name bleibt', () => {
    dokumentName('d2', '', 'Photo')
    expect(dokumentName('d2', 'Biologie 7b – Einstieg', 'Photosynthese')).toBe('Biologie 7b – Einstieg')
  })
})
