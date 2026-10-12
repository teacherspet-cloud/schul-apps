import { afterAll, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bewerte, grenzen, istGeprueft, messeSignal, PRUEF_VERSION, pruefungBereinigt, schaetzeSilben } from '../src/shared/tonPruefung'
import { fassungenAusAntwort, fassungsAuftrag, figurenAus, istFassungsKandidat, satzFuerLage } from '../src/shared/satzFassung'
import { mitSatzpunkt, WORT_TTS_SETTINGS } from '../src/shared/voiceSettings'
import { satzSchluessel } from '../src/shared/medienbank'

/**
 * Aussprache prüfen und geschlechtsbezogene Beispielsätze (12.10.2026): Messregeln (ohne Dienst), Vorfilter und Antwort
 * der KI (nur Attrappen-Antworten, kein Aufruf), Ablage von Prüfung, Rückfall-Aufnahme und Fassungen.
 */

const RATE = 8000
/** Signal aus Abschnitten: [Sekunden, Amplitude] – Sinus 220 Hz bzw. Stille */
const signal = (...teile: [number, number][]): Float32Array => {
  const n = teile.reduce((a, [s]) => a + Math.round(s * RATE), 0)
  const d = new Float32Array(n)
  let i = 0
  for (const [s, amp] of teile) for (let k = 0; k < Math.round(s * RATE); k++, i++) d[i] = amp * Math.sin((2 * Math.PI * 220 * i) / RATE)
  return d
}

describe('Messung', () => {
  it('Silben grob schätzen', () => {
    expect(schaetzeSilben('cat')).toBe(1)
    expect(schaetzeSilben('make')).toBe(1)
    expect(schaetzeSilben('table')).toBe(2)
    expect(schaetzeSilben('banana')).toBe(3)
    expect(schaetzeSilben('to look forward to')).toBe(5)
  })
  it('Grenzen: Wort nach Silben, Satz nach Buchstaben', () => {
    expect(grenzen('wort', 'cat')).toMatchObject({ min: 0.25, max: 1.65, silben: 1 })
    const g = grenzen('satz', 'My name is Tom.')
    expect(g.zeichen).toBe(11)
    expect(g.min).toBe(0.4)
  })
  it('deutliches Einzelwort: ok', () => {
    const w = messeSignal(signal([0.2, 0], [0.45, 0.3], [0.3, 0]), RATE)
    expect(w.sprechen).toBeCloseTo(0.46, 1)
    expect(w.stilleAnfang).toBeCloseTo(0.2, 1)
    expect(bewerte(w, 'wort', 'cat')).toMatchObject({ stufe: 'ok', gruende: [], version: PRUEF_VERSION })
  })
  it('verschlucktes Einzelwort: zu kurz', () => {
    const p = bewerte(messeSignal(signal([0.2, 0], [0.12, 0.3], [0.3, 0]), RATE), 'wort', 'cat')
    expect(p.stufe).toBe('verdacht')
    expect(p.gruende.join()).toMatch(/zu kurz für 1 Silbe/)
  })
  it('stumm', () => {
    const p = bewerte(messeSignal(signal([1, 0]), RATE), 'wort', 'cat')
    expect(p.gruende).toEqual(['stumm oder kaum hörbar'])
  })
  it('Ende abgeschnitten: bis zum Schluss laut', () => {
    const p = bewerte(messeSignal(signal([0.2, 0], [0.5, 0.3]), RATE), 'wort', 'river')
    expect(p.gruende).toContain('Ende vielleicht abgeschnitten')
  })
  it('lange Stille und ungewöhnlich lang', () => {
    const p = bewerte(messeSignal(signal([1.5, 0], [2.5, 0.3], [2, 0]), RATE), 'wort', 'cat')
    expect(p.gruende.join(' | ')).toMatch(/lange Stille am Anfang.*ungewöhnlich lang|ungewöhnlich lang.*lange Stille am Anfang/)
    expect(p.gruende.join()).toMatch(/lange Stille am Ende/)
  })
  it('Satz zu kurz für seine Buchstaben', () => {
    const p = bewerte(messeSignal(signal([0.1, 0], [0.3, 0.3], [0.3, 0]), RATE), 'satz', 'I am looking forward to the holidays.')
    expect(p.gruende.join()).toMatch(/zu kurz für den Satz/)
  })
  it('gespeicherte Prüfung: Regelfassung und Bereinigung', () => {
    expect(istGeprueft({ stufe: 'ok', gruende: [], version: PRUEF_VERSION })).toBe(true)
    expect(istGeprueft({ stufe: 'ok', gruende: [], version: PRUEF_VERSION - 1 })).toBe(false)
    expect(pruefungBereinigt({ stufe: 'x', gruende: ['a'.repeat(500)], version: '1', boese: 1 })).toEqual({
      stufe: 'ok',
      gruende: ['a'.repeat(120)],
      version: 1
    })
  })
})

describe('Sprechauftrag für Einzelwörter', () => {
  it('Satzpunkt nur, wo keiner ist', () => {
    expect(mitSatzpunkt('cat')).toBe('cat.')
    expect(mitSatzpunkt('How are you?')).toBe('How are you?')
    expect(mitSatzpunkt('was ... were')).toBe('was ... were.')
    expect(mitSatzpunkt('Y. A.')).toBe('Y. A.')
  })
  it('langsamer und stabiler als die Voreinstellung', () => {
    expect(WORT_TTS_SETTINGS.speed).toBeLessThan(1)
    expect(WORT_TTS_SETTINGS.stability).toBeGreaterThan(0.5)
  })
})

describe('Geschlechtsbezogene Beispielsätze', () => {
  it('Vorfilter: Ich-Form mit Name oder Geschlechtswort', () => {
    expect(istFassungsKandidat('My name is Tom.', 'en')).toBe(true)
    expect(istFassungsKandidat("I'm a boy.", 'en-GB')).toBe(true)
    expect(istFassungsKandidat('My wife likes tea.', 'en')).toBe(true)
    expect(istFassungsKandidat("I'm his brother.", 'en')).toBe(true)
    expect(istFassungsKandidat('I like apples.', 'en')).toBe(false)
    expect(istFassungsKandidat('The dog is big.', 'en')).toBe(false)
    expect(istFassungsKandidat('my name', 'en')).toBe(false)
    expect(istFassungsKandidat("Je m'appelle Léa.", 'fr')).toBe(true)
    expect(istFassungsKandidat('Je suis contente.', 'fr')).toBe(true)
    expect(istFassungsKandidat('Me llamo Pablo.', 'es')).toBe(true)
  })
  it('Figuren aus den Beispielsätzen (ohne Satzanfang, Wochentage, Länder)', () => {
    expect(figurenAus(['My name is Jo.', 'Jo and Dilip are friends.', 'On Monday Dilip plays in London.'])).toEqual(['Dilip', 'Jo'])
  })
  it('Auftrag an die KI nennt Figuren und Rückfallnamen', () => {
    const r = fassungsAuftrag('en', [{ nr: 1, satz: 'My name is Tom.' }], ['Dilip'])
    expect(r.schemaName).toBe('vokabel_satzfassung')
    expect(r.system).toMatch(/Dilip/)
    expect(r.system).toMatch(/Emma/)
    expect(r.user).toBe('1. My name is Tom.')
  })
  it('Antwort der KI: Fassung für die andere Stimme, Unbrauchbares = keine Anpassung, Fehlendes bleibt offen', () => {
    const k = [
      { nr: 1, satz: 'My name is Tom.', uebersetzung: 'Ich heiße Tom.' },
      { nr: 2, satz: "I'm a girl.", uebersetzung: 'Ich bin ein Mädchen.' },
      { nr: 3, satz: 'My brother is tall.' },
      { nr: 4, satz: 'My dad is a waiter.' },
      { nr: 5, satz: 'I am a boy.' }
    ]
    const f = fassungenAusAntwort(
      k,
      {
        saetze: [
          { nr: 1, festgelegt: 'm', fassung: 'My name is Emma.', uebersetzung: 'Ich heiße Emma.' },
          { nr: 2, festgelegt: 'w', fassung: "I'm a boy.", uebersetzung: 'Ich bin ein Junge.' },
          { nr: 3, festgelegt: 'nein', fassung: '', uebersetzung: '' },
          // Unbrauchbar: gleich dem Original
          { nr: 5, festgelegt: 'm', fassung: 'I am a boy.', uebersetzung: '' }
        ]
      },
      1
    )
    expect(f[satzSchluessel('My name is Tom.')]).toEqual({
      original: 'My name is Tom.',
      lage: 'w',
      text: 'My name is Emma.',
      uebersetzung: 'Ich heiße Emma.',
      von: 'ki',
      zeit: 1
    })
    expect(f[satzSchluessel("I'm a girl.")]?.lage).toBe('m')
    expect(f[satzSchluessel('My brother is tall.')]).toEqual({ original: 'My brother is tall.', von: 'ki', zeit: 1 })
    expect(f[satzSchluessel('My dad is a waiter.')]).toBeUndefined()
    expect(f[satzSchluessel('I am a boy.')]?.lage).toBeUndefined()
    // Jede Stimme spricht ihre Fassung
    expect(satzFuerLage('My name is Tom.', f, 'w')).toBe('My name is Emma.')
    expect(satzFuerLage('My name is Tom.', f, 'm')).toBe('My name is Tom.')
  })
})

const ordner = mkdtempSync(join(tmpdir(), 'aussprache-'))
process.env.SCHULAPPS_SERVER = '1'
process.env.SCHULAPPS_DATEN = ordner
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nie-benutzt' } }))
const bank = await import('../src/main/services/storage/medienbank')
afterAll(() => rmSync(ordner, { recursive: true, force: true }))

describe('Ablage: Prüfung, Rückfall-Aufnahme, Fassungen', () => {
  const MP3 = 'data:audio/mpeg;base64,SUQzAwAAAAAAAA=='
  const datei = (d: string): string => join(ordner, 'medienbank', 'dateien', d)
  const ok = { stufe: 'ok' as const, gruende: [], version: PRUEF_VERSION }
  const verdacht = { stufe: 'verdacht' as const, gruende: ['zu kurz für 1 Silbe'], version: PRUEF_VERSION }

  it('Prüfung wird mit der Aufnahme gespeichert; „neu erzeugen" behält die bisherige als Rückfall', () => {
    const a = bank.tonSetzen('en', 'cat', 'wort', { dataUrl: MP3, stimme: 'v1', text: 'cat', pruefung: verdacht }, 'w')
    expect(a.pruefung).toEqual(verdacht)
    const b = bank.tonSetzen('en', 'cat', 'wort', { dataUrl: MP3, stimme: 'v1', text: 'cat', pruefung: ok, behalteVorher: true, grund: 'undeutlich' }, 'w')
    expect(b.vorher).toMatchObject({ datei: a.datei, grund: 'undeutlich' })
    expect(existsSync(datei(a.datei))).toBe(true)
    // Die nächste Neuerzeugung verdrängt die älteste
    const c = bank.tonSetzen('en', 'cat', 'wort', { dataUrl: MP3, stimme: 'v1', text: 'cat', behalteVorher: true }, 'w')
    expect(c.vorher?.datei).toBe(b.datei)
    expect(existsSync(datei(a.datei))).toBe(false)
    // Gewöhnliches Ersetzen löscht Aufnahme und Rückfall
    const d = bank.tonSetzen('en', 'cat', 'wort', { dataUrl: MP3, stimme: 'v1', text: 'cat' }, 'w')
    expect(d.vorher).toBeUndefined()
    expect(existsSync(datei(b.datei))).toBe(false)
    expect(existsSync(datei(c.datei))).toBe(false)
  })

  it('Nachprüfung speichert nur an derselben Datei', () => {
    const t = bank.tonSetzen('en', 'dog', 'wort', { dataUrl: MP3, stimme: 'v1', text: 'dog' }, 'm')
    expect(bank.tonPruefungSetzen('en', 'dog', 'wort', 'm', undefined, '0'.repeat(24) + '.mp3', ok)).toBe(false)
    expect(bank.tonPruefungSetzen('en', 'dog', 'wort', 'm', undefined, t.datei, verdacht)).toBe(true)
    expect(bank.medienFuer('en', ['dog'])['dog']?.tonM?.pruefung).toEqual(verdacht)
    // Kein Eintrag: nichts anlegen
    expect(bank.tonPruefungSetzen('en', 'unbekannt', 'wort', 'w', undefined, t.datei, ok)).toBe(false)
    expect(bank.medienFuer('en', ['unbekannt'])['unbekannt']).toBeUndefined()
  })

  it('Fassungen: Lehrkraft sieht alle, Lernende nur mit Aufnahme ihrer Stimme', () => {
    const orig = 'My name is Tom.'
    bank.fassungSetzen('en', 'name', orig, { lage: 'w', text: 'My name is Emma.', uebersetzung: 'Ich heiße Emma.', von: 'ki' })
    bank.tonSetzen('en', 'name', 'satz', { dataUrl: MP3, stimme: 'v1', text: orig }, 'm')
    expect(bank.medienFuer('en', ['name'])['name']?.fassungen?.[satzSchluessel(orig)]).toMatchObject({ lage: 'w', text: 'My name is Emma.' })
    // Noch keine weibliche Aufnahme der Fassung: Lernende sehen das Original (sie hören die männliche Stimme)
    expect(bank.medienFuer('en', ['name'], { lage: 'w', basisUrl: '/medien/' })['name']?.fassungen).toBeUndefined()
    bank.tonSetzen('en', 'name', 'satz', { dataUrl: MP3, stimme: 'v2', text: 'My name is Emma.' }, 'w')
    expect(bank.medienFuer('en', ['name'], { lage: 'w', basisUrl: '/medien/' })['name']?.fassungen).toEqual({
      [satzSchluessel(orig)]: { text: 'My name is Emma.', uebersetzung: 'Ich heiße Emma.' }
    })
    expect(bank.medienFuer('en', ['name'], { lage: 'm', basisUrl: '/medien/' })['name']?.fassungen).toBeUndefined()
    // „Keine Anpassung" von Hand bleibt gemerkt, null vergisst
    bank.fassungSetzen('en', 'name', orig, { von: 'hand' })
    expect(bank.medienFuer('en', ['name'])['name']?.fassungen?.[satzSchluessel(orig)]).toMatchObject({ von: 'hand' })
    expect(bank.medienFuer('en', ['name'])['name']?.fassungen?.[satzSchluessel(orig)]?.text).toBeUndefined()
    bank.fassungSetzen('en', 'name', orig, null)
    expect(bank.medienFuer('en', ['name'])['name']?.fassungen).toBeUndefined()
  })
})
