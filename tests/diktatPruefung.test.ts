import { describe, expect, it } from 'vitest'
import { autoPruefen, diktatRueckmeldung, schluesselBereinigt } from '../src/shared/blattPruefung'
import type { BlattAufgabe, BlattFeld } from '../src/shared/blattFreigabe'
import { aufgabenSchluessel } from '../src/renderer/src/modules/arbeitsblatt/blattSchluessel'
import { niederschrift } from '../src/renderer/src/modules/arbeitsblatt/didactics/diktat'
import type { DiktatBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const d: DiktatBlock = {
  id: 'd1',
  type: 'diktat',
  title: 'Hund',
  form: 'klassisch',
  text: 'Der Hund / läuft über die Straße.',
  phaenomene: [],
  zielwoerter: ['Straße'],
  kommasDiktiert: false,
  zaehlart: 'isb',
  sechsAbProzent: 10
}

describe('Diktat beim Einreichen prüfen (26.11.2026)', () => {
  const schluessel = schluesselBereinigt(JSON.parse(JSON.stringify(aufgabenSchluessel(niederschrift(d), [d]))))!
  const aufgabe = { nr: 1, anweisung: 'Schreibe das Diktat mit.', erwartung: '', schluessel } as BlattAufgabe
  const felder: BlattFeld[] = [
    { id: 'f0', nr: 1, art: 'zeilen', seite: 0 },
    { id: 'f1', nr: 1, art: 'zeilen', seite: 0 }
  ]
  it('Schlüssel übersteht die Bereinigung am Server', () => {
    expect(schluessel.teile[0]).toMatchObject({ art: 'diktat', text: 'Der Hund läuft über die Straße.' })
  })
  it('zählt Fehler über alle Schreibfelder der Aufgabe, ohne KI', () => {
    const e = autoPruefen([aufgabe], felder, { f0: 'Der Hunt leuft', f1: 'über die Strasse.' })
    const a = e.aufgaben['1']
    expect(a.nurAuto).toBe(true)
    expect(a.diktat?.fehler).toBe(3)
    expect(a.diktat?.stellen.map((s) => s.kategorie)).toEqual(['auslaut', 'umlaut', 'slaute'])
  })
  it('Rückmeldung: erst nur markieren, in der letzten Runde mit richtiger Schreibung', () => {
    const a = autoPruefen([aufgabe], felder, { f0: 'Der Hunt läuft', f1: 'über die Straße.' }).aufgaben['1'].diktat!
    const vorher = diktatRueckmeldung(a, false)
    expect(vorher.markierungen[0]).toMatchObject({ zitat: 'Hunt', art: 'fehler' })
    expect(vorher.markierungen[0].text).not.toContain('Hund')
    expect(vorher.text).toContain('verbessere sie selbst')
    expect(diktatRueckmeldung(a, true).markierungen[0].text).toContain('„Hund“')
  })
  it('Lückendiktat: Lücken genau (Groß/klein zählt)', () => {
    const luecken = { ...d, form: 'lueckendiktat' as const }
    const s = schluesselBereinigt(JSON.parse(JSON.stringify(aufgabenSchluessel(niederschrift(luecken), [luecken]))))!
    const auf = { nr: 1, anweisung: '', erwartung: '', schluessel: s } as BlattAufgabe
    const e = autoPruefen([auf], [{ id: 'g0', nr: 1, art: 'luecke', seite: 0, bezug: '-1.luecke.0' }], { g0: 'straße' })
    expect(e.marken.g0.m).toBe('f')
  })
})
