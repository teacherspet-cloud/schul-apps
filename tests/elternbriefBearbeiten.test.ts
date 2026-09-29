import { describe, expect, it } from 'vitest'
import { absenderZeilen, briefDocx, briefHtml, ortDatum } from '../src/renderer/src/modules/elternbrief/ausgabe'
import {
  festeWerte,
  geaenderteTeile,
  neuAnfrage,
  offenePlatzhalter,
  pruefeBrief,
  teilAnfrage,
  teileUebersetzungAus,
  teileVon,
  teilLesen,
  teilSetzen,
  verloreneAngaben
} from '../src/renderer/src/modules/elternbrief/bearbeiten'
import { briefAnfrage, datumLang, festeAngaben, type BriefText, type Elternbrief } from '../src/renderer/src/modules/elternbrief/model'

/*
 * Elternbrief nach der Rückmeldung der Lehrkraft (29.09.2026): Termin und Frist als eigene Felder,
 * Briefkopf mit Anschrift, Zauberstab je Teil, Neuformulierung mit festen Angaben.
 */
const text = (): BriefText => ({
  betreff: 'Ausflug zur Eisarena',
  anrede: 'Liebe Eltern der Klasse 9c,',
  absaetze: [
    'am Freitag, 12.12.2026 fahren wir zur Eisarena und danach zum Weihnachtsmarkt. Treffpunkt ist um 8:00 Uhr an der Eisarena.',
    'Der Eintritt kostet 6,50 €. Bitte geben Sie den Rücklaufzettel bis Freitag, 05.12.2026 zurück.'
  ],
  gruss: 'Mit freundlichen Grüßen',
  ruecklauf: { titel: 'Rücklaufzettel', zeilen: ['Name des Kindes: [Name des Kindes]', '☐ Mein Kind nimmt teil.'] }
})

const brief = (over: Partial<Elternbrief['meta']> = {}): Elternbrief => ({
  version: 1,
  meta: {
    title: '',
    anlass: 'Ausflug oder Wandertag',
    ton: 'freundlich',
    stichpunkte: 'Eisarena, Weihnachtsmarkt, 6,50 €',
    klasse: '9c',
    absender: 'Frau Müller',
    datum: '2026-11-28',
    ruecklauf: true,
    termin: { datum: '2026-12-12', uhrzeit: '08:00' },
    rueckgabeBis: '2026-12-05',
    ...over
  },
  text: text(),
  uebersetzungen: [],
  createdAt: ''
})

describe('Termin und Rückgabefrist', () => {
  it('stehen als feste Angaben mit Wochentag in der Anfrage', () => {
    expect(datumLang('2026-12-12')).toBe('Samstag, 12.12.2026')
    expect(festeAngaben(brief().meta)).toEqual(['TERMIN: Samstag, 12.12.2026, 08:00 Uhr', 'RÜCKGABE DES RÜCKLAUFZETTELS BIS: Samstag, 05.12.2026'])
    const a = briefAnfrage(brief(), 'Gymnasium Wesermünde')
    expect(a.user).toContain('TERMIN: Samstag, 12.12.2026, 08:00 Uhr')
    expect(a.user).toMatch(/kein Platzhalter dafür/)
  })

  it('ohne Rücklaufzettel keine Frist; ohne Termin keine Zeile', () => {
    expect(festeAngaben(brief({ ruecklauf: false, termin: undefined }).meta)).toEqual([])
  })
})

describe('Teile und feste Angaben', () => {
  it('liest und setzt Teile über Schlüssel', () => {
    const t = text()
    expect(teileVon(t).map((x) => x.schluessel)).toEqual(['betreff', 'anrede', 'absatz-0', 'absatz-1', 'gruss', 'rl-titel', 'rl-0', 'rl-1'])
    teilSetzen(t, 'absatz-1', 'Neu.')
    teilSetzen(t, 'rl-1', '☐ Ja.')
    expect(teilLesen(t, 'absatz-1')).toBe('Neu.')
    expect(t.ruecklauf?.zeilen[1]).toBe('☐ Ja.')
    expect(geaenderteTeile(text(), t)).toEqual(['absatz-1', 'rl-1'])
  })

  it('erkennt Datum, Uhrzeit, Betrag und Platzhalter – auch in anderer Schreibweise', () => {
    const vorher = festeWerte(text())
    expect(vorher).toEqual(expect.arrayContaining(['datum:12.12', 'datum:5.12', 'zeit:8:00', 'betrag:6,50', 'platzhalter:[Name des Kindes]']))
    const umformuliert = text()
    umformuliert.absaetze[0] = 'Am 12.12.2026 geht es um 8.00 Uhr los – Treffpunkt: Eisarena.'
    umformuliert.absaetze[1] = 'Eintritt: 6,50 Euro. Rückgabe bis zum 5. Dezember.'
    expect(verloreneAngaben(vorher, umformuliert)).toEqual([])
    umformuliert.absaetze[1] = 'Eintritt: 7 €. Rückgabe bitte bald.'
    expect(verloreneAngaben(vorher, umformuliert)).toEqual(['Datum 5.12.', 'Betrag 6,50 €'])
  })

  it('meldet offene Platzhalter der Lehrkraft, nicht die für die Eltern', () => {
    const t = text()
    t.absaetze[1] = 'Bitte geben Sie den Zettel bis zum [Rückgabefrist] zurück.'
    expect(offenePlatzhalter(t)).toEqual(['[Rückgabefrist]'])
    expect(pruefeBrief(brief(), t)[0]).toMatch(/Noch auszufüllen: \[Rückgabefrist\]/)
    expect(pruefeBrief(brief({ rueckgabeBis: '' }), text())).toContain('Für den Rücklaufzettel ist keine Rückgabefrist eingetragen.')
  })
})

describe('Anfragen', () => {
  it('Zauberstab: nur der Teil, feste Angaben bleiben, Hinweis der Lehrkraft', () => {
    const a = teilAnfrage(brief(), 'absatz-1', 'kuerzer', 'Frist zuerst')
    expect(a.schemaName).toBe('elternbrief_teil')
    expect(a.user).toMatch(/Fasse den Teil kürzer/)
    expect(a.user).toMatch(/HINWEIS DER LEHRKRAFT \(umsetzen\): Frist zuerst/)
    expect(a.user).toMatch(/FESTE ANGABEN: .*bleiben inhaltlich gleich/)
    expect(a.user).toContain('Der Eintritt kostet 6,50 €.')
  })

  it('Neuformulierung: Ton, einfache Sprache, kürzer', () => {
    const a = neuAnfrage(brief(), { ton: 'sachlich', hinweis: '', einfach: true, kuerzer: true })
    expect(a.user).toMatch(/Ton: Sachlich/)
    expect(a.user).toMatch(/Einfache Sprache/)
    expect(a.user).toMatch(/Deutlich kürzer/)
    expect(a.schemaName).toBe('elternbrief_text')
  })

  it('Teilübersetzung muss alle Teile liefern', () => {
    const teile = [{ schluessel: 'absatz-0', text: 'A' }]
    expect(teileUebersetzungAus({ teile: [{ schluessel: 'absatz-0', text: 'أ' }] }, teile)).toEqual([{ schluessel: 'absatz-0', text: 'أ' }])
    expect(() => teileUebersetzungAus({ teile: [] }, teile)).toThrow(/unvollständig/)
  })
})

describe('Briefkopf', () => {
  const kopf = {
    schule: 'Gymnasium Wesermünde',
    logo: null,
    lehrkraft: 'Frau Müller',
    strasse: 'Humboldtstraße 12-14',
    plz: '27570',
    ort: 'Bremerhaven',
    telefon: '0471 483670'
  }

  it('Absender links: Lehrkraft, Schule, Straße, PLZ Ort, Telefon; rechts Ort und Datum', () => {
    expect(absenderZeilen(kopf, '')).toEqual(['Frau Müller', 'Gymnasium Wesermünde', 'Humboldtstraße 12-14', '27570 Bremerhaven', 'Tel. 0471 483670'])
    expect(absenderZeilen({ schule: 'X', logo: null }, 'Herr Kurz')).toEqual(['Herr Kurz', 'X'])
    expect(ortDatum(kopf, '2026-11-28')).toBe('Bremerhaven, 28. November 2026')
    const html = briefHtml(brief(), kopf)
    expect(html).toContain('Humboldtstraße 12-14<br>27570 Bremerhaven<br>Tel. 0471 483670')
    expect(html).toContain('Bremerhaven, 28. November 2026')
  })

  it('Unterschrift als Bild über dem Namen – in PDF und Word', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='
    const html = briefHtml(brief(), { ...kopf, unterschrift: png })
    expect(html).toMatch(/<img class="unterschrift" src="data:image\/png/)
    const docx = await briefDocx(brief(), { ...kopf, unterschrift: png })
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(docx)
    expect(Object.keys(zip.files).filter((n) => /^word\/media\/.+\.png$/.test(n)).length).toBe(1)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('Humboldtstraße 12-14')
    expect(xml).toContain('Frau Müller')
  })
})
