/**
 * Medaillen und Titel je Sprache (10.10.2026) – shared/auszeichnungen.ts, Bilder shared/auszeichnungenBilder.ts, Server
 * server/achievements.ts (/s/api/auszeichnungen…), Profilbild in darstellungFelder.ts.
 */
import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  angezeigterTitel,
  etappen,
  fortschreiben,
  hatFormen,
  KATEGORIEN,
  medaillen,
  medaillenPunkte,
  mitTitel,
  schwellen,
  sprachWerte,
  stufeFuer,
  TITEL_AB,
  TITEL_LEITERN,
  titelFuerSprache,
  titelStufe,
  titelText,
  uebernahmeAnwenden,
  uebernahmeAusAlt,
  zaehlerAusAlt,
  type AuszStand,
  type SprachEingabe
} from '../src/shared/auszeichnungen'
import { BILDER, bildSvg, bilderFuerSprache, freigeschaltet, freigeschaltetIn, leiterVon } from '../src/shared/auszeichnungenBilder'
import { darstellungPruefen } from '../src/server/darstellungFelder'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import { lerngruppenVon } from '../src/server/onlinetest'
import { vokabelnZuweisen, vokabelRoute } from '../src/server/vokabeln'
import { achievementsRoute, auszeichnungFuerLehrkraft, profilFuer } from '../src/server/achievements'
import { achDatenLesen, achDatenSchreiben } from '../src/server/achievementsDaten'
import type { Anfrage } from '../src/server/http'

const leer = (): AuszStand => ({ medaillen: {}, titel: {} })
const eingabe = (e: Partial<SprachEingabe> = {}): SprachEingabe => ({
  sprache: 'en',
  jahrgang: 9,
  woerterAb2: 0,
  woerterSicher: 0,
  regelnGeuebt: 0,
  regelnSicher: 0,
  tage: 0,
  units: [],
  zaehler: {},
  ...e
})

describe('Medaillen: Schwellen nach Jahrgang', () => {
  it('Mengen-Kategorien richten sich nach dem Jahrgang, Fleiß-Kategorien nicht', () => {
    expect(schwellen('wortschatz', 9)).toEqual([20, 150, 500, 1200, 2500, 4500])
    expect(schwellen('wortschatz', 5)).toEqual([12, 90, 300, 720, 1500, 2700])
    expect(schwellen('wortschatz', 7)).toEqual([16, 120, 400, 960, 2000, 3600])
    expect(schwellen('wortschatz', 12)).toEqual([24, 180, 600, 1440, 3000, 5400])
    expect(schwellen('grammatik', 5)).toEqual([2, 9, 24, 54, 96, 156])
    for (const k of ['dranbleiben', 'hoeren', 'lehrwerk', 'spiele', 'zusammen'] as const) expect(schwellen(k, 5)).toEqual(schwellen(k, 12))
    // Ohne Jahrgang wie Klasse 7–8
    expect(schwellen('wortschatz', null)).toEqual(schwellen('wortschatz', 8))
  })
  it('alle Schwellen sind streng steigend und mindestens 1', () => {
    for (const k of KATEGORIEN)
      for (const j of [5, 6, 7, 8, 9, 10, 11, 12, 13, null]) {
        const s = schwellen(k.id, j)
        expect(s).toHaveLength(6)
        expect(s[0]).toBeGreaterThanOrEqual(1)
        for (let i = 1; i < 6; i++) expect(s[i]).toBeGreaterThan(s[i - 1])
      }
  })
  it('Bronze ist in wenigen Tagen erreichbar', () => {
    expect(schwellen('dranbleiben', 5)[0]).toBeLessThanOrEqual(3)
    expect(schwellen('spiele', 5)[0]).toBeLessThanOrEqual(3)
    expect(schwellen('zusammen', 5)[0]).toBe(1)
  })
  it('gleiche Leistung: Klasse 5 hat ihre Medaille, wo Klasse 11 noch arbeitet', () => {
    const w = { wortschatz: 100 }
    expect(medaillen(w, 5).find((m) => m.kategorie === 'wortschatz')!.stufe).toBe(2)
    expect(medaillen(w, 11).find((m) => m.kategorie === 'wortschatz')!.stufe).toBe(1)
  })
  it('Stufe, Ziel und Start des Balkens', () => {
    expect(stufeFuer(0, [1, 2, 3, 4, 5, 6])).toBe(0)
    expect(stufeFuer(6, [1, 2, 3, 4, 5, 6])).toBe(6)
    const m = medaillen({ spiele: 25 }, 9).find((x) => x.kategorie === 'spiele')!
    expect(m).toMatchObject({ stufe: 2, wert: 25, von: 20, ziel: 60 })
    const meister = medaillen({ zusammen: 999 }, 9).find((x) => x.kategorie === 'zusammen')!
    expect(meister).toMatchObject({ stufe: 6, ziel: null })
  })
  it('Gespeichertes wird nie entzogen (höhere Stufe gilt)', () => {
    const m = medaillen({ spiele: 0 }, 9, { spiele: { stufe: 3, am: 5 } }).find((x) => x.kategorie === 'spiele')!
    expect(m).toMatchObject({ stufe: 3, am: 5, ziel: 150 })
  })
})

describe('Werte je Sprache', () => {
  it('Wortschatz, Grammatik, Etappen und Zähler', () => {
    const w = sprachWerte(
      eingabe({
        woerterAb2: 10,
        woerterSicher: 4,
        regelnGeuebt: 3,
        regelnSicher: 2,
        tage: 5,
        units: [
          { gesamt: 10, gelernt: 8, sicher: 8 },
          { gesamt: 10, gelernt: 9, sicher: 1 },
          { gesamt: 0, gelernt: 0, sicher: 0 }
        ],
        zaehler: { spielrunden: 3, rekorde: 1, hoeren: 12, zusammenRunden: 2, teamZiele: 1 }
      })
    )
    expect(w).toEqual({ wortschatz: 14, grammatik: 7, dranbleiben: 5, lehrwerk: 4, spiele: 4, hoeren: 12, zusammen: 3 })
    expect(etappen([{ gesamt: 5, gelernt: 4, sicher: 3 }])).toBe(1)
  })
})

describe('Titel', () => {
  it('Titelstufe aus Punkten; Punkte aus Stufen', () => {
    expect(titelStufe(0)).toBe(0)
    expect(titelStufe(1)).toBe(1)
    expect(titelStufe(9)).toBe(3)
    expect(titelStufe(30)).toBe(8)
    expect(medaillenPunkte([1, 6, 3, 0])).toBe(10)
    // Der höchste Titel bleibt erreichbar, auch ohne zwei Kategorien (5 × Meister = 30)
    expect(TITEL_AB[TITEL_AB.length - 1]).toBeLessThanOrEqual(30)
  })
  it('jede Leiter hat acht Stufen mit männlich, weiblich und neutral', () => {
    for (const [, leiter] of Object.entries(TITEL_LEITERN)) {
      expect(leiter).toHaveLength(TITEL_AB.length)
      for (const x of leiter) for (const f of [x.m, x.w, x.n, x.de]) expect(f.trim().length).toBeGreaterThan(1)
    }
  })
  it('Form wählt die Person – ohne Wahl neutral', () => {
    expect(titelText('en', 4, 'm')).toBe('Sir')
    expect(titelText('en', 4, 'w')).toBe('Dame')
    expect(titelText('en', 4, 'n')).toBe('Knight')
    expect(titelText('en', 4, undefined)).toBe('Knight')
    expect(titelText('fr', 1, 'w')).toBe('Voyageuse')
    expect(titelText('la', 8, 'w')).toBe('Mater Patriae')
    expect(titelText('la', 7, 'n')).toBe('Senator')
    expect(titelText('es', 4, 'w')).toBe('Dama')
    expect(titelText('en', 0, 'm')).toBeNull()
    // Sprache ohne eigene Leiter: neutrale allgemeine Leiter
    expect(titelText('ru', 1, 'm')).toBe('Gast')
    expect(hatFormen('en', 1)).toBe(false)
    expect(hatFormen('en', 4)).toBe(true)
  })
  it('Anzeige: „Sir Lars", gewählter Titel, automatisch, keiner', () => {
    expect(mitTitel('Sir', 'Lars')).toBe('Sir Lars')
    expect(mitTitel(null, 'Lars')).toBe('Lars')
    const erreicht = { en: { stufe: 4, punkte: 11 }, fr: { stufe: 2, punkte: 3 } }
    expect(angezeigterTitel(erreicht, { form: 'm' })).toMatchObject({ sprache: 'en', text: 'Sir' })
    expect(angezeigterTitel(erreicht, { form: 'w', anzeige: { sprache: 'fr', stufe: 2 } })).toMatchObject({ text: 'Citoyenne' })
    // Nicht (mehr) erreichter Titel gewählt: zurück zum höchsten
    expect(angezeigterTitel(erreicht, { form: 'w', anzeige: { sprache: 'fr', stufe: 5 } })).toMatchObject({ text: 'Dame' })
    expect(angezeigterTitel(erreicht, { anzeige: 'aus' })).toBeNull()
    expect(angezeigterTitel({}, {})).toBeNull()
    // Spielraum: Titel der Sprache des Spiels
    expect(titelFuerSprache('fr', 2, { form: 'm' })).toBe('Citoyen')
    expect(titelFuerSprache('en', 4, { form: 'm', anzeige: { sprache: 'en', stufe: 2 } })).toBe('Citizen')
    expect(titelFuerSprache('en', 4, { form: 'm', anzeige: 'aus' })).toBeNull()
  })
})

describe('Fortschreiben und Übernahme', () => {
  it('neue Medaillen und Titel genau einmal, nie abwärts', () => {
    const st = leer()
    const neu = fortschreiben(st, [eingabe({ zaehler: { spielrunden: 3 } }), eingabe({ sprache: 'fr' })], 100)
    expect(neu).toEqual([
      { art: 'medaille', sprache: 'en', kategorie: 'spiele', stufe: 1 },
      { art: 'titel', sprache: 'en', stufe: 1 }
    ])
    expect(fortschreiben(st, [eingabe({ zaehler: { spielrunden: 3 } })], 200)).toEqual([])
    // Werte sinken (Kurs entfernt) – Medaille und Titel bleiben
    expect(fortschreiben(st, [eingabe()], 300)).toEqual([])
    expect(st.medaillen.en.spiele).toEqual({ stufe: 1, am: 100 })
    expect(st.titel.en).toEqual({ stufe: 1, am: 100 })
    expect(st.medaillen.fr).toEqual({})
  })
  it('alte Achievements → Medaillen (Kategorie und Stufe)', () => {
    const alt = {
      'serie-14': { gruppe: 'dranbleiben', medaille: 'silber' },
      'serie-3': { gruppe: 'dranbleiben', medaille: 'bronze' },
      'sicher-1000': { gruppe: 'wortschatz', medaille: 'gold' },
      'diktat-10': { gruppe: 'besonderes', medaille: 'bronze' },
      'stammformen-25': { gruppe: 'besonderes', medaille: 'bronze' },
      comeback: { gruppe: 'dranbleiben', medaille: null },
      'zusammen-erste': { gruppe: 'zusammen', medaille: 'bronze' },
      'unit:x:Unit 1:100': { gruppe: 'lehrwerk', medaille: 'gold' }
    }
    expect(uebernahmeAusAlt(alt)).toEqual({ dranbleiben: 2, wortschatz: 3, hoeren: 1, grammatik: 1, zusammen: 1, lehrwerk: 3 })
  })
  it('Übernahme verliert nichts und ist wiederholbar', () => {
    const st = leer()
    st.medaillen.en = { wortschatz: { stufe: 4, am: 1 } }
    const alt = { 'sicher-1000': { gruppe: 'wortschatz', medaille: 'gold', am: 50 }, 'serie-14': { gruppe: 'dranbleiben', medaille: 'silber', am: 60 } }
    uebernahmeAnwenden(st, alt, 'en', 1000)
    expect(st.medaillen.en.wortschatz).toEqual({ stufe: 4, am: 1 })
    expect(st.medaillen.en.dranbleiben).toEqual({ stufe: 2, am: 60 })
    expect(st.titel.en.stufe).toBe(titelStufe(6))
    const kopie = JSON.stringify(st)
    uebernahmeAnwenden(st, alt, 'en', 2000)
    expect(JSON.stringify(st)).toBe(kopie)
  })
  it('alte Zähler als Startwerte', () => {
    expect(zaehlerAusAlt({ rekordeGebrochen: 2, diktate: 7, koopRunden: 1, versusSpiele: 2, teamZiele: 1 }, 4)).toEqual({
      spielrunden: 4,
      rekorde: 2,
      hoeren: 7,
      zusammenRunden: 3,
      teamZiele: 1
    })
  })
})

// ---------------------------------------------------------------- Bilder

/** Einfache Prüfung auf wohlgeformtes XML: Tags paarweise geschlossen, Attribute in Anführungszeichen */
function wohlgeformt(svg: string): boolean {
  const stapel: string[] = []
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g
  let pos = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(svg))) {
    if (/[<>]/.test(svg.slice(pos, m.index))) return false
    pos = re.lastIndex
    if (m[1]) {
      if (stapel.pop() !== m[2]) return false
    } else if (!m[4]) stapel.push(m[2])
  }
  return stapel.length === 0 && !/[<>]/.test(svg.slice(pos))
}

describe('Bilder (Platzhalter)', () => {
  it('je Medaille (7 × 6) und je Titelstufe jeder Leiter ein Bild, Kennungen eindeutig', () => {
    expect(BILDER.filter((b) => b.art === 'medaille')).toHaveLength(42)
    expect(BILDER.filter((b) => b.art === 'titel')).toHaveLength(Object.keys(TITEL_LEITERN).length * 8)
    expect(new Set(BILDER.map((b) => b.id)).size).toBe(BILDER.length)
  })
  it('SVG ist gleichbleibend und wohlgeformt, gesperrt mit Schloss und grau', () => {
    for (const b of BILDER)
      for (const g of [false, true]) {
        const s = bildSvg(b.id, g)!
        expect(s).toBe(bildSvg(b.id, g))
        expect(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
        expect(s).not.toMatch(/NaN|undefined|null/)
        expect(wohlgeformt(s)).toBe(true)
      }
    expect(bildSvg('m-spiele-1', true)).toContain('#495057')
    expect(bildSvg('m-spiele-1', true)).not.toContain('#d6336c')
    expect(bildSvg('m-spiele-1')).toContain('#d6336c')
    expect(bildSvg('gibt-es-nicht')).toBeNull()
    expect(wohlgeformt('<svg><g></svg>')).toBe(false)
  })
  it('Freischalten: Medaille ab ihrer Stufe, Titel nur in der Leiter der Sprache', () => {
    const st = leer()
    st.medaillen.en = { spiele: { stufe: 2, am: 1 } }
    st.titel.en = { stufe: 1, am: 1 }
    expect(freigeschaltetIn(st, 'en', 'm-spiele-1')).toBe(true)
    expect(freigeschaltetIn(st, 'en', 'm-spiele-2')).toBe(true)
    expect(freigeschaltetIn(st, 'en', 'm-spiele-3')).toBe(false)
    expect(freigeschaltetIn(st, 'fr', 'm-spiele-1')).toBe(false)
    expect(freigeschaltetIn(st, 'en', 't-en-1')).toBe(true)
    expect(freigeschaltetIn(st, 'en', 't-en-2')).toBe(false)
    expect(freigeschaltetIn(st, 'en', 't-fr-1')).toBe(false)
    expect(freigeschaltet(st, 'm-spiele-2')).toBe(true)
    expect(freigeschaltet(st, 'm-wortschatz-1')).toBe(false)
    expect(bilderFuerSprache('fr')).toHaveLength(50)
    expect(leiterVon('ru')).toBe('allgemein')
    expect(bilderFuerSprache('ru').filter((b) => b.art === 'titel').every((b) => b.leiter === 'allgemein')).toBe(true)
  })
  it('Profilbild nur, wenn freigeschaltet', () => {
    const erlaubt = (id: string): boolean => id === 'm-spiele-1'
    expect(darstellungPruefen({ avatar: 'm-spiele-1' }, null, erlaubt).avatar).toBe('m-spiele-1')
    expect(darstellungPruefen({ avatar: 'm-spiele-6' }, null, erlaubt).avatar).toBe('')
    expect(darstellungPruefen({ avatar: '../etc/passwd' }, null, () => true).avatar).toBe('')
    expect(darstellungPruefen({ avatar: 'm-spiele-1' }).avatar).toBe('')
  })
})

// ---------------------------------------------------------------- Server

async function rufe(
  route: (k: Anfrage) => Promise<boolean>,
  n: NutzerInfo,
  methode: 'GET' | 'POST',
  pfad: string,
  koerper: Record<string, unknown> = {}
): Promise<{ code: number; d: Record<string, unknown>; text: string }> {
  let code = 0
  let text = ''
  const res = {
    writeHead: (c: number) => ((code = c), res),
    setHeader: () => res,
    end: (s: string | Buffer) => void (text = String(s))
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
  let d: Record<string, unknown> = {}
  try {
    d = JSON.parse(text || '{}') as Record<string, unknown>
  } catch {
    d = {}
  }
  return { code, d, text }
}

describe('Medaillen und Titel am Server', () => {
  let lia: NutzerInfo
  let alt: NutzerInfo
  let lk: NutzerInfo
  let en = ''
  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    lk = nutzerAnlegen({ benutzer: 'm.lehr', name: 'Mo Lehr', rolle: 'lehrkraft', quelle: 'test' })
    lia = nutzerAnlegen({ benutzer: 'lia.probe', name: 'Lia Probe', rolle: 'schueler', quelle: 'lokal' })
    alt = nutzerAnlegen({ benutzer: 'olaf.probe', name: 'Olaf Probe', rolle: 'schueler', quelle: 'lokal' })
    lerngruppenVon(lk.id)
    const gruppe = (name: string, fach: string): string => {
      const g = randomBytes(6).toString('hex')
      datenbank()
        .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(g, lk.id, name, fach, '', JSON.stringify([lia.benutzer, alt.benutzer]), new Date().toISOString())
      return g
    }
    en = vokabelnZuweisen({ lehrkraftId: lk.id, lerngruppeId: gruppe('5a', 'Englisch'), schueler: [], titel: 'Unit 1', sprache: 'en', fach: 'Englisch', woerter: [{ id: 'w1', term: 'dog', translation: 'Hund' }] })
    vokabelnZuweisen({ lehrkraftId: lk.id, lerngruppeId: gruppe('7f', 'Französisch'), schueler: [], titel: 'Unité 1', sprache: 'fr', fach: 'Französisch', woerter: [{ id: 'w1', term: 'chien', translation: 'Hund' }] })
  })

  it('zwei Sprachen, zwei Reihen; Bronze in Spiele; Titel; Form wählen; Anzeige', async () => {
    const vok = vokabelRoute('http://x')
    for (let i = 0; i < 3; i++) await rufe(vok, lia, 'POST', '/s/api/vokabeln/spiel', { id: en, spiel: 'blitz', wert: 5 + i, fehler: [] })
    // Diktat zählt für „Hören & Sprechen"
    await rufe(vok, lia, 'POST', '/s/api/vokabeln/antwort', { id: en, wortId: 'w1', uebung: 'diktat', antwort: 'dog' })
    const ach = achievementsRoute()
    const neu = await rufe(ach, lia, 'GET', '/s/api/achievements/neu')
    const meldungen = neu.d.auszeichnungen as { art: string; sprache: string; text: string }[]
    expect(meldungen).toEqual(expect.arrayContaining([expect.objectContaining({ art: 'medaille', sprache: 'en', text: 'Spiele' }), expect.objectContaining({ art: 'titel', sprache: 'en', text: 'Traveller' })]))
    expect((await rufe(ach, lia, 'GET', '/s/api/achievements/neu')).d.auszeichnungen).toEqual([])

    const a = await rufe(ach, lia, 'GET', '/s/api/auszeichnungen')
    const sprachen = a.d.sprachen as { sprache: string; jahrgang: number; medaillen: { kategorie: string; stufe: number; wert: number }[]; titel: { stufe: number }; sammlung: { id: string; frei: boolean }[] }[]
    expect(sprachen.map((s) => s.sprache)).toEqual(['en', 'fr'])
    expect(sprachen[0].jahrgang).toBe(5)
    expect(sprachen[0].medaillen.find((m) => m.kategorie === 'spiele')).toMatchObject({ stufe: 1, wert: 5 }) // 3 Runden + 2 gebrochene Rekorde
    expect(sprachen[0].medaillen.find((m) => m.kategorie === 'hoeren')!.wert).toBe(1)
    expect(sprachen[0].titel.stufe).toBe(1)
    expect(sprachen[1].titel.stufe).toBe(0)
    expect(sprachen[1].medaillen.every((m) => m.stufe === 0)).toBe(true)
    expect(sprachen[0].sammlung.find((b) => b.id === 'm-spiele-1')!.frei).toBe(true)
    expect(sprachen[1].sammlung.find((b) => b.id === 'm-spiele-1')!.frei).toBe(false)
    // Erster Titel: Form noch offen (Beispiel mit unterschiedlichen Formen), angezeigt neutral
    expect(a.d.formOffen).toBe(true)
    expect(a.d.beispiel).toEqual({ m: 'Sir', w: 'Dame', n: 'Knight' })
    expect(a.d.anzeige).toMatchObject({ text: 'Traveller' })

    // Nicht erreichter Titel lässt sich nicht wählen, unbekannte Form auch nicht
    expect((await rufe(ach, lia, 'POST', '/s/api/auszeichnungen/wahl', { anzeige: { sprache: 'en', stufe: 2 } })).code).toBe(400)
    expect((await rufe(ach, lia, 'POST', '/s/api/auszeichnungen/wahl', { form: 'x' })).code).toBe(400)
    const w = await rufe(ach, lia, 'POST', '/s/api/auszeichnungen/wahl', { form: 'w' })
    expect(w.d).toMatchObject({ formOffen: false, wahl: { form: 'w' } })
    const t = await rufe(ach, lia, 'GET', '/s/api/auszeichnungen/titel')
    expect(t.d.anzeige).toMatchObject({ sprache: 'en', text: 'Traveller' })
    expect((await rufe(ach, lia, 'POST', '/s/api/auszeichnungen/wahl', { anzeige: 'aus' })).d.anzeige).toBeNull()
    expect(profilFuer(lia.id, 'en', 1).titel).toBeNull()
    // „Keinen Titel zeigen" gilt auch für die Lehrkraft – Medaillen sieht sie weiter
    expect(auszeichnungFuerLehrkraft(lia.id, 'en')).toMatchObject({ titel: null, titelStufe: 1, punkte: 1 })
    await rufe(ach, lia, 'POST', '/s/api/auszeichnungen/wahl', { anzeige: null })
    expect(profilFuer(lia.id, 'en', 60_000).titel).toBe('Traveller')

    // Lehrkraft: Medaillen in der Sprache der Lerngruppe
    expect(auszeichnungFuerLehrkraft(lia.id, 'en')).toMatchObject({ titel: 'Traveller', titelStufe: 1, punkte: 1 })
    expect(auszeichnungFuerLehrkraft(lia.id, 'fr')).toMatchObject({ titel: null, punkte: 0 })

    // Bilder: Platzhalter-SVG, auch für die Lehrkraft; gesperrte Silhouette auf Wunsch
    const bild = await rufe(ach, lk, 'GET', '/s/api/auszeichnungen/bild/m-spiele-1')
    expect(bild.code).toBe(200)
    expect(bild.text.startsWith('<svg')).toBe(true)
    expect((await rufe(ach, lk, 'GET', '/s/api/auszeichnungen/bild/gibts-nicht')).code).toBe(404)
  })

  it('alte Achievements werden einmalig übernommen – nichts geht verloren', async () => {
    const d = achDatenLesen(alt.id)
    d.erreicht = {
      'serie-14': { am: 10, titel: '14 Tage am Stück', text: '', gruppe: 'dranbleiben', medaille: 'silber' },
      'teamziel-10': { am: 20, titel: '10 Team-Ziele', text: '', gruppe: 'zusammen', medaille: 'silber' }
    }
    d.zaehler.teamZiele = 10
    d.zaehler.koopRunden = 12
    achDatenSchreiben(alt.id, d)
    const ach = achievementsRoute()
    const a = await rufe(ach, alt, 'GET', '/s/api/auszeichnungen')
    const en = (a.d.sprachen as { sprache: string; medaillen: { kategorie: string; stufe: number; wert: number }[] }[]).find((s) => s.sprache === 'en')!
    expect(en.medaillen.find((m) => m.kategorie === 'dranbleiben')!.stufe).toBe(2)
    expect(en.medaillen.find((m) => m.kategorie === 'zusammen')).toMatchObject({ stufe: 2, wert: 22 })
    const nach = achDatenLesen(alt.id)
    expect(nach.uebernommen).toBe('en')
    // Ein zweites Mal ändert nichts
    await rufe(ach, alt, 'GET', '/s/api/auszeichnungen')
    expect(achDatenLesen(alt.id).je.en.z).toEqual(nach.je.en.z)
    // Die alten Achievements bleiben
    expect(Object.keys(achDatenLesen(alt.id).erreicht)).toEqual(expect.arrayContaining(['serie-14', 'teamziel-10']))
  })
})
