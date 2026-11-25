import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { bankAufgabeBereinigt, wortschatzStandServer } from '../src/server/grammatikBank'
import { selbsttest } from '../src/shared/grammatikSelbsttest'
import { formWoerter, unbekannteWoerter } from '../src/shared/lehrwerkWortschatz'
import { pruefeGrammatik } from '../src/shared/grammatiktrainer'

/*
 * Erste spanische Grammatik-Bank (20.–25.11.2026, Auftrag der Lehrkraft „orientier dich beim vokabular an dem aus dem
 * neueren apuntate 1. und erstell die übungen"): ¡Apúntate! 2 (Ausgabe 2016) im Handbetrieb – Erzeugung, Prüfung,
 * Blindprobe, Überarbeitung, weitere Blindproben. Jede Aufgabe muss wie beim Einspielen ohne Mangel bleiben, den Selbsttest
 * bestehen, ihre eigene Lösung als richtig werten und nur Wortschatz bis zur Stelle ihrer Form (mit Band 1 von 2024) nutzen.
 */
type Datei = {
  regeln: Record<string, { titel: string; erklaerung: string; beispiele: string[] }>
  neu: { schluessel: string; aufgabe: Record<string, unknown> }[]
}
const d = JSON.parse(readFileSync('resources/grammatik-bank/apuntate2016-2-2026-11-25.json', 'utf8')) as Datei

describe('¡Apúntate! 2 (Ausgabe 2016), Spanisch (Handbetrieb)', () => {
  it('jede Aufgabe ohne Mangel, Selbsttest bestanden, eigene Lösung richtig, Wortschatz bis zur Stelle', () => {
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
      if (!stand.has(k)) stand.set(k, wortschatzStandServer(k, 'es'))
      const ws = stand.get(k)
      if (ws) {
        const u = unbekannteWoerter(b.a, ws.bekannt, formWoerter(k), ws.lexikon, 'es')
        if (u.length) befunde.push(`${k} „${satz}": Wortschatz ${u.join(', ')}`)
      }
    })
    expect(d.neu.length).toBeGreaterThan(2500)
    expect(befunde).toEqual([])
  })

  it('alle Teilformen vertreten, je Schlüssel eine Regelkarte', () => {
    const da = new Set(d.neu.map((e) => e.schluessel))
    for (const k of ['es.pron.oi/mit-gustar', 'es.verb.gerundio/bildung']) expect(da.has(k)).toBe(true)
    expect([...da].filter((k) => !k.startsWith('mix:') && !k.startsWith('unit:')).length).toBeGreaterThan(40)
    for (const k of da) expect(d.regeln[k]?.titel).toBeTruthy()
  })

  it('Stelle aus dem Band 2016, Band 1 (2024) als Vorwissen', () => {
    expect(wortschatzStandServer('es.pron.oi/mit-gustar', 'es')?.stelle).toMatchObject({ buch: '¡Apúntate! 2 (Ausgabe 2016)' })
  })
})
