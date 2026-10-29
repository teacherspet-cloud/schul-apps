import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { bankAufgabeBereinigt, wortschatzStandServer } from '../src/server/grammatikBank'
import { selbsttest } from '../src/shared/grammatikSelbsttest'
import { formWoerter, unbekannteWoerter } from '../src/shared/lehrwerkWortschatz'
import { pruefeGrammatik } from '../src/shared/grammatiktrainer'

/*
 * Green Line 5, Unit 1 über den App-Weg im Handbetrieb (29.10.2026, Auftrag der Lehrkraft „gemäß der Vorgaben und
 * rigoroser Sinnhaftigkeits-, Plausibilitäts- und Machbarkeitskontrollen"): Erzeugung, Prüfung, Blindprobe, Überarbeitung,
 * zweite Blindprobe. Dazu will/going to (Vorhersage) neu für Klasse 6. Jede Aufgabe muss wie beim Einspielen ohne Mangel
 * bleiben, den Selbsttest bestehen, ihre eigene Lösung als richtig werten und nur Wortschatz der Station ihrer Form nutzen.
 */
const d = JSON.parse(readFileSync('resources/grammatik-bank/greenline5-unit1-2026-10-29.json', 'utf8')) as {
  regeln: Record<string, { titel: string; erklaerung: string; beispiele: string[] }>
  neu: { schluessel: string; aufgabe: Record<string, unknown> }[]
  entfernen?: unknown[]
}

describe('Green Line 5, Unit 1 (Handbetrieb)', () => {
  it('jede Aufgabe ohne Mangel, Selbsttest bestanden, eigene Lösung richtig, Wortschatz der Station', () => {
    const befunde: string[] = []
    const stand = new Map<string, ReturnType<typeof wortschatzStandServer>>()
    d.neu.forEach((e, i) => {
      const b = bankAufgabeBereinigt(e.aufgabe, `h${String(i).padStart(12, '0')}`, e.schluessel)
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
    expect(d.neu.length).toBeGreaterThan(1500)
    expect(befunde).toEqual([])
  })

  it('keine Teilform „perfekt-infinitiv" (Modal Perfect ist an der Station noch nicht bekannt)', () => {
    expect(d.neu.some((e) => e.schluessel.includes('perfekt-infinitiv'))).toBe(false)
  })

  it('Klasse aus der frühesten Einführung: will/going to für Klasse 6 (Green Line 2 Unit 4), Passiv-Grundformen Klasse 7', () => {
    expect(wortschatzStandServer('en.verb.will_vs_goingto/vorhersage-signal', 'en')?.jahrgang).toBe(6)
    expect(wortschatzStandServer('en.verb.passive_basic/bildung', 'en')?.jahrgang).toBe(7)
    expect(wortschatzStandServer('en.focus.cleft/it-cleft', 'en')?.jahrgang).toBe(9)
  })
})
