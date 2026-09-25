import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { textSammler } from '../src/main/services/ai/textstrom'

/*
 * Gemeldet von der Lehrkraft (24.09.2026): Auf einem Arbeitsblatt stand bei den nützlichen
 * Wendungen „Die wichtigste Einschränkung war ���" – drei Ersatzzeichen statt „…".
 *
 * Ursache: Die Antwort der KI kommt in Stücken, deren Grenzen an beliebigen BYTES liegen.
 * Wurde jedes Stück für sich in Text umgewandelt, zerfiel ein Zeichen, das über die Grenze
 * reichte. Deshalb war „Einschränkung" heil und das „…" kaputt – reiner Zufall, wo die
 * Grenze lag. Genau das halten diese Tests fest.
 */

/** Zerlegt Text in Byte-Stücke – so, wie ein Prozess ihn liefern würde. */
const stuecke = (text: string, schnitt: number): Buffer[] => {
  const bytes = Buffer.from(text, 'utf8')
  return [bytes.subarray(0, schnitt), bytes.subarray(schnitt)]
}

describe('Text aus einem Datenstrom einsammeln', () => {
  const satz = 'The main limitation was … – Die wichtigste Einschränkung war …'

  it('hält das Auslassungszeichen zusammen, egal wo geschnitten wird', () => {
    const bytes = Buffer.from(satz, 'utf8').length
    for (let schnitt = 1; schnitt < bytes; schnitt++) {
      const s = textSammler()
      for (const teil of stuecke(satz, schnitt)) s.push(teil)
      expect(s.text(), `Schnitt nach Byte ${schnitt}`).toBe(satz)
    }
  })

  it('zeigt, was das alte Vorgehen falsch machte', () => {
    /*
     * Zum Vergleich – und damit klar bleibt, warum es diesen Sammler gibt: Stückweise
     * umgewandelt entstehen genau die Ersatzzeichen, die auf dem Arbeitsblatt standen.
     */
    // Mitten in das letzte „…" schneiden – dort, wo es die Lehrkraft erwischt hat
    const vorDemZeichen = Buffer.from(satz.slice(0, satz.lastIndexOf('…')), 'utf8').length
    const kaputt = stuecke(satz, vorDemZeichen + 1)
      .map((b) => b.toString())
      .join('')
    expect(kaputt).not.toBe(satz)
    expect(kaputt).toContain('�')
  })

  it('hält auch Umlaute über die Grenze hinweg zusammen', () => {
    const s = textSammler()
    const bytes = Buffer.from('Einschränkung', 'utf8')
    // Mitten in das „ä" hinein schneiden
    s.push(bytes.subarray(0, 9))
    s.push(bytes.subarray(9))
    expect(s.text()).toBe('Einschränkung')
  })

  it('meldet fortlaufend die Länge, ohne den Rest schon mitzuzählen', () => {
    // Die Fortschrittsanzeige hängt daran: Sie zählt die Zeichen, die feststehen.
    const s = textSammler()
    const bytes = Buffer.from('ab…cd', 'utf8')
    s.push(bytes.subarray(0, 3))
    const zwischen = s.laenge()
    s.push(bytes.subarray(3))
    expect(zwischen).toBe(2)
    expect(s.text()).toBe('ab…cd')
  })

  it('gibt zurück, was ein Stück an fertigem Text beisteuert', () => {
    const s = textSammler()
    const bytes = Buffer.from('…', 'utf8')
    expect(s.push(bytes.subarray(0, 2))).toBe('')
    expect(s.push(bytes.subarray(2))).toBe('…')
  })
})

describe('Kein Rückfall in die stückweise Umwandlung', () => {
  /*
   * Der Fehler war eine Zeile: `stdout += d`. Sie sieht harmlos aus und wäre beim nächsten
   * Umbau schnell wieder da – sichtbar würde sie erst wieder auf einem Arbeitsblatt, an
   * einer zufälligen Stelle. Deshalb wacht dieser Test über die Quelle selbst.
   */
  const quellen = ['../src/main/services/ai/cli.ts', '../src/main/services/ai/setup.ts']
  /** Der Rumpf eines `on('data', …)`-Behandlers */
  const MUSTER = /on\('data',([\s\S]{0,260}?)\}\)/g
  /** Genau die Schreibweisen, die ein Zeichen an der Stückgrenze zerreißen */
  const VERBOTEN = /\+=\s*d\b|d\.toString\(\)|chunk\.toString\(\)/

  it.each(quellen)('%s wandelt keine Stücke einzeln in Text um', (datei) => {
    const quelle = readFileSync(resolve(__dirname, datei), 'utf8')
    // Innerhalb eines 'data'-Behandlers darf weder `+= d` noch `d.toString()` stehen
    const behandler = [...quelle.matchAll(MUSTER)].map((m) => m[1])
    expect(behandler.length, `In ${datei} wurde kein 'data'-Behandler gefunden – die Prüfung wäre wertlos`).toBeGreaterThan(0)
    for (const b of behandler) {
      expect(b, `Stückweise Umwandlung in ${datei}: ${b.trim().slice(0, 120)}`).not.toMatch(VERBOTEN)
    }
  })

  it('setzt in beiden Dateien den Sammler ein', () => {
    for (const datei of quellen) {
      const quelle = readFileSync(resolve(__dirname, datei), 'utf8')
      expect(quelle, `${datei} sammelt den Text nicht über den Sammler`).toContain('textSammler')
    }
  })
})
