import { describe, expect, it } from 'vitest'
import { benutzerFuer, klassenGruppe, nameAusZeile, startPasswort } from '../src/server/klassenliste'

/* Schülerkonten aus einer Klassenliste (02.10.2026) */
describe('Klassenliste', () => {
  it('liest die üblichen Schreibweisen', () => {
    expect(nameAusZeile('Anna Müller')).toEqual({ vorname: 'Anna', nachname: 'Müller' })
    expect(nameAusZeile('Müller, Anna-Lena')).toEqual({ vorname: 'Anna-Lena', nachname: 'Müller' })
    expect(nameAusZeile('Müller\tAnna')).toEqual({ vorname: 'Anna', nachname: 'Müller' })
    expect(nameAusZeile('Jan Ole Schmidt')).toEqual({ vorname: 'Jan Ole', nachname: 'Schmidt' })
    expect(nameAusZeile('   ')).toBeNull()
    expect(nameAusZeile('Anna')).toBeNull()
  })
  it('bildet Benutzernamen ohne Umlaute und Sonderzeichen', () => {
    expect(benutzerFuer('Anna-Lena', 'Müller')).toBe('anna-lena.mueller')
    expect(benutzerFuer('Jan Ole', 'Öztürk')).toBe('jan.oeztuerk')
    expect(benutzerFuer('Zoë', 'Weiß')).toBe('zoe.weiss')
  })
  it('Startpasswort zum Abtippen, mindestens 10 Zeichen; Klasse als Gruppe', () => {
    for (let i = 0; i < 20; i++) expect(startPasswort()).toMatch(/^[A-Z][a-z]+-[A-Z][a-z]+-\d{2}$/)
    expect(startPasswort().length).toBeGreaterThanOrEqual(10)
    expect(klassenGruppe(' 10b ')).toEqual({ id: 'klasse:10b', name: '10b' })
  })
})
