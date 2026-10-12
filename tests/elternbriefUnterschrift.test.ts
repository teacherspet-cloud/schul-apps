import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { briefDocx, briefHtml } from '../src/renderer/src/modules/elternbrief/ausgabe'
import { KOPF, ohneAmtsbezeichnung } from '../src/renderer/src/modules/elternbrief/din5008'
import type { Elternbrief } from '../src/renderer/src/modules/elternbrief/model'

/*
 * Unterschrift im Elternbrief (12.10.2026): Bild über dem Namen, Name ohne Amtsbezeichnung, Empfängerzeile über die
 * volle Satzbreite.
 */
describe('ohneAmtsbezeichnung', () => {
  it.each([
    ["Frau StR' Müller", 'Frau Müller'],
    ['Frau StR’ Müller', 'Frau Müller'],
    ["Frau StR'in Müller", 'Frau Müller'],
    ['Frau StRin Müller', 'Frau Müller'],
    ['Herr StR Meyer', 'Herr Meyer'],
    ['StR Meyer', 'Meyer'],
    ['Herr OStR Meyer', 'Herr Meyer'],
    ["Frau OStR'in Kaya", 'Frau Kaya'],
    ["Frau OStR' Kaya", 'Frau Kaya'],
    ['Herr StD Schulz', 'Herr Schulz'],
    ["Frau StD'in Schulz", 'Frau Schulz'],
    ['Herr OStD Brandt', 'Herr Brandt'],
    ["Frau L'in Weber", 'Frau Weber'],
    ['Herr L Weber', 'Herr Weber'],
    ['Herr RSL Kühn', 'Herr Kühn'],
    ['Frau RL Kühn', 'Frau Kühn'],
    ['Herr KR Lange', 'Herr Lange'],
    ['Frau FL Lange', 'Frau Lange'],
    ['Herr StAss Pohl', 'Herr Pohl'],
    ['Frau LiA Pohl', 'Frau Pohl'],
    ['Herr Ref. Pohl', 'Herr Pohl'],
    ['Müller, StR', 'Müller'],
    ["Müller, StR'", 'Müller'],
    ['Müller, StR.', 'Müller'],
    ['Müller (StR)', 'Müller'],
    ["Anna Müller (OStR')", 'Anna Müller'],
    ['Anna Müller, Studienrätin', 'Anna Müller'],
    ['Studienrat Peter Meyer', 'Peter Meyer'],
    ['Oberstudienrätin Kaya', 'Kaya'],
    ['Studiendirektorin Dr. Schulz', 'Dr. Schulz'],
    ['Frau Lehrerin Weber', 'Frau Weber'],
    ['Weber, Lehrer/in', 'Weber'],
    ['Herr StR z. A. Meyer', 'Herr Meyer'],
    ["Frau StR' Dr. Müller", 'Frau Dr. Müller'],
    ['Dr. Anna Müller, OStR', 'Dr. Anna Müller'],
    ['StR Prof. Dr. Klein', 'Prof. Dr. Klein'],
    ['Frau Müller', 'Frau Müller'],
    ['  Frau Müller  ', 'Frau Müller'],
    ['', '']
  ])('%s → %s', (ein, aus) => {
    expect(ohneAmtsbezeichnung(ein)).toBe(aus)
  })

  it('lässt Namen stehen, die nur so aussehen', () => {
    // Vornamen-Kürzel „L." und Namen, in denen ein Kürzel steckt
    expect(ohneAmtsbezeichnung('Frau L. Müller')).toBe('Frau L. Müller')
    expect(ohneAmtsbezeichnung('Herr Strauß')).toBe('Herr Strauß')
    expect(ohneAmtsbezeichnung('Frau Müller-Lehrer')).toBe('Frau Müller-Lehrer')
    expect(ohneAmtsbezeichnung('Herr Rektorski')).toBe('Herr Rektorski')
    expect(ohneAmtsbezeichnung('Frau Stdenis')).toBe('Frau Stdenis')
    // Bliebe nur die Anrede, ist es wohl der Nachname
    expect(ohneAmtsbezeichnung('Herr Lehrer')).toBe('Herr Lehrer')
    expect(ohneAmtsbezeichnung('StR')).toBe('StR')
  })
})

const brief = (absender: string): Elternbrief => ({
  version: 1,
  meta: {
    title: '',
    anlass: 'Ausflug oder Wandertag',
    ton: 'freundlich',
    stichpunkte: 'Wandertag',
    klasse: '9c',
    absender,
    datum: '2026-10-12',
    ruecklauf: false,
    rueckgabeBis: ''
  },
  text: { betreff: 'Wandertag', anrede: 'Liebe Eltern,', absaetze: ['Text.'], gruss: 'Mit freundlichen Grüßen' } as Elternbrief['text'],
  uebersetzungen: [],
  createdAt: ''
})
// Kleinstes gültiges PNG (1 × 1)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
const kopf = { schule: 'Gymnasium', logo: null, ort: 'Bremerhaven', lehrkraft: "Frau StR' Müller" }

describe('Unterschrift und Empfängerzeile im Brief', () => {
  it('HTML: Bild über dem Namen, Name ohne Amtsbezeichnung, im Absender bleibt sie', () => {
    const html = briefHtml(brief("Frau StR' Müller"), { ...kopf, unterschrift: PNG })
    const bild = html.indexOf('<img class="unterschrift"')
    const name = html.indexOf('<p class="name">Frau Müller</p>')
    expect(bild).toBeGreaterThan(html.indexOf('class="gruss"'))
    expect(name).toBeGreaterThan(bild)
    expect(html).toContain('<div class="absender">Frau StR\' Müller<br>')
    expect(html).not.toContain('ohne-unterschrift"></div>')
  })

  it('HTML ohne Bild: drei Leerzeilen Platz, dann der Name', () => {
    const html = briefHtml(brief(''), kopf)
    expect(html).toContain('<div class="ohne-unterschrift"></div><p class="name">Frau Müller</p>')
  })

  it('HTML: „An die Eltern …" über die volle Satzbreite', () => {
    const html = briefHtml(brief(''), kopf)
    expect(KOPF.satzBreiteMm).toBe(165)
    expect(html).toContain(`.anschrift { position: absolute; top: ${KOPF.anschriftzoneObenMm}mm; left: 0; width: 165mm; }`)
    expect(html).toContain('<p class="anschrift">An die Eltern und Erziehungsberechtigten der Klasse 9c</p>')
  })

  it('Word: Bild vor dem Namen, Name ohne Amtsbezeichnung, Empfängerzeile in einer Zelle über beide Spalten', async () => {
    const zip = await JSZip.loadAsync(await briefDocx(brief("Frau StR' Müller"), { ...kopf, unterschrift: PNG }))
    const xml = await zip.file('word/document.xml')!.async('string')
    const bild = xml.lastIndexOf('<w:drawing>')
    const name = xml.indexOf('>Frau Müller</w:t>')
    expect(bild).toBeGreaterThan(xml.indexOf('Mit freundlichen Grüßen'))
    expect(name).toBeGreaterThan(bild)
    // Absender im Kopf behält die Amtsbezeichnung
    expect(xml).toContain('Frau StR&apos; Müller')
    const empf = xml.indexOf('An die Eltern und Erziehungsberechtigten der Klasse 9c')
    const zelle = xml.lastIndexOf('<w:tc>', empf)
    expect(xml.slice(zelle, empf)).toContain('<w:gridSpan w:val="2"/>')
  })
})
