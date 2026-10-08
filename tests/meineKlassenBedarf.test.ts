/**
 * „Meine Klassen" (08.10.2026): Vokabeln im Handlungsbedarf (nur reife Wörter, frühes Zeichen für junge Kurse, ein
 * Eintrag je Klasse, Klick öffnet den Kurs) und das Ziel nach der Anmeldung (Lehrkräfte in die App). Rein, ohne Datenbank.
 */
import { describe, expect, it } from 'vitest'
import { vokabelBedarf } from '../src/server/klassen'
import { zielNachAnmeldung } from '../src/server/http'
import { hoechsteUnit } from '../src/server/grammatik'

const TAG = 86_400_000
const jetzt = Date.parse('2026-10-08T12:00:00Z')
const tagVor = (n: number): string => new Date(jetzt - n * TAG).toISOString().slice(0, 10)
const kurs = (o: Partial<Parameters<typeof vokabelBedarf>[0][number]> = {}): Parameters<typeof vokabelBedarf>[0][number] => ({
  id: 'k1',
  titel: '5b - Englisch',
  fach: 'Englisch',
  testTermin: null,
  sicherSchnitt: 0.1,
  ersterTag: tagVor(3),
  reifeWoerter: 0,
  ...o
})
const lernende = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Ben' },
  { id: 'c', name: 'Cem' }
]

describe('Vokabeln im Handlungsbedarf', () => {
  it('junger Kurs: kein „unter 30 % sicher", nur wer seit 7 Tagen nicht geübt hat', () => {
    const b = vokabelBedarf(
      [kurs()],
      {
        a: { reifSicher: 0, reifGesamt: 0, zuletzt: tagVor(0) },
        b: { reifSicher: 0, reifGesamt: 0, zuletzt: null },
        c: { reifSicher: 0, reifGesamt: 0, zuletzt: tagVor(1) }
      },
      lernende,
      'Englisch',
      jetzt
    )
    expect(b?.text).not.toMatch(/unter 30/)
    expect(b?.text).toMatch(/1 Lernende\/r hat in den letzten 7 Tagen nicht geübt: Ben/)
    expect(b?.art).toBe('inaktiv')
    expect(b?.ziel).toEqual({ modul: 'vokabeltraining', id: 'k1' })
  })
  it('alle aktiv im jungen Kurs: kein Eintrag', () => {
    const p = { reifSicher: 0, reifGesamt: 0, zuletzt: tagVor(0) }
    expect(vokabelBedarf([kurs()], { a: p, b: p, c: p }, lernende, 'Englisch', jetzt)).toBeNull()
  })
  it('seit 14 Tagen geübt: „unter 30 %" nur über reife Wörter, ein Eintrag für mehrere Kurse', () => {
    const b = vokabelBedarf(
      [kurs({ id: 'neu', ersterTag: tagVor(2) }), kurs({ id: 'alt', ersterTag: tagVor(20), reifeWoerter: 20 })],
      {
        a: { reifSicher: 2, reifGesamt: 20, zuletzt: tagVor(0) },
        b: { reifSicher: 10, reifGesamt: 20, zuletzt: tagVor(0) },
        c: { reifSicher: 0, reifGesamt: 0, zuletzt: tagVor(0) }
      },
      lernende,
      'Englisch',
      jetzt
    )
    expect(b?.art).toBe('foerdern')
    expect(b?.text).toMatch(/unter 30 % sicher \(Wörter seit mind\. 14 Tagen\): Ada$/)
    // Jüngster offener Kurs im Fach (Liste kommt nach Erstellung absteigend)
    expect(b?.ziel?.id).toBe('neu')
  })
  it('Testtermin vorne, Klick öffnet den Kurs mit dem Termin', () => {
    const b = vokabelBedarf(
      [kurs({ id: 'x' }), kurs({ id: 'y', testTermin: jetzt + 3 * TAG, titel: 'Unit 2' })],
      { a: { reifSicher: 0, reifGesamt: 0, zuletzt: null } },
      lernende,
      'Englisch',
      jetzt
    )
    expect(b?.text.startsWith('Vokabeltest „Unit 2"')).toBe(true)
    expect(b?.ziel?.id).toBe('y')
  })
  it('ohne offenen Kurs: nichts', () => {
    expect(vokabelBedarf([], {}, lernende, 'Englisch', jetzt)).toBeNull()
  })
})

describe('Ziel nach der Anmeldung', () => {
  it('Lehrkräfte landen in der App, nicht im Schülerbereich', () => {
    for (const z of ['/s/', '/s', '/s/lernen', '/s/lernen/Englisch', '/s/einstellungen', '/s/ordner/Englisch', '/s/v/abc123', '/s/tests'])
      expect(zielNachAnmeldung('lehrkraft', z)).toBe('/')
    expect(zielNachAnmeldung('admin', '/s/lernen')).toBe('/')
  })
  it('Code-Links und Seiten der App bleiben', () => {
    expect(zielNachAnmeldung('lehrkraft', '/s/t/AB12CD')).toBe('/s/t/AB12CD')
    expect(zielNachAnmeldung('lehrkraft', '/s/gt/AB12CD')).toBe('/s/gt/AB12CD')
    expect(zielNachAnmeldung('lehrkraft', '/')).toBe('/')
    expect(zielNachAnmeldung('lehrkraft', '/vorschau')).toBe('/vorschau')
  })
  it('Lernende nur in ihren Bereich', () => {
    expect(zielNachAnmeldung('schueler', '/')).toBe('/s/')
    expect(zielNachAnmeldung('schueler', '/s/lernen')).toBe('/s/lernen')
  })
})

describe('Lehrwerk-Stand automatisch', () => {
  it('höchste Unit aus den Quellen, unbekannte ignoriert', () => {
    expect(hoechsteUnit(['', '{}', 'kaputt'])).toBeNull()
  })
})
