import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { ABBRUCH_MELDUNG } from '../src/shared/abbruch'
import { leseVerlauf, vergissVerlauf } from '../src/renderer/src/shared/restzeit'

// Verlauf der Dauern (Restzeit) landet im lokalen Speicher – hier eine Attrappe
const speicher = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k)
})

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
  vergissVerlauf()
})

describe('Restzeit: Der Auftrag lernt aus seinem Lauf', () => {
  it('merkt sich Dauer, Umfang und Mischung der Anfragen – aber nur von fertigen Aufträgen', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    try {
      const lauf = starteAuftrag({
        moduleId: 'arbeitsblatt',
        docId: 'd-lern',
        titel: 'Igel',
        art: 'Probe planen',
        eingabe: {},
        arbeit: async (_e, k) => {
          k.melde('Los', 0, 3)
          await k.ai(REQ)
          await k.ai({ ...REQ, schemaName: 'zweite' })
          return 'fertig'
        },
        ablegen: async () => undefined
      })
      await tick()
      vi.advanceTimersByTime(4000)
      await antworte({ ok: true })
      // Erst nach einem weiteren Umlauf hat der Auftrag die zweite Anfrage gestellt
      await tick()
      vi.advanceTimersByTime(6000)
      await antworte({ ok: true })
      await lauf
      const v = leseVerlauf()
      const probe = v.auftraege['Probe planen']
      expect(probe).toHaveLength(1)
      expect(probe[0].umfang).toBe(3)
      expect(probe[0].mix).toEqual({ probe: 1, zweite: 1 })
      expect(probe[0].ms).toBeGreaterThanOrEqual(10000)
      expect(probe[0].ki).toMatch(/^openai:/)
      // Je Anfrageart und KI die Dauer
      const anfrageArten = Object.keys(v.anfragen)
      expect(anfrageArten.some((k) => k.startsWith('probe@openai:'))).toBe(true)
      expect(anfrageArten.some((k) => k.startsWith('zweite@openai:'))).toBe(true)
      expect(
        Object.values(v.anfragen)
          .flat()
          .map((p) => p.ms)
      ).toEqual([4000, 6000])
      // Der fertige Auftrag zeigt keine Restzeit mehr
      expect(auftrag()!.restBis).toBeUndefined()

      // Ein Abbruch lehrt nichts
      starteAuftrag({
        moduleId: 'arbeitsblatt',
        docId: 'd-abbruch',
        titel: 'Igel',
        art: 'Probe planen',
        eingabe: {},
        arbeit: async (_e, k) => k.ai(REQ),
        ablegen: async () => undefined
      })
      await tick()
      brichAb(auftrag()!.id)
      await tick()
      expect(leseVerlauf().auftraege['Probe planen']).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('zeigt mit Verlauf schon vor dem ersten Zeichen eine Restzeit', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    try {
      // Erster Lauf: 4 s je Anfrage
      const erster = starteAuftrag({
        moduleId: 'arbeitsblatt',
        docId: 'a',
        titel: 'x',
        art: 'Probe planen',
        eingabe: {},
        arbeit: async (_e, k) => k.ai(REQ),
        ablegen: async () => undefined
      })
      await tick()
      vi.advanceTimersByTime(4000)
      await antworte({ ok: true })
      await erster
      // Zweiter Lauf: Sofort steht eine Zahl da – ohne Fortschritt auf dem Balken
      starteAuftrag({
        moduleId: 'arbeitsblatt',
        docId: 'b',
        titel: 'x',
        art: 'Probe planen',
        eingabe: {},
        arbeit: async (_e, k) => k.ai(REQ),
        ablegen: async () => undefined
      })
      await tick()
      vi.advanceTimersByTime(1000)
      await tick()
      const a = auftrag()!
      expect(a.anteil).toBe(0)
      expect(a.restBis).toBeDefined()
      expect(a.restBis! - Date.now()).toBeGreaterThan(1000)
      expect(a.restBis! - Date.now()).toBeLessThanOrEqual(4000)
      // Läuft es länger als alle gemerkten Läufe, sagt der Auftrag das statt einer erfundenen Zahl
      vi.advanceTimersByTime(20000)
      await tick()
      expect(auftrag()!.restLage).toBe('laenger')
      await antworte({ ok: true })
    } finally {
      vi.useRealTimers()
    }
  })

  it('Wartezeit auf einen Platz zählt nicht als Arbeitszeit (Befund 07.10.2026)', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    try {
      // Erster Lauf ohne Warten: 30 s Arbeit
      const erster = starteAuftrag({
        moduleId: 'arbeitsblatt',
        docId: 'w1',
        titel: 'x',
        art: 'Probe warten',
        eingabe: {},
        arbeit: async (_e, k) => k.ai(REQ),
        ablegen: async () => undefined
      })
      await tick()
      vi.advanceTimersByTime(30000)
      await antworte({ ok: true })
      await erster
      // Zweiter Lauf: 30 Minuten in der Warteschlange, dann 5 s Arbeit
      const zweiter = starteAuftrag({
        moduleId: 'arbeitsblatt',
        docId: 'w2',
        titel: 'x',
        art: 'Probe warten',
        eingabe: {},
        arbeit: async (_e, k) => k.ai(REQ),
        ablegen: async () => undefined
      })
      await tick()
      const id = [...offen.keys()].at(-1)!
      platz!({ id, zustand: 'wartend' })
      vi.advanceTimersByTime(30 * 60_000 + 1000)
      await tick()
      expect(auftrag()!.status).toBe('wartend')
      platz!({ id, zustand: 'laufend' })
      vi.advanceTimersByTime(5000)
      await tick()
      const rest = auftrag()!.restBis! - Date.now()
      // Rest = gemerkte 30 s minus 5 s Arbeit – nicht „länger als je" und keine 20 Minuten
      expect(auftrag()!.restLage).toBeUndefined()
      expect(rest).toBeGreaterThan(10_000)
      expect(rest).toBeLessThanOrEqual(30_000)
      vi.advanceTimersByTime(5000)
      await antworte({ ok: true })
      await zweiter
      // Gelernt werden nur die 10 s Arbeit, nicht die halbe Stunde Warten
      const anfragen = Object.entries(leseVerlauf().anfragen).find(([k]) => k.startsWith('probe@'))![1]
      expect(anfragen.map((p) => p.ms)).toEqual([30000, 10000])
      const auftraege = leseVerlauf().auftraege['Probe warten']
      expect(auftraege[1].ms).toBeLessThan(60_000)
    } finally {
      vi.useRealTimers()
    }
  })
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

describe('Sichtbar warten (k.pausiere, 06.10.2026)', () => {
  it('steht als „wartend" mit Grund in der Leiste und läuft danach weiter', async () => {
    let weiter: () => void = () => undefined
    const lauf = starteAuftrag({
      moduleId: 'vokabelliste',
      docId: 'd-warten',
      titel: 'Unit 1',
      art: 'Aussprache erzeugen',
      eingabe: {},
      sperrt: false,
      arbeit: async (_e, k) => {
        await k.pausiere('Die Sprach-KI ist ausgelastet – wartet bis 14:35', new Promise<void>((ok) => (weiter = ok)))
        k.melde('Weiter')
        return 1
      },
      ablegen: async () => undefined
    })
    await tick()
    await tick()
    expect(auftrag()?.status).toBe('wartend')
    expect(auftrag()?.wartegrund).toBe('Die Sprach-KI ist ausgelastet – wartet bis 14:35')
    weiter()
    await expect(lauf).resolves.toBe(1)
    expect(auftrag()?.status).toBe('fertig')
  })

  it('ein Abbruch beendet das Warten sofort', async () => {
    const lauf = starteAuftrag({
      moduleId: 'vokabelliste',
      docId: 'd-warten-ab',
      titel: 'Unit 2',
      art: 'Aussprache erzeugen',
      eingabe: {},
      sperrt: false,
      arbeit: async (_e, k) => k.pausiere('wartet', new Promise<number>(() => undefined)),
      ablegen: async () => undefined
    })
    await tick()
    await tick()
    brichAb(auftrag()!.id)
    await expect(lauf).resolves.toBeNull()
    expect(auftrag()?.status).toBe('abgebrochen')
  })
})
