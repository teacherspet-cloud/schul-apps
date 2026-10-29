import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { bankPaket, type BankEintrag } from '../src/shared/grammatikBank'
import { selbsttest } from '../src/shared/grammatikSelbsttest'
import { aufgabeMangel, satzanfangVerraet } from '../src/shared/grammatikAufgabenRegeln'
import { paketBereinigt } from '../src/shared/grammatiktrainer'

/*
 * Prüfung der echten Bank-Aufgaben im neuen Stil (28.10.2026, Wunsch der Lehrkraft: „Tests, die sicherstellen, dass die
 * Aufgaben lösbar und sinnvoll sind"): die Aufgaben des Probelaufs mit echter KI (vier englische Teilformen, 141 Aufgaben)
 * – jede muss den App-Weg überstehen (paketBereinigt), ohne Mangel sein und den Selbsttest bestehen (eigene Lösung gilt,
 * falsche Möglichkeiten gelten nicht, Aufbau passt zum Format).
 */
const daten = JSON.parse(readFileSync('tests/daten/grammatik-bank-englisch-2026-10-28.json', 'utf8')) as { eintraege: BankEintrag[] }

describe('Echte Bank-Aufgaben (Probelauf 28.10.2026)', () => {
  const befunde: string[] = []
  let geprueft = 0
  for (const e of daten.eintraege) {
    const paket = bankPaket(e.schluessel, [e])
    const bereinigt = paketBereinigt(paket, e.schluessel)
    if (bereinigt.aufgaben.length !== e.aufgaben.length) befunde.push(`${e.schluessel}: ${e.aufgaben.length - bereinigt.aufgaben.length} Aufgaben fallen beim Bereinigen weg`)
    for (const a of bereinigt.aufgaben) {
      geprueft++
      const m = [aufgabeMangel(a), ...selbsttest(a)].filter(Boolean)
      if (m.length) befunde.push(`${e.schluessel} · ${a.uebung ?? ''} · ${a.art} · „${(a.satz || a.anweisung).slice(0, 70)}“: ${m.join('; ')}`)
    }
  }
  it('alle Aufgaben lösbar; zurückgestellt nur: verräterischer Satzanfang (4), Platzhalter statt Name (5), verräterische Möglichkeiten (7)', () => {
    expect(geprueft).toBeGreaterThan(100)
    // Frage der Lehrkraft (28.10.2026): „Woher wissen die Schüler, dass ‚Ella was watering the plants' kommen müsste?"
    expect(
      befunde.filter((b) => !b.includes('Satzanfang verrät die Lösung') && !b.includes('Platzhalter statt Name') && !b.includes('Möglichkeiten verraten'))
    ).toEqual([])
    // Befund der Lehrkraft 29.10.2026 („Wähle alle Wortgruppen mit an"): Sortieren nach sichtbarem will/going to bzw. was/were
    expect(befunde.filter((b) => b.includes('Möglichkeiten verraten'))).toHaveLength(7)
    expect(befunde.filter((b) => b.includes('Satzanfang verrät die Lösung'))).toHaveLength(4)
    expect(befunde.filter((b) => b.includes('Platzhalter statt Name'))).toHaveLength(5)
  })
})

describe('Satzanfang verrät die Lösung', () => {
  const v = (anfang: string, satz: string, loesung: string, art: 'verbinden' | 'umformen' = 'verbinden'): boolean =>
    satzanfangVerraet({ art, anfang, satz, loesungen: [loesung] })
  it('erkennt Abschreiben', () => {
    expect(v('While the neighbours were talking, ...', 'The neighbours were talking. Ella was watering the plants.', 'While the neighbours were talking, Ella was watering the plants.')).toBe(true)
    expect(v('Were you', 'You were waiting for the bus.', 'Were you waiting for the bus?', 'umformen')).toBe(true)
  })
  it('lässt sinnvolle Satzanfänge gelten', () => {
    expect(v('I have a friend', 'I have a friend. She lives in York.', 'I have a friend who lives in York.')).toBe(false)
    expect(v('The neighbours', 'The neighbours were talking. Ella was watering the plants.', 'The neighbours were talking while Ella was watering the plants.')).toBe(false)
    expect(v('Maya', 'Maya started this course in September.', 'Maya has been in this course since September.', 'umformen')).toBe(false)
  })
})
