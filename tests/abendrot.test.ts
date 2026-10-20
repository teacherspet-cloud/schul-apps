import { describe, expect, it } from 'vitest'
import { anmeldeSeite } from '../src/server/seiten'
import { darstellungPruefen } from '../src/server/darstellungFelder'
import { mitDunkelVorgabe, VORGABE, type Darstellung } from '../src/renderer/src/modules/onlinetest/schuelerDarstellung'
import { THEMES, themeById } from '../src/renderer/src/shared/themes'
import { DEFAULT_SETTINGS } from '../src/shared/types'

/*
 * Anmeldeseite und Farbprofil „Abendrot" (20.10.2026, Entscheidung der Lehrkraft): IServ als Hauptweg oben, „Mit Code
 * öffnen" direkt darunter ohne Aufklappen; nach der Anmeldung sieht die App standardmäßig aus wie die Anmeldeseite –
 * solange niemand ein anderes Farbprofil gewählt hat.
 */
describe('Anmeldeseite', () => {
  const seite = (o: Partial<Parameters<typeof anmeldeSeite>[0]> = {}): string =>
    anmeldeSeite({ iserv: true, notzugang: true, fehler: '', ziel: '/', ...o })

  it('IServ oben, Code direkt darunter, Nutzername/Passwort als Verweis ganz unten', () => {
    const s = seite()
    const iserv = s.indexOf('href="/auth/iserv')
    const code = s.indexOf('<form method="get" action="/s/" class="code">')
    const konto = s.indexOf('data-anmelden-oeffnen')
    expect(iserv).toBeGreaterThan(0)
    expect(code).toBeGreaterThan(iserv)
    expect(konto).toBeGreaterThan(code)
    expect(s).not.toContain('<details')
  })

  it('ohne den Text „Testkonto oder Notzugang"', () => {
    expect(seite()).not.toContain('Testkonto oder Notzugang')
    expect(seite({ notzugang: false })).not.toContain('Testkonto')
  })

  it('unbekannter Code: Meldung am Codefeld, Fokus dort', () => {
    const s = seite({ code: 'ab12', codeUnbekannt: true })
    expect(s).toContain('data-code-unbekannt')
    expect(s).toMatch(/id="code"[^>]*value="AB12" autofocus aria-invalid="true"/)
  })
})

describe('Farbprofil Abendrot als Vorgabe', () => {
  it('Lehrkräfte: neues Profil ist Vorgabe und Rückfall', () => {
    expect(DEFAULT_SETTINGS.appearance.theme).toBe('abendrot')
    expect(DEFAULT_SETTINGS.appearance.abendrotVorgabe).toBe(true)
    expect(THEMES[0].id).toBe('abendrot')
    expect(themeById('gibtsnicht').id).toBe('abendrot')
  })

  const alt = (d: Partial<Darstellung>): Darstellung => ({ ...VORGABE, dunkelVorgabe: true, vorgabe0810: true, vorgabeAbendrot: false, ...d })

  it('Lernende: bisherige Vorgabe Blau wird einmalig Abendrot, eigene Wahl bleibt', () => {
    expect(VORGABE.farbe).toBe('abendrot')
    expect(mitDunkelVorgabe(alt({ farbe: 'blue' }))).toMatchObject({ farbe: 'abendrot', vorgabeAbendrot: true })
    expect(mitDunkelVorgabe(alt({ farbe: 'ozean' }))).toMatchObject({ farbe: 'ozean', vorgabeAbendrot: true })
    // Danach gewähltes Blau bleibt Blau
    expect(mitDunkelVorgabe({ ...VORGABE, farbe: 'blue' }).farbe).toBe('blue')
  })

  it('Server speichert Abendrot und die Marke', () => {
    expect(darstellungPruefen({ farbe: 'abendrot', vorgabeAbendrot: true })).toMatchObject({ farbe: 'abendrot', vorgabeAbendrot: true })
    expect(darstellungPruefen({ farbe: 'blue' }).vorgabeAbendrot).toBe(false)
  })
})
