import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { bankAufgabeBereinigt } from '../src/server/grammatikBank'
import { selbsttest } from '../src/shared/grammatikSelbsttest'
import { satzanfangVerraet } from '../src/shared/grammatikAufgabenRegeln'
import { stufeVon, zielJeFeld, UEBUNGEN, type BankEintrag } from '../src/shared/grammatikBank'
import { pruefeGrammatik } from '../src/shared/grammatiktrainer'

/*
 * Neufassung und Ergänzung von Hand (29.10.2026, Auftrag der Lehrkraft: „ohne den Umweg über ChatGPT"): Jede Aufgabe muss
 * wie beim Speichern ohne Mangel bleiben und den Selbsttest bestehen; danach hat jede Stufe der vier Formen genau 13
 * Aufgaben (4/4/3/1/1).
 */
const u = JSON.parse(readFileSync('resources/grammatik-bank/ueberarbeitung-2026-10-29.json', 'utf8')) as {
  ersetzen: Record<string, { schluessel: string; aufgabe: Record<string, unknown> }>
  neu: { schluessel: string; aufgabe: Record<string, unknown> }[]
}
const bank = JSON.parse(readFileSync('tests/daten/grammatik-bank-englisch-2026-10-28.json', 'utf8')) as { eintraege: BankEintrag[] }

describe('Neufassung und Ergänzung von Hand', () => {
  it('jede Aufgabe ohne Mangel und mit bestandenem Selbsttest', () => {
    const befunde: string[] = []
    const alle = [
      ...Object.entries(u.ersetzen).map(([id, e]) => {
        const alt = bank.eintraege.flatMap((x) => x.aufgaben).find((a) => a.id === id)!
        return { id, e: { ...e, aufgabe: { ...e.aufgabe, uebung: alt.uebung, niveau: alt.niveau } } }
      }),
      ...u.neu.map((e, i) => ({ id: `b${String(i).padStart(12, '0')}`, e }))
    ]
    for (const { id, e } of alle) {
      const b = bankAufgabeBereinigt(e.aufgabe, id, e.schluessel)
      if (!b) befunde.push(`${id}: fällt beim Bereinigen weg`)
      else if (b.pruefen || selbsttest(b.a).length) befunde.push(`${id} ${b.a.art}: ${b.pruefen} ${selbsttest(b.a).join('; ')}`)
      else if (satzanfangVerraet(b.a)) befunde.push(`${id}: Satzanfang verrät die Lösung`)
    }
    expect(alle).toHaveLength(29)
    expect(befunde).toEqual([])
  })

  it('danach je Stufe genau 13 Aufgaben', () => {
    const ersetzt = new Set(Object.keys(u.ersetzen))
    for (const e of bank.eintraege) {
      const aufgaben = [...e.aufgaben, ...u.neu.filter((x) => x.schluessel === e.schluessel).map((x) => x.aufgabe as unknown as BankEintrag['aufgaben'][number])]
      for (const st of ['g', 'm', 'a'] as const)
        for (const ue of UEBUNGEN)
          expect(aufgaben.filter((a) => a.uebung === ue && stufeVon(a) === st).length, `${e.schluessel} ${st} ${ue}`).toBe(zielJeFeld(ue))
      void ersetzt
    }
  })

  it('alle sinnvollen Reihenfolgen mit while gelten', () => {
    const b = bankAufgabeBereinigt({ ...u.ersetzen['b5e0383990e5d'].aufgabe, uebung: 'anwenden', niveau: 'm' }, 'b5e0383990e5d', 'en.verb.past_progressive/gleichzeitig')!
    for (const s of ['Ella was watering the plants while the neighbours were talking', 'While the neighbours were talking Ella was watering the plants.'])
      expect(pruefeGrammatik(b.a, s).urteil).toBe('richtig')
  })
})
