import { describe, expect, it } from 'vitest'
import {
  einstufungGesperrt,
  gesamtAusTabelle,
  offeneBestaetigungen,
  tabellenSumme,
  vorschlag,
  wertFuerAnteil,
  type SkalenKontext
} from '../src/renderer/src/modules/rueckmeldung/art'
import { boegenHtml, fehlerprofil, uebersichtCsv } from '../src/renderer/src/modules/rueckmeldung/ausgabe'
import { bogenAnfrage, bogenAus, bogenSchema, pruefeBogen } from '../src/renderer/src/modules/rueckmeldung/generation'
import { findeZitat, randLayout, scanReihenfolge } from '../src/renderer/src/modules/rueckmeldung/korrekturrand'
import { ausgleichHinweise, einstufungsHinweise, kiLandesregeln, LAENDER } from '../src/renderer/src/modules/rueckmeldung/laenderRegeln'
import {
  ausgleichAnweisung,
  gemerkterAusgleich,
  hatNotenschutz,
  maxSchritte,
  merkeAusgleich,
  ohneDiagnosen,
  ohneRechtschreibung
} from '../src/renderer/src/modules/rueckmeldung/nachteilsausgleich'
import { tabelleAus } from '../src/renderer/src/modules/rueckmeldung/tabelle'
import type { Abgabe, Bewertungstabelle, Rueckmeldung, RueckmeldungMeta } from '../src/renderer/src/modules/rueckmeldung/model/types'
import { STANDARD_ZEICHEN, zeichenFuer } from '../src/renderer/src/shared/korrekturzeichen'
import { ohneAusgleich } from '../src/main/services/paket/paket'

/*
 * Rückmeldung 2.0 (29.09.2026, Wunsch der Lehrkraft): Formen und Einstufungen, Bewertungstabelle,
 * Korrekturrand, Kommentare am Scan, Nachteilsausgleich, Länderregeln.
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
  ...over
})

const doc = (m: Partial<RueckmeldungMeta> = {}, over: Partial<Rueckmeldung> = {}): Rueckmeldung => ({
  version: 1,
  meta: meta(m),
  grundlage: { art: 'frei', titel: 'Leserbrief', aufgaben: 'Schreibe einen Leserbrief.' },
  abgaben: [],
  createdAt: '',
  ...over
})

const abgabe = (over: Partial<Abgabe> = {}): Abgabe => ({ id: 'a1', kuerzel: 'S1', name: '', dateiname: 'x', text: 'Text', bilder: [], ...over })

const skala = (m: Partial<RueckmeldungMeta> = {}): SkalenKontext => ({ meta: meta(m), schwellen: [91, 78, 64, 50, 25, 0] })

const tabelle: Bewertungstabelle = {
  titel: 'Raster',
  kriterien: [
    { id: 'k1', bereich: 'Inhalt', kriterium: 'Anliegen', punkte: 6 },
    { id: 'k2', kriterium: 'Argumente', punkte: 4 },
    { id: 'k3', kriterium: 'Form', deskriptoren: ['a', 'b', 'c', 'd'] }
  ],
  stufen: ['voll', 'überwiegend', 'teilweise', 'nicht'],
  quelle: 'eigen'
}

describe('Skalen der Einstufung', () => {
  it('Noten folgen dem Notenschlüssel der Lehrkraft, Tendenz aus der Lage im Notenbereich', () => {
    const k = skala()
    expect(wertFuerAnteil('note', 95, k)).toBe('1')
    expect(wertFuerAnteil('note', 80, k)).toBe('2')
    expect(wertFuerAnteil('note', 10, k)).toBe('6')
    // 2 gilt von 78 bis 91 %: oberes Drittel „+", unteres „−"
    expect(wertFuerAnteil('noteTendenz', 89, k)).toBe('2+')
    expect(wertFuerAnteil('noteTendenz', 84, k)).toBe('2')
    expect(wertFuerAnteil('noteTendenz', 79, k)).toBe('2−')
    expect(wertFuerAnteil('noteTendenz', 5, k)).toBe('6')
  })

  it('++ … −−, Smileys und Ampel in festen Stufen', () => {
    const k = skala()
    expect(wertFuerAnteil('plusMinus', 90, k)).toBe('++')
    expect(wertFuerAnteil('plusMinus', 50, k)).toBe('0')
    expect(wertFuerAnteil('plusMinus', 10, k)).toBe('−−')
    expect(wertFuerAnteil('smileys', 80, k)).toBe('😀')
    expect(wertFuerAnteil('smileys', 30, k)).toBe('😐')
    expect(wertFuerAnteil('ampel', 60, k)).toBe('gelb')
  })

  it('Notenpunkte nur in der Oberstufe – Ausnahme Saarland (ab Klasse 5, je nach Tendenz)', () => {
    expect(einstufungGesperrt('notenpunkte', meta({ grade: 7 }))).toMatch(/Oberstufe/)
    expect(einstufungGesperrt('notenpunkte', meta({ grade: 12 }))).toBeNull()
    expect(einstufungGesperrt('notenpunkte', meta({ grade: 7, stateId: 'SL' }))).toBeNull()
    // Oberstufe: KMK-Raster (95 % = 15, 20 % = 1)
    expect(wertFuerAnteil('notenpunkte', 95, skala({ grade: 12 }))).toBe('15')
    expect(wertFuerAnteil('notenpunkte', 19, skala({ grade: 12 }))).toBe('0')
    // Saarland Sek I: 2+ = 12, 2 = 11, 2− = 10
    expect(wertFuerAnteil('notenpunkte', 89, skala({ grade: 7, stateId: 'SL' }))).toBe('12')
    expect(wertFuerAnteil('notenpunkte', 84, skala({ grade: 7, stateId: 'SL' }))).toBe('11')
    expect(wertFuerAnteil('notenpunkte', 79, skala({ grade: 7, stateId: 'SL' }))).toBe('10')
  })

  it('der Vorschlag ist unbestätigt; der Export wartet auf die Bestätigung', () => {
    const v = vorschlag('note', 80, skala())
    expect(v).toMatchObject({ anteil: 80, wert: '2' })
    expect(v.bestaetigt).toBeUndefined()
    const m = meta({ einstufung: 'note', ebene: 'beides' })
    expect(offeneBestaetigungen(m, { staerken: [], schritte: [], kriterien: [], gesamt: v, kriterienStufen: [v] })).toEqual([
      'Gesamteinstufung',
      'Einstufung der Kriterien'
    ])
    expect(offeneBestaetigungen(m, { staerken: [], schritte: [], kriterien: [], gesamt: { ...v, bestaetigt: true }, kriterienStufen: [{ ...v, bestaetigt: true }] })).toEqual([])
    // Ohne Einstufung gibt es nichts zu bestätigen
    expect(offeneBestaetigungen(meta(), { staerken: [], schritte: [], kriterien: [] })).toEqual([])
  })
})

describe('Bewertungstabelle', () => {
  it('Summe aus Punkten, Erfüllungsgrad mit Stufen gewichtet', () => {
    const s = tabellenSumme(tabelle, [
      { kriteriumId: 'k1', punkte: 6 },
      { kriteriumId: 'k2', punkte: 2 },
      { kriteriumId: 'k3', stufe: 0 }
    ])
    expect(s.erreicht).toBe(8)
    expect(s.moeglich).toBe(10)
    // k1 100 % (6), k2 50 % (4), k3 100 % (Gewicht = mittlere Punktzahl 5): (6 + 2 + 5) / 15
    expect(s.anteil).toBeCloseTo(86.7, 1)
    expect(s.offen).toBe(0)
  })

  it('geänderte Punkte ergeben einen neuen, wieder zu bestätigenden Vorschlag', () => {
    const g = gesamtAusTabelle(
      tabelle,
      { staerken: [], schritte: [], kriterien: [], tabelle: [{ kriteriumId: 'k1', punkte: 3 }, { kriteriumId: 'k2', punkte: 2 }, { kriteriumId: 'k3', stufe: 3 }] },
      'note',
      skala()
    )
    expect(g?.bestaetigt).toBe(false)
    expect(g?.wert).toBe('5')
  })

  it('die KI-Antwort wird zur Tabelle; ohne Stufen gelten die Standardstufen', () => {
    const t = tabelleAus({ titel: 'X', stufen: [], kriterien: [{ bereich: '', kriterium: 'Aufbau', punkte: 5, deskriptoren: [] }, { kriterium: '' }] }, 'ki')
    expect(t.kriterien).toHaveLength(1)
    expect(t.kriterien[0]).toMatchObject({ kriterium: 'Aufbau', punkte: 5 })
    expect(t.entwurf).toBe(true)
    expect(t.stufen.length).toBeGreaterThanOrEqual(2)
    expect(() => tabelleAus({ kriterien: [] }, 'datei')).toThrow()
  })
})

describe('Korrekturrand', () => {
  it('findet Zitate wörtlich, ohne Groß-/Kleinschreibung und mit anderem Leerraum', () => {
    const t = 'Ich finde das\nHandyverbot  falsch.'
    expect(findeZitat(t, 'finde das')).toEqual({ start: 4, ende: 13 })
    expect(findeZitat(t, 'ICH FINDE')).toEqual({ start: 0, ende: 9 })
    expect(findeZitat(t, 'das Handyverbot falsch')).not.toBeNull()
    expect(findeZitat(t, 'gibt es nicht')).toBeNull()
  })

  it('nummeriert in Textreihenfolge, ordnet Absätzen zu, verliert keinen Kommentar', () => {
    const text = 'Erster Satz mit Fehlr.\nZweiter Absatz ist gut.'
    const l = randLayout(text, [
      { id: 'b', zitat: 'ist gut', text: 'Schön', art: 'lob' },
      { id: 'a', zitat: 'Fehlr', text: 'Rechtschreibung', art: 'fehler', zeichen: 'R' },
      { id: 'c', zitat: 'erfunden', text: 'ohne Stelle', art: 'hinweis' }
    ])
    expect(l.absaetze).toHaveLength(2)
    expect(l.absaetze[0].kommentare.map((g) => [g.nr, g.k.id])).toEqual([[1, 'a']])
    expect(l.absaetze[1].kommentare.map((g) => [g.nr, g.k.id])).toEqual([[2, 'b']])
    expect(l.absaetze[0].teile.find((t) => t.nr === 1)?.text).toBe('Fehlr')
    expect(l.ohneStelle.map((g) => [g.nr, g.k.id])).toEqual([[3, 'c']])
  })

  it('Scan-Kommentare nach Seite und von oben nach unten nummeriert', () => {
    const r = scanReihenfolge([
      { id: 'x', zitat: '', text: '', art: 'lob', seite: 1, y: 10 },
      { id: 'y', zitat: '', text: '', art: 'lob', seite: 0, y: 80 },
      { id: 'z', zitat: '', text: '', art: 'lob', seite: 0, y: 20 }
    ])
    expect(r.map((g) => g.k.id)).toEqual(['z', 'y', 'x'])
  })
})

describe('Nachteilsausgleich', () => {
  it('Diagnosen gehen nie an die KI – nur Maßnahmen', () => {
    expect(ohneDiagnosen('Legasthenie und ADHS laut Gutachten').entfernt.length).toBe(3)
    const text = ausgleichAnweisung({ massnahmen: ['ns-rechtschreibung', 'zeit'], eigene: 'wegen Lese-Rechtschreib-Schwäche mehr Zeit' })
    expect(text).toMatch(/NOTENSCHUTZ/)
    expect(text).toMatch(/verlängerter Bearbeitungszeit/)
    expect(text).not.toMatch(/Rechtschreib-Schwäche|Legasthen/i)
    expect(text).toMatch(/\[entfernt\]/)
    expect(ausgleichAnweisung(undefined)).toBe('')
  })

  it('Notenschutz, Rechtschreibung und Schritte werden erkannt', () => {
    expect(hatNotenschutz({ massnahmen: ['zeit'] })).toBe(false)
    expect(hatNotenschutz({ massnahmen: ['ns-form'] })).toBe(true)
    expect(ohneRechtschreibung({ massnahmen: ['diktiert'] })).toBe(true)
    expect(maxSchritte({ massnahmen: ['kleinschrittig'] })).toBe(2)
    expect(maxSchritte(undefined)).toBe(3)
  })

  it('gemerkt je Name (ohne Groß-/Kleinschreibung), entfernbar', () => {
    let g = merkeAusgleich(null, 'Lea  Schmidt', { massnahmen: ['zeit'] }, new Date('2026-09-29'))
    expect(gemerkterAusgleich(g, 'lea schmidt')).toEqual({ massnahmen: ['zeit'] })
    expect(gemerkterAusgleich(g, 'Ben')).toBeNull()
    g = merkeAusgleich(g, 'Lea Schmidt', null)
    expect(gemerkterAusgleich(g, 'Lea Schmidt')).toBeNull()
  })

  it('verlässt im Schulpaket den Rechner nicht', () => {
    const e = ohneAusgleich({ name: 'x', payload: { abgaben: [{ id: 'a', ausgleich: { massnahmen: ['zeit'] } }] } })
    expect(JSON.stringify(e)).not.toMatch(/ausgleich/)
  })
})

describe('Bogen-Anfrage und -Antwort mit Formen und Einstufung', () => {
  const zeichen = STANDARD_ZEICHEN.deutsch

  it('das Schema enthält nur die gewählten Formen', () => {
    const r = doc({ formen: ['tipps', 'rand'], einstufung: 'note' })
    const props = (bogenSchema(r, abgabe(), { zeichen }) as { properties: Record<string, unknown> }).properties
    expect(Object.keys(props)).toEqual(expect.arrayContaining(['schritte', 'rand', 'gesamt', 'fehler']))
    expect(props.staerken).toBeUndefined()
    expect(props.ueberarbeitung).toBeUndefined()
  })

  it('Scan: Bilder gehen mit, Lage wird erfragt; Nachteilsausgleich ohne Diagnose im Auftrag', () => {
    const r = doc({ formen: ['schriftlich', 'scan'] })
    const a = abgabe({ scans: ['data:image/png;base64,AA'], ausgleich: { massnahmen: ['ns-rechtschreibung'], eigene: 'Legasthenie' } })
    const req = bogenAnfrage(r, a, 'sys', { zeichen })
    expect(req.images).toEqual(['data:image/png;base64,AA'])
    expect(req.user).toMatch(/Seite und ungefähre Lage/)
    expect(req.user).toMatch(/NOTENSCHUTZ/)
    expect(req.user).not.toMatch(/Legasthenie/)
  })

  it('ohne Einstufung bleibt es bei „keine Note"; mit Einstufung schlägt die KI nur vor', () => {
    expect(bogenAnfrage(doc(), abgabe(), 'sys').user).toMatch(/KEINE Note, KEINE Punkte/)
    expect(bogenAnfrage(doc({ einstufung: 'noteTendenz' }), abgabe(), 'sys').user).toMatch(/Lehrkraft vergibt die Einstufung/)
  })

  it('Antwort: Einstufung als Vorschlag, Tabelle summiert, Zeichen nur aus der Liste, R bei Notenschutz ohne Wertung', () => {
    const r = doc({ formen: ['schriftlich', 'tabelle', 'rand'], einstufung: 'note' }, { tabelle })
    const a = abgabe({ ausgleich: { massnahmen: ['ns-rechtschreibung'] } })
    const b = bogenAus(
      {
        staerken: ['Klar.'],
        kriterien: [],
        schluss: '',
        tabelle: [
          { id: '[k1]', punkte: 6, stufe: 0, begruendung: 'gut' },
          { id: 'k2', punkte: 9, stufe: 0, begruendung: '' },
          { id: 'k3', punkte: 0, stufe: 1, begruendung: '' }
        ],
        rand: [
          { zitat: 'Fehlr', text: 'Schreibweise', zeichen: 'R', art: 'fehler' },
          { zitat: 'gut', text: 'Toll', zeichen: 'XYZ', art: 'lob' }
        ],
        fehler: [{ kategorie: 'Rechtschreibung', beispiel: 'Fehlr' }]
      },
      r,
      a,
      { zeichen, schwellen: [91, 78, 64, 50, 25, 0] }
    )
    expect(b.tabelle?.find((w) => w.kriteriumId === 'k2')?.punkte).toBe(4)
    expect(b.gesamt?.bestaetigt).toBeUndefined()
    expect(b.gesamt?.wert).toBeTruthy()
    expect(b.rand?.[0]).toMatchObject({ zeichen: 'R', ohneWertung: true })
    expect(b.rand?.[1].zeichen).toBeUndefined()
    expect(b.fehler?.[0].kategorie).toBe('Rechtschreibung')
  })

  it('mit Einstufung bleiben Punkte im Text stehen (Tabelle), Noten nicht', () => {
    const b = pruefeBogen({ staerken: ['Du hast 5 von 6 Punkten beim Anliegen.', 'Das ist eine Note 2.'], schritte: [], kriterien: [] }, { punkteErlaubt: true })
    expect(b.staerken).toEqual(['Du hast 5 von 6 Punkten beim Anliegen.'])
    expect(b.entfernt).toBe(1)
  })
})

describe('Ausgabe', () => {
  const gesamt = { anteil: 80, wert: '2' }
  const r = doc(
    { formen: ['schriftlich', 'tipps', 'rand'], einstufung: 'note' },
    {
      abgaben: [
        abgabe({
          name: 'Lea',
          text: 'S1 schreibt einen Satz mit Fehlr.',
          ausgleich: { massnahmen: ['grossdruck', 'ns-rechtschreibung'] },
          bogen: {
            staerken: ['S1 gliedert klar.'],
            schritte: ['Belege ergänzen.'],
            kriterien: [],
            gesamt,
            rand: [{ id: 'r1', zitat: 'Fehlr', text: 'Fehler', art: 'fehler', zeichen: 'R' }],
            fehler: [{ kategorie: 'Rechtschreibung' }]
          }
        })
      ]
    }
  )

  it('unbestätigte Einstufung steht nicht im Ausdruck, bestätigte schon', () => {
    expect(boegenHtml(r, r.abgaben)).not.toMatch(/class="bl-note/)
    const bestaetigt = structuredClone(r)
    bestaetigt.abgaben[0].bogen!.gesamt = { ...gesamt, bestaetigt: true }
    // Kopf des Blatts: Wert eingekreist, Bezeichnung darunter
    expect(boegenHtml(bestaetigt, bestaetigt.abgaben)).toMatch(/<small>Note<\/small><span class="bl-note-wert">2<\/span><br><span class="bl-note-text">gut<\/span>/)
  })

  it('Korrekturrand, Legende, Großdruck – der Nachteilsausgleich selbst steht nicht auf dem Bogen', () => {
    const html = boegenHtml(r, r.abgaben, { zeichen: zeichenFuer('deutsch') })
    // Schülertext oben mit Korrekturrand: Stelle angestrichen und nummeriert, Verbesserung am Rand
    expect(html).toMatch(/<div class="bl-block bl-abs"[^>]*><div class="bl-text">Lea schreibt einen Satz mit <span class="bl-m fehler">Fehlr<\/span><sup class="bl-nr-t ">1<\/sup>/)
    expect(html).toMatch(/<div class="bl-notiz fehler"><span class="bl-nr">1<\/span><span class="bl-zeichen">R:<\/span>Fehler<\/div>/)
    expect(html.indexOf('bl-abs')).toBeLessThan(html.indexOf('bl-k erst'))
    expect(html).toMatch(/R = Rechtschreibung/)
    expect(html).toMatch(/class="blatt seite gross"/)
    expect(html).toMatch(/Lea schreibt einen Satz/)
    expect(html).not.toMatch(/Notenschutz|Nachteilsausgleich/)
  })

  it('Notenübersicht als CSV für Excel, mit NA/NS; Fehlerprofil zählt je Person', () => {
    const csv = uebersichtCsv(r)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toMatch(/Lea;S1;2;nein;;NS\+NA;Rechtschreibung/)
    expect(fehlerprofil(r)).toEqual([{ kategorie: 'Rechtschreibung', anzahl: 1, kuerzel: ['S1'], beispiele: [] }])
  })
})

describe('Länderregeln', () => {
  it('alle 16 Länder mit Hinweis und Fundstelle', () => {
    expect(Object.keys(LAENDER).sort()).toEqual(['BB', 'BE', 'BW', 'BY', 'HB', 'HE', 'HH', 'MV', 'NI', 'NW', 'RP', 'SH', 'SL', 'SN', 'ST', 'TH'])
    for (const r of Object.values(LAENDER)) {
      expect(r.notengebung.quelle).toBeTruthy()
      expect(r.ausgleich.quelle).toBeTruthy()
    }
  })

  it('warnt bei Tendenzen in Niedersachsen und fehlender Tendenz im Saarland', () => {
    expect(einstufungsHinweise(meta({ stateId: 'NI' }), 'noteTendenz').some((h) => h.warnung)).toBe(true)
    expect(einstufungsHinweise(meta({ stateId: 'SL' }), 'note').some((h) => h.warnung)).toBe(true)
    expect(einstufungsHinweise(meta({ stateId: 'BE' }), 'noteTendenz').some((h) => h.warnung)).toBe(false)
    expect(einstufungsHinweise(meta(), 'keine')).toEqual([])
  })

  it('Notenschutz in der Oberstufe: Warnung, wo er nicht zulässig ist', () => {
    expect(ausgleichHinweise(meta({ stateId: 'NI', grade: 12 }), true)[0].warnung).toBe(true)
    expect(ausgleichHinweise(meta({ stateId: 'BY', grade: 12 }), true).some((h) => h.warnung)).toBe(false)
  })

  it('der KI gehen nur Sprach- und Kommentarregeln mit', () => {
    expect(kiLandesregeln(meta({ stateId: 'NW' }), 'note')).toMatch(/Notenstufe/)
    expect(kiLandesregeln(meta({ stateId: 'SL' }), 'keine')).toMatch(/zusammenfassender Kommentar/)
  })
})
