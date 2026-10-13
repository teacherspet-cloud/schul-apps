/**
 * Medaillen nach der neuen Regel (12.10.2026, Entscheidung der Lehrkraft) und stille Berichtigung – Befund einer
 * Schülerin (Klasse 5, Green Line 1): 4 Übungstage, 319 Wörter gesehen, fast nur Erkennen (312 Wörter in Fach 2, 1 freier
 * Abruf, 0 sichere Wörter) – gespeichert war trotzdem Wortschatz GOLD. Ursache: Die erste Fassung (0.4.97) rechnete ohne
 * Band mit der Jahrgangstabelle (Klasse 5–6: Gold ab 300 Punkten, Wort ab Fach 2 = 1 Punkt); die Umstellung auf
 * Jahresreihen übernahm die Medaille, und „nie entziehen" hielt sie fest. Dazu Phantom-Sprache „lb" aus dem Vokabelweg.
 * Kein Netz, keine KI.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  AUSZ_REGEL,
  berichtigen,
  fortschreiben,
  jahresSchwellen,
  jahrHolen,
  offenBerichtigt,
  schwellen,
  spielZaehlt,
  sprachWerte,
  stufeFuer,
  titelStufe,
  titelStufeGesamt,
  type AuszStand,
  type JahresGrundlage,
  type JahresKontext,
  type SprachEingabe
} from '../src/shared/auszeichnungen'
import { bandKapitel, bandWoerter, grammatikImBand } from '../src/shared/auszeichnungenBand'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { standSpeichern, vokabelnZuweisen } from '../src/server/vokabeln'
import { achievementsRoute, bandAusWortId, wortKennengelernt, wortMerken, wortschatzJeSprache, type WortBest } from '../src/server/achievements'
import { achDatenLesen, achDatenSchreiben } from '../src/server/achievementsDaten'
import type { Anfrage } from '../src/server/http'
import type { WortStand } from '../src/shared/vokabeltrainer'

const gl1 = JSON.parse(readFileSync(join(__dirname, '..', 'resources', 'lehrwerke', 'green-line-1.json'), 'utf8'))
const W = bandWoerter(gl1)!
const G = grammatikImBand('Green Line 1')!
const U = bandKapitel(gl1)!
const grundlage: JahresGrundlage = { jahrgang: 5, band: { id: 'green-line-1', name: 'Green Line 1' }, woerter: W, grammatik: G, units: U, schultage: 188 }
const kontext = (k: Partial<JahresKontext> = {}): JahresKontext => ({ schuljahr: 2026, grundlage, tageImJahr: 4, bandEtappen: 1, ...k })
/** Die Schülerin aus dem Befund */
const befund = (e: Partial<SprachEingabe> = {}): SprachEingabe => ({
  sprache: 'en',
  jahrgang: 5,
  woerterErkannt: 312,
  woerterFrei: 1,
  woerterSicher: 0,
  regelnGeuebt: 4,
  regelnSicher: 0,
  tage: 4,
  units: [],
  zaehler: { spielrunden: 8, rekorde: 2, hoeren: 15, zusammenRunden: 12, teamZiele: 3 },
  jahr: kontext(),
  ...e
})
const stand = (w: WortStand['fach'], x: Partial<WortStand> = {}): WortStand => ({
  fach: w,
  faellig: 0,
  frei: [],
  erkannt: 0,
  erkennenVersuche: 0,
  versuche: 1,
  falsch: 0,
  fehlerTexte: [],
  zuletzt: 1,
  ...x
})

describe('Wortschatz gestuft (Klasse 5, Green Line 1)', () => {
  it('Band: rund 1.089 Wörter, Schwellen aus 4 × Wörter', () => {
    expect(W).toBeGreaterThan(1000)
    expect(W).toBeLessThan(1200)
    const s = jahresSchwellen(grundlage).wortschatz
    expect(s[0]).toBeLessThanOrEqual(50)
    expect(s[1]).toBeLessThanOrEqual(250)
    // Gold mit Erkennen allein nicht erreichbar (höchstens 1 Punkt je Wort), Platin nicht ohne sichere Wörter
    expect(s[2]).toBeGreaterThan(W)
    expect(s[3]).toBeGreaterThan(2 * W)
  })
  it('Befund: fast nur Erkennen → Silber, kein Gold', () => {
    const w = sprachWerte(befund())
    expect(w.wortschatz).toBe(313)
    expect(stufeFuer(w.wortschatz, jahresSchwellen(grundlage).wortschatz)).toBe(2)
    // Selbst jedes Wort des Bands nur erkannt: höchstens Silber
    expect(stufeFuer(sprachWerte(befund({ woerterErkannt: W, woerterFrei: 0 })).wortschatz, jahresSchwellen(grundlage).wortschatz)).toBe(2)
    // Mit freiem Abruf und Behalten geht es weiter: 600 erkannt, 400 frei, 160 sicher → Gold
    expect(
      stufeFuer(sprachWerte(befund({ woerterErkannt: 600, woerterFrei: 400, woerterSicher: 160 })).wortschatz, jahresSchwellen(grundlage).wortschatz)
    ).toBe(3)
  })
  it('so kam das Gold zustande: alte Jahrgangstabelle Klasse 5–6, Gold ab 300', () => {
    expect(schwellen('wortschatz', 5)[2]).toBe(300)
  })
  it('Grammatik: Gold verlangt sichere Formen', () => {
    const s = jahresSchwellen(grundlage).grammatik
    expect(s[2]).toBeGreaterThan(G)
  })
})

describe('Kennengelernt, Doppelzählung, Phantom-Sprache', () => {
  it('kennengelernt erst mit einer richtigen Antwort – nicht mit der Lernkarte', () => {
    expect(wortKennengelernt(stand(1))).toBe(false) // „wusste ich" auf der Karte
    expect(wortKennengelernt(stand(0, { versuche: 2, falsch: 2 }))).toBe(false)
    expect(wortKennengelernt(stand(1, { erkannt: 1 }))).toBe(true) // erkannt, danach zurückgefallen
    expect(wortKennengelernt(stand(2))).toBe(true)
    expect(wortKennengelernt(stand(3, { frei: [5] }))).toBe(true)
  })
  it('gleiches Wort aus Kurs und Vokabelweg zählt einmal; ohne Sprache keine Medaillenreihe', () => {
    const best = new Map<string, WortBest>()
    wortMerken(best, 'en:dog', stand(2, { erkannt: 1 }))
    wortMerken(best, 'en:dog', stand(3, { frei: [1] }))
    wortMerken(best, 'en:cat', stand(1)) // nur Karte
    wortMerken(best, '§weg:green-line:b:x:0:0:1', stand(2, { erkannt: 1 }))
    const je = wortschatzJeSprache(best, new Map([['en', new Set(['2026-10-01'])]]))
    expect([...je.keys()]).toEqual(['en'])
    expect(je.get('en')).toMatchObject({ erkannt: 1, frei: 1, sicher: 0 })
    expect(bandAusWortId('b:green-line-1:0:2:14')).toBe('green-line-1')
    expect(bandAusWortId('z:abc:w1')).toBeNull()
  })
})

describe('Spiele nur mit sinnvoller Leistung', () => {
  it('Wert über 0; bei „mehr ist besser" mindestens 3', () => {
    expect(spielZaehlt(0, false)).toBe(false)
    expect(spielZaehlt(2, false)).toBe(false)
    expect(spielZaehlt(3, false)).toBe(true)
    expect(spielZaehlt(14, true)).toBe(true) // Züge/Sekunden: nur beendete Runden werden gemeldet
    expect(spielZaehlt(0, true)).toBe(false)
    expect(spielZaehlt(Number.NaN, false)).toBe(false)
  })
})

/** Gespeicherter Stand wie bei der Schülerin: Wortschatz Gold, Zusammen Gold (Übernahme), Titel Stufe 4 */
const gespeichert = (): AuszStand => {
  const st: AuszStand = { medaillen: {}, titel: {}, jahre: {} }
  const js = jahrHolen(st, 'en', 2026)
  js.jahrgang = 5
  js.basis = 'v2|green-line-1|5|wgu'
  js.medaillen = {
    lehrwerk: { stufe: 1, am: 1 },
    spiele: { stufe: 1, am: 1 },
    zusammen: { stufe: 3, am: 1 },
    wortschatz: { stufe: 3, am: 2 },
    dranbleiben: { stufe: 1, am: 1 },
    hoeren: { stufe: 1, am: 1 },
    grammatik: { stufe: 1, am: 1 }
  }
  js.titel = { stufe: 4, am: 2 }
  st.medaillen.en = { ...js.medaillen }
  st.titel.en = { stufe: 4, am: 2 }
  return st
}

describe('Stille Berichtigung', () => {
  it('Gold → verdienter Stand, Titel nachgezogen, einmalig; danach wieder nie entzogen', () => {
    const st = gespeichert()
    expect(berichtigen(st, [befund()], 100)).toBe(true)
    const js = st.jahre!.en['2026']
    expect(js.medaillen.wortschatz).toEqual({ stufe: 2, am: 2 })
    // Zusammen: 12 Runden + 3 Team-Ziele = 15 Punkte → Silber (Gold erst ab 23)
    expect(js.medaillen.zusammen!.stufe).toBe(2)
    expect(js.medaillen.lehrwerk!.stufe).toBe(1)
    expect(js.medaillen.dranbleiben!.stufe).toBe(1)
    const punkte = Object.values(js.medaillen).reduce((a, x) => a + (x?.stufe ?? 0), 0)
    // Grammatik (13.10.2026): Prozent des Bands – mit den alten Punkten keine Medaille mehr
    expect(js.medaillen.grammatik).toBeUndefined()
    expect(punkte).toBe(8)
    expect(js.titel!.stufe).toBe(titelStufe(8))
    expect(st.titel.en.stufe).toBe(titelStufeGesamt(8))
    expect(st.titel.en.stufe).toBe(3)
    // Sammlung folgt der Reihe
    expect(st.medaillen.en.wortschatz!.stufe).toBe(2)
    expect(st.regel).toBe(AUSZ_REGEL)
    // Schwellen nach der neuen Regel
    expect(js.schwellen!.wortschatz).toEqual(jahresSchwellen(grundlage).wortschatz)
    // Wiederholt: keine Wirkung
    const vorher = JSON.stringify(st)
    expect(berichtigen(st, [befund({ woerterErkannt: 0, woerterFrei: 0 })], 200)).toBe(false)
    expect(JSON.stringify(st)).toBe(vorher)
    // Fortschreiben meldet nichts Neues (keine Meldung an das Kind) …
    expect(fortschreiben(st, [befund()], 300)).toEqual([])
    // … und entzieht nach der Berichtigung nichts mehr
    fortschreiben(st, [befund({ woerterErkannt: 0, woerterFrei: 0, zaehler: {} })], 400)
    expect(js.medaillen.wortschatz!.stufe).toBe(2)
  })
  it('nicht mehr stimmende, noch nicht gemeldete Glückwünsche fallen weg', () => {
    const st = gespeichert()
    berichtigen(st, [befund()], 100)
    const offen = offenBerichtigt(st, [
      { art: 'medaille', sprache: 'en', kategorie: 'wortschatz', stufe: 3, schuljahr: 2026, jahrgang: 5 },
      { art: 'medaille', sprache: 'en', kategorie: 'wortschatz', stufe: 2, schuljahr: 2026, jahrgang: 5 },
      { art: 'titel', sprache: 'en', stufe: 4 },
      { art: 'jahrestitel', sprache: 'en', stufe: 3, schuljahr: 2026, jahrgang: 5 }
    ])
    expect(offen.map((n) => `${n.art}:${n.stufe}`)).toEqual(['medaille:2', 'jahrestitel:3'])
  })
  it('Übernommenes bleibt nur, soweit es nach der neuen Regel erreicht ist', () => {
    const st: AuszStand = { medaillen: {}, titel: {}, jahre: {}, regel: AUSZ_REGEL }
    const js = jahrHolen(st, 'en', 2026)
    js.medaillen = { zusammen: { stufe: 3, am: 1 }, dranbleiben: { stufe: 2, am: 1 } }
    // Merker gesetzt, aber Übernahme gerade erst geschehen → erzwungen
    expect(berichtigen(st, [befund({ zaehler: { zusammenRunden: 30 } })], 100, true)).toBe(true)
    expect(js.medaillen.zusammen!.stufe).toBe(3) // 30 Punkte ≥ Gold (23): bleibt
    expect(js.medaillen.dranbleiben!.stufe).toBe(1) // 4 Tage: Bronze
  })
})

async function rufe(route: (k: Anfrage) => Promise<boolean>, n: NutzerInfo, pfad: string): Promise<Record<string, unknown>> {
  let text = ''
  const res = { writeHead: () => res, setHeader: () => res, end: (s: string | Buffer) => void (text = String(s)) }
  const k = {
    req: { method: 'GET', headers: {}, socket: {} },
    res,
    url: new URL(`http://x${pfad}`),
    sitzung: { nutzer: n, kennung: 'probe' },
    ip: '',
    koerper: async () => ({})
  } as unknown as Anfrage
  await route(k)
  return JSON.parse(text || '{}') as Record<string, unknown>
}

describe('Berichtigung am Server', () => {
  let mia: NutzerInfo
  let kurs = ''
  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    const lk = nutzerAnlegen({ benutzer: 'b.lehr', name: 'Bo Lehr', rolle: 'lehrkraft', quelle: 'test' })
    mia = nutzerAnlegen({ benutzer: 'mia.probe', name: 'Mia Probe', rolle: 'schueler', quelle: 'lokal' })
    lerngruppenVon(lk.id)
    const g = randomBytes(6).toString('hex')
    datenbank()
      .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(g, lk.id, '5b', 'Englisch', '', JSON.stringify([mia.benutzer]), new Date().toISOString())
    const woerter = Array.from({ length: 40 }, (_, i) => ({ id: `w${i}`, term: `word${i}`, translation: `Wort${i}` }))
    kurs = vokabelnZuweisen({ lehrkraftId: lk.id, lerngruppeId: g, schueler: [], titel: 'Unit 1', sprache: 'en', fach: 'Englisch', woerter })
  })

  it('Gold aus der alten Regel wird still auf den verdienten Stand gesetzt; Phantom „lb" verschwindet', async () => {
    // 30 Wörter nur wiedererkannt (Fach 2), 10 nur mit der Lernkarte gesehen
    const woerter: Record<string, WortStand> = {}
    for (let i = 0; i < 40; i++) woerter[`w${i}`] = i < 30 ? stand(2, { erkannt: 1 }) : stand(1)
    standSpeichern(kurs, mia.id, { woerter, tage: ['2026-10-08', '2026-10-09'] })
    const d = achDatenLesen(mia.id)
    d.uebernommen = '-'
    d.ausz = {
      medaillen: { en: { wortschatz: { stufe: 3, am: 5 } }, lb: { wortschatz: { stufe: 1, am: 5 } } },
      titel: { en: { stufe: 2, am: 5 }, lb: { stufe: 1, am: 5 } }
    }
    d.offenAusz = [{ art: 'medaille', sprache: 'en', kategorie: 'wortschatz', stufe: 3 }]
    achDatenSchreiben(mia.id, d)
    const ach = achievementsRoute()
    const a = (await rufe(ach, mia, '/s/api/auszeichnungen')).sprachen as { sprache: string; medaillen: { kategorie: string; stufe: number; wert: number }[] }[]
    expect(a.map((s) => s.sprache)).toEqual(['en'])
    const ws = a[0].medaillen.find((m) => m.kategorie === 'wortschatz')!
    // 30 Punkte (nur Erkennen) – ohne Band typischer Band: Bronze ab 36 → keine Medaille mehr
    expect(ws.wert).toBe(30)
    expect(ws.stufe).toBe(0)
    const nach = achDatenLesen(mia.id)
    expect(nach.ausz.regel).toBe(AUSZ_REGEL)
    expect(nach.ausz.medaillen.lb).toBeUndefined()
    expect(nach.ausz.titel.en).toBeUndefined()
    // Keine Meldung an das Kind
    expect((await rufe(ach, mia, '/s/api/achievements/neu')).auszeichnungen).toEqual([])
  })
})
