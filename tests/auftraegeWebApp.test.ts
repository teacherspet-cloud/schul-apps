import { describe, expect, it, vi } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'

/*
 * Aufträge über ein Neuladen der Web-App (25.10.2026, Befund der Lehrkraft: zwei Arbeitsblatt-Erstellungen gingen
 * verloren, weil die Seite nach einem Server-Update neu lud). Die Web-App merkt laufende Aufträge wie die iPad-App –
 * gebunden an die Anmeldesitzung: dieselbe Anmeldung setzt fort, eine andere Anmeldung im selben Browser bekommt davon
 * nichts zu sehen.
 */
const speicher = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k)
})
vi.mock('../src/renderer/src/shared/netzZugang', async (orig) => ({ ...(await orig<object>()), imNetz: () => true }))

const offen = new Map<string, { ok: (v: unknown) => void }>()
const fenster = {
  __schulappsServer: { angemeldet: true, sitzung: 'erste-anmeldung', adresse: 'https://schule.example' },
  api: {
    ai: {
      onProgress: () => () => undefined,
      onPlatz: () => () => undefined,
      onVerbindung: () => () => undefined,
      structured: (req: StructuredRequest) => new Promise((ok) => offen.set(req.progressId!, { ok })),
      image: () => new Promise(() => undefined),
      websuche: async () => [],
      cancel: async () => undefined
    }
  }
}
;(globalThis as unknown as { window: unknown }).window = fenster

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
const MERK = 'schul-apps-auftraege-unterbrochen'
const REQ: StructuredRequest = { system: 's', user: 'u', schemaName: 'probe', schema: { type: 'object' } }

type Auftraege = typeof import('../src/renderer/src/shared/auftraege')
const probe = (m: Auftraege, abgelegt: { docId: string; wert: unknown }[]): ((thema: string, docId: string) => void) => {
  const erzeugen = (thema: string, docId: string): void =>
    void m.starteAuftrag({
      moduleId: 'arbeitsblatt',
      docId,
      titel: thema,
      art: 'Arbeitsblatt erstellen',
      eingabe: { thema },
      fortsetzen: { art: 'probe.erzeugen', args: [thema, docId] },
      arbeit: (e, k) => k.ai({ ...REQ, user: e.thema }),
      ablegen: async (wert) => void abgelegt.push({ docId, wert })
    })
  m.registriereFortsetzung('probe.erzeugen', erzeugen)
  return erzeugen
}

describe('Aufträge über ein Neuladen der Web-App', () => {
  it('merkt den Auftrag mit der Anmeldesitzung und setzt ihn nach dem Neuladen fort', async () => {
    const erste = await import('../src/renderer/src/shared/auftraege')
    const abgelegt: { docId: string; wert: unknown }[] = []
    probe(erste, abgelegt)('Weltkrieg', 'doc-wk')
    await tick()
    await tick()
    const gemerkt = JSON.parse(speicher.get(MERK)!) as { docId: string; sitzung?: string }[]
    expect(gemerkt).toHaveLength(1)
    expect(gemerkt[0]).toMatchObject({ docId: 'doc-wk', sitzung: 'server-erste-anmeldung' })

    // Neuladen in derselben Anmeldung (Server-Update, Nachladefehler): alles neu geladen, Sitzung gleich
    vi.resetModules()
    offen.clear()
    const zweite = await import('../src/renderer/src/shared/auftraege')
    const abgelegtNeu: { docId: string; wert: unknown }[] = []
    probe(zweite, abgelegtNeu)
    expect(zweite.nimmUnterbrocheneAuf()).toBe(1)
    expect(zweite.useAuftraege.getState().auftraege.find((a) => a.docId === 'doc-wk')).toMatchObject({ status: 'laufend', fortgesetzt: true })
    await tick()
    await tick()
    const [, anfrage] = [...offen.entries()][0]
    anfrage.ok({ text: 'fertig' })
    await tick()
    await tick()
    await tick()
    expect(abgelegtNeu).toEqual([{ docId: 'doc-wk', wert: { text: 'fertig' } }])
    expect(abgelegt).toEqual([])
    expect(JSON.parse(speicher.get(MERK)!)).toEqual([])
  })

  it('eine andere Anmeldung im selben Browser bekommt fremde Aufträge weder fortgesetzt noch angezeigt', async () => {
    vi.resetModules()
    offen.clear()
    speicher.clear()
    fenster.__schulappsServer.sitzung = 'erste-anmeldung'
    const erste = await import('../src/renderer/src/shared/auftraege')
    probe(erste, [])('Julikrise', 'doc-jk')
    // Ein Auftrag ohne Fortsetzung dazu
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
    expect(JSON.parse(speicher.get(MERK)!)).toHaveLength(2)

    // Abmelden, andere Lehrkraft meldet sich an: neue Sitzungskennung
    vi.resetModules()
    offen.clear()
    fenster.__schulappsServer.sitzung = 'zweite-anmeldung'
    const andere = await import('../src/renderer/src/shared/auftraege')
    probe(andere, [])
    expect(andere.nimmUnterbrocheneAuf()).toBe(0)
    expect(andere.useAuftraege.getState().auftraege).toEqual([])
    expect(offen.size).toBe(0)
    expect(JSON.parse(speicher.get(MERK)!)).toEqual([])
  })

  it('ohne Fortsetzung erscheint der Auftrag in derselben Anmeldung als durch Neuladen unterbrochen', async () => {
    vi.resetModules()
    offen.clear()
    speicher.clear()
    fenster.__schulappsServer.sitzung = 'dritte-anmeldung'
    const erste = await import('../src/renderer/src/shared/auftraege')
    void erste.starteAuftrag({
      moduleId: 'tafelbild',
      docId: 'doc-tb',
      titel: 'Tafelbild',
      art: 'Tafelbild',
      eingabe: {},
      arbeit: (_e, k) => k.ai(REQ),
      ablegen: async () => undefined
    })
    await tick()
    vi.resetModules()
    offen.clear()
    const zweite = await import('../src/renderer/src/shared/auftraege')
    expect(zweite.nimmUnterbrocheneAuf()).toBe(0)
    expect(zweite.useAuftraege.getState().auftraege[0]).toMatchObject({ docId: 'doc-tb', status: 'fehler', meldung: 'Durch Neuladen der Seite unterbrochen' })
  })
})
