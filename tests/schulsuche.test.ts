// Schulsuche (Paket 13) – mit der echten, mitgelieferten Datei resources/schulen/schulen.json
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { appSchulform, bereiteVor, pruefeSchulen, sucheSchulen, suchform } from '../src/shared/schulsuche'

const daten = pruefeSchulen(JSON.parse(readFileSync(resolve(__dirname, '../resources/schulen/schulen.json'), 'utf8')))
const index = bereiteVor(daten.zeilen)

describe('Schulverzeichnis', () => {
  it('ist vollständig lesbar und nennt seine Quellen', () => {
    expect(daten.zeilen.length).toBeGreaterThan(25000)
    expect(daten.quellen.some((q) => /OpenStreetMap/.test(q.name))).toBe(true)
    expect(daten.quellen.every((q) => q.lizenz)).toBe(true)
  })
})

describe('suchform', () => {
  it('faltet Umlaute, ß, Bindestriche und Anführungszeichen', () => {
    expect(suchform('Grundschule „Heinrich Heine“')).toBe('grundschule heinrich heine')
    expect(suchform('Heinrich-Heine-Schule')).toBe('heinrich heine schule')
    expect(suchform('Gymnasium Wesermünde')).toBe('gymnasium wesermuende')
    expect(suchform('Straße')).toBe('strasse')
  })
})

describe('sucheSchulen', () => {
  it('„Heine" findet Heinrich-Heine-Schulen (Wortanfang mitten im Namen)', () => {
    const t = sucheSchulen(index, 'Heine')
    expect(t.length).toBe(30)
    expect(t.filter((x) => /Heinrich.Heine/.test(x.name)).length).toBeGreaterThan(10)
    // Nicht über „Rhein…"
    expect(t.some((x) => /rhein/i.test(x.name) && !/heine/i.test(x.name))).toBe(false)
  })

  it('„Weserm" findet das Gymnasium Wesermünde mit Logo – auch umlautfrei und in Kleinschreibung', () => {
    for (const q of ['Weserm', 'wesermuende', 'Wesermünde', 'gym weserm']) {
      const t = sucheSchulen(index, q, {}, (id) => id === 'NI-67052')
      const g = t.find((x) => x.name === 'Gymnasium Wesermünde')
      expect(g, q).toBeTruthy()
      expect(g!.id).toBe('NI-67052')
      expect(g!.ort).toBe('Bremerhaven')
      expect(g!.land).toBe('NI')
      expect(g!.logo).toBe(true)
    }
  })

  it('Teilwort ab drei Buchstaben, Ort und PLZ zählen mit', () => {
    expect(sucheSchulen(index, 'esermünde').some((x) => x.id === 'NI-67052')).toBe(true)
    expect(sucheSchulen(index, 'Gymnasium Bremerhaven').some((x) => x.id === 'NI-67052')).toBe(true)
    expect(sucheSchulen(index, 'Gymnasium 27570').some((x) => x.id === 'NI-67052')).toBe(true)
  })

  it('Bundesland und Schulform der Einstellungen stellen passende Treffer nach vorn, ohne andere auszusperren', () => {
    const ohne = sucheSchulen(index, 'Heinrich Heine')
    const ni = sucheSchulen(index, 'Heinrich Heine', { land: 'SH', schulform: 'gymnasium' })
    expect(ni[0].land).toBe('SH')
    expect(ni[0].schulformen).toContain('gym')
    expect(new Set(ni.map((x) => x.land)).size).toBeGreaterThan(1)
    expect(ohne[0].land === 'SH' && ohne[0].schulformen.includes('gym')).toBe(false)
  })

  it('höchstens 30 Treffer, zu kurze Eingaben liefern nichts', () => {
    expect(sucheSchulen(index, 'schule', { max: 500 }).length).toBe(30)
    expect(sucheSchulen(index, 'a')).toEqual([])
    expect(sucheSchulen(index, '  - ')).toEqual([])
  })
})

describe('appSchulform', () => {
  it('ordnet die Kürzel den Schulformen des Landes zu', () => {
    const ni = ['grundschule', 'hauptschule', 'realschule', 'oberschule', 'integrierte-gesamtschule', 'gymnasium']
    expect(appSchulform(['gym'], ni)).toBe('gymnasium')
    expect(appSchulform(['hs', 'rs'], ni)).toBe('oberschule')
    expect(appSchulform(['rs'], ni)).toBe('realschule')
    expect(appSchulform(['igs'], ni)).toBe('integrierte-gesamtschule')
    expect(appSchulform(['bbs'], ni)).toBe(null)
    expect(appSchulform(['igs', 'gym'], ['grundschule', 'gemeinschaftsschule', 'gymnasium'])).not.toBe(null)
  })
})
