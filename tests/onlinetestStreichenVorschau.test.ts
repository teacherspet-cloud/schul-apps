import { describe, expect, it } from 'vitest'
import { antwortAlsText, bewerte, falschesWortKern, loesungAlsText, onlineFassung, summe } from '../src/renderer/src/modules/onlinetest/kern'
import { blattBereinigt, vorschauEinarbeiten, vorschauFaelle } from '../src/server/onlinetest'
import type { Block, Variant } from '../src/renderer/src/modules/vokabeltest/model/types'

/*
 * 02.11.2026: „Correct the mistakes" online mit Durchstreichen (ein Punkt für Streichen + richtiges Wort), Blatt der
 * Lernenden ohne Skripte, KI-Prüfung der Vorschau (Fälle und Einarbeiten wie nach einer echten Abgabe).
 */
const variante: Variant = {
  id: 'A',
  label: 'A',
  blocks: [
    {
      id: 'w',
      kind: 'gap',
      taskType: 'wrongWord',
      title: 'Correct the mistakes',
      instruction: 'Find it.',
      pointsPerItem: 1,
      items: [{ id: 'i1', sentences: [{ before: 'Our plane will', after: 'at 3 p.m.' }], answer: 'take off', hint: 'take up' }],
      wordBank: false,
      firstLetterHint: false,
      extraBankWords: []
    },
    {
      id: 'o',
      kind: 'open',
      taskType: 'mediation',
      title: 'Mediation',
      instruction: 'Say it in English.',
      pointsPerItem: 2,
      items: [{ id: 'o1', prompt: 'Die Preise sind wettbewerbsfähig.', modelAnswer: 'The prices are competitive.', lines: 2 }]
    }
  ] as Block[]
}

describe('Correct the mistakes online', () => {
  const f = onlineFassung(variante)
  const e = f.aufgaben[0].eintraege[0]
  it('Satz als antippbare Wörter, falsches Wort unmarkiert, dazu das Feld', () => {
    expect(e.felder.map((x) => x.art)).toEqual(['streichen', 'text'])
    expect(e.felder[0].optionen!.map((o) => o.text).join(' ')).toBe('Our plane will take up at 3 p.m.')
    expect(e.hinweis).toBeUndefined()
    expect(e.text).toBeUndefined()
  })
  it('ein Punkt nur für Streichen UND richtiges Wort', () => {
    const fx = e.felder[0].id
    const fw = e.felder[1].id
    const einheit = f.einheiten.find((x) => x.felder.includes(fw))!.id
    expect(bewerte(f, { [fx]: '3,4', [fw]: 'take off' })[einheit].status).toBe('richtig')
    expect(bewerte(f, { [fx]: '2', [fw]: 'take off' })[einheit].status).toBe('falsch')
    expect(bewerte(f, { [fw]: 'take off' })[einheit].status).toBe('falsch')
    expect(antwortAlsText('3,4', e.felder[0].optionen)).toBe('take up')
    expect(antwortAlsText('2', e.felder[0].optionen)).toBe('will')
  })
})

describe('Blatt für Lernende', () => {
  it('ohne Skripte und Ereignis-Attribute', () => {
    const b = blattBereinigt('<html><head><script>alert(1)</script></head><body><p onclick="x()">Hi</p><a href="javascript:x">a</a></body></html>')!
    expect(b).not.toMatch(/script|onclick|javascript:/i)
    expect(b).toContain('<p>Hi</p>')
    expect(blattBereinigt(42)).toBeNull()
  })
})

describe('KI-Prüfung der Vorschau', () => {
  const f = onlineFassung(variante)
  const fx = f.aufgaben[0].eintraege[0].felder[0].id
  const fw = f.aufgaben[0].eintraege[0].felder[1].id
  const fo = f.aufgaben[1].eintraege[0].felder[0].id
  const antworten = { [fx]: '3,4', [fw]: 'take of', [fo]: 'The prices are very competitive.' }
  it('bildet Fälle für freie Antworten und abweichende Wörter', () => {
    const b = bewerte(f, antworten)
    const faelle = vorschauFaelle(f, antworten, b)
    expect(faelle.map((x) => x.art).sort()).toEqual(['ki', 'wort'])
    const urteile = new Map(
      faelle.map((x) => [x.id, { id: x.id, urteil: x.art === 'ki' ? ('richtig' as const) : ('kleinerFehler' as const), richtig: x.art === 'ki', begruendung: 'ok' }])
    )
    const neu = vorschauEinarbeiten(f, b, faelle, urteile)
    expect(summe(neu)).toBe(2)
    expect(Object.values(neu).some((x) => x.pruefen === 'kleinerFehler')).toBe(true)
  })
})

describe('Correct the mistakes: Kern der Abweichung', () => {
  const v: Variant = {
    id: 'A',
    label: 'A',
    blocks: [
      {
        id: 'w',
        kind: 'gap',
        taskType: 'wrongWord',
        title: 'Correct the mistakes',
        instruction: 'Find it.',
        pointsPerItem: 1,
        items: [{ id: 'i1', sentences: [{ before: 'The two phones are very similar', after: 'design, but the second one has a much better camera.' }], answer: 'in terms of', hint: 'in times of' }],
        wordBank: false,
        firstLetterHint: false,
        extraBankWords: []
      }
    ] as Block[]
  }
  const f = onlineFassung(v)
  const [fx, fw] = f.aufgaben[0].eintraege[0].felder
  const einheit = f.einheiten[0].id
  const idx = (wort: string): string => fx.optionen!.find((o) => o.text === wort)!.wert
  it('„times" streichen und „terms" schreiben genügt (Befund 02.11.2026)', () => {
    expect(falschesWortKern('in times of', 'in terms of')).toMatchObject({ vorne: 1, hinten: 1, falsch: 'times', richtig: 'terms' })
    expect(bewerte(f, { [fx.id]: idx('times'), [fw.id]: 'terms' })[einheit].status).toBe('richtig')
  })
  it('die ganze Wendung zu streichen und zu schreiben bleibt richtig, zu wenig/falsch gestrichen nicht', () => {
    const ganz = [idx('in'), idx('times'), idx('of')].join(',')
    expect(bewerte(f, { [fx.id]: ganz, [fw.id]: 'in terms of' })[einheit].status).toBe('richtig')
    // Die komplette Korrektur gilt in jeder Kombination (Wunsch der Lehrkraft 02.11.2026)
    expect(bewerte(f, { [fx.id]: idx('times'), [fw.id]: 'in terms of' })[einheit].status).toBe('richtig')
    expect(bewerte(f, { [fx.id]: ganz, [fw.id]: 'terms' })[einheit].status).toBe('richtig')
    expect(bewerte(f, { [fx.id]: `${idx('in')},${idx('times')}`, [fw.id]: 'terms' })[einheit].status).toBe('richtig')
    expect(bewerte(f, { [fx.id]: idx('in'), [fw.id]: 'terms' })[einheit].status).toBe('falsch')
    expect(bewerte(f, { [fx.id]: idx('similar'), [fw.id]: 'terms' })[einheit].status).toBe('falsch')
    expect(loesungAlsText(f.loesungen[fx.id], fx.optionen).split(' / ')[0]).toBe('times')
  })
  it('Kern bei gleichen Rändern sonst unverändert, nie leer', () => {
    expect(falschesWortKern('take up', 'take off')).toMatchObject({ falsch: 'up', richtig: 'off' })
    expect(falschesWortKern('make', 'do')).toMatchObject({ vorne: 0, hinten: 0, falsch: 'make', richtig: 'do' })
    expect(falschesWortKern('a', 'a')).toMatchObject({ falsch: 'a', richtig: 'a' })
  })
})
