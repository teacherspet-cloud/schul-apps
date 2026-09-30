import { describe, expect, it, vi } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'

/*
 * Nach einem Neustart der iPad-App fortsetzen (30.09.2026, shared/auftraege.ts).
 *
 * Wunsch der Lehrkraft: Laufende oder fertige Aufträge, die vom iPad aus aufgegeben wurden,
 * sollen nach einer Unterbrechung abgerufen und im richtigen Dokument abgelegt werden. Die iPad-App
 * merkt sich jeden laufenden Auftrag; nach dem Neustart startet sie ihn mit denselben Eingaben neu
 * (dieselben KI-Anfragen finden ihren Auftrag am PC wieder, mobil/pcKi.ts) oder zeigt ihn als
 * unterbrochen, wenn das Programm ihn nicht fortsetzen kann.
 */
const speicher = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k)
})

const offen = new Map<string, { ok: (v: unknown) => void }>()
let verbindung: ((v: { id: string; zustand: 'unterbrochen' | 'verbunden' | 'wiederholt' }) => void) | null = null
;(globalThis as unknown as { window: unknown }).window = {
  __plattform: 'ios',
  api: {
    ai: {
      onProgress: () => () => undefined,
      onPlatz: () => () => undefined,
      onVerbindung: (cb: typeof verbindung) => {
        verbindung = cb
        return () => undefined
      },
      structured: (req: StructuredRequest) => new Promise((ok) => offen.set(req.progressId!, { ok })),
      image: () => new Promise(() => undefined),
      websuche: async () => [],
      cancel: async () => undefined
    }
  }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
const REQ: StructuredRequest = {
  system: '',
  user: 'Igel',
  schemaName: 'probe',
  schema: {}
}
const MERK = 'schul-apps-auftraege-unterbrochen'

describe('Aufträge über einen Neustart der iPad-App', () => {
  it('merkt laufende Aufträge, setzt fortsetzbare nach dem Neustart fort und legt im richtigen Dokument ab', async () => {
    // ---------- Erste Sitzung
    const erste = await import('../src/renderer/src/shared/auftraege')
    const abgelegt: { docId: string; wert: unknown }[] = []
    const erzeugen = (thema: string, docId: string): void =>
      void erste.starteAuftrag({
        moduleId: 'arbeitsblatt',
        docId,
        titel: thema,
        art: 'Probe',
        eingabe: { thema },
        fortsetzen: { art: 'probe.erzeugen', args: [thema, docId] },
        arbeit: (e, k) => k.ai({ ...REQ, user: e.thema }),
        ablegen: async (wert) => void abgelegt.push({ docId, wert })
      })
    erste.registriereFortsetzung('probe.erzeugen', erzeugen)
    erzeugen('Igel', 'doc-igel')
    // Ein Auftrag, den sein Programm nicht fortsetzen kann
    void erste.starteAuftrag({
      moduleId: 'rueckmeldung',
      docId: 'doc-rm',
      titel: 'Rückmeldung',
      art: 'Bogen',
      eingabe: {},
      arbeit: (_e, k) => k.ai(REQ),
      ablegen: async () => undefined
    })
    await tick()
    await tick()
    expect(JSON.parse(speicher.get(MERK)!).map((a: { docId: string }) => a.docId)).toEqual(['doc-igel', 'doc-rm'])

    // Verbindung zum PC weg: die Leiste sagt es
    const igelAnfrage = [...offen.keys()][0]
    verbindung!({ id: igelAnfrage, zustand: 'unterbrochen' })
    expect(erste.useAuftraege.getState().auftraege.find((a) => a.docId === 'doc-igel')?.verbindung).toBe('unterbrochen')
    verbindung!({ id: igelAnfrage, zustand: 'verbunden' })
    expect(erste.useAuftraege.getState().auftraege.find((a) => a.docId === 'doc-igel')?.verbindung).toBeUndefined()

    // ---------- iOS beendet die App; Neustart lädt alles neu
    vi.resetModules()
    offen.clear()
    const zweite = await import('../src/renderer/src/shared/auftraege')
    const abgelegtNeu: { docId: string; wert: unknown }[] = []
    const erzeugenNeu = (thema: string, docId: string): void =>
      void zweite.starteAuftrag({
        moduleId: 'arbeitsblatt',
        docId,
        titel: thema,
        art: 'Probe',
        eingabe: { thema },
        fortsetzen: { art: 'probe.erzeugen', args: [thema, docId] },
        arbeit: (e, k) => k.ai({ ...REQ, user: e.thema }),
        ablegen: async (wert) => void abgelegtNeu.push({ docId, wert })
      })
    zweite.registriereFortsetzung('probe.erzeugen', erzeugenNeu)
    expect(zweite.nimmUnterbrocheneAuf()).toBe(1)
    // Nur einmal je Start
    expect(zweite.nimmUnterbrocheneAuf()).toBe(0)
    const liste = zweite.useAuftraege.getState().auftraege
    expect(liste.find((a) => a.docId === 'doc-igel')).toMatchObject({
      status: 'laufend',
      fortgesetzt: true,
      meldung: 'Nach dem Neustart fortgesetzt …'
    })
    expect(liste.find((a) => a.docId === 'doc-rm')).toMatchObject({
      status: 'fehler',
      meldung: 'Durch Beenden der App unterbrochen'
    })

    // Dieselbe KI-Anfrage wie vor dem Neustart (dieselben Eingaben) – das Ergebnis landet im Dokument „doc-igel"
    await tick()
    await tick()
    const [, anfrage] = [...offen.entries()][0]
    anfrage.ok({ text: 'fertig' })
    await tick()
    await tick()
    await tick()
    expect(abgelegtNeu).toEqual([{ docId: 'doc-igel', wert: { text: 'fertig' } }])
    expect(abgelegt).toEqual([])
    // Fertig: nichts mehr gemerkt
    expect(JSON.parse(speicher.get(MERK)!)).toEqual([])
  })
})
