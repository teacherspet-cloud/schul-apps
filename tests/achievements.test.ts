import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { vokabelnZuweisen, vokabelRoute } from '../src/server/vokabeln'
import { achievementsRoute } from '../src/server/achievements'
import type { Anfrage } from '../src/server/http'
import { berechneAchievements, besteSerie, hatComeback, LEERE_ZAEHLER, wochenMitZiel, type AchEingabe } from '../src/shared/achievements'

const eingabe = (e: Partial<AchEingabe> = {}): AchEingabe => ({
  tage: [],
  wochenziel: 3,
  woerter: { gelernt: 0, sicher: 0, langzeit: 0 },
  lehrwerk: [],
  regeln: [],
  warSchwaeche: [],
  extrasGeschafft: 0,
  spiele: 0,
  zaehler: { ...LEERE_ZAEHLER },
  ...e
})
const erreicht = (e: AchEingabe): string[] => berechneAchievements(e).filter((a) => a.erreicht).map((a) => a.id)

describe('Serie (Wochenende unterbricht nicht)', () => {
  it('Do, Fr, Mo, Di: das Wochenende ohne Übung bricht die Serie nicht', () => {
    // 2026-10-08 ist ein Donnerstag
    expect(besteSerie(['2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13'])).toBe(4)
  })
  it('Übung am Wochenende zählt als Tag dazu', () => {
    expect(besteSerie(['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'])).toBe(4)
  })
  it('ein Werktag ohne Übung beendet die Serie', () => {
    // Mo, Di, (Mi fehlt), Do, Fr
    expect(besteSerie(['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09'])).toBe(2)
  })
  it('doppelte und ungeordnete Tage stören nicht; leer = 0', () => {
    expect(besteSerie(['2026-10-06', '2026-10-05', '2026-10-05'])).toBe(2)
    expect(besteSerie([])).toBe(0)
  })
  it('die beste Serie zählt, auch wenn sie vorbei ist', () => {
    const lang = Array.from({ length: 10 }, (_, i) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10))
    expect(besteSerie([...lang, '2026-10-01'])).toBe(10)
  })
})

describe('Comeback und Wochenziel', () => {
  it('Comeback erst nach mindestens 14 Tagen Pause', () => {
    expect(hatComeback(['2026-09-01', '2026-09-15'])).toBe(false) // 13 Tage dazwischen
    expect(hatComeback(['2026-09-01', '2026-09-16'])).toBe(true) // 14 Tage dazwischen
  })
  it('Wochen mit erreichtem Ziel (Montag bis Sonntag)', () => {
    // Woche ab Mo 05.10.: 3 Tage; Woche ab Mo 12.10.: 2 Tage
    const tage = ['2026-10-05', '2026-10-07', '2026-10-11', '2026-10-12', '2026-10-13']
    expect(wochenMitZiel(tage, 3)).toBe(1)
    expect(wochenMitZiel(tage, 2)).toBe(2)
  })
})

describe('Katalog', () => {
  it('ohne Daten ist nichts erreicht; der feste Katalog hat rund 40 Einträge', () => {
    const k = berechneAchievements(eingabe())
    expect(k.filter((a) => a.erreicht)).toEqual([])
    expect(k.length).toBeGreaterThanOrEqual(38)
    expect(new Set(k.map((a) => a.id)).size).toBe(k.length)
  })
  it('Stufen: 120 sichere Wörter → 50 und 100, nicht 250', () => {
    const ids = erreicht(eingabe({ woerter: { gelernt: 300, sicher: 120, langzeit: 0 } }))
    expect(ids).toContain('sicher-50')
    expect(ids).toContain('sicher-100')
    expect(ids).not.toContain('sicher-250')
  })
  it('Lehrwerk: je Unit sicher und je Band kennengelernt, mit Titel', () => {
    const k = berechneAchievements(
      eingabe({
        lehrwerk: [{ buch: 'gl1', name: 'Green Line 1', gesamt: 400, gelernt: 210, units: [{ unit: 'Unit 3', gesamt: 50, sicher: 41 }] }]
      })
    )
    const u80 = k.find((a) => a.id === 'unit:gl1:Unit 3:80')
    expect(u80?.titel).toBe('Unit 3 (Green Line 1) zu 80 % sicher')
    expect(u80?.erreicht).toBe(true)
    expect(k.find((a) => a.id === 'unit:gl1:Unit 3:100')?.erreicht).toBe(false)
    expect(k.find((a) => a.id === 'band:gl1:50')?.erreicht).toBe(true)
    expect(k.find((a) => a.id === 'band:gl1:75')?.erreicht).toBe(false)
  })
  it('Grammatik: sichere Regeln, Schwäche wird Stärke, Extra', () => {
    const regeln = [
      { schluessel: 'simplepast', sicher: true, schwaeche: false, staerke: false },
      { schluessel: 'plural', sicher: false, schwaeche: false, staerke: true }
    ]
    expect(erreicht(eingabe({ regeln }))).toContain('regel-1')
    expect(erreicht(eingabe({ regeln }))).not.toContain('schwaeche-staerke')
    expect(erreicht(eingabe({ regeln, warSchwaeche: ['plural'] }))).toContain('schwaeche-staerke')
    // Ist sie noch eine Schwäche, zählt es nicht
    expect(erreicht(eingabe({ regeln: [{ schluessel: 'x', sicher: true, schwaeche: true, staerke: false }], warSchwaeche: ['x'] }))).not.toContain(
      'schwaeche-staerke'
    )
    expect(erreicht(eingabe({ extrasGeschafft: 1 }))).toContain('extra')
  })
  it('Zähler: Rekorde, Blitzrunde, Diktate, Handschrift, Verbformen, fehlerfreie Tage', () => {
    const ids = erreicht(
      eingabe({
        spiele: 10,
        zaehler: { ...LEERE_ZAEHLER, rekordeGebrochen: 10, blitzFehlerfrei: 1, verbformen: 260, diktate: 50, handschrift: 100, fehlerfreieTage: 1 }
      })
    )
    for (const id of ['rekord-1', 'rekord-10', 'spiele-10', 'blitz-fehlerfrei', 'stammformen-250', 'diktat-50', 'hand-100', 'fehlerfrei-1'])
      expect(ids).toContain(id)
    expect(ids).not.toContain('rekord-50')
    expect(berechneAchievements(eingabe()).find((a) => a.id === 'stammformen-250')?.titel).toBe('Stammformen-Profi')
  })
  it('Dranbleiben aus den Übungstagen', () => {
    const tage = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13']
    const ids = erreicht(eingabe({ tage }))
    expect(ids).toContain('serie-3')
    expect(ids).toContain('serie-7')
    expect(ids).not.toContain('serie-14')
    expect(ids).toContain('wochenziel-1')
    expect(ids).not.toContain('comeback')
  })
})

// ---------------------------------------------------------------- Server: Zähler beim Üben, Auswertung, Meldung

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

describe('Achievements am Server', () => {
  let ida: NutzerInfo
  let kurs = ''
  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    const lk = nutzerAnlegen({ benutzer: 'a.lehr', name: 'Ada Lehr', rolle: 'lehrkraft', quelle: 'test' })
    ida = nutzerAnlegen({ benutzer: 'ida.probe', name: 'Ida Probe', rolle: 'schueler', quelle: 'lokal' })
    lerngruppenVon(lk.id)
    const g = randomBytes(6).toString('hex')
    datenbank()
      .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(g, lk.id, '6a', 'Englisch', '', JSON.stringify([ida.benutzer]), new Date().toISOString())
    kurs = vokabelnZuweisen({
      lehrkraftId: lk.id,
      lerngruppeId: g,
      schueler: [],
      titel: 'Unit 1',
      sprache: 'en',
      fach: 'Englisch',
      woerter: [{ id: 'w1', term: 'dog', translation: 'Hund' }]
    })
  })

  it('zählt Diktate, Handschrift und Spiele mit und meldet Neues genau einmal', async () => {
    const vok = vokabelRoute('http://x')
    for (let i = 0; i < 10; i++)
      expect((await rufe(vok, ida, 'POST', '/s/api/vokabeln/antwort', { id: kurs, wortId: 'w1', uebung: 'diktat', antwort: 'dog' })).code).toBe(200)
    await rufe(vok, ida, 'POST', '/s/api/vokabeln/antwort', { id: kurs, wortId: 'w1', uebung: 'buchstaben', antwort: 'dog', eingabe: 'schreiben' })
    // Blitzrunde: erst Rekord gesetzt (nicht „gebrochen"), dann übertroffen – beide ohne Fehler
    await rufe(vok, ida, 'POST', '/s/api/vokabeln/spiel', { id: kurs, spiel: 'blitz', wert: 11, fehler: [] })
    await rufe(vok, ida, 'POST', '/s/api/vokabeln/spiel', { id: kurs, spiel: 'blitz', wert: 12, fehler: [] })

    const ach = achievementsRoute()
    const neu = await rufe(ach, ida, 'GET', '/s/api/achievements/neu')
    const ids = (neu.d.neu as { id: string }[]).map((e) => e.id)
    expect(ids).toEqual(expect.arrayContaining(['diktat-10', 'rekord-1', 'blitz-fehlerfrei']))
    expect(ids).not.toContain('rekord-10')
    // Einmal gemeldet – danach nicht mehr
    expect((await rufe(ach, ida, 'GET', '/s/api/achievements/neu')).d.neu).toEqual([])

    const alle = await rufe(ach, ida, 'GET', '/s/api/achievements')
    const erreicht = alle.d.erreicht as { id: string; titel: string; am: number }[]
    expect(erreicht.map((e) => e.id)).toEqual(expect.arrayContaining(['diktat-10', 'rekord-1', 'blitz-fehlerfrei']))
    expect(alle.d.verborgen).toBeGreaterThan(30)
    // Verborgene bleiben verborgen: nur Erreichtes kommt mit
    expect(erreicht.every((e) => e.am > 0 && e.titel)).toBe(true)
    // Gespeichert verschlüsselt (feldschutz.ts)
    const roh = datenbank().prepare('SELECT daten AS x FROM achievements WHERE nutzer_id = ?').get(ida.id) as { x: string }
    expect(String(roh.x).startsWith('v1:')).toBe(true)
    // ebenso das Rekordbuch (vorher wegen „ON CONFLICT(" im Klartext)
    const buch = datenbank().prepare('SELECT daten AS x FROM rekord_buch WHERE nutzer_id = ?').get(ida.id) as { x: string }
    expect(String(buch.x).startsWith('v1:')).toBe(true)
  })

  it('Lehrkräfte bekommen nichts', async () => {
    const lk = nutzerAnlegen({ benutzer: 'b.lehr', name: 'Bo Lehr', rolle: 'lehrkraft', quelle: 'test' })
    const r = await rufe(achievementsRoute(), lk, 'GET', '/s/api/achievements')
    expect(r.d.erreicht).toEqual([])
  })
})
