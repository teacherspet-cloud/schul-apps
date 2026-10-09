import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, leseServerProtokoll, nutzerAnlegen, nutzerNachId, type NutzerInfo } from '../src/server/datenbank'
import { historie, lerngruppe, lerngruppenVon, mitgliederVon } from '../src/server/onlinetest'
import { blaetterDerGruppe } from '../src/server/arbeitsblaetter'
import { klassenRoute } from '../src/server/klassen'
import { vokabelnZuweisen, vokabelRoute } from '../src/server/vokabeln'
import { klassenGaesteRoute } from '../src/server/klassenGaeste'
import { KORREKTUREN, nameKorrigieren, namenKorrigieren, type NamensKorrektur } from '../src/server/wartungGastname'
import type { Anfrage } from '../src/server/http'

/*
 * „Meine Klassen" › Lernende (09.10.2026): Gäste mit Anmeldecode – Code ansehen, neuen Code erzeugen, Namen ändern.
 * Dazu die einmalige Wartung: „Jayen S." → „Jayden S." (5b), „Jill v." → „Jil v." (10b), nur bei genau einem Treffer.
 */
let lk: NutzerInfo
let fremd: NutzerInfo
let mia: NutzerInfo
let kurs = ''
let gruppe = ''
let codes: { name: string; zugang: string }[] = []

const gruppeAnlegen = (lehrkraftId: string, name: string, mitglieder: string[]): string => {
  lerngruppenVon(lehrkraftId)
  const id = randomBytes(6).toString('hex')
  datenbank()
    .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, lehrkraftId, name, 'Englisch', '', JSON.stringify(mitglieder), new Date().toISOString())
  return id
}

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
  const erledigt = await route(k)
  return { code: erledigt ? code : -1, d: JSON.parse(text || '{}') as Record<string, unknown> }
}

const gastKonto = (name: string): NutzerInfo => {
  const z = datenbank().prepare('SELECT nutzer_id FROM vok_gaeste WHERE zuweisung_id = ?').all(kurs) as { nutzer_id: string }[]
  return z.map((x) => nutzerNachId(x.nutzer_id)!).find((n) => n.name === name)!
}

beforeAll(async () => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  lk = nutzerAnlegen({ benutzer: 'k.klasse', name: 'Kai Klasse', rolle: 'lehrkraft', quelle: 'test' })
  fremd = nutzerAnlegen({ benutzer: 'f.fremd', name: 'Fe Fremd', rolle: 'lehrkraft', quelle: 'test' })
  mia = nutzerAnlegen({ benutzer: 'mia.probe', name: 'Mia Probe', rolle: 'schueler', quelle: 'lokal' })
  kurs = vokabelnZuweisen({
    lehrkraftId: lk.id,
    lerngruppeId: '',
    schueler: [],
    titel: 'Unit 1',
    sprache: 'en',
    fach: 'Englisch',
    woerter: [{ id: 'w1', term: 'dog', translation: 'Hund' }],
    gaeste: true
  })
  const r = await rufe(vokabelRoute('http://x'), lk, 'POST', `/server/vokabeln/${kurs}/eintragen`, { namen: ['Jayen S.', 'Ida K.', 'Ben S.'] })
  codes = r.d.eingetragen as typeof codes
  // Jayen und Ida in der 5b, Ben nur im Kurs
  gruppe = gruppeAnlegen(lk.id, '5b', [mia.benutzer, gastKonto('Jayen S.').benutzer, gastKonto('Ida K.').benutzer])
})

describe('Gäste in „Meine Klassen" › Lernende', () => {
  const route = klassenGaesteRoute()

  it('liefert die Gäste der Lerngruppe mit ihrem Code – ohne Konten und ohne Gäste anderer Gruppen', async () => {
    const r = await rufe(route, lk, 'GET', `/server/klassen/${gruppe}/gaeste`)
    expect(r.code).toBe(200)
    const gaeste = (r.d.gaeste as { name: string; zugang: string }[]).sort((a, b) => a.name.localeCompare(b.name))
    expect(gaeste.map((g) => g.name)).toEqual(['Ida K.', 'Jayen S.'])
    for (const g of gaeste) expect(g.zugang).toBe(codes.find((c) => c.name === g.name)!.zugang)
  })

  it('lässt andere Pfade und fremde Lehrkräfte nicht durch', async () => {
    expect((await rufe(route, lk, 'GET', `/server/klassen/${gruppe}`)).code).toBe(-1)
    expect((await rufe(route, fremd, 'GET', `/server/klassen/${gruppe}/gaeste`)).code).toBe(404)
    expect((await rufe(route, mia, 'GET', `/server/klassen/${gruppe}/gaeste`)).code).toBe(403)
    expect((await rufe(route, fremd, 'POST', `/server/klassen/${gruppe}/gast-name`, { id: gastKonto('Ida K.').id, name: 'Ida Ko.' })).code).toBe(404)
  })

  it('ändert nur Namen von Gästen der Gruppe, prüft das Format und Doppelte', async () => {
    const ida = gastKonto('Ida K.')
    expect((await rufe(route, lk, 'POST', `/server/klassen/${gruppe}/gast-name`, { id: mia.id, name: 'Mia P.' })).code).toBe(404)
    expect((await rufe(route, lk, 'POST', `/server/klassen/${gruppe}/gast-name`, { id: gastKonto('Ben S.').id, name: 'Ben Sa.' })).code).toBe(404)
    expect((await rufe(route, lk, 'POST', `/server/klassen/${gruppe}/gast-name`, { id: ida.id, name: 'Ida' })).code).toBe(400)
    // Ben ist im selben Kurs – zwei „Ben S." gingen beim Wiedereinstieg mit Name und Code nicht auseinander
    expect((await rufe(route, lk, 'POST', `/server/klassen/${gruppe}/gast-name`, { id: ida.id, name: 'ben s' })).code).toBe(409)
    const r = await rufe(route, lk, 'POST', `/server/klassen/${gruppe}/gast-name`, { id: ida.id, name: 'ida  kl' })
    expect(r).toEqual({ code: 200, d: { ok: true, name: 'Ida Kl.' } })
    expect(nutzerNachId(ida.id)).toMatchObject({ name: 'Ida Kl.', quelle: 'gast', benutzer: ida.benutzer })
    // Protokoll ohne Namen
    expect(leseServerProtokoll(5).some((p) => p.text.includes('Ida'))).toBe(false)
  })

  it('erzeugt einen neuen Code, mit dem die Anmeldung geht', async () => {
    const ida = nutzerNachId(gastKonto('Ida Kl.').id)!
    const r = await rufe(route, lk, 'POST', `/server/klassen/${gruppe}/gast-code`, { id: ida.id })
    expect(r.code).toBe(200)
    const neu = String(r.d.zugang)
    expect(neu).toHaveLength(8)
    expect(neu).not.toBe(codes.find((c) => c.name === 'Ida K.')!.zugang)
    const a = await rufe(vokabelRoute('http://x'), null, 'POST', '/s/api/vokabeln/anmelden', { code: neu })
    expect(a.code).toBe(200)
  })
})

describe('Wartung: Namen korrigieren (5b, 10b)', () => {
  const KURZ = (gruppe: string, alt: string, neu: string): NamensKorrektur => ({ klasse: gruppe, alt, neu })

  it('wendet die Liste an: Jayen S. (Gast, 5b) und Jill v. (Konto über IServ-Gruppe, 10b) – je einmal', () => {
    expect(KORREKTUREN).toEqual([
      { klasse: '5b', alt: 'Jayen S.', neu: 'Jayden S.' },
      { klasse: '10b', alt: 'Jill v.', neu: 'Jil v.' }
    ])
    const jayen = gastKonto('Jayen S.')
    const jill = nutzerAnlegen({
      benutzer: 'jill.vau',
      name: 'Jill v.',
      rolle: 'schueler',
      quelle: 'lokal',
      gruppen: [{ id: 'klasse:10b-probe', name: '10b' }]
    })
    const id10 = gruppeAnlegen(lk.id, '10b', [])
    datenbank().prepare('UPDATE lerngruppen SET iserv_gruppe = ? WHERE id = ?').run('klasse:10b-probe', id10)
    expect(namenKorrigieren(datenbank())).toBe('Name in 5b korrigiert (genau ein Treffer); Name in 10b korrigiert (genau ein Treffer)')
    expect(nutzerNachId(jayen.id)!.name).toBe('Jayden S.')
    // Das kleine „v." bleibt genau so
    expect(nutzerNachId(jill.id)!.name).toBe('Jil v.')
    // Zweiter Lauf findet nichts mehr
    expect(namenKorrigieren(datenbank())).toMatch(/^Name in 5b nicht korrigiert: 0 Treffer.*Name in 10b nicht korrigiert: 0 Treffer/)
    // Protokoll ohne Namen
    expect(leseServerProtokoll(10).some((p) => /Jay|Jil/.test(p.text))).toBe(false)
  })

  it('ändert nichts bei mehreren Treffern oder in anderen Gruppen', () => {
    const a = nutzerAnlegen({ benutzer: `gast-${randomBytes(6).toString('hex')}`, name: 'Lia M.', rolle: 'schueler', quelle: 'gast' })
    const b = nutzerAnlegen({ benutzer: `gast-${randomBytes(6).toString('hex')}`, name: 'Lia M.', rolle: 'schueler', quelle: 'gast' })
    const c = nutzerAnlegen({ benutzer: `gast-${randomBytes(6).toString('hex')}`, name: 'Tom R.', rolle: 'schueler', quelle: 'gast' })
    gruppeAnlegen(fremd.id, '5b', [a.benutzer])
    gruppeAnlegen(lk.id, ' 5B ', [b.benutzer])
    gruppeAnlegen(lk.id, '6b', [c.benutzer])
    expect(nameKorrigieren(datenbank(), KURZ('5b', 'Lia M.', 'Lea M.'))).toMatch(/2 Treffer/)
    expect([nutzerNachId(a.id)!.name, nutzerNachId(b.id)!.name]).toEqual(['Lia M.', 'Lia M.'])
    expect(nameKorrigieren(datenbank(), KURZ('5b', 'Tom R.', 'Tim R.'))).toMatch(/0 Treffer/)
    expect(nutzerNachId(c.id)!.name).toBe('Tom R.')
    expect(nameKorrigieren(datenbank(), KURZ('9z', 'Tom R.', 'Tim R.'))).toMatch(/nicht gefunden/)
  })

  it('findet einen Gast auch über einen Kurs der Lerngruppe', () => {
    const g = nutzerAnlegen({ benutzer: `gast-${randomBytes(6).toString('hex')}`, name: 'Ole P.', rolle: 'schueler', quelle: 'gast' })
    const zweiter = vokabelnZuweisen({
      lehrkraftId: lk.id,
      lerngruppeId: gruppe,
      schueler: [],
      titel: 'Unit 2',
      sprache: 'en',
      fach: 'Englisch',
      woerter: [{ id: 'w2', term: 'cat', translation: 'Katze' }]
    })
    datenbank().prepare('INSERT INTO vok_gaeste (zuweisung_id, nutzer_id, wieder) VALUES (?, ?, ?)').run(zweiter, g.id, '')
    expect(nameKorrigieren(datenbank(), KURZ('5b', 'ole p.', 'Ole Pe.'))).toBe('Name in 5b korrigiert (genau ein Treffer)')
    expect(nutzerNachId(g.id)!.name).toBe('Ole Pe.')
  })
})

describe('Umbenennen: alle Ergebnisse bleiben bei der Person', () => {
  const route = klassenGaesteRoute()
  const FASSUNGEN = JSON.stringify([{ label: 'A', fassung: { aufgaben: [], einheiten: [], loesungen: {}, punkte: 10 } }])
  const EINST = JSON.stringify({ zeitMin: 20, zuteilung: 'zufall', fach: 'Englisch', zielsprache: '', niveau: '', schwellen: [87, 73, 59, 45, 18], art: 'Test', gaeste: true })
  const testMit = (gid: string, schuelerId: string): void => {
    const id = randomBytes(6).toString('hex')
    datenbank()
      .prepare('INSERT INTO onlinetests (id, lehrkraft_id, lerngruppe_id, titel, code, fassungen, einstellungen, status, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, lk.id, gid, `Test ${id}`, id.toUpperCase(), FASSUNGEN, EINST, 'beendet', new Date().toISOString())
    datenbank()
      .prepare('INSERT INTO teilnahmen (id, test_id, schueler_id, variante, geheim, beginn, ende, abgabe) VALUES (?, ?, ?, 0, ?, 1, 2, 3)')
      .run(randomBytes(6).toString('hex'), id, schuelerId, 'g')
  }
  const gast = (name: string): NutzerInfo => nutzerAnlegen({ benutzer: `gast-${randomBytes(6).toString('hex')}`, name, rolle: 'schueler', quelle: 'gast' })

  it('Test-Historie, Testschnitt und Blattabgaben folgen dem neuen Namen – auch über Test-Gastkonten', async () => {
    const tim = gast('Tim W.')
    const g7 = gruppeAnlegen(lk.id, '7c', [tim.benutzer])
    // Ein Test mit Konto, einer als Test-Gast („Wie heißt du?" – eigenes Konto, nur über den Namen verbunden)
    const testGast = gast('Tim W.')
    testMit(g7, tim.id)
    testMit(g7, testGast.id)
    // Gleichnamiger Test-Gast einer ANDEREN Klasse bleibt unberührt
    const fremderTim = gast('Tim W.')
    testMit(gruppeAnlegen(lk.id, '8a', []), fremderTim.id)
    // Arbeitsblatt der Lerngruppe mit Abgabe
    blaetterDerGruppe(lk.id, g7)
    datenbank()
      .prepare(
        'INSERT INTO blatt_freigaben (id, lehrkraft_id, lerngruppe_id, titel, html, aufgaben, einstellungen, rueckmeldung_id, status, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run('blatt-tim', lk.id, g7, 'Blatt', '<div class="ws-page"></div>', '[]', '{}', '', 'offen', new Date().toISOString())
    datenbank().prepare('INSERT INTO blatt_abgaben (freigabe_id, schueler_id, abgaben, aktualisiert) VALUES (?, ?, 1, 1)').run('blatt-tim', tim.id)

    const vorher = historie(lerngruppe(g7)!).schueler
    expect(vorher.map((s) => [s.name, s.tests])).toEqual([['Tim W.', 2]])

    const r = await rufe(route, lk, 'POST', `/server/klassen/${g7}/gast-name`, { id: tim.id, name: 'Timo W.' })
    expect(r.code).toBe(200)
    const nachher = historie(lerngruppe(g7)!).schueler
    expect(nachher.map((s) => [s.name, s.tests])).toEqual([['Timo W.', 2]])
    expect(nachher[0].ids.sort()).toEqual([tim.id, testGast.id].sort())
    expect(nutzerNachId(testGast.id)!.name).toBe('Timo W.')
    expect(nutzerNachId(fremderTim.id)!.name).toBe('Tim W.')
    // Blattabgabe hängt an der Kennung
    expect(blaetterDerGruppe(lk.id, g7)[0].eingereichtVon).toEqual([tim.id])
    expect(mitgliederVon(lerngruppe(g7)!).map((n) => n.name)).toEqual(['Timo W.'])
    // „Meine Klassen": Testschnitt und Blätter beim umbenannten Lernenden
    const d = await rufe(klassenRoute(), lk, 'GET', `/server/klassen/${g7}`)
    const zeile = (d.d.lernende as { name: string; tests: number; testSchnitt: number | null; blaetterEingereicht: number }[]).find((l) => l.name === 'Timo W.')
    expect(zeile).toMatchObject({ tests: 2, blaetterEingereicht: 1 })
    expect(zeile!.testSchnitt).not.toBeNull()

    // Die Wartung benennt genauso mit um
    expect(nameKorrigieren(datenbank(), { klasse: '7c', alt: 'Timo W.', neu: 'Tima W.' })).toBe('Name in 7c korrigiert (genau ein Treffer)')
    expect(historie(lerngruppe(g7)!).schueler.map((s) => [s.name, s.tests])).toEqual([['Tima W.', 2]])
    expect(nutzerNachId(testGast.id)!.name).toBe('Tima W.')
    expect(nutzerNachId(fremderTim.id)!.name).toBe('Tim W.')
  })
})
