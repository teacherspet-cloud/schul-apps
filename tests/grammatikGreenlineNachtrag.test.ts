import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { bankAufgabeBereinigt, wortschatzStandServer } from '../src/server/grammatikBank'
import { selbsttest } from '../src/shared/grammatikSelbsttest'
import { formWoerter, unbekannteWoerter } from '../src/shared/lehrwerkWortschatz'
import { pruefeGrammatik } from '../src/shared/grammatiktrainer'

/*
 * Fehlende Green-Line-Formen, Nachtrag (14.11.2026) zu Runde 1–3: question tags mit Vorgabe in Klammern (in Runde 3 von der App wegen „Lücke ohne Grundwort“
 * gestrichen), present perfect Erfahrung nur als Aussagesätze, Einzelfelder – gleicher Ablauf und gleiche Prüfungen wie Runde 1.
 */
type Datei = {
  regeln: Record<string, { titel: string; erklaerung: string; beispiele: string[] }>
  neu: { schluessel: string; aufgabe: Record<string, unknown> }[]
}
const d = JSON.parse(readFileSync('resources/grammatik-bank/greenline-nachtrag-2026-11-14.json', 'utf8')) as Datei

describe('Green Line Nachtrag Runde 1–3', () => {
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
    expect(d.neu.length).toBeGreaterThan(90)
    expect(befunde).toEqual([])
  })

  it('alle Formen der Runde vertreten, je Schlüssel eine Regelkarte', () => {
    const da = new Set(d.neu.map((e) => e.schluessel))
    for (const k of ['en.verb.present_perfect/erfahrung', 'en.syn.question_tags/be', 'en.syn.question_tags/sonderfaelle'])
      expect(da.has(k)).toBe(true)
    expect(da.size).toBe(13)
    for (const k of da) expect(d.regeln[k]?.titel).toBeTruthy()
  })

  it('Klasse aus der frühesten Einführung', () => {
    expect(wortschatzStandServer('en.syn.question_tags/be', 'en')?.jahrgang).toBe(6)
    expect(wortschatzStandServer('en.pron.indefinite/else', 'en')?.stelle).toMatchObject({ buch: 'Green Line 2', unit: 'Unit 3' })
  })
})
