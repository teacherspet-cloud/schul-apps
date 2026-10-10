import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  abschlussJahrgang,
  jahrgangAmAnfang,
  klasseHochstufen,
  nachfolgerFinden,
  standZusammenfuehren,
  titelUmbenennen,
  zuordnungUeber,
  type PersonGruppen
} from '../src/shared/schuljahrWechsel'
import { setzeSchulkalender } from '../src/shared/schulkalender'
import { schulformVon } from '../src/shared/schulformen'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAendern, nutzerAnlegen, nutzerNachId, serverWert, setzeServerWert, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppe, lerngruppenVon } from '../src/server/onlinetest'
import { standSpeichern, standVon, vokabelnZuweisen, zeile } from '../src/server/vokabeln'
import { grammatikAnlegen, infoBereinigt } from '../src/server/grammatik'
import { leseKalenderDatei } from '../src/server/schulkalender'
import { hinweisFuer, MARKE, nachsuchen, rueckgaengig, schuljahrPruefen, sicherungVorWechsel } from '../src/server/schuljahrWechsel'

/*
 * Schuljahreswechsel (10.10.2026): Regeln für Namen, Abschlussjahrgänge und Oberstufe, Nachfolgegruppen in IServ über die
 * Mitglieder – und vor allem: Der Lernstand bleibt erhalten (gleiche Lerngruppe, gleiche Kurse), Wechsler und Wiederholer
 * nehmen ihren Stand in den Kurs der neuen Klasse mit. Einmal je Schuljahr, „Rückgängig" 14 Tage.
 */

describe('Namen hochstufen', () => {
  it('Sek I, Zusätze, Klasse-Vorsilbe', () => {
    expect(klasseHochstufen('5b', 13)).toEqual({ art: 'hoch', neu: '6b', jahrgang: 6 })
    expect(klasseHochstufen('Klasse 10a', 13)).toEqual({ art: 'hoch', neu: 'Klasse 11a', jahrgang: 11 })
    expect(klasseHochstufen('5.2', 13)).toMatchObject({ neu: '6.2' })
    expect(klasseHochstufen('7 c', 13)).toMatchObject({ neu: '8 c' })
    expect(klasseHochstufen('9', 13)).toMatchObject({ neu: '10' })
    expect(klasseHochstufen('Englisch 5b', 13)).toBeNull()
    expect(klasseHochstufen('AG Theater', 13)).toBeNull()
  })
  it('Abschlussjahrgang je Schulform', () => {
    expect(klasseHochstufen('10a', 10)).toEqual({ art: 'abschluss', jahrgang: 10 })
    expect(klasseHochstufen('13', 13)).toEqual({ art: 'abschluss', jahrgang: 13 })
    expect(abschlussJahrgang([schulformVon('NI', 'gymnasium')!])).toBe(13)
    expect(abschlussJahrgang([schulformVon('NI', 'realschule')!])).toBe(10)
    expect(abschlussJahrgang([schulformVon('NI', 'oberschule')!, schulformVon('NI', 'hauptschule')!])).toBe(10)
    expect(abschlussJahrgang([schulformVon('NI', 'integrierte-gesamtschule')!])).toBe(13)
    expect(abschlussJahrgang([])).toBe(13)
  })
  it('Oberstufe (Niedersachsen G9: E = 11, Q1 = 12, Q2 = 13)', () => {
    expect(klasseHochstufen('E', 13)).toEqual({ art: 'hoch', neu: 'Q1', jahrgang: 12 })
    expect(klasseHochstufen('EF', 13)).toMatchObject({ neu: 'Q1' })
    expect(klasseHochstufen('E-Phase Englisch', 13)).toMatchObject({ neu: 'Q1 Englisch' })
    expect(klasseHochstufen('Q1', 13)).toEqual({ art: 'hoch', neu: 'Q2', jahrgang: 13 })
    expect(klasseHochstufen('Q1 Englisch GK', 13)).toMatchObject({ neu: 'Q2 Englisch GK' })
    expect(klasseHochstufen('Q2', 13)).toEqual({ art: 'abschluss', jahrgang: 13 })
    expect(klasseHochstufen('11a', 13)).toMatchObject({ neu: '12a' })
    expect(jahrgangAmAnfang('Q2 Englisch')).toBe(13)
    expect(jahrgangAmAnfang('E')).toBe(11)
    expect(jahrgangAmAnfang('Englisch')).toBeNull()
  })
  it('Kurstitel mit dem Klassennamen', () => {
    expect(titelUmbenennen('Englisch 5b', '5b', '6b')).toBe('Englisch 6b')
    expect(titelUmbenennen('5B – Vokabeln', '5b', '6b')).toBe('6b – Vokabeln')
    expect(titelUmbenennen('Englisch 15b', '5b', '6b')).toBe('Englisch 15b')
    expect(titelUmbenennen('Green Line 1', '5b', '6b')).toBe('Green Line 1')
  })
})

describe('IServ: Nachfolgegruppe über die Mitglieder', () => {
  const alt = { id: 'g-5c', name: 'Klasse 5c', mitglieder: ['a', 'b', 'c', 'd', 'e'] }
  const p = (id: string, ...gruppen: [string, string][]): PersonGruppen => ({ id, gruppen: gruppen.map(([gid, name]) => ({ id: gid, name })) })
  it('wartet, solange kaum jemand neue Gruppen mitbringt', () => {
    const personen = ['a', 'b', 'c', 'd', 'e'].map((x) => p(x, ['g-5c', 'Klasse 5c']))
    expect(nachfolgerFinden(alt, personen, 13).art).toBe('warten')
    expect(nachfolgerFinden(alt, [p('a', ['g-6c', 'Klasse 6c']), ...['b', 'c', 'd', 'e'].map((x) => p(x, ['g-5c', 'Klasse 5c']))], 13).art).toBe('warten')
  })
  it('gleiche Kennung, von IServ umbenannt', () => {
    const f = nachfolgerFinden(alt, [p('a', ['g-5c', 'Klasse 6c']), p('b', ['g-5c', 'Klasse 5c'])], 13)
    expect(f.art).toBe('gleich')
    expect(f.gruppe).toEqual({ id: 'g-5c', name: 'Klasse 6c' })
  })
  it('neue Gruppe mit mindestens 60 %, Wechsler und Wiederholer', () => {
    const f = nachfolgerFinden(
      alt,
      [
        p('a', ['g-6c', 'Klasse 6c'], ['ag', 'Theater-AG']),
        p('b', ['g-6c', 'Klasse 6c']),
        p('c', ['g-6c', 'Klasse 6c']),
        p('d', ['g-6a', 'Klasse 6a']),
        p('e', ['g-5c-neu', 'Klasse 5c'])
      ],
      13
    )
    expect(f.art).toBe('neu')
    expect(f.gruppe).toEqual({ id: 'g-6c', name: 'Klasse 6c' })
    expect(f.anteil).toBeCloseTo(0.6)
    expect(f.wechsler).toEqual([{ id: 'd', gruppe: { id: 'g-6a', name: 'Klasse 6a' } }])
    expect(f.wiederholer).toEqual([{ id: 'e', gruppe: { id: 'g-5c-neu', name: 'Klasse 5c' } }])
  })
  it('unter 60 % in einer Gruppe: unklar (bleibt bei der Lehrkraft)', () => {
    const f = nachfolgerFinden(
      alt,
      [p('a', ['g-6c', 'Klasse 6c']), p('b', ['g-6c', 'Klasse 6c']), p('c', ['g-6a', 'Klasse 6a']), p('d', ['g-6a', 'Klasse 6a']), p('e', ['g-6b', 'Klasse 6b'])],
      13
    )
    expect(f.art).toBe('unklar')
    expect(f.gruppe).toBeUndefined()
  })
  it('bei gleichem Anteil gewinnt der gleiche Buchstabe', () => {
    const zwei = { id: 'g-5c', name: '5c', mitglieder: ['a', 'b'] }
    const f = nachfolgerFinden(zwei, [p('a', ['g-6a', '6a'], ['g-6c', '6c']), p('b', ['g-6a', '6a'], ['g-6c', '6c'])], 13)
    expect(f.gruppe?.id).toBe('g-6c')
  })
})

describe('Lernstand zusammenführen', () => {
  it('über Wort und Übersetzung; weiterer Stand gewinnt, Übungstage vereinigt', () => {
    const z = zuordnungUeber(
      [
        { id: 'a1', k: 'dog|Hund' },
        { id: 'a2', k: 'cat|Katze' }
      ],
      [
        { id: 'n1', k: 'dog|Hund' },
        { id: 'n9', k: 'bird|Vogel' }
      ],
      (x) => x.id,
      (x) => x.k
    )
    expect([...z]).toEqual([['a1', 'n1']])
    const r = standZusammenfuehren(
      { eintraege: { a1: { fach: 4, versuche: 9, zuletzt: 1 }, a2: { fach: 5, versuche: 3, zuletzt: 1 } }, tage: ['2026-06-01'] },
      { eintraege: { n1: { fach: 1, versuche: 1, zuletzt: 2 } }, tage: ['2026-09-01'] },
      z
    )
    expect(r.eintraege.n1.fach).toBe(4)
    expect(r.uebernommen).toBe(1)
    expect(r.tage).toEqual(['2026-06-01', '2026-09-01'])
  })
})

// ---------------------------------------------------------------- Mit Datenbank

const WOERTER = [
  { id: 'w1', term: 'dog', translation: 'Hund' },
  { id: 'w2', term: 'cat', translation: 'Katze' }
]
const ERSTER_SCHULTAG_2027 = '2027-08-19'
const JETZT = Date.parse('2027-08-19T06:00:00Z')
const keineSicherung = (): void => undefined

let lk: NutzerInfo
let lk2: NutzerInfo
const schueler: Record<string, NutzerInfo> = {}
const ids: Record<string, string> = {}
const kurse: Record<string, string> = {}

const gruppe = (lehrer: NutzerInfo, name: string, fach: string, iserv = '', mitglieder: string[] = []): string => {
  lerngruppenVon(lehrer.id)
  const id = randomBytes(6).toString('hex')
  datenbank()
    .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, lehrer.id, name, fach, iserv, JSON.stringify(mitglieder), new Date().toISOString())
  return id
}
const kursStatus = (id: string): string => (datenbank().prepare('SELECT status FROM vok_zuweisungen WHERE id = ?').get(id) as { status: string }).status
const stand = (fach: number) => ({
  woerter: { w1: { fach, faellig: 0, frei: [], erkannt: 0, erkennenVersuche: 0, versuche: fach * 3, falsch: 0, fehlerTexte: [], zuletzt: 1 } },
  tage: ['2027-06-30', '2027-07-01']
})

describe('Schuljahreswechsel am Server', () => {
  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    setzeSchulkalender(leseKalenderDatei(join(__dirname, 'fixtures', 'openholidays-ni.json')))
    setzeServerWert('schule', { name: 'Testschule', stateId: 'NI', schulformen: ['gymnasium'], strasse: '', plz: '', ort: '', telefon: '', email: '' })
    lk = nutzerAnlegen({ benutzer: 'l.lehrer', name: 'Lea Lehrer', rolle: 'lehrkraft', quelle: 'test' })
    lk2 = nutzerAnlegen({ benutzer: 'k.kollege', name: 'Kai Kollege', rolle: 'lehrkraft', quelle: 'test' })
    const neu = (b: string, gruppen: { id: string; name: string }[] = []): NutzerInfo =>
      (schueler[b] = nutzerAnlegen({ benutzer: b, name: b, rolle: 'schueler', quelle: 'iserv', gruppen }))
    // Klasse ohne IServ (eigene Liste)
    neu('s.anna')
    neu('s.ben')
    // Klasse aus der Klassenliste der Verwaltung
    neu('s.carl', [{ id: 'klasse:7a', name: '7a' }])
    neu('s.dora', [{ id: 'klasse:7a', name: '7a' }])
    // IServ-Gruppe 5c
    for (const b of ['s.emil', 's.fia', 's.gus', 's.hans', 's.ida']) neu(b, [{ id: 'iserv-5c', name: 'Klasse 5c' }])

    ids.b5 = gruppe(lk, '5b', 'Englisch', '', ['s.anna', 's.ben'])
    ids.k7 = gruppe(lk, '7a', 'Geschichte', 'klasse:7a')
    ids.q2 = gruppe(lk, 'Q2 Englisch', 'Englisch', '', ['s.anna'])
    ids.c5 = gruppe(lk, '5c', 'Englisch', 'iserv-5c')
    ids.ag = gruppe(lk, 'Theater-AG', 'Darstellendes Spiel', '', ['s.ben'])
    // Andere Lehrkraft: Klasse 6a (für den Wechsler) und die neue 5c (für den Wiederholer) in IServ
    ids.a6 = gruppe(lk2, '6a', 'Englisch', 'iserv-6a')
    ids.c5neu = gruppe(lk2, '5c', 'Englisch', 'iserv-5c-neu')

    kurse.b5 = vokabelnZuweisen({ lehrkraftId: lk.id, lerngruppeId: ids.b5, schueler: [], titel: 'Englisch 5b', sprache: 'en', fach: 'Englisch', woerter: WOERTER })
    kurse.q2 = vokabelnZuweisen({ lehrkraftId: lk.id, lerngruppeId: ids.q2, schueler: [], titel: 'Abiturwortschatz', sprache: 'en', fach: 'Englisch', woerter: WOERTER })
    kurse.c5 = vokabelnZuweisen({ lehrkraftId: lk.id, lerngruppeId: ids.c5, schueler: [], titel: 'Unit 4', sprache: 'en', fach: 'Englisch', woerter: WOERTER })
    // gleiche Wörter, andere Kennungen
    const andere = WOERTER.map((w, i) => ({ ...w, id: `x${i}` }))
    kurse.a6 = vokabelnZuweisen({ lehrkraftId: lk2.id, lerngruppeId: ids.a6, schueler: [], titel: 'Englisch 6a', sprache: 'en', fach: 'Englisch', woerter: andere })
    kurse.c5neu = vokabelnZuweisen({ lehrkraftId: lk2.id, lerngruppeId: ids.c5neu, schueler: [], titel: 'Englisch 5c', sprache: 'en', fach: 'Englisch', woerter: andere })

    standSpeichern(kurse.b5, schueler['s.anna'].id, stand(4))
    for (const b of ['s.emil', 's.hans', 's.ida']) standSpeichern(kurse.c5, schueler[b].id, stand(3))
    // Grammatik (gleiches Thema in der neuen Klasse des Wechslers)
    const paket = (id: string) => ({ thema: 'Simple past', regeln: [], aufgaben: [{ id, art: 'luecke' as const, regelId: 'r', anweisung: 'Setze ein.', satz: 'She ___ home.', vorgabe: '(go)', loesungen: ['went'] }] })
    kurse.gc5 = grammatikAnlegen({ lehrkraftId: lk.id, lerngruppeId: ids.c5, schueler: [], titel: 'Simple past', fach: 'Englisch', sprache: 'en', paket: paket('g1'), code: false, bis: null, vokId: kurse.c5, art: 'x', info: infoBereinigt({}) })[0]
    kurse.ga6 = grammatikAnlegen({ lehrkraftId: lk2.id, lerngruppeId: ids.a6, schueler: [], titel: 'Simple past', fach: 'Englisch', sprache: 'en', paket: paket('h7'), code: false, bis: null, vokId: kurse.a6, art: 'x', info: infoBereinigt({}) })[0]
    datenbank()
      .prepare('INSERT INTO gram_stand (zuweisung_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?)')
      .run(kurse.gc5, schueler['s.hans'].id, JSON.stringify({ aufgaben: { g1: { fach: 5, versuche: 6, zuletzt: 1 } }, tage: ['2027-07-01'] }), 1)
  })

  it('erster Start mit Kalender: laufendes Schuljahr gilt als erledigt, nichts ändert sich', () => {
    const r = schuljahrPruefen('2026-10-10', { sichern: keineSicherung, jetzt: Date.parse('2026-10-10T06:00:00Z') })
    expect(r.art).toBe('eingerichtet')
    expect(serverWert<{ schuljahr: number }>(MARKE, { schuljahr: 0 }).schuljahr).toBe(2026)
    expect(lerngruppe(ids.b5)?.name).toBe('5b')
    // Sommerferien 2027: noch nicht
    expect(schuljahrPruefen('2027-08-18', { sichern: keineSicherung, jetzt: JETZT - 864e5 }).art).toBe('schon')
  })

  it('erster Schultag: aufrücken, Lernstand unverändert', () => {
    const vorher = standVon(kurse.b5, schueler['s.anna'].id)
    let gesichert = 0
    const r = schuljahrPruefen(ERSTER_SCHULTAG_2027, { sichern: () => void gesichert++, jetzt: JETZT })
    expect(r.art).toBe('gewechselt')
    expect(gesichert).toBe(1)
    expect(r.zahlen).toMatchObject({ umbenannt: 2, abschluss: 1, wartet: 1, klassenliste: 1, lehrkraefte: 1 })
    // Eigene Liste: gleiche Lerngruppe, neuer Name, Kurs mit
    expect(lerngruppe(ids.b5)).toMatchObject({ name: '6b', mitglieder: ['s.anna', 's.ben'] })
    expect(zeile(kurse.b5)).toMatchObject({ titel: 'Englisch 6b', lerngruppe_id: ids.b5, status: 'offen' })
    expect(standVon(kurse.b5, schueler['s.anna'].id)).toEqual(vorher)
    // Klassenliste: Schülerkonten und Lerngruppe zusammen
    expect(nutzerNachId(schueler['s.carl'].id)?.gruppen).toEqual([{ id: 'klasse:8a', name: '8a' }])
    expect(lerngruppe(ids.k7)).toMatchObject({ name: '8a', iserv_gruppe: 'klasse:8a' })
    // Abschluss: Name bleibt, Kurs beendet
    expect(lerngruppe(ids.q2)?.name).toBe('Q2 Englisch')
    expect(kursStatus(kurse.q2)).toBe('beendet')
    // IServ: nicht umbenannt, wartet
    expect(lerngruppe(ids.c5)).toMatchObject({ name: '5c', iserv_gruppe: 'iserv-5c' })
    // Kein Jahrgang am Anfang: bleibt
    expect(lerngruppe(ids.ag)?.name).toBe('Theater-AG')
    // Hinweis für die Lehrkraft
    const h = hinweisFuer(lk.id, JETZT)!
    expect(h.schuljahr).toBe('2027/28')
    expect(h.rueckgaengigMoeglich).toBe(true)
    expect(h.eintraege.map((e) => `${e.alt}→${e.neu ?? e.art}`).sort()).toEqual(['5b→6b', '5c→wartet', '7a→8a', 'Q2 Englisch→abschluss'])
  })

  it('nie doppelt: zweite Prüfung am selben oder späteren Tag ändert nichts', () => {
    expect(schuljahrPruefen(ERSTER_SCHULTAG_2027, { sichern: keineSicherung, jetzt: JETZT }).art).toBe('schon')
    expect(schuljahrPruefen('2027-09-01', { sichern: keineSicherung, jetzt: JETZT + 13 * 864e5 }).art).toBe('schon')
    expect(lerngruppe(ids.b5)?.name).toBe('6b')
    expect(nutzerNachId(schueler['s.carl'].id)?.gruppen[0].id).toBe('klasse:8a')
  })

  it('IServ: Nachfolger über die Mitglieder; Wechsler und Wiederholer nehmen ihren Stand mit', () => {
    const setze = (b: string, g: { id: string; name: string }): void => nutzerAendern(schueler[b].id, { gruppen: [g] })
    setze('s.emil', { id: 'iserv-6c', name: 'Klasse 6c' })
    setze('s.fia', { id: 'iserv-6c', name: 'Klasse 6c' })
    setze('s.gus', { id: 'iserv-6c', name: 'Klasse 6c' })
    setze('s.hans', { id: 'iserv-6a', name: 'Klasse 6a' })
    setze('s.ida', { id: 'iserv-5c-neu', name: 'Klasse 5c' })
    const emilVorher = standVon(kurse.c5, schueler['s.emil'].id)
    const r = nachsuchen(JETZT + 864e5)
    expect(r).toEqual({ gefunden: 1, uebernommen: 3 })
    // Gleiche Lerngruppe, jetzt an der neuen IServ-Gruppe: Kurs und Stand bleiben
    expect(lerngruppe(ids.c5)).toMatchObject({ name: '6c', iserv_gruppe: 'iserv-6c' })
    expect(zeile(kurse.c5)?.lerngruppe_id).toBe(ids.c5)
    expect(standVon(kurse.c5, schueler['s.emil'].id)).toEqual(emilVorher)
    // Wechsler: Stand im Kurs der 6a (andere Lehrkraft, andere Wort-Kennungen) – auch Grammatik
    const hans = standVon(kurse.a6, schueler['s.hans'].id)
    expect(hans.woerter.x0?.fach).toBe(3)
    expect(hans.tage).toContain('2027-07-01')
    const gram = datenbank().prepare('SELECT daten FROM gram_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(kurse.ga6, schueler['s.hans'].id) as { daten: string }
    expect(JSON.parse(gram.daten).aufgaben.h7.fach).toBe(5)
    // Wiederholer: Stand im Kurs der neuen 5c, bleibt im Jahrgang 5
    expect(standVon(kurse.c5neu, schueler['s.ida'].id).woerter.x0?.fach).toBe(3)
    // Alter Stand bleibt erhalten
    expect(standVon(kurse.c5, schueler['s.hans'].id).woerter.w1.fach).toBe(3)
    const e = hinweisFuer(lk.id, JETZT + 864e5)!.eintraege.find((x) => x.alt === '5c')!
    expect(e).toMatchObject({ neu: '6c', art: 'iserv', wechsler: 1, wiederholer: 1 })
    // Zweite Nachsuche: nichts mehr zu tun
    expect(nachsuchen(JETZT + 2 * 864e5)).toEqual({ gefunden: 0, uebernommen: 0 })
  })

  it('Rückgängig stellt alles wieder her – auch die Klassenliste und übernommene Stände', () => {
    const r = rueckgaengig(lk.id, JETZT + 3 * 864e5)
    expect(r).toMatchObject({ ok: true })
    expect(lerngruppe(ids.b5)?.name).toBe('5b')
    expect(zeile(kurse.b5)?.titel).toBe('Englisch 5b')
    expect(lerngruppe(ids.k7)).toMatchObject({ name: '7a', iserv_gruppe: 'klasse:7a' })
    expect(nutzerNachId(schueler['s.carl'].id)?.gruppen).toEqual([{ id: 'klasse:7a', name: '7a' }])
    expect(kursStatus(kurse.q2)).toBe('offen')
    expect(lerngruppe(ids.c5)).toMatchObject({ name: '5c', iserv_gruppe: 'iserv-5c' })
    // übernommene Stände zurück (vorher gab es keine)
    expect(datenbank().prepare('SELECT 1 FROM vok_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(kurse.a6, schueler['s.hans'].id)).toBeUndefined()
    expect(datenbank().prepare('SELECT 1 FROM gram_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(kurse.ga6, schueler['s.hans'].id)).toBeUndefined()
    // Lernstand im eigenen Kurs unberührt
    expect(standVon(kurse.b5, schueler['s.anna'].id).woerter.w1.fach).toBe(4)
    expect(hinweisFuer(lk.id, JETZT + 3 * 864e5)?.status).toBe('rueckgaengig')
    // Kein zweites Mal, kein erneutes Hochstufen
    expect(rueckgaengig(lk.id, JETZT + 3 * 864e5)).toHaveProperty('fehler')
    expect(schuljahrPruefen('2027-08-25', { sichern: keineSicherung, jetzt: JETZT + 6 * 864e5 }).art).toBe('schon')
    expect(lerngruppe(ids.b5)?.name).toBe('5b')
  })

  it('Rückgängig nur 14 Tage lang', () => {
    // In den Sommerferien angelegt (die neue 5a): gehört schon zum neuen Schuljahr und bleibt
    const neu5a = gruppe(lk2, '5a', 'Englisch', '', ['s.ben'])
    datenbank().prepare('UPDATE lerngruppen SET erstellt = ? WHERE id = ?').run('2027-07-20T10:00:00.000Z', neu5a)
    // Neues Schuljahr in der Zukunft simulieren: Marke zurücksetzen, wechseln, nach 15 Tagen zurücknehmen
    setzeServerWert(MARKE, { schuljahr: 2026, zeit: 0 })
    expect(schuljahrPruefen(ERSTER_SCHULTAG_2027, { sichern: keineSicherung, jetzt: JETZT }).art).toBe('gewechselt')
    expect(lerngruppe(ids.b5)?.name).toBe('6b')
    expect(lerngruppe(neu5a)?.name).toBe('5a')
    expect(rueckgaengig(lk.id, JETZT + 15 * 864e5)).toHaveProperty('fehler')
  })

  it('zu spät bemerkt (Server wochenlang aus): kein automatisches Hochstufen', () => {
    setzeServerWert(MARKE, { schuljahr: 2026, zeit: 0 })
    expect(schuljahrPruefen('2027-10-01', { sichern: keineSicherung, jetzt: JETZT + 43 * 864e5 }).art).toBe('zu-spaet')
    expect(lerngruppe(ids.b5)?.name).toBe('6b')
  })

  it('Sicherung vor dem Wechsel: nur die jüngste bleibt', () => {
    const ordner = mkdtempSync(join(tmpdir(), 'sa-wechsel-'))
    try {
      const a = sicherungVorWechsel(ordner, new Date('2027-08-19T06:00:00Z'))
      const b = sicherungVorWechsel(ordner, new Date('2027-08-19T07:00:00Z'))
      expect(existsSync(a)).toBe(false)
      expect(existsSync(b)).toBe(true)
      expect(readFileSync(b).subarray(0, 15).toString()).toBe('SQLite format 3')
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })
})
