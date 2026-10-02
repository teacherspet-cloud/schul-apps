import { describe, expect, it } from 'vitest'
import { erkenneSprache, nurTrennung, ohneTrennung, spracheAusCode, trenneText, trennerLaden, WEICH } from '../src/renderer/src/shared/silbentrennung'

/*
 * Silbentrennung (02.10.2026): weiche Trennstriche nach den Mustern der Sprache – Wunsch der
 * Lehrkraft „korrekte Silbentrennung (mit Bindestrich) in allen Apps". Sichtbar gemacht wird hier
 * mit „-" statt des unsichtbaren U+00AD.
 */
const zeige = (s: string): string => s.split(WEICH).join('-')

describe('Trennen nach Sprache', () => {
  it('Deutsch (neue Rechtschreibung): Silben, keine Einzelbuchstaben am Wortrand', async () => {
    await trennerLaden('de')
    expect(zeige(trenneText('Arbeitsblatt Erwartungshorizont Schülerinnen Aufgabe', 'de'))).toBe('Ar-beits-blatt Er-war-tungs-ho-ri-zont Schü-le-rin-nen Auf-ga-be')
    // „Abend", „Ufer": nie „A-bend", „U-fer"
    expect(zeige(trenneText('Abend Ufer Oberstufe', 'de'))).toBe('Abend Ufer Ober-stu-fe')
  })
  it('Englisch (britisch), Französisch, Spanisch', async () => {
    await Promise.all([trennerLaden('en'), trennerLaden('fr'), trennerLaden('es')])
    expect(zeige(trenneText('comprehension enforcement', 'en'))).toBe('com-pre-hen-sion en-force-ment')
    expect(zeige(trenneText('responsabilité', 'fr'))).toBe('res-pon-sa-bi-li-té')
    expect(zeige(trenneText('comunicación', 'es'))).toBe('co-mu-ni-ca-ción')
  })
  it('lässt Adressen, Zahlen, Abkürzungen und kurze Wörter in Ruhe', async () => {
    await trennerLaden('de')
    const text = 'www.beispiel.de lehrer@schule.de https://iserv.de/doku 2026-10-02 UNESCO Haus Maus'
    expect(trenneText(text, 'de')).toBe(text)
  })
  it('trennt bereits getrennte Wörter nicht doppelt; ohne geladene Sprache unverändert', async () => {
    await trennerLaden('de')
    const einmal = trenneText('Arbeitsblatt', 'de')
    expect(trenneText(einmal, 'de')).toBe(einmal)
    expect(trenneText('Arbeitsblatt', 'sv')).toBe('Arbeitsblatt')
  })
})

describe('Sprache erkennen (Faustregel) und lang-Codes', () => {
  it('erkennt Deutsch, Englisch, Französisch an häufigen Wörtern', () => {
    expect(erkenneSprache('Lies den Text und beantworte die Fragen zu dem Thema.')).toBe('de')
    expect(erkenneSprache('Read the text and answer the questions in your own words.')).toBe('en')
    expect(erkenneSprache('Lis le texte et réponds aux questions dans le cahier.')).toBe('fr')
  })
  it('zu wenig Text → keine Entscheidung', () => {
    expect(erkenneSprache('work-life balance')).toBeNull()
  })
  it('lang-Attribute und Fachnamen', () => {
    expect(spracheAusCode('en-GB')).toBe('en')
    expect(spracheAusCode('Französisch')).toBe('fr')
    expect(spracheAusCode('xx')).toBeNull()
  })
})

describe('Nichts Unsichtbares in gespeicherten Texten', () => {
  it('ohneTrennung entfernt alle weichen Trennstriche', async () => {
    await trennerLaden('de')
    expect(ohneTrennung(trenneText('Donaudampfschifffahrtsgesellschaft', 'de'))).toBe('Donaudampfschifffahrtsgesellschaft')
  })
  it('nurTrennung erkennt die eigenen Änderungen des Beobachters', () => {
    expect(nurTrennung('Arbeitsblatt', `Ar${WEICH}beits${WEICH}blatt`)).toBe(true)
    expect(nurTrennung('Arbeitsblatt', 'Arbeitsblätter')).toBe(false)
    expect(nurTrennung('gleich', 'gleich')).toBe(false)
  })
})
