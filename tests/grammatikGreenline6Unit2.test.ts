import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { bankAufgabeBereinigt, wortschatzStandServer } from '../src/server/grammatikBank'
import { selbsttest } from '../src/shared/grammatikSelbsttest'
import { formWoerter, unbekannteWoerter } from '../src/shared/lehrwerkWortschatz'
import { pruefeGrammatik } from '../src/shared/grammatiktrainer'

/*
 * Green Line 6, Unit 2 (und Rest Unit 1) über den App-Weg im Handbetrieb (12.11.2026, Auftrag der Lehrkraft: „ergänze die
 * fehlenden Grammatikübungen für Green Line 6 … geeignet, verständlich, machbar und sinnvoll"): Modal expressions,
 * Bedingungssätze Typ 1–3, Phrasal verbs, Infinitive, Gerund mit eigenem Subjekt. Erzeugung, Prüfung, Blindprobe,
 * Überarbeitung, weitere Blindproben. Jede Aufgabe muss wie beim Einspielen ohne Mangel bleiben, den Selbsttest bestehen,
 * ihre eigene Lösung als richtig werten und nur Wortschatz der Station ihrer Form nutzen.
 */
const d = JSON.parse(readFileSync('resources/grammatik-bank/greenline6-unit2-2026-11-12.json', 'utf8')) as {
  regeln: Record<string, { titel: string; erklaerung: string; beispiele: string[] }>
  neu: { schluessel: string; aufgabe: Record<string, unknown> }[]
}

describe('Green Line 6, Unit 2 (Handbetrieb)', () => {
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
    expect(d.neu.length).toBeGreaterThan(1700)
    expect(befunde).toEqual([])
  })

  it('alle Formen von Unit 2 vertreten, je Schlüssel eine Regelkarte', () => {
    const da = new Set(d.neu.map((e) => e.schluessel))
    for (const k of ['en.verb.modals_adv/ought-to', 'en.verb.used_to/would-gewohnheit', 'en.cond.type1/unless', 'en.cond.type3/inversion', 'en.verb.phrasal/dreiteilig', 'en.verb.infinitive/it-for-sb', 'en.verb.gerund/eigenes-subjekt'])
      expect(da.has(k)).toBe(true)
    for (const k of da) expect(d.regeln[k]?.titel).toBeTruthy()
  })

  // Vorgaben der Runde: „didn't used to" kommt nicht vor; Typ 1 (Klasse 6) ohne Typ 2/3
  it('kein „didn\'t used to", Typ 1 ohne would', () => {
    expect(JSON.stringify(d.neu)).not.toMatch(/didn[’']t used to/i)
    const typ1 = d.neu.filter((e) => e.schluessel.startsWith('en.cond.type1/'))
    const mitWould = typ1.filter((e) => /\bwould\b|'d\b/i.test(JSON.stringify(e.aufgabe)))
    expect(mitWould.map((e) => String(e.aufgabe.satz ?? e.aufgabe.anweisung).slice(0, 60))).toEqual([])
  })

  it('Klasse aus der frühesten Einführung: Typ 1 Klasse 6, Modal expressions Klasse 10', () => {
    expect(wortschatzStandServer('en.cond.type1/unless', 'en')?.jahrgang).toBe(6)
    expect(wortschatzStandServer('en.verb.modals_adv/ought-to', 'en')?.stelle).toMatchObject({ buch: 'Green Line 6', unit: 'Unit 2' })
  })
})
