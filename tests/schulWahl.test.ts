import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { eigenerNameBleibt, schulWahl, verzeichnisAbgleich, verzeichnisUebernehmen } from '../src/shared/schulVerzeichnisDaten'
import { bereiteVor, pruefeSchulen, sucheSchulen } from '../src/shared/schulsuche'

/*
 * Schulwahl in Verwaltung › „Schule & Daten" › Schule (10.10.2026, Befund der Lehrkraft): „Kreisgymnasium Wesermünde"
 * gewählt – die Sekretariats-Adresse kam nicht (das Verzeichnis führte keine E-Mail) und das Vorgabe-Logo auch nicht
 * (nur in den Einstellungen der Lehrkraft verdrahtet). Dazu: Die Kästen dort merken offen/zu DAUERHAFT je Gerät.
 */

const speicher = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k),
  key: (i: number) => [...speicher.keys()][i] ?? null,
  get length() {
    return speicher.size
  }
})
const sitzung = await import('../src/renderer/src/shared/sitzung')

const WESERMUENDE = {
  name: 'Gymnasium Wesermünde',
  strasse: 'Humboldtstraße 12-14',
  plz: '27570',
  ort: 'Bremerhaven',
  telefon: '0471 483670',
  email: 'sekretariat@gywem.de'
}
const LOGO = 'data:image/png;base64,AAAA'

describe('Schulverzeichnis: E-Mail', () => {
  const daten = pruefeSchulen(JSON.parse(readFileSync(resolve('resources/schulen/schulen.json'), 'utf8')))
  const index = bereiteVor(daten.zeilen)

  it('Gymnasium Wesermünde führt die Sekretariats-Adresse', () => {
    const [t] = sucheSchulen(index, 'Gymnasium Wesermünde')
    expect(t).toMatchObject({ id: 'NI-67052', email: 'sekretariat@gywem.de', telefon: '0471 483670' })
  })

  it('„Kreisgymnasium Wesermünde" findet das Gymnasium Wesermünde (zusammengesetztes Wort)', () => {
    expect(sucheSchulen(index, 'Kreisgymnasium Wesermünde', { land: 'NI' })[0]?.id).toBe('NI-67052')
    expect(sucheSchulen(index, 'Gy Wesermünde')[0]?.id).toBe('NI-67052')
  })

  it('E-Mail ist überall leer oder eine Adresse', () => {
    const kaputt = daten.zeilen.filter((z) => z[8] && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(z[8]))
    expect(kaputt).toEqual([])
    expect(daten.zeilen.filter((z) => z[8]).length).toBeGreaterThan(10000)
  })
})

describe('Schulwahl: Felder füllen', () => {
  it('füllt leere Felder einschließlich E-Mail, gefüllte nur als Angebot', () => {
    expect(verzeichnisAbgleich({}, WESERMUENDE).gefuellt.email).toBe('sekretariat@gywem.de')
    const r = verzeichnisAbgleich({ email: 'info@gywem.de', ort: 'Bremerhaven' }, WESERMUENDE)
    expect(r.gefuellt.email).toBeUndefined()
    expect(r.abweichend).toEqual([{ feld: 'email', bisher: 'info@gywem.de', verzeichnis: 'sekretariat@gywem.de' }])
    // Groß-/Kleinschreibung und „mailto:" sind keine Abweichung
    expect(verzeichnisAbgleich({ email: 'mailto:Sekretariat@GyWem.de' }, WESERMUENDE).abweichend).toEqual([])
    expect(verzeichnisUebernehmen(WESERMUENDE).email).toBe('sekretariat@gywem.de')
  })

  it('eigener längerer Name bleibt, Abkürzungen und Bruchstücke nicht', () => {
    expect(eigenerNameBleibt('Kreisgymnasium Wesermünde', 'Gymnasium Wesermünde')).toBe(true)
    expect(eigenerNameBleibt('Gy Wesermünde', 'Gymnasium Wesermünde')).toBe(false)
    expect(eigenerNameBleibt('Weserm', 'Gymnasium Wesermünde')).toBe(false)
    expect(eigenerNameBleibt('Gymnasium Wesermünde', 'Gymnasium Wesermünde')).toBe(false)
    expect(eigenerNameBleibt('', 'Gymnasium Wesermünde')).toBe(false)
    expect(eigenerNameBleibt('Kreisgymnasium Cuxhaven', 'Gymnasium Wesermünde')).toBe(false)
  })

  it('schulWahl: Name, Felder und Logo', () => {
    const leer = { name: 'Kreisgymnasium Wesermünde', strasse: '', plz: '', ort: '', telefon: '', email: '' }
    const w = schulWahl(leer, WESERMUENDE, null, LOGO)
    expect(w.name).toBe('Kreisgymnasium Wesermünde')
    expect(w.gefuellt).toEqual({ strasse: 'Humboldtstraße 12-14', plz: '27570', ort: 'Bremerhaven', telefon: '0471 483670', email: 'sekretariat@gywem.de' })
    expect(w.logo).toBe('setzen')
    expect(schulWahl({ ...leer, name: 'Weserm' }, WESERMUENDE, null, LOGO).name).toBe('Gymnasium Wesermünde')
    // Ein eigenes Logo wird nie ungefragt ersetzt; dasselbe Logo ist nichts zu tun; ohne Vorgabe-Logo nichts
    expect(schulWahl(leer, WESERMUENDE, 'data:image/png;base64,EIGEN', LOGO).logo).toBe('fragen')
    expect(schulWahl(leer, WESERMUENDE, LOGO, LOGO).logo).toBeNull()
    expect(schulWahl(leer, WESERMUENDE, null, null).logo).toBeNull()
  })
})

describe('Kästen der Verwaltung › Schule: offen/zu dauerhaft', () => {
  beforeEach(() => {
    speicher.clear()
    sitzung.sitzungFuerTests('server-a')
  })

  it('überdauert eine neue Sitzung (anders als offenMerken)', () => {
    expect(sitzung.dauerhaftOffen('verwaltung-schule')).toBeUndefined()
    sitzung.dauerhaftMerken('verwaltung-schule', true)
    sitzung.dauerhaftMerken('verwaltung-logo', false)
    sitzung.offenMerken('andere', { x: true })
    sitzung.sitzungFuerTests('server-b')
    expect(sitzung.dauerhaftOffen('verwaltung-schule')).toBe(true)
    expect(sitzung.dauerhaftOffen('verwaltung-logo')).toBe(false)
    // Die übrigen Kästen bleiben bei der Sitzungsregel
    expect(sitzung.offenLesen('andere')).toBeUndefined()
  })

  it('Kaputtes oder fehlender Speicher zählt als leer', () => {
    speicher.set(sitzung.DAUERHAFT_SCHLUESSEL, '{"verwaltung-schule":"ja","x":true')
    expect(sitzung.dauerhaftAlle()).toEqual({})
    speicher.set(sitzung.DAUERHAFT_SCHLUESSEL, '{"verwaltung-schule":"ja","verwaltung-logo":true}')
    expect(sitzung.dauerhaftAlle()).toEqual({ 'verwaltung-logo': true })
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('gesperrt')
      },
      setItem: () => {
        throw new Error('gesperrt')
      }
    })
    expect(sitzung.dauerhaftOffen('verwaltung-schule')).toBeUndefined()
    expect(() => sitzung.dauerhaftMerken('verwaltung-schule', true)).not.toThrow()
  })
})
