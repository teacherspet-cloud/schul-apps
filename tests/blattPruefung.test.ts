import { describe, expect, it } from 'vitest'
import { emptyAnswer, newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { aufgabenSchluessel } from '../src/renderer/src/modules/arbeitsblatt/blattSchluessel'
import { describeBlock } from '../src/renderer/src/modules/arbeitsblatt/generation/describe'
import { blattAbgabeText, type BlattAufgabe, type BlattFeld } from '../src/shared/blattFreigabe'
import {
  abgabeAufgabenAnfrage,
  abgabeAufgabenAus,
  autoPruefen,
  bezugAus,
  einschaetzungAus,
  lueckeRichtig,
  markeGilt,
  markenAusVerlauf,
  pruefRunden,
  schluesselAusErwartung,
  schluesselBereinigt
} from '../src/shared/blattPruefung'

/*
 * Prüfung beim Einreichen (08.10.2026): feste Lösungen ohne KI (✓/✗ je Feld), Schlüssel aus dem Blatt bzw. aus der
 * Erwartung älterer Freigaben, Kästchen-Text für die KI statt „Kästchen 7", offene Aufgaben in einer KI-Anfrage.
 */
const aufgabe = (a: Partial<TaskBlock['answer']>, mehr: Partial<TaskBlock> = {}): TaskBlock => {
  const b = newBlock('task') as TaskBlock
  return { ...b, instruction: 'Aufgabe', answer: { ...emptyAnswer(a.kind ?? 'lines'), ...a }, ...mehr }
}
const teil = (id: string, a: Partial<TaskBlock['answer']>): TaskBlock['parts'][number] => ({
  id,
  instruction: `Teil ${id}`,
  answer: { ...emptyAnswer(a.kind ?? 'lines'), ...a },
  solution: ''
})
const feld = (id: string, nr: number, art: string, bezug?: string, text?: string): BlattFeld => ({ id, nr, art, seite: 0, ...(bezug ? { bezug } : {}), ...(text ? { text } : {}) })
const blattAufgabe = (nr: number, b: TaskBlock): BlattAufgabe => ({ nr, anweisung: 'Aufgabe', erwartung: describeBlock(b), schluessel: aufgabenSchluessel(b) })

describe('Lösungsschlüssel aus dem Blatt', () => {
  it('Ankreuzen, Richtig/Falsch, Lücken, Zuordnen, Ordnen – je Teilaufgabe; Schreiben fehlt', () => {
    const b = aufgabe(
      {},
      {
        parts: [
          teil('a', { kind: 'multipleChoice', options: ['Paris', 'Rom', '**Berlin**'], correct: [2] }),
          teil('b', { kind: 'trueFalse', statements: [{ text: 'X', isTrue: true }, { text: 'Y', isTrue: false }] }),
          teil('c', { kind: 'gapText', gapText: 'Sie [[hat]] einen Hund und er [[ist]] braun.' }),
          teil('d', { kind: 'matching', left: ['L1', 'L2'], right: ['R1', 'R2'], pairs: [1, 0] }),
          teil('e', { kind: 'ordering', items: ['erst', 'dann', 'zuletzt'], displayOrder: [2, 0, 1] }),
          teil('f', { kind: 'lines', count: 3 })
        ]
      }
    )
    expect(aufgabenSchluessel(b)?.teile).toEqual([
      { teil: 0, art: 'mc', optionen: ['Paris', 'Rom', 'Berlin'], richtig: [2] },
      { teil: 1, art: 'rf', aussagen: ['X', 'Y'], werte: [true, false] },
      { teil: 2, art: 'luecke', loesungen: ['hat', 'ist'] },
      { teil: 3, art: 'zuordnen', paare: [1, 0] },
      { teil: 4, art: 'ordnen', nummern: [3, 1, 2] }
    ])
    // Ohne Teilaufgaben: Teil -1; reine Schreibaufgabe ohne Schlüssel
    expect(aufgabenSchluessel(aufgabe({ kind: 'multipleChoice', options: ['a', 'b'], correct: [0] }))?.teile[0].teil).toBe(-1)
    expect(aufgabenSchluessel(aufgabe({ kind: 'lines', count: 4 }))).toBeUndefined()
  })

  it('ältere Freigaben: Schlüssel aus der Erwartung (describe.ts)', () => {
    const mitTeilen = aufgabe(
      {},
      {
        parts: [
          teil('a', { kind: 'multipleChoice', options: ['went', 'goed', 'gone'], correct: [0] }),
          teil('b', { kind: 'trueFalse', statements: [{ text: 'Es regnet', isTrue: false }, { text: 'Die Sonne scheint', isTrue: true }] }),
          teil('c', { kind: 'gapText', gapText: 'I [[am]] here.\nYou [[are]] there.' }),
          teil('d', { kind: 'lines', count: 2 })
        ]
      }
    )
    expect(schluesselAusErwartung(describeBlock(mitTeilen))?.teile).toEqual([
      { teil: 0, art: 'mc', optionen: ['went', 'goed', 'gone'], richtig: [0] },
      { teil: 1, art: 'rf', aussagen: ['Es regnet', 'Die Sonne scheint'], werte: [false, true] },
      { teil: 2, art: 'luecke', loesungen: ['am', 'are'] }
    ])
    const ohne = aufgabe({ kind: 'multipleChoice', options: ['1914', '1918'], correct: [1] })
    expect(schluesselAusErwartung(describeBlock(ohne))?.teile).toEqual([{ teil: -1, art: 'mc', optionen: ['1914', '1918'], richtig: [1] }])
    expect(schluesselAusErwartung(describeBlock(aufgabe({ kind: 'lines', count: 3 }, { solution: 'Weil …' })))).toBeUndefined()
  })

  it('Schlüssel aus der Anfrage wird begrenzt, Unbekanntes fällt weg', () => {
    expect(
      schluesselBereinigt({
        teile: [
          { teil: 0, art: 'mc', optionen: ['a', 'b'], richtig: [1, 7] },
          { teil: 'x', art: 'mc' },
          { teil: 1, art: 'boese', loesungen: ['x'] },
          { teil: -1, art: 'luecke', loesungen: ['ist'] }
        ]
      })
    ).toEqual({
      teile: [
        { teil: 0, art: 'mc', optionen: ['a', 'b'], richtig: [1] },
        { teil: -1, art: 'luecke', loesungen: ['ist'] }
      ]
    })
    expect(schluesselBereinigt(null)).toBeUndefined()
    expect(bezugAus('0.mc.2')).toEqual({ teil: 0, art: 'mc', i: 2 })
    expect(bezugAus('-1.rf.3.1')).toEqual({ teil: -1, art: 'rf', i: 3, spalte: 1 })
    expect(bezugAus('0.boese.1')).toBeNull()
  })
})

describe('automatische Prüfung beim Einreichen', () => {
  it('Ankreuzen: ✓ am richtigen, ✗ am falschen Kreuz; Fehlendes erst nach der letzten Runde', () => {
    const b = aufgabe({ kind: 'multipleChoice', options: ['Paris', 'Rom', 'Berlin'], correct: [2] })
    const a = [blattAufgabe(1, b)]
    const felder = [feld('f0', 1, 'kreuz', '-1.mc.0'), feld('f1', 1, 'kreuz', '-1.mc.1'), feld('f2', 1, 'kreuz', '-1.mc.2')]
    const falsch = autoPruefen(a, felder, { f0: 'x' })
    expect(falsch.marken).toEqual({ f0: { m: 'f', w: 'x' } })
    expect(falsch.aufgaben['1']).toEqual({ richtig: 0, gesamt: 1, nurAuto: true })
    expect(autoPruefen(a, felder, { f0: 'x' }, { letzteRunde: true }).marken.f2).toEqual({ m: 'fehlt', w: '' })
    const richtig = autoPruefen(a, felder, { f2: 'x' })
    expect(richtig.marken).toEqual({ f2: { m: 'r', w: 'x' } })
    expect(richtig.aufgaben['1'].richtig).toBe(1)
  })

  it('Richtig/Falsch je Aussage, beide angekreuzt = falsch', () => {
    const b = aufgabe({ kind: 'trueFalse', statements: [{ text: 'X', isTrue: true }, { text: 'Y', isTrue: false }] })
    const felder = [feld('f0', 2, 'kreuz', '-1.rf.0.0'), feld('f1', 2, 'kreuz', '-1.rf.0.1'), feld('f2', 2, 'kreuz', '-1.rf.1.0'), feld('f3', 2, 'kreuz', '-1.rf.1.1')]
    const e = autoPruefen([blattAufgabe(2, b)], felder, { f0: 'x', f2: 'x', f3: 'x' })
    expect(e.marken).toEqual({ f0: { m: 'r', w: 'x' }, f2: { m: 'f', w: 'x' }, f3: { m: 'f', w: 'x' } })
    expect(e.aufgaben['2']).toEqual({ richtig: 1, gesamt: 2, nurAuto: true })
  })

  it('Lücken: tolerant bei Groß-/Kleinschreibung, Apostroph, Satzzeichen am Ende, Alternativen', () => {
    expect(lueckeRichtig(' Doesn’t. ', "doesn't")).toBe(true)
    expect(lueckeRichtig('gone', 'went/gone')).toBe(true)
    expect(lueckeRichtig('dog', '(the) dog')).toBe(true)
    expect(lueckeRichtig('', 'dog')).toBe(false)
    expect(lueckeRichtig('cat', 'dog')).toBe(false)
    const b = aufgabe({ kind: 'gapText', gapText: 'Sie [[hat]] einen Hund und er [[ist]] braun.' })
    const felder = [feld('f0', 1, 'luecke', '-1.luecke.0'), feld('f1', 1, 'luecke', '-1.luecke.1')]
    const e = autoPruefen([blattAufgabe(1, b)], felder, { f0: 'Hat', f1: 'sind' })
    expect(e.marken).toEqual({ f0: { m: 'r', w: 'Hat' }, f1: { m: 'f', w: 'sind' } })
    expect(einschaetzungAus(e.aufgaben['1'].richtig, e.aufgaben['1'].gesamt)).toBe('teilweise')
  })

  it('Zuordnen mit Buchstaben, Ordnen mit Nummern', () => {
    const z = aufgabe({ kind: 'matching', left: ['L1', 'L2'], right: ['R1', 'R2'], pairs: [1, 0] })
    const o = aufgabe({ kind: 'ordering', items: ['erst', 'dann'], displayOrder: [1, 0] })
    const felder = [feld('f0', 1, 'text', '-1.zuordnen.0'), feld('f1', 1, 'text', '-1.zuordnen.1'), feld('f2', 2, 'text', '-1.ordnen.0'), feld('f3', 2, 'text', '-1.ordnen.1')]
    const e = autoPruefen([blattAufgabe(1, z), blattAufgabe(2, o)], felder, { f0: 'B)', f1: 'b', f2: '2', f3: '1.' })
    expect(e.marken).toEqual({ f0: { m: 'r', w: 'B)' }, f1: { m: 'f', w: 'b' }, f2: { m: 'r', w: '2' }, f3: { m: 'r', w: '1.' } })
    expect(einschaetzungAus(e.aufgaben['2'].richtig, e.aufgaben['2'].gesamt)).toBe('sicher')
  })

  it('passt die Zahl der Felder nicht zum Schlüssel, wird nicht geprüft; offene Teile → nicht nur automatisch', () => {
    const b = aufgabe({}, { parts: [teil('a', { kind: 'gapText', gapText: 'A [[b]] c [[d]]' }), teil('b', { kind: 'lines', count: 2 })] })
    // nur eine Lücke gemessen (z. B. eine fremde Lücke im Merkkasten fehlt) – keine Marken
    expect(autoPruefen([blattAufgabe(1, b)], [feld('f0', 1, 'luecke', '0.luecke.0')], { f0: 'b' }).marken).toEqual({})
    const felder = [feld('f0', 1, 'luecke', '0.luecke.0'), feld('f1', 1, 'luecke', '0.luecke.1'), feld('f2', 1, 'zeilen')]
    const e = autoPruefen([blattAufgabe(1, b)], felder, { f0: 'b', f1: 'x', f2: 'Text' })
    expect(e.aufgaben['1']).toEqual({ richtig: 1, gesamt: 2, nurAuto: false })
  })

  it('ältere Freigabe ohne Schlüssel: aus der Erwartung geprüft', () => {
    const b = aufgabe({ kind: 'multipleChoice', options: ['went', 'goed'], correct: [0] })
    const ohneSchluessel: BlattAufgabe = { nr: 1, anweisung: 'A', erwartung: describeBlock(b) }
    const e = autoPruefen([ohneSchluessel], [feld('f0', 1, 'kreuz', '-1.mc.0'), feld('f1', 1, 'kreuz', '-1.mc.1')], { f0: 'x' })
    expect(e.marken.f0.m).toBe('r')
  })
})

describe('Kästchen für die KI und Verlauf', () => {
  it('angekreuzt mit dem Text der Möglichkeit statt „Kästchen 7" (zählte alle Felder)', () => {
    const a: BlattAufgabe[] = [{ nr: 1, anweisung: 'Kreuze an.', erwartung: '' }]
    const felder = [feld('f0', 1, 'zeilen'), feld('f1', 1, 'kreuz', '-1.mc.0', 'a) Paris'), feld('f2', 1, 'kreuz', '-1.mc.1', 'b) Berlin'), feld('f3', 1, 'kreuz')]
    const text = blattAbgabeText(a, felder, { f0: 'Hauptstadt', f2: 'x', f3: 'x' })
    expect(text).toContain('1) Hauptstadt')
    expect(text).toContain('angekreuzt: b) Berlin')
    // Ohne Text: unter den Kästchen gezählt (drittes Kästchen), nicht unter allen Feldern (viertes)
    expect(text).toContain('Kästchen 3: angekreuzt')
    expect(text).not.toContain('Kästchen 4')
  })

  it('Einträge vom Einreichen zählen nicht als „prüfen lassen"; Marken gelten nur für unveränderte Felder', () => {
    const verlauf = {
      '1': [{ einschaetzung: 'teilweise' }, { einschaetzung: 'sicher', abgabe: 1, marken: { f0: { m: 'r' as const, w: 'x' } } }],
      '2': [{ einschaetzung: 'noch nicht', abgabe: 1, marken: { f3: { m: 'f' as const, w: 'gehte' } } }, { einschaetzung: 'teilweise' }]
    }
    expect(pruefRunden(verlauf['1'])).toBe(1)
    const m = markenAusVerlauf(verlauf)
    expect(Object.keys(m)).toEqual(['f0', 'f3'])
    expect(markeGilt(m.f3, ' gehte ')).toBe(true)
    expect(markeGilt(m.f3, 'ging')).toBe(false)
  })

  it('offene Aufgaben: eine Anfrage, Antworten nur zu den gefragten Nummern', () => {
    const anfrage = abgabeAufgabenAnfrage([
      { aufgabe: { nr: 2, anweisung: 'Nenne zwei Ursachen.', erwartung: 'Regen, Wind' }, antwort: 'Regen' },
      { aufgabe: { nr: 4, anweisung: 'Erkläre.', erwartung: 'Weil …' }, antwort: 'Darum.' }
    ])
    expect(anfrage.schemaName).toBe('blatt_abgabe_aufgaben')
    expect(anfrage.user).toContain('AUFGABE 2')
    expect(anfrage.user).toContain('AUFGABE 4')
    expect(anfrage.user).toContain('nicht verraten')
    const aus = abgabeAufgabenAus(
      {
        aufgaben: [
          { nr: 2, einschaetzung: 'teilweise', hinweis: 'Eine Ursache fehlt.' },
          { nr: 9, einschaetzung: 'sicher', hinweis: 'x' },
          { nr: 4, einschaetzung: 'quatsch', hinweis: 'Begründe mit dem Text.' }
        ]
      },
      [2, 4]
    )
    expect(aus).toEqual({
      '2': { einschaetzung: 'teilweise', hinweis: 'Eine Ursache fehlt.' },
      '4': { einschaetzung: 'noch nicht', hinweis: 'Begründe mit dem Text.' }
    })
  })
})
