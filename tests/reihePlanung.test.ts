import { describe, expect, it } from 'vitest'
import { artVon, leererInhalt, standardErfolg, type Reihe, type Schritt, type SchrittArt } from '@shared/reihe'
import {
  ausPlanung,
  fuerDigital,
  kennungenAufloesen,
  minutenAnpassen,
  minutenLage,
  nichtAmGeraet,
  phasenSumme,
  phasenVorlage,
  phaseVerschieben,
  planungAusKi,
  schritteAlsPhasen,
  wechselHinweis,
  wechsleArt,
  zuPlanung
} from '../src/renderer/src/modules/unterrichtsreihe/reihePlanung'
import { stundeEntfernen, stundeVerschieben } from '../src/renderer/src/modules/unterrichtsreihe/stundenRaster'
import { kiArtenFuer } from '../src/renderer/src/modules/unterrichtsreihe/reihePlanungKi'
import { verlaufAnfrageFuer } from '../src/renderer/src/modules/unterrichtsreihe/verlaufAuftrag'
import { planungHtml, planungsMaterial } from '../src/renderer/src/modules/unterrichtsreihe/planungDruck'

const schritt = (id: string, o: Partial<Schritt> = {}, art: SchrittArt = 'aufgabe'): Schritt => ({
  id,
  titel: `Schritt ${id}`,
  lernziele: [],
  rolle: 'pflicht',
  erfolg: standardErfolg(art),
  inhalt: leererInhalt(art),
  ...o
})

const reihe = (o: Partial<Reihe> = {}): Reihe => ({
  id: 'r1',
  titel: 'Julikrise',
  fachId: 'geschichte',
  fachLabel: 'Geschichte',
  stateId: 'NI',
  schoolTypeId: 'gymnasium',
  grade: 9,
  oberthema: 'Erster Weltkrieg',
  lernziele: [{ text: 'Ursachen erklären', ichKann: 'Ich kann Ursachen erklären.' }],
  schritte: [],
  stunden: ['einzel', 'doppel'],
  ...o
})

const phase = (id: string, minuten: number, o: Record<string, unknown> = {}) => ({ id, phase: 'Erarbeitung', minuten, geschehen: '', sozialform: 'EA', medien: '', ...o })

describe('Reihenart', () => {
  it('Altbestand und Unbekanntes sind gemischt', () => {
    expect(artVon({})).toBe('gemischt')
    expect(artVon({ art: 'digital' })).toBe('digital')
    expect(artVon({ art: 'quatsch' as never })).toBe('gemischt')
  })
  it('KI-Planung ohne „Im Unterricht" nur in digitalen Reihen', () => {
    expect(kiArtenFuer({ art: 'digital' })).not.toContain('praesenz')
    expect(kiArtenFuer({ art: 'gemischt' })).toContain('praesenz')
    expect(kiArtenFuer({})).toContain('praesenz')
  })
  it('„nicht am Gerät" nur für Präsenzschritte digitaler Reihen', () => {
    const p = schritt('p', {}, 'praesenz')
    expect(nichtAmGeraet({ art: 'digital' }, p)).toBe(true)
    expect(nichtAmGeraet({ art: 'gemischt' }, p)).toBe(false)
    expect(nichtAmGeraet({ art: 'digital' }, schritt('a'))).toBe(false)
  })
  it('fuerDigital macht aus „Im Unterricht" einen Platzhalter „bitte ersetzen"', () => {
    const [x, y] = fuerDigital([schritt('p', { platzhalter: { beschreibung: 'Gruppenarbeit' } }, 'praesenz'), schritt('a')])
    expect(x.inhalt.art).toBe('aufgabe')
    expect(x.ersetzen).toBe(true)
    expect(x.platzhalter?.beschreibung).toBe('Gruppenarbeit')
    expect(y.ersetzen).toBeUndefined()
  })
})

describe('Minuten des Stundenverlaufs', () => {
  it('Summe gegen die Länge der Stunde', () => {
    const r = reihe({ verlauf: { '0': { phasen: [phase('a', 10), phase('b', 40)] }, '1': { phasen: [phase('c', 30)] } } })
    expect(minutenLage(r, 0)).toEqual({ summe: 50, laenge: 45, ueber: true, unter: false })
    expect(minutenLage(r, 1)).toEqual({ summe: 30, laenge: 90, ueber: false, unter: true })
    // Ohne Phasen ist nichts „zu wenig"
    expect(minutenLage(reihe(), 0)).toEqual({ summe: 0, laenge: 45, ueber: false, unter: false })
  })
  it('Angleichen bringt die Summe genau auf die Stunde', () => {
    const p = minutenAnpassen({ phasen: [phase('a', 10), phase('b', 40), phase('c', 20)] }, 45)
    expect(phasenSumme(p)).toBe(45)
    expect(p.phasen.every((x) => x.minuten >= 1)).toBe(true)
    expect(p.phasen.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })
  it('Vorlage Einstieg – Erarbeitung – Sicherung füllt die Stunde', () => {
    const v = phasenVorlage(90)
    expect(v.map((x) => x.phase)).toEqual(['Einstieg', 'Erarbeitung', 'Sicherung'])
    expect(phasenSumme({ phasen: v })).toBe(90)
  })
  it('Phasen verschieben', () => {
    const p = { phasen: [phase('a', 1), phase('b', 2)] }
    expect(phaseVerschieben(p, 0, 1).phasen.map((x) => x.id)).toEqual(['b', 'a'])
    expect(phaseVerschieben(p, 0, -1)).toBe(p)
  })
  it('Verläufe wandern mit ihren Stunden', () => {
    const r = reihe({ stunden: ['einzel', 'doppel', 'einzel'], verlauf: { '0': { phasen: [phase('a', 1)] }, '2': { phasen: [phase('c', 1)] } } })
    expect(Object.keys(stundeVerschieben(r, 0, 2).verlauf ?? {}).sort()).toEqual(['1', '2'])
    expect(stundeVerschieben(r, 0, 2).verlauf?.['2']?.phasen[0].id).toBe('a')
    const weg = stundeEntfernen(r, 0)
    expect(weg.verlauf).toEqual({ '1': { phasen: [phase('c', 1)] } })
    // Reihen ohne Verlauf bekommen keinen
    expect('verlauf' in stundeEntfernen(reihe(), 0)).toBe(false)
  })
})

describe('Wechsel mit Umwandlung', () => {
  const lernpfad = (): Reihe =>
    reihe({
      art: 'gemischt',
      teile: ['Einstieg'],
      schritte: [
        schritt('d', { stunde: 0, minuten: 10, abschnitt: 'Einstieg' }, 'diagnose'),
        schritt('p', { stunde: 0, minuten: 20, titel: 'Gruppengespräch', inhalt: { art: 'praesenz', anweisung: 'Ursachen sammeln' }, abschnitt: 'Einstieg' }),
        schritt('f', { stunde: 0, rolle: 'foerder', abschnitt: 'Einstieg' }),
        schritt('b', { stunde: 1, minuten: 40 }, 'arbeitsblatt'),
        schritt('o', {})
      ]
    })

  it('Lernpfad → Planung: Schritte werden Phasen, Präsenz geht ganz auf, Material bleibt', () => {
    const p = zuPlanung(lernpfad())
    expect(p.art).toBe('planung')
    expect(p.verlauf?.['0'].phasen.map((x) => x.phase)).toEqual(['Einstieg', 'Erarbeitung'])
    expect(p.verlauf?.['0'].phasen[0].schritte).toEqual(['d', 'f'])
    expect(p.verlauf?.['0'].phasen[1].schritte).toBeUndefined()
    expect(p.verlauf?.['0'].phasen[1].geschehen).toContain('Ursachen sammeln')
    expect(p.verlauf?.['0'].phasen[1].sozialform).toBe('UG')
    expect(p.verlauf?.['1'].phasen[0]).toMatchObject({ minuten: 40, schritte: ['b'] })
    expect(p.schritte.map((s) => s.id)).toEqual(['d', 'f', 'b', 'o'])
  })

  it('Planung → digital: Phasen mit Material werden Schritte, übrige Platzhalter „bitte ersetzen", Hausaufgabe dazu', () => {
    const p = zuPlanung(lernpfad())
    p.verlauf!['1'] = { ...p.verlauf!['1'], hausaufgabe: 'Quelle M3 lesen', phasen: [...p.verlauf!['1'].phasen, phase('s', 20, { phase: 'Sicherung', geschehen: 'Tafelbild · Vergleich' })] }
    const d = ausPlanung(p, 'digital')
    expect(d.art).toBe('digital')
    expect(d.verlauf).toBeUndefined()
    const ids = d.schritte.map((s) => s.id)
    expect(ids.slice(0, 2)).toEqual(['d', 'f'])
    const ersatz = d.schritte.filter((s) => s.ersetzen)
    expect(ersatz).toHaveLength(2)
    expect(ersatz.every((s) => s.inhalt.art === 'aufgabe' && s.platzhalter)).toBe(true)
    expect(ersatz[1]).toMatchObject({ stunde: 1, minuten: 20, titel: 'Sicherung – Tafelbild' })
    const ha = d.schritte.find((s) => s.titel === 'Hausaufgabe')
    expect(ha?.platzhalter?.beschreibung).toContain('Quelle M3 lesen')
    expect(ha?.ersetzen).toBeUndefined()
    // Material ohne Stunde bleibt am Ende
    expect(ids[ids.length - 1]).toBe('o')
    // Neue Schritte erben den Teil des Vorgängers
    expect(ersatz[0].abschnitt).toBe('Einstieg')
    expect(d.schritte.some((s) => nichtAmGeraet(d, s))).toBe(false)
  })

  it('Planung → gemischt: Phasen ohne Material werden „Im Unterricht" mit dem Geschehen', () => {
    const g = ausPlanung(zuPlanung(lernpfad()), 'gemischt')
    const pr = g.schritte.find((s) => s.inhalt.art === 'praesenz')
    expect(pr?.inhalt).toMatchObject({ art: 'praesenz' })
    expect(pr && pr.inhalt.art === 'praesenz' && pr.inhalt.anweisung).toContain('Ursachen sammeln')
    expect(pr?.ersetzen).toBeUndefined()
    expect(pr?.stunde).toBe(0)
  })

  it('gemischt ↔ digital baut nichts um', () => {
    const r = lernpfad()
    const d = wechsleArt(r, 'digital')
    expect(d.schritte).toBe(r.schritte)
    expect(d.art).toBe('digital')
    expect(wechsleArt(d, 'digital')).toBe(d)
  })

  it('Rückfrage erklärt den Wechsel', () => {
    const r = lernpfad()
    expect(wechselHinweis(r, 'planung').join(' ')).toMatch(/4 Schritte werden zu Phasen.*1 Schritt „Im Unterricht“ geht.*1 Schritt ohne Stunde/)
    expect(wechselHinweis(r, 'digital')[0]).toContain('1 Schritt „Im Unterricht“ geht nicht am Gerät')
    const p = zuPlanung(r)
    expect(wechselHinweis(p, 'digital').join(' ')).toMatch(/2 Phasen mit Material.*1 Phase ohne Material wird ein Platzhalter.*bitte ersetzen/)
  })

  it('neue Schritte aus einem KI-Plan landen als Phasen in vorhandenen Verläufen', () => {
    const r = reihe({ verlauf: { '0': { phasen: [phase('x', 5)] } } })
    const { verlauf, aufgegangen } = schritteAlsPhasen(r, [schritt('n', { stunde: 0, minuten: 15 }), schritt('q', { stunde: 5 }), schritt('u', { stunde: 1 }, 'praesenz')])
    expect(verlauf['0'].phasen.map((x) => x.id)[0]).toBe('x')
    expect(verlauf['0'].phasen).toHaveLength(2)
    expect(verlauf['1'].phasen).toHaveLength(1)
    expect(aufgegangen).toEqual(['u'])
    // Original unverändert
    expect(r.verlauf?.['0'].phasen).toHaveLength(1)
  })
})

describe('KI-Verlauf je Stunde', () => {
  it('Verweise [S1] werden Verknüpfungen mit lesbarem Titel', () => {
    const k = kennungenAufloesen('Arbeitsblatt [S2], dann S1 · Seite S. 34', [
      { id: 'a', titel: 'Karte' },
      { id: 'b', titel: 'Quellen' }
    ])
    expect(k.ids).toEqual(['b', 'a'])
    expect(k.text).toBe('Arbeitsblatt „Quellen“, dann „Karte“ · Seite S. 34')
  })
  it('Antwort → Verlauf: Minuten passend, Hausaufgabe im eigenen Feld', () => {
    const p = planungAusKi(
      {
        ziel: 'Die Lernenden erklären die Julikrise.',
        phasen: [
          { phase: 'Einstieg', minuten: 10, geschehen: 'Karikatur', sozialform: 'UG', medien: 'Folie' },
          { phase: 'Erarbeitung', minuten: 30, geschehen: 'Quellen auswerten', sozialform: 'PA', medien: '[S1]' },
          { phase: 'Sicherung', minuten: 10, geschehen: 'Tafelbild', sozialform: 'UG', medien: 'Tafel' },
          { phase: 'Hausaufgabe', minuten: 2, geschehen: 'Zeitleiste ergänzen', sozialform: 'EA', medien: '' }
        ],
        hinweise: 'Differenzieren über Hilfekarten.'
      },
      45,
      [{ id: 's1', titel: 'Quellenblatt' }]
    )
    expect(phasenSumme(p)).toBe(45)
    expect(p.phasen.map((x) => x.phase)).toEqual(['Einstieg', 'Erarbeitung', 'Sicherung'])
    expect(p.hausaufgabe).toBe('Zeitleiste ergänzen')
    expect(p.phasen[1]).toMatchObject({ medien: '„Quellenblatt“', schritte: ['s1'] })
    expect(p.ziel).toContain('Julikrise')
  })
  it('Anfrage nennt Stunde, Material als [S1] und Nachbarstunden', () => {
    const r = reihe({ schritte: [schritt('a', { stunde: 1, titel: 'Quellenblatt' }, 'arbeitsblatt'), schritt('b', { stunde: 0, titel: 'Bildimpuls' })] })
    const q = verlaufAnfrageFuer(r, 1, 'mit Placemat')
    expect(q.user).toContain('Plane den Verlauf der 2. Stunde (90 Minuten)')
    expect(q.user).toContain('[S1] Quellenblatt')
    expect(q.user).toContain('VORIGE STUNDE: Bildimpuls')
    expect(q.user).toContain('letzte Stunde')
    expect(q.user).toContain('mit Placemat')
    expect(q.schemaName).toBe('stundenverlauf')
  })
})

describe('Export Unterrichtsplanung', () => {
  it('je Stunde die Tabelle, Material als M-Nummer, Platzhalter nicht im Anhang', () => {
    const r = reihe({
      art: 'planung',
      schritte: [schritt('a', { stunde: 0, titel: 'Quellenblatt' }), schritt('x', { stunde: 0, titel: 'Offen', platzhalter: { beschreibung: 'später' } })],
      verlauf: { '0': { phasen: [phase('p', 45, { medien: 'Tafel', schritte: ['a', 'x'] })], hausaufgabe: 'Lesen' } }
    })
    const m = planungsMaterial(r)
    expect(m.map((s) => s.id)).toEqual(['a'])
    const html = planungHtml(r, m)
    expect(html).toContain('Stunde 1 · Einzelstunde · 45 Minuten')
    expect(html).toContain('Tafel · M1: Quellenblatt · Offen (noch zu erstellen)')
    expect(html).toContain('<b>Hausaufgabe:</b> Lesen')
    expect(html).toContain('Stunde 2 · Doppelstunde')
    expect(html).toContain('Materialanhang')
  })
})
