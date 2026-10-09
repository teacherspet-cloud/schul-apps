import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import type { CefrTable, StructuredRequest } from '../src/shared/types'
import {
  niveauAusTabelle,
  niveauBefund,
  niveauFaustregel,
  niveauRegel,
  niveauVorgabe,
  verschoben,
  zielNiveau
} from '../src/renderer/src/modules/lernen/grammatikNiveau'
import { erzeugeGrammatikPaket, erzeugeMehrAufgaben, erzeugungsHinweis } from '../src/renderer/src/modules/lernen/grammatikErzeugen'

/*
 * Schwierigkeit nach Land, Schulform und Jahrgang (09.10.2026, Befund der Lehrkraft: Klasse 10 Gymnasium viel zu leicht).
 * Ohne echte KI: eine Attrappe merkt sich die Anfragen.
 */
const TABELLE = JSON.parse(readFileSync('resources/cefr/levels.json', 'utf8')) as CefrTable
const GYM10 = { fach: 'Englisch', sprache: 'en', jahrgang: 10, land: 'NI', schulform: 'gymnasium' }

describe('Niveau der Lerngruppe', () => {
  it('GER-Tabelle: Gymnasium Niedersachsen Klasse 10 Englisch B1+, Klasse 5 A1, Französisch Klasse 10 B1', () => {
    expect(niveauAusTabelle(TABELLE, GYM10)).toBe('B1+')
    expect(niveauAusTabelle(TABELLE, { ...GYM10, jahrgang: 5 })).toBe('A1')
    expect(niveauAusTabelle(TABELLE, { ...GYM10, fach: 'Französisch', sprache: 'fr' })).toBe('B1')
    expect(niveauAusTabelle(TABELLE, { ...GYM10, schulform: 'hauptschule' })).toBe('A2+')
    expect(niveauAusTabelle(null, GYM10)).toBeNull()
  })
  it('Faustregel ohne Tabelle: Gymnasium vor Realschule vor Hauptschule', () => {
    expect(niveauFaustregel(GYM10)).toBe('B1+')
    expect(niveauFaustregel({ ...GYM10, schulform: 'realschule' })).toBe('B1')
    expect(niveauFaustregel({ ...GYM10, schulform: 'hauptschule' })).toBe('A2+')
    expect(niveauFaustregel({ ...GYM10, jahrgang: 5 })).toBe('A1')
    expect(zielNiveau(GYM10).quelle).toBe('faustregel')
    expect(zielNiveau(GYM10, TABELLE)).toEqual({ ger: 'B1+', quelle: 'tabelle' })
  })
  it('„grundlegend / anspruchsvoll" verschiebt um eine Teilstufe', () => {
    expect(verschoben('B1+', 'anspruchsvoll')).toBe('B2')
    expect(verschoben('B1+', 'grundlegend')).toBe('B1')
    expect(verschoben('B1+', 'mittel')).toBe('B1+')
    expect(verschoben('A1', 'grundlegend')).toBe('A1')
  })
  it('Regel nennt Niveau, Satzlänge, Auswahl-Anteil und Anforderungen', () => {
    const r = niveauRegel(GYM10, 'B1+')
    expect(r).toMatch(/Klasse 10 \(Gymnasium, NI\), erwartetes GER-Niveau B1\+/)
    expect(r).toMatch(/10–20 Wörter/)
    expect(r).toMatch(/höchstens 15 %/)
    expect(r).toMatch(/Transfer/)
    expect(r).toMatch(/ähnliche Formen/)
    expect(niveauRegel(GYM10, 'B1+', 'anspruchsvoll')).toMatch(/Zielniveau der Aufgaben B2/)
    expect(niveauVorgabe('A1').satz[1]).toBeLessThan(niveauVorgabe('B1+').satz[0])
  })
})

const kurz = (n: number, art = 'auswahl') =>
  Array.from({ length: n }, (_, i) => ({ art, satz: `I ___ a cat ${i}.`, loesungen: ['have'], optionen: ['have', 'has'] }))
const lang = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    art: 'umformen',
    satz: `Although the weather had been terrible all week, the volunteers decided to clean the beach number ${i}.`,
    loesungen: ['x']
  }))

describe('Gegenprobe nach der Erzeugung', () => {
  it('kurze Auswahlsätze sind für B1+ zu leicht, für A1 nicht', () => {
    const b = niveauBefund(kurz(20), 'B1+')
    expect(b.zuLeicht).toBe(true)
    expect(b.hinweis).toMatch(/zu leicht/)
    expect(niveauBefund(kurz(4).concat(kurz(16, 'luecke')), 'A1').zuLeicht).toBe(false)
  })
  it('lange Umformungen passen zu B1+', () => {
    expect(niveauBefund(lang(20), 'B1+').zuLeicht).toBe(false)
  })
})

/** KI-Attrappe: merkt sich die Anfragen, liefert einen Pool aus kurzen Auswahlsätzen und lässt die Prüfung alles durch */
function attrappe(aufgaben: unknown[]) {
  const anfragen: StructuredRequest[] = []
  const ai = async <T,>(req: StructuredRequest): Promise<T> => {
    anfragen.push(req)
    if (req.schemaName === 'grammatik_pruefung') return { urteile: [] } as T
    return {
      regeln: [{ id: 'r1', titel: 'Passiv', erklaerung: 'Passiv mit be + Partizip.', beispiele: ['The car is washed.'] }],
      aufgaben
    } as T
  }
  return { ai, anfragen }
}

describe('Auftrag an die KI', () => {
  it('Pool für Klasse 10 Gymnasium: Niveau-Regel, Mischung mit wenig Auswahl, Prüfung kennt das Niveau', async () => {
    const { ai, anfragen } = attrappe(kurz(20).map((x) => ({ ...x, regelId: 'r1', anweisung: 'Wähle.' })))
    const p = await erzeugeGrammatikPaket({ thema: 'Passive', ...GYM10, bekannt: ['en.verb.passive_basic', 'en.verb.past_simple', 'en.verb.present_perfect', 'en.verb.will_future', 'en.verb.going_to', 'en.verb.past_perfect', 'en.cond.type2'] }, ai)
    const pool = anfragen.find((r) => r.schemaName === 'grammatik_pool')!
    expect(pool.system).toMatch(/NIVEAU – VERBINDLICH: Lerngruppe Klasse 10 \(Gymnasium, NI\), erwartetes GER-Niveau B1\+/)
    expect(pool.system).toMatch(/4 Auswahl, 14 Umformen/)
    expect(pool.system).not.toMatch(/12 Lücke, 8 Auswahl/)
    expect(anfragen.find((r) => r.schemaName === 'grammatik_pruefung')!.system).toMatch(/GER-Niveau B1\+ trivial/)
    // Die Attrappe lieferte nur kurze Auswahlsätze: die Abschlussmeldung sagt es
    expect(erzeugungsHinweis(p)).toMatch(/Niveau: wirkt für B1\+ zu leicht/)
  })
  it('Klasse 5 Hauptschule: niedrigeres Niveau, kurze Sätze', async () => {
    const { ai, anfragen } = attrappe([])
    await erzeugeGrammatikPaket({ thema: 'Plural', fach: 'Englisch', sprache: 'en', jahrgang: 5, land: 'NI', schulform: 'hauptschule' }, ai)
    expect(anfragen[0].system).toMatch(/GER-Niveau A1\b/)
    expect(anfragen[0].system).toMatch(/4–9 Wörter/)
  })
  it('„+ Aufgaben": Schwierigkeit relativ zum Niveau der Lerngruppe', async () => {
    const { ai, anfragen } = attrappe([])
    await erzeugeMehrAufgaben(
      {
        thema: 'Passive',
        ...GYM10,
        anzahl: 6,
        arten: [],
        schwierigkeit: 'anspruchsvoll',
        regeln: [{ id: 'r1', titel: 'Passiv', erklaerung: 'be + Partizip', beispiele: [] }],
        vorhanden: [],
        bekannt: ['en.verb.passive_basic']
      },
      ai
    )
    const mehr = anfragen.find((r) => r.schemaName === 'grammatik_mehr')!
    expect(mehr.system).toMatch(/relativ zum Niveau der Lerngruppe/)
    expect(mehr.system).toMatch(/Zielniveau der Aufgaben B2/)
  })
  it('Förderaufgaben eine Teilstufe darunter', async () => {
    const { ai, anfragen } = attrappe([])
    await erzeugeGrammatikPaket(
      { thema: 'Passive', ...GYM10, extra: { art: 'foerder', regeln: [{ titel: 'Passiv', erklaerung: 'be + Partizip', beispiele: [] }], fehler: [], bekannt: ['en.verb.passive_basic'] } },
      ai
    )
    expect(anfragen[0].system).toMatch(/Zielniveau der Aufgaben B1\b/)
  })
})
