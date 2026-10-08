import { randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { geschuetzt } from '../src/server/feldschutz'
import { datenbank, datenbankFuerTests, nutzerAnlegen } from '../src/server/datenbank'
import { grammatikAnlegen, grammatikZuruecksetzen } from '../src/server/grammatik'
import { grammatikThemenTeilen, themenTeilung, themenTreffer } from '../src/server/grammatikTeilen'
import { wartungAusfuehren } from '../src/server/wartung'
import type { GrammatikAufgabe, GrammatikPaket } from '../src/shared/grammatiktrainer'

/*
 * Ein Grammatiktraining je Thema (08.10.2026, abgestimmt mit der Lehrkraft): künftige Freigaben mit mehreren Themen und
 * die einmalige Wartung bestehender Trainings – nachgebildet am Training der Lehrkraft
 * („Bestimmter/unbestimmter Artikel · Das Verb be · Kurzantworten", 4 Regeln, 38 Aufgaben).
 */

const TITEL = 'Bestimmter/unbestimmter Artikel · Das Verb be · Kurzantworten'
const REGELN = [
  { id: 'r1', titel: 'a oder an', erklaerung: 'Vor Konsonant a, vor Vokal an.', beispiele: ['a cat', 'an apple'] },
  { id: 'r2', titel: 'be im Präsens', erklaerung: 'I am, you are, he is.', beispiele: ['I am Tom.'] },
  { id: 'r3', titel: 'Kurzformen und Verneinung', erklaerung: "I'm, you're; I'm not, isn't.", beispiele: ["She isn't here."] },
  { id: 'r4', titel: 'Fragen und Kurzantworten mit be', erklaerung: 'Is he …? – Yes, he is.', beispiele: ['Are you ok? – Yes, I am.'] }
]
/** 38 Aufgaben: 9 / 10 / 10 / 9 */
const JE_REGEL: Record<string, number> = { r1: 9, r2: 10, r3: 10, r4: 9 }
const aufgabe = (id: string, regelId: string): GrammatikAufgabe => ({
  id,
  art: 'luecke',
  regelId,
  anweisung: 'Setze ein.',
  satz: `${id}: ___`,
  loesungen: ['x']
})
const AUFGABEN: GrammatikAufgabe[] = Object.entries(JE_REGEL).flatMap(([r, n]) =>
  Array.from({ length: n }, (_, i) => aufgabe(`${r}a${i + 1}`, r))
)
const PAKET: GrammatikPaket = { thema: TITEL, regeln: REGELN, aufgaben: AUFGABEN }
const INFO = {
  themen: ['en.noun.articles', 'en.verb.be_have', 'en.syn.short_answers'],
  teilformen: ['en.noun.articles/a-an', 'en.verb.be_have/be-praesens', 'en.verb.be_have/be-kurzformen', 'en.syn.short_answers/be'],
  jahrgang: 5
}

const stand = (ids: string[], extra: Record<string, unknown> = {}) => ({
  aufgaben: Object.fromEntries(ids.map((id) => [id, { fach: 2, faellig: 0, frei: [], erkannt: 0, erkennenVersuche: 0, versuche: 3, falsch: 1, fehlerTexte: [], zuletzt: 1 }])),
  tage: ['2026-10-06', '2026-10-07'],
  ...extra
})

function probeDb(): { d: DatabaseSync; roh: DatabaseSync } {
  const roh = new DatabaseSync(':memory:')
  roh.exec(`
    CREATE TABLE gram_zuweisungen (id TEXT PRIMARY KEY, lehrkraft_id TEXT NOT NULL, lerngruppe_id TEXT NOT NULL DEFAULT '',
      schueler TEXT NOT NULL DEFAULT '[]', titel TEXT NOT NULL, fach TEXT NOT NULL DEFAULT '', sprache TEXT NOT NULL DEFAULT '',
      thema TEXT NOT NULL DEFAULT '', paket TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'offen', erstellt TEXT NOT NULL,
      code TEXT NOT NULL DEFAULT '', bis INTEGER, vok_id TEXT NOT NULL DEFAULT '', art TEXT NOT NULL DEFAULT '',
      info TEXT NOT NULL DEFAULT '', problem_aus TEXT NOT NULL DEFAULT '');
    CREATE TABLE gram_stand (zuweisung_id TEXT NOT NULL REFERENCES gram_zuweisungen(id) ON DELETE CASCADE, schueler_id TEXT NOT NULL,
      daten TEXT NOT NULL, aktualisiert INTEGER NOT NULL, PRIMARY KEY (zuweisung_id, schueler_id));
    CREATE TABLE gram_gaeste (zuweisung_id TEXT NOT NULL, nutzer_id TEXT NOT NULL, wieder TEXT NOT NULL, PRIMARY KEY (zuweisung_id, nutzer_id));
  `)
  const d = geschuetzt(roh)
  const neu = d.prepare(
    'INSERT INTO gram_zuweisungen (id, lehrkraft_id, lerngruppe_id, schueler, titel, fach, sprache, thema, paket, status, erstellt, code, bis, vok_id, art, info, problem_aus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
  neu.run('g1', 'l1', 'grp5b', '["mia.k"]', TITEL, 'Englisch', 'en', TITEL, JSON.stringify(PAKET), 'offen', '2026-10-07T08:00:00.000Z', 'ABC234', 1800000000000, 'kurs1', '', JSON.stringify(INFO), JSON.stringify({ r1a1: 2, r4a2: 3 }))
  // Extra (Förder) mit mehreren Regeln – bleibt, wie es ist
  neu.run('x1', 'l1', '', '["mia.k"]', 'Förderung: a oder an · be im Präsens', 'Englisch', 'en', 'Förderung', JSON.stringify(PAKET), 'offen', '2026-10-07T09:00:00.000Z', '', null, 'kurs1', 'foerder', '{}', '')
  // Ein Thema – bleibt
  neu.run('g2', 'l1', 'grp5b', '[]', 'Simple past', 'Englisch', 'en', 'Simple past', JSON.stringify({ ...PAKET, thema: 'Simple past' }), 'offen', '2026-10-07T10:00:00.000Z', '', null, 'kurs1', '', '{}', '')
  const st = d.prepare('INSERT INTO gram_stand (zuweisung_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?)')
  // Vier Lernende mit Ständen in allen Regeln (s4 nur in den Artikeln)
  st.run('g1', 's1', JSON.stringify(stand(AUFGABEN.map((a) => a.id), { rekorde: { satzbau: 12 }, ansehen: ['r1a2', 'r3a1', 'r4a9'] })), 111)
  st.run('g1', 's2', JSON.stringify(stand(['r1a1', 'r2a1', 'r3a5', 'r4a1', 'weg'])), 222)
  st.run('g1', 's3', JSON.stringify(stand(['r2a2', 'r2a3', 'r4a4'])), 333)
  st.run('g1', 's4', JSON.stringify(stand(['r1a1', 'r1a9'])), 444)
  d.prepare('INSERT INTO gram_gaeste (zuweisung_id, nutzer_id, wieder) VALUES (?, ?, ?)').run('g1', 'gast1', 'hash')
  return { d, roh }
}

const zeilenVon = (d: DatabaseSync) =>
  d.prepare('SELECT * FROM gram_zuweisungen ORDER BY erstellt, rowid').all() as unknown as {
    id: string
    titel: string
    thema: string
    paket: string
    info: string
    code: string
    schueler: string
    lerngruppe_id: string
    vok_id: string
    bis: number | null
    erstellt: string
    art: string
    fach: string
    problem_aus: string
  }[]
const standVon = (d: DatabaseSync, zid: string, sid: string) =>
  JSON.parse(
    (d.prepare('SELECT daten FROM gram_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(zid, sid) as { daten: string } | undefined)?.daten ?? 'null'
  ) as { aufgaben: Record<string, unknown>; tage: string[]; rekorde?: Record<string, number>; ansehen?: string[] } | null

describe('Zuordnung der Regeln zu Themen', () => {
  it('nach Wörtern des Titels, mit Synonymen, längere Treffer zählen mehr', () => {
    expect(themenTreffer('a oder an', 'Bestimmter/unbestimmter Artikel')).toBeGreaterThan(0)
    expect(themenTreffer('a oder an', 'Das Verb be')).toBe(0)
    expect(themenTreffer('Kurzformen und Verneinung', 'Kurzantworten')).toBe(0)
    expect(themenTreffer('Fragen und Kurzantworten mit be', 'Kurzantworten')).toBeGreaterThan(themenTreffer('Fragen und Kurzantworten mit be', 'Das Verb be'))
  })
  it('teilt das Beispiel der Lehrkraft in drei Themen, Kennungen und Teilformen je Thema', () => {
    const { gruppen, hinweise } = themenTeilung(PAKET, INFO, TITEL)
    expect(gruppen.map((g) => [g.titel, g.paket.regeln.map((r) => r.titel)])).toEqual([
      ['Bestimmter/unbestimmter Artikel', ['a oder an']],
      ['Das Verb be', ['be im Präsens', 'Kurzformen und Verneinung']],
      ['Kurzantworten', ['Fragen und Kurzantworten mit be']]
    ])
    expect(gruppen.map((g) => g.paket.aufgaben.length)).toEqual([9, 20, 9])
    expect(gruppen.map((g) => g.info.themen)).toEqual([['en.noun.articles'], ['en.verb.be_have'], ['en.syn.short_answers']])
    expect(gruppen[1].info.teilformen).toEqual(['en.verb.be_have/be-praesens', 'en.verb.be_have/be-kurzformen'])
    expect(gruppen[0].paket.thema).toBe('Bestimmter/unbestimmter Artikel')
    // „Kurzformen und Verneinung" ohne Treffer → wie die Regel davor, im Protokoll vermerkt
    expect(hinweise.join('\n')).toMatch(/Kurzformen und Verneinung/)
  })
  it('nennt die Regel ihr Thema (neue Pakete), gilt das', () => {
    const p: GrammatikPaket = {
      thema: 'Simple past · Going to-future',
      regeln: [
        { id: 'r1', titel: 'Regelmäßige Verben', erklaerung: 'x', beispiele: [], thema: 'Simple past' },
        { id: 'r2', titel: 'Pläne', erklaerung: 'x', beispiele: [], thema: 'Going to-future' }
      ],
      aufgaben: [aufgabe('a1', 'r1'), aufgabe('a2', 'r2'), aufgabe('a3', 'r1')]
    }
    const { gruppen } = themenTeilung(p, {}, p.thema)
    expect(gruppen.map((g) => [g.titel, g.paket.aufgaben.map((a) => a.id)])).toEqual([
      ['Simple past', ['a1', 'a3']],
      ['Going to-future', ['a2']]
    ])
  })
  it('ein Thema oder Verbkarten: nichts zu teilen', () => {
    expect(themenTeilung({ ...PAKET, thema: 'Simple past' }, {}, 'Simple past').gruppen).toHaveLength(1)
    expect(themenTeilung({ ...PAKET, verben: [{ grundform: 'go' } as never] }, INFO, TITEL).gruppen).toHaveLength(1)
  })
})

describe('Wartung: bestehende Grammatik je Thema teilen', () => {
  beforeEach(() => setzeSchluesselFuerTests(randomBytes(32)))

  it('drei Trainings, jede Aufgabe genau einmal, Lernstand zieht mit, Kennung bleibt', () => {
    const { d, roh } = probeDb()
    const zeilen: string[] = []
    expect(grammatikThemenTeilen(d, (z) => zeilen.push(z))).toBe(1)
    const alle = zeilenVon(d)
    expect(alle.map((z) => z.id).filter((id) => id === 'x1' || id === 'g2')).toEqual(['x1', 'g2'])
    const neu = alle.filter((z) => z.id !== 'x1' && z.id !== 'g2')
    expect(neu.map((z) => z.titel)).toEqual(['Bestimmter/unbestimmter Artikel', 'Das Verb be', 'Kurzantworten'])
    expect(neu[0].id).toBe('g1')
    const pakete = neu.map((z) => JSON.parse(z.paket) as GrammatikPaket)
    expect(pakete.map((p) => p.regeln.map((r) => r.id))).toEqual([['r1'], ['r2', 'r3'], ['r4']])
    const ids = pakete.flatMap((p) => p.aufgaben.map((a) => a.id))
    expect(ids).toHaveLength(38)
    expect(new Set(ids).size).toBe(38)
    expect(ids.sort()).toEqual(AUFGABEN.map((a) => a.id).sort())
    // Gleiche Empfänger und Einstellungen, eigener Code, gleiche Zeit; Themen und Teilformen je Thema
    for (const z of neu) {
      expect([z.lerngruppe_id, z.vok_id, z.bis, z.erstellt, z.art, z.fach, z.schueler]).toEqual([
        'grp5b',
        'kurs1',
        1800000000000,
        '2026-10-07T08:00:00.000Z',
        '',
        'Englisch',
        '["mia.k"]'
      ])
      expect(z.thema).toBe(z.titel)
    }
    expect(neu[0].code).toBe('ABC234')
    expect(new Set(neu.map((z) => z.code)).size).toBe(3)
    expect(neu.every((z) => /^[A-Z2-9]{6}$/.test(z.code))).toBe(true)
    expect(neu.map((z) => JSON.parse(z.info).themen)).toEqual([['en.noun.articles'], ['en.verb.be_have'], ['en.syn.short_answers']])
    expect(neu.map((z) => JSON.parse(z.problem_aus))).toEqual([{ r1a1: 2 }, {}, { r4a2: 3 }])
    // Gäste per Code auch in den neuen Trainings
    expect((d.prepare('SELECT zuweisung_id FROM gram_gaeste ORDER BY rowid').all() as { zuweisung_id: string }[]).map((g) => g.zuweisung_id)).toEqual(
      neu.map((z) => z.id)
    )
    // Lernstand: s1 hatte alles
    const [a, b, c] = neu.map((z) => z.id)
    const s1 = [a, b, c].map((zid) => standVon(d, zid, 's1')!)
    expect(s1.map((s) => Object.keys(s.aufgaben).length)).toEqual([9, 20, 9])
    expect(s1[0].rekorde).toEqual({ satzbau: 12 })
    expect(s1[1].rekorde).toBeUndefined()
    expect(s1.map((s) => s.tage)).toEqual([0, 1, 2].map(() => ['2026-10-06', '2026-10-07']))
    expect(s1.map((s) => s.ansehen)).toEqual([['r1a2'], ['r3a1'], ['r4a9']])
    // s2: je eine Aufgabe; eine unbekannte Kennung bleibt beim ersten Thema
    expect([a, b, c].map((zid) => Object.keys(standVon(d, zid, 's2')!.aufgaben).sort())).toEqual([['r1a1', 'weg'], ['r2a1', 'r3a5'], ['r4a1']])
    // s3 nichts in den Artikeln: die bisherige Zeile bleibt (leer), s4 nur Artikel: keine neuen Zeilen
    expect(Object.keys(standVon(d, a, 's3')!.aufgaben)).toEqual([])
    expect(Object.keys(standVon(d, b, 's3')!.aufgaben)).toEqual(['r2a2', 'r2a3'])
    expect(standVon(d, b, 's4')).toBeNull()
    expect(standVon(d, c, 's4')).toBeNull()
    // Je Person zusammen genau die bisherigen Aufgaben
    const vorher: Record<string, number> = { s1: 38, s2: 5, s3: 3, s4: 2 }
    for (const [sid, n] of Object.entries(vorher))
      expect([a, b, c].reduce((summe, zid) => summe + Object.keys(standVon(d, zid, sid)?.aufgaben ?? {}).length, 0)).toBe(n)
    // Verschlüsselt gespeichert (Rohzugriff an der Hülle vorbei)
    const rohStand = roh.prepare('SELECT daten FROM gram_stand WHERE zuweisung_id = ?').all(b) as { daten: string }[]
    expect(rohStand.length).toBe(3)
    expect(rohStand.every((s) => s.daten.startsWith('v1:'))).toBe(true)
    expect((roh.prepare('SELECT schueler FROM gram_zuweisungen WHERE id = ?').get(c) as { schueler: string }).schueler.startsWith('v1:')).toBe(true)
    // Protokoll: eine Zeile je Teilung, dazu der Hinweis zur unsicheren Regel
    expect(zeilen[0]).toMatch(/in 3 Trainings geteilt/)
    expect(zeilen.some((z) => z.includes('Kurzformen und Verneinung'))).toBe(true)
    // Zweiter Lauf: nichts mehr zu tun
    expect(grammatikThemenTeilen(d)).toBe(0)
    expect(zeilenVon(d)).toHaveLength(5)
  })

  it('läuft beim Start genau einmal', () => {
    const { d } = probeDb()
    wartungAusfuehren(d)
    expect(zeilenVon(d)).toHaveLength(5)
    expect(d.prepare("SELECT 1 FROM wartung WHERE name = 'grammatik-je-thema-2026-10-08'").get()).toBeTruthy()
  })
})

describe('Freigabe mit mehreren Themen', () => {
  beforeEach(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    grammatikZuruecksetzen()
  })
  it('legt je Thema ein Training an – gleiche Empfänger, eigener Code', () => {
    const l = nutzerAnlegen({ benutzer: 'lehrkraft', name: 'L', rolle: 'lehrkraft', quelle: 'lokal' })
    const paket: GrammatikPaket = {
      thema: 'Simple past · Going to-future',
      regeln: [
        { id: 'r1', titel: 'Regelmäßige Verben', erklaerung: 'x', beispiele: [], thema: 'Simple past' },
        { id: 'r2', titel: 'Pläne', erklaerung: 'x', beispiele: [], thema: 'Going to-future' }
      ],
      aufgaben: [...Array.from({ length: 6 }, (_, i) => aufgabe(`p${i}`, 'r1')), ...Array.from({ length: 5 }, (_, i) => aufgabe(`g${i}`, 'r2'))]
    }
    const f = {
      lehrkraftId: l.id,
      lerngruppeId: '',
      schueler: ['mia.k'],
      titel: paket.thema,
      fach: 'Englisch',
      sprache: 'en',
      paket,
      code: true,
      bis: null,
      vokId: '',
      art: '',
      info: { themen: ['en.verb.past_simple', 'en.verb.going_to'], teilformen: ['en.verb.past_simple/regel', 'en.verb.going_to/plaene'], jahrgang: 6 }
    }
    const ids = grammatikAnlegen(f)
    expect(ids).toHaveLength(2)
    const zeilen = ids.map(
      (id) => datenbank().prepare('SELECT titel, schueler, code, paket, info FROM gram_zuweisungen WHERE id = ?').get(id) as Record<string, string>
    )
    expect(zeilen.map((z) => z.titel)).toEqual(['Simple past', 'Going to-future'])
    expect(zeilen.map((z) => (JSON.parse(z.paket) as GrammatikPaket).aufgaben.length)).toEqual([6, 5])
    expect(zeilen.map((z) => JSON.parse(z.info).teilformen)).toEqual([['en.verb.past_simple/regel'], ['en.verb.going_to/plaene']])
    expect(zeilen.every((z) => z.schueler === '["mia.k"]' && /^[A-Z2-9]{6}$/.test(z.code))).toBe(true)
    expect(zeilen[0].code).not.toBe(zeilen[1].code)
    // Extra bleibt ein Training
    expect(grammatikAnlegen({ ...f, art: 'foerder', code: false })).toHaveLength(1)
    // Ein Thema: ein Training
    expect(grammatikAnlegen({ ...f, titel: 'Simple past', paket: { ...paket, thema: 'Simple past', regeln: paket.regeln.map((r) => ({ ...r, thema: undefined })) } })).toHaveLength(1)
  })
})
