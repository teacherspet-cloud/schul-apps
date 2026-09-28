import { describe, expect, it } from 'vitest'
import { briefDocx, briefHtml } from '../src/renderer/src/modules/elternbrief/ausgabe'
import {
  briefAnfrage,
  briefAus,
  DEUTSCHER_VERMERK,
  uebersetzungAus,
  uebersetzungsAnfrage,
  type Elternbrief
} from '../src/renderer/src/modules/elternbrief/model'
import { FAMILIENSPRACHEN, spracheNach } from '../src/renderer/src/shared/familiensprachen'
import JSZip from 'jszip'

/*
 * Elternbrief (Großprogramm 0.4, F7): nichts erfinden, keine Namen von Kindern, Übersetzungen
 * mit gleichem Aufbau und Vermerk, Arabisch von rechts nach links.
 */
const brief = (): Elternbrief => ({
  version: 1,
  meta: {
    title: '',
    anlass: 'Ausflug oder Wandertag',
    ton: 'freundlich',
    stichpunkte: 'Wandertag 12.10., 5 €',
    klasse: '7b',
    absender: 'Frau Berg',
    datum: '2026-09-28',
    ruecklauf: true
  },
  text: briefAus(
    {
      betreff: 'Wandertag',
      anrede: 'Liebe Eltern,',
      absaetze: ['Am 12.10. wandern wir.', 'Bitte 5 € mitgeben.'],
      gruss: 'Mit freundlichen Grüßen',
      ruecklaufTitel: 'Rückmeldung Wandertag',
      ruecklaufZeilen: ['☐ [Name des Kindes] nimmt teil.', 'Unterschrift: ______']
    },
    true
  ),
  uebersetzungen: [],
  createdAt: ''
})

describe('Elternbrief', () => {
  it('die Anfrage verbietet Namen und Erfundenes, fragt den Rücklauf an', () => {
    const a = briefAnfrage(brief(), 'Musterschule')
    expect(a.schemaName).toBe('elternbrief_text')
    expect(a.user).toMatch(/KEINE Namen von Kindern/)
    expect(a.user).toMatch(/nichts erfinden/)
    expect(a.user).toMatch(/Mit Rücklaufzettel/)
    expect(a.user).toContain('Wandertag 12.10., 5 €')
  })

  it('ohne gewünschten Rücklauf kein Zettel, auch wenn die KI einen schickt', () => {
    const t = briefAus({ absaetze: ['A'], ruecklaufTitel: 'X', ruecklaufZeilen: ['Y'] }, false)
    expect(t.ruecklauf).toBeUndefined()
    expect(() => briefAus({ absaetze: [] }, false)).toThrow()
  })

  it('Übersetzung: gleiche Absätze wie das Original, Vermerk in der Zielsprache', () => {
    const b = brief()
    const tr = spracheNach('tr')!
    expect(uebersetzungsAnfrage(b.text!, tr).user).toMatch(/Platzhalter in eckigen Klammern/)
    const u = uebersetzungAus(
      {
        betreff: 'Gezi',
        anrede: 'Sevgili veliler,',
        absaetze: ['12.10.', '5 €'],
        gruss: 'Saygılarımla',
        ruecklaufTitel: 'Geri bildirim',
        ruecklaufZeilen: ['☐', 'İmza'],
        vermerk: 'Makine çevirisi …'
      },
      b.text!
    )
    expect(u.vermerk).toBe('Makine çevirisi …')
    expect(() => uebersetzungAus({ absaetze: ['nur einer'] }, b.text!)).toThrow(/dieselben Absätze/)
  })

  it('Ausgabe: deutsche Fassung zuerst, Arabisch von rechts nach links, Vermerk auf Deutsch', async () => {
    const b = brief()
    b.uebersetzungen = [{ code: 'ar', text: { ...b.text!, betreff: 'رحلة', vermerk: 'ترجمة آلية' } }]
    const html = briefHtml(b, { schule: 'Musterschule', logo: null })
    expect(html.indexOf('lang="de"')).toBeLessThan(html.indexOf('lang="ar"'))
    expect(html).toMatch(/lang="ar" dir="rtl"/)
    expect(html).toContain(DEUTSCHER_VERMERK)
    expect(html).toContain('✂')
    const zip = await JSZip.loadAsync(await briefDocx(b, { schule: 'Musterschule', logo: null }))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('<w:bidi/>')
    expect(xml).toContain('Musterschule')
  })

  it('Familiensprachen: eindeutige Kennungen, die rechts-nach-links-Sprachen markiert', () => {
    expect(new Set(FAMILIENSPRACHEN.map((s) => s.code)).size).toBe(FAMILIENSPRACHEN.length)
    for (const c of ['ar', 'fa', 'prs', 'ps']) expect(spracheNach(c)?.rtl).toBe(true)
    expect(spracheNach('uk')?.rtl).toBeFalsy()
  })
})
