import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { standSpeichern, standVon, vokabelListenFuer, vokabelnZuweisen, vokabelRoute } from '../src/server/vokabeln'
import { grammatikAnlegen, grammatikFuer, grammatikRoute } from '../src/server/grammatik'
import { aufgabenAnhaengen, gleichesThema, kennungenWiederverwenden, paketeZusammen, teilEntfernen, woerterJeTeil } from '../src/shared/kursEntfernen'
import { paketBereinigt } from '../src/shared/grammatiktrainer'
import type { Anfrage } from '../src/server/http'
import type { GrammatikAufgabe, GrammatikPaket } from '../src/shared/grammatiktrainer'

/*
 * Abschnitte und Grammatik aus dem Kurs entfernen (08.10.2026, abgestimmt mit der Lehrkraft): Entfernen behält den
 * Lernstand, erneutes Hinzufügen nimmt die alten Kennungen wieder auf; „Endgültig löschen" löscht den Lernstand mit.
 */

const w = (id: string, term: string, translation: string) => ({ id, term, translation })

describe('Abschnitte (rein)', () => {
  const teile = [
    { titel: 'Unit 1 A', anzahl: 2, zeit: 1 },
    { titel: 'Unit 1 B', anzahl: 2, zeit: 2 }
  ]
  const woerter = [w('w1', 'dog', 'Hund'), w('w2', 'cat', 'Katze'), w('w3', 'bird', 'Vogel'), w('w4', 'fish', 'Fisch')]
  it('teilt die Wortliste nach Abschnitten', () => {
    expect(woerterJeTeil(teile, woerter).map((x) => x.map((v) => v.id))).toEqual([
      ['w1', 'w2'],
      ['w3', 'w4']
    ])
  })
  it('entfernt einen Abschnitt samt Wörtern und merkt sie', () => {
    const r = teilEntfernen(woerter, teile, 0, 99)!
    expect(r.woerter.map((v) => v.id)).toEqual(['w3', 'w4'])
    expect(r.teile).toEqual([{ titel: 'Unit 1 B', anzahl: 2, zeit: 2 }])
    expect(r.entfernt).toEqual({ teil: 'Unit 1 A', woerter: woerter.slice(0, 2), zeit: 99 })
    expect(teilEntfernen(woerter, teile, 5, 0)).toBeNull()
  })
  it('nimmt Kennungen wieder auf – gleicher Abschnitt zuerst, sonst nach Wort (normiert)', () => {
    const entfernt = [
      { teil: 'Unit 1 A', woerter: [w('w1', 'dog', 'Hund')], zeit: 1 },
      { teil: 'Eigene', woerter: [w('e7', 'Dog ', 'hund'), w('e8', 'cow', 'Kuh')], zeit: 2 }
    ]
    const r = kennungenWiederverwenden(
      [
        { wort: w('n1', 'dog', 'Hund'), teil: 'Eigene' },
        { wort: w('n2', 'Cow.', 'Kuh') },
        { wort: w('n3', 'pig', 'Schwein') }
      ],
      entfernt
    )
    expect(r.woerter.map((v) => v.id)).toEqual(['e7', 'e8', 'n3'])
    expect(r.wieder).toBe(2)
    expect(r.entfernt).toEqual([{ teil: 'Unit 1 A', woerter: [w('w1', 'dog', 'Hund')], zeit: 1 }])
  })
})

const aufgabe = (id: string, regelId: string, satz: string): GrammatikAufgabe => ({ id, art: 'luecke', regelId, anweisung: 'Setze ein.', satz, loesungen: ['x'] })
const paket = (n: number, start = 0, regel = { id: 'r1', titel: 'Simple past' }): GrammatikPaket => ({
  thema: 'Simple past',
  regeln: [{ ...regel, erklaerung: 'Vergangenheit.', beispiele: [] }],
  aufgaben: Array.from({ length: n }, (_, i) => aufgabe(`a${i + 1}`, regel.id, `Satz ${start + i + 1} ___`))
})

describe('Grammatik (rein)', () => {
  it('gleiches Thema: Katalog-Kennung oder gleicher Titel', () => {
    expect(gleichesThema({ titel: 'A', themen: ['en.tense.past'] }, { titel: 'B', themen: ['en.tense.past'] })).toBe(true)
    expect(gleichesThema({ titel: 'Simple past', themen: [] }, { titel: ' simple Past ' })).toBe(true)
    expect(gleichesThema({ titel: 'Simple past', themen: ['x'] }, { titel: 'Present', themen: ['y'] })).toBe(false)
  })
  it('führt Pakete zusammen: alte Kennungen bleiben, neue Aufgaben kommen dazu', () => {
    const alt = paket(8)
    const neu = paket(10, 5, { id: 'r9', titel: 'Simple Past' })
    const { paket: p, dazu } = paketeZusammen(alt, neu)
    expect(dazu).toBe(7)
    expect(p.aufgaben.slice(0, 8)).toEqual(alt.aufgaben)
    expect(new Set(p.aufgaben.map((a) => a.id)).size).toBe(15)
    expect(p.regeln).toHaveLength(1)
    expect(p.aufgaben.every((a) => a.regelId === 'r1')).toBe(true)
  })
  // „+ Aufgaben" (08.10.2026): frische Kennungen, nie die einer gelöschten Aufgabe; Doppeltes fällt weg
  it('hängt Aufgaben an: alte Kennungen bleiben, neue bekommen frische Kennungen', () => {
    const alt = paket(6)
    alt.aufgaben.splice(2, 1) // a3 gelöscht – ihr Lernstand liegt evtl. noch beim Kind
    const neu = paket(4, 4) // a1…a4 mit Satz 5…8 – Satz 5/6 gibt es schon
    const { paket: p, dazu } = aufgabenAnhaengen(alt, neu, 'm1')
    expect(dazu).toBe(2)
    expect(p.aufgaben.slice(0, 5)).toEqual(alt.aufgaben)
    const neue = p.aufgaben.slice(5)
    expect(neue.map((a) => a.satz)).toEqual(['Satz 7 ___', 'Satz 8 ___'])
    expect(neue.every((a) => a.id.startsWith('m1-'))).toBe(true)
    expect(neue.some((a) => a.id === 'a3')).toBe(false)
    expect(new Set(p.aufgaben.map((a) => a.id)).size).toBe(p.aufgaben.length)
    // Die Bereinigung behält alle Kennungen
    expect(paketBereinigt(p, 'Simple past').aufgaben.map((a) => a.id)).toEqual(p.aufgaben.map((a) => a.id))
  })
  it('anhängen mit ungültigem Präfix fällt auf „n" zurück und ordnet Regeln über den Titel zu', () => {
    const { paket: p } = aufgabenAnhaengen(paket(2), paket(1, 9, { id: 'r7', titel: 'simple past' }), '1-ungültig')
    expect(p.aufgaben[2]).toMatchObject({ id: 'n-1', regelId: 'r1' })
  })
})

// ------------------------------------------------------------------------------------------------- mit Datenbank

let lk: NutzerInfo
let mia: NutzerInfo
let gruppe = ''
let kurs = ''

async function rufe(
  route: (k: Anfrage) => Promise<boolean>,
  n: NutzerInfo,
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
    sitzung: { nutzer: n, kennung: 'probe' },
    ip: '',
    koerper: async () => koerper
  } as unknown as Anfrage
  await route(k)
  return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
}
const vok = (m: 'GET' | 'POST', pfad: string, k?: Record<string, unknown>) => rufe(vokabelRoute('http://x'), lk, m, pfad, k)
const gram = (m: 'GET' | 'POST', pfad: string, k?: Record<string, unknown>) => rufe(grammatikRoute('http://x'), lk, m, pfad, k)

const wortStand = { fach: 3, faellig: 0, frei: [], erkannt: 1, erkennenVersuche: 1, versuche: 4, falsch: 1, fehlerTexte: [], zuletzt: Date.now() }

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  lk = nutzerAnlegen({ benutzer: 'l.entfernen', name: 'Lea Lehrer', rolle: 'lehrkraft', quelle: 'test' })
  mia = nutzerAnlegen({ benutzer: 'mia.entfernen', name: 'Mia Probe', rolle: 'schueler', quelle: 'lokal' })
  lerngruppenVon(lk.id)
  gruppe = randomBytes(6).toString('hex')
  datenbank()
    .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(gruppe, lk.id, '6b', 'Englisch', '', JSON.stringify([mia.benutzer]), new Date().toISOString())
  kurs = vokabelnZuweisen({
    lehrkraftId: lk.id,
    lerngruppeId: gruppe,
    schueler: [],
    titel: 'Unit 1',
    sprache: 'en',
    fach: 'Englisch',
    woerter: [w('w1', 'dog', 'Hund'), w('w2', 'cat', 'Katze'), w('w3', 'bird', 'Vogel'), w('w4', 'fish', 'Fisch')],
    teile: [
      { titel: 'Unit 1 A', anzahl: 2 },
      { titel: 'Unit 1 B', anzahl: 2 }
    ]
  })
  standSpeichern(kurs, mia.id, { woerter: { w3: { ...wortStand }, w4: { ...wortStand } }, tage: ['2026-10-07'] } as never)
})

const listeVonMia = () => vokabelListenFuer(mia).find((v) => v.id === kurs)!

describe('Abschnitt entfernen und wieder hinzufügen', () => {
  it('entfernt: Lernende sehen die Wörter nicht mehr, der Lernstand bleibt', async () => {
    expect(listeVonMia().uebersicht.gesamt).toBe(4)
    const r = await vok('POST', `/server/vokabeln/${kurs}/abschnitt-entfernen`, { index: 1, titel: 'Unit 1 B' })
    expect(r.code).toBe(200)
    expect(listeVonMia().uebersicht.gesamt).toBe(2)
    expect(Object.keys(standVon(kurs, mia.id).woerter)).toEqual(['w3', 'w4'])
    const g = await vok('GET', `/server/vokabeln/${kurs}`)
    expect((g.d.woerter as { id: string }[]).map((v) => v.id)).toEqual(['w1', 'w2'])
    expect(g.d.entfernt).toEqual([expect.objectContaining({ teil: 'Unit 1 B', anzahl: 2 })])
    expect((g.d.teile as { titel: string }[]).map((t) => t.titel)).toEqual(['Unit 1 A'])
  })
  it('ein neues Wort bekommt keine Kennung eines entfernten (kein fremder Lernstand)', async () => {
    const r = await vok('POST', `/server/vokabeln/${kurs}/woerter`, { titel: 'Eigene', woerter: [w('w3', 'horse', 'Pferd')] })
    expect(r.d).toMatchObject({ neu: 1, wieder: 0 })
    const g = await vok('GET', `/server/vokabeln/${kurs}`)
    const pferd = (g.d.woerter as { id: string; term: string }[]).find((v) => v.term === 'horse')!
    expect(['w3', 'w4']).not.toContain(pferd.id)
  })
  it('erneut hinzugefügt: alte Kennungen, Lernstand gilt weiter', async () => {
    const r = await vok('POST', `/server/vokabeln/${kurs}/woerter`, { titel: 'Unit 1 B', woerter: [w('x1', 'bird', 'Vogel'), w('x2', 'Fish', 'Fisch')] })
    expect(r.d).toMatchObject({ neu: 2, wieder: 2 })
    const g = await vok('GET', `/server/vokabeln/${kurs}`)
    expect((g.d.woerter as { id: string }[]).map((v) => v.id).slice(-2)).toEqual(['w3', 'w4'])
    expect(g.d.entfernt).toEqual([])
    const u = listeVonMia().uebersicht
    expect(u.gesamt).toBe(5)
    expect(u.neu).toBe(3)
  })
  it('endgültig löschen: Wörter und Lernstand sind weg', async () => {
    const g = await vok('GET', `/server/vokabeln/${kurs}`)
    const teile = g.d.teile as { titel: string }[]
    const i = teile.findIndex((t) => t.titel === 'Unit 1 B')
    const r = await vok('POST', `/server/vokabeln/${kurs}/abschnitt-loeschen`, { index: i, titel: 'Unit 1 B' })
    expect(r.code).toBe(200)
    expect(Object.keys(standVon(kurs, mia.id).woerter)).toEqual([])
    const g2 = await vok('GET', `/server/vokabeln/${kurs}`)
    expect(g2.d.entfernt).toEqual([])
    expect((g2.d.woerter as unknown[]).length).toBe(3)
  })
  it('auch ein schon entfernter Abschnitt lässt sich endgültig löschen', async () => {
    standSpeichern(kurs, mia.id, { woerter: { w1: { ...wortStand } }, tage: [] } as never)
    await vok('POST', `/server/vokabeln/${kurs}/abschnitt-entfernen`, { index: 0, titel: 'Unit 1 A' })
    expect(Object.keys(standVon(kurs, mia.id).woerter)).toEqual(['w1'])
    const r = await vok('POST', `/server/vokabeln/${kurs}/abschnitt-loeschen`, { entfernt: 0, titel: 'Unit 1 A' })
    expect(r.code).toBe(200)
    expect(Object.keys(standVon(kurs, mia.id).woerter)).toEqual([])
  })
})

const gramStand = (zid: string): Record<string, unknown> | null => {
  const z = datenbank().prepare('SELECT daten FROM gram_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(zid, mia.id) as { daten: string } | undefined
  return z ? (JSON.parse(z.daten) as { aufgaben: Record<string, unknown> }).aufgaben : null
}

describe('Grammatik entfernen und wieder hinzufügen', () => {
  const anlegen = (p: GrammatikPaket, themen: string[], titel = 'Simple past') =>
    grammatikAnlegen({
      lehrkraftId: lk.id,
      lerngruppeId: gruppe,
      schueler: [],
      titel,
      fach: 'Englisch',
      sprache: 'en',
      paket: p,
      code: false,
      bis: null,
      vokId: kurs,
      art: '',
      info: { themen, teilformen: [], jahrgang: 6 }
    })
  let gid = ''
  it('entfernt: für Lernende unsichtbar, Lernstand bleibt; Lehrkraft sieht Status und Schuljahr', async () => {
    gid = anlegen(paket(8), ['en.tense.past'])[0]
    datenbank()
      .prepare('INSERT INTO gram_stand (zuweisung_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?)')
      .run(gid, mia.id, JSON.stringify({ aufgaben: { a1: wortStand, a2: wortStand }, tage: [] }), Date.now())
    expect(grammatikFuer(mia).map((g) => g.id)).toContain(gid)
    expect((await gram('POST', `/server/grammatik/${gid}/entfernen`)).code).toBe(200)
    expect(grammatikFuer(mia).map((g) => g.id)).not.toContain(gid)
    expect(Object.keys(gramStand(gid) ?? {})).toEqual(['a1', 'a2'])
    const l = (await gram('GET', '/server/grammatik')).d.zuweisungen as { id: string; status: string; jahrgang: number | null; regeln: string[] }[]
    expect(l.find((x) => x.id === gid)).toMatchObject({ status: 'entfernt', jahrgang: 6, regeln: ['Simple past'] })
  })
  it('gleiches Thema erneut: das entfernte Training kommt zurück, neue Aufgaben dazu', () => {
    const ids = anlegen(paket(10, 4), ['en.tense.past'], 'Simple past (Wiederholung)')
    expect(ids).toEqual([gid])
    expect(grammatikFuer(mia).map((g) => g.id)).toContain(gid)
    const z = datenbank().prepare('SELECT paket FROM gram_zuweisungen WHERE id = ?').get(gid) as { paket: string }
    const p = JSON.parse(z.paket) as GrammatikPaket
    expect(p.aufgaben.slice(0, 8).map((a) => a.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'])
    expect(p.aufgaben).toHaveLength(14)
    expect(Object.keys(gramStand(gid) ?? {})).toEqual(['a1', 'a2'])
  })
  it('„+ Aufgaben": die Route hängt an, Kennungen und Lernstand bleiben; die Liste nennt die Themen', async () => {
    const zid = anlegen(paket(8, 100), ['en.tense.future'], 'Future')[0]
    datenbank()
      .prepare('INSERT INTO gram_stand (zuweisung_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?)')
      .run(zid, mia.id, JSON.stringify({ aufgaben: { a1: wortStand }, tage: [] }), Date.now())
    const neu = { aufgaben: [aufgabe('a1', 'r1', 'Neu 1 ___'), aufgabe('a2', 'r1', 'Neu 2 ___'), aufgabe('a3', 'r1', 'Satz 101 ___')] }
    const r = await gram('POST', `/server/grammatik/${zid}/anhaengen`, { paket: neu })
    expect(r.code).toBe(200)
    expect(r.d).toMatchObject({ dazu: 2, aufgaben: 10 })
    const z = datenbank().prepare('SELECT paket FROM gram_zuweisungen WHERE id = ?').get(zid) as { paket: string }
    const p = JSON.parse(z.paket) as GrammatikPaket
    expect(p.aufgaben.slice(0, 8).map((a) => a.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'])
    expect(p.aufgaben.slice(8).every((a) => /^m[a-z0-9]+-\d+$/.test(a.id))).toBe(true)
    expect(Object.keys(gramStand(zid) ?? {})).toEqual(['a1'])
    // Nur Doppeltes: abgelehnt
    expect((await gram('POST', `/server/grammatik/${zid}/anhaengen`, { paket: { aufgaben: [aufgabe('x', 'r1', 'Neu 1 ___')] } })).code).toBe(400)
    const l = (await gram('GET', '/server/grammatik')).d.zuweisungen as { id: string; themen: string[] }[]
    expect(l.find((x) => x.id === zid)?.themen).toEqual(['en.tense.future'])
    const d = (await gram('GET', `/server/grammatik/${zid}`)).d
    expect(d).toMatchObject({ sprache: 'en', info: { jahrgang: 6 } })
  })
  it('wiederherstellen und endgültig löschen (mit Lernstand)', async () => {
    await gram('POST', `/server/grammatik/${gid}/entfernen`)
    await gram('POST', `/server/grammatik/${gid}/wiederherstellen`)
    expect(grammatikFuer(mia).map((g) => g.id)).toContain(gid)
    expect((await gram('POST', `/server/grammatik/${gid}/loeschen`)).code).toBe(200)
    expect(gramStand(gid)).toBeNull()
  })
})
