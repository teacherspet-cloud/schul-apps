import { describe, expect, it } from 'vitest'
import {
  fleissAus,
  jahrgangAus,
  leistungAus,
  regelTipp,
  stufeVon,
  tippPruefen,
  wocheVon,
  wochenSerie,
  zustandAus,
  type Fleiss,
  type Leistung,
  type Stufe,
  type TippDaten
} from '../src/shared/lernstand'
import { lerntippAnfrage } from '../src/server/lernstand'

// Mittwoch, 07.10.2026, 12 Uhr UTC
const JETZT = Date.parse('2026-10-07T12:00:00Z')
const tag = (vorTagen: number): string => new Date(JETZT - vorTagen * 86_400_000).toISOString().slice(0, 10)

describe('Jahrgang und Stufe', () => {
  it('liest den Jahrgang aus Klassennamen', () => {
    expect(jahrgangAus('7a')).toBe(7)
    expect(jahrgangAus('Klasse 10b')).toBe(10)
    expect(jahrgangAus('5.2')).toBe(5)
    expect(jahrgangAus('Q1')).toBe(12)
    expect(jahrgangAus('Q2 Englisch')).toBe(13)
    expect(jahrgangAus('EF')).toBe(11)
    expect(jahrgangAus('Englisch-AG')).toBeNull()
    expect(jahrgangAus('Raum 214')).toBeNull()
    expect(jahrgangAus('')).toBeNull()
  })
  it('ordnet Stufen zu, ohne Jahrgang neutral', () => {
    expect([1, 4, 5, 6, 7, 10, 11, 13].map(stufeVon)).toEqual(['grund', 'grund', 'unter', 'unter', 'mittel', 'mittel', 'ober', 'ober'])
    expect(stufeVon(null)).toBe('neutral')
  })
})

describe('Fleiß', () => {
  it('zählt Übungstage der letzten 7 und 14 Tage', () => {
    const f = fleissAus([tag(0), tag(1), tag(1), tag(3), tag(9), tag(20)], JETZT, 3)
    expect(f).toEqual({ tage7: 3, tage14: 4, seitTagen: 0, fleissig: true })
  })
  it('richtet sich nach dem eigenen Wochenziel (höchstens 3 Tage verlangt)', () => {
    expect(fleissAus([tag(2)], JETZT, 1).fleissig).toBe(true)
    expect(fleissAus([tag(2), tag(4)], JETZT, 6).fleissig).toBe(false)
    expect(fleissAus([tag(2), tag(4), tag(5)], JETZT, 6).fleissig).toBe(true)
  })
  it('noch nie geübt: seitTagen null', () => {
    expect(fleissAus([], JETZT).seitTagen).toBeNull()
  })
})

describe('Wochenserie statt Tagesserie', () => {
  // Woche von JETZT beginnt Montag, 05.10.2026
  it('zählt Wochen mit erreichtem Ziel; die laufende erst, wenn erreicht', () => {
    const tage = [tag(0), tag(7), tag(8), tag(14), tag(15)] // diese Woche 1 Tag, zwei Vorwochen je 2
    expect(wochenSerie(tage, JETZT, 2)).toEqual({ serie: 2, dieseWoche: 1, ziel: 2 })
    expect(wochenSerie([...tage, tag(1)], JETZT, 2).serie).toBe(3)
  })
  it('eine Woche Pause beendet die Serie nicht, zwei schon', () => {
    const mitPause = [tag(7), tag(21), tag(28)]
    expect(wochenSerie(mitPause, JETZT, 1).serie).toBe(3)
    const zweiPausen = [tag(7), tag(28), tag(35)]
    expect(wochenSerie(zweiPausen, JETZT, 1).serie).toBe(1)
  })
  it('Wochenkennung ist der Montag', () => {
    expect(wocheVon(JETZT)).toBe('2026-10-05')
  })
})

const leer = { genauigkeit: null, sicherJetzt: 0, sicherVorher: null, gesamt: 0, tests: [], blattAnteil: null }

describe('Leistung (individuell)', () => {
  it('ohne Daten unbekannt', () => {
    expect(leistungAus(leer)).toEqual({ stand: 'unbekannt', trend: 'unbekannt', erfolgreich: false })
  })
  it('hohe Genauigkeit = gut und erfolgreich', () => {
    expect(leistungAus({ ...leer, genauigkeit: 0.9 }).erfolgreich).toBe(true)
  })
  it('mittlerer Stand zählt als erfolgreich nur mit steigendem Trend', () => {
    expect(leistungAus({ ...leer, genauigkeit: 0.7, sicherJetzt: 30, sicherVorher: 30, gesamt: 60 })).toMatchObject({ stand: 'mittel', trend: 'gleich', erfolgreich: false })
    expect(leistungAus({ ...leer, genauigkeit: 0.7, sicherJetzt: 40, sicherVorher: 30, gesamt: 60 })).toMatchObject({ trend: 'steigt', erfolgreich: true })
  })
  it('Trend aus Tests (neueste zuerst) und sinkender Stand', () => {
    expect(leistungAus({ ...leer, tests: [80, 60] }).trend).toBe('steigt')
    expect(leistungAus({ ...leer, sicherJetzt: 20, sicherVorher: 30, gesamt: 60 }).trend).toBe('sinkt')
    expect(leistungAus({ ...leer, genauigkeit: 0.4, tests: [30] })).toMatchObject({ stand: 'niedrig', erfolgreich: false })
  })
})

const F = (tage7: number, tage14: number, seitTagen: number | null, fleissig: boolean): Fleiss => ({ tage7, tage14, seitTagen, fleissig })
const L = (stand: Leistung['stand'], erfolgreich: boolean, trend: Leistung['trend'] = 'gleich'): Leistung => ({ stand, trend, erfolgreich })

describe('Zustand der Begrüßung (Fleiß × Leistung)', () => {
  it('alle Zustände', () => {
    expect(zustandAus(F(0, 0, null, false), L('unbekannt', false))).toBe('neu')
    expect(zustandAus(F(0, 0, 20, false), L('gut', true))).toBe('inaktiv')
    expect(zustandAus(F(4, 6, 0, true), L('gut', true))).toBe('erfolgreich_fleissig')
    expect(zustandAus(F(4, 6, 0, true), L('niedrig', false))).toBe('fleissig')
    expect(zustandAus(F(1, 1, 5, false), L('gut', true))).toBe('erfolgreich')
    expect(zustandAus(F(1, 1, 5, false), L('niedrig', false))).toBe('neutral')
  })
  it('fleißig, aber Leistung unbekannt: neutral statt „noch nicht erfolgreich"', () => {
    expect(zustandAus(F(4, 6, 0, true), L('unbekannt', false))).toBe('neutral')
  })
})

const daten = (stufe: Stufe, teil: Partial<TippDaten> = {}): TippDaten => ({
  stufe,
  fleiss: F(2, 3, 1, false),
  leistung: L('mittel', false),
  vokabeln: [{ id: 'v1', titel: 'Unit 1', faellig: 14, wackelig: 0, testInTagen: null, href: '/s/v/v1' }],
  grammatik: [{ id: 'g1', titel: 'Simple past', faellig: 3, href: '/s/g/g1' }],
  blatt: { titel: 'Weather', href: '/s/b/b1' },
  reihe: null,
  ...teil
})
const STUFEN: Stufe[] = ['grund', 'unter', 'mittel', 'ober', 'neutral']

describe('Regel-Tipps (ohne KI)', () => {
  it('liefern genau einen Tipp mit Knopf', () => {
    const t = regelTipp(daten('mittel'), JETZT)
    expect(t.quelle).toBe('regel')
    expect(t.knopf?.href).toMatch(/^\/s\//)
    expect(t.text.length).toBeGreaterThan(20)
  })
  it('Vokabeltest bald und Strategiewechsel haben Vorrang', () => {
    const bald = daten('unter', { vokabeln: [{ id: 'v1', titel: 'Unit 1', faellig: 0, wackelig: 0, testInTagen: 3, href: '/s/v/v1' }] })
    expect(regelTipp(bald, JETZT).regel).toBe('testbald')
    const viel = daten('mittel', { fleiss: F(5, 9, 0, true), leistung: L('niedrig', false) })
    expect(regelTipp(viel, JETZT)).toMatchObject({ regel: 'strategiewechsel', strategie: 'abruf' })
  })
  it('„Jetzt 10 Vokabeln abfragen" bei fälligen Vokabeln', () => {
    const nurVok = daten('mittel', { grammatik: [], blatt: null })
    expect(regelTipp(nurVok, JETZT).knopf?.text).toBe('Jetzt 10 Vokabeln abfragen')
  })
  it('ohne Material: Planen mit Wochenziel', () => {
    expect(regelTipp(daten('ober', { vokabeln: [], grammatik: [], blatt: null }), JETZT)).toMatchObject({ regel: 'planen', strategie: 'planung' })
  })
  it('alle Regel-Tipps bestehen die eigene Prüfung (je Stufe)', () => {
    const faelle: Partial<TippDaten>[] = [
      {},
      { vokabeln: [{ id: 'v1', titel: 'Unit 1', faellig: 0, wackelig: 0, testInTagen: 2, href: '/s/v/v1' }] },
      { fleiss: F(5, 9, 0, true), leistung: L('niedrig', false) },
      { vokabeln: [{ id: 'v1', titel: 'Unit 1', faellig: 0, wackelig: 5, testInTagen: null, href: '/s/v/v1' }] },
      { vokabeln: [], grammatik: [], blatt: null },
      { vokabeln: [], blatt: null },
      { vokabeln: [], grammatik: [] }
    ]
    for (const s of STUFEN)
      for (const f of faelle)
        for (let i = 0; i < 3; i++) {
          const t = regelTipp(daten(s, f), JETZT + i * 86_400_000)
          expect(tippPruefen(t.text, s), `${s} ${t.regel}: ${t.text}`).toEqual({ ok: true })
        }
  })
})

describe('Prüfung von KI-Tipps', () => {
  const gut = 'Du hast an 4 Tagen geübt. Frag dich die 10 fälligen Wörter erst ohne Hinschauen ab und prüf danach.'
  it('lässt einen guten Tipp durch', () => {
    expect(tippPruefen(gut, 'mittel')).toEqual({ ok: true })
  })
  it.each([
    ['Du bist echt begabt für Sprachen, weiter so mit den Wörtern!', 'Personen- oder Fähigkeitsaussage'],
    ['Du bist ein visueller Lerntyp, also nutze viele Bilder beim Üben.', 'Typisierung'],
    ['Du liegst über dem Klassendurchschnitt, übe die fälligen Wörter.', 'Vergleich mit anderen'],
    ['Endlich hast du wieder geübt, mach heute 10 Wörter.', 'Bloßstellen'],
    ['Übe heute, sonst verlierst du deine Serie von drei Wochen.', 'Verlustandrohung'],
    ['Markiere die schwierigen Wörter farbig in deinem Heft.', 'wenig wirksame Strategie'],
    ['Wenn du so weitermachst, bekommst du sicher eine 1 im Test.', 'Zusage über Noten'],
    ['Mit deiner Legasthenie solltest du langsamer lesen und üben.', 'Diagnose'],
    ['S1 hat an vier Tagen geübt, mach weiter mit den Wörtern.', 'Platzhalter oder Kürzel'],
    ['**Tipp:** Frag dich die Wörter ohne Hinschauen ab.', 'Formatierung']
  ])('verwirft: %s', (text, grund) => {
    expect(tippPruefen(text, 'mittel')).toEqual({ ok: false, grund })
  })
  it('Wiederlesen nur im Gegensatz erlaubt', () => {
    expect(tippPruefen('Abfragen bringt mehr als Durchlesen, auch wenn es anstrengender ist.', 'mittel').ok).toBe(true)
    expect(tippPruefen('Lies die Regel heute noch einmal lesen und dann weiter.', 'mittel').ok).toBe(false)
  })
  it('Länge und Emojis je Stufe', () => {
    expect(tippPruefen('Kurz.', 'grund')).toEqual({ ok: false, grund: 'zu kurz' })
    expect(tippPruefen(`${gut} ${gut}`, 'grund')).toEqual({ ok: false, grund: 'zu lang' })
    expect(tippPruefen('Super, du hast an drei Tagen geübt! Sag jedes Wort erst selbst. 🌟', 'grund').ok).toBe(true)
    expect(tippPruefen('Gute Woche mit vier Übungstagen. Misch heute zwei Themen. 🌟', 'mittel')).toEqual({ ok: false, grund: 'Emojis' })
  })
})

describe('Prompt für den Wochenrückblick', () => {
  it('enthält nur Kürzel und Zahlen, die Regeln und die Aktionen', () => {
    const antwort = {
      jahrgang: 7,
      stufe: 'mittel' as const,
      zustand: 'fleissig' as const,
      fleiss: F(4, 7, 0, true),
      leistung: L('niedrig', false),
      serie: { serie: 2, dieseWoche: 2, ziel: 3 },
      tage: [],
      zahlen: { sicher: 10, gesamt: 40, sicherNeu: 2, faellig: 8, tests: 1, testsZuletzt: 55 },
      bereiche: [],
      tipp: null,
      wochenrueckblick: false,
      tippsAn: true
    }
    const a = lerntippAnfrage({ antwort, prompt: ['Vokabelliste „Unit 1" (Englisch): 10 von 40 sicher'], aktionen: { vokabeln: { text: 'Jetzt 8 Vokabeln abfragen', href: '/s/v/x' } } })
    expect(a.schemaName).toBe('schueler_lerntipp')
    expect(a.user).toContain('S1 · Jahrgang 7')
    expect(a.user).toContain('Keine Vergleiche mit anderen')
    expect(a.user).toContain('vokabeln = „Jetzt 8 Vokabeln abfragen"')
    expect((a.schema.properties as Record<string, { enum?: string[] }>).aktion.enum).toEqual(['vokabeln'])
  })
})

describe('Tipp „Wochenziel festlegen" (10.10.2026)', () => {
  it('ohne gewähltes Ziel: festlegen; mit Ziel: kein „festlegen" mehr, sondern Erinnerung an das Ziel', async () => {
    const { regelTipp } = await import('../src/shared/lernstand')
    const basis = { stufe: 'mittel', fleiss: { fleissig: false }, leistung: {} } as never
    const ohne = regelTipp(basis)
    expect(ohne.knopf?.text).toBe('Wochenziel festlegen')
    const mit = regelTipp({ ...(basis as object), wochenziel: 4 } as never)
    expect(mit.knopf?.text).not.toBe('Wochenziel festlegen')
    expect(mit.text).toMatch(/4 Übungstage/)
  })
})
