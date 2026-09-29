import { describe, expect, it } from 'vitest'
import {
  abschnittVorschlag,
  artenFuer,
  checklisteFuer,
  hatProtokolle,
  protokollBauen,
  setzeProtokollInPruefung,
  setzeVersuchEin,
  stilVorschlag,
  stufeVorschlag,
  versuchAnfrage,
  versuchAus,
  versuchVorgabe
} from '../src/renderer/src/modules/arbeitsblatt/didactics/protokoll'
import { convertBlock } from '../src/renderer/src/modules/arbeitsblatt/generation/convert'
import { describeBlock } from '../src/renderer/src/modules/arbeitsblatt/generation/describe'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { VersuchDaten } from '../src/renderer/src/modules/arbeitsblatt/model/protokoll'
import type { Sheet, WorksheetMeta, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'

/*
 * Versuchsprotokoll (29.09.2026, Wunsch der Lehrkraft): Arten je Fach, Vorschläge nach Alter,
 * Abschnitte, Einsetzen durch die App, Lernzielkontrolle ohne Lernhilfen.
 */
const daten: VersuchDaten = {
  titel: 'Verbrennung von Kerzenwachs',
  frage: 'Was entsteht, wenn eine Kerze brennt?',
  vermutung: 'Es entsteht ein Gas.',
  geraete: ['Teelicht', 'Becherglas 250 ml'],
  chemikalien: [{ name: 'Kalkwasser', menge: '10 ml', ghs: ['GHS05'], signalwort: 'Gefahr', hSaetze: 'H318' }],
  schutz: ['brille', 'haare'],
  aufbau: 'Becherglas umgedreht über dem Teelicht',
  durchfuehrung: ['Teelicht anzünden', 'Becherglas darüber halten', 'Kalkwasser einfüllen und schütteln'],
  messgroessen: [],
  beobachtung: 'Das Glas beschlägt, das Kalkwasser wird trüb.',
  deutung: 'Es entstehen Wasser und Kohlenstoffdioxid.',
  gleichung: 'Wachs + Sauerstoff → Kohlenstoffdioxid + Wasser',
  ergebnis: 'Bei der Verbrennung entstehen Wasser und Kohlenstoffdioxid.',
  fehlerquellen: ['Glas zu kurz über der Flamme'],
  entsorgung: 'Kalkwasser in den Ausguss',
  lueckenBeobachtung: 'Das Glas ___, das Kalkwasser wird ___.',
  lueckenDeutung: 'Es entstehen ___ und ___.',
  lehrkraft: 'Schülerversuch ab Klasse 5',
  sicherheitZuPruefen: true
}

const meta = (over: Partial<WorksheetMeta> = {}): WorksheetMeta =>
  ({ subjectId: 'chemie', subjectLabel: 'Chemie', grade: 7, schoolTypeName: 'Gymnasium', topic: 'Verbrennung', ...over }) as WorksheetMeta

describe('Arten und Vorschläge', () => {
  it('Fächer mit Protokollen, Arten je Fach, Forscherbogen in der Grundschule', () => {
    expect(hatProtokolle('chemie')).toBe(true)
    expect(hatProtokolle('technik')).toBe(true)
    expect(hatProtokolle('deutsch')).toBe(false)
    expect(artenFuer('biologie', 8)).toContain('mikroskopie')
    expect(artenFuer('sachunterricht', 3)[0]).toBe('forscher')
    expect(artenFuer('physik', 3)[0]).toBe('forscher')
    expect(artenFuer('informatik', 9)[0]).toBe('test')
  })

  it('Struktur und Zeitform nach Alter; die Fachschaft legt die Zeitform ab Klasse 7 fest', () => {
    expect(stufeVorschlag(3, 'versuch')).toBe('forscher')
    expect(stufeVorschlag(6, 'versuch')).toBe('vorstrukturiert')
    expect(stufeVorschlag(10, 'versuch')).toBe('offen')
    expect(stilVorschlag(5)).toBe('ichwir')
    expect(stilVorschlag(8)).toBe('praesens')
    expect(stilVorschlag(8, 'praeteritum')).toBe('praeteritum')
    expect(stilVorschlag(5, 'praeteritum')).toBe('ichwir')
  })

  it('Chemie mit Chemikalien, Sicherheit und Entsorgung; Physik mit Messwerten und ab Kl. 7 Fehlerbetrachtung', () => {
    const ch = abschnittVorschlag('versuch', 'chemie', 8)
    expect(ch).toEqual(expect.arrayContaining(['chemikalien', 'sicherheit', 'entsorgung']))
    expect(ch.indexOf('beobachtung')).toBeLessThan(ch.indexOf('auswertung'))
    expect(abschnittVorschlag('versuch', 'physik', 8)).toEqual(expect.arrayContaining(['messwerte', 'fehler']))
    expect(abschnittVorschlag('versuch', 'physik', 6)).not.toContain('fehler')
    expect(abschnittVorschlag('mikroskopie', 'biologie', 8)).toContain('aufbau')
  })
})

describe('Protokoll bauen', () => {
  it('vorstrukturiert: Material und Durchführung vorgegeben, Beobachtung mit Leitfrage und Satzanfängen, Muster im Lösungsteil', () => {
    const p = protokollBauen({ art: 'versuch', stufe: 'vorstrukturiert', stil: 'praesens', subjectId: 'chemie', grade: 7, daten })
    const a = (id: string) => p.abschnitte.find((x) => x.id === id)!
    expect(a('durchfuehrung').vorgabe).toBe('1. Teelicht anzünden\n2. Becherglas darüber halten\n3. Kalkwasser einfüllen und schütteln')
    expect(a('beobachtung').vorgabe).toBeUndefined()
    expect(a('beobachtung').leitfrage).toMatch(/noch keine Erklärung/)
    expect(a('beobachtung').satzanfaenge?.[0]).toMatch(/Es lässt sich beobachten/)
    expect(a('auswertung').muster).toMatch(/Kohlenstoffdioxid \+ Wasser/)
    expect(p.chemikalien?.[0].ghs).toEqual(['GHS05'])
    expect(p.schutz).toEqual(['brille', 'haare'])
    expect(p.sicherheitZuPruefen).toBe(true)
    expect(p.checkliste?.some((c) => /nur, was wahrgenommen/.test(c))).toBe(true)
    expect(p.raster?.length).toBeGreaterThan(3)
  })

  it('Lückenprotokoll und offene Vorlage', () => {
    const l = protokollBauen({ art: 'versuch', stufe: 'luecken', stil: 'praesens', subjectId: 'chemie', grade: 7, daten })
    expect(l.abschnitte.find((x) => x.id === 'beobachtung')?.vorgabe).toContain('___')
    const o = protokollBauen({ art: 'versuch', stufe: 'offen', stil: 'praesens', subjectId: 'chemie', grade: 10, daten })
    expect(o.abschnitte.find((x) => x.id === 'durchfuehrung')?.vorgabe).toBeUndefined()
    expect(o.abschnitte.every((x) => !x.leitfrage && !x.satzanfaenge)).toBe(true)
  })

  it('Lernzielkontrolle: keine Lernhilfen', () => {
    const p = protokollBauen({ art: 'versuch', stufe: 'vorstrukturiert', stil: 'praesens', subjectId: 'chemie', grade: 7, daten, ohneHilfen: true })
    expect(p.abschnitte.every((x) => !x.leitfrage && !x.satzanfaenge)).toBe(true)
  })

  it('Checkliste nur zu gewählten Abschnitten', () => {
    expect(checklisteFuer(['kopf', 'beobachtung'], 'versuch')).toHaveLength(2)
  })
})

describe('Einsetzen durch die App', () => {
  const task = (id: string, operator = 'erkläre', instruction = 'Erkläre …'): WsBlock =>
    ({ id, type: 'task', instruction, operator, afbReason: '', socialForm: 'EA', answer: { kind: 'lines', count: 3 }, parts: [], solution: '', points: 4, minutes: 5 }) as unknown as WsBlock

  it('Platzhalter der KI wird durch den ausgearbeiteten Versuch ersetzt; offene Vorlage bringt die Anleitung mit', () => {
    const platzhalter = convertBlock({ type: 'protocol', title: 'Protokoll' }, createRng(1), [])!
    expect(platzhalter.type).toBe('protocol')
    const sheet: Sheet = { id: 's', label: 'A', blocks: [platzhalter, task('t1')] }
    const m = meta({ versuch: { ...versuchVorgabe(meta()), stufe: 'offen', daten } })
    const neu = setzeVersuchEin(sheet, m)
    const p = neu.blocks.find((b) => b.type === 'protocol')
    expect(p && p.type === 'protocol' && p.abschnitte.length).toBeGreaterThan(5)
    expect(neu.blocks.some((b) => b.type === 'text' && b.ref === 'anleitung')).toBe(true)
  })

  it('ohne Versuch bekommt ein Platzhalter die Vorlage für Fach und Jahrgang', () => {
    const platzhalter = convertBlock({ type: 'protocol', title: '' }, createRng(1), [])!
    const neu = setzeVersuchEin({ id: 's', label: 'A', blocks: [platzhalter] }, meta())
    const p = neu.blocks[0]
    expect(p.type === 'protocol' && p.abschnitte.length).toBeGreaterThan(5)
  })

  it('Prüfung: Vorlage direkt hinter der Aufgabe „protokollieren"', () => {
    const v = { ...versuchVorgabe(meta()), daten }
    const blocks = setzeProtokollInPruefung([task('t1'), task('t2', 'protokollieren', 'Protokolliere den Versuch.'), task('t3')], v, meta(), true)
    expect(blocks.map((b) => b.type)).toEqual(['task', 'task', 'protocol', 'task'])
    const p = blocks[2]
    expect(p.type === 'protocol' && p.abschnitte.some((a) => a.leitfrage)).toBe(false)
  })
})

describe('KI-Auftrag und Antwort', () => {
  it('Anleitung aus Datei wird wörtlich verlangt; Grundschule ohne Gefahrstoffe', () => {
    const req = versuchAnfrage(
      { subjectId: 'sachunterricht', subjectLabel: 'Sachunterricht', grade: 3, schoolTypeName: 'Grundschule', topic: 'Wasser' },
      { ...versuchVorgabe({ subjectId: 'sachunterricht', grade: 3 }), quelle: 'datei', anleitung: [{ fileName: 'a.pdf', text: 'Material: Glas' }] }
    )
    expect(req.user).toMatch(/WÖRTLICH/)
    expect(req.user).toMatch(/keine Gefahrstoffe/)
    expect(req.user).toMatch(/Material: Glas/)
  })

  it('Antwort: unbekannte GHS und Schutzmaßnahmen fallen weg, Sicherheit bleibt „zu prüfen"', () => {
    const d = versuchAus({ titel: 'X', durchfuehrung: ['a'], chemikalien: [{ name: 'Ethanol', ghs: ['GHS02', 'GHS99'], signalwort: 'Gefahr' }], schutz: ['brille', 'fliegen'], lueckenBeobachtung: 'ohne Lücke' })
    expect(d.chemikalien[0].ghs).toEqual(['GHS02'])
    expect(d.schutz).toEqual(['brille'])
    expect(d.sicherheitZuPruefen).toBe(true)
    expect(d.lueckenBeobachtung).toBeUndefined()
    expect(() => versuchAus({})).toThrow()
  })
})

describe('Baustein im Editor', () => {
  it('neuer Baustein nach Fach und Jahrgang; Beschreibung für die KI', () => {
    const b = newBlock('protocol', 'du', { subjectId: 'biologie', grade: 8 })
    expect(b.type).toBe('protocol')
    expect(b.type === 'protocol' && b.art).toBe('versuch')
    expect(describeBlock(b)).toMatch(/Protokoll/)
  })
})

describe('Word-Export', () => {
  it('Schülerfassung mit Kreuzfeldern und Checkliste, Lösung mit Muster und Raster', async () => {
    const { default: JSZip } = await import('jszip')
    const { buildWorksheetDocx } = await import('../src/renderer/src/modules/arbeitsblatt/export/docx')
    const { presetDesigns } = await import('@shared/design')
    const { defaultMeta } = await import('../src/renderer/src/modules/arbeitsblatt/model/defaults')
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const p = protokollBauen({ art: 'versuch', stufe: 'vorstrukturiert', stil: 'praesens', subjectId: 'chemie', grade: 7, daten })
    const ws = {
      version: 1,
      meta: { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'chemie', subjectLabel: 'Chemie', topic: 'Verbrennung', title: 'Kerze' },
      design: presetDesigns()[0],
      outline: null,
      sheets: [{ id: 's1', label: 'A', blocks: [{ id: 'p', type: 'protocol', ...p }] }],
      sources: [],
      createdAt: ''
    }
    const deps = { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG, sidebar: async () => PNG }
    const xml = async (includeKey: boolean, keyOnly = false): Promise<string> =>
      (await JSZip.loadAsync(await buildWorksheetDocx(ws as never, { sheetIds: ['s1'], includeKey, keyOnly }, deps))).file('word/document.xml')!.async('string')
    const schueler = await xml(false)
    expect(schueler).toContain('☒ Schutzbrille')
    expect(schueler).toContain('Ist mein Protokoll vollständig?')
    expect(schueler).not.toContain('Kohlenstoffdioxid + Wasser')
    const loesung = await xml(true, true)
    expect(loesung).toContain('Kohlenstoffdioxid + Wasser')
    expect(loesung).toContain('Bewertungsraster')
  })
})
