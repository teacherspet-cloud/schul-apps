import { describe, expect, it } from 'vitest'
import {
  eigenesKuerzel,
  gleicherKurs,
  gruppeErkennen,
  gruppenErkennen,
  klasseAusGruppen,
  kursgruppenPlanen,
  kursName,
  kursNachfolgeRegeln,
  kuerzelPasstZuName,
  mitgliederAnteil,
  nameHochstufen,
  ordnerFuerKurs,
  unterrichtet,
  type GruppeErkannt
} from '../src/shared/iservKurse'
import { nachfolgerFinden } from '../src/shared/schuljahrWechsel'
import { fachAusName } from '../src/shared/faecher'

/*
 * Klassen und Kurse aus IServ-Gruppennamen (10.10.2026): Sek-I-Kurse quer zu den Klassen (Werte und Normen, Religion,
 * Französisch, Spanisch), Sek-II-Kurse „EN 13 eA Kon", Klassen, unbekannte Namen.
 */

const kurs = (name: string, id?: string): GruppeErkannt => {
  const p = gruppeErkennen(name, id)
  expect(p, name).not.toBeNull()
  expect(p!.art, name).toBe('kurs')
  return p!
}

describe('Kurse erkennen', () => {
  it('Sek II: Fach + Jahrgang + Niveau + Kürzel', () => {
    const p = kurs('EN 13 eA Kon')
    expect(p).toMatchObject({ fachId: 'englisch', jahrgang: 13, niveau: 'eA', kuerzel: 'Kon' })
    expect(p.klassen).toBeUndefined()
    expect(p.sicherheit).toBeGreaterThanOrEqual(0.9)
    expect(kurs('DE 12 gA Abc')).toMatchObject({ fachId: 'deutsch', jahrgang: 12, niveau: 'gA', kuerzel: 'Abc' })
    expect(kurs('ma 11 ea mül')).toMatchObject({ fachId: 'mathematik', jahrgang: 11, niveau: 'eA', kuerzel: 'mül' })
    expect(kurs('EN-13-gA-Kon')).toMatchObject({ fachId: 'englisch', jahrgang: 13, niveau: 'gA', kuerzel: 'Kon' })
    expect(kurs('en13ea')).toMatchObject({ fachId: 'englisch', jahrgang: 13, niveau: 'eA' })
    expect(kurs('Q1 EN eA')).toMatchObject({ fachId: 'englisch', jahrgang: 12, niveau: 'eA' })
    expect(kurs('EN Q2 LK Kon')).toMatchObject({ fachId: 'englisch', jahrgang: 13, niveau: 'eA', kuerzel: 'Kon' })
    expect(kurs('BI 12 GK')).toMatchObject({ fachId: 'biologie', niveau: 'gA' })
    expect(kurs('PW 12 gA Kon')).toMatchObject({ fachId: 'politik', fach: 'Politik-Wirtschaft' })
    expect(kurs('SP 12 Kon')).toMatchObject({ fachId: 'sport' })
    // Kürzel, das wie ein Fach aussieht: hinter dem Jahrgang ist es das Kürzel
    expect(kurs('EN 13 eA Ma')).toMatchObject({ fachId: 'englisch', kuerzel: 'Ma' })
  })

  it('Sek I: Kurse quer zu den Klassen', () => {
    expect(kurs('FR 7 Kon')).toMatchObject({ fachId: 'franzoesisch', jahrgang: 7, kuerzel: 'Kon' })
    expect(kurs('RE 7 Kon')).toMatchObject({ fachId: 'religion', fach: 'Religion', jahrgang: 7 })
    expect(kurs('WN 7 Abc')).toMatchObject({ fachId: 'werte-und-normen', jahrgang: 7, kuerzel: 'Abc' })
    expect(kurs('SN 7 Xyz')).toMatchObject({ fachId: 'spanisch', jahrgang: 7, kuerzel: 'Xyz' })
    expect(kurs('SP 7 Xyz')).toMatchObject({ fachId: 'spanisch', jahrgang: 7 })
    expect(kurs('Spa 8')).toMatchObject({ fachId: 'spanisch', jahrgang: 8 })
    expect(kurs('ES 9 Kon')).toMatchObject({ fachId: 'spanisch' })
    expect(kurs('S 6 Kon')).toMatchObject({ fachId: 'spanisch' })
    expect(kurs('F 6')).toMatchObject({ fachId: 'franzoesisch' })
    expect(kurs('FRZ 6 Kon')).toMatchObject({ fachId: 'franzoesisch' })
    expect(kurs('Französisch 7')).toMatchObject({ fachId: 'franzoesisch' })
    expect(kurs('Spanisch 7 Kon')).toMatchObject({ fachId: 'spanisch', kuerzel: 'Kon' })
    expect(kurs('Werte und Normen 8')).toMatchObject({ fachId: 'werte-und-normen', jahrgang: 8 })
    expect(kurs('Werte & Normen 8 Abc')).toMatchObject({ fachId: 'werte-und-normen', kuerzel: 'Abc' })
    expect(kurs('WuN 9')).toMatchObject({ fachId: 'werte-und-normen' })
    expect(kurs('W&N 9')).toMatchObject({ fachId: 'werte-und-normen' })
    expect(kurs('ev. Religion 8')).toMatchObject({ fachId: 'religion', fach: 'Evangelische Religion', jahrgang: 8 })
    expect(kurs('katholische Religion 6')).toMatchObject({ fachId: 'religion', fach: 'Katholische Religion', jahrgang: 6 })
    expect(kurs('REV 5 Kon')).toMatchObject({ fach: 'Evangelische Religion' })
    expect(kurs('RK 5 Kon')).toMatchObject({ fach: 'Katholische Religion' })
    expect(kurs('KR 10')).toMatchObject({ fach: 'Katholische Religion' })
    expect(kurs('ER 10')).toMatchObject({ fach: 'Evangelische Religion' })
    for (const n of ['FR 7 Kon', 'RE 7 Kon', 'WN 8', 'ev. Religion 8', 'katholische Religion 6', 'PW 12 gA'])
      expect(fachAusName(kurs(n).fach!)?.id, n).toBe(kurs(n).fachId)
  })

  it('Klassenlisten, Kursnummern, Reihenfolge', () => {
    expect(kurs('Reli 7b/c').klassen).toEqual(['7b', '7c'])
    expect(kurs('Reli 7b/7c').klassen).toEqual(['7b', '7c'])
    expect(kurs('RE 7b+c Kon')).toMatchObject({ klassen: ['7b', '7c'], kuerzel: 'Kon' })
    expect(kurs('RE 7b-7c-7d').klassen).toEqual(['7b', '7c', '7d'])
    expect(kurs('WN 7 b/c').klassen).toEqual(['7b', '7c'])
    expect(kurs('FR 7 2 Kon')).toMatchObject({ nummer: 2, kuerzel: 'Kon' })
    expect(kurs('FR7-2')).toMatchObject({ jahrgang: 7, nummer: 2 })
    expect(kurs('7 FR Kon')).toMatchObject({ fachId: 'franzoesisch', jahrgang: 7, kuerzel: 'Kon' })
    expect(kurs('7b Englisch')).toMatchObject({ fachId: 'englisch', klassen: ['7b'] })
    expect(kurs('Französisch Jahrgang 7')).toMatchObject({ jahrgang: 7 })
  })

  it('Vorsilben, Kennungen, Schuljahre, Groß/klein', () => {
    expect(kurs('kurs-fr-7-kon')).toMatchObject({ fachId: 'franzoesisch', jahrgang: 7, kuerzel: 'kon' })
    expect(kurs('fach-wn-8')).toMatchObject({ fachId: 'werte-und-normen', jahrgang: 8 })
    expect(kurs('k-sn-9-xyz')).toMatchObject({ fachId: 'spanisch', jahrgang: 9 })
    expect(kurs('kurs.en.13.ea.kon')).toMatchObject({ fachId: 'englisch', niveau: 'eA', kuerzel: 'kon' })
    expect(kurs('FR 7 Kon 2026/27')).toMatchObject({ jahrgang: 7, kuerzel: 'Kon' })
    expect(kurs('FR 7 Kon (SJ 26/27)')).toMatchObject({ jahrgang: 7, kuerzel: 'Kon' })
    expect(kurs('fr 7 KON').kuerzel).toBe('KON')
    expect(kurs('Französisch-Kurs 7')).toMatchObject({ fachId: 'franzoesisch' })
    // Rückfall auf die Kennung, wenn der Name nichts ergibt
    expect(gruppeErkennen('Mein Kurs', 'kurs-fr-7-kon')).toMatchObject({ art: 'kurs', fachId: 'franzoesisch', roh: 'Mein Kurs' })
  })

  it('Klassen', () => {
    for (const n of ['7b', 'Klasse 7b', 'klasse.7b', 'klasse-10a', 'Kl. 5c', '10 a'])
      expect(gruppeErkennen(n), n).toMatchObject({ art: 'klasse', klassen: [expect.stringMatching(/^\d+[a-z]$/)] })
    expect(gruppeErkennen('Klasse 10b')?.klassen).toEqual(['10b'])
    expect(klasseAusGruppen([{ id: 'fr-7-kon', name: 'FR 7 Kon' }, { id: 'klasse.7b', name: 'Klasse 7b' }])).toBe('7b')
    expect(klasseAusGruppen([{ id: 'klasse:8a', name: '8a' }, { id: 'klasse.7b', name: 'Klasse 7b' }])).toBe('8a')
  })

  it('unbekannte Namen bleiben außen vor', () => {
    for (const n of [
      'Fachschaft Englisch',
      'Englisch',
      'Lehrer',
      'Kollegium',
      'Sport AG 7',
      'EN 7 AG',
      'Elternvertreter 7b',
      'Jahrgang 7',
      'Q1',
      '12',
      'Abitur 2027',
      'Schulleitung',
      'Raum 203',
      'Mathe-Wettbewerb 7',
      'FR 7 Kon Material',
      '7b/c',
      'Klasse 4a',
      'FR 14',
      ''
    ])
      expect(gruppeErkennen(n), n).toBeNull()
  })

  it('Anzeigename', () => {
    expect(kursName(kurs('FR 7 Kon'))).toBe('Französisch 7 (Kon)')
    expect(kursName(kurs('EN 13 eA Kon'))).toBe('Englisch 13 eA (Kon)')
    expect(kursName(kurs('Reli 7b/c'))).toBe('Religion 7b/c')
    expect(kursName(kurs('ev. Religion 8'))).toBe('Ev. Religion 8')
    expect(kursName(kurs('FR 7 2 Kon'))).toBe('Französisch 7 Kurs 2 (Kon)')
    // Kurs einer einzelnen Klasse wird ein Fach der Klasse
    expect(kursName(kurs('EN 7b Kon'))).toBe('7b')
  })
})

describe('Kürzel der Lehrkraft', () => {
  const gruppen = ['FR 7 Kon', 'RE 7 Kon', 'EN 13 eA Kon', 'WN 8 Abc'].map((n) => kurs(n))
  it('aus den eigenen Kursen, aus dem Namen oder eingestellt', () => {
    expect(eigenesKuerzel(gruppen)).toBe('Kon')
    expect(eigenesKuerzel([kurs('FR 7 Kon'), kurs('WN 8 Abc')], 't.kornahrens')).toBe('Kon')
    expect(eigenesKuerzel([kurs('FR 7 Kon'), kurs('WN 8 Abc')], 'x.yz')).toBeNull()
    expect(eigenesKuerzel(gruppen, 't.kornahrens', 'Krn')).toBe('Krn')
    expect(kuerzelPasstZuName('Kon', 'Kornahrens')).toBe(true)
    expect(kuerzelPasstZuName('Abc', 'Kornahrens')).toBe(false)
  })
  it('Kurse mit fremdem Kürzel unterrichtet sie nicht; ohne Kürzel genügt die Mitgliedschaft', () => {
    expect(unterrichtet(kurs('FR 7 Kon'), 'Kon')).toBe(true)
    expect(unterrichtet(kurs('FR 7 kon'), 'Kon')).toBe(true)
    expect(unterrichtet(kurs('WN 8 Abc'), 'Kon')).toBe(false)
    expect(unterrichtet(kurs('Reli 7b/c'), 'Kon')).toBe(true)
    expect(unterrichtet(kurs('WN 8 Abc'), null)).toBe(true)
  })
})

describe('Lerngruppen planen', () => {
  const lehrkraft = {
    benutzer: 't.kornahrens',
    gruppen: [
      { id: 'klasse.7b', name: 'Klasse 7b' },
      { id: 'fr-7-kon', name: 'FR 7 Kon' },
      { id: 're-7-kon', name: 'RE 7 Kon' },
      { id: 'en-13-ea-kon', name: 'EN 13 eA Kon' },
      { id: 'wn-8-abc', name: 'WN 8 Abc' },
      { id: 'fachschaft-en', name: 'Fachschaft Englisch' }
    ]
  }
  const mitglieder: Record<string, string[]> = {
    'fr-7-kon': ['a', 'b', 'c', 'd', 'e'],
    're-7-kon': ['f', 'g', 'h'],
    'en-13-ea-kon': ['x', 'y']
  }
  it('legt nur die eigenen Kurse an', () => {
    const plan = kursgruppenPlanen({ lehrkraft, mitglieder: (id) => mitglieder[id] ?? [], vorhanden: [], bekannt: [] })
    expect(plan.kuerzel).toBe('Kon')
    expect(plan.anlegen.map((a) => [a.iservId, a.name, a.fach])).toEqual([
      ['fr-7-kon', 'Französisch 7 (Kon)', 'Französisch'],
      ['re-7-kon', 'Religion 7 (Kon)', 'Religion'],
      ['en-13-ea-kon', 'Englisch 13 eA (Kon)', 'Englisch']
    ])
  })
  it('verknüpft statt doppelt: gleiche IServ-Gruppe, gleicher Name, ≥ 80 % gleiche Lernende', () => {
    const plan = kursgruppenPlanen({
      lehrkraft,
      mitglieder: (id) => mitglieder[id] ?? [],
      vorhanden: [
        { id: 'g1', name: 'Mein FR-Kurs', fach: 'Französisch', iserv_gruppe: '', mitglieder: ['a', 'b', 'c', 'd', 'e', 'z'] },
        { id: 'g2', name: 'Religion 7 (Kon)', fach: 'Religion', iserv_gruppe: '', mitglieder: [] },
        { id: 'g3', name: 'Q2 Englisch', fach: 'Englisch', iserv_gruppe: 'en-13-ea-kon', mitglieder: [] }
      ],
      bekannt: []
    })
    expect(plan.anlegen).toEqual([])
    expect(plan.verknuepfen.map((v) => [v.iservId, v.lerngruppeId, v.grund])).toEqual([
      ['fr-7-kon', 'g1', 'mitglieder'],
      ['re-7-kon', 'g2', 'name'],
      ['en-13-ea-kon', 'g3', 'iserv']
    ])
  })
  it('zu wenig gemeinsame Lernende oder anderes Fach: neu anlegen; Bekanntes (auch ausgeblendet) nie wieder', () => {
    const plan = kursgruppenPlanen({
      lehrkraft,
      mitglieder: (id) => mitglieder[id] ?? [],
      vorhanden: [
        { id: 'g1', name: '7b', fach: 'Französisch', iserv_gruppe: 'klasse.7b', mitglieder: ['a', 'b', 'p', 'q', 'r', 's', 't'] },
        { id: 'g2', name: 'Religion 7 (Kon)', fach: 'Englisch', iserv_gruppe: '', mitglieder: [] }
      ],
      bekannt: [{ iservId: 'en-13-ea-kon', lerngruppeId: 'weg', verborgen: true }]
    })
    expect(plan.anlegen.map((a) => a.iservId)).toEqual(['fr-7-kon', 're-7-kon'])
    expect(plan.verknuepfen).toEqual([])
  })
  it('Anteil gemeinsamer Lernender', () => {
    expect(mitgliederAnteil(['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd'])).toBeCloseTo(0.8)
    expect(mitgliederAnteil([], ['a'])).toBe(0)
  })
})

describe('IServ-Ordner und neues Schuljahr', () => {
  it('findet den Gruppenordner des Kurses', () => {
    const ordner = ['Klasse 7b', 'FR 7 Kon', 'Fachschaft Englisch', 'en 13 ea kon']
    expect(ordnerFuerKurs(ordner, { roh: 'FR 7 Kon' })).toBe('FR 7 Kon')
    expect(ordnerFuerKurs(ordner, { roh: 'EN 13 eA Kon' })).toBe('en 13 ea kon')
    expect(ordnerFuerKurs(ordner, { roh: 'kurs-fr-7-kon' })).toBe('FR 7 Kon')
    expect(ordnerFuerKurs(ordner, { roh: 'SN 7 Kon' })).toBeNull()
    expect(gleicherKurs(kurs('FR 7 Kon'), kurs('fr-7-KON'))).toBe(true)
    expect(gleicherKurs(kurs('FR 7 Kon'), kurs('FR 8 Kon'))).toBe(false)
  })
  it('Name eine Stufe weiter', () => {
    expect(nameHochstufen('Französisch 7 (Kon)', 7, 8)).toBe('Französisch 8 (Kon)')
    expect(nameHochstufen('Ev. Religion 7b/c', 7, 8)).toBe('Ev. Religion 8b/c')
    expect(nameHochstufen('Englisch 12 eA (Kon)', 12, 13)).toBe('Englisch 13 eA (Kon)')
  })
  it('Nachfolger eines Kurses über die Mitglieder', () => {
    const regeln = kursNachfolgeRegeln('FR 7 Kon')!
    expect(regeln.ziel).toBe(8)
    const personen = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
      id,
      gruppen: id === 'e' ? [{ id: 'fr-8-abc', name: 'FR 8 Abc' }] : [{ id: 'fr-8-kon', name: 'FR 8 Kon' }, { id: 'klasse.8b', name: 'Klasse 8b' }]
    }))
    const f = nachfolgerFinden({ id: 'fr-7-kon', name: 'FR 7 Kon', mitglieder: ['a', 'b', 'c', 'd', 'e'] }, personen, 13, regeln)
    expect(f.art).toBe('neu')
    expect(f.gruppe).toEqual({ id: 'fr-8-kon', name: 'FR 8 Kon' })
    expect(f.wechsler.map((w) => w.id)).toEqual(['e'])
    // Gleiche Kennung, neuer Name (IServ hat umbenannt)
    const um = nachfolgerFinden(
      { id: 'fr-kon', name: 'FR 7 Kon', mitglieder: ['a', 'b'] },
      [
        { id: 'a', gruppen: [{ id: 'fr-kon', name: 'FR 8 Kon' }] },
        { id: 'b', gruppen: [{ id: 'fr-kon', name: 'FR 8 Kon' }] }
      ],
      13,
      regeln
    )
    expect(um).toMatchObject({ art: 'gleich', gruppe: { id: 'fr-kon', name: 'FR 8 Kon' } })
    expect(kursNachfolgeRegeln('Klasse 7b')).toBeNull()
  })
  it('alle Gruppen einer Person', () => {
    const e = gruppenErkennen([
      { id: 'klasse.7b', name: 'Klasse 7b' },
      { id: 'fr-7-kon', name: 'FR 7 Kon' },
      { id: 'wn-7-abc', name: 'WN 7 Abc' },
      { id: 'x', name: 'Schülerzeitung' },
      { id: 'vorschau:1:7b', name: '7b' }
    ])
    expect(e.map((g) => [g.iservId, g.art])).toEqual([
      ['klasse.7b', 'klasse'],
      ['fr-7-kon', 'kurs'],
      ['wn-7-abc', 'kurs']
    ])
  })
})

describe('IServ-Gruppen in verschiedenen Formen (10.10.2026)', () => {
  it('Liste, Zuordnung { act: Name }, verschachtelt', async () => {
    const { gruppenAus, gruppenForm } = await import('../src/server/anmeldung')
    expect(gruppenAus({ 'iserv:groups': ['klasse.7b'] })).toEqual([{ id: 'klasse.7b', name: 'klasse.7b' }])
    expect(gruppenAus({ 'iserv:groups': { 'fr.7.kon': 'FR 7 Kon' } })).toEqual([{ id: 'fr.7.kon', name: 'FR 7 Kon' }])
    expect(gruppenAus({ 'iserv:groups': { groups: [{ act: 'en.13', name: 'EN 13 eA Kon' }] } })).toEqual([{ id: 'en.13', name: 'EN 13 eA Kon' }])
    expect(gruppenAus({ 'iserv:groups': [] })).toEqual([])
    expect(gruppenForm({ 'iserv:groups': [] })).toBe('iserv:groups=Liste(0)')
  })
})
