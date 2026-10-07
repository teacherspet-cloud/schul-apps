import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { alleNutzer, datenbank, datenbankFuerTests, nutzerAnlegen, OHNE_VORSCHAU, type NutzerInfo } from '../src/server/datenbank'
import { alleLernenden, gehoertZu, lerngruppe, lerngruppenVon, mitgliederVon } from '../src/server/onlinetest'
import { kontoZumSchluessel, VORSCHAU_MS, vorschauAufsetzen, vorschauKonto, vorschauSchluessel, type VorschauZustand } from '../src/server/vorschau'
import { lernstandRoute } from '../src/server/lernstand'
import type { Anfrage } from '../src/server/http'

/*
 * „Als Schüler ansehen" (06.10.2026): Das Vorschaukonto einer Klasse gehört zu allen Fächern der Klasse, zählt aber nie
 * (Lerngruppen, Lernende, Auswertungen); sein Schlüssel gilt nur für die eigene Lehrkraft; der gewählte Lernstand ergibt
 * den Zustand der Begrüßung – ohne KI-Anfrage.
 */
let lk: NutzerInfo
let andere: NutzerInfo
let mia: NutzerInfo
const gruppen: Record<string, string> = {}

const gruppeAnlegen = (lehrkraftId: string, name: string, fach: string, mitglieder: string[]): string => {
  lerngruppenVon(lehrkraftId)
  const id = randomBytes(6).toString('hex')
  datenbank()
    .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, lehrkraftId, name, fach, '', JSON.stringify(mitglieder), new Date().toISOString())
  return id
}

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  lk = nutzerAnlegen({ benutzer: 'k.klasse', name: 'Kai Klasse', rolle: 'lehrkraft', quelle: 'test' })
  andere = nutzerAnlegen({ benutzer: 'a.andere', name: 'Ada Andere', rolle: 'lehrkraft', quelle: 'test' })
  mia = nutzerAnlegen({ benutzer: 'mia.probe', name: 'Mia Probe', rolle: 'schueler', quelle: 'lokal' })
  gruppen.en = gruppeAnlegen(lk.id, '7a', 'Englisch', [mia.benutzer])
  gruppen.ge = gruppeAnlegen(lk.id, ' 7A ', 'Geschichte', [mia.benutzer])
  gruppen.fremd = gruppeAnlegen(andere.id, '7a', 'Englisch', [mia.benutzer])
  gruppen.b = gruppeAnlegen(lk.id, '7b', 'Englisch', [])
})

describe('Vorschaukonto', () => {
  it('gehört zu allen Fächern der Klasse dieser Lehrkraft – nicht zu fremden Klassen', () => {
    const v = vorschauKonto(lk.id, '7a')
    expect(v.rolle).toBe('schueler')
    expect(v.quelle).toBe('vorschau')
    expect(gehoertZu(lerngruppe(gruppen.en)!, v)).toBe(true)
    expect(gehoertZu(lerngruppe(gruppen.ge)!, v)).toBe(true)
    expect(gehoertZu(lerngruppe(gruppen.fremd)!, v)).toBe(false)
    expect(gehoertZu(lerngruppe(gruppen.b)!, v)).toBe(false)
    // Dasselbe Konto beim nächsten Öffnen, auch über die andere Schreibweise
    expect(vorschauKonto(lk.id, '7A').id).toBe(v.id)
  })
  it('zählt nie: nicht in alleNutzer, Lerngruppen-Mitgliedern, allen Lernenden', () => {
    const v = vorschauKonto(lk.id, '7a')
    expect(alleNutzer().some((n) => n.id === v.id)).toBe(false)
    expect(alleNutzer(true).some((n) => n.id === v.id)).toBe(true)
    expect(mitgliederVon(lerngruppe(gruppen.en)!).map((n) => n.benutzer)).toEqual([mia.benutzer])
    expect(alleLernenden().some((n) => n.id === v.id)).toBe(false)
  })
  it('Auswertungs-Abfragen lassen seine Zeilen aus (OHNE_VORSCHAU)', () => {
    const v = vorschauKonto(lk.id, '7a')
    const d = datenbank()
    d.exec('CREATE TABLE IF NOT EXISTS probe_abgaben (schueler_id TEXT NOT NULL)')
    d.prepare('INSERT INTO probe_abgaben (schueler_id) VALUES (?), (?)').run(v.id, mia.id)
    const ids = (d.prepare(`SELECT schueler_id FROM probe_abgaben WHERE schueler_id ${OHNE_VORSCHAU}`).all() as { schueler_id: string }[]).map((z) => z.schueler_id)
    expect(ids).toEqual([mia.id])
  })
})

describe('Vorschau-Schlüssel', () => {
  it('gilt nur für die eigene Lehrkraft, nur unverändert und nur bis zum Ablauf', () => {
    const v = vorschauKonto(lk.id, '7a')
    const s = vorschauSchluessel(v.id, lk.id)
    expect(kontoZumSchluessel(s, lk)?.id).toBe(v.id)
    // Fremde Lehrkraft (deren Cookie) – nichts
    expect(kontoZumSchluessel(s, andere)).toBeNull()
    // Ein Schülerkonto bekommt nie die Vorschau (kein Rechte-Tausch über den Schlüssel)
    expect(kontoZumSchluessel(s, { id: lk.id, rolle: 'schueler' })).toBeNull()
    // Manipuliert: anderes Konto oder andere Lehrkraft in denselben Schlüssel geschrieben
    const [, , ablauf, sig] = s.split('.')
    expect(kontoZumSchluessel(`${mia.id}.${lk.id}.${ablauf}.${sig}`, lk)).toBeNull()
    expect(kontoZumSchluessel(`${v.id}.${andere.id}.${ablauf}.${sig}`, andere)).toBeNull()
    // Ein Schlüssel für ein normales Konto (selbst richtig signiert) gilt nicht – nur Vorschaukonten der Lehrkraft
    expect(kontoZumSchluessel(vorschauSchluessel(mia.id, lk.id), lk)).toBeNull()
    expect(kontoZumSchluessel(s, lk, Date.now() + VORSCHAU_MS + 1000)).toBeNull()
    expect(kontoZumSchluessel('', lk)).toBeNull()
    expect(kontoZumSchluessel('a.b.c', lk)).toBeNull()
  })
})

describe('Lernstand nach Wahl', () => {
  const lernstand = async (n: NutzerInfo, aufrufe: string[]): Promise<{ zustand: string; tipp: { quelle?: string } | null }> => {
    let text = ''
    const res = { writeHead: () => res, end: (s: string) => void (text = s) }
    const k = {
      req: { method: 'GET', headers: {} },
      res,
      url: new URL('http://x/s/api/lernstand'),
      sitzung: { nutzer: n, kennung: 'probe' },
      ip: '',
      koerper: async () => ({})
    } as unknown as Anfrage
    await lernstandRoute(async (kanal) => (aufrufe.push(kanal), {}))(k)
    return JSON.parse(text) as { zustand: string; tipp: { quelle?: string } | null }
  }
  const erwartet: Record<VorschauZustand, string> = { neu: 'neu', fleissig: 'fleissig', erfolgreich: 'erfolgreich_fleissig', inaktiv: 'inaktiv' }
  for (const [wahl, zustand] of Object.entries(erwartet))
    it(`„${wahl}" ergibt den Zustand ${zustand} – ohne KI-Anfrage`, async () => {
      const v = vorschauKonto(lk.id, '7a')
      vorschauAufsetzen(v, wahl as VorschauZustand)
      const aufrufe: string[] = []
      const a = await lernstand(v, aufrufe)
      expect(a.zustand).toBe(zustand)
      await new Promise((r) => setTimeout(r, 20))
      expect(aufrufe).toEqual([])
      if (a.tipp) expect(a.tipp.quelle).not.toBe('ki')
    })
  it('Zurücksetzen auf „neu" löscht alles wieder', async () => {
    const v = vorschauKonto(lk.id, '7a')
    vorschauAufsetzen(v, 'erfolgreich')
    vorschauAufsetzen(v, 'neu')
    expect((datenbank().prepare('SELECT COUNT(*) AS n FROM lern_wochen WHERE schueler_id = ?').get(v.id) as { n: number }).n).toBe(0)
    expect((await lernstand(v, [])).zustand).toBe('neu')
  })
})
