import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { ABBRUCH_MELDUNG } from '../src/shared/abbruch'

/**
 * Wache für die Hintergrund-Aufträge der Oberfläche (shared/auftraege.ts, Paket 3):
 * eingefrorene Eingaben, Abbruch ohne Fehlermeldung und ohne Ablage, Ablage im richtigen
 * Dokument – egal, welches gerade offen ist.
 */

// Die KI-Brücke des Hauptprozesses als Attrappe: Antworten kommen erst, wenn der Test es sagt
const offen = new Map<string, { ok: (v: unknown) => void; weg: (e: Error) => void }>()
const abgebrochen: string[] = []
// Bilder: Wie die Bild-KI von OpenAI überhören sie den Abbruch und kommen später trotzdem
const offeneBilder: ((url: string) => void)[] = []
let platz: ((p: { id: string; zustand: 'wartend' | 'laufend'; abgebrochen?: number; abgebrocheneBilder?: number }) => void) | null = null
;(globalThis as unknown as { window: unknown }).window = {
  api: {
    ai: {
      onProgress: () => () => undefined,
      onPlatz: (cb: typeof platz) => {
        platz = cb
        return () => undefined
      },
      structured: (req: StructuredRequest) => new Promise((ok, weg) => offen.set(req.progressId!, { ok, weg })),
      image: () => new Promise<string>((ok) => offeneBilder.push(ok)),
      websuche: async () => [],
      cancel: async (id: string) => {
        abgebrochen.push(id)
        // So antwortet der Hauptprozess auf einen Abbruch: mit der Abbruchmeldung als Fehler
        offen.get(id)?.weg(new Error(ABBRUCH_MELDUNG))
      }
    }
  }
}

const { brichAb, legeAb, setzeFehlerMeldung, starteAuftrag, useAuftraege, versucheErneut, warteGrund } = await import('../src/renderer/src/shared/auftraege')

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
const auftrag = (id?: string) => (id ? useAuftraege.getState().auftraege.find((a) => a.id === id) : useAuftraege.getState().auftraege.at(-1))
const antworte = async (wert: unknown): Promise<void> => {
  await tick()
  const [id, anfrage] = [...offen.entries()].at(-1)!
  offen.delete(id)
  anfrage.ok(wert)
}

const REQ: StructuredRequest = { system: '', user: '', schemaName: 'probe', schema: {} }

beforeEach(() => {
  useAuftraege.setState({ auftraege: [] })
  offen.clear()
  abgebrochen.length = 0
  offeneBilder.length = 0
})

describe('Hintergrund-Aufträge', () => {
  it('arbeitet mit den Eingaben vom Start, auch wenn das Dokument danach geändert wird', async () => {
    const dokument = { thema: 'Igel', teile: [1, 2] }
    const abgelegt: unknown[] = []
    const lauf = starteAuftrag({
      moduleId: 'arbeitsblatt',
      docId: 'd1',
      titel: 'Igel',
      art: 'Probe',
      eingabe: dokument,
      arbeit: async (e, k) => {
        const antwort = await k.ai<{ ok: boolean }>(REQ)
        return { thema: e.thema, teile: e.teile.length, ok: antwort.ok }
      },
      ablegen: async (ergebnis) => {
        abgelegt.push(ergebnis)
      }
    })
    // Die Lehrkraft arbeitet weiter – am selben Objekt
    dokument.thema = 'Fuchs'
    dokument.teile.push(3)
    await antworte({ ok: true })
    await expect(lauf).resolves.toEqual({ thema: 'Igel', teile: 2, ok: true })
    expect(abgelegt).toHaveLength(1)
    expect(auftrag()?.status).toBe('fertig')
    expect(auftrag()?.anteil).toBe(1)
  })

  it('bricht ab: Anfrage im Hauptprozess beendet, nichts abgelegt, keine Fehlermeldung', async () => {
    const meldung = vi.fn()
    setzeFehlerMeldung(meldung)
    const ablegen = vi.fn(async () => undefined)
    const lauf = starteAuftrag({
      moduleId: 'grammatiktest',
      docId: 'd2',
      titel: 'Test',
      art: 'Test erstellen',
      eingabe: {},
      arbeit: (_e, k) => k.ai(REQ),
      ablegen
    })
    await tick()
    await tick()
    const id = auftrag()!.id
    expect(auftrag()?.status).toBe('laufend')
    brichAb(id)
    await expect(lauf).resolves.toBeNull()
    expect(abgebrochen).toHaveLength(1)
    expect(auftrag(id)?.status).toBe('abgebrochen')
    expect(ablegen).not.toHaveBeenCalled()
    expect(meldung).not.toHaveBeenCalled()
  })

  /*
   * Paket 3b: Die Bild-KI von OpenAI nimmt kein Abbruchsignal. Für die Lehrkraft muss der
   * Auftrag trotzdem SOFORT abgebrochen sein – nicht erst, wenn das Bild fertig ist –, und das
   * späte Bild darf nirgends landen.
   */
  it('bricht sofort ab, auch wenn die Anfrage den Abbruch überhört – das späte Ergebnis wird verworfen', async () => {
    const meldung = vi.fn()
    setzeFehlerMeldung(meldung)
    const ablegen = vi.fn(async () => undefined)
    const lauf = starteAuftrag({
      moduleId: 'arbeitsblatt',
      docId: 'd-bild',
      titel: 'Igel',
      art: 'Bild erzeugen',
      eingabe: {},
      arbeit: (_e, k) => k.bild('Ein Igel im Laub'),
      ablegen
    })
    await tick()
    await tick()
    const id = auftrag()!.id
    expect(offeneBilder).toHaveLength(1)
    brichAb(id)
    await tick()
    // Sofort: Das Bild ist noch nicht da, der Auftrag ist trotzdem beendet
    expect(auftrag(id)?.status).toBe('abgebrochen')
    await expect(lauf).resolves.toBeNull()
    expect(abgebrochen).toHaveLength(1)
    offeneBilder.shift()!('data:image/png;base64,spaet')
    await tick()
    await tick()
    expect(auftrag(id)?.status).toBe('abgebrochen')
    expect(ablegen).not.toHaveBeenCalled()
    expect(meldung).not.toHaveBeenCalled()
  })

  it('erklärt das Warten, wenn ein abgebrochener Bildauftrag den Platz noch hält', async () => {
    void starteAuftrag({
      moduleId: 'arbeitsblatt',
      docId: 'd-wartet',
      titel: 'Fuchs',
      art: 'Probe',
      eingabe: {},
      arbeit: (_e, k) => k.ai(REQ),
      ablegen: async () => undefined
    })
    await tick()
    const anfrage = [...offen.keys()].at(-1)!
    platz!({ id: anfrage, zustand: 'wartend', abgebrochen: 0, abgebrocheneBilder: 0 })
    expect(auftrag()?.status).toBe('wartend')
    expect(auftrag()?.wartegrund).toBeUndefined()
    platz!({ id: anfrage, zustand: 'wartend', abgebrochen: 1, abgebrocheneBilder: 1 })
    expect(auftrag()?.wartegrund).toMatch(/abgebrochener Bildauftrag gibt seinen Platz gleich frei/)
    platz!({ id: anfrage, zustand: 'laufend' })
    expect(auftrag()?.status).toBe('laufend')
    expect(auftrag()?.wartegrund).toBeUndefined()
    brichAb(auftrag()!.id)
  })

  it('nennt den Grund passend zu Zahl und Art der abgebrochenen Anfragen', () => {
    expect(warteGrund([{ abgebrochen: 0, bilder: 0 }])).toBeUndefined()
    expect(warteGrund([{ abgebrochen: 1, bilder: 0 }])).toMatch(/ein abgebrochener Auftrag/)
    expect(warteGrund([{ abgebrochen: 2, bilder: 2 }])).toMatch(/abgebrochene Bildaufträge geben ihre Plätze/)
    expect(warteGrund([{ abgebrochen: 2, bilder: 1 }])).toMatch(/abgebrochene Aufträge geben ihre Plätze/)
  })

  it('meldet einen echten Fehler und lässt sich erneut starten – mit denselben Eingaben', async () => {
    const meldung = vi.fn()
    setzeFehlerMeldung(meldung)
    const gesehen: string[] = []
    let versuch = 0
    void starteAuftrag({
      moduleId: 'klassenarbeit',
      docId: 'd3',
      titel: 'Arbeit',
      art: 'Arbeit erzeugen',
      eingabe: { thema: 'Rom' },
      arbeit: async (e) => {
        gesehen.push(e.thema)
        if (++versuch === 1) throw new Error('Limit erreicht (429)')
        return 'ok'
      },
      ablegen: async () => undefined
    })
    await tick()
    await tick()
    const erster = auftrag()!
    expect(erster.status).toBe('fehler')
    expect(erster.fehler).toMatch(/429/)
    expect(meldung).toHaveBeenCalledTimes(1)
    versucheErneut(erster.id)
    await tick()
    await tick()
    expect(auftrag(erster.id)).toBeUndefined()
    expect(auftrag()?.status).toBe('fertig')
    expect(gesehen).toEqual(['Rom', 'Rom'])
  })
})

describe('Ergebnis ablegen', () => {
  const ablage = (istOffen: boolean, gespeichert: { name: string; dok: { a: number; b: string } } | null) => {
    const protokoll: string[] = []
    const gesichert: unknown[] = []
    return {
      protokoll,
      gesichert,
      ablage: {
        istOffen: () => istOffen,
        imOffenen: (f: (d: { a: number; b: string }) => { a: number; b: string }) => protokoll.push(`offen:${JSON.stringify(f({ a: 1, b: 'offen' }))}`),
        laden: async () => {
          if (!gespeichert) throw new Error('nicht da')
          return gespeichert
        },
        speichern: async (id: string, name: string | null, dok: { a: number; b: string }) => {
          gesichert.push({ id, name, dok })
        }
      }
    }
  }
  const einarbeiten = (d: { a: number; b: string }) => ({ ...d, a: 99 })

  it('ändert das offene Dokument (Rückgängig-Schritt) und schreibt nicht an der Bibliothek vorbei', async () => {
    const t = ablage(true, { name: 'X', dok: { a: 0, b: 'gespeichert' } })
    await legeAb(t.ablage, 'd', { a: 0, b: 'schnappschuss' }, einarbeiten)
    expect(t.protokoll).toEqual(['offen:{"a":99,"b":"offen"}'])
    expect(t.gesichert).toEqual([])
  })

  it('arbeitet das Ergebnis in den gespeicherten Stand ein, wenn ein anderes Dokument offen ist – Name und Eingaben bleiben', async () => {
    const t = ablage(false, { name: 'Mein Blatt', dok: { a: 0, b: 'später geändert' } })
    await legeAb(t.ablage, 'd', { a: 0, b: 'schnappschuss' }, einarbeiten)
    expect(t.gesichert).toEqual([{ id: 'd', name: 'Mein Blatt', dok: { a: 99, b: 'später geändert' } }])
  })

  it('nimmt den Schnappschuss, wenn das Dokument noch nie gespeichert war', async () => {
    const t = ablage(false, null)
    await legeAb(t.ablage, 'd', { a: 0, b: 'schnappschuss' }, einarbeiten)
    expect(t.gesichert).toEqual([{ id: 'd', name: null, dok: { a: 99, b: 'schnappschuss' } }])
  })
})
