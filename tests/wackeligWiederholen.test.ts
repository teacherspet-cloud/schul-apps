import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { json_, standSpeichern, standVon, vokabelnZuweisen, zeile } from '../src/server/vokabeln'
import { klassenKursVon, klassenRoute } from '../src/server/klassen'
import { lerngruppe } from '../src/server/onlinetest'
import { neuerStand, type Vokabel, type WortStand } from '../src/shared/vokabeltrainer'
import { sprachenlernenZiel, mehrAufgabenDocId, kursGrammatikDocId, extraDocId } from '../src/renderer/src/modules/lernen/kurs/auftragsZiel'
import type { Anfrage } from '../src/server/http'

/*
 * „Meine Klassen" (09.10.2026, Wunsch der Lehrkraft): „Wackelige Wörter" legt keinen zweiten Kurs mehr an, sondern macht
 * die Wörter im Kurs der Klasse wieder fällig – nur bei denen, die das Wort schon gesehen haben und darin wackeln.
 * Dazu: der Kurs der Klasse (Ziel von „Vokabeln/Grammatik hinzufügen") und die Kennungen der Aufträge in Sprachenlernen.
 */
const TAG = 86_400_000
const jetzt = Date.now()
let lk: NutzerInfo
const schueler: NutzerInfo[] = []
let gruppeId = ''
let kurs = ''
let woerter: Vokabel[] = []

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

const stand = (o: Partial<WortStand>): WortStand => ({ ...neuerStand(), ...o })

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  lk = nutzerAnlegen({ benutzer: 'w.wackel', name: 'Wanda Wackel', rolle: 'lehrkraft', quelle: 'test' })
  for (const b of ['ada.w', 'ben.w', 'cem.w', 'dia.w', 'eli.w'])
    schueler.push(nutzerAnlegen({ benutzer: b, name: b, rolle: 'schueler', quelle: 'lokal' }))
  lerngruppenVon(lk.id)
  gruppeId = randomBytes(6).toString('hex')
  datenbank()
    .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(gruppeId, lk.id, '6b', 'Englisch', '', JSON.stringify(schueler.map((s) => s.benutzer)), new Date().toISOString())
  kurs = vokabelnZuweisen({
    lehrkraftId: lk.id,
    lerngruppeId: gruppeId,
    schueler: [],
    titel: 'Unit 1',
    sprache: 'en',
    fach: 'Englisch',
    woerter: ['dog', 'cat', 'bird', 'fish', 'horse', 'cow'].map((t, i) => ({ id: `w${i}`, term: t, translation: `T${i}` }))
  })
  woerter = json_(zeile(kurs)!.woerter, [] as Vokabel[])
  const spaeter = jetzt + 5 * TAG
  // Alle fünf wackeln bei Ada, Ben, Cem (Fach 1, Fehler, kürzlich) – der Vorschlag braucht mindestens 5 Wörter
  for (const s of schueler.slice(0, 3))
    standSpeichern(kurs, s.id, {
      woerter: Object.fromEntries(woerter.slice(0, 5).map((v) => [v.id, stand({ fach: 1, faellig: spaeter, versuche: 3, falsch: 2, zuletzt: jetzt - TAG })])),
      tage: []
    })
  // Dia: kennt die Wörter sicher (Fach 4, nie falsch) – bleibt unberührt; Eli hat sie nie gesehen
  standSpeichern(kurs, schueler[3].id, {
    woerter: Object.fromEntries(woerter.slice(0, 5).map((v) => [v.id, stand({ fach: 4, faellig: spaeter, versuche: 4, falsch: 0, zuletzt: jetzt - TAG })])),
    tage: []
  })
})

describe('Wackelige Wörter im Kurs wiederholen', () => {
  it('Vorschlag trägt Kurs und Wort; der Kurs der Klasse ist der vorhandene', async () => {
    const { d } = await rufe('GET', `/server/klassen/${gruppeId}`)
    const wackelig = d.wackelig as { term: string; kurs: string; id: string }[]
    expect(wackelig.length).toBe(5)
    expect(wackelig.every((w) => w.kurs === kurs && woerter.some((v) => v.id === w.id && v.term === w.term))).toBe(true)
    expect(d.klassenKurs).toBe(kurs)
    expect(klassenKursVon(lerngruppe(gruppeId)!, lk.id)).toBe(kurs)
    expect((d.vorschlaege as { art: string; text: string }[]).find((v) => v.art === 'vokabeln')?.text).toMatch(/im Kurs gleich wiederholen/)
  })
  it('macht die Wörter nur bei denen fällig, die wackeln – ohne neuen Kurs und ohne Fachwechsel', async () => {
    const vorher = (datenbank().prepare('SELECT COUNT(*) AS n FROM vok_zuweisungen WHERE lehrkraft_id = ?').get(lk.id) as { n: number }).n
    const r = await rufe('POST', `/server/klassen/${gruppeId}/wackelig-wiederholen`)
    expect(r.code).toBe(200)
    expect(r.d).toEqual({ woerter: 5, lernende: 3, kurse: ['6b - Englisch'] })
    for (const s of schueler.slice(0, 3)) {
      const st = standVon(kurs, s.id)
      for (const v of woerter.slice(0, 5)) {
        expect(st.woerter[v.id].faellig).toBeLessThanOrEqual(Date.now())
        expect(st.woerter[v.id].fach).toBe(1)
      }
      expect(st.woerter[woerter[5].id]).toBeUndefined()
    }
    for (const v of woerter.slice(0, 5)) expect(standVon(kurs, schueler[3].id).woerter[v.id].faellig).toBeGreaterThan(Date.now())
    expect(Object.keys(standVon(kurs, schueler[4].id).woerter)).toEqual([])
    const nachher = (datenbank().prepare('SELECT COUNT(*) AS n FROM vok_zuweisungen WHERE lehrkraft_id = ?').get(lk.id) as { n: number }).n
    expect(nachher).toBe(vorher)
  })
  it('fremde Lerngruppe: 404', async () => {
    expect((await rufe('POST', '/server/klassen/gibtsnicht/wackelig-wiederholen')).code).toBe(404)
  })
})

describe('Lehrwerk-Vorwahl: Daten zu Kurs und Klasse', () => {
  it('Jahrgang der Klasse, Lehrwerke der übrigen Kurse der Klasse und der Lehrkraft', async () => {
    vokabelnZuweisen({
      lehrkraftId: lk.id,
      lerngruppeId: gruppeId,
      schueler: [],
      titel: 'Green Line 2 - Unit 1',
      sprache: 'en',
      fach: 'Englisch',
      woerter: [{ id: 'x', term: 'river', translation: 'Fluss' }],
      quelle: { lehrwerk: 'green-line-2', unit: 'Unit 1', abschnitte: ['Station 1'] }
    })
    const r = await rufe('GET', `/server/klassen/vorwahl?kurs=${kurs}`)
    expect(r.code).toBe(200)
    expect(r.d).toMatchObject({ sprache: 'en', jahrgang: 6, kursLehrwerk: null, kursUnits: [], klassenLehrwerke: ['green-line-2'], ueblicheLehrwerke: ['green-line-2'] })
    expect((await rufe('GET', '/server/klassen/vorwahl?kurs=gibtsnicht')).code).toBe(404)
  })
})

describe('„Öffnen" der Aufträge in Sprachenlernen', () => {
  it('ordnet die Kennungen ihrem Ziel zu', () => {
    expect(sprachenlernenZiel('k123')).toEqual({ art: 'kurs', id: 'k123' })
    expect(sprachenlernenZiel('g:abc')).toEqual({ art: 'grammatik', gid: 'abc' })
    expect(sprachenlernenZiel(mehrAufgabenDocId('abc', 5))).toEqual({ art: 'grammatik', gid: 'abc' })
    expect(sprachenlernenZiel('mehr-ab-cd-1760000000000')).toEqual({ art: 'grammatik', gid: 'ab-cd' })
    expect(sprachenlernenZiel(kursGrammatikDocId('vok1', 5))).toEqual({ art: 'kursGrammatik', vokId: 'vok1' })
    expect(sprachenlernenZiel(extraDocId('vok1', 's1', 5))).toEqual({ art: 'kursGrammatik', vokId: 'vok1' })
    // Ohne Kurs bzw. ältere Aufträge: Übersicht statt Fehler
    expect(sprachenlernenZiel(kursGrammatikDocId(undefined, 5))).toEqual({ art: 'uebersicht' })
    expect(sprachenlernenZiel('extra-1760000000000')).toEqual({ art: 'uebersicht' })
    expect(sprachenlernenZiel('grammatik-1760000000000')).toEqual({ art: 'uebersicht' })
    expect(sprachenlernenZiel('')).toEqual({ art: 'uebersicht' })
    expect(sprachenlernenZiel('g:')).toEqual({ art: 'uebersicht' })
  })
})
