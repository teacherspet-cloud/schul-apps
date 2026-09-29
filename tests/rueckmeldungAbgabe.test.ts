import { describe, expect, it } from 'vitest'
import {
  kiTrennungAnwenden,
  kiTrennungNoetig,
  trennAnfrage,
  trenneNachAufgabe,
  trennHinweis,
  trennungAnwenden,
  trennungZurueck
} from '../src/renderer/src/modules/rueckmeldung/abgabeTrennen'
import { bogenAnfrage, bogenAus } from '../src/renderer/src/modules/rueckmeldung/generation'
import type { Abgabe, Rueckmeldung, RueckmeldungMeta } from '../src/renderer/src/modules/rueckmeldung/model/types'
import { deutschVerlangt, erkenneSprache, pruefeZielsprache, satzSprache } from '../src/renderer/src/modules/rueckmeldung/sprachErkennung'

/*
 * Fehlerberichte der Lehrkraft (29.09.2026): Word-Abgaben brachten das ganze Aufgabenblatt mit;
 * die KI behauptete bei einer kurzen deutschen Abgabe, es liege kein Antworttext vor; in den
 * Fremdsprachen kam kein Wort dazu, dass die Abgabe auf Deutsch verfasst war.
 */
const AUFGABE = [
  'Klassenarbeit Nr. 2 – Theaterkritik',
  'Aufgabe 1: Lies die Kritik aus der Zeitung und fasse sie in eigenen Worten zusammen. (10 P.)',
  'Die Inszenierung des Stadttheaters zeigt Goethes Faust in einer modernen Fassung mit Videoprojektionen.',
  'Aufgabe 2: Schreibe eine E-Mail an Eddie, in der du deine Meinung zur Inszenierung begründest.'
].join('\n')

const SCHUELER = 'Hallo Eddie, ich finde, dass die Inszenierung echt guht gelungen ist.\nDie Videos waren toll und die Schauspieler auch.\nViele Grüße S1'

const ABGABE_DOC = [
  'Name: S1',
  'Klassenarbeit Nr. 2 – Theaterkritik',
  'aufgabe 1:  Lies die Kritik aus der Zeitung und fasse sie in eigenen   Worten zusammen. (10 P.)',
  'Die Inszenierung des Stadttheaters zeigt Goethes Faust in einer modernen Fassung mit Videoprojektionen.',
  'Aufgabe 2: Schreibe eine E-Mail an Eddie, in der du deine Meinung zur Inszenierung begründest.',
  '',
  SCHUELER
].join('\n')

describe('Aufgabentext abtrennen: Abgleich', () => {
  it('entfernt wörtliche Aufgabenzeilen (Leerraum, Groß-/Kleinschreibung egal) und Kopfzeilen, der Schülertext bleibt samt Fehlern', () => {
    const e = trenneNachAufgabe(ABGABE_DOC, AUFGABE)
    expect(e.text).toBe(SCHUELER)
    expect(e.zeilen).toBe(5)
    expect(e.verdacht).toBe(false)
    expect(kiTrennungNoetig(e, AUFGABE)).toBe(false)
  })

  it('reiner Schülertext bleibt unverändert', () => {
    const e = trenneNachAufgabe(SCHUELER, AUFGABE)
    expect(e.text).toBe(SCHUELER)
    expect(e.zeilen).toBe(0)
  })

  it('eine richtige Antwort fällt nicht weg, nur weil die Lösung in der Aufgabe steht', () => {
    const aufgaben = '1. Where have you been?  → model answer: I have been to London twice.\n  Lösung: Paris is the capital of France.'
    const e = trenneNachAufgabe('Where have you been?\nI have been to London twice.\nParis is the capital of France.', aufgaben)
    expect(e.text).toBe('I have been to London twice.\nParis is the capital of France.')
    expect(trennAnfrage('x', aufgaben).user).not.toMatch(/London/)
  })

  it('bleibt nichts übrig, bleibt alles', () => {
    const e = trenneNachAufgabe(AUFGABE, AUFGABE)
    expect(e.text).toBe(AUFGABE)
    expect(e.zeilen).toBe(0)
  })

  it('Verdacht auf weitere Aufgabenteile bzw. keine Aufgabe → KI', () => {
    const e = trenneNachAufgabe(`Aufgabe 3: Beschreibe das Bühnenbild.\n${SCHUELER}`, AUFGABE)
    expect(e.verdacht).toBe(true)
    expect(kiTrennungNoetig(e, AUFGABE)).toBe(true)
    const lang = trenneNachAufgabe(Array.from({ length: 8 }, (_, i) => `Zeile ${i} meines Textes`).join('\n'), '')
    expect(kiTrennungNoetig(lang, '')).toBe(true)
    expect(kiTrennungNoetig(trenneNachAufgabe(SCHUELER, ''), '')).toBe(false)
  })

  it('Original merken, Hinweis, Rückgängig', () => {
    const a: Abgabe = { id: 'a1', kuerzel: 'S1', name: '', dateiname: 'x.doc', text: ABGABE_DOC, bilder: [] }
    const neu = trennungAnwenden(a, trenneNachAufgabe(a.text, AUFGABE), 'abgleich')
    expect(neu.text).toBe(SCHUELER)
    expect(neu.textOriginal).toBe(ABGABE_DOC)
    expect(trennHinweis(neu)).toBe('Aufgabentext entfernt (5 Zeilen)')
    const zurueck = trennungZurueck(neu)
    expect(zurueck.text).toBe(ABGABE_DOC)
    expect(zurueck.textOriginal).toBeUndefined()
    expect(zurueck.trennung).toBeUndefined()
    expect(trennHinweis(zurueck)).toBeNull()
  })
})

describe('Aufgabentext abtrennen: KI', () => {
  const doc = `Task 1: Write an email to your friend. (15 P.)\nUse the words from the box.\nDear Tom,\nI am writting you becaus I want tell you about my holidays.\nBye S1`

  it('übernimmt die Originalzeilen – auch wenn die KI einen Fehler verbessert hat', () => {
    const e = kiTrennungAnwenden(doc, doc, {
      schuelertext: 'Dear Tom,\nI am writing you because I want tell you about my holidays.\nBye S1',
      entfernt: ['Aufgabenstellung']
    })
    expect(e?.text).toBe('Dear Tom,\nI am writting you becaus I want tell you about my holidays.\nBye S1')
    expect(e?.zeilen).toBe(2)
    expect(e?.entfernt).toEqual(['Aufgabenstellung'])
  })

  it('übersetzter oder leerer Text gilt nicht', () => {
    expect(kiTrennungAnwenden(doc, doc, { schuelertext: 'Lieber Tom, ich schreibe dir wegen meiner Ferien. Tschüss' })).toBeNull()
    expect(kiTrennungAnwenden(doc, doc, { schuelertext: '' })).toBeNull()
  })

  it('Anfrage: Abgabe zwischen Markierungen, wörtlich, im Zweifel behalten', () => {
    const q = trennAnfrage('Text von S1', AUFGABE)
    expect(q.user).toContain('<<<ABGABE\nText von S1\nABGABE>>>')
    expect(q.user).toContain('<<<AUFGABE')
    expect(q.user).toMatch(/WÖRTLICH/)
    expect(q.user).toMatch(/Im Zweifel behalten/)
    expect(trennAnfrage('x', '').user).toMatch(/nicht bekannt/)
  })
})

describe('Spracherkennung', () => {
  it('erkennt Deutsch, Englisch, Französisch, Spanisch, Russisch', () => {
    expect(satzSprache('Hallo Eddie, ich finde, dass die Inszenierung echt guht gelungen ist.')).toBe('de')
    expect(satzSprache('I think that the play was very good and the actors were great.')).toBe('en')
    expect(satzSprache('Je pense que la pièce est très bien et les acteurs aussi.')).toBe('fr')
    expect(satzSprache('Yo creo que la obra es muy buena y los actores también.')).toBe('es')
    expect(satzSprache('Я думаю, что спектакль был очень хороший.')).toBe('ru')
    expect(erkenneSprache(SCHUELER).sprache).toBe('de')
  })

  it('Zielsprache: deutsche Abgabe in Englisch ist verfehlt, englische nicht, Deutsch als Fach nie', () => {
    expect(pruefeZielsprache(SCHUELER, 'englisch').verfehlt).toBe(true)
    expect(pruefeZielsprache('Dear Eddie, I think that the play was very good. The actors were great and the videos were cool.', 'englisch').verfehlt).toBe(
      false
    )
    expect(pruefeZielsprache(SCHUELER, 'deutsch').verfehlt).toBe(false)
    expect(pruefeZielsprache(SCHUELER, 'latein').verfehlt).toBe(false)
    expect(pruefeZielsprache('Ich bin da.', 'englisch').verfehlt).toBe(false)
  })

  it('Sprachmittlung ins Deutsche erkannt', () => {
    expect(deutschVerlangt('Mediation: Fasse den Artikel auf Deutsch zusammen.')).toBe(true)
    expect(deutschVerlangt('Sprachmittlung (Englisch → Deutsch)')).toBe(true)
    expect(deutschVerlangt('Write an email to Eddie.')).toBe(false)
  })
})

const meta = (over: Partial<RueckmeldungMeta> = {}): RueckmeldungMeta => ({
  title: '',
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 8,
  stateId: 'NW',
  schoolTypeId: 'gymnasium',
  schoolTypeName: 'Gymnasium',
  anrede: 'du',
  schwerpunkt: '',
  formen: ['schriftlich', 'tipps'],
  einstufung: 'noteTendenz',
  ebene: 'gesamt',
  ...over
})
const rm = (m: Partial<RueckmeldungMeta> = {}, g: Partial<Rueckmeldung['grundlage']> = {}): Rueckmeldung => ({
  version: 1,
  meta: meta(m),
  grundlage: { art: 'frei', titel: 'Theatre', aufgaben: 'Write an email to Eddie about the play.', ...g },
  abgaben: [],
  createdAt: ''
})
const abgabe: Abgabe = { id: 'a1', kuerzel: 'S1', name: '', dateiname: 'x', text: SCHUELER, bilder: [] }
const antwort = {
  staerken: ['Die Meinung ist klar.'],
  schritte: ['Den Text auf Englisch schreiben.'],
  kriterien: [{ kriterium: 'Aufgabenbezug', einschaetzung: 'teilweise', beleg: 'echt guht gelungen' }],
  gesamt: { anteil: 55, begruendung: 'Inhalt passt.' }
}

describe('Bogen: Abgabe klar abgegrenzt, Zielsprache', () => {
  it('Anfrage: Arbeit zwischen Markierungen und die Regel „Text ist die Abgabe"', () => {
    const q = bogenAnfrage(rm({ subjectId: 'deutsch', subjectLabel: 'Deutsch' }), abgabe, 'sys')
    expect(q.user).toContain(`<<<ARBEIT\n${SCHUELER}\nARBEIT>>>`)
    expect(q.user).toMatch(/Nie behaupten, es liege keine Abgabe/)
    expect(q.user).not.toMatch(/ZIELSPRACHE/)
  })

  it('Anfrage Fremdsprache: Regel und Befund der App', () => {
    const q = bogenAnfrage(rm(), abgabe, 'sys')
    expect(q.user).toMatch(/ZIELSPRACHE Englisch/)
    expect(q.user).toMatch(/Sprachmittlung ins Deutsche/)
    expect(q.user).toMatch(/BEFUND DER APP: Die Abgabe ist überwiegend auf Deutsch/)
  })

  it('deutsche Abgabe in Englisch: Einstufung 0 %, Markierung und Hinweis', () => {
    const r = rm()
    const b = bogenAus(antwort, r, abgabe)
    expect(b.gesamt?.anteil).toBe(0)
    expect(b.spracheVerfehlt).toBe(true)
    expect(b.hinweise?.[0]).toMatch(/überwiegend auf Deutsch statt auf Englisch/)
  })

  it('mit Teilen: alle Teile auf 0', () => {
    const r = rm(
      {},
      {
        teile: [
          { id: 't1', titel: 'Reading', art: 'sonstig', gewicht: 40, quelle: 'material' },
          { id: 't2', titel: 'Writing', art: 'schreiben', gewicht: 60, inhalt: 40, quelle: 'material' }
        ],
        verrechnung: 'prozent'
      }
    )
    const b = bogenAus({ ...antwort, teile: [{ id: 't1', anteil: 80 }, { id: 't2', inhalt: 70, sprache: 50 }] }, r, abgabe)
    expect(b.teile).toEqual([
      expect.objectContaining({ teilId: 't1', anteil: 0 }),
      expect.objectContaining({ teilId: 't2', inhalt: 0, sprache: 0 })
    ])
    expect(b.gesamt?.anteil).toBe(0)
  })

  it('Aufgabe verlangt Deutsch: nur Hinweis, keine 0', () => {
    const b = bogenAus(antwort, rm({}, { aufgaben: 'Mediation: Fasse den Artikel auf Deutsch zusammen.' }), abgabe)
    expect(b.gesamt?.anteil).toBe(55)
    expect(b.spracheVerfehlt).toBeUndefined()
    expect(b.hinweise?.[0]).toMatch(/verlangt teilweise Deutsch/)
  })

  it('ohne Einstufung: Markierung und Hinweis ohne Prozentangabe', () => {
    const b = bogenAus(antwort, rm({ einstufung: 'keine' }), abgabe)
    expect(b.gesamt).toBeUndefined()
    expect(b.spracheVerfehlt).toBe(true)
    expect(b.hinweise?.[0]).not.toMatch(/Einstufung auf 0/)
  })

  it('englische Abgabe: nichts markiert', () => {
    const en = { ...abgabe, text: 'Dear Eddie, I think that the play was very good. The actors were great and the videos were cool.' }
    const b = bogenAus(antwort, rm(), en)
    expect(b.gesamt?.anteil).toBe(55)
    expect(b.spracheVerfehlt).toBeUndefined()
    expect(b.hinweise).toBeUndefined()
  })
})

describe('Oberstufe: Deckel bei ungenügendem Inhalt oder ungenügender Sprache', () => {
  it('höchstens 20 % (3 Notenpunkte) für den Teil, in der Sek I nicht', async () => {
    const { teilAnteil } = await import('../src/renderer/src/modules/rueckmeldung/teilbewertung')
    const t = { id: 't', titel: 'Writing', art: 'schreiben' as const, inhalt: 40, quelle: 'vorgabe' as const }
    expect(teilAnteil(t, { teilId: 't', inhalt: 90, sprache: 10 }, true)).toBe(20)
    expect(teilAnteil(t, { teilId: 't', inhalt: 90, sprache: 10 })).toBe(42)
  })
})
