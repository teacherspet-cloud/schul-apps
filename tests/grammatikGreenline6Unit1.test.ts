import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { bankAufgabeBereinigt, wortschatzStandServer } from '../src/server/grammatikBank'
import { selbsttest } from '../src/shared/grammatikSelbsttest'
import { formWoerter, unbekannteWoerter } from '../src/shared/lehrwerkWortschatz'
import { pruefeGrammatik } from '../src/shared/grammatiktrainer'

/*
 * Green Line 6, Unit 1 über den App-Weg im Handbetrieb (30.10.2026, Auftrag der Lehrkraft „auf Basis unserer Vorgaben"):
 * Zeitenüberblick, Passiv in Berichten, unpersönlicher Stil, Zukunft mit Präsensformen. Erzeugung, Prüfung, Blindprobe,
 * Überarbeitung, zweite Blindprobe. Jede Aufgabe muss wie beim Einspielen ohne Mangel bleiben, den Selbsttest bestehen,
 * ihre eigene Lösung als richtig werten und nur Wortschatz der Station ihrer Form nutzen.
 */
const d = JSON.parse(readFileSync('resources/grammatik-bank/greenline6-unit1-2026-10-30.json', 'utf8')) as {
  regeln: Record<string, { titel: string; erklaerung: string; beispiele: string[] }>
  neu: { schluessel: string; aufgabe: Record<string, unknown> }[]
}

describe('Green Line 6, Unit 1 (Handbetrieb)', () => {
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
    expect(d.neu.length).toBeGreaterThan(500)
    expect(befunde).toEqual([])
  })

  it('kein future perfect progressive (an der Station nicht eingeführt)', () => {
    const text = JSON.stringify(d.neu)
    expect(text).not.toMatch(/will have been \w+ing/i)
  })

  // Optionale Trailer zählen nicht als Einführung (30.10.2026): Zukunft mit Präsensformen erst Green Line 6 Unit 1
  it('Klasse aus der frühesten Einführung: Zukunft mit Präsensformen Klasse 10 (Trailer 1 von Green Line 4 zählt nicht), Passiv in Berichten Klasse 10', () => {
    expect(wortschatzStandServer('en.verb.future_present/fahrplan', 'en')?.stelle.buch).toBe('Green Line 6')
    expect(wortschatzStandServer('en.verb.future_present/fahrplan', 'en')?.jahrgang).toBe(10)
    expect(wortschatzStandServer('en.verb.going_to/bildung', 'en')?.stelle).toMatchObject({ buch: 'Green Line 2', unit: 'Unit 2' })
    expect(wortschatzStandServer('en.verb.passive_reporting/it-is-said', 'en')?.jahrgang).toBe(10)
  })
})
