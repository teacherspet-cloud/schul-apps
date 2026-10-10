import { describe, expect, it } from 'vitest'
import {
  ankuendigungFaellig,
  ankuendigungText,
  kursTerminMitOnlinetests,
  nameMitTermin,
  onlinetestBaldBedarf,
  terminBereinigt,
  terminKurz,
  terminMs,
  terminSichtbar,
  testStatusText,
  type OnlineTermin
} from '../src/shared/onlinetestTermin'
import { testPause } from '../src/shared/sprachstand'
import { demnaechst } from '../src/shared/startseiteKurse'

// Mittwoch, 15.10.2026, 10 Uhr Berliner Zeit
const JETZT = Date.UTC(2026, 9, 15, 8, 0)

describe('Termin eines Onlinetests – Name und Datum', () => {
  it('formatiert den Tag kurz mit Wochentag', () => {
    expect(terminKurz('2026-10-17')).toBe('Sa 17.10.')
    expect(terminKurz('2026-10-16')).toBe('Fr 16.10.')
  })
  it('prüft den Tag', () => {
    expect(terminBereinigt('2026-10-16')).toBe('2026-10-16')
    expect(terminBereinigt('2026-02-30')).toBeNull()
    expect(terminBereinigt('16.10.2026')).toBeNull()
    expect(terminBereinigt('')).toBeNull()
  })
  it('hängt den Termin an, wenn der Name kein Datum hat', () => {
    expect(nameMitTermin('Vokabeltest Unit 3', '2026-10-16')).toBe('Vokabeltest Unit 3 – Fr 16.10.')
  })
  it('ersetzt ein Datum im Namen', () => {
    expect(nameMitTermin('10b 03.10.2026 - Green Line 6 - Unit 1', '2026-10-16')).toBe('10b Fr 16.10. - Green Line 6 - Unit 1')
    expect(nameMitTermin('Vokabeltest Unit 3 – Mo 13.10.', '2026-10-16')).toBe('Vokabeltest Unit 3 – Fr 16.10.')
    expect(nameMitTermin('Test vom 3.10.26', '2026-10-16')).toBe('Test vom Fr 16.10.')
  })
  it('hält „Unit 3.1." nicht für ein Datum und ersetzt nur das erste Datum', () => {
    expect(nameMitTermin('Unit 3.1. Wortschatz', '2026-10-16')).toBe('Unit 3.1. Wortschatz – Fr 16.10.')
    expect(nameMitTermin('7a 01.10.2026 bis 02.10.2026', '2026-10-16')).toBe('7a Fr 16.10. bis 02.10.2026')
  })
  it('lässt den Namen ohne Termin unverändert', () => {
    expect(nameMitTermin('10b 03.10.2026 - Unit 1', null)).toBe('10b 03.10.2026 - Unit 1')
    expect(nameMitTermin('Unit 1', 'kaputt')).toBe('Unit 1')
  })
  it('legt den Zeitpunkt auf 8 Uhr Berliner Zeit', () => {
    expect(new Date(terminMs('2026-10-16')).toISOString()).toBe('2026-10-16T06:00:00.000Z')
    expect(new Date(terminMs('2026-12-01')).toISOString()).toBe('2026-12-01T07:00:00.000Z')
  })
})

describe('Sichtbarkeit und Ankündigung', () => {
  it('zeigt den Termin nur, wenn er gesetzt und nicht ausgeblendet ist', () => {
    expect(terminSichtbar({ termin: '2026-10-16' })).toBe(true)
    expect(terminSichtbar({ termin: '2026-10-16', terminVerborgen: true })).toBe(false)
    expect(terminSichtbar({})).toBe(false)
    expect(terminSichtbar(null)).toBe(false)
  })
  it('kündigt ab 7 Tagen vorher an', () => {
    expect(ankuendigungFaellig('2026-10-22', JETZT)).toBe(true)
    expect(ankuendigungFaellig('2026-10-23', JETZT)).toBe(false)
    expect(ankuendigungFaellig('2026-10-15', JETZT)).toBe(true)
    expect(ankuendigungFaellig('2026-10-14', JETZT)).toBe(false)
  })
  it('formuliert die Ankündigung für Lernende', () => {
    expect(ankuendigungText({ art: 'Vokabeltest', termin: '2026-10-17', thema: 'Green Line 3 - Unit 3' }, JETZT)).toBe(
      'Vokabeltest am Sa 17.10. – jetzt Unit 3 üben'
    )
    expect(ankuendigungText({ art: 'Vokabeltest', termin: '2026-10-16', thema: '' }, JETZT)).toBe('Vokabeltest morgen (Fr 16.10.) – jetzt üben')
    expect(ankuendigungText({ art: 'Lernzielkontrolle', termin: '2026-10-15', thema: 'Potenzen' }, JETZT)).toBe('Lernzielkontrolle heute – bereite dich vor')
  })
  it('zeigt angekündigte Tests in der Liste als „angekündigt"', () => {
    expect(testStatusText({ wartend: true, termin: '2026-10-16', zeitMin: 20 })).toBe(
      'Fr 16.10. · 20 Minuten · angekündigt – startet, wenn deine Lehrkraft ihn freigibt'
    )
    expect(testStatusText({ wartend: false, termin: '2026-10-16', zeitMin: 20 })).toBeNull()
    expect(testStatusText({ wartend: true, zeitMin: 20 })).toBeNull()
  })
  it('meldet „Test bald" in Meine Klassen nur für sichtbare Termine der nächsten 7 Tage', () => {
    const b = onlinetestBaldBedarf({ id: 't1', titel: 'Unit 3', termin: '2026-10-16' }, JETZT)
    expect(b?.text).toBe('Onlinetest „Unit 3" morgen (Fr 16.10.) – noch nicht gestartet')
    expect(b?.schluessel).toBe('onlinetest-termin:t1')
    expect(onlinetestBaldBedarf({ id: 't1', titel: 'Unit 3', termin: '2026-10-16', verborgen: true }, JETZT)).toBeNull()
    expect(onlinetestBaldBedarf({ id: 't1', titel: 'Unit 3', termin: '2026-10-30' }, JETZT)).toBeNull()
  })
})

describe('Sprachrunde: Testfenster aus Onlinetests', () => {
  const test = (x: Partial<OnlineTermin>): OnlineTermin => ({ lerngruppeId: 'g1', art: 'Vokabeltest', fach: 'englisch', zielsprache: 'en', termin: '2026-10-17', ...x })
  const kurs = { lerngruppe_id: 'g1', fach: 'Englisch', sprache: 'en', test_termin: null }
  it('übernimmt den Termin eines Vokabel-Onlinetests derselben Lerngruppe und desselben Fachs', () => {
    const t = kursTerminMitOnlinetests(kurs, [test({})], JETZT)
    expect(t).toBe(terminMs('2026-10-17'))
    // in den drei Tagen davor stellt die Runde um
    expect(testPause([t], JETZT)).toBe(true)
  })
  it('außerhalb des Fensters keine Umstellung', () => {
    const t = kursTerminMitOnlinetests(kurs, [test({ termin: '2026-10-22' })], JETZT)
    expect(t).toBe(terminMs('2026-10-22'))
    expect(testPause([t], JETZT)).toBe(false)
  })
  it('ignoriert andere Lerngruppen, andere Fächer und andere Testarten', () => {
    expect(kursTerminMitOnlinetests(kurs, [test({ lerngruppeId: 'g2' })], JETZT)).toBeNull()
    expect(kursTerminMitOnlinetests(kurs, [test({ fach: 'franzoesisch', zielsprache: 'fr' })], JETZT)).toBeNull()
    expect(kursTerminMitOnlinetests(kurs, [test({ art: 'Lernzielkontrolle' })], JETZT)).toBeNull()
    expect(kursTerminMitOnlinetests({ ...kurs, lerngruppe_id: '' }, [test({ lerngruppeId: '' })], JETZT)).toBeNull()
  })
  it('nimmt den früheren von Kurstermin und Onlinetest', () => {
    const frueh = terminMs('2026-10-16')
    expect(kursTerminMitOnlinetests({ ...kurs, test_termin: frueh }, [test({})], JETZT)).toBe(frueh)
    const spaet = terminMs('2026-10-30')
    expect(kursTerminMitOnlinetests({ ...kurs, test_termin: spaet }, [test({})], JETZT)).toBe(terminMs('2026-10-17'))
  })
  it('vergangene Onlinetests zählen nicht', () => {
    expect(kursTerminMitOnlinetests(kurs, [test({ termin: '2026-10-10' })], JETZT)).toBeNull()
  })
})

describe('Demnächst der Lehrkraft', () => {
  it('nennt wartende Onlinetests mit sichtbarem Termin', () => {
    const d = demnaechst(
      [],
      [],
      JETZT,
      [
        { id: 'a', titel: 'Vokabeltest Unit 3 – Fr 16.10.', status: 'wartend', termin: '2026-10-16' },
        { id: 'b', titel: 'Verborgen', status: 'wartend', termin: '2026-10-16', terminVerborgen: true },
        { id: 'c', titel: 'Gestartet', status: 'offen', termin: '2026-10-16' },
        { id: 'd', titel: 'Ohne Termin', status: 'wartend' }
      ]
    )
    expect(d).toEqual([{ tag: '2026-10-16', art: 'onlinetest', text: 'Vokabeltest Unit 3 – Fr 16.10.', ziel: 'a' }])
  })
})
