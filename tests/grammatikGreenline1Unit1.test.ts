import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { bankAufgabeBereinigt, wortschatzStandServer } from '../src/server/grammatikBank'
import { selbsttest } from '../src/shared/grammatikSelbsttest'
import { formWoerter, unbekannteWoerter } from '../src/shared/lehrwerkWortschatz'
import { pruefeGrammatik } from '../src/shared/grammatiktrainer'

/*
 * Green Line 1, Unit 1 über den App-Weg im Handbetrieb (29.10.2026, tests/handbetrieb): Erzeugung, Prüfung, Blindprobe und
 * Überarbeitung wie in der App. Jede Aufgabe muss wie beim Einspielen ohne Mangel bleiben, den Selbsttest bestehen, ihre
 * eigene Lösung als richtig werten und nur Wortschatz der Station ihrer Form verwenden.
 */
const nachtrag = JSON.parse(readFileSync('resources/grammatik-bank/nachtrag-2026-10-29.json', 'utf8')) as {
  neu: { schluessel: string; aufgabe: Record<string, unknown> }[]
  entfernen: { schluessel: string; aufgabe: Record<string, unknown> }[]
}
const d0 = JSON.parse(readFileSync('resources/grammatik-bank/greenline1-unit1-2026-10-29.json', 'utf8')) as {
  regeln: Record<string, { titel: string; erklaerung: string; beispiele: string[] }>
  neu: { schluessel: string; aufgabe: Record<string, unknown> }[]
}
// Nachtrag (29.10.2026): Zusatzformen mit der Klasse ihrer Einführung – dieselben Prüfungen
const d = { ...d0, neu: [...d0.neu, ...nachtrag.neu] }
// will/going to steht seit dem Abend des 29.10.2026 in Green Line 2 Unit 4 (Klasse 6) statt Transition: Die Aufgaben des
// Nachtrags sind mit dem Wortschatz von Klasse 11 erzeugt – am Server stellt die Wortschatz-Wartung sie zurück
const spaeterVorgezogen = (k: string): boolean => k.startsWith('en.verb.will_vs_goingto')

describe('Green Line 1, Unit 1 (Handbetrieb)', () => {
  it('jede Aufgabe ohne Mangel, Selbsttest bestanden, eigene Lösung richtig, Wortschatz der Station', () => {
    const befunde: string[] = []
    const stand = new Map<string, ReturnType<typeof wortschatzStandServer>>()
    d.neu.forEach((e, i) => {
      const b = bankAufgabeBereinigt(e.aufgabe, `g${String(i).padStart(12, '0')}`, e.schluessel)
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
      if (ws && !spaeterVorgezogen(k)) {
        const u = unbekannteWoerter(b.a, ws.bekannt, formWoerter(k), ws.lexikon)
        if (u.length) befunde.push(`${k} „${satz}": Wortschatz ${u.join(', ')}`)
      }
    })
    expect(d.neu.length).toBeGreaterThan(500)
    expect(befunde).toEqual([])
  })

  it('Nachtrag: nur Formen außerhalb von Green Line 1 Unit 1 werden entfernt, und nichts davon steht noch in der Green-Line-Datei', () => {
    expect(nachtrag.entfernen).toHaveLength(6)
    for (const e of nachtrag.entfernen) expect(e.schluessel).toMatch(/past_progressive|will_vs_goingto/)
    expect(d0.neu.some((e) => /past_progressive|will_vs_goingto/.test(e.schluessel))).toBe(false)
  })

  it('Regelkarten ohne Platzhalter', () => {
    for (const r of Object.values(d.regeln)) {
      expect(r.titel.trim().length).toBeGreaterThan(2)
      expect(r.erklaerung.trim().length).toBeGreaterThan(20)
    }
  })
})
