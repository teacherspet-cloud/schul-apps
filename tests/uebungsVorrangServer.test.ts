/**
 * Übungsvorrang am Server (12.10.2026): Kurs mit drei Abschnitten (verschieden alt freigegeben) – die Liste für Lernende
 * trägt Rang/Vorrang; die Lehrkraft wählt Testabschnitte am Testtermin (verschlüsselt gespeichert); vor dem Test steigt
 * das Tagesziel, und die Sprachrunde besteht in den 3 Tagen davor nur aus den gewählten Abschnitten.
 */
import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { SENSIBEL } from '../src/server/feldschutz'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { db, vokabelnZuweisen, vokabelRoute } from '../src/server/vokabeln'
import { sprachstandRoute } from '../src/server/sprachstand'
import type { Anfrage } from '../src/server/http'
import { TAG, type Vokabel } from '../src/shared/vokabeltrainer'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => `${process.cwd()}/nie-benutzt` } }))

async function rufe(route: (k: Anfrage) => Promise<boolean>, n: NutzerInfo, methode: 'GET' | 'POST', pfad: string, koerper: Record<string, unknown> = {}) {
  let code = 0
  let text = ''
  const res = { writeHead: (c: number) => ((code = c), res), setHeader: () => res, end: (s: string) => void (text = s) }
  const k = {
    req: { method: methode, headers: methode === 'POST' ? { 'x-schulapps-token': 'probe' } : {}, socket: {} },
    res,
    url: new URL(`http://x${pfad}`),
    sitzung: { nutzer: n, kennung: 'probe' },
    ip: '',
    koerper: async () => koerper
  } as unknown as Anfrage
  await route(k)
  return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
}

let lk: NutzerInfo
let kind: NutzerInfo
let kurs = ''
const wort = (id: string): Vokabel => ({ id, term: `word ${id}`, translation: `Wort ${id}` })

describe('Übungsvorrang am Server', () => {
  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    lk = nutzerAnlegen({ benutzer: 'v.lehr', name: 'Vera Lehr', rolle: 'lehrkraft', quelle: 'test' })
    kind = nutzerAnlegen({ benutzer: 'kim.kind', name: 'Kim Kind', rolle: 'schueler', quelle: 'lokal' })
    lerngruppenVon(lk.id)
    const g = randomBytes(6).toString('hex')
    datenbank()
      .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(g, lk.id, '7b', 'Englisch', '', JSON.stringify([kind.benutzer]), new Date().toISOString())
    const woerter = [...['a1', 'a2', 'a3'], ...['b1', 'b2', 'b3'], ...Array.from({ length: 24 }, (_, i) => `c${i}`)].map(wort)
    kurs = vokabelnZuweisen({ lehrkraftId: lk.id, lerngruppeId: g, schueler: [], titel: 'Englisch', sprache: 'en', fach: 'Englisch', woerter })
    const teile = [
      { titel: 'Station A', anzahl: 3, zeit: Date.now() - 20 * TAG },
      { titel: 'Station B', anzahl: 3, zeit: Date.now() - 2 * TAG },
      { titel: 'Station C', anzahl: 24, zeit: Date.now() - 10 * TAG }
    ]
    db().prepare('UPDATE vok_zuweisungen SET teile = ? WHERE id = ?').run(JSON.stringify(teile), kurs)
  })

  it('Liste für Lernende: Rang nach Freigabe, neueste Freigabe mit Vorrang', async () => {
    const r = await rufe(vokabelRoute(), kind, 'GET', `/s/api/vokabeln/liste?id=${kurs}`)
    expect(r.code).toBe(200)
    const w = r.d.woerter as Vokabel[]
    const nach = (id: string): Vokabel => w.find((x) => x.id === id)!
    expect(nach('b1').rang).toBe(0)
    expect(nach('b1').vorrang).toBe('neu')
    expect(nach('c0').rang).toBe(3)
    expect(nach('a1').rang).toBe(27)
    expect(nach('a1').vorrang).toBeUndefined()
    expect(r.d.tagesziel).toBe(10)
  })

  it('Testtermin: Vorbelegung, eigene Auswahl (verschlüsselt), mehr neue Wörter je Tag', async () => {
    const termin = Date.now() + 4 * TAG
    const t = await rufe(vokabelRoute(), lk, 'POST', `/server/vokabeln/${kurs}/termin`, { testTermin: termin })
    expect(t.code).toBe(200)
    const vorschlag = t.d.testAbschnitte as { gewaehlt: string[]; eigeneWahl: boolean }
    expect(vorschlag.gewaehlt).toEqual(['Station B'])
    expect(vorschlag.eigeneWahl).toBe(false)
    const t2 = await rufe(vokabelRoute(), lk, 'POST', `/server/vokabeln/${kurs}/termin`, { testTermin: termin, testAbschnitte: ['Station C', 'Unbekannt'] })
    expect((t2.d.testAbschnitte as { gewaehlt: string[] }).gewaehlt).toEqual(['Station C'])
    // verschlüsselt gespeichert (Feldschutz)
    expect(SENSIBEL.vok_zuweisungen).toContain('test_abschnitte')
    const l = await rufe(vokabelRoute(), kind, 'GET', `/s/api/vokabeln/liste?id=${kurs}`)
    const w = l.d.woerter as Vokabel[]
    expect(w.find((x) => x.id === 'c0')!.vorrang).toBe('test')
    expect(w.find((x) => x.id === 'c0')!.rang).toBe(0)
    // 24 Testwörter, Test in 4 Tagen → 2 Tage bis 3 Tage vorher → 12 je Tag
    expect(l.d.tagesziel).toBe(12)
  })

  it('Sprachrunde in den 3 Tagen vor dem Test: nur die gewählten Abschnitte', async () => {
    await rufe(vokabelRoute(), lk, 'POST', `/server/vokabeln/${kurs}/termin`, { testTermin: Date.now() + 2 * TAG, testAbschnitte: ['Station B'] })
    const r = await rufe(sprachstandRoute(), kind, 'GET', '/s/api/vokabeln/liste?id=sp:en')
    expect(r.code).toBe(200)
    const ids = (r.d.woerter as Vokabel[]).map((x) => x.id.split(':').pop())
    expect(ids.sort()).toEqual(['b1', 'b2', 'b3'])
  })
})
