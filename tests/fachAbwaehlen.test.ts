import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { fachHinzufuegen, lerngruppe, lerngruppenVon } from '../src/server/onlinetest'
import { klassenKurseSichern, vokabelnZuweisen } from '../src/server/vokabeln'
import { klassenRoute } from '../src/server/klassen'
import type { Anfrage } from '../src/server/http'

/*
 * „Meine Klassen" (08.10.2026, Wunsch der Lehrkraft): Rechtsklick auf ein Fach → „Fach in der Klasse abwählen".
 * Ohne Material wird die Lerngruppe entfernt (einziges Fach: Klasse bleibt ohne Fach), leere Kurse gehen mit;
 * mit Material nur ausgeblendet – „+ Fach hinzufügen" holt es zurück.
 */
let lk: NutzerInfo
const gruppe = (name: string, fach: string): string => {
  lerngruppenVon(lk.id)
  const id = randomBytes(6).toString('hex')
  datenbank()
    .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, lk.id, name, fach, '', '[]', new Date().toISOString())
  return id
}
async function rufe(methode: 'GET' | 'POST', pfad: string): Promise<{ code: number; d: Record<string, unknown> }> {
  let code = 0
  let text = ''
  const res = { writeHead: (c: number) => ((code = c), res), setHeader: () => res, end: (s: string) => void (text = s) }
  const k = {
    req: { method: methode, headers: methode === 'POST' ? { 'x-schulapps-token': 'probe' } : {}, socket: {} },
    res,
    url: new URL(`http://x${pfad}`),
    sitzung: { nutzer: lk, kennung: 'probe' },
    ip: '',
    koerper: async () => ({})
  } as unknown as Anfrage
  await klassenRoute()(k)
  return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
}
const faecherVon = async (klasse: string): Promise<string[]> => {
  const { d } = await rufe('GET', '/server/klassen')
  const k = (d.klassen as { name: string; faecher: { fach: string }[] }[]).find((x) => x.name === klasse)
  return k ? k.faecher.map((f) => f.fach) : []
}

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  lk = nutzerAnlegen({ benutzer: 'f.fach', name: 'Fritz Fach', rolle: 'lehrkraft', quelle: 'test' })
})

describe('Fach in der Klasse abwählen', () => {
  it('ohne Material: Lerngruppe weg, leerer Kurs geht mit', async () => {
    const en = gruppe('10b', 'Englisch')
    gruppe('10b', 'Geschichte')
    klassenKurseSichern(lk.id)
    expect(datenbank().prepare('SELECT COUNT(*) AS n FROM vok_zuweisungen WHERE lerngruppe_id = ?').get(en)).toMatchObject({ n: 1 })
    const r = await rufe('POST', `/server/klassen/${en}/abwaehlen`)
    expect(r.code).toBe(200)
    expect(r.d.art).toBe('entfernt')
    expect(lerngruppe(en)).toBeNull()
    expect(datenbank().prepare('SELECT COUNT(*) AS n FROM vok_zuweisungen WHERE lerngruppe_id = ?').get(en)).toMatchObject({ n: 0 })
    expect(await faecherVon('10b')).toEqual(['Geschichte'])
  })
  it('einziges Fach ohne Material: Klasse bleibt ohne Fach', async () => {
    const ge = gruppe('7c', 'Geschichte')
    const r = await rufe('POST', `/server/klassen/${ge}/abwaehlen`)
    expect(r.d.art).toBe('entfernt')
    expect(lerngruppe(ge)?.fach).toBe('')
    expect(await faecherVon('7c')).toEqual([])
  })
  it('mit Material: nur ausgeblendet, Kurs bleibt; „+ Fach hinzufügen" holt es zurück', async () => {
    const fr = gruppe('9a', 'Französisch')
    const ma = gruppe('9a', 'Mathematik')
    const kurs = vokabelnZuweisen({ lehrkraftId: lk.id, lerngruppeId: fr, schueler: [], titel: 'Unité 1', sprache: 'fr', fach: 'Französisch', woerter: [{ id: 'f', term: 'le chat', translation: 'die Katze' }] })
    const r = await rufe('POST', `/server/klassen/${fr}/abwaehlen`)
    expect(r.d).toMatchObject({ art: 'ausgeblendet', material: 1 })
    expect(lerngruppe(fr)?.ausgeblendet).toBe(1)
    expect(datenbank().prepare('SELECT id FROM vok_zuweisungen WHERE id = ?').get(kurs)).toBeTruthy()
    expect(await faecherVon('9a')).toEqual(['Mathematik'])
    expect(fachHinzufuegen(lk.id, ma, 'Französisch')).toBe(fr)
    expect(lerngruppe(fr)?.ausgeblendet).toBe(0)
    expect((await faecherVon('9a')).sort()).toEqual(['Französisch', 'Mathematik'])
  })
  it('fremde Lerngruppe: 404', async () => {
    const andere = nutzerAnlegen({ benutzer: 'a.andere', name: 'Anne Andere', rolle: 'lehrkraft', quelle: 'test' })
    const id = randomBytes(6).toString('hex')
    datenbank()
      .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, andere.id, '5a', 'Englisch', '', '[]', new Date().toISOString())
    expect((await rufe('POST', `/server/klassen/${id}/abwaehlen`)).code).toBe(404)
    expect(lerngruppe(id)).not.toBeNull()
  })
})
