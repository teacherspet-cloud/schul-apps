import { describe, expect, it } from 'vitest'
import { boegenDocx, boegenHtml } from '../src/renderer/src/modules/rueckmeldung/ausgabe'
import {
  absatzFolge,
  absatzHoeheMm,
  absatzTeilen,
  blattHtml,
  blattModell,
  kastenAbschnitte,
  markenStil,
  mitName,
  notizGruppen,
  ohneName,
  SEITEN_HOEHE_MM,
  teilblockMaxMm,
  seitenUmbrueche
} from '../src/renderer/src/modules/rueckmeldung/blattLayout'
import { bogenStatus, ladeOffen, merkeOffen, passtZurSuche } from '../src/renderer/src/modules/rueckmeldung/steps/bogenListe'
import {
  stelleAnfrage,
  stelleAuftragsSchluessel,
  stelleAus,
  stelleEinsetzen,
  stelleSchema,
  type Stelle
} from '../src/renderer/src/modules/rueckmeldung/feedbackUeberarbeiten'
import type { Abgabe, Bogen, Rueckmeldung, RueckmeldungMeta } from '../src/renderer/src/modules/rueckmeldung/model/types'
import { STANDARD_ZEICHEN } from '../src/renderer/src/shared/korrekturzeichen'

/*
 * Das A4-Blatt der Rückmeldung (29.09.2026, Wunsch der Lehrkraft): Schülertext oben mit
 * Korrekturrand, Feedback darunter, Ausdruck = Ansicht; Zauberstab für einzelne Stellen.
 */
const meta = (over: Partial<RueckmeldungMeta> = {}): RueckmeldungMeta => ({
  title: '',
  subjectId: 'deutsch',
  subjectLabel: 'Deutsch',
  grade: 7,
  stateId: 'NI',
  schoolTypeId: 'gymnasium',
  schoolTypeName: 'Gymnasium',
  anrede: 'du',
  schwerpunkt: '',
  formen: ['schriftlich', 'tipps', 'rand', 'ueberarbeitung'],
  einstufung: 'noteTendenz',
  ...over
})

const bogen = (over: Partial<Bogen> = {}): Bogen => ({
  staerken: ['S1 nennt gleich zu Beginn ein klares Anliegen.'],
  schritte: ['Ergänze zu jedem Argument ein Beispiel.'],
  kriterien: [
    { kriterium: 'Anliegen', einschaetzung: 'sicher', beleg: 'Handyverbot ist falsch' },
    { kriterium: 'Argumente', einschaetzung: 'teilweise' }
  ],
  schluss: 'Weiter so, S1!',
  gesamt: { anteil: 80, wert: '2−' },
  ueberarbeitung: { zitat: 'Wir brauchen das Handy', auftrag: 'Begründe mit einem Beispiel.' },
  rand: [
    { id: 'r1', zitat: 'Handyverbot ist falsch', text: 'Klare These', art: 'lob' },
    { id: 'r2', zitat: 'Unterricht', text: 'Beispiel ergänzen', art: 'hinweis' },
    { id: 'r3', zitat: 'dargestelt', text: 'dargestellt', art: 'fehler', zeichen: 'R' },
    { id: 'r4', zitat: 'total krass', text: 'sachlicher', art: 'fehler', zeichen: 'A' }
  ],
  ...over
})

const abgabe = (over: Partial<Abgabe> = {}): Abgabe => ({
  id: 'a1',
  kuerzel: 'S1',
  name: 'Lea Schmidt',
  dateiname: 'x',
  text: 'Ich finde, das Handyverbot ist falsch. Wir brauchen das Handy für den Unterricht.\nEs wird total krass dargestelt.',
  bilder: [],
  bogen: bogen(),
  ...over
})

const doc = (m: Partial<RueckmeldungMeta> = {}, a: Abgabe = abgabe()): Rueckmeldung => ({
  version: 1,
  meta: meta(m),
  grundlage: { art: 'frei', titel: 'Leserbrief zum Handyverbot', aufgaben: 'Schreibe einen Leserbrief.' },
  abgaben: [a],
  createdAt: ''
})

describe('Blatt: Modell und Ausdruck', () => {
  it('Kopf mit Titel und Name; Einstufung im Ausdruck erst nach der Bestätigung, in der Ansicht als Vorschlag', () => {
    const r = doc()
    const druck = blattModell(r, r.abgaben[0])
    expect(druck.kopf).toMatchObject({ titel: 'Leserbrief zum Handyverbot', name: 'Lea Schmidt', einstufung: null })
    const ansicht = blattModell(r, r.abgaben[0], { ansicht: true })
    expect(ansicht.kopf.einstufung).toMatchObject({ wert: '2−', text: 'gut', bestaetigt: false, skala: 'Note' })
    r.abgaben[0].bogen!.gesamt!.bestaetigt = true
    expect(blattModell(r, r.abgaben[0]).kopf.einstufung).toMatchObject({ wert: '2−', bestaetigt: true })
  })

  it('Schülertext in Absätzen, Randnotizen je Absatz, Anstreichen nach Art und Zeichen', () => {
    const r = doc()
    const md = blattModell(r, r.abgaben[0], { zeichen: STANDARD_ZEICHEN.deutsch })
    expect(md.absaetze).toHaveLength(2)
    expect(md.absaetze![0].notizen.map((g) => g.k.id)).toEqual(['r1', 'r2'])
    expect(md.absaetze![1].notizen.map((g) => g.k.id)).toEqual(['r4', 'r3'])
    expect(markenStil({ art: 'lob' })).toBe('lob')
    expect(markenStil({ art: 'fehler', zeichen: 'A' })).toBe('wellig')
    expect(markenStil({ art: 'fehler', zeichen: 'R' })).toBe('fehler')
    expect(md.legende[0]).toMatch(/A = Ausdruck.*R = Rechtschreibung|R = Rechtschreibung.*A = Ausdruck/)
  })

  it('Druck-HTML: Text oben, Lob grün mit Häkchen, Wellenlinie, Verbesserung am Rand, Kasten darunter in fester Reihenfolge', () => {
    const r = doc()
    r.abgaben[0].bogen!.gesamt!.bestaetigt = true
    const html = blattHtml(r, r.abgaben[0], { zeichen: STANDARD_ZEICHEN.deutsch })
    expect(html).toMatch(/<span class="bl-m lob">Handyverbot ist falsch<\/span><sup class="bl-nr-t lob">✓1<\/sup>/)
    expect(html).toMatch(/<span class="bl-m wellig">total krass<\/span>/)
    expect(html).toMatch(/<div class="bl-notiz lob"><span class="bl-nr">1<\/span><span class="bl-haken">✓<\/span>Klare These/)
    expect(html).toMatch(/<span class="bl-zeichen">R:<\/span>dargestellt/)
    expect(html).toMatch(/Rückmeldung für Lea Schmidt/)
    // Namen statt Kürzel – erst im Ausdruck
    expect(html).toMatch(/Lea Schmidt nennt gleich zu Beginn/)
    expect(html).not.toMatch(/\bS1\b/)
    const reihe = ['bl-kopf', 'bl-abs', 'Das gelingt dir schon', 'Deine nächsten Schritte', 'Worauf es ankam', 'Dein Überarbeitungsauftrag', 'bl-schluss'].map((x) => html.indexOf(x))
    expect(reihe.every((x) => x >= 0)).toBe(true)
    expect([...reihe].sort((x, y) => x - y)).toEqual(reihe)
  })

  it('das Druckdokument hat Seitenränder, Randlinie und dasselbe CSS wie die Ansicht', () => {
    const r = doc()
    const html = boegenHtml(r, r.abgaben)
    expect(html).toMatch(/@page \{ size: A4; margin: 15mm 12mm 15mm 18mm; \}/)
    expect(html).toMatch(/<div class="bl-randlinie"><\/div>/)
    expect(html).toMatch(/"Ink Free"/)
    expect(html).toMatch(/break-inside: avoid/)
  })

  it('Scans: Bild mit Markern, Notizen der Seite am Rand', () => {
    const a = abgabe({
      scans: ['data:image/png;base64,AA', 'data:image/png;base64,BB'],
      bogen: bogen({
        rand: [
          { id: 'x', zitat: '', text: 'Gut', art: 'lob', seite: 1, x: 20, y: 30 },
          { id: 'y', zitat: '', text: 'Komma', art: 'fehler', zeichen: 'Z', seite: 0, x: 50, y: 60 }
        ]
      })
    })
    const r = doc({}, a)
    const md = blattModell(r, a)
    expect(md.absaetze).toBeNull()
    expect(md.scans?.map((s) => s.notizen.map((g) => g.nr))).toEqual([[1], [2]])
    const html = blattHtml(r, a)
    expect(html).toMatch(/<span class="bl-marker fehler" style="left:50%;top:60%">1<\/span>/)
    expect(html).toMatch(/<span class="bl-marker lob" style="left:20%;top:30%">2<\/span>/)
  })

  it('Ansicht zeigt leere Abschnitte zum Ausfüllen, der Ausdruck nicht', () => {
    const r = doc({}, abgabe({ bogen: bogen({ staerken: [], schluss: undefined, ueberarbeitung: undefined }) }))
    expect(kastenAbschnitte(r, r.abgaben[0]).map((x) => x.art)).toEqual(['schritte', 'kriterien'])
    expect(kastenAbschnitte(r, r.abgaben[0], true).map((x) => x.art)).toEqual(['staerken', 'schritte', 'kriterien', 'ueberarbeitung', 'schluss'])
  })

  it('Seitenumbruch wie im Druck: Blöcke werden nicht zerteilt', () => {
    expect(seitenUmbrueche([100, 300, 200, 50], 500)).toEqual([{ index: 2, rest: 100 }])
    expect(seitenUmbrueche([100, 700, 100], 500)).toEqual([
      { index: 1, rest: 400 },
      { index: 2, rest: 0 }
    ])
    expect(seitenUmbrueche([], 500)).toEqual([])
  })

  it('sehr langer Absatz (Bericht der Lehrkraft): Teilblöcke, keiner über der Seitenhöhe, Text und Notizen vollständig', () => {
    // Ein einziger Absatz von mehreren Seiten, mittendrin eine lange Zeichenkette ohne Leerzeichen
    const satz = 'Wir brauchen das Handy für den Unterricht, weil man damit schnell etwas nachschlagen kann. '
    const base64 = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo'.repeat(60)
    const text = `Ich finde, das Handyverbot ist falsch. ${satz.repeat(60)}${base64} Es wird total krass dargestelt. ${satz.repeat(40)}`
    const a = abgabe({ text })
    const r = doc({}, a)
    const md = blattModell(r, a)
    expect(md.absaetze!.length).toBeGreaterThan(3)
    for (const abs of md.absaetze!) {
      const h = absatzHoeheMm(abs.teile.map((t) => t.text).join('').length, abs.notizen)
      expect(h).toBeLessThanOrEqual(teilblockMaxMm())
    }
    // Nichts geht verloren, nichts doppelt
    expect(md.absaetze!.map((x) => x.teile.map((t) => t.text).join('')).join('')).toBe(text)
    expect(md.absaetze!.flatMap((x) => x.notizen.map((g) => g.k.id)).sort()).toEqual(['r1', 'r2', 'r3', 'r4'])
    // Jede Notiz steht im Teilblock ihrer Nummer
    for (const abs of md.absaetze!) for (const g of abs.notizen) expect(abs.teile.some((t) => t.nr === g.nr)).toBe(true)
    // Die erste Randnotiz steht im ersten Teilblock – direkt unter dem Kopf, Seite 1 bleibt nicht leer
    expect(md.absaetze![0].notizen.map((g) => g.k.id)).toContain('r1')
    // Geschnitten wird nach Satzenden (außer in der Zeichenkette ohne Leerzeichen)
    const enden = md.absaetze!.slice(0, -1).map((x) => x.teile.map((t) => t.text).join(''))
    expect(enden.every((t) => /[.!?]\s*$/.test(t) || /[A-Za-z0-9]$/.test(t))).toBe(true)
    expect(enden.filter((t) => /[.!?]\s*$/.test(t)).length).toBeGreaterThanOrEqual(5)
    // Druck: jeder Teilblock ein eigener Block; Absätze dürfen im Druck umbrechen (orphans/widows)
    const html = blattHtml(r, a)
    expect(html.match(/class="bl-block bl-abs"/g)?.length).toBe(md.absaetze!.length)
    expect(boegenHtml(r, [a])).toMatch(/\.bl-abs, \.bl-ohne, \.bl-k \{ break-inside: auto; page-break-inside: auto; orphans: 2; widows: 2; \}/)
    expect(boegenHtml(r, [a])).toMatch(/overflow-wrap: anywhere/)
    // Seitenumbruch der Ansicht: Kopf (~35 mm) und erster Teilblock stehen auf Seite 1
    const hoehen = [35, ...md.absaetze!.map((x) => absatzHoeheMm(x.teile.map((t) => t.text).join('').length, x.notizen))]
    const umbrueche = seitenUmbrueche(hoehen, SEITEN_HOEHE_MM)
    expect(umbrueche[0].index).toBeGreaterThan(1)
    expect(Math.max(...hoehen)).toBeLessThan(SEITEN_HOEHE_MM)
  })

  it('Teilen: kurze Absätze bleiben ganz, eine Stelle über dem Schnitt bleibt angestrichen, Nummer am Ende', () => {
    const kurz = [{ text: 'Kurz.' }]
    expect(absatzTeilen(kurz, [])).toEqual([{ teile: kurz, notizen: [] }])
    const lang = 'Wort '.repeat(400)
    const k = { nr: 1, k: { id: 'x', zitat: '', text: 'Notiz', art: 'fehler' as const } }
    const teile = absatzTeilen([{ text: lang.slice(0, 1000) }, { text: lang.slice(1000, 1400), art: 'fehler', nr: 1 }, { text: lang.slice(1400) }], [k], false, 80)
    expect(teile.length).toBeGreaterThan(1)
    const marken = teile.flatMap((x) => x.teile.filter((t) => t.art))
    expect(marken.length).toBeGreaterThan(1)
    expect(marken.filter((t) => t.nr === 1)).toHaveLength(1)
    expect(marken[marken.length - 1].nr).toBe(1)
    const mitNotiz = teile.find((x) => x.notizen.length)!
    expect(mitNotiz.teile.some((t) => t.nr === 1)).toBe(true)
    // Viele Notizen ohne Stelle: in Gruppen unter der Höchsthöhe
    const viele = Array.from({ length: 60 }, (_, i) => ({ nr: i + 1, k: { id: `n${i}`, zitat: '', text: 'Eine längere Randnotiz mit etwas Text darin.', art: 'hinweis' as const } }))
    const gruppen = notizGruppen(viele)
    expect(gruppen.length).toBeGreaterThan(1)
    expect(gruppen.flat()).toHaveLength(60)
  })

  it('Randnotiz auf der Höhe ihrer Zeile: direkt hinter der Stelle, als Float in den Rand; Kasten in der Textspalte', () => {
    const r = doc()
    const md = blattModell(r, r.abgaben[0])
    const folge = absatzFolge(md.absaetze![0].teile, md.absaetze![0].notizen)
    // Hinter jeder nummerierten Stelle folgt ihre Notiz
    folge.forEach((x, i) => {
      if ('notiz' in x) {
        const davor = folge[i - 1]
        expect(davor && 'teil' in davor ? davor.teil.nr : davor && 'notiz' in davor ? davor.notiz.nr : null).not.toBeNull()
      }
    })
    const html = blattHtml(r, r.abgaben[0])
    expect(html).toMatch(/<sup class="bl-nr-t lob">✓1<\/sup><div class="bl-notiz lob"><span class="bl-nr">1<\/span>/)
    expect(html).not.toMatch(/bl-abs"><div class="bl-text">[^]*?<\/div><div class="bl-rand">/)
    const css = boegenHtml(r, r.abgaben)
    expect(css).toMatch(/\.bl-abs \.bl-text \{ display: flow-root; width: 124mm; \}/)
    expect(css).toMatch(/\.bl-abs \.bl-notiz \{ float: right; clear: right; width: 52mm;/)
    expect(css).toMatch(/-59\.5mm 1\.5mm 7\.6mm; \}/)
    expect(css).toMatch(/\.bl-k, \.bl-fuss \{ max-width: 120\.5mm; \}/)
  })

  it('ältere Abgaben mit HTML aus Word: auf dem Blatt steht nur der Text', () => {
    const a = abgabe({ text: '<p>Ich finde, das Handyverbot ist <strong>falsch</strong>.</p><p>Es wird total krass dargestelt.</p>' })
    const r = doc({}, a)
    const md = blattModell(r, a)
    const text = md.absaetze!.map((x) => x.teile.map((t) => t.text).join(''))
    expect(text).toEqual(['Ich finde, das Handyverbot ist falsch.', 'Es wird total krass dargestelt.'])
    expect(blattHtml(r, a)).not.toMatch(/&lt;p&gt;|<p>Ich/)
  })

  it('Namen: Anzeige mit Namen, gespeichert mit Kürzel', () => {
    const a = abgabe({ pseudonyme: [{ kuerzel: 'S1-P1', name: 'Jonas' }] })
    expect(mitName('S1 und S1-P1', a)).toBe('Lea Schmidt und Jonas')
    expect(ohneName('Lea Schmidt und Jonas, Lea', a)).toBe('S1 und S1-P1, S1')
  })

  it('Word: das Blatt entsteht ohne Fehler', async () => {
    const r = doc()
    const bytes = await boegenDocx(r, r.abgaben, { zeichen: STANDARD_ZEICHEN.deutsch })
    expect(bytes.length).toBeGreaterThan(1000)
  })
})

describe('Liste der Rückmeldungen: Suche und Status', () => {
  it('Suche nach Name und Kürzel – groß/klein egal, Umlaute tolerant', () => {
    const a = { name: 'Jürgen Öztürk', kuerzel: 'S7' }
    for (const q of ['', 'jürgen', 'JUERGEN', 'jurgen', 'öztürk', 'oeztuerk', 'ozturk', 'Jürgen Ö', 's7']) expect(passtZurSuche(a, q)).toBe(true)
    for (const q of ['lea', 'S8', 'xyz']) expect(passtZurSuche(a, q)).toBe(false)
    expect(passtZurSuche({ name: 'Manuel Groß', kuerzel: 'S2' }, 'manu')).toBe(true)
    expect(passtZurSuche({ name: 'Manuel Groß', kuerzel: 'S2' }, 'gross')).toBe(true)
    expect(passtZurSuche({ name: '', kuerzel: 'S12' }, 's1')).toBe(true)
  })

  it('Status: ohne Bogen, Einstufung offen, fertig; Aufklappzustand ohne Speicher kein Fehler', () => {
    const m = meta()
    expect(bogenStatus(m, abgabe({ bogen: undefined }))).toBe('ohne')
    expect(bogenStatus(m, abgabe())).toBe('offen')
    expect(bogenStatus(m, abgabe({ bogen: bogen({ gesamt: { anteil: 80, wert: '2', bestaetigt: true } }) }))).toBe('fertig')
    expect(bogenStatus(meta({ einstufung: 'keine' }), abgabe())).toBe('fertig')
    // In den Tests gibt es kein sessionStorage: leer statt Absturz
    expect(ladeOffen('x')).toEqual([])
    expect(() => merkeOffen('x', ['a'])).not.toThrow()
  })
})

describe('Zauberstab: einzelne Stellen', () => {
  const ctx = { zeichen: STANDARD_ZEICHEN.deutsch, schwellen: [91, 78, 64, 50, 25, 0] }
  const skala = { meta: meta(), schwellen: ctx.schwellen }

  it('Anfrage: nur die Stelle, Kontext wie beim Bogen, keine Namen – auch nicht aus Hinweis oder Handeingaben', () => {
    const a = abgabe({ bogen: bogen({ schluss: 'Toll gemacht, Lea!' }) })
    const r = doc({ schwerpunkt: 'Argumente' }, a)
    const req = stelleAnfrage(r, a, { art: 'schluss' }, 'hinweis', 'Für Lea freundlicher', 'SYS', ctx)
    expect(req.schemaName).toBe('rueckmeldung_stelle')
    expect(req.system).toBe('SYS')
    expect(req.user).toMatch(/HINWEIS DER LEHRKRAFT: Für S1 freundlicher/)
    expect(req.user).toMatch(/BISHERIGE FASSUNG DIESER STELLE:\nToll gemacht, S1!/)
    expect(req.user).toMatch(/ÜBRIGE RÜCKMELDUNG/)
    expect(req.user).toMatch(/ARBEIT VON S1:/)
    expect(req.user).toMatch(/KEINE Note/)
    expect(req.user).toMatch(/SCHWERPUNKT DER LEHRKRAFT: Argumente/)
    expect(req.user).not.toMatch(/Lea|Schmidt/)
    expect(Object.keys((req.schema as { properties: Record<string, unknown> }).properties)).toEqual(['schluss'])
    expect(stelleAnfrage(r, a, { art: 'staerken' }, 'neu', '', 'SYS', ctx).user).toMatch(/GANZ NEU/)
    expect(stelleAnfrage(r, a, { art: 'staerken' }, 'ueberarbeiten', '', 'SYS', ctx).user).toMatch(/Verbessere die bisherige Fassung/)
  })

  it('Schema je Stelle; der Kasten umfasst nur die gewählten Formen; Randnotiz mit Zeichen aus der Liste', () => {
    const r = doc()
    const a = r.abgaben[0]
    const props = (s: Stelle, rr = r): string[] => Object.keys((stelleSchema(rr, a, s, ctx) as { properties: Record<string, unknown> }).properties)
    expect(props({ art: 'kasten' })).toEqual(['staerken', 'schritte', 'kriterien', 'schluss', 'ueberarbeitung'])
    // Ein vorhandener Überarbeitungsauftrag steht auf dem Blatt – also gehört er zum Kasten
    expect(props({ art: 'kasten' }, doc({ formen: ['tipps'] }))).toEqual(['schritte', 'ueberarbeitung'])
    const rand = (stelleSchema(r, a, { art: 'rand', id: 'r3' }, ctx) as { properties: { rand: { properties: { zeichen: { enum: string[] } } } } }).properties.rand
    expect(rand.properties.zeichen.enum).toContain('R')
    expect(stelleAnfrage(r, a, { art: 'rand', id: 'r3' }, 'ueberarbeiten', '', 'S', ctx).user).toMatch(/„dargestelt“ → R: dargestellt/)
    expect(stelleAuftragsSchluessel('d', 'a1', { art: 'kriterium', index: 2 })).toBe('rueckmeldung-stelle-d-a1-kriterium-2')
  })

  it('Antwort: nur die Stelle wird ersetzt, Noten fliegen heraus, der Rest bleibt', () => {
    const r = doc()
    const a = r.abgaben[0]
    const erg = stelleAus({ staerken: ['S1 schreibt klar.', 'Das ist eine glatte Note 2.'] }, r, a, { art: 'staerken' }, skala, ctx)
    expect(erg.staerken).toEqual(['S1 schreibt klar.'])
    expect(erg.entfernt).toBe(1)
    const neu = stelleEinsetzen(a.bogen!, { art: 'staerken' }, erg, a)
    expect(neu.staerken).toEqual(['S1 schreibt klar.'])
    expect(neu.schritte).toEqual(a.bogen!.schritte)
    expect(neu.rand).toEqual(a.bogen!.rand)
    expect(neu.entfernt).toBe(1)
    // Nur Noten: nichts Brauchbares – die alte Fassung bleibt
    expect(() => stelleAus({ schluss: 'Das ist befriedigend.' }, r, a, { art: 'schluss' }, skala, ctx)).toThrow(/verworfen/)
  })

  it('Kriterium und Randnotiz: an ihrer Stelle ersetzt; ein nicht gefundenes Zitat behält die alte Stelle', () => {
    const r = doc()
    const a = r.abgaben[0]
    const k = stelleAus({ kriterium: { kriterium: 'Begründung', einschaetzung: 'noch nicht', beleg: '' } }, r, a, { art: 'kriterium', index: 1 }, skala, ctx)
    const b1 = stelleEinsetzen(a.bogen!, { art: 'kriterium', index: 1 }, k, a)
    expect(b1.kriterien.map((x) => x.kriterium)).toEqual(['Anliegen', 'Begründung'])
    const rn = stelleAus({ rand: { zitat: 'gibt es nicht', text: 'richtig: dargestellt', zeichen: 'R', art: 'fehler' } }, r, a, { art: 'rand', id: 'r3' }, skala, ctx)
    expect(rn.rand).toMatchObject({ zitat: 'dargestelt', text: 'richtig: dargestellt', zeichen: 'R' })
    const b2 = stelleEinsetzen(a.bogen!, { art: 'rand', id: 'r3' }, rn, { ausgleich: { massnahmen: ['ns-rechtschreibung'] } })
    expect(b2.rand?.find((x) => x.id === 'r3')).toMatchObject({ text: 'richtig: dargestellt', ohneWertung: true })
    expect(b2.rand?.map((x) => x.id)).toEqual(['r1', 'r2', 'r3', 'r4'])
    // Unbekanntes Zeichen fällt weg
    const rx = stelleAus({ rand: { zitat: 'Unterricht', text: 'Beispiel?', zeichen: 'XYZ', art: 'hinweis' } }, r, a, { art: 'rand', id: 'r2' }, skala, ctx)
    expect(rx.rand?.zeichen).toBeUndefined()
  })

  it('der ganze Kasten: bestätigte Einstufungen der Kriterien bleiben bei gleicher Zahl', () => {
    const r = doc({ ebene: 'beides' })
    const a = r.abgaben[0]
    a.bogen!.kriterienStufen = [
      { anteil: 90, wert: '1', bestaetigt: true },
      { anteil: 60, wert: '3', bestaetigt: true }
    ]
    const erg = stelleAus(
      {
        staerken: ['Klar.'],
        schritte: ['Beispiele ergänzen.'],
        kriterien: [
          { kriterium: 'A', einschaetzung: 'sicher', beleg: '', anteil: 50 },
          { kriterium: 'B', einschaetzung: 'sicher', beleg: '', anteil: 50 }
        ],
        schluss: 'Weiter so.',
        ueberarbeitung: { zitat: 'Wir brauchen das Handy', auftrag: 'Ein Beispiel ergänzen.' }
      },
      r,
      a,
      { art: 'kasten' },
      skala,
      ctx
    )
    const neu = stelleEinsetzen(a.bogen!, { art: 'kasten' }, erg, a)
    expect(neu.kriterien.map((x) => x.kriterium)).toEqual(['A', 'B'])
    expect(neu.kriterienStufen?.every((s) => s?.bestaetigt)).toBe(true)
    expect(neu.rand).toEqual(a.bogen!.rand)
    expect(neu.gesamt).toEqual(a.bogen!.gesamt)
  })
})
