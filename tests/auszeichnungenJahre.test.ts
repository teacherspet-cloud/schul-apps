/**
 * Medaillen als Jahresreihen (10.10.2026, Entscheidung der Lehrkraft): Schwellen aus dem Lehrwerksband bzw. den
 * Schultagen des Schuljahres (shared/auszeichnungen.ts `jahresSchwellen`, shared/auszeichnungenBand.ts), Wechsel am
 * ersten Schultag, nichts geht verloren, einmalige Umstellung (wartungAuszeichnungenJahre.ts), Jahrestitel. Kein Netz.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  fortschreiben,
  jahresLabel,
  jahresSchwellen,
  jahresTitelText,
  jahresWerte,
  jahreUmstellen,
  jahrGrundlageSetzen,
  jahrHolen,
  naechsteStufeText,
  punkteVon,
  schuljahrRahmen,
  schwellen,
  tageImRahmen,
  titelStufeGesamt,
  TITEL_AB,
  TITEL_AB_GESAMT,
  type AuszStand,
  type JahresGrundlage,
  type JahresKontext,
  type SprachEingabe
} from '../src/shared/auszeichnungen'
import { bandFuerJahr, bandKapitel, bandWoerter, grammatikBandZu, grammatikImBand, grammatikLatein, lateinBuch, lateinLernjahr } from '../src/shared/auszeichnungenBand'
import { schuljahrVon, setzeSchulkalender, type SchulkalenderDaten } from '../src/shared/schulkalender'
import { leseOpenHolidays, setzeTestHeute } from '../src/server/schulkalender'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { geschuetzt } from '../src/server/feldschutz'
import { auszeichnungenJahre } from '../src/server/wartungAuszeichnungenJahre'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { vokabelnZuweisen, vokabelRoute } from '../src/server/vokabeln'
import { achievementsRoute, auszeichnungFuerLehrkraft } from '../src/server/achievements'
import { achDatenLesen } from '../src/server/achievementsDaten'
import type { Anfrage } from '../src/server/http'

const roh = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'openholidays-ni.json'), 'utf8')) as { schulferien: unknown[]; feiertage: unknown[] }
const NI: SchulkalenderDaten = {
  land: 'NI',
  quelle: 'openholidays',
  abgerufen: '2026-10-10T06:00:00.000Z',
  ferien: leseOpenHolidays(roh.schulferien, 'NI'),
  feiertage: leseOpenHolidays(roh.feiertage, 'NI')
}
const lehrwerk = (id: string): { id: string; name: string; grade?: number; units: { name: string; sections: { name: string; entries: { term: string }[] }[] }[] } =>
  JSON.parse(readFileSync(join(__dirname, '..', 'resources', 'lehrwerke', `${id}.json`), 'utf8'))

afterEach(() => {
  setzeSchulkalender(null)
  setzeTestHeute(null)
})

const grundlage = (g: Partial<JahresGrundlage> = {}): JahresGrundlage => ({ jahrgang: 7, band: null, woerter: null, grammatik: null, units: null, schultage: 188, ...g })
const eingabe = (e: Partial<SprachEingabe> = {}): SprachEingabe => ({
  sprache: 'en',
  jahrgang: 7,
  woerterAb2: 0,
  woerterSicher: 0,
  regelnGeuebt: 0,
  regelnSicher: 0,
  tage: 0,
  units: [],
  zaehler: {},
  ...e
})
const kontext = (schuljahr: number, g: Partial<JahresGrundlage> = {}, k: Partial<JahresKontext> = {}): JahresKontext => ({
  schuljahr,
  grundlage: grundlage(g),
  tageImJahr: 0,
  bandEtappen: null,
  ...k
})

describe('Umfang eines Bands', () => {
  it('Green Line 3: Wörter, Kapitel, Grammatik', () => {
    const gl3 = lehrwerk('green-line-3')
    const w = bandWoerter(gl3)!
    expect(w).toBeGreaterThan(1000)
    expect(w).toBeLessThan(1300)
    expect(bandKapitel(gl3)).toBe(11)
    expect(grammatikBandZu('green-line-3', 'Green Line 3')).toBe('Green Line 3')
    expect(grammatikBandZu('green-line-3-nds')).toBe('Green Line 3')
    const g = grammatikImBand('Green Line 3')!
    expect(g).toBeGreaterThan(5)
    expect(g).toBeLessThan(60)
    expect(grammatikImBand('Green Line 9')).toBeNull()
  })
  it('Platzhalter ohne Wörter (Découvertes, ¡Apúntate!) liefern nichts – dann Jahrgangstabellen', () => {
    expect(bandWoerter(lehrwerk('decouvertes-2020-2'))).toBeNull()
    expect(bandKapitel(lehrwerk('apuntate-2024-1'))).toBeNull()
    expect(grammatikBandZu('decouvertes-2020-2', 'Découvertes 2')).toBeUndefined()
  })
  it('Latein: Grammatik der Lektionen des Lernjahres (ab Klasse 6)', () => {
    expect(lateinBuch('pontes')).toBe('Pontes')
    expect(lateinLernjahr(6)).toBe(1)
    expect(lateinLernjahr(7)).toBe(2)
    expect(lateinLernjahr(null)).toBeNull()
    const j1 = grammatikLatein('Pontes', 1)!
    const j2 = grammatikLatein('Pontes', 2)!
    expect(j1.grammatik).toBeGreaterThan(5)
    expect(j2.lektionen).toBeGreaterThan(3)
    expect(grammatikLatein('Pontes', 9)).toBeNull()
    expect(grammatikLatein('Unbekannt', 1)).toBeNull()
  })
  it('Band zum Jahrgang, sonst der höchste', () => {
    const b = [
      { name: 'Green Line 2', grade: 6 },
      { name: 'Green Line 3', grade: 7 },
      { name: 'Green Line 1', grade: 5 }
    ]
    expect(bandFuerJahr(b, 7)?.name).toBe('Green Line 3')
    expect(bandFuerJahr(b, 9)?.name).toBe('Green Line 3')
    expect(bandFuerJahr(b, null)?.name).toBe('Green Line 3')
    expect(bandFuerJahr([], 7)).toBeNull()
  })
})

describe('Schwellen eines Schuljahres', () => {
  it('Wortschatz aus den Wörtern des Bands (Höchstpunkte 2 × Wörter), gut lesbar gerundet', () => {
    const s = jahresSchwellen(grundlage({ woerter: 1198, units: 11, grammatik: 20 }))
    expect(s.wortschatz).toEqual([48, 240, 600, 1080, 1680, 2160])
    // Grammatik: Höchstpunkte 3 × Themen (geübt 1 + sicher 2)
    expect(s.grammatik).toEqual([2, 6, 15, 27, 42, 55])
    // Etappen: Bronze 1, Meister = jedes Kapitel zu 80 % sicher (3 je Kapitel)
    expect(s.lehrwerk).toEqual([1, 5, 12, 18, 25, 33])
  })
  it('Zeit-Kategorien aus den Schultagen: Bronze in der ersten Woche, Meister nur mit stetiger Arbeit', () => {
    const s = jahresSchwellen(grundlage())
    expect(s.dranbleiben).toEqual([3, 15, 38, 75, 115, 150])
    expect(s.spiele).toEqual([3, 36, 90, 180, 270, 360])
    expect(s.hoeren).toEqual([10, 120, 300, 600, 900, 1200])
    expect(s.zusammen).toEqual([1, 9, 23, 45, 70, 90])
    // Weniger Schultage (z. B. kürzeres Jahr) → kleinere Zahlen
    expect(jahresSchwellen(grundlage({ schultage: 150 })).dranbleiben[5]).toBe(120)
  })
  it('kleiner Band: Mindestwerte und streng steigend', () => {
    const s = jahresSchwellen(grundlage({ woerter: 30, grammatik: 1, units: 1 }))
    expect(s.wortschatz[0]).toBe(5)
    expect(s.grammatik[0]).toBe(2)
    for (const k of Object.values(s)) {
      expect(k).toHaveLength(6)
      for (let i = 1; i < 6; i++) expect(k[i]).toBeGreaterThan(k[i - 1])
    }
  })
  it('ohne bekannten Umfang: ein typischer Band (900 Wörter, 15 Grammatikthemen, 9 Kapitel), für jeden Jahrgang gleich', () => {
    const s = jahresSchwellen(grundlage({ jahrgang: 5 }))
    expect(s.wortschatz).toEqual([36, 180, 450, 810, 1260, 1620])
    expect(s.grammatik).toEqual([2, 5, 11, 20, 31, 41])
    expect(s.lehrwerk).toEqual([1, 4, 9, 15, 20, 27])
    expect(jahresSchwellen(grundlage({ jahrgang: 11 }))).toEqual(s)
    // Latein: Grammatik aus den Lektionen des Lernjahres, Wörter und Kapitel typisch
    const la = jahresSchwellen(grundlage({ jahrgang: 6, grammatik: grammatikLatein('Pontes', 1)!.grammatik }))
    expect(la.grammatik).toEqual([2, 12, 31, 55, 85, 110])
    expect(la.wortschatz).toEqual(s.wortschatz)
  })
  it('nächste Stufe in Worten', () => {
    expect(naechsteStufeText('wortschatz', 1300)).toBe('bei 1.300 Punkten (etwa 650 sichere Wörter)')
    expect(naechsteStufeText('dranbleiben', 38)).toBe('bei 38 Übungstagen')
    expect(naechsteStufeText('lehrwerk', 1)).toBe('bei 1 Etappe')
  })
})

describe('Schuljahr nach dem Schulkalender', () => {
  it('Rahmen 2026/27: erster Schultag, Ende vor dem nächsten, Schultage gezählt', () => {
    const r = schuljahrRahmen(2026, NI)
    expect(r.beginn).toBe('2026-08-13')
    expect(r.ende).toBe('2027-08-18')
    expect(r.geschaetzt).toBe(false)
    expect(r.schultage).toBeGreaterThan(175)
    expect(r.schultage).toBeLessThan(200)
    // Ohne Daten zu den nächsten Sommerferien: übliche Zahl, Ende 31.7.
    expect(schuljahrRahmen(2027, NI)).toMatchObject({ beginn: '2027-08-19', geschaetzt: true, schultage: 188 })
    expect(schuljahrRahmen(2026, null)).toMatchObject({ beginn: '2026-08-01', ende: '2027-07-31', schultage: 188 })
  })
  it('Übungstage zählen nur im Schuljahr', () => {
    const r = schuljahrRahmen(2026, NI)
    expect(tageImRahmen(['2026-08-12', '2026-08-13', '2026-10-10', '2026-10-10', '2027-08-19'], r)).toBe(2)
  })
  it('Wechsel genau am ersten Schultag', () => {
    expect(schuljahrVon('2027-08-18', NI)).toBe(2026)
    expect(schuljahrVon('2027-08-19', NI)).toBe(2027)
  })
})

describe('Jahresreihen fortschreiben', () => {
  it('neue Reihe im neuen Schuljahr; alte Medaillen bleiben; Haupttitel wächst über alle Jahre', () => {
    const st: AuszStand = { medaillen: {}, titel: {} }
    const e = eingabe({ zaehler: { spielrunden: 40 } })
    const neu = fortschreiben(st, [{ ...e, jahr: kontext(2026, {}, { tageImJahr: 3 }) }], 100)
    // 40 Spielpunkte: Silber (36); 3 Tage: Bronze → 3 Punkte → Haupttitel 2, Jahrestitel 2
    expect(st.jahre!.en['2026'].medaillen).toMatchObject({ spiele: { stufe: 2 }, dranbleiben: { stufe: 1 } })
    expect(neu.map((n) => n.art)).toEqual(['medaille', 'medaille', 'titel', 'jahrestitel'])
    expect(st.titel.en.stufe).toBe(2)
    expect(st.jahre!.en['2026'].titel!.stufe).toBe(2)
    // Neues Schuljahr: gezählt wird ab dem Stand der letzten Auswertung – 40 Spielpunkte sind schon „verbraucht"
    const neu2 = fortschreiben(st, [{ ...e, jahrgang: 8, jahr: kontext(2027, { jahrgang: 8 }, { tageImJahr: 0 }) }], 200)
    expect(neu2).toEqual([])
    expect(st.jahre!.en['2027'].start.spiele).toBe(40)
    expect(st.jahre!.en['2027'].jahrgang).toBe(8)
    expect(st.jahre!.en['2026'].medaillen.spiele!.stufe).toBe(2)
    // Weiter geübt: 3 neue Spielpunkte = Bronze im neuen Jahr; Punkte aller Jahre zusammen
    fortschreiben(st, [{ ...eingabe({ jahrgang: 8, zaehler: { spielrunden: 43 } }), jahr: kontext(2027, { jahrgang: 8 }) }], 300)
    expect(st.jahre!.en['2027'].medaillen.spiele).toEqual({ stufe: 1, am: 300 })
    expect(punkteVon(st, 'en')).toBe(4)
    expect(st.titel.en.stufe).toBe(titelStufeGesamt(4))
    // Die beste Stufe je Kategorie (Sammlung) bleibt Silber
    expect(st.medaillen.en.spiele!.stufe).toBe(2)
  })
  it('Werte sinken (Kurs entfernt) oder Schwellen ändern sich – Erreichtes bleibt', () => {
    const st: AuszStand = { medaillen: {}, titel: {}, jahre: {} }
    fortschreiben(st, [{ ...eingabe({ woerterAb2: 30, woerterSicher: 20 }), jahr: kontext(2026, { woerter: 1000 }) }], 100)
    // 50 Punkte, Band 1000 Wörter: Bronze ab 40
    expect(st.jahre!.en['2026'].schwellen!.wortschatz![0]).toBe(40)
    expect(st.jahre!.en['2026'].medaillen.wortschatz!.stufe).toBe(1)
    // Gleicher Band, andere Wortzahl (Lehrwerk neu eingelesen): Schwellen bleiben fest
    fortschreiben(st, [{ ...eingabe(), jahr: kontext(2026, { woerter: 3000 }) }], 200)
    expect(st.jahre!.en['2026'].schwellen!.wortschatz![0]).toBe(40)
    expect(st.jahre!.en['2026'].medaillen.wortschatz!.stufe).toBe(1)
    // Anderer Band: neu gerechnet, die Medaille bleibt
    fortschreiben(st, [{ ...eingabe(), jahr: kontext(2026, { woerter: 3000, band: { id: 'gl4', name: 'Green Line 4' } }) }], 300)
    expect(st.jahre!.en['2026'].schwellen!.wortschatz![0]).toBe(120)
    expect(st.jahre!.en['2026'].medaillen.wortschatz).toEqual({ stufe: 1, am: 100 })
  })
  it('Platzhalter-Band bekommt Wörter: Bandformel statt Jahrgangstabelle', () => {
    const st: AuszStand = { medaillen: {}, titel: {}, jahre: {} }
    const band = { id: 'apuntate-2024-2', name: '¡Apúntate! 2' }
    fortschreiben(st, [{ ...eingabe(), jahr: kontext(2026, { band }) }], 100)
    expect(st.jahre!.en['2026'].schwellen!.wortschatz!).toEqual([36, 180, 450, 810, 1260, 1620])
    fortschreiben(st, [{ ...eingabe(), jahr: kontext(2026, { band, woerter: 500 }) }], 200)
    expect(st.jahre!.en['2026'].schwellen!.wortschatz![1]).toBe(100)
  })
  it('Schwellen der alten Rückfall-Regel (Jahrgangstabelle) werden einmal neu gerechnet – Erreichtes bleibt', () => {
    const st: AuszStand = { medaillen: {}, titel: {}, jahre: {} }
    const js = jahrHolen(st, 'en', 2026)
    js.basis = '-|7|---'
    js.grundlage = grundlage()
    js.schwellen = { ...jahresSchwellen(grundlage()), wortschatz: schwellen('wortschatz', 7) }
    js.medaillen.wortschatz = { stufe: 2, am: 5 }
    fortschreiben(st, [{ ...eingabe(), jahr: kontext(2026) }], 100)
    expect(js.schwellen.wortschatz).toEqual([36, 180, 450, 810, 1260, 1620])
    expect(js.medaillen.wortschatz).toEqual({ stufe: 2, am: 5 })
    const basis = js.basis
    fortschreiben(st, [{ ...eingabe(), jahr: kontext(2026) }], 200)
    expect(js.basis).toBe(basis)
  })
  it('Etappen im Band des Jahres zählen absolut, ohne Band der Zuwachs', () => {
    expect(jahresWerte({ wortschatz: 10, grammatik: 4, dranbleiben: 99, lehrwerk: 9, spiele: 5, hoeren: 1, zusammen: 0 }, { wortschatz: 4, lehrwerk: 6 }, { tageImJahr: 3, bandEtappen: null })).toEqual({
      wortschatz: 6,
      grammatik: 4,
      dranbleiben: 3,
      lehrwerk: 3,
      spiele: 5,
      hoeren: 1,
      zusammen: 0
    })
    expect(jahresWerte({ wortschatz: 0, grammatik: 0, dranbleiben: 0, lehrwerk: 9, spiele: 0, hoeren: 0, zusammen: 0 }, { lehrwerk: 6 }, { tageImJahr: 0, bandEtappen: 7 }).lehrwerk).toBe(7)
  })
  it('Jahrestitel in der Zielsprache', () => {
    expect(jahresTitelText('en', 4, 'n', 7, 2026)).toBe('Knight of Year 7')
    expect(jahresTitelText('en', 4, 'w', null, 2026)).toBe('Dame of 2026/27')
    expect(jahresTitelText('fr', 4, 'w', 7, 2026)).toBe('Chevalière de la 5e')
    expect(jahresTitelText('es', 4, 'm', 7, 2026)).toBe('Caballero de 1.º de ESO')
    expect(jahresTitelText('la', 6, 'n', 7, 2026)).toBe('Consul anni septimi')
    expect(jahresTitelText('it', 1, 'w', 6, 2026)).toBe('Viaggiatrice della prima media')
    expect(jahresTitelText('ru', 3, 'n', 9, 2026)).toBe('Talent der Klasse 9')
    expect(jahresTitelText('en', 0, 'n', 7, 2026)).toBeNull()
    expect(jahresLabel(6, 2026)).toBe('Kl. 6 (2026/27)')
    expect(jahresLabel(null, 2027)).toBe('2027/28')
  })
  it('Haupttitel über Jahre: die ersten vier Stufen wie bisher, die obersten brauchen mehrere Jahre', () => {
    expect(TITEL_AB_GESAMT.slice(0, 4)).toEqual(TITEL_AB.slice(0, 4))
    expect(TITEL_AB_GESAMT[TITEL_AB_GESAMT.length - 1]).toBeGreaterThan(42)
    expect(titelStufeGesamt(30)).toBe(5)
    expect(titelStufeGesamt(80)).toBe(8)
  })
})

describe('Umstellung der ersten Fassung', () => {
  it('bisherige Medaillen gehören zum laufenden Schuljahr – nichts geht verloren, wiederholbar ohne Wirkung', () => {
    const st: AuszStand = { medaillen: { en: { spiele: { stufe: 2, am: 5 }, wortschatz: { stufe: 1, am: 7 } }, fr: {} }, titel: { en: { stufe: 2, am: 7 } } }
    expect(jahreUmstellen(st, 2026, 1000)).toBe(true)
    expect(st.jahre!.en['2026']).toEqual({ jahrgang: null, start: {}, medaillen: { spiele: { stufe: 2, am: 5 }, wortschatz: { stufe: 1, am: 7 } }, titel: { stufe: 2, am: 7 } })
    expect(st.jahre!.fr['2026'].medaillen).toEqual({})
    expect(punkteVon(st, 'en')).toBe(3)
    expect(st.titel.en.stufe).toBe(2)
    const kopie = JSON.stringify(st)
    expect(jahreUmstellen(st, 2026, 2000)).toBe(false)
    expect(JSON.stringify(st)).toBe(kopie)
    // Erste Auswertung danach: Jahrgang und Schwellen kommen dazu, Erreichtes bleibt
    const js = jahrHolen(st, 'en', 2026)
    jahrGrundlageSetzen(js, grundlage({ jahrgang: 6 }))
    expect(js.jahrgang).toBe(6)
    expect(js.medaillen.spiele!.stufe).toBe(2)
  })
  it('Wartung auszeichnungen-jahre-2026-10-10 an der (verschlüsselten) Tabelle', () => {
    setzeSchluesselFuerTests(randomBytes(32))
    const r = new DatabaseSync(':memory:')
    r.exec('CREATE TABLE achievements (nutzer_id TEXT PRIMARY KEY, daten TEXT NOT NULL)')
    const d = geschuetzt(r)
    const rein = d.prepare('INSERT INTO achievements (nutzer_id, daten) VALUES (?, ?)')
    rein.run('a', JSON.stringify({ erreicht: { x: 1 }, ausz: { medaillen: { en: { spiele: { stufe: 1, am: 3 } } }, titel: { en: { stufe: 1, am: 3 } } }, titelWahl: { form: 'w' } }))
    rein.run('b', JSON.stringify({ erreicht: {}, ausz: { medaillen: {}, titel: {}, jahre: { en: { '2026': { jahrgang: 7, start: {}, medaillen: {} } } } } }))
    rein.run('c', 'kaputt')
    expect(auszeichnungenJahre(d, 1000, 2026)).toBe('1 Person auf Jahresreihen umgestellt (1 Medaille im Schuljahr 2026/27)')
    const a = JSON.parse((d.prepare("SELECT daten FROM achievements WHERE nutzer_id = 'a'").get() as { daten: string }).daten)
    expect(a.ausz.jahre.en['2026'].medaillen.spiele).toEqual({ stufe: 1, am: 3 })
    expect(a.titelWahl).toEqual({ form: 'w' })
    expect(a.erreicht).toEqual({ x: 1 })
    const b = JSON.parse((d.prepare("SELECT daten FROM achievements WHERE nutzer_id = 'b'").get() as { daten: string }).daten)
    expect(b.ausz.jahre.en['2026'].jahrgang).toBe(7)
    // In der Datei steht nichts im Klartext
    expect(String((r.prepare("SELECT daten FROM achievements WHERE nutzer_id = 'a'").get() as { daten: string }).daten)).not.toContain('spiele')
    expect(auszeichnungenJahre(d, 2000, 2026)).toMatch(/^0 Personen/)
  })
})

// ---------------------------------------------------------------- Server

async function rufe(route: (k: Anfrage) => Promise<boolean>, n: NutzerInfo, methode: 'GET' | 'POST', pfad: string, koerper: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  let text = ''
  const res = { writeHead: () => res, setHeader: () => res, end: (s: string | Buffer) => void (text = String(s)) }
  const k = {
    req: { method: methode, headers: methode === 'POST' ? { 'x-schulapps-token': 'probe' } : {}, socket: {} },
    res,
    url: new URL(`http://x${pfad}`),
    sitzung: { nutzer: n, kennung: 'probe' },
    ip: '',
    koerper: async () => koerper
  } as unknown as Anfrage
  await route(k)
  return JSON.parse(text || '{}') as Record<string, unknown>
}

interface SichtSprache {
  sprache: string
  jahr: string
  schuljahr: number
  grundlage: { band: string | null; woerter: number | null; schultage: number }
  medaillen: { kategorie: string; stufe: number; wert: number; ziel: number }[]
  jahrestitel: { stufe: number; text: string | null }
  frueher: { schuljahr: number; label: string; medaillen: { kategorie: string; stufe: number }[]; jahrestitel: string | null }[]
  titel: { stufe: number; text: string | null; leiter: { ab: number }[] }
  punkte: number
}

describe('Jahresreihen am Server', () => {
  let ida: NutzerInfo
  let kurs = ''
  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    const lk = nutzerAnlegen({ benutzer: 'j.lehr', name: 'Jo Lehr', rolle: 'lehrkraft', quelle: 'test' })
    ida = nutzerAnlegen({ benutzer: 'ida.probe', name: 'Ida Probe', rolle: 'schueler', quelle: 'lokal' })
    lerngruppenVon(lk.id)
    const g = randomBytes(6).toString('hex')
    datenbank()
      .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(g, lk.id, '7c', 'Englisch', '', JSON.stringify([ida.benutzer]), new Date().toISOString())
    kurs = vokabelnZuweisen({ lehrkraftId: lk.id, lerngruppeId: g, schueler: [], titel: 'Weather', sprache: 'en', fach: 'Englisch', woerter: [{ id: 'w1', term: 'rain', translation: 'Regen' }] })
  })

  it('Schuljahr mit Beschriftung und konkreter nächster Stufe; Wechsel am ersten Schultag; frühere Jahre bleiben', async () => {
    setzeSchulkalender(NI)
    setzeTestHeute('2026-10-10')
    const vok = vokabelRoute('http://x')
    for (let i = 0; i < 3; i++) await rufe(vok, ida, 'POST', '/s/api/vokabeln/spiel', { id: kurs, spiel: 'blitz', wert: 5 + i, fehler: [] })
    const ach = achievementsRoute()
    const a = (await rufe(ach, ida, 'GET', '/s/api/auszeichnungen')).sprachen as SichtSprache[]
    const en = a.find((s) => s.sprache === 'en')!
    expect(en.jahr).toBe('Kl. 7 (2026/27)')
    expect(en.schuljahr).toBe(2026)
    expect(en.grundlage.schultage).toBeGreaterThan(175)
    const spiele = en.medaillen.find((m) => m.kategorie === 'spiele')!
    expect(spiele.stufe).toBe(1)
    expect(spiele.ziel).toBe(jahresSchwellen(grundlage({ schultage: en.grundlage.schultage })).spiele[1])
    expect(en.jahrestitel).toMatchObject({ stufe: 1, text: 'Traveller of Year 7' })
    expect(en.titel.leiter.map((x) => x.ab)).toEqual([...TITEL_AB_GESAMT])
    expect(en.frueher).toEqual([])

    // Erster Schultag 2027/28: neue Reihe, die alte steht unter „Frühere Jahre"
    setzeTestHeute('2027-08-19')
    const b = ((await rufe(ach, ida, 'GET', '/s/api/auszeichnungen')).sprachen as SichtSprache[]).find((s) => s.sprache === 'en')!
    expect(b.schuljahr).toBe(2027)
    expect(b.medaillen.every((m) => m.stufe === 0)).toBe(true)
    expect(b.jahrestitel.stufe).toBe(0)
    expect(b.frueher).toHaveLength(1)
    expect(b.frueher[0]).toMatchObject({ schuljahr: 2026, label: 'Kl. 7 (2026/27)', jahrestitel: 'Traveller of Year 7' })
    expect(b.frueher[0].medaillen).toEqual([expect.objectContaining({ kategorie: 'spiele', stufe: 1 })])
    // Haupttitel und Punkte bleiben
    expect(b.titel.stufe).toBe(1)
    expect(b.punkte).toBe(1)
    // Lehrkraft: Medaillen des laufenden Schuljahres, Titel über alle Jahre
    expect(auszeichnungFuerLehrkraft(ida.id, 'en')).toMatchObject({ titel: 'Traveller', punkte: 1, punkteJahr: 0, schuljahr: '2027/28' })
    // Weiter üben im neuen Jahr: neue Bronze, alte bleibt
    for (let i = 0; i < 3; i++) await rufe(vok, ida, 'POST', '/s/api/vokabeln/spiel', { id: kurs, spiel: 'blitz', wert: 1, fehler: [] })
    const c = ((await rufe(ach, ida, 'GET', '/s/api/auszeichnungen')).sprachen as SichtSprache[]).find((s) => s.sprache === 'en')!
    expect(c.medaillen.find((m) => m.kategorie === 'spiele')!.stufe).toBe(1)
    expect(c.punkte).toBe(2)
    const d = achDatenLesen(ida.id)
    expect(Object.keys(d.ausz.jahre!.en).sort()).toEqual(['2026', '2027'])
    expect(d.ausz.jahre!.en['2026'].medaillen.spiele!.stufe).toBe(1)

    // Zurück auf heute (Testuhr): die Reihe 2026/27 gilt wieder, die künftige steht nicht unter „Frühere Jahre"
    setzeTestHeute('2026-10-11')
    const z = ((await rufe(ach, ida, 'GET', '/s/api/auszeichnungen')).sprachen as SichtSprache[]).find((s) => s.sprache === 'en')!
    expect(z.schuljahr).toBe(2026)
    expect(z.frueher).toEqual([])
  })
})
