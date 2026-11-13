import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { bankAufgabeBereinigt, wortschatzStandServer } from '../src/server/grammatikBank'
import { selbsttest } from '../src/shared/grammatikSelbsttest'
import { formWoerter, unbekannteWoerter } from '../src/shared/lehrwerkWortschatz'
import { pruefeGrammatik } from '../src/shared/grammatiktrainer'

/*
 * Fehlende Green-Line-Formen, Runde 1 (13.11.2026, Auftrag der Lehrkraft: „Entwirf die Übungen für die noch fehlenden
 * Grammatikformen von Green Line … sinnvolle, machbare und zielführende Aufgaben, die auch zu den Vokabeln (und dem Thema)
 * der jeweiligen Unit und Station passen"): Green Line 1 Unit 4 und Green Line 2 Welcome back, Unit 1, Unit 2 über den
 * App-Weg im Handbetrieb (Stationsthema im Auftrag, Prüfung, Blindprobe, Überarbeitung, zweite Blindprobe). Jede Aufgabe muss
 * wie beim Einspielen ohne Mangel bleiben, den Selbsttest bestehen, ihre eigene Lösung als richtig werten und nur Wortschatz
 * der Station ihrer Form nutzen.
 */
type Datei = {
  regeln: Record<string, { titel: string; erklaerung: string; beispiele: string[] }>
  neu: { schluessel: string; aufgabe: Record<string, unknown> }[]
}
const d = JSON.parse(readFileSync('resources/grammatik-bank/greenline1-unit4-greenline2-unit1-2-2026-11-13.json', 'utf8')) as Datei

describe('Green Line Runde 1 (GL1 Unit 4, GL2 bis Unit 2)', () => {
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
    expect(d.neu.length).toBeGreaterThan(1600)
    expect(befunde).toEqual([])
  })

  it('alle Formen der Runde vertreten, je Schlüssel eine Regelkarte', () => {
    const da = new Set(d.neu.map((e) => e.schluessel))
    for (const k of ['en.noun.quantifiers/some-any', 'en.verb.present_contrast/zustandsverben', 'en.verb.past_simple/was-were', 'en.verb.past_simple/aussprache', 'en.verb.going_to/anzeichen', 'en.adj.comparison/unregelmaessig'])
      expect(da.has(k)).toBe(true)
    expect(da.size).toBe(42)
    for (const k of da) expect(d.regeln[k]?.titel).toBeTruthy()
  })

  it('Klasse 5 ohne did/will, Klasse aus der frühesten Einführung', () => {
    const gl1 = d.neu.filter((e) => /quantifiers|present_progressive|present_contrast|count_uncount|short_answers/.test(e.schluessel))
    const verboten = gl1.filter((e) => /\b(did|didn[’']t|will|won[’']t)\b/i.test(JSON.stringify(e.aufgabe)))
    expect(verboten.map((e) => String(e.aufgabe.satz ?? e.aufgabe.anweisung).slice(0, 60))).toEqual([])
    expect(wortschatzStandServer('en.verb.going_to/absicht', 'en')?.jahrgang).toBe(6)
    expect(wortschatzStandServer('en.noun.quantifiers/some-any', 'en')?.stelle).toMatchObject({ buch: 'Green Line 1', unit: 'Unit 4' })
  })

  it('Formwörter der Runde: worse/worst bei der Steigerung, ever beim present perfect, anybody bei den Indefinitpronomen', () => {
    expect(formWoerter('en.adj.comparison/unregelmaessig')).toEqual(expect.arrayContaining(['worse', 'worst']))
    expect(formWoerter('en.verb.present_perfect/erfahrung')).toContain('ever')
    expect(formWoerter('en.pron.indefinite/some-any-body')).toEqual(expect.arrayContaining(['anybody', 'anyone', 'nowhere', 'no-one']))
  })
})
