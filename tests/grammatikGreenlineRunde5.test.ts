import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { bankAufgabeBereinigt, wortschatzStandServer } from '../src/server/grammatikBank'
import { selbsttest } from '../src/shared/grammatikSelbsttest'
import { formWoerter, unbekannteWoerter } from '../src/shared/lehrwerkWortschatz'
import { pruefeGrammatik } from '../src/shared/grammatiktrainer'

/*
 * Fehlende Green-Line-Formen, Runde 5 (14.11.2026, gleicher Auftrag wie Runde 1): Green Line 4 (simple present/progressive, AmE/BrE, present perfect, present
 * perfect progressive, indirekte Rede, Relativsätze ohne Komma, Bedingungssätze Typ 3, Gerundium/Infinitiv, make/let), Klasse 8 –
 * gleicher Ablauf und gleiche Prüfungen wie Runde 1.
 */
type Datei = {
  regeln: Record<string, { titel: string; erklaerung: string; beispiele: string[] }>
  neu: { schluessel: string; aufgabe: Record<string, unknown> }[]
}
const d = JSON.parse(readFileSync('resources/grammatik-bank/greenline4-2026-11-14.json', 'utf8')) as Datei

describe('Green Line Runde 5 (GL4)', () => {
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
    expect(d.neu.length).toBeGreaterThan(2000)
    expect(befunde).toEqual([])
  })

  it('alle Formen der Runde vertreten, je Schlüssel eine Regelkarte', () => {
    const da = new Set(d.neu.map((e) => e.schluessel))
    for (const k of ['en.verb.present_simple/fahrplan', 'en.var.ame/rechtschreibung', 'en.verb.present_perfect_prog/bildung', 'en.verb.ger_vs_inf/remember-forget'])
      expect(da.has(k)).toBe(true)
    expect(da.size).toBe(52)
    for (const k of da) expect(d.regeln[k]?.titel).toBeTruthy()
  })

  it('Klasse aus der frühesten Einführung', () => {
    expect(wortschatzStandServer('en.verb.present_perfect_prog/bildung', 'en')?.jahrgang).toBe(8)
    expect(wortschatzStandServer('en.var.ame/rechtschreibung', 'en')?.stelle).toMatchObject({ buch: 'Green Line 4' })
  })
})
