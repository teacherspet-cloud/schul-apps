/**
 * Zusammen spielen am Server (08.10.2026, src/server/spiel.ts): Angebot, Lobby mit Einladungscode, Beitritt nur aus
 * demselben Kurs, Spiele erst nach der Tagesrunde, Antworten prüft der Server, Ergebnis wie bei den Einzelspielen
 * (Rekordbuch, „nochmal ansehen", Achievements).
 */
import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, nutzerNachId, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { db as vokDb, heuteTag, standVon, vokabelnZuweisen, vokabelRoute } from '../src/server/vokabeln'
import { spielRoute, _spielIntern } from '../src/server/spiel'
import { achDatenLesen } from '../src/server/achievementsDaten'
import type { Anfrage } from '../src/server/http'

async function rufe(
  route: (k: Anfrage) => Promise<boolean>,
  n: NutzerInfo,
  methode: 'GET' | 'POST',
  pfad: string,
  koerper: Record<string, unknown> = {}
): Promise<{ code: number; d: Record<string, any> }> { // eslint-disable-line @typescript-eslint/no-explicit-any
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
  return { code, d: JSON.parse(text || '{}') }
}

const WOERTER = ['dog:Hund', 'cat:Katze', 'house:Haus', 'tree:Baum', 'car:Auto', 'book:Buch', 'pen:Stift', 'sun:Sonne', 'moon:Mond', 'bird:Vogel'].map((p, i) => {
  const [term, translation] = p.split(':')
  return { id: `w${i}`, term, translation, example: `I can see the ${term} from here.` }
})

describe('Zusammen spielen am Server', () => {
  let mia: NutzerInfo, ben: NutzerInfo, tom: NutzerInfo, lea: NutzerInfo
  let kurs = ''
  let lehrkraftId = ''
  const spiel = spielRoute()
  beforeAll(async () => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    const lk = nutzerAnlegen({ benutzer: 'z.lehr', name: 'Zoe Lehr', rolle: 'lehrkraft', quelle: 'test' })
    lehrkraftId = lk.id
    mia = nutzerAnlegen({ benutzer: 'mia.probe', name: 'Mia Probe', rolle: 'schueler', quelle: 'lokal' })
    ben = nutzerAnlegen({ benutzer: 'ben.test', name: 'Ben Test', rolle: 'schueler', quelle: 'lokal' })
    lea = nutzerAnlegen({ benutzer: 'lea.muster', name: 'Lea Muster', rolle: 'schueler', quelle: 'lokal' })
    tom = nutzerAnlegen({ benutzer: 'tom.fremd', name: 'Tom Fremd', rolle: 'schueler', quelle: 'lokal' })
    lerngruppenVon(lk.id)
    const g = randomBytes(6).toString('hex')
    datenbank()
      .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(g, lk.id, '6a', 'Englisch', '', JSON.stringify([mia.benutzer, ben.benutzer, lea.benutzer]), new Date().toISOString())
    kurs = vokabelnZuweisen({ lehrkraftId: lk.id, lerngruppeId: g, schueler: [], titel: 'Unit 1', sprache: 'en', fach: 'Englisch', woerter: WOERTER })
    // Mia und Ben haben die Tagesrunde geschafft (alle Wörter kennengelernt), Lea noch nicht
    const vok = vokabelRoute('http://x')
    for (const n of [mia, ben]) for (const w of WOERTER) await rufe(vok, n, 'POST', '/s/api/vokabeln/antwort', { id: kurs, wortId: w.id, uebung: 'karte', gewusst: true })
  })

  it('Angebot nur für den eigenen Kurs; Spiele erst nach der Tagesrunde', async () => {
    const a = await rufe(spiel, mia, 'GET', `/s/api/spiel/angebot?bereich=vok&kurs=${kurs}`)
    expect(a.code).toBe(200)
    expect(a.d.frei).toBe(true)
    expect(a.d.spiele.map((s: { id: string }) => s.id)).toEqual(expect.arrayContaining(['teammatch', 'tauziehen', 'satzbaustelle']))
    expect((await rufe(spiel, tom, 'GET', `/s/api/spiel/angebot?bereich=vok&kurs=${kurs}`)).code).toBe(404)
    expect((await rufe(spiel, lea, 'GET', `/s/api/spiel/angebot?bereich=vok&kurs=${kurs}`)).d.frei).toBe(false)
    expect((await rufe(spiel, lea, 'POST', '/s/api/spiel/neu', { bereich: 'vok', kurs, spiel: 'teammatch' })).code).toBe(409)
  })

  it('Lobby, Beitritt, Start, Spiel mit Serverprüfung, Ergebnis wie bei den Einzelspielen', async () => {
    const neu = await rufe(spiel, mia, 'POST', '/s/api/spiel/neu', { bereich: 'vok', kurs, spiel: 'teammatch' })
    const code = neu.d.code as string
    expect(code).toMatch(/^\d{6}$/)
    expect((await rufe(spiel, tom, 'GET', `/s/api/spiel/zugang?code=${code}`)).d.code).toBe(code)
    expect((await rufe(spiel, tom, 'POST', '/s/api/spiel/beitreten', { code })).code).toBe(403)
    expect((await rufe(spiel, lea, 'POST', '/s/api/spiel/beitreten', { code })).code).toBe(409)
    expect((await rufe(spiel, ben, 'POST', '/s/api/spiel/beitreten', { code })).code).toBe(200)
    // Nur der Host stellt ein und startet
    expect((await rufe(spiel, ben, 'POST', '/s/api/spiel/start', { lobby: code })).code).toBe(403)
    expect((await rufe(spiel, mia, 'POST', '/s/api/spiel/einstellen', { lobby: code, schwierigkeit: 'leicht' })).code).toBe(200)
    const s0 = await rufe(spiel, ben, 'GET', `/s/api/spiel/zustand?lobby=${code}`)
    expect(s0.d.sicht.spieler.map((s: { name: string }) => s.name)).toEqual(['Mia P.', 'Ben T.'])
    expect((await rufe(spiel, mia, 'POST', '/s/api/spiel/start', { lobby: code })).code).toBe(200)

    const raum = _spielIntern.raeume.get(code)!
    const z = raum.zustand as unknown as { korrekt: string; verteilung: Record<string, string[]>; ende: boolean; reihe: string[] }
    // Ein falscher Tipp: Wort kommt auf „nochmal ansehen"
    const falsch = z.verteilung[mia.id].find((o) => o !== z.korrekt) ?? z.verteilung[ben.id].find((o) => o !== z.korrekt)!
    const werFalsch = z.verteilung[mia.id].includes(falsch) ? mia : ben
    const falschesWort = z.reihe[0]
    await rufe(spiel, werFalsch, 'POST', '/s/api/spiel/zug', { lobby: code, aktion: 'antwort', wert: falsch })
    for (let i = 0; i < 30 && !z.ende; i++) {
      const wer = z.verteilung[mia.id].includes(z.korrekt) ? mia : ben
      const sicht = (await rufe(spiel, wer, 'GET', `/s/api/spiel/zustand?lobby=${code}`)).d.sicht
      expect(JSON.stringify(sicht)).not.toMatch(/"loesung":|"korrekt":/)
      await rufe(spiel, wer, 'POST', '/s/api/spiel/zug', { lobby: code, aktion: 'antwort', wert: z.korrekt })
    }
    const ende = (await rufe(spiel, mia, 'GET', `/s/api/spiel/zustand?lobby=${code}`)).d.sicht
    expect(ende.phase).toBe('ende')
    expect(ende.ergebnis.eigen.richtig).toBeGreaterThan(0)
    expect(standVon(kurs, werFalsch.id).ansehen).toContain(falschesWort)
    expect(achDatenLesen(mia.id).zaehler.koopRunden).toBe(1)
    const buch = (await import('../src/server/rekordbuch')).gespielteSpiele(mia.id)
    expect([...buch]).toContain('koop:teammatch')
  })

  it('Spiele nach Freischaltung der Lehrkraft auch vor der Tagesrunde', async () => {
    vokDb().prepare('UPDATE vok_zuweisungen SET spiele_frei = ? WHERE id = ?').run(heuteTag(), kurs)
    expect((await rufe(spiel, lea, 'GET', `/s/api/spiel/angebot?bereich=vok&kurs=${kurs}`)).d.frei).toBe(true)
  })

  it('Lehrkraft schaltet „Zusammen spielen" für den Kurs ab und wieder an', async () => {
    const vok = vokabelRoute('http://x')
    expect((await rufe(vok, nutzerNachId(lehrkraftId)!, 'POST', `/server/vokabeln/${kurs}/zusammen`, { an: false })).d.zusammen).toBe(false)
    expect((await rufe(spiel, mia, 'GET', `/s/api/spiel/angebot?bereich=vok&kurs=${kurs}`)).d.frei).toBe(false)
    expect((await rufe(spiel, mia, 'POST', '/s/api/spiel/neu', { bereich: 'vok', kurs, spiel: 'teammatch' })).code).toBe(409)
    expect((await rufe(vok, nutzerNachId(lehrkraftId)!, 'POST', `/server/vokabeln/${kurs}/zusammen`, { an: true })).d.zusammen).toBe(true)
    expect((await rufe(spiel, mia, 'GET', `/s/api/spiel/angebot?bereich=vok&kurs=${kurs}`)).d.frei).toBe(true)
  })

  it('Lehrkräfte spielen nicht mit', async () => {
    const lk = nutzerAnlegen({ benutzer: 'y.lehr', name: 'Yo Lehr', rolle: 'lehrkraft', quelle: 'test' })
    expect((await rufe(spiel, lk, 'GET', `/s/api/spiel/angebot?bereich=vok&kurs=${kurs}`)).code).toBe(403)
  })
})
