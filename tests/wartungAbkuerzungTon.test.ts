import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/* Einmalige Wartung „abkuerzung-ton-2026-10-09": Aufnahmen mit Abkürzungen aus der gemeinsamen Medienbank löschen */

vi.mock('electron', () => ({ app: { getPath: () => join(tmpdir(), 'nie-benutzt') } }))

const daten = mkdtempSync(join(tmpdir(), 'abk-ton-'))
const wurzel = join(daten, 'medienbank')
const alt = { server: process.env.SCHULAPPS_SERVER, daten: process.env.SCHULAPPS_DATEN }
beforeAll(() => {
  process.env.SCHULAPPS_SERVER = '1'
  process.env.SCHULAPPS_DATEN = daten
})
afterAll(() => {
  process.env.SCHULAPPS_SERVER = alt.server
  process.env.SCHULAPPS_DATEN = alt.daten
  if (alt.server === undefined) delete process.env.SCHULAPPS_SERVER
  if (alt.daten === undefined) delete process.env.SCHULAPPS_DATEN
  rmSync(daten, { recursive: true, force: true })
})

let n = 0
const datei = (): string => {
  const d = `${(++n).toString(16).padStart(24, '0')}.mp3`
  writeFileSync(join(wurzel, 'dateien', d), 'mp3')
  return d
}
const ton = (text: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ datei: datei(), stimme: 'voice1', text, zeit: 1, ...extra })

describe('Wartung: Aufnahmen mit Abkürzungen löschen', () => {
  it('ohne Medienbank geschieht nichts und es wird nichts angelegt', async () => {
    const { abkuerzungsToeneLoeschen } = await import('../src/server/wartungAbkuerzungTon')
    expect(abkuerzungsToeneLoeschen()).toBe('0 Wort- und 0 Satz-Aufnahmen mit Abkürzungen gelöscht (0 Dateien)')
    expect(existsSync(wurzel)).toBe(false)
  })

  it('löscht Wort- und Satz-Aufnahmen beider Fassungen mit Abkürzung, sonst nichts', async () => {
    mkdirSync(join(wurzel, 'dateien'), { recursive: true })
    const bild = { datei: 'ffffffffffffffffffffffff.jpg', herkunft: 'suche', nachweis: '', zeit: 1 }
    writeFileSync(join(wurzel, 'dateien', bild.datei), 'jpg')
    const index = {
      'en:ya (= young adults)': { ton: ton('YA (= young adults)'), tonM: ton('YA (= young adults)') },
      'en:to point at sb/sth': { ton: ton('to point at sb/sth'), bild },
      'en:mr': { ton: ton('Mr') },
      'en:house': {
        ton: ton('house'),
        saetze: { 'I watch the BBC every day.': ton('I watch the BBC every day.'), 'This is my house.': ton('This is my house.') },
        saetzeM: { 'I watch the BBC every day.': ton('I watch the BBC every day.') }
      },
      'en:soccer [ae]': { ton: ton('soccer [AE]') },
      // Herkunft unbekannt (keine Stimme): bleibt
      'en:uk – united kingdom': { ton: ton('UK – United Kingdom', { stimme: '' }) },
      // Schon nach den neuen Regeln erzeugt: bleibt
      'en:tv (= television)': { ton: ton('TV (= television)', { gesprochen: 'T. V., television' }) },
      'de:jmdn. treffen': { ton: ton('jmdn. treffen') }
    }
    writeFileSync(join(wurzel, 'index.json'), JSON.stringify(index))
    const { abkuerzungsToeneLoeschen } = await import('../src/server/wartungAbkuerzungTon')
    expect(abkuerzungsToeneLoeschen()).toBe('5 Wort- und 2 Satz-Aufnahmen mit Abkürzungen gelöscht (7 Dateien)')
    const neu = JSON.parse(readFileSync(join(wurzel, 'index.json'), 'utf8')) as Record<string, Record<string, unknown>>
    expect(neu['en:ya (= young adults)']).toBeUndefined()
    expect(neu['en:mr']).toBeUndefined()
    expect(neu['de:jmdn. treffen']).toBeUndefined()
    // Bild bleibt, nur der Ton ist weg
    expect(neu['en:to point at sb/sth']).toEqual({ bild })
    expect(existsSync(join(wurzel, 'dateien', bild.datei))).toBe(true)
    expect(Object.keys(neu['en:house'].saetze as object)).toEqual(['This is my house.'])
    expect(neu['en:house'].saetzeM).toBeUndefined()
    expect(neu['en:house'].ton).toBeDefined()
    expect(neu['en:soccer [ae]'].ton).toBeDefined()
    expect(neu['en:uk – united kingdom'].ton).toBeDefined()
    expect(neu['en:tv (= television)'].ton).toBeDefined()
    // Gelöschte Dateien sind weg, die übrigen da
    const geloescht = [index['en:ya (= young adults)'].ton.datei, index['en:mr'].ton.datei] as string[]
    for (const d of geloescht) expect(existsSync(join(wurzel, 'dateien', d))).toBe(false)
    expect(existsSync(join(wurzel, 'dateien', index['en:house'].ton.datei as string))).toBe(true)
    // Zweiter Lauf: nichts mehr zu tun
    expect(abkuerzungsToeneLoeschen()).toBe('0 Wort- und 0 Satz-Aufnahmen mit Abkürzungen gelöscht (0 Dateien)')
  })

  it('Kriterium: nur Aufnahmen der Sprach-KI mit geändertem Sprechtext', async () => {
    const { abkuerzungsTonVeraltet } = await import('../src/server/wartungAbkuerzungTon')
    const t = (text: string, extra = {}): never => ({ datei: 'x', stimme: 'v', text, zeit: 1, ...extra }) as never
    expect(abkuerzungsTonVeraltet(t('YA (= young adults)'), 'wort', 'en')).toBe(true)
    expect(abkuerzungsTonVeraltet(t('house'), 'wort', 'en')).toBe(false)
    expect(abkuerzungsTonVeraltet(t('Er wohnt z. B. hier.'), 'satz', 'de')).toBe(true)
    expect(abkuerzungsTonVeraltet(t('YA (= young adults)', { stimme: '' }), 'wort', 'en')).toBe(false)
  })
})
