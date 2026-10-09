import { describe, expect, it } from 'vitest'
import {
  alsVorlage,
  anlassVon,
  briefInfo,
  datenImText,
  erkenneAnlass,
  fristStufe,
  kernDatum,
  klassenListe,
  ohneDatenUndKlasse,
  ordneBriefe,
  rueckmeldungBis,
  schuljahrAus,
  schuljahrName,
  tagKurz,
  zuletztBearbeitet
} from '../src/renderer/src/modules/elternbrief/bibliothekInfo'
import type { Elternbrief } from '../src/renderer/src/modules/elternbrief/model'

/*
 * Bibliothek der Elternbriefe (09.10.2026): Schuljahr → Klasse → Datum, Anlass ohne KI, Termin und Rückmeldefrist
 * aus dem Brief, „Als Vorlage für neuen Brief".
 */
const brief = (meta: Partial<Elternbrief['meta']> = {}, text: Partial<NonNullable<Elternbrief['text']>> = {}): Elternbrief => ({
  version: 1,
  meta: {
    title: '',
    anlass: 'Allgemeine Information',
    ton: 'freundlich',
    stichpunkte: '',
    klasse: '7b',
    absender: 'Frau Berg',
    datum: '2026-10-06',
    ruecklauf: false,
    ...meta
  },
  text: { betreff: 'Information', anrede: 'Liebe Eltern der Klasse 7b,', absaetze: ['Text.'], gruss: 'Mit freundlichen Grüßen', ...text },
  uebersetzungen: [],
  createdAt: '2026-10-06T10:00:00.000Z'
})

describe('Anlass ohne KI', () => {
  it('erkennt den Anlass am Betreff', () => {
    expect(erkenneAnlass(brief({}, { betreff: 'Wandertag in den Wildpark' }))).toBe('Ausflug/Wandertag')
    expect(erkenneAnlass(brief({}, { betreff: 'Einladung zum Elternabend' }))).toBe('Elternabend')
    expect(erkenneAnlass(brief({}, { betreff: 'Klassenfahrt nach Borkum' }))).toBe('Klassenfahrt')
    expect(erkenneAnlass(brief({}, { betreff: 'Elternsprechtag im November' }))).toBe('Sprechtag')
    expect(erkenneAnlass(brief({}, { betreff: 'Termine im ersten Halbjahr' }))).toBe('Termine')
    expect(erkenneAnlass(brief({}, { betreff: 'Wichtige Information zum Unterricht' }))).toBe('Information')
  })
  it('Klassenfahrt geht vor Ausflug, Formular-Anlass vor dem Fließtext', () => {
    expect(erkenneAnlass(brief({}, { betreff: 'Ausflug und Klassenfahrt' }))).toBe('Klassenfahrt')
    expect(erkenneAnlass(brief({ anlass: 'Elternabend' }, { betreff: 'Einladung', absaetze: ['Der Ausflug fällt aus.'] }))).toBe('Elternabend')
  })
  it('nutzt den Text, wenn Betreff und Formular nichts sagen; sonst Information bzw. Sonstiges', () => {
    expect(erkenneAnlass(brief({ anlass: 'Sonstiges' }, { betreff: 'Einladung', absaetze: ['Wir besuchen das Schullandheim.'] }))).toBe('Klassenfahrt')
    expect(erkenneAnlass(brief({ anlass: 'Allgemeine Information' }, { betreff: 'Neue Regeln' }))).toBe('Information')
    expect(erkenneAnlass(brief({ anlass: 'Bitte um Material oder Geld' }, { betreff: 'Kopiergeld' }))).toBe('Sonstiges')
  })
  it('ein im Menü gewählter Anlass geht vor; Unbekanntes wird überhört', () => {
    expect(anlassVon(brief({ anlassArt: 'Termine' }, { betreff: 'Wandertag' }))).toBe('Termine')
    expect(anlassVon(brief({ anlassArt: 'Quatsch' }, { betreff: 'Wandertag' }))).toBe('Ausflug/Wandertag')
  })
})

describe('Termin und Rückmeldefrist', () => {
  it('liest Daten in allen Schreibweisen; ohne Jahr ggf. das nächste', () => {
    expect(datenImText('am **Freitag, 17.10.2026** und am 3. November', '2026-10-06').map((d) => d.iso)).toEqual(['2026-10-17', '2026-11-03'])
    expect(datenImText('Treffen am 15.01.', '2026-12-10').map((d) => d.iso)).toEqual(['2027-01-15'])
    expect(datenImText('um 8.00 Uhr, 5 € bis 31.13.', '2026-10-06')).toEqual([])
  })
  it('Termin: Feld vor fettem Datum vor erstem Datum, nie die Frist', () => {
    expect(kernDatum(brief({ termin: { datum: '2026-10-20' } }, { absaetze: ['am **17.10.**'] }))).toBe('2026-10-20')
    expect(kernDatum(brief({}, { absaetze: ['Bitte bis 10.10. anmelden: Rückmeldung.', 'Wir fahren am **Freitag, 17.10.** los.'] }))).toBe('2026-10-17')
    expect(
      kernDatum(brief({ ruecklauf: true, rueckgabeBis: '2026-10-13' }, { absaetze: ['Bitte bis **Mo, 13.10.** zurückgeben. Ausflug am 24.10.'] }))
    ).toBe('2026-10-24')
    expect(kernDatum(brief({}, { absaetze: ['Ohne Datum.'] }))).toBe('')
  })
  it('Frist: Feld, sonst Abschnitt, sonst „bis …" in einem Rückmelde-Satz', () => {
    expect(rueckmeldungBis(brief({ ruecklauf: true, rueckgabeBis: '2026-10-13' }))).toBe('2026-10-13')
    expect(rueckmeldungBis(brief({}, { ruecklauf: { titel: 'Rückmeldung', zeilen: ['Bitte bis **Mo, 12.10.** zurückgeben.'] } }))).toBe('2026-10-12')
    expect(rueckmeldungBis(brief({}, { absaetze: ['Bitte melden Sie Ihr Kind bis zum 9.10. an.'] }))).toBe('2026-10-09')
    expect(rueckmeldungBis(brief({}, { absaetze: ['Geben Sie bis zum 9.10. 5 € mit.'] }))).toBe('')
  })
  it('Kurzform und Ampel', () => {
    expect(tagKurz('2026-10-17')).toBe('Sa 17.10.')
    expect(tagKurz('2026-10-13')).toBe('Di 13.10.')
    const heute = new Date(2026, 9, 9)
    expect(fristStufe('2026-10-08', heute)).toBe('vorbei')
    expect(fristStufe('2026-10-09', heute)).toBe('dringend')
    expect(fristStufe('2026-10-12', heute)).toBe('dringend')
    expect(fristStufe('2026-10-16', heute)).toBe('bald')
    expect(fristStufe('2026-10-17', heute)).toBe('spaeter')
  })
})

describe('Schuljahr und Klassen', () => {
  it('Schuljahr vom 1. August bis 31. Juli', () => {
    expect(schuljahrAus('2026-07-31')).toBe(2025)
    expect(schuljahrAus('2026-08-01')).toBe(2026)
    expect(schuljahrName(2026)).toBe('2026/27')
    expect(schuljahrName(2099)).toBe('2099/00')
  })
  it('Klassen aus dem Feld', () => {
    expect(klassenListe('7a, 7b')).toEqual(['7a', '7b'])
    expect(klassenListe('Klassen 7a und 7c')).toEqual(['7a', '7c'])
    expect(klassenListe('7a/b')).toEqual(['7a', '7b'])
    expect(klassenListe('')).toEqual([])
  })
  it('ordnet Schuljahr → Klasse → Datum, mehrere Klassen doppelt, ohne Klasse zuletzt', () => {
    const e = (id: string, meta: Partial<Elternbrief['meta']>, updatedAt = '2026-10-01T00:00:00Z') => ({
      meta: { id, updatedAt },
      info: briefInfo(brief(meta))
    })
    const g = ordneBriefe(
      [
        e('a', { datum: '2026-09-01', klasse: '7b' }),
        e('b', { datum: '2026-10-01', klasse: '7a, 7b' }),
        e('c', { datum: '2026-09-15', klasse: '' }),
        e('d', { datum: '2026-05-01', klasse: '10a' }),
        e('f', { datum: '2026-09-20', klasse: '10a' })
      ],
      new Date(2026, 9, 9)
    )
    expect(g.map((x) => [x.name, x.aktuell, x.anzahl])).toEqual([
      ['2026/27', true, 4],
      ['2025/26', false, 1]
    ])
    expect(g[0].klassen.map((k) => [k.klasse, k.briefe.map((b) => b.meta.id)])).toEqual([
      ['7a', ['b']],
      ['7b', ['b', 'a']],
      ['10a', ['f']],
      ['Ohne Klasse', ['c']]
    ])
  })
  it('zuletzt bearbeitet: die vier neuesten', () => {
    const l = ['1', '5', '3', '2', '4'].map((t) => ({ id: t, updatedAt: `2026-10-0${t}T00:00:00Z` }))
    expect(zuletztBearbeitet(l).map((x) => x.id)).toEqual(['5', '4', '3', '2'])
  })
})

describe('Als Vorlage für neuen Brief', () => {
  it('Daten werden „[Datum]", die alte Klasse „[Klasse]"', () => {
    expect(ohneDatenUndKlasse('am **Freitag, 17.10.2026** um 8:00 Uhr', ['7b'])).toBe('am **[Datum]** um 8:00 Uhr')
    expect(ohneDatenUndKlasse('Liebe Eltern der Klassen 7a und 7b, Raum 7b', ['7a', '7b'])).toBe('Liebe Eltern der Klassen [Klasse], Raum 7b')
  })
  it('behält Text, Aufbau und Anlass; leert Termin, Frist, Klasse, Titel, Übersetzungen; Datum = heute', () => {
    const alt: Elternbrief = {
      ...brief(
        { title: 'Wandertag 7b', klasse: '7b', termin: { datum: '2026-10-17', uhrzeit: '08:00' }, ruecklauf: true, rueckgabeBis: '2026-10-13', stichpunkte: 'Wildpark am 17.10.' },
        {
          betreff: 'Wandertag am 17. Oktober',
          absaetze: ['Am **Freitag, 17.10.** wandern wir.', 'Treffpunkt **8:00 Uhr**.'],
          ruecklauf: { titel: 'Rückmeldung', zeilen: ['Bitte bis **Di, 13.10.** zurückgeben.', '☐ Mein Kind nimmt teil.'] }
        }
      ),
      uebersetzungen: [{ code: 'tr', text: { betreff: 'x', anrede: 'x', absaetze: ['x', 'x'], gruss: 'x' } }],
      fassungen: [{ am: '2026-10-01', anlass: 'x', text: { betreff: 'x', anrede: 'x', absaetze: ['x'], gruss: 'x' } }]
    }
    const neu = alsVorlage(alt, new Date(2026, 10, 2, 9))
    expect(neu.meta.title).toBe('')
    expect(neu.meta.klasse).toBe('')
    expect(neu.meta.termin).toBeUndefined()
    expect(neu.meta.rueckgabeBis).toBeUndefined()
    expect(neu.meta.datum).toBe('2026-11-02')
    expect(neu.meta.ruecklauf).toBe(true)
    expect(neu.meta.ton).toBe('freundlich')
    expect(neu.meta.anlassArt).toBe('Ausflug/Wandertag')
    expect(neu.meta.stichpunkte).toBe('Wildpark am [Datum]')
    expect(neu.text?.betreff).toBe('Wandertag am [Datum]')
    expect(neu.text?.anrede).toBe('Liebe Eltern der Klasse [Klasse],')
    expect(neu.text?.absaetze).toEqual(['Am **[Datum]** wandern wir.', 'Treffpunkt **8:00 Uhr**.'])
    expect(neu.text?.ruecklauf?.zeilen).toEqual(['Bitte bis **[Datum]** zurückgeben.', '☐ Mein Kind nimmt teil.'])
    expect(neu.uebersetzungen).toEqual([])
    expect(neu.fassungen).toBeUndefined()
    // Das Original bleibt unverändert
    expect(alt.meta.klasse).toBe('7b')
    expect(alt.text?.absaetze[0]).toBe('Am **Freitag, 17.10.** wandern wir.')
    // Die Vorlage selbst hat keinen Termin und keine Frist mehr
    const info = briefInfo(neu)
    expect([info.termin, info.frist, info.klassen]).toEqual(['', '', []])
  })
})
