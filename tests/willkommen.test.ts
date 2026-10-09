import { describe, expect, it } from 'vitest'
import { lageVon, stimmeNachLage, willkommenZeigen, type WillkommenLage } from '../src/renderer/src/modules/onlinetest/willkommenLogik'
import { darstellungPruefen } from '../src/server/darstellungFelder'

// Willkommens-Assistent der Lernenden (09.10.2026): einmal je Konto, nie in der Vorschau, nie mitten in einer Aufgabe
const schueler = { angemeldet: true, rolle: 'schueler' as const, quelle: 'lokal' as const, adresse: '' }
const lage = (teil: Partial<WillkommenLage> = {}): WillkommenLage => ({ ich: schueler, geladen: true, erledigt: false, pfad: '/s/', ...teil })

describe('Willkommens-Assistent: wann er erscheint', () => {
  it('neues Konto auf der Startseite: ja', () => {
    expect(willkommenZeigen(lage())).toBe(true)
    expect(willkommenZeigen(lage({ pfad: '/s' }))).toBe(true)
  })

  it('auch für IServ-Konten und Gäste mit Sitzung (QR/Code)', () => {
    expect(willkommenZeigen(lage({ ich: { ...schueler, quelle: 'iserv' } }))).toBe(true)
    expect(willkommenZeigen(lage({ ich: { ...schueler, quelle: 'gast' } }))).toBe(true)
  })

  it('nur einmal: am Konto erledigt → nein', () => {
    expect(willkommenZeigen(lage({ erledigt: true }))).toBe(false)
  })

  it('erst, wenn die Darstellung vom Server da ist', () => {
    expect(willkommenZeigen(lage({ geladen: false }))).toBe(false)
  })

  it('nie von selbst in der Musterschüler-Vorschau, für Lehrkräfte oder ohne Sitzung', () => {
    expect(willkommenZeigen(lage({ ich: { ...schueler, vorschau: true } }))).toBe(false)
    expect(willkommenZeigen(lage({ ich: { ...schueler, quelle: 'vorschau' } }))).toBe(false)
    expect(willkommenZeigen(lage({ ich: { ...schueler, rolle: 'lehrkraft' } }))).toBe(false)
    expect(willkommenZeigen(lage({ ich: { ...schueler, angemeldet: false } }))).toBe(false)
    expect(willkommenZeigen(lage({ ich: null }))).toBe(false)
  })

  it('nur auf ruhigen Seiten – nicht im Test, Blatt, Training oder beim Beitritt', () => {
    for (const p of ['/s/lernen', '/s/lernen/Englisch', '/s/ordner/Englisch', '/s/einstellungen', '/s/aufgaben', '/s/blaetter/'])
      expect(willkommenZeigen(lage({ pfad: p })), p).toBe(true)
    for (const p of ['/s/t/ABCD12', '/s/b/0123456789ab', '/s/v/0123456789ab', '/s/vt/ABCD', '/s/sp/123456', '/s/w/ABCD', '/s/r/0123456789ab'])
      expect(willkommenZeigen(lage({ pfad: p })), p).toBe(false)
  })

  it('in Prüfskripten (Playwright) nur, wenn das Skript ihn sehen will', () => {
    expect(willkommenZeigen(lage({ automatisiert: true }))).toBe(false)
    expect(willkommenZeigen(lage({ automatisiert: true, e2e: true }))).toBe(true)
  })
})

describe('Willkommens-Assistent: Stimmprobe', () => {
  const stimmen = [
    { name: 'Microsoft Hedda - German', lang: 'de-DE' },
    { name: 'Microsoft David - English (United States)', lang: 'en-US' },
    { name: 'Microsoft Zira - English (United States)', lang: 'en-US' },
    { name: 'Google UK English Female', lang: 'en_GB' }
  ]
  it('erkennt weiblich/männlich am Namen („Female" ist nicht männlich)', () => {
    expect(lageVon('Google UK English Female')).toBe('w')
    expect(lageVon('Google UK English Male')).toBe('m')
    expect(lageVon('Microsoft Zira')).toBe('w')
    expect(lageVon('Microsoft David')).toBe('m')
    expect(lageVon('Irgendwer')).toBe('')
  })
  it('wählt eine englische Stimme der gewünschten Lage, sonst irgendeine englische', () => {
    expect(stimmeNachLage(stimmen, 'w')?.name).toMatch(/Zira/)
    expect(stimmeNachLage(stimmen, 'm')?.name).toMatch(/David/)
    expect(stimmeNachLage([{ name: 'Robo', lang: 'en-US' }], 'w')?.name).toBe('Robo')
    expect(stimmeNachLage([{ name: 'Hedda', lang: 'de-DE' }], 'w')).toBeUndefined()
  })
})

describe('Darstellung am Konto: erlaubte Felder', () => {
  it('willkommenErledigt wird gespeichert', () => {
    expect(darstellungPruefen({ willkommenErledigt: true }).willkommenErledigt).toBe(true)
    expect(darstellungPruefen({}).willkommenErledigt).toBe(false)
    // nur echtes true zählt
    expect(darstellungPruefen({ willkommenErledigt: 'ja' }).willkommenErledigt).toBe(false)
  })

  it('einmal gesetzt, bleibt es – auch wenn ein Gerät mit alter Kopie ohne das Feld speichert', () => {
    expect(darstellungPruefen({ farbe: 'teal' }, { willkommenErledigt: true }).willkommenErledigt).toBe(true)
    expect(darstellungPruefen({ willkommenErledigt: false }, { willkommenErledigt: true }).willkommenErledigt).toBe(true)
  })

  it('Wahl aus dem Assistenten (Farbe, Modus, Stimme, Vollbild) kommt an, Fremdes nicht', () => {
    const d = darstellungPruefen({ farbe: 'ozean', modus: 'hell', aussprache: 'w', vollbild: false, boese: '<script>', leseschrift: true, stimmen: { en: 'x' } })
    expect(d).toMatchObject({ farbe: 'ozean', modus: 'hell', aussprache: 'w', vollbild: false })
    expect(d).not.toHaveProperty('boese')
    // nur auf dem Gerät
    expect(d).not.toHaveProperty('leseschrift')
    expect(d).not.toHaveProperty('stimmen')
  })

  it('unbekannte Werte fallen auf die Vorgabe zurück', () => {
    const d = darstellungPruefen({ farbe: 'neon', modus: 'bunt', aussprache: 'x' })
    expect(d).toMatchObject({ farbe: 'blue', modus: 'auto', aussprache: 'm', vollbild: true })
  })
})
