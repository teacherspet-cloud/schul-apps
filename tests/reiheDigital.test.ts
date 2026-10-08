import { describe, expect, it } from 'vitest'
import {
  alsBlattSchritt,
  berechneWeg,
  blattZweckFuer,
  einzelStatus,
  inhaltFuerLernende,
  leererInhalt,
  standardErfolg,
  standFuerLernende,
  wirksamerErfolg,
  type Reihe,
  type ReiheArt,
  type Schritt,
  type SchrittArt,
  type SchrittStand
} from '../src/shared/reihe'
import {
  abschlussVorschlagAnfrage,
  abschlussVorschlagAus,
  einschaetzungAus,
  kriterienFuer,
  ohneEigenenNamen,
  reflexionImpulsAnfrage,
  reflexionImpulsAus,
  vorschlagSumme
} from '../src/shared/reiheKiFeedback'

/* Digitale Reihe (08.10.2026, Plan G.2/G.5/E.6): Blätter statt Einzelarten, geschafft nach Ergebnis, KI-Vorschlag und -Impuls */
const schritt = (id: string, art: SchrittArt, mehr: Partial<Schritt> = {}): Schritt => ({
  id,
  titel: id,
  lernziele: [],
  rolle: 'pflicht',
  erfolg: standardErfolg(art),
  inhalt: leererInhalt(art),
  ...mehr
})
const reihe = (art: ReiheArt | undefined, schritte: Schritt[]): Reihe => ({
  id: 'r',
  titel: 'R',
  fachId: 'geschichte',
  fachLabel: 'Geschichte',
  stateId: 'NI',
  schoolTypeId: 'gymnasium',
  grade: 8,
  oberthema: 'X',
  lernziele: [],
  schritte,
  ...(art ? { art } : {})
})
const abschluss = (raster: string[] = ['Inhalt', 'Gestaltung']): Schritt =>
  schritt('p', 'abschluss', { inhalt: { art: 'abschluss', anweisung: 'Gestalte ein Plakat.', raster } })

describe('Welche Schritte als Arbeitsblatt entstehen', () => {
  it('digital: Zwischenaufgabe, Abschluss, Reflexion – mit erkannter Einführung', () => {
    const r = reihe('digital', [])
    expect(blattZweckFuer(r, schritt('a', 'aufgabe'))).toBe('aufgabe')
    expect(blattZweckFuer(r, schritt('a', 'aufgabe', { titel: 'Einführung: Die Julikrise' }))).toBe('einfuehrung')
    expect(blattZweckFuer(r, schritt('a', 'aufgabe', { platzhalter: { beschreibung: 'Begriffe erklären und anwenden' } }))).toBe('einfuehrung')
    expect(blattZweckFuer(r, abschluss())).toBe('abschluss')
    expect(blattZweckFuer(r, schritt('f', 'reflexion'))).toBe('reflexion')
  })
  it('Lernkarten, Diagnose, Vokabeln, Test, Hefter bleiben eigene Arten', () => {
    const r = reihe('digital', [])
    for (const art of ['lernkarten', 'diagnose', 'vokabeln', 'onlinetest', 'hefter', 'sprechen'] as SchrittArt[])
      expect(blattZweckFuer(r, schritt('x', art))).toBeNull()
  })
  it('gemischt nur auf Wunsch, Planung nie', () => {
    expect(blattZweckFuer(reihe(undefined, []), schritt('a', 'aufgabe'))).toBeNull()
    expect(blattZweckFuer(reihe('gemischt', []), schritt('a', 'aufgabe', { kiVorgabe: { alsBlatt: true } }))).toBe('aufgabe')
    expect(blattZweckFuer(reihe('planung', []), schritt('a', 'aufgabe', { kiVorgabe: { alsBlatt: true } }))).toBeNull()
  })
})

describe('Umwandlung in einen Blatt-Schritt', () => {
  const blatt = { quelle: 'b1', titel: 'Blatt', html: '<div class="ws-page"></div>', aufgaben: [{ nr: 1, anweisung: 'A', erwartung: 'E' }] }
  it('Abschluss behält das Raster; digital KI-Erfolg, gemischt bestätigt die Lehrkraft', () => {
    const d = alsBlattSchritt(abschluss().inhalt, 'abschluss', blatt, 'digital')
    expect(d.inhalt).toMatchObject({ art: 'arbeitsblatt', quelle: 'b1', zweck: 'abschluss', raster: ['Inhalt', 'Gestaltung'], runden: 2 })
    expect(d.erfolg).toEqual({ art: 'ki', schwelle: 'teilweise' })
    expect(alsBlattSchritt(abschluss().inhalt, 'abschluss', blatt, 'gemischt').erfolg).toEqual({ art: 'lehrkraft' })
  })
  it('Reflexion behält die Tagebuchfrage und wird nie bewertet', () => {
    const d = alsBlattSchritt({ art: 'reflexion', frage: 'Was war schwer?' }, 'reflexion', blatt, 'digital')
    expect(d.inhalt.frage).toBe('Was war schwer?')
    expect(d.erfolg).toEqual({ art: 'abgabe' })
    // Lernende sehen Rolle und Frage, aber keine Erwartungen
    const sicht = inhaltFuerLernende(d.inhalt)
    expect(sicht).toMatchObject({ zweck: 'reflexion', frage: 'Was war schwer?' })
    expect(JSON.stringify(sicht)).not.toContain('"erwartung"')
  })
})

describe('Geschafft nach Ergebnis (digital)', () => {
  const st = (mehr: Partial<SchrittStand>): SchrittStand => ({ eingereicht: 1, antworten: { '0': 'Text' }, ...mehr })
  const vorschlag = (e: 'sicher' | 'teilweise' | 'noch nicht', fehler?: string): SchrittStand['kiVorschlag'] => ({
    kriterien: fehler ? [] : [{ kriterium: 'Inhalt', punkte: 2, max: 3, einschaetzung: e, begruendung: '' }],
    zeit: 1,
    ...(fehler ? { fehler } : {})
  })
  it('Standarderfolg digital: Abschluss und Zwischenaufgabe per KI, Sprechen per Abgabe', () => {
    expect(standardErfolg('abschluss', 'digital')).toEqual({ art: 'ki', schwelle: 'teilweise' })
    expect(standardErfolg('aufgabe', 'digital')).toEqual({ art: 'ki', schwelle: 'teilweise' })
    expect(standardErfolg('sprechen', 'digital')).toEqual({ art: 'abgabe' })
    expect(standardErfolg('abschluss')).toEqual({ art: 'lehrkraft' })
  })
  it('„Lehrkraft bestätigt" gilt digital als KI-Einschätzung bzw. Abgabe', () => {
    expect(wirksamerErfolg(abschluss(), 'digital')).toEqual({ art: 'ki', schwelle: 'teilweise' })
    expect(wirksamerErfolg(schritt('s', 'sprechen'), 'digital')).toEqual({ art: 'abgabe' })
    expect(wirksamerErfolg(abschluss(), 'gemischt')).toEqual({ art: 'lehrkraft' })
  })
  it('Abschluss: digital geschafft nach KI-Vorschlag, gemischt wartet wie bisher auf die Lehrkraft', () => {
    const s = abschluss()
    expect(einzelStatus(s, st({ kiVorschlag: vorschlag('teilweise') }), undefined, 'digital')).toEqual({ status: 'geschafft' })
    expect(einzelStatus(s, st({ kiVorschlag: vorschlag('teilweise') }), undefined, 'gemischt')).toEqual({ status: 'eingereicht', wartet: true })
    // noch nicht → überarbeiten (zweite Runde), danach nicht geschafft
    expect(einzelStatus(s, st({ kiVorschlag: vorschlag('noch nicht') }), undefined, 'digital').status).toBe('offen')
    expect(einzelStatus(s, st({ eingereicht: 2, kiVorschlag: vorschlag('noch nicht') }), undefined, 'digital').status).toBe('nicht_geschafft')
    // Prüfung läuft noch / KI gescheitert
    expect(einzelStatus(s, st({}), undefined, 'digital')).toEqual({ status: 'eingereicht' })
    expect(einzelStatus(s, st({ kiVorschlag: vorschlag('sicher', 'kein Zugang') }), undefined, 'digital')).toEqual({ status: 'eingereicht', wartet: true })
    // Die Lehrkraft kann immer eingreifen
    expect(einzelStatus(s, st({ kiVorschlag: vorschlag('sicher'), bewertung: { text: '', geschafft: false, zeit: 1 } }), undefined, 'digital').status).toBe(
      'nicht_geschafft'
    )
  })
  it('Sprechaufgabe digital geschafft mit der Abgabe; gemischt wartet', () => {
    const s = schritt('s', 'sprechen')
    expect(einzelStatus(s, st({}), undefined, 'digital')).toEqual({ status: 'geschafft' })
    expect(einzelStatus(s, st({}), undefined, 'gemischt').wartet).toBe(true)
  })
  it('Arbeitsblatt als Selbsteinschätzung: Blatt eingereicht oder Ampel abgegeben genügt', () => {
    const { inhalt, erfolg } = alsBlattSchritt({ art: 'reflexion', frage: 'F' }, 'reflexion', {}, 'digital')
    const s = schritt('f', 'arbeitsblatt', { inhalt, erfolg })
    expect(einzelStatus(s, undefined, { eingereicht: 0, runden: 2 }, 'digital').status).toBe('offen')
    expect(einzelStatus(s, { eingereicht: 1 }, { eingereicht: 0, runden: 2 }, 'digital').status).toBe('geschafft')
    expect(einzelStatus(s, undefined, { eingereicht: 1, runden: 2 }, 'digital').status).toBe('geschafft')
  })
  it('berechneWeg nimmt die Art der Reihe: der nächste Schritt öffnet sich ohne Lehrkraft', () => {
    const r = reihe('digital', [abschluss(), schritt('b', 'aufgabe')])
    const stand = { schritte: { p: st({ kiVorschlag: vorschlag('sicher') }) } }
    expect(berechneWeg(r, stand, {}, []).schritte.map((l) => l.status)).toEqual(['geschafft', 'offen'])
    expect(berechneWeg({ ...r, art: 'gemischt' }, stand, {}, []).schritte.map((l) => l.status)).toEqual(['eingereicht', 'gesperrt'])
  })
  it('Lernende sehen den KI-Vorschlag nie', () => {
    const roh = { schritte: { p: st({ kiVorschlag: vorschlag('sicher'), bewertung: { text: 'gut', geschafft: true, zeit: 1 } }) } }
    const sicht = standFuerLernende(roh)
    expect(sicht.schritte.p.kiVorschlag).toBeUndefined()
    expect(sicht.schritte.p.bewertung?.text).toBe('gut')
    expect(roh.schritte.p.kiVorschlag).toBeDefined()
  })
})

describe('KI-Vorschlag zum Abschlussprodukt und Impuls zum Lerntagebuch', () => {
  const eingabe = {
    titel: 'Plakat',
    anweisung: 'Gestalte ein Plakat.',
    raster: ['Inhalt', 'Gestaltung'],
    lernziele: ['Ursachen erklären'],
    fach: 'Geschichte',
    jahrgang: 8,
    text: 'Mein Plakat',
    bilder: ['data:image/png;base64,AAAA'],
    andereDateien: 1
  }
  it('Anfrage nennt genau die Kriterien, Bilder gehen mit', () => {
    const a = abschlussVorschlagAnfrage(eingabe)
    expect(a.schemaName).toBe('reihe_abschluss_vorschlag')
    expect(a.user).toContain('1. Inhalt\n2. Gestaltung')
    expect(a.images).toHaveLength(1)
    expect(a.user).toContain('1 weitere Datei')
  })
  it('Antwort: Kriterien nach Wortlaut oder Stelle, Punkte begrenzt, Einschätzung selbst berechnet', () => {
    const v = abschlussVorschlagAus(
      {
        kriterien: [
          { kriterium: 'gestaltung', punkte: 7, begruendung: 'bunt' },
          { kriterium: 'irgendwas', punkte: 1.4, begruendung: 'knapp' }
        ],
        gesamt: 'Solide.'
      },
      eingabe,
      5
    )
    expect(v.kriterien.map((k) => [k.kriterium, k.punkte, k.einschaetzung])).toEqual([
      ['Inhalt', 1, 'noch nicht'],
      ['Gestaltung', 3, 'sicher']
    ])
    expect(v.kriterien[1].begruendung).toBe('bunt')
    expect(vorschlagSumme(v)).toEqual({ punkte: 4, max: 6 })
    expect(v).toMatchObject({ gesamt: 'Solide.', zeit: 5 })
  })
  it('ohne Raster: Lernziele, sonst „Auftrag erfüllt"', () => {
    expect(kriterienFuer({ raster: [' '], lernziele: ['A'] })).toEqual(['A'])
    expect(kriterienFuer({ raster: [], lernziele: [] })).toEqual(['Auftrag erfüllt'])
    expect(einschaetzungAus(2, 3)).toBe('teilweise')
    expect(einschaetzungAus(3, 3)).toBe('sicher')
  })
  it('eigener Name wird vor der KI ersetzt', () => {
    expect(ohneEigenenNamen('Ich, Mia Probe, finde: Mias Plakat ist von Mia.', 'Mia Probe')).toBe('Ich, S1 S1, finde: Mias Plakat ist von S1.')
  })
  it('Impuls: ohne Urteil, mit Ampel und Eintrag', () => {
    const a = reflexionImpulsAnfrage({
      frage: 'Was war schwer?',
      tagebuch: 'Die Ursachen waren schwer.',
      ampel: [{ ziel: 'Ich kann Ursachen erklären', farbe: 'rot' }],
      fach: 'Geschichte',
      jahrgang: 8
    })
    expect(a.schemaName).toBe('reihe_reflexion_impuls')
    expect(a.user).toContain('Ich kann Ursachen erklären: noch nicht')
    expect(a.system).toContain('NICHT')
    expect(reflexionImpulsAus({ impuls: '  Was hilft dir? ' })).toBe('Was hilft dir?')
    expect(reflexionImpulsAus(null)).toBe('')
  })
})
