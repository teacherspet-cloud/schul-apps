import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { briefDocx, briefHtml, kopfMitSchule } from '../src/renderer/src/modules/elternbrief/ausgabe'
import { DIN5008, empfaengerZeile, KOPF, leerPt, leerTwips, ZEILE_PT } from '../src/renderer/src/modules/elternbrief/din5008'
import {
  bereinigeFett,
  briefNachbereiten,
  fettHtml,
  fettZahl,
  FETT_HOECHSTENS,
  fristKurz,
  fristMuster,
  stuecke
} from '../src/renderer/src/modules/elternbrief/hervorhebung'
import { briefAnfrage, briefAus, type Elternbrief } from '../src/renderer/src/modules/elternbrief/model'
import { verzeichnisAbgleich, verzeichnisUebernehmen } from '../src/shared/schulVerzeichnisDaten'

/*
 * Elternbrief nach DIN 5008 Form B, Fettdruck mit **…**, Rückgabefrist hervorgehoben, Schuldaten aus dem
 * Schulverzeichnis (09.10.2026).
 */
const brief = (text: Partial<Elternbrief['text']> = {}): Elternbrief => ({
  version: 1,
  meta: {
    title: '',
    anlass: 'Ausflug oder Wandertag',
    ton: 'freundlich',
    stichpunkte: 'Wandertag',
    klasse: '6b',
    absender: 'Frau Berg',
    datum: '2026-10-09',
    ruecklauf: true,
    rueckgabeBis: '2026-10-16'
  },
  text: {
    betreff: 'Wandertag',
    anrede: 'Liebe Eltern,',
    absaetze: ['Am **Montag, 19.10.2026** wandern wir. Treffpunkt **8:00 Uhr** am Haupteingang.', 'Bitte den Abschnitt bis **16.10.** abgeben.'],
    gruss: 'Mit freundlichen Grüßen',
    ruecklauf: { titel: 'Rückmeldung', zeilen: ['Bitte bis **Fr, 16.10.** zurückgeben.', '☐ [Name des Kindes] nimmt teil.'] },
    ...text
  } as Elternbrief['text'],
  uebersetzungen: [],
  createdAt: ''
})
const kopf = { schule: 'Gymnasium Wesermünde', logo: null, ort: 'Bremerhaven', strasse: 'Humboldtstraße 12-14', plz: '27570' }

describe('DIN 5008 Form B – Maße', () => {
  it('Ränder, Briefkopf, Anschriftfeld und Informationsblock wie recherchiert', () => {
    expect(DIN5008.rand.linksMm).toBe(25)
    expect(DIN5008.rand.rechtsMm).toBeGreaterThanOrEqual(20)
    expect(DIN5008.briefkopfHoeheMm).toBe(45)
    expect(DIN5008.anschriftfeld).toMatchObject({ obenMm: 45, breiteMm: 85, hoeheMm: 45, vermerkzoneMm: 17.7, anschriftzoneMm: 27.3 })
    expect(DIN5008.infoblock).toMatchObject({ linksMm: 125, obenMm: 50, breiteMaxMm: 75 })
    // Ab dem oberen Druckrand (15 mm): Briefkopf 30 mm, Anschriftzone ab 47,7 mm, Kopfbereich bis 75 mm
    expect(KOPF.briefkopfMm).toBe(30)
    expect(KOPF.anschriftzoneObenMm).toBe(47.7)
    expect(KOPF.kopfbereichMm).toBe(75)
    expect(KOPF.infoLinksMm).toBe(100)
    expect(KOPF.infoBreiteMm).toBe(65)
  })

  it('Leerzeilen in ganzen Zeilen der Brieftextschrift (11–12 pt)', () => {
    expect(DIN5008.schriftPt).toBeGreaterThanOrEqual(11)
    expect(DIN5008.schriftPt).toBeLessThanOrEqual(12)
    expect(ZEILE_PT).toBeCloseTo(13.2)
    expect(leerPt(2)).toBeCloseTo(26.4)
    expect(leerTwips(1)).toBe(264)
    expect(DIN5008.leerzeilen).toEqual({ vorBetreff: 2, nachBetreff: 2, nachAnrede: 1, zwischenAbsaetzen: 1, vorGruss: 1, unterschrift: 3, vorAbschnitt: 2 })
  })

  it('Zeile im Anschriftfeld statt einer Anschrift', () => {
    expect(empfaengerZeile('6b')).toBe('An die Eltern und Erziehungsberechtigten der Klasse 6b')
    expect(empfaengerZeile('Klasse 7a')).toBe('An die Eltern und Erziehungsberechtigten der Klasse 7a')
    expect(empfaengerZeile('')).toBe('An die Eltern und Erziehungsberechtigten')
  })

  it('HTML: Ränder, Abstände, Betreff fett ohne „Betreff:", Schnittlinie vor dem Abschnitt', () => {
    const html = briefHtml(brief(), kopf)
    expect(html).toContain('@page { size: A4; margin: 15mm 20mm 20mm 25mm; }')
    expect(html).toContain('line-height: 13.2pt')
    expect(html).toMatch(/\.betreff \{ font-weight: bold; margin-top: 26\.4pt; \}/)
    expect(html).toMatch(/\.anrede \{ margin-top: 26\.4pt; \}/)
    expect(html).toMatch(/\.absatz \+ \.absatz \{ margin-top: 13\.2pt; \}/)
    expect(html).toMatch(/\.ohne-unterschrift \{ height: 39\.6pt; \}/)
    expect(html).toMatch(/\.infoblock \{ position: absolute; top: 35mm; left: 100mm; width: 65mm; \}/)
    expect(html).toContain('<p class="anschrift">An die Eltern und Erziehungsberechtigten der Klasse 6b</p>')
    expect(html).toContain('<p class="betreff">Wandertag</p>')
    expect(html).not.toMatch(/Betreff:/)
    expect(html.indexOf('class="schnitt"')).toBeLessThan(html.indexOf('class="rl-titel"'))
    expect(html).toContain('<p class="infoblock ortdatum">Bremerhaven, 9. Oktober 2026</p>')
  })

  it('Word: Ränder in Twips, feste Zeilenhöhe, Leerzeilen als Abstand davor, Kopf mit festen Höhen', async () => {
    const zip = await JSZip.loadAsync(await briefDocx(brief(), { ...kopf, funktion: 'Klassenleitung 6b' }))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toMatch(/<w:pgMar [^>]*w:left="1417"/)
    expect(xml).toMatch(/<w:pgMar [^>]*w:right="1134"/)
    expect(xml).toMatch(/w:line="264" w:lineRule="exact"/)
    expect(xml).toContain('w:before="528"')
    expect(xml).toContain('w:before="792"')
    expect(xml).toMatch(/<w:trHeight [^>]*w:hRule="exact"/)
    expect(xml).toContain('An die Eltern und Erziehungsberechtigten der Klasse 6b')
    expect(xml).toContain('Klassenleitung 6b')
    expect(xml).not.toContain('**')
  })
})

describe('Fettdruck', () => {
  it('nur fett erlaubt: HTML, Kursiv, Rauten und unpaarige Sterne fallen weg', () => {
    expect(bereinigeFett('<b>Hallo</b> *kursiv* und **fett**')).toBe('Hallo kursiv und **fett**')
    expect(bereinigeFett('# Titel\nText')).toBe('Titel\nText')
    expect(bereinigeFett('**offen und **zu** ')).toBe('**offen und **zu ')
    expect(bereinigeFett('***dreifach***')).toBe('**dreifach**')
    expect(bereinigeFett('Unterschrift: ______ Klasse: ______')).toBe('Unterschrift: ______ Klasse: ______')
    expect(fettZahl('**a** b **c**')).toBe(2)
    expect(bereinigeFett('bis **5. Oktober** **5 €** mit')).toBe('bis **5. Oktober** **5 €** mit')
    expect(bereinigeFett('**a****b** und ** ** leer')).toBe('**ab** und   leer')
  })

  it('HTML maskiert alles, nur <strong> bleibt', () => {
    expect(fettHtml('**a < b** & mehr')).toBe('<strong>a &lt; b</strong> &amp; mehr')
    // Tags fallen ganz weg, leeres Fett ebenso
    expect(fettHtml('**<script>** & mehr')).toBe(' &amp; mehr')
  })

  it('briefAus entfernt Fett aus Betreff, Anrede und Gruß, behält es in Absätzen und Rücklaufzeilen', () => {
    const t = briefAus(
      { betreff: '**Wandertag**', anrede: '**Liebe Eltern,**', absaetze: ['Am **12.10.** <i>los</i>'], gruss: '**Gruß**', ruecklaufTitel: '**R**', ruecklaufZeilen: ['bis **5.10.**'] },
      true
    )
    expect(t.betreff).toBe('Wandertag')
    expect(t.anrede).toBe('Liebe Eltern,')
    expect(t.gruss).toBe('Gruß')
    expect(t.absaetze[0]).toBe('Am **12.10.** los')
    expect(t.ruecklauf).toEqual({ titel: 'R', zeilen: ['bis **5.10.**'] })
  })

  it('Fett in PDF und Word', async () => {
    const html = briefHtml(brief(), kopf)
    expect(html).toContain('Am <strong>Montag, 19.10.2026</strong> wandern wir.')
    const zip = await JSZip.loadAsync(await briefDocx(brief(), kopf))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toMatch(/<w:b\/>.*?<w:t[^>]*>Montag, 19\.10\.2026<\/w:t>/)
  })

  it('der Auftrag verlangt sparsamen Fettdruck und die Frist auf dem Abschnitt', () => {
    const u = briefAnfrage(brief(), 'Schule').user
    expect(u).toMatch(/FETTDRUCK: Markiere das Wichtigste mit \*\*…\*\*/)
    expect(u).toMatch(/Höchstens 6–8 fette Stellen/)
    expect(u).toContain('Bitte bis **Fr, 16.10.** zurückgeben.')
  })
})

describe('Rückgabefrist', () => {
  it('Kurzform und Erkennung in allen Schreibweisen', () => {
    expect(fristKurz('2026-10-17')).toBe('Sa, 17.10.')
    expect(fristKurz('2026-10-16')).toBe('Fr, 16.10.')
    const m = fristMuster('2026-10-16')!
    for (const t of ['16.10.', '16.10.2026', 'Freitag, 16.10.2026', '16. Oktober', 'Fr, 16.10.']) expect(m.test(t), t).toBe(true)
    for (const t of ['6.10.', '116.10.', '16.1.', '16.11.']) expect(m.test(t), t).toBe(false)
  })

  it('fett UND unterstrichen – andere fette Stellen nur fett', async () => {
    const html = briefHtml(brief(), kopf)
    expect(html).toContain('<strong><u>16.10.</u></strong>')
    expect(html).toContain('<strong><u>Fr, 16.10.</u></strong>')
    expect(html).toContain('<strong>8:00 Uhr</strong>')
    expect(stuecke('bis **16.10.**', fristMuster('2026-10-16'))).toEqual([
      { text: 'bis ', fett: false, unterstrichen: false },
      { text: '16.10.', fett: true, unterstrichen: true }
    ])
    const zip = await JSZip.loadAsync(await briefDocx(brief(), kopf))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toMatch(/<w:u w:val="single"\/>.*?<w:t[^>]*>16\.10\.<\/w:t>/)
  })

  it('ohne Rücklaufzettel keine Unterstreichung', () => {
    const b = brief()
    b.meta.ruecklauf = false
    expect(briefHtml(b, kopf)).not.toContain('<u>')
  })

  it('Nachprüfung: Frist fett und als Zeile auf dem Abschnitt, auch wenn die KI sie vergaß', () => {
    const t = briefNachbereiten(
      {
        betreff: 'Wandertag',
        anrede: 'Liebe Eltern,',
        absaetze: ['Bitte geben Sie den Abschnitt bis Freitag, 16.10.2026 zurück.'],
        gruss: 'Mit freundlichen Grüßen',
        ruecklauf: { titel: 'Rückmeldung', zeilen: ['☐ [Name des Kindes] nimmt teil.'] }
      },
      '2026-10-16'
    )
    expect(t.absaetze[0]).toBe('Bitte geben Sie den Abschnitt bis **Freitag, 16.10.2026** zurück.')
    expect(t.ruecklauf!.zeilen[0]).toBe('Bitte bis **Fr, 16.10.** zurückgeben.')
    // Steht die Frist schon auf dem Abschnitt, keine zweite Zeile
    const zwei = briefNachbereiten(t, '2026-10-16')
    expect(zwei.ruecklauf!.zeilen.length).toBe(2)
  })
})

describe('Nachprüfung des Fettdrucks', () => {
  const roh = {
    betreff: 'Elternabend',
    anrede: 'Liebe Eltern,',
    absaetze: [
      'Der Elternabend ist am Dienstag, 20.10.2026 um 19:30 Uhr in Raum 104.',
      'Für das Material sammeln wir 12,50 € ein. Die Fahrt am 3. November kostet 25 Euro, Abfahrt 7.45 Uhr.',
      'Am 4.11. und 5.11. sowie am 6.11. und 9.11. finden die Gespräche um 14 Uhr statt.'
    ],
    gruss: 'Mit freundlichen Grüßen'
  }

  it('ergänzt Datum, Uhrzeit und Beträge, wenn die KI wenig markiert hat – bis zur Obergrenze', () => {
    const t = briefNachbereiten(roh)
    expect(t.absaetze[0]).toBe('Der Elternabend ist am **Dienstag, 20.10.2026** um **19:30 Uhr** in Raum 104.')
    expect(t.absaetze[1]).toContain('**12,50 €**')
    expect(t.absaetze[1]).toContain('**3. November**')
    const gesamt = t.absaetze.reduce((s, a) => s + fettZahl(a), 0)
    expect(gesamt).toBe(FETT_HOECHSTENS)
  })

  it('lässt einen gut markierten Brief unverändert', () => {
    const gut = {
      ...roh,
      absaetze: ['Am **Dienstag, 20.10.2026** um **19:30 Uhr** in **Raum 104**.', 'Kosten: **12,50 €**. Fahrt am 3. November.', 'Gespräche am 4.11.']
    }
    expect(briefNachbereiten(gut).absaetze).toEqual(gut.absaetze)
  })

  it('markiert nichts mitten in anderen Zahlen und nichts doppelt', () => {
    const t = briefNachbereiten({ ...roh, absaetze: ['Telefon 0471 12345, Raum 3.14, am **20.10.** und 21.10.'] })
    expect(t.absaetze[0]).toBe('Telefon 0471 12345, Raum 3.14, am **20.10.** und **21.10.**')
  })
})

describe('Schuldaten aus dem Schulverzeichnis', () => {
  const treffer = { strasse: 'Humboldtstraße 12-14', plz: '27570', ort: 'Bremerhaven', telefon: '0471 483670' }

  it('leere Felder werden gefüllt', () => {
    expect(verzeichnisAbgleich({}, treffer)).toEqual({ gefuellt: treffer, abweichend: [] })
    expect(verzeichnisAbgleich({ strasse: '  ', ort: 'Bremerhaven' }, treffer).gefuellt).toEqual({ strasse: 'Humboldtstraße 12-14', plz: '27570', telefon: '0471 483670' })
  })

  it('gefüllte Felder bleiben; Abweichungen werden nur gemeldet', () => {
    const r = verzeichnisAbgleich({ strasse: 'Hafenstraße 1', plz: '27570', ort: 'Bremerhaven', telefon: '0471/483670' }, treffer)
    expect(r.gefuellt).toEqual({})
    expect(r.abweichend).toEqual([{ feld: 'strasse', bisher: 'Hafenstraße 1', verzeichnis: 'Humboldtstraße 12-14' }])
    // „Humboldtstr. 12-14" ist keine Abweichung
    expect(verzeichnisAbgleich({ strasse: 'Humboldtstr. 12-14' }, treffer).abweichend).toEqual([])
  })

  it('Leeres im Verzeichnis löscht nichts', () => {
    const r = verzeichnisAbgleich({ telefon: '0471 1' }, { ...treffer, telefon: '' })
    expect(r.abweichend).toEqual([])
    expect(verzeichnisUebernehmen({ ...treffer, telefon: '' })).toEqual({ strasse: 'Humboldtstraße 12-14', plz: '27570', ort: 'Bremerhaven' })
  })

  it('Briefkopf: Schule des Servers füllt nur, was die Lehrkraft leer gelassen hat', () => {
    const schule = { name: 'Gymnasium Wesermünde', strasse: 'Humboldtstraße 12-14', plz: '27570', ort: 'Bremerhaven', telefon: '0471 483670', email: 'info@gw.de' }
    const k = kopfMitSchule({ schule: '', logo: null, ort: 'Langen', telefon: '' }, schule, 'data:image/png;base64,x')
    expect(k).toMatchObject({ schule: 'Gymnasium Wesermünde', strasse: 'Humboldtstraße 12-14', ort: 'Langen', telefon: '0471 483670', email: 'info@gw.de', logo: 'data:image/png;base64,x' })
    expect(kopfMitSchule({ schule: 'Eigene', logo: 'eigen' }, schule, 'server')).toMatchObject({ schule: 'Eigene', logo: 'eigen' })
    expect(kopfMitSchule({ schule: 'X', logo: null }, null)).toEqual({ schule: 'X', logo: null })
  })
})
