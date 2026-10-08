import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, nutzerNachId, type NutzerInfo } from '../src/server/datenbank'
import {
  gaesteBehalten,
  gastInLerngruppe,
  gleicheMengen,
  lerngruppe,
  lerngruppenVon,
  mitgliederErgaenzen,
  mitgliederVon
} from '../src/server/onlinetest'
import { vokabelnZuweisen, vokabelRoute, vokIstFuer } from '../src/server/vokabeln'
import { blattIstFuer } from '../src/server/arbeitsblaetter'
import type { Anfrage } from '../src/server/http'

/*
 * „Lernende einer Klasse zuordnen" (08.10.2026): Eingetragene Gäste eines Kurses (persönlicher Anmeldecode) werden
 * zusätzlich Mitglieder einer Lerngruppe aus „Meine Klassen" – Code, Name und Konto bleiben, sie sehen danach die
 * Freigaben der Lerngruppe. QR-Gäste ohne Eintrag bleiben bei ihrer einen Freigabe.
 */
describe('Mitgliederlisten (rein)', () => {
  it('ergänzt ohne Doppelte und meldet nur die Neuen', () => {
    expect(mitgliederErgaenzen(['a.b', 'gast-1'], ['GAST-1', 'gast-2', ' gast-2 ', ''])).toEqual({ mitglieder: ['a.b', 'gast-1', 'gast-2'], dazu: ['gast-2'] })
  })
  it('behält eingetragene Gäste, wenn die Liste neu gesetzt wird', () => {
    expect(gaesteBehalten(['a.b', 'gast-1', 'c.d'], ['c.d', 'e.f'])).toEqual(['c.d', 'e.f', 'gast-1'])
    expect(gaesteBehalten(['gast-1'], ['gast-1'])).toEqual(['gast-1'])
  })
  it('vergleicht Zugänge als Mengen', () => {
    expect(gleicheMengen(new Set([1, 2]), new Set([2, 1]))).toBe(true)
    expect(gleicheMengen(new Set([1, 2]), new Set([1, 2, 3]))).toBe(false)
  })
})

let lk: NutzerInfo
let fremd: NutzerInfo
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

/** Anfrage an die Vokabel-Route, ohne Server */
async function rufe(n: NutzerInfo | null, methode: 'GET' | 'POST', pfad: string, koerper: Record<string, unknown> = {}): Promise<{ code: number; d: Record<string, unknown> }> {
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
  await vokabelRoute('http://x')(k)
  return { code, d: JSON.parse(text || '{}') as Record<string, unknown> }
}

const WOERTER = [{ id: 'w1', term: 'dog', translation: 'Hund' }]
let kurs = ''
let codes: { name: string; zugang: string }[] = []

beforeAll(async () => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
  lk = nutzerAnlegen({ benutzer: 'k.klasse', name: 'Kai Klasse', rolle: 'lehrkraft', quelle: 'test' })
  fremd = nutzerAnlegen({ benutzer: 'f.fremd', name: 'Fe Fremd', rolle: 'lehrkraft', quelle: 'test' })
  mia = nutzerAnlegen({ benutzer: 'mia.probe', name: 'Mia Probe', rolle: 'schueler', quelle: 'lokal' })
  gruppen.b5 = gruppeAnlegen(lk.id, '5b', 'Englisch', [mia.benutzer])
  gruppen.leer = gruppeAnlegen(lk.id, '5c', 'Englisch', [])
  gruppen.fremd = gruppeAnlegen(fremd.id, '5b', 'Englisch', [])
  // Kurs per QR-Code (ohne Lerngruppe) mit zwei eingetragenen Lernenden
  kurs = vokabelnZuweisen({ lehrkraftId: lk.id, lerngruppeId: '', schueler: [], titel: 'Unit 1', sprache: 'en', fach: 'Englisch', woerter: WOERTER, gaeste: true })
  const r = await rufe(lk, 'POST', `/server/vokabeln/${kurs}/eintragen`, { namen: ['Ben S.', 'Ida K.'] })
  codes = r.d.eingetragen as typeof codes
})

const gastKonto = (name: string): NutzerInfo => {
  const z = datenbank().prepare('SELECT nutzer_id FROM vok_gaeste WHERE zuweisung_id = ?').all(kurs) as { nutzer_id: string }[]
  return z.map((x) => nutzerNachId(x.nutzer_id)!).find((n) => n.name === name)!
}

describe('Lernende einer Klasse zuordnen', () => {
  it('zeigt die eigenen Lerngruppen und wer schon dazugehört', async () => {
    expect(codes).toHaveLength(2)
    const r = await rufe(lk, 'GET', `/server/vokabeln/${kurs}/klasse-zuordnen`)
    expect(r.code).toBe(200)
    const gr = r.d.gruppen as { id: string; schon: string[]; verknuepfbar: boolean }[]
    expect(gr.map((g) => g.id).sort()).toEqual([gruppen.b5, gruppen.leer].sort())
    expect(gr.every((g) => g.schon.length === 0)).toBe(true)
    // 5b hat schon Mia: verbunden bekäme sie den Kurs – nicht anbieten; die leere 5c ändert nichts
    expect(gr.find((g) => g.id === gruppen.b5)!.verknuepfbar).toBe(false)
    expect(gr.find((g) => g.id === gruppen.leer)!.verknuepfbar).toBe(true)
    expect((r.d.lernende as { gast: boolean }[]).every((l) => l.gast)).toBe(true)
  })

  it('lehnt fremde Lerngruppen und fremde Kurse ab', async () => {
    expect((await rufe(lk, 'POST', `/server/vokabeln/${kurs}/klasse-zuordnen`, { lerngruppeId: gruppen.fremd })).code).toBe(400)
    expect((await rufe(fremd, 'POST', `/server/vokabeln/${kurs}/klasse-zuordnen`, { lerngruppeId: gruppen.fremd })).code).toBe(404)
    expect(lerngruppe(gruppen.fremd)!.mitglieder).toEqual([])
  })

  it('verbindet nicht, wenn weitere Mitglieder Zugang bekämen', async () => {
    const r = await rufe(lk, 'POST', `/server/vokabeln/${kurs}/klasse-zuordnen`, { lerngruppeId: gruppen.b5, verknuepfen: true })
    expect(r.code).toBe(409)
    expect(lerngruppe(gruppen.b5)!.mitglieder).toEqual([mia.benutzer])
  })

  it('trägt die Gäste ein – ohne Doppelte, Konten und Codes bleiben', async () => {
    const ben = gastKonto('Ben S.')
    const vorher = datenbank().prepare('SELECT * FROM vok_gaeste WHERE zuweisung_id = ? ORDER BY nutzer_id').all(kurs)
    const r = await rufe(lk, 'POST', `/server/vokabeln/${kurs}/klasse-zuordnen`, { lerngruppeId: gruppen.b5 })
    expect(r.d).toMatchObject({ ok: true, dazu: 2, verknuepft: false })
    const nochmal = await rufe(lk, 'POST', `/server/vokabeln/${kurs}/klasse-zuordnen`, { lerngruppeId: gruppen.b5 })
    expect(nochmal.d).toMatchObject({ dazu: 0, schon: 2 })
    const g = lerngruppe(gruppen.b5)!
    expect(g.mitglieder).toHaveLength(3)
    expect(g.mitglieder).toContain(ben.benutzer)
    expect(mitgliederVon(g).map((n) => n.name).sort()).toEqual(['Ben S.', 'Ida K.', 'Mia Probe'])
    // Nichts an den Zugängen verändert
    expect(datenbank().prepare('SELECT * FROM vok_gaeste WHERE zuweisung_id = ? ORDER BY nutzer_id').all(kurs)).toEqual(vorher)
    expect(nutzerNachId(ben.id)).toMatchObject({ name: 'Ben S.', quelle: 'gast', benutzer: ben.benutzer })
    // Kurs bleibt ohne Lerngruppe
    const v = await rufe(lk, 'GET', `/server/vokabeln/${kurs}/klasse-zuordnen`)
    expect(v.d.lerngruppeId).toBe('')
  })

  it('Anmelden mit dem persönlichen Code geht weiter', async () => {
    const ben = codes.find((c) => c.name === 'Ben S.')!
    const r = await rufe(null, 'POST', '/s/api/vokabeln/anmelden', { code: ben.zugang })
    expect(r.code).toBe(200)
    expect(r.d).toMatchObject({ ok: true, id: kurs })
  })

  it('der eingetragene Gast sieht Freigaben der Lerngruppe, ein QR-Gast nicht', () => {
    const ben = gastKonto('Ben S.')
    const qr = nutzerAnlegen({ benutzer: `gast-${randomBytes(6).toString('hex')}`, name: 'Qu R.', rolle: 'schueler', quelle: 'gast' })
    expect(gastInLerngruppe(gruppen.b5, ben)).toBe(true)
    expect(gastInLerngruppe(gruppen.b5, qr)).toBe(false)
    expect(gastInLerngruppe('', ben)).toBe(false)
    expect(gastInLerngruppe(gruppen.b5, mia)).toBe(false)
    const zweiter = vokabelnZuweisen({ lehrkraftId: lk.id, lerngruppeId: gruppen.b5, schueler: [], titel: 'Unit 2', sprache: 'en', fach: 'Englisch', woerter: WOERTER })
    const zeile = { id: zweiter, lerngruppe_id: gruppen.b5, schueler: '[]' }
    expect(vokIstFuer(zeile, ben)).toBe(true)
    expect(vokIstFuer(zeile, qr)).toBe(false)
    expect(vokIstFuer(zeile, mia)).toBe(true)
    // Nur an ausgewählte Lernende: der Gast nur, wenn er dabei ist
    expect(vokIstFuer({ ...zeile, schueler: JSON.stringify([mia.benutzer]) }, ben)).toBe(false)
    // Andere Lerngruppe: nichts
    expect(vokIstFuer({ ...zeile, lerngruppe_id: gruppen.leer }, ben)).toBe(false)
    // Arbeitsblatt der Lerngruppe
    const blatt = { id: 'probe-blatt', lerngruppe_id: gruppen.b5, schueler: '[]' } as unknown as Parameters<typeof blattIstFuer>[0]
    expect(blattIstFuer(blatt, ben)).toBe(true)
    expect(blattIstFuer(blatt, qr)).toBe(false)
  })

  it('verbindet den Kurs mit einer Lerngruppe, wenn sich am Zugang nichts ändert', async () => {
    const r = await rufe(lk, 'POST', `/server/vokabeln/${kurs}/klasse-zuordnen`, { lerngruppeId: gruppen.leer, verknuepfen: true })
    expect(r.d).toMatchObject({ ok: true, dazu: 2, verknuepft: true })
    const v = await rufe(lk, 'GET', `/server/vokabeln/${kurs}/klasse-zuordnen`)
    expect(v.d.lerngruppeId).toBe(gruppen.leer)
    const ben = gastKonto('Ben S.')
    expect(vokIstFuer({ id: kurs, lerngruppe_id: gruppen.leer, schueler: '[]' }, ben)).toBe(true)
    // Mia (5b, nicht 5c) bekommt den Kurs nicht
    expect(vokIstFuer({ id: kurs, lerngruppe_id: gruppen.leer, schueler: '[]' }, mia)).toBe(false)
  })
})
