import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { foerdernRoute } from '../src/server/foerdern'
import { standSpeichern, vokabelnZuweisen } from '../src/server/vokabeln'
import type { Anfrage } from '../src/server/http'
import { buendelAblauf, buendelAus, buendelBereinigt, buendelSichtbar, foerderplanHtml, foerderplanText, fuerDichAufteilen } from '../src/shared/fuerDich'
import { SENSIBEL } from '../src/server/feldschutz'

/*
 * „Für dich" (12.10.2026, Förder- und Fordermaterial): Lernende sehen Bündel und Blätter erst nach der Freigabe, nur
 * ihre eigenen und nur bis zum Ablauf; Mitschüler sehen nie, wer welches Material hat.
 */
describe('Sichtbarkeit (rein)', () => {
  const z = { status: 'frei', schueler_id: 'a', ablauf: 2_000 }
  it('nur die eigene Person, nur freigegeben, nur bis zum Ablauf', () => {
    expect(buendelSichtbar(z, { id: 'a', rolle: 'schueler' }, 1_000)).toBe(true)
    expect(buendelSichtbar(z, { id: 'b', rolle: 'schueler' }, 1_000)).toBe(false)
    expect(buendelSichtbar({ ...z, status: 'vorschlag' }, { id: 'a', rolle: 'schueler' }, 1_000)).toBe(false)
    expect(buendelSichtbar(z, { id: 'a', rolle: 'schueler' }, 3_000)).toBe(false)
    expect(buendelSichtbar(z, { id: 'a', rolle: 'lehrkraft' }, 1_000)).toBe(false)
  })
  it('Blätter „Für dich" stehen getrennt von den übrigen', () => {
    const r = fuerDichAufteilen([{ id: '1', fuerDich: true }, { id: '2' }, { id: '3', fuerDich: false }])
    expect(r.fuerDich.map((b) => b.id)).toEqual(['1'])
    expect(r.andere.map((b) => b.id)).toEqual(['2', '3'])
  })
  it('Bündel aus den Lerndaten und Förderplan-Baustein (positiv, Ziel, Maßnahme, Zeitraum, Ergebnis)', () => {
    const k = {
      id: 'a',
      name: 'Mia Probe',
      benutzer: 'mia',
      wackelig: [{ term: 'dog', translation: 'Hund' }],
      grammatik: [
        { titel: 'simple past', ampel: 'schwaeche' as const, quote: 0.3, erklaerung: 'Vergangenheit', beispiele: ['I went.'] },
        { titel: 'plural', ampel: 'sicher' as const, quote: 0.95 }
      ],
      blaetter: { gruen: 3, gelb: 1, rot: 1, schwierig: [], schritte: ['Achte auf -ed.'] }
    }
    const b = buendelAus(k, 'Du kannst X.', 'Englisch')
    expect(b.woerter).toEqual([{ term: 'dog', translation: 'Hund' }])
    expect(b.grammatik.map((g) => g.titel)).toEqual(['simple past'])
    expect(b.hinweise).toEqual(['Achte auf -ed.'])
    const t = foerderplanText({
      name: 'Mia Probe',
      klasse: '7b',
      fach: 'Englisch',
      datum: new Date(2026, 9, 12),
      kind: k,
      art: 'foerder',
      ziel: 'Du kannst X.',
      massnahmen: ['Blatt']
    })
    expect(t).toContain('Ausgangslage: Mia sicher in „plural"')
    expect(t).toContain('Ziel (Fördern): Du kannst X.')
    expect(t).toContain('Zeitraum: 12.10.2026 bis 23.11.2026')
    expect(t).toContain('Ergebnis: offen')
    expect(foerderplanHtml([t])).toContain('<h2>Förderplan-Baustein – Mia Probe')
  })
  it('bereinigt, was gespeichert wird', () => {
    expect(buendelBereinigt({ ziel: '' })).toBeNull()
    const b = buendelBereinigt({
      ziel: 'Z',
      fach: 'Englisch',
      woerter: Array.from({ length: 40 }, (_, i) => ({ term: `w${i}`, translation: 't' })),
      hinweise: ['', 'h']
    })!
    expect(b.woerter).toHaveLength(20)
    expect(b.hinweise).toEqual(['h'])
  })
  it('neue Tabellen stehen im Feldschutz', () => {
    expect(SENSIBEL.foerder_auftraege).toEqual(['daten'])
    expect(SENSIBEL.foerder_buendel).toEqual(['daten'])
  })
})

let lk: NutzerInfo
let fremd: NutzerInfo
let mia: NutzerInfo
let ben: NutzerInfo
let gruppe = ''

async function rufe(
  n: NutzerInfo | null,
  methode: 'GET' | 'POST',
  pfad: string,
  koerper: Record<string, unknown> = {}
): Promise<{ code: number; d: Record<string, unknown> }> {
  let code = 0
  let text = ''
  const res = {
    writeHead: (c: number) => ((code = c), res),
    setHeader: () => res,
    end: (s: string) => void (text = s)
  }
  const k = {
    req: { method: methode, headers: methode === 'POST' ? { 'x-schulapps-token': 'probe' } : {}, socket: {} },
    res,
    url: new URL(`http://x${pfad}`),
    sitzung: n ? { nutzer: n, kennung: 'probe' } : null,
    ip: '',
    koerper: async () => koerper
  } as unknown as Anfrage
  const erledigt = await foerdernRoute()(k)
  if (!erledigt) return { code: -1, d: {} }
  return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
}

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  lk = nutzerAnlegen({ benutzer: 'l.foerdern', name: 'Lea Lehrkraft', rolle: 'lehrkraft', quelle: 'test' })
  fremd = nutzerAnlegen({ benutzer: 'f.foerdern', name: 'Fe Fremd', rolle: 'lehrkraft', quelle: 'test' })
  mia = nutzerAnlegen({ benutzer: 'mia.foerdern', name: 'Mia Probe', rolle: 'schueler', quelle: 'lokal' })
  ben = nutzerAnlegen({ benutzer: 'ben.foerdern', name: 'Ben Probe', rolle: 'schueler', quelle: 'lokal' })
  lerngruppenVon(lk.id)
  gruppe = randomBytes(6).toString('hex')
  datenbank()
    .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(gruppe, lk.id, '7b', 'Englisch', '', JSON.stringify([mia.benutzer, ben.benutzer]), new Date().toISOString())
})

describe('Bündel „Für dich" auf dem Server', () => {
  it('Lerndaten nur für die eigene Lerngruppe', async () => {
    const r = await rufe(lk, 'GET', `/server/foerdern/daten?gruppe=${gruppe}`)
    expect(r.code).toBe(200)
    expect((r.d.kinder as { name: string }[]).map((k) => k.name)).toEqual(['Ben Probe', 'Mia Probe'])
    expect((await rufe(fremd, 'GET', `/server/foerdern/daten?gruppe=${gruppe}`)).code).toBe(404)
    expect((await rufe(mia, 'GET', `/server/foerdern/daten?gruppe=${gruppe}`)).code).toBe(403)
  })

  it('Gruppen eines Auftrags: nur Kinder der Lerngruppe, Benutzernamen für die Vorwahl beim Freischalten', async () => {
    const a = await rufe(lk, 'POST', '/server/foerdern/auftrag', {
      gruppe,
      gruppen: [{ schluessel: 'gram:x', titel: 'Gruppe A', art: 'foerder', kinder: [mia.id, 'fremdes-kind'] }]
    })
    expect(a.code).toBe(200)
    const g = await rufe(lk, 'GET', `/server/foerdern/auftrag?id=${String(a.d.id)}&gruppe=gram:x`)
    expect(g.d.schueler).toEqual([mia.benutzer])
    expect((await rufe(fremd, 'GET', `/server/foerdern/auftrag?id=${String(a.d.id)}&gruppe=gram:x`)).code).toBe(404)
  })

  it('erst nach der Freigabe sichtbar – und nur für das eigene Kind', async () => {
    const r = await rufe(lk, 'POST', '/server/foerdern/buendel', {
      gruppe,
      buendel: [
        { schueler: mia.id, inhalt: { fach: 'Englisch', ziel: 'Du kannst X.', woerter: [{ term: 'dog', translation: 'Hund' }], grammatik: [], hinweise: [] } },
        { schueler: 'nicht-in-der-gruppe', inhalt: { fach: 'Englisch', ziel: 'Z', woerter: [], grammatik: [], hinweise: [] } }
      ]
    })
    expect(r.d.angelegt).toBe(1)
    // Vorschlag: noch unsichtbar
    expect((await rufe(mia, 'GET', '/s/api/fuerdich')).d.buendel).toEqual([])
    const liste = (await rufe(lk, 'GET', `/server/foerdern/buendel?gruppe=${gruppe}`)).d.buendel as { id: string; status: string; name: string }[]
    expect(liste).toHaveLength(1)
    expect(liste[0]).toMatchObject({ status: 'vorschlag', name: 'Mia Probe' })
    // Fremde Lehrkraft darf nicht freigeben
    expect((await rufe(fremd, 'POST', '/server/foerdern/buendel/freigeben', { id: liste[0].id })).code).toBe(404)
    expect((await rufe(lk, 'POST', '/server/foerdern/buendel/freigeben', { id: liste[0].id })).code).toBe(200)
    const sicht = (await rufe(mia, 'GET', '/s/api/fuerdich')).d.buendel as { ziel: string; woerter: unknown[] }[]
    expect(sicht).toHaveLength(1)
    expect(sicht[0].ziel).toBe('Du kannst X.')
    // Mitschüler sieht nichts
    expect((await rufe(ben, 'GET', '/s/api/fuerdich')).d.buendel).toEqual([])
    // Gespeichert nur verschlüsselt (Alias: unter ihrem eigenen Namen entschlüsselt der Datenbankzugang beim Lesen)
    const roh = datenbank().prepare('SELECT daten AS x FROM foerder_buendel WHERE id = ?').get(liste[0].id) as { x: string }
    expect(roh.x).toMatch(/^v1:/)
    expect(roh.x).not.toContain('Du kannst X.')
  })

  it('abgelaufene Bündel verschwinden', async () => {
    datenbank()
      .prepare('UPDATE foerder_buendel SET ablauf = ? WHERE schueler_id = ?')
      .run(Date.now() - 1, mia.id)
    expect((await rufe(mia, 'GET', '/s/api/fuerdich')).d.buendel).toEqual([])
    expect(buendelAblauf(0, 1)).toBe(86_400_000)
  })

  it('Lerndaten je Kind: gerade wackelnde Wörter nur beim betroffenen Kind', async () => {
    const kurs = vokabelnZuweisen({
      lehrkraftId: lk.id,
      lerngruppeId: gruppe,
      schueler: [],
      titel: 'Unit 1',
      sprache: 'en',
      fach: 'Englisch',
      woerter: [
        { id: 'w1', term: 'dog', translation: 'Hund' },
        { id: 'w2', term: 'cat', translation: 'Katze' }
      ]
    })
    const wackelt = { fach: 1, faellig: 0, frei: [], erkannt: 0, erkennenVersuche: 0, versuche: 4, falsch: 3, fehlerTexte: ['dock'], zuletzt: Date.now() }
    standSpeichern(kurs, mia.id, { woerter: { w1: wackelt }, tage: [] })
    const r = await rufe(lk, 'GET', `/server/foerdern/daten?gruppe=${gruppe}`)
    const kinder = r.d.kinder as { name: string; wackelig: { term: string }[]; vokabeln: { gesamt: number } | null }[]
    expect(kinder.find((k) => k.name === 'Mia Probe')!.wackelig.map((w) => w.term)).toEqual(['dog'])
    expect(kinder.find((k) => k.name === 'Ben Probe')!.wackelig).toEqual([])
    expect(kinder.find((k) => k.name === 'Mia Probe')!.vokabeln?.gesamt).toBe(2)
  })

  it('andere Pfade gehören nicht zur Route', async () => {
    expect((await rufe(mia, 'GET', '/s/api/blaetter')).code).toBe(-1)
  })
})
