import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  abschnittsTermine,
  demnaechstText,
  ersteFreischaltung,
  verbenOhneGeplante,
  freieTeile,
  istVorbei,
  kursFuerLernende,
  naechsterSchultag,
  neuFreigeschaltet,
  planBereinigt,
  teilePlanen,
  testterminNach,
  type PlanTeil
} from '../src/shared/freigabePlan'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { vokabelnDerGruppe, vokabelRoute, vokabelListenFuer, zeile as vokZeile } from '../src/server/vokabeln'
import { blaetterRoute, blattIstFuer } from '../src/server/arbeitsblaetter'
import { lernenRoute, lernRaeume } from '../src/server/lernen'
import { gesehenBis, nochGeplant, planSetzen, planVorbei } from '../src/server/freigabePlan'
import { geplantFuerLehrkraft, planenRoute, planFuerLernende, zugangPlan } from '../src/server/planen'
import { SENSIBEL } from '../src/server/feldschutz'
import type { Anfrage } from '../src/server/http'

const TAG = 86_400_000

/*
 * Freischaltungen planen (09.10.2026): „Planen …" neben „Jetzt freischalten" – Lernende sehen bis zum Zeitpunkt nichts
 * (außer „Demnächst"), danach den Inhalt und einmal „Neu freigeschaltet". Vokabelabschnitte nacheinander, Testtermin am
 * letzten Abschnitt, Ende („bis") = danach nur ansehen.
 */
describe('Planung (rein)', () => {
  it('nächster Schultag 7:30 überspringt das Wochenende', () => {
    const fr = new Date(2026, 9, 9, 15, 0) // Freitag
    const d = naechsterSchultag(fr)
    expect([d.getDay(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([1, 12, 7, 30])
    const mo = naechsterSchultag(new Date(2026, 9, 12, 6, 0))
    expect([mo.getDay(), mo.getDate()]).toEqual([2, 13])
  })
  it('Abschnitte nacheinander im Abstand, Testtermin hinter dem letzten', () => {
    const start = new Date(2026, 9, 12, 7, 30).getTime()
    const t = abschnittsTermine(start, 3, 7)
    expect(t.map((x) => new Date(x).getDate())).toEqual([12, 19, 26])
    // über die Zeitumstellung (25.10.) bleibt es 7:30
    expect(new Date(t[2]).getHours()).toBe(7)
    const test = new Date(testterminNach(t[2], 7))
    expect([test.getMonth(), test.getDate(), test.getHours()]).toEqual([10, 2, 8])
  })
  it('bereinigt die Angaben: Vergangenes heißt „jetzt", ein Ende vor dem Beginn fällt weg', () => {
    const jetzt = Date.now()
    expect(planBereinigt({ ab: jetzt - 1000 }, jetzt).ab).toBeNull()
    expect(planBereinigt({ ab: jetzt + TAG, bis: jetzt + 1000 }, jetzt).bis).toBeNull()
    const p = planBereinigt({ ab: jetzt + TAG, bis: jetzt + 3 * TAG, teile: [null, jetzt + 2 * TAG], testAbstand: 7 }, jetzt)
    expect(p).toEqual({ ab: jetzt + TAG, bis: jetzt + 3 * TAG, teile: [null, jetzt + 2 * TAG], testAbstand: 7 })
    expect(planBereinigt({ ab: jetzt + 9999 * TAG }, jetzt).ab).toBe(jetzt + 400 * TAG)
    expect(planBereinigt(undefined, jetzt)).toEqual({ ab: null, bis: null, teile: [], testAbstand: null })
  })
  it('nur freie Abschnitte samt Wörtern; der letzte Abschnitt nimmt den Rest', () => {
    const jetzt = 1000
    const teile: PlanTeil[] = [
      { titel: 'A', anzahl: 2, zeit: 1 },
      { titel: 'B', anzahl: 1, zeit: 5000, ab: 5000 },
      { titel: 'C', anzahl: 1, zeit: 2 }
    ]
    const f = freieTeile(teile, ['a1', 'a2', 'b1', 'c1', 'c2'], jetzt)
    expect(f.woerter).toEqual(['a1', 'a2', 'c1', 'c2'])
    expect(f.teile.map((t) => [t.titel, t.anzahl])).toEqual([
      ['A', 2],
      ['C', 2]
    ])
    expect(freieTeile(teile, ['a1', 'a2', 'b1', 'c1'], 6000).woerter).toHaveLength(4)
  })
  it('plant neue Abschnitte ab ihrer Stelle und koppelt den Test an den letzten', () => {
    const teile: PlanTeil[] = [
      { titel: 'Alt', anzahl: 3, zeit: 1 },
      { titel: 'N1', anzahl: 2, zeit: 9 },
      { titel: 'N2', anzahl: 2, zeit: 9 }
    ]
    const p = planBereinigt({ teile: [null, Date.now() + 7 * TAG], testAbstand: 5 })
    const neu = teilePlanen(teile, 1, p)
    expect(neu[0]).toEqual(teile[0])
    expect(neu[1].ab).toBeUndefined()
    expect(neu[2].ab).toBe(p.teile[1])
    expect(neu[2].zeit).toBe(p.teile[1])
    expect(neu[2].testAbstand).toBe(5)
  })
  it('Sicht der Lernenden auf einen Kurs: Wörter, Abschnitte und Herkunft ohne Geplantes', () => {
    const jetzt = Date.now()
    const z = {
      titel: 'Kurs',
      erstellt: new Date().toISOString(),
      woerter: JSON.stringify([{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }]),
      teile: JSON.stringify([
        { titel: 'Unit 1 · Station 1', anzahl: 2, zeit: 1 },
        { titel: 'Unit 2 · Station 1', anzahl: 1, zeit: jetzt + TAG, ab: jetzt + TAG }
      ]),
      quelle: JSON.stringify({ lehrwerk: 'gl1', unit: 'Unit 2', abschnitte: [], units: [{ unit: 'Unit 1', abschnitte: ['Station 1'] }, { unit: 'Unit 2', abschnitte: ['Station 1'] }] })
    }
    const l = kursFuerLernende(z, jetzt)
    expect(JSON.parse(l.woerter)).toEqual([{ id: 'w1' }, { id: 'w2' }])
    expect(JSON.parse(l.teile).map((t: PlanTeil) => t.titel)).toEqual(['Unit 1 · Station 1'])
    expect(JSON.parse(l.quelle).units).toEqual([{ unit: 'Unit 1', abschnitte: ['Station 1'] }])
    // nach dem Zeitpunkt ist alles da
    expect(JSON.parse(kursFuerLernende(z, jetzt + 2 * TAG).woerter)).toHaveLength(3)
    // ohne geplante Abschnitte unverändert (dasselbe Objekt)
    const ohne = { ...z, teile: '' }
    expect(kursFuerLernende(ohne)).toBe(ohne)
  })
  it('„Neu freigeschaltet" nur seit dem letzten Hinweis, „Demnächst" mit Datum', () => {
    const jetzt = new Date(2026, 9, 12, 12, 0).getTime()
    const l = [
      { ab: jetzt - 2 * TAG, titel: 'alt' },
      { ab: jetzt - 1000, titel: 'frisch' },
      { ab: jetzt + TAG, titel: 'kommt' }
    ]
    expect(neuFreigeschaltet(l, jetzt - TAG, jetzt).map((x) => x.titel)).toEqual(['frisch'])
    expect(neuFreigeschaltet(l, null, jetzt).map((x) => x.titel)).toEqual(['alt', 'frisch'])
    expect(demnaechstText({ ab: new Date(2026, 9, 13, 7, 30).getTime(), titel: 'Unit 2 · Station 1' })).toBe('Ab Di., 13.10.: Unit 2 · Station 1')
    expect(demnaechstText({ ab: new Date(2026, 9, 13, 10, 0).getTime(), titel: 'X' })).toBe('Ab Di., 13.10., 10:00 Uhr: X')
  })
  it('Verbkarten geplanter Abschnitte warten mit ihnen; eigene Karten der Lehrkraft bleiben', () => {
    const karten = [{ schluessel: 'go' }, { schluessel: 'take' }, { schluessel: 'be' }]
    expect(verbenOhneGeplante(karten, [{ term: 'go' }], [{ term: 'take' }]).map((k) => k.schluessel)).toEqual(['go', 'be'])
    const jetzt = Date.now()
    const z = {
      titel: 'K',
      erstellt: '',
      woerter: JSON.stringify([{ id: 'a', term: 'go' }, { id: 'b', term: 'take' }]),
      teile: JSON.stringify([
        { titel: 'S1', anzahl: 1, zeit: 1 },
        { titel: 'S2', anzahl: 1, zeit: jetzt + TAG, ab: jetzt + TAG }
      ]),
      verben: JSON.stringify({ sprache: 'en', karten })
    }
    expect(JSON.parse(kursFuerLernende(z, jetzt).verben).karten.map((k: { schluessel: string }) => k.schluessel)).toEqual(['go', 'be'])
    expect(JSON.parse(kursFuerLernende(z, jetzt + 2 * TAG).verben).karten).toHaveLength(3)
  })
  it('Code-Seite: erster Zeitpunkt nur, solange noch kein Abschnitt frei ist', () => {
    const jetzt = Date.now()
    const t = (ab?: number): PlanTeil => ({ titel: 'x', anzahl: 1, zeit: 1, ...(ab ? { ab } : {}) })
    expect(ersteFreischaltung(JSON.stringify([t(jetzt + 2 * TAG), t(jetzt + TAG)]), jetzt)).toBe(jetzt + TAG)
    expect(ersteFreischaltung(JSON.stringify([t(), t(jetzt + TAG)]), jetzt)).toBeNull()
    expect(ersteFreischaltung('', jetzt)).toBeNull()
  })
  it('Ende erreicht', () => {
    expect(istVorbei(null)).toBe(false)
    expect(istVorbei(Date.now() - 1)).toBe(true)
    expect(istVorbei(Date.now() + TAG)).toBe(false)
  })
})

// ---------------------------------------------------------------- Server

let lk: NutzerInfo
let mia: NutzerInfo
let ben: NutzerInfo
let gruppe = ''

async function rufe(
  route: (k: Anfrage) => Promise<boolean>,
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
  await route(k)
  return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
}
const vok = vokabelRoute('http://x')
const planen = planenRoute()
const lernen = lernenRoute()

const WOERTER = ['dog', 'cat', 'bird', 'fish', 'cow', 'pig'].map((t, i) => ({ id: `w${i}`, term: t, translation: `T${i}` }))

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  lk = nutzerAnlegen({ benutzer: 'p.plan', name: 'Pia Plan', rolle: 'lehrkraft', quelle: 'test' })
  mia = nutzerAnlegen({ benutzer: 'mia.plan', name: 'Mia Plan', rolle: 'schueler', quelle: 'lokal' })
  ben = nutzerAnlegen({ benutzer: 'ben.anders', name: 'Ben Anders', rolle: 'schueler', quelle: 'lokal' })
  lerngruppenVon(lk.id)
  gruppe = randomBytes(6).toString('hex')
  datenbank()
    .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(gruppe, lk.id, '6a', 'Englisch', '', JSON.stringify([mia.benutzer]), new Date().toISOString())
})
afterEach(() => {
  vi.useRealTimers()
})

describe('Vokabelabschnitte nacheinander freischalten', () => {
  let kurs = ''
  const jetzt = Date.now()
  const ab2 = jetzt + 7 * TAG
  const ab3 = jetzt + 14 * TAG
  it('legt einen Kurs mit drei Abschnitten an – zwei geplant, Test am letzten', async () => {
    const r = await rufe(vok, lk, 'POST', '/server/vokabeln/freigeben', {
      titel: '6a - Englisch',
      sprache: 'en',
      fach: 'Englisch',
      woerter: WOERTER,
      lerngruppeId: gruppe,
      teile: [
        { titel: 'Unit 1 · Station 1', anzahl: 2 },
        { titel: 'Unit 1 · Station 2', anzahl: 2 },
        { titel: 'Unit 2 · Station 1', anzahl: 2 }
      ],
      plan: { teile: [null, ab2, ab3], testAbstand: 7 }
    })
    expect(r.code).toBe(200)
    expect(r.d.geplant).toBe(true)
    kurs = String(r.d.id)
    expect(vokZeile(kurs)!.test_termin).toBe(testterminNach(ab3, 7))
  })
  it('Lernende sehen nur den freien Abschnitt – in der Liste, im Kasten und als Antwortziel', async () => {
    const liste = vokabelListenFuer(mia).find((x) => x.id === kurs)!
    expect(liste.uebersicht.gesamt).toBe(2)
    const d = (await rufe(vok, mia, 'GET', `/s/api/vokabeln/liste?id=${kurs}`)).d
    expect((d.woerter as { id: string }[]).map((w) => w.id)).toEqual(['w0', 'w1'])
    const a = await rufe(vok, mia, 'POST', '/s/api/vokabeln/antwort', { id: kurs, wortId: 'w4', uebung: 'karte', gewusst: true })
    expect(a.code).toBe(400)
  })
  it('die Lehrkraft sieht alles – geplante Abschnitte mit „ab"; die Kennzahlen zählen nur Freies', async () => {
    const d = (await rufe(vok, lk, 'GET', `/server/vokabeln/${kurs}`)).d
    expect((d.woerter as unknown[]).length).toBe(6)
    expect((d.teile as PlanTeil[]).map((t) => t.ab ?? null)).toEqual([null, ab2, ab3])
    expect((d.gesamt as { gesamt: number }).gesamt).toBe(2)
    const g = vokabelnDerGruppe(lk.id, gruppe, Date.now(), true)
    const t = g.trainings.find((x) => x.id === kurs)!
    expect(t.woerter).toBe(2)
    expect(t.abschnitte).toHaveLength(3)
    expect(g.jePerson[mia.id].gesamt).toBe(2)
  })
  it('„Demnächst" für Lernende der Gruppe, nicht für andere; Zeitleiste der Lehrkraft', () => {
    const p = planFuerLernende(mia)
    expect(p.demnaechst.map((e) => [e.typ, e.titel, e.ab])).toEqual([
      ['vok', 'Unit 1 · Station 2', ab2],
      ['vok', 'Unit 2 · Station 1', ab3]
    ])
    expect(planFuerLernende(ben).demnaechst).toEqual([])
    const z = geplantFuerLehrkraft(lk.id, gruppe)
    expect(z.map((e) => [e.typ, e.teil])).toEqual([
      ['vok', 1],
      ['vok', 2]
    ])
  })
  it('verschieben rückt den gekoppelten Testtermin mit; „jetzt freischalten" gibt die Wörter frei', async () => {
    const neu = ab3 + 2 * TAG
    expect((await rufe(planen, lk, 'POST', '/server/planen/verschieben', { typ: 'vok', id: kurs, teil: 2, ab: neu })).code).toBe(200)
    expect(vokZeile(kurs)!.test_termin).toBe(testterminNach(neu, 7))
    expect((await rufe(planen, mia, 'POST', '/server/planen/jetzt', { typ: 'vok', id: kurs, teil: 1 })).code).toBe(403)
    expect((await rufe(planen, lk, 'POST', '/server/planen/jetzt', { typ: 'vok', id: kurs, teil: 1 })).code).toBe(200)
    expect(vokabelListenFuer(mia).find((x) => x.id === kurs)!.uebersicht.gesamt).toBe(4)
  })
  it('mit der Zeit kommt der Rest von selbst – ohne Zeitplaner', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(ab3 + 3 * TAG)
    expect(vokabelListenFuer(mia).find((x) => x.id === kurs)!.uebersicht.gesamt).toBe(6)
    expect(planFuerLernende(mia).demnaechst).toEqual([])
  })
  it('„Vokabeln hinzufügen" mit Plan: nur die neuen Abschnitte warten', async () => {
    const ab = Date.now() + 3 * TAG
    const r = await rufe(vok, lk, 'POST', `/server/vokabeln/${kurs}/woerter`, {
      woerter: [
        { id: 'x1', term: 'horse', translation: 'Pferd' },
        { id: 'x2', term: 'sheep', translation: 'Schaf' }
      ],
      titel: 'Unit 3 · Station 1',
      plan: { ab }
    })
    expect(r.d.geplant).toBe(true)
    // wieder echte Zeit: Station 2 ist frei (jetzt freigeschaltet), Unit 2 und die neue Unit 3 warten
    expect(vokabelListenFuer(mia).find((x) => x.id === kurs)!.uebersicht.gesamt).toBe(4)
    const d = (await rufe(vok, lk, 'GET', `/server/vokabeln/${kurs}`)).d
    expect((d.teile as PlanTeil[]).at(-1)!.ab).toBe(ab)
  })
})

describe('Material: unsichtbar bis zum Zeitpunkt, danach mit Hinweis', () => {
  it('Arbeitsblatt (Freigabeprüfung blattIstFuer)', () => {
    const z = { id: 'blatt-probe', lerngruppe_id: gruppe, schueler: '[]' } as unknown as Parameters<typeof blattIstFuer>[0]
    // Tabelle anlegen (die Prüfung fragt nach Gästen)
    expect(blattIstFuer(z, mia)).toBe(true)
    planSetzen({ typ: 'blatt', id: 'blatt-probe', lehrkraftId: lk.id, lerngruppeId: gruppe, ab: Date.now() + TAG })
    expect(nochGeplant('blatt', 'blatt-probe')).toBe(true)
    expect(blattIstFuer(z, mia)).toBe(false)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 2 * TAG)
    expect(blattIstFuer(z, mia)).toBe(true)
  })
  it('Tafelbild über die Freigabe-Route: „Demnächst", dann Inhalt und einmal „Neu freigeschaltet"', async () => {
    const ab = Date.now() + 60_000
    const r = await rufe(lernen, lk, 'POST', '/server/tafeln/freigeben', {
      lerngruppeId: gruppe,
      titel: 'Satzbau',
      fach: 'Englisch',
      bilder: ['<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
      plan: { ab }
    })
    expect(r.d.geplant).toBe(true)
    const id = String(r.d.id)
    expect((await rufe(lernen, mia, 'GET', `/s/api/tafel?id=${id}`)).code).toBe(404)
    expect(lernRaeume(mia).flatMap((x) => x.mappen.flatMap((m) => m.seiten)).some((s) => s.id === id)).toBe(false)
    expect(planFuerLernende(mia).demnaechst.some((e) => e.typ === 'tafel' && e.titel === 'Satzbau')).toBe(true)
    expect(planFuerLernende(ben).demnaechst.some((e) => e.typ === 'tafel')).toBe(false)
    expect(geplantFuerLehrkraft(lk.id, gruppe).some((e) => e.typ === 'tafel' && e.id === id)).toBe(true)

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(ab + 1000)
    expect((await rufe(lernen, mia, 'GET', `/s/api/tafel?id=${id}`)).code).toBe(200)
    expect(planFuerLernende(mia).neu.some((e) => e.typ === 'tafel' && e.id === id)).toBe(true)
    // gesehen: kein zweites Mal
    await rufe(planen, mia, 'POST', '/s/api/geplant/gesehen')
    expect(gesehenBis(mia.id)).toBe(ab + 1000)
    expect(planFuerLernende(mia).neu).toEqual([])
  })
  it('absagen löscht die geplante Freigabe; Freigegebenes lässt sich nicht absagen', async () => {
    const ab = Date.now() + TAG
    const r = await rufe(lernen, lk, 'POST', '/server/tafeln/freigeben', { lerngruppeId: gruppe, titel: 'Weg', bilder: ['<svg></svg>'], plan: { ab } })
    const id = String(r.d.id)
    expect((await rufe(planen, ben, 'POST', '/server/planen/absagen', { typ: 'tafel', id })).code).toBe(403)
    expect((await rufe(planen, lk, 'POST', '/server/planen/absagen', { typ: 'tafel', id })).code).toBe(200)
    expect(datenbank().prepare('SELECT 1 FROM tafel_freigaben WHERE id = ?').get(id)).toBeUndefined()
    const r2 = await rufe(lernen, lk, 'POST', '/server/tafeln/freigeben', { lerngruppeId: gruppe, titel: 'Sofort', bilder: ['<svg></svg>'] })
    expect(r2.d.geplant).toBe(false)
    expect((await rufe(planen, lk, 'POST', '/server/planen/absagen', { typ: 'tafel', id: String(r2.d.id) })).code).toBe(404)
  })
  it('Code-Seite vor dem Zeitpunkt: Zeitpunkt und „schon dabei" (ohne Blick auf die Planung)', async () => {
    const ab = Date.now() + TAG
    const r = await rufe(lernen, lk, 'POST', '/server/tafeln/freigeben', { lerngruppeId: gruppe, titel: 'Bald', bilder: ['<svg></svg>'], plan: { ab } })
    expect(zugangPlan('tafel', String(r.d.id), mia)).toEqual({ geplantAb: ab, dabei: true })
    expect(zugangPlan('tafel', String(r.d.id), ben)).toEqual({ geplantAb: ab, dabei: false })
    // Vokabeln per QR-Code, noch kein Abschnitt frei
    const v = await rufe(vok, lk, 'POST', '/server/vokabeln/freigeben', {
      titel: 'Code-Kurs',
      sprache: 'en',
      fach: 'Englisch',
      woerter: WOERTER.slice(0, 2),
      gaeste: true,
      plan: { ab }
    })
    const code = String(vokZeile(String(v.d.id))!.code)
    const z = await rufe(vok, null, 'GET', `/s/api/vokabeln/zugang?code=${code}`)
    expect(z.d.geplantAb).toBe(ab)
    // Beitritt mit Konto klappt schon vorher – der Kurs erscheint dann von selbst
    expect((await rufe(vok, ben, 'POST', '/s/api/vokabeln/gast', { code })).code).toBe(200)
    expect(planFuerLernende(ben).demnaechst.some((e) => e.typ === 'vok' && e.id === v.d.id)).toBe(true)
  })
  it('erster Abruf: kein Rückstau an Hinweisen', () => {
    const lea = nutzerAnlegen({ benutzer: 'lea.neu', name: 'Lea Neu', rolle: 'schueler', quelle: 'lokal' })
    const g = lerngruppenVon(lk.id).find((x) => x.id === gruppe)!
    datenbank().prepare('UPDATE lerngruppen SET mitglieder = ? WHERE id = ?').run(JSON.stringify([...g.mitglieder, lea.benutzer]), gruppe)
    planSetzen({ typ: 'tafel', id: 'frueher', lehrkraftId: lk.id, lerngruppeId: gruppe, ab: Date.now() - 1000 })
    expect(gesehenBis(lea.id)).toBeNull()
    expect(planFuerLernende(lea).neu).toEqual([])
    expect(gesehenBis(lea.id)).not.toBeNull()
  })
  it('Arbeitsblatt-Frist bleibt Erinnerung – hart nur mit Haken oder geplantem Ende', async () => {
    const blaetter = blaetterRoute(async () => undefined, 'http://x')
    const freigeben = async (einstellungen: Record<string, unknown>, plan?: Record<string, unknown>): Promise<string> => {
      const r = await rufe(blaetter, lk, 'POST', '/server/blaetter/freigeben', {
        titel: 'Frist',
        html: '<div class="ws-page"><p>x</p></div>',
        aufgaben: [{ nr: 1, anweisung: 'Schreibe.', erwartung: 'Ein Satz.' }],
        rueckmeldung: {
          version: 1,
          meta: { title: 'Frist', subjectId: 'englisch', subjectLabel: 'Englisch', grade: 6, anrede: 'du', schwerpunkt: '' },
          grundlage: { art: 'frei', titel: 'Frist', aufgaben: 'Schreibe.', erwartung: 'Ein Satz.' },
          abgaben: [],
          createdAt: new Date().toISOString()
        },
        lerngruppeId: gruppe,
        schueler: [],
        einstellungen: { feedback: false, ...einstellungen },
        ...(plan ? { plan } : {})
      })
      expect(r.code).toBe(200)
      return String(r.d.id)
    }
    const offen = async (id: string): Promise<unknown> => (await rufe(blaetter, mia, 'GET', `/s/api/blatt?id=${id}`)).d.offen
    const vorbei = Date.now() - 1000
    expect(await offen(await freigeben({ bis: vorbei }))).toBe(true)
    expect(await offen(await freigeben({ bis: vorbei, fristHart: true }))).toBe(false)
    const mitPlan = await freigeben({}, { ab: Date.now() + 1000, bis: Date.now() + 2000 })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 5000)
    expect(await offen(mitPlan)).toBe(false)
  })
  it('Ende aus der Planung: danach nur noch ansehen', () => {
    planSetzen({ typ: 'reihe', id: 'reihe-probe', lehrkraftId: lk.id, ab: Date.now() + TAG, bis: Date.now() + 2 * TAG })
    expect(planVorbei('reihe', 'reihe-probe')).toBe(false)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 3 * TAG)
    expect(nochGeplant('reihe', 'reihe-probe')).toBe(false)
    expect(planVorbei('reihe', 'reihe-probe')).toBe(true)
  })
})

describe('Datenschutz der neuen Tabellen', () => {
  it('nur Kennungen und Zeiten im Klartext – kein Name, kein Titel', () => {
    const quelle = readFileSync(join(__dirname, '..', 'src', 'server', 'freigabePlan.ts'), 'utf8')
    const spalten = [...quelle.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([^;]*?)\n\);/g)].flatMap((m) =>
      m[2]
        .split('\n')
        .map((z) => /^\s*(\w+)/.exec(z)?.[1])
        .filter((x): x is string => Boolean(x) && !/^(PRIMARY|UNIQUE)$/.test(x!))
        .map((s) => `${m[1]}.${s}`)
    )
    expect(spalten).toEqual([
      'freigabe_plan.typ',
      'freigabe_plan.ziel_id',
      'freigabe_plan.lehrkraft_id',
      'freigabe_plan.lerngruppe_id',
      'freigabe_plan.ab',
      'freigabe_plan.bis',
      'plan_gesehen.nutzer_id',
      'plan_gesehen.bis'
    ])
    expect(SENSIBEL.freigabe_plan).toBeUndefined()
    // Vokabelabschnitte tragen ihr „ab" in der verschlüsselten Spalte teile
    expect(SENSIBEL.vok_zuweisungen).toContain('teile')
  })
})
