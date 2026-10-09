import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { StructuredRequest } from '@shared/types'

/*
 * KI-Nutzung über Schlüssel der Schule (09.10.2026): Nur 'schule' wird gezählt – privates Abo, eigener Schlüssel und
 * Lernende nie (ausdrücklicher Wunsch des Admins). Dazu: Der Namensschutz greift auch beim neuen OpenAI-kompatiblen
 * Zugang, und die Übersicht rechnet richtig. Keine echten KI-Anfragen.
 */
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nie-benutzt' }, safeStorage: { isEncryptionAvailable: () => false } }))
vi.mock('../src/main/services/ai/verbrauch', () => ({ merkeVerbrauch: vi.fn() }))
vi.mock('../src/main/services/storage/settings', async (original) => {
  const echt = await original<typeof import('../src/main/services/storage/settings')>()
  return { ...echt, getSettings: () => ({ briefkopf: {} }) }
})

const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
const { datenbankFuerTests, nutzerAnlegen } = await import('../src/server/datenbank')
const { artVonSchema, kiNutzungJeTag, kiNutzungUebersicht, merkeKiNutzung, mitKiNutzung, zugangsArt, istLimit } = await import('../src/server/kiNutzung')
const { mitNamensschutz } = await import('../src/server/namensschutz')
const { imNutzer } = await import('../src/server/kontext')
const { KompatibelProvider } = await import('../src/main/services/ai/kompatibel')
type Umgebung = import('../src/server/kiNutzung').NutzungsUmgebung
type Fall = import('../src/server/kiNutzung').Nutzungsfall

const REQ: StructuredRequest = {
  system: 'x',
  user: 'Thema',
  schemaName: 'worksheet_block',
  schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }
}

function umgebung(o: Partial<{ rolle: string; abo: boolean; eigener: boolean; schule: boolean; anbieter: string }> = {}): { u: Umgebung; faelle: Fall[] } {
  const faelle: Fall[] = []
  const anbieter = o.anbieter ?? 'openai'
  return {
    faelle,
    u: {
      nutzer: () => ({ id: 'lk1', rolle: o.rolle ?? 'lehrkraft' }),
      einstellung: () => ({
        textProvider: anbieter,
        access: { [anbieter]: o.abo ? 'subscription' : 'api' },
        imageProvider: anbieter,
        imageAccess: { [anbieter]: o.abo ? 'subscription' : 'api' }
      }),
      eigenerSchluessel: () => Boolean(o.eigener),
      schulSchluessel: () => o.schule !== false,
      merke: (f) => faelle.push(f)
    }
  }
}

describe('Wer gezählt wird', () => {
  it('zugangsArt: nur der freigegebene Schlüssel der Schule ist „schule"', () => {
    expect(zugangsArt({ abo: false, eigenerSchluessel: false, schulSchluessel: true })).toBe('schule')
    expect(zugangsArt({ abo: true, eigenerSchluessel: false, schulSchluessel: true })).toBe('privat')
    expect(zugangsArt({ abo: false, eigenerSchluessel: true, schulSchluessel: true })).toBe('privat')
    expect(zugangsArt({ abo: false, eigenerSchluessel: false, schulSchluessel: false })).toBe('keiner')
  })

  it('zählt Aufrufe über den Schlüssel der Schule – mit Art, Anbieter und Auftrag', async () => {
    const { u, faelle } = umgebung({ anbieter: 'mistral' })
    const auf = mitKiNutzung(async () => ({ ok: true }), u)
    await auf('ai:structured', [{ ...REQ, progressId: 'p1' }])
    await auf('ai:structured', [{ ...REQ, progressId: 'p1' }])
    await auf('settings:get', [])
    expect(faelle).toEqual([
      { nutzerId: 'lk1', anbieter: 'mistral', art: 'arbeitsblatt', neuerAuftrag: true, ergebnis: 'ok' },
      { nutzerId: 'lk1', anbieter: 'mistral', art: 'arbeitsblatt', neuerAuftrag: false, ergebnis: 'ok' }
    ])
  })

  it('privates Abo, eigener Schlüssel, kein Schlüssel der Schule, Lernende: NICHTS wird gezählt', async () => {
    for (const o of [{ abo: true }, { eigener: true }, { schule: false }, { rolle: 'schueler' }]) {
      const { u, faelle } = umgebung(o)
      await mitKiNutzung(async () => ({ ok: true }), u)('ai:structured', [REQ])
      await mitKiNutzung(async () => 'bild', u)('ai:image', ['ein Apfel'])
      expect(faelle).toEqual([])
    }
  })

  it('Fehler und Limits zählen, Abbrüche nicht; der Fehler geht weiter', async () => {
    const { u, faelle } = umgebung()
    const fehler = (m: string, name = 'Error') =>
      mitKiNutzung(async () => {
        const e = new Error(m)
        e.name = name
        throw e
      }, u)('ai:structured', [REQ])
    await expect(fehler('OpenAI: Zu viele Anfragen (429)')).rejects.toThrow(/429/)
    await expect(fehler('Ungültige Antwort')).rejects.toThrow()
    await expect(fehler('aborted', 'AbortError')).rejects.toThrow()
    expect(faelle.map((f) => f.ergebnis)).toEqual(['limit', 'fehler'])
    expect(istLimit('Kontingent erschöpft')).toBe(true)
  })

  it('Auftragsarten aus dem Schemanamen', () => {
    expect(artVonSchema('grammatik_pool')).toBe('grammatik')
    expect(artVonSchema('vocab_list')).toBe('vokabeln')
    expect(artVonSchema('reihe_planung')).toBe('reihe')
    expect(artVonSchema('exam_part')).toBe('pruefung')
    expect(artVonSchema('rueckmeldung_bogen')).toBe('rueckmeldung')
    expect(artVonSchema(undefined, 'ai:image')).toBe('bild')
    expect(artVonSchema('irgendwas')).toBe('sonstiges')
  })
})

describe('Datenbank und Übersicht', () => {
  let lk = ''
  let lk2 = ''
  let sus = ''
  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    lk = nutzerAnlegen({ benutzer: 'a.lehr', name: 'Ada Lehr', rolle: 'lehrkraft', quelle: 'lokal' }).id
    lk2 = nutzerAnlegen({ benutzer: 'b.berg', name: 'Bea Bergfeld', rolle: 'lehrkraft', quelle: 'lokal' }).id
    sus = nutzerAnlegen({ benutzer: 'ida.probe', name: 'Ida Probe', rolle: 'schueler', quelle: 'lokal' }).id
  })

  it('summiert je Tag, je Lehrkraft, je Art und Anbieter – ohne Lernende', () => {
    const heute = new Date('2026-10-09T10:00:00Z')
    const gestern = new Date('2026-10-08T10:00:00Z')
    const vor20 = new Date('2026-09-19T10:00:00Z')
    const f = (nutzerId: string, art: Fall['art'], anbieter: string, ergebnis: Fall['ergebnis'] = 'ok', neuerAuftrag = true): Fall => ({ nutzerId, art, anbieter, ergebnis, neuerAuftrag })
    merkeKiNutzung(f(lk, 'arbeitsblatt', 'mistral'), heute)
    merkeKiNutzung(f(lk, 'arbeitsblatt', 'mistral', 'ok', false), heute)
    merkeKiNutzung(f(lk, 'grammatik', 'openai', 'limit'), gestern)
    merkeKiNutzung(f(lk2, 'vokabeln', 'mistral'), vor20)
    // Ein Schülerkonto taucht nie auf, selbst wenn eine Zeile existierte
    merkeKiNutzung(f(sus, 'rueckmeldung', 'openai'), heute)

    const jeTag = kiNutzungJeTag(3, heute)
    expect(jeTag.map((t) => t.tag)).toEqual(['2026-10-07', '2026-10-08', '2026-10-09'])
    expect(jeTag[2]).toEqual({ tag: '2026-10-09', auftraege: 2, anfragen: 3 })
    expect(jeTag[1]).toEqual({ tag: '2026-10-08', auftraege: 1, anfragen: 1 })

    const u = kiNutzungUebersicht(heute)
    expect(u.tage).toHaveLength(30)
    expect(u.lehrkraefte.map((z) => z.name)).toEqual(['Ada Lehr', 'Bea Bergfeld'])
    const ada = u.lehrkraefte[0]
    expect(ada).toMatchObject({ anfragen7: 3, anfragen30: 3, auftraege30: 2, fehler: 1, limits: 1, arten: { arbeitsblatt: 2, grammatik: 1 }, anbieter: { mistral: 2, openai: 1 } })
    expect(ada.verlauf.at(-1)).toBe(2)
    expect(ada.verlauf.at(-2)).toBe(1)
    expect(u.lehrkraefte[1]).toMatchObject({ anfragen7: 0, anfragen30: 1 })
    expect(u.jeAnbieter.mistral).toEqual({ lehrkraefte: 2, anfragen: 3 })
    expect(u.jeAnbieter.openai).toEqual({ lehrkraefte: 1, anfragen: 1 })
    expect(u.jeTag.at(-1)).toMatchObject({ summe: 2, arten: { arbeitsblatt: 2 } })
    expect(JSON.stringify(u)).not.toContain('Ida')
  })

  it('Namensschutz bleibt vor dem neuen Zugang: Der Anbieter sieht keinen Klarnamen, die Lehrkraft schon', async () => {
    const holen = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: { content: string }[] }
      // Die KI antwortet mit dem Platzhalter, den sie bekommen hat
      const platzhalter = /\[Person-\d+\]/.exec(body.messages[1].content)?.[0] ?? '?'
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ text: `Brief an ${platzhalter}` }) } }] }))
    })
    const anbieter = new KompatibelProvider({ id: 'mistral', basisUrl: 'https://api.mistral.ai/v1', schluessel: 't' }, holen as unknown as typeof fetch)
    const roh = async (kanal: string, args: unknown[]): Promise<unknown> => {
      if (kanal !== 'ai:structured') throw new Error('unerwartet')
      return anbieter.structured(args[0] as StructuredRequest, 'mistral-large-latest')
    }
    const { u, faelle } = umgebung({ anbieter: 'mistral' })
    // Aufbau wie in server/start.ts: Namensschutz außen, Zählung innen
    const aufruf = mitNamensschutz(mitKiNutzung(roh, u))
    const nutzer = { id: lk, benutzer: 'a.lehr', name: 'Ada Lehr', rolle: 'lehrkraft' as const, quelle: 'lokal' }
    const ergebnis = (await imNutzer(nutzer as never, () => aufruf('ai:structured', [{ ...REQ, user: 'Schreibe einen Brief an Bea Bergfeld.' }]))) as { text: string }
    const gesendet = String(holen.mock.calls[0][1].body)
    expect(gesendet).not.toContain('Bergfeld')
    expect(gesendet).toMatch(/\[Person-\d+\]/)
    expect(ergebnis.text).toBe('Brief an Bea Bergfeld')
    expect(faelle).toHaveLength(1)
  })
})
