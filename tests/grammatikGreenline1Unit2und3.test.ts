import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { bankAufgabeBereinigt, wortschatzStandServer } from '../src/server/grammatikBank'
import { selbsttest } from '../src/shared/grammatikSelbsttest'
import { formWoerter, unbekannteWoerter } from '../src/shared/lehrwerkWortschatz'
import { pruefeGrammatik } from '../src/shared/grammatiktrainer'

/*
 * Green Line 1, Unit 2 und Unit 3 über den App-Weg im Handbetrieb (04.11.2026, Auftrag der Lehrkraft „sorgfältig gut
 * geeignete Grammatikaufgaben"): Genitiv, simple present (bejaht, Schreibung, Fragen, Kurzantworten, Verneinung),
 * Wortstellung S-V-O, Objektpronomen, Fragewörter. Erzeugung, Prüfung, Blindprobe, Überarbeitung, zweite Blindprobe.
 * Vorgaben der Lehrkraft: „has" ab dem simple present erlaubt, Genitiv ohne Besitzer auf -s, keine Subjektfragen ohne do,
 * Fragewörter ohne which/whose/what kind of.
 */
const d = JSON.parse(readFileSync('resources/grammatik-bank/greenline1-unit2-3-2026-11-04.json', 'utf8')) as {
  regeln: Record<string, { titel: string; erklaerung: string; beispiele: string[] }>
  neu: { schluessel: string; aufgabe: Record<string, unknown> }[]
}

const texte = (e: { aufgabe: Record<string, unknown> }): string => JSON.stringify(e.aufgabe)

describe('Green Line 1, Unit 2 und Unit 3 (Handbetrieb)', () => {
  it('jede Aufgabe ohne Mangel, Selbsttest bestanden, eigene Lösung richtig, Wortschatz der Station', () => {
    const befunde: string[] = []
    const stand = new Map<string, ReturnType<typeof wortschatzStandServer>>()
    d.neu.forEach((e, i) => {
      const b = bankAufgabeBereinigt(e.aufgabe, `i${String(i).padStart(12, '0')}`, e.schluessel)
      const satz = String(e.aufgabe.satz ?? e.aufgabe.anweisung ?? '').slice(0, 60)
      if (!b) return befunde.push(`${e.schluessel} „${satz}": fällt beim Bereinigen weg`)
      if (b.pruefen) befunde.push(`${e.schluessel} „${satz}": ${b.pruefen}`)
      const st = selbsttest(b.a)
      if (st.length) befunde.push(`${e.schluessel} „${satz}": Selbsttest ${st[0]}`)
      if (['luecke', 'umformen', 'verbinden', 'frage', 'satzbau'].includes(b.a.art) && pruefeGrammatik(b.a, b.a.loesungen[0]).urteil !== 'richtig')
        befunde.push(`${e.schluessel} „${satz}": eigene Lösung nicht richtig`)
      const k = e.schluessel
      if (!stand.has(k)) stand.set(k, wortschatzStandServer(k, 'en'))
      const ws = stand.get(k)
      if (ws) {
        const u = unbekannteWoerter(b.a, ws.bekannt, formWoerter(k), ws.lexikon)
        if (u.length) befunde.push(`${k} „${satz}": Wortschatz ${u.join(', ')}`)
      }
    })
    expect(d.neu.length).toBeGreaterThan(700)
    expect(befunde).toEqual([])
  })

  it('je Schlüssel und Stufe 13 Aufgaben (4/4/3/1/1)', () => {
    const z = new Map<string, number>()
    for (const e of d.neu) z.set(`${e.schluessel}|${e.aufgabe.niveau}`, (z.get(`${e.schluessel}|${e.aufgabe.niveau}`) ?? 0) + 1)
    expect([...z.values()].every((n) => n === 13)).toBe(true)
    expect(z.size).toBe(19 * 3)
  })

  it('Vorgaben der Lehrkraft: kein have got, kein did/Vergangenheit, kein which/whose/what kind of', () => {
    for (const e of d.neu) {
      const t = texte(e)
      expect(t, t).not.toMatch(/\b(have|has) got\b/i)
      expect(t, t).not.toMatch(/\b(did|didn't)\b/i)
      expect(t, t).not.toMatch(/\b(which|whose)\b|what kind of/i)
    }
  })

  it('Genitiv (Station 1): kein simple present mit has, keine Besitzer auf -s/-x/-z', () => {
    for (const e of d.neu.filter((x) => x.schluessel.includes('genitive'))) {
      const t = texte(e)
      expect(t, t).not.toMatch(/\bhas\b/i)
      expect(t, t).not.toMatch(/\b[A-Z][a-z]*[sxz]['’]s?\b/)
    }
  })

  it('„has" gilt ab dem simple present als bekannt, beim Genitiv (vorher) nicht', () => {
    expect(wortschatzStandServer('en.verb.present_simple/bejahung', 'en')?.bekannt.has('has')).toBe(true)
    expect(wortschatzStandServer('en.noun.genitive/s-genitiv', 'en')?.bekannt.has('has')).toBe(false)
    expect(wortschatzStandServer('en.verb.present_simple/fragen', 'en')?.stelle).toMatchObject({ buch: 'Green Line 1', unit: 'Unit 3' })
  })
})
