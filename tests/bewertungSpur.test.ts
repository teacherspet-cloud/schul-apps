import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { spurDerPersonLoeschen, spurEintragen, spurLoeschen, spurVon } from '../src/server/bewertungSpur'
import { reihenRoute } from '../src/server/reihen'
import { leererInhalt, standardErfolg, type Reihe, type Schritt } from '../src/shared/reihe'
import type { Anfrage } from '../src/server/http'

/*
 * Verlauf der Bewertung und menschliche Aufsicht (23.10.2026, Prüfung des Schulträgers, Punkt 8; Art. 22 DSGVO,
 * § 50 NSchG, KI-Verordnung Anhang III Nr. 3):
 *  - Jede KI-Bewertung hinterlässt einen Eintrag (Vorschlag), jede Entscheidung der Lehrkraft einen weiteren
 *    (bestätigt / geändert / selbst entschieden). Onlinetest: tests/onlinetestKiSchutz.test.ts
 *  - Abschlussprodukt digital: Der KI-Vorschlag entscheidet nicht mehr über „geschafft" – die Abgabe wartet, bis die
 *    Lehrkraft „Vorschlag übernehmen" klickt oder selbst bewertet
 */

let lk: NutzerInfo
let kind: NutzerInfo

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  lk = nutzerAnlegen({ benutzer: 'l.spur', name: 'Lena Spur', rolle: 'lehrkraft', quelle: 'test' })
  kind = nutzerAnlegen({ benutzer: 'k.spur', name: 'Kai Spur', rolle: 'schueler', quelle: 'test' })
})

describe('bewertungSpur.ts', () => {
  it('schreibt Vorschlag und Entscheidung, liest nur für die eigene Lehrkraft, verschlüsselt', () => {
    spurEintragen({ art: 'mitarbeit', bezugId: 'b1', schuelerId: kind.id, lehrkraftId: lk.id, quelle: 'ki', kiVorschlag: { note: '+' }, zeit: 1 })
    spurEintragen({ art: 'mitarbeit', bezugId: 'b1', schuelerId: kind.id, lehrkraftId: lk.id, quelle: 'geaendert', kiVorschlag: { note: '+' }, entscheidung: { note: '0' }, zeit: 2 })
    // Unbekannte Art/Quelle: nichts (und kein Fehler)
    spurEintragen({ art: 'quatsch' as never, bezugId: 'b1', schuelerId: kind.id, lehrkraftId: lk.id, quelle: 'ki' })
    const liste = spurVon({ lehrkraftId: lk.id, art: 'mitarbeit', bezugId: 'b1', schuelerId: kind.id })
    expect(liste.map((x) => x.quelle)).toEqual(['ki', 'geaendert'])
    expect(liste[1].entscheidung).toEqual({ note: '0' })
    expect(spurVon({ lehrkraftId: 'andere', art: 'mitarbeit', bezugId: 'b1' })).toEqual([])
    const roh = datenbank().prepare("SELECT ki_vorschlag AS v FROM bewertung_spur WHERE bezug_id = 'b1'").all() as { v: string }[]
    for (const z of roh) expect(String(z.v)).toMatch(/^v1:/)
  })
  it('löscht je Bezug, je Teilnahme und mit der Person (Spalte schueler_id)', () => {
    spurEintragen({ art: 'bogen', bezugId: 'b2', schuelerId: kind.id, lehrkraftId: lk.id, quelle: 'ki' })
    spurEintragen({ art: 'bogen', bezugId: 'b2', schuelerId: 'jemand', lehrkraftId: lk.id, quelle: 'ki' })
    spurLoeschen('bogen', 'b2', 'jemand')
    expect(spurVon({ lehrkraftId: lk.id, art: 'bogen', bezugId: 'b2' }).map((x) => x.schuelerId)).toEqual([kind.id])
    spurLoeschen('bogen', 'b2')
    expect(spurVon({ lehrkraftId: lk.id, art: 'bogen', bezugId: 'b2' })).toEqual([])
    spurDerPersonLoeschen(kind.id)
    expect(spurVon({ lehrkraftId: lk.id, art: 'mitarbeit', bezugId: 'b1' })).toEqual([])
  })
})

// ---------------------------------------------------------------- Abschlussprodukt über die Routen

const aufruf = async (kanal: string): Promise<unknown> => {
  if (kanal !== 'ai:structured') throw new Error(`unerwartet: ${kanal}`)
  return {
    kriterien: [
      { kriterium: 'Inhalt', punkte: 3, begruendung: 'Treffend' },
      { kriterium: 'Gestaltung', punkte: 2, begruendung: 'Übersichtlich' }
    ],
    gesamt: 'Gut gelungen.'
  }
}

async function rufe(nutzer: NutzerInfo, methode: 'GET' | 'POST', pfad: string, koerper: Record<string, unknown> = {}): Promise<{ code: number; d: Record<string, unknown> }> {
  let code = 0
  let text = ''
  const res = {
    writeHead: (c: number) => ((code = c), res),
    setHeader: () => res,
    write: (s: string) => void (text += s),
    on: () => res,
    end: (s?: string) => void (text += s ?? '')
  }
  const req = Object.assign(Readable.from(methode === 'POST' ? [Buffer.from(JSON.stringify(koerper))] : []), {
    method: methode,
    headers: { 'x-schulapps-token': 'probe' },
    socket: {}
  })
  const k = { req, res, url: new URL(`http://x${pfad}`), sitzung: { nutzer, kennung: 'probe' }, ip: '', koerper: async () => koerper } as unknown as Anfrage
  await reihenRoute(aufruf as never)(k)
  return { code: code || 200, d: JSON.parse(text.trim() || '{}') as Record<string, unknown> }
}

describe('Abschlussprodukt digital: wartet auf die Lehrkraft, „Vorschlag übernehmen", Verlauf', () => {
  it('KI-Vorschlag entscheidet nicht; Übernehmen bzw. Ändern steht im Verlauf', async () => {
    const schritt: Schritt = {
      id: 'p',
      titel: 'Plakat',
      lernziele: [],
      rolle: 'pflicht',
      erfolg: standardErfolg('abschluss', 'digital'),
      inhalt: { ...leererInhalt('abschluss'), anweisung: 'Gestalte ein Plakat.', raster: ['Inhalt', 'Gestaltung'] } as Schritt['inhalt']
    }
    const reihe = {
      titel: 'Julikrise',
      fachId: 'geschichte',
      fachLabel: 'Geschichte',
      stateId: 'NI',
      schoolTypeId: 'gymnasium',
      grade: 8,
      oberthema: 'Erster Weltkrieg',
      lernziele: [],
      schritte: [schritt],
      art: 'digital'
    } as unknown as Reihe
    const gespeichert = await rufe(lk, 'POST', '/server/reihen/speichern', { reihe })
    expect(gespeichert.code).toBe(200)
    const rid = String(gespeichert.d.id)
    const zid = `z-${randomBytes(4).toString('hex')}`
    datenbank()
      .prepare(
        'INSERT INTO reihen_zuweisungen (id, reihe_id, lehrkraft_id, lerngruppe_id, schueler, halte_frei, verknuepft, status, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(zid, rid, lk.id, '', JSON.stringify([kind.benutzer]), '[]', '{}', 'offen', new Date().toISOString())

    const ab = await rufe(kind, 'POST', '/s/api/reihe/schritt', { id: zid, schritt: 'p', aktion: 'abgeben', antworten: { '0': 'Mein Plakat zur Julikrise' } })
    expect(ab.d).toMatchObject({ ok: true, geprueft: false })

    type Uebersicht = { lernende: { id: string; weg: { schritte: { id: string; status: string; wartet?: boolean }[] }; stand: { schritte: Record<string, { kiVorschlag?: unknown; bewertung?: { geschafft: boolean; text: string } }> } }[]; bedarf: { art: string; vorschlag?: { punkte: number; max: number; geschafft: boolean } }[] }
    const uebersicht = async (): Promise<Uebersicht> => (await rufe(lk, 'GET', `/server/reihen/z/${zid}`)).d as unknown as Uebersicht
    // Der Vorschlag entsteht im Hintergrund
    await vi.waitFor(async () => expect((await uebersicht()).lernende[0].stand.schritte.p.kiVorschlag).toBeDefined(), { timeout: 3000 })

    const u1 = await uebersicht()
    // Trotz positivem Vorschlag: eingereicht, wartet auf die Lehrkraft
    expect(u1.lernende[0].weg.schritte[0]).toMatchObject({ status: 'eingereicht', wartet: true })
    const b = u1.bedarf.find((x) => x.art === 'bewerten')
    expect(b?.vorschlag).toEqual({ punkte: 5, max: 6, geschafft: true })

    const spur = async (): Promise<{ quelle: string; entscheidung?: { geschafft: boolean } }[]> =>
      (await rufe(lk, 'GET', `/server/reihen/z/${zid}/spur?schueler=${kind.id}&schritt=p`)).d.eintraege as never
    expect((await spur()).map((x) => x.quelle)).toEqual(['ki'])

    // Ein Klick: Vorschlag übernehmen
    expect((await rufe(lk, 'POST', `/server/reihen/z/${zid}/aktion`, { art: 'vorschlag-uebernehmen', schueler: kind.id, schritt: 'p' })).code).toBe(200)
    const u2 = await uebersicht()
    expect(u2.lernende[0].weg.schritte[0].status).toBe('geschafft')
    expect(u2.lernende[0].stand.schritte.p.bewertung?.text).toContain('5 von 6 Punkten')
    expect((await spur()).map((x) => x.quelle)).toEqual(['ki', 'bestaetigt'])

    // Anders entschieden: „geändert"
    await rufe(lk, 'POST', `/server/reihen/z/${zid}/aktion`, { art: 'bewerten', schueler: kind.id, schritt: 'p', geschafft: false, text: 'Bitte noch Quellen angeben.' })
    const s = await spur()
    expect(s.map((x) => x.quelle)).toEqual(['ki', 'bestaetigt', 'geaendert'])
    expect(s[2].entscheidung?.geschafft).toBe(false)
    expect((await uebersicht()).lernende[0].weg.schritte[0].status).toBe('nicht_geschafft')

    // Fremde Lehrkraft: kein Zugriff auf den Verlauf
    const fremd = nutzerAnlegen({ benutzer: 'f.spur', name: 'Fritz Spur', rolle: 'lehrkraft', quelle: 'test' })
    expect((await rufe(fremd, 'GET', `/server/reihen/z/${zid}/spur?schueler=${kind.id}&schritt=p`)).code).toBe(404)
  })
})
