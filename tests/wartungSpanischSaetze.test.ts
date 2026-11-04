import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/*
 * Einmalige Wartung „spanisch-saetze-langsam-2026-11-04": spanische Satzaufnahmen vom 04.11.2026 in die Sicherung
 * (Wunsch der Lehrkraft: zu schnell gesprochen); ab jetzt Tempo 0.85 für spanische Sätze.
 */

vi.mock('electron', () => ({ app: { getPath: () => join(tmpdir(), 'nie-benutzt') } }))

const daten = mkdtempSync(join(tmpdir(), 'spanisch-saetze-'))
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
const HEUTE = Date.parse('2026-11-04T13:10:00+01:00')
const GESTERN = Date.parse('2026-11-03T13:10:00+01:00')
const ton = (text: string, zeit: number): Record<string, unknown> => ({ datei: datei(), stimme: 'voice1', text, zeit })

describe('Wartung: spanische Satzaufnahmen vom 04.11.2026', () => {
  it('entfernt nur spanische Sätze dieses Tages (beide Stimmen), sichert sie; Wörter und andere Sprachen bleiben', async () => {
    mkdirSync(join(wurzel, 'dateien'), { recursive: true })
    const index = {
      'es:casa': {
        ton: ton('casa', HEUTE),
        saetze: { a: ton('Mi casa es grande.', HEUTE), b: ton('La casa es bonita.', GESTERN) },
        saetzeM: { a: ton('Mi casa es grande.', HEUTE) }
      },
      'en:house': { saetze: { a: ton('My house is big.', HEUTE) } }
    }
    writeFileSync(join(wurzel, 'index.json'), JSON.stringify(index))
    const { SPANISCH_SAETZE_LANGSAM, SPANISCH_SATZ_SICHERUNG } = await import('../src/server/wartungSpanischTon')
    expect(SPANISCH_SAETZE_LANGSAM[1](null as never)).toMatch(/^2 spanische Satz-Aufnahmen .*\(2 Dateien/)
    const neu = JSON.parse(readFileSync(join(wurzel, 'index.json'), 'utf8'))
    expect(neu['es:casa'].ton).toBeTruthy()
    expect(Object.keys(neu['es:casa'].saetze)).toEqual(['b'])
    expect(neu['es:casa'].saetzeM).toBeUndefined()
    expect(Object.keys(neu['en:house'].saetze)).toEqual(['a'])
    expect(existsSync(join(wurzel, SPANISCH_SATZ_SICHERUNG, 'index.json'))).toBe(true)
    expect(existsSync(join(wurzel, SPANISCH_SATZ_SICHERUNG, index['es:casa'].saetze.a.datei as string))).toBe(true)
  })

  it('spanische Sätze gehen mit Tempo 0.85, andere Sprachen und Einzelwörter unverändert', async () => {
    const { sprechAuftrag } = await import('../src/renderer/src/shared/medien/medienbank')
    expect(sprechAuftrag('x', 'es', 'satz', 'v', 'Hola.').settings?.speed).toBe(0.85)
    expect(sprechAuftrag('x', 'es-ES', 'satz', 'v', 'Hola.').settings?.speed).toBe(0.85)
    expect(sprechAuftrag('x', 'en', 'satz', 'v', 'Hello.').settings).toBeUndefined()
    expect(sprechAuftrag('x', 'es', 'wort', 'v', 'hola').settings?.speed).toBe(0.9)
  })
})
