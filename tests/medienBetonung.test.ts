import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { istFrage, tonPasst, wortTon, type MedienEintrag } from '../src/shared/medienbank'

/**
 * Schreibvarianten eines Wortes in verschiedenen Lehrwerken (08.11.2026, Wunsch der Lehrkraft): „look" = „Look!",
 * „a ver" = „A ver …"; nur eine Frage („¿Vamos?" neben „¡Vamos!") bekommt eine eigene Aufnahme.
 */

const ordner = mkdtempSync(join(tmpdir(), 'medienbetonung-'))
process.env.SCHULAPPS_SERVER = '1'
process.env.SCHULAPPS_DATEN = ordner
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nie-benutzt' } }))
const bank = await import('../src/main/services/storage/medienbank')
afterAll(() => rmSync(ordner, { recursive: true, force: true }))

const MP3 = 'data:audio/mpeg;base64,SUQzAwAAAAAAAA=='
const index = (): Record<string, MedienEintrag> => JSON.parse(readFileSync(join(ordner, 'medienbank', 'index.json'), 'utf-8'))
const setze = (sprache: string, wort: string, lage: 'w' | 'm' = 'w'): void =>
  void bank.tonSetzen(sprache, wort, 'wort', { dataUrl: MP3, stimme: 'v', text: wort }, lage)

describe('tonPasst bei Einzelwörtern', () => {
  const t = (text: string): { text: string } => ({ text })
  it('Großschreibung, Ausrufezeichen, Auslassungspunkte und Komma am Rand klingen gleich', () => {
    expect(tonPasst(t('Look!'), 'look', 'look')).toBe(true)
    expect(tonPasst(t('a ver'), 'A ver …', 'A ver …')).toBe(true)
    expect(tonPasst(t('oye'), 'Oye, …', 'Oye, …')).toBe(true)
    expect(tonPasst(t('¡Claro!'), 'claro', 'claro')).toBe(true)
    expect(tonPasst({ text: '¡Tranquilo/Tranquila!', gesprochen: '¡Tranquilo … Tranquila!' }, 'tranquilo/tranquila', 'tranquilo … tranquila')).toBe(true)
    expect(tonPasst(t('¿cuándo?'), '¿cuándo …?', '¿cuándo …?')).toBe(true)
  })
  it('Frage und Aussage bleiben verschieden', () => {
    expect(istFrage('¿Vamos?')).toBe(true)
    expect(tonPasst(t('¿Vamos?'), '¡Vamos!', '¡Vamos!')).toBe(false)
    expect(tonPasst(t('¿De verdad?'), 'de verdad', 'de verdad')).toBe(false)
    expect(tonPasst(t('What the hell …'), 'What the hell?')).toBe(false)
  })
  it('Sätze unverändert: Satzzeichen zählen weiter', () => {
    expect(tonPasst(t('I like it.'), 'I like it!', 'I like it!', 'satz')).toBe(false)
  })
})

describe('Zweite Betonung in der Medienbank', () => {
  it('Frage neben Aussage: zwei Plätze, jede Liste bekommt ihre', () => {
    setze('es', '¿Vamos?')
    setze('es', '¡Vamos!')
    setze('es', '¡Vamos!', 'm')
    const e = index()['es:vamos']
    expect(e.ton?.text).toBe('¿Vamos?')
    expect(e.tonAnders?.text).toBe('¡Vamos!')
    expect(e.tonM?.text).toBe('¡Vamos!')
    expect(e.tonAndersM).toBeUndefined()
    const sicht = bank.medienFuer('es', ['¡Vamos!', '¿Vamos?'])
    expect(sicht['¡Vamos!'].ton?.text).toBe('¡Vamos!')
    expect(sicht['¿Vamos?'].ton?.text).toBe('¿Vamos?')
    // Lernende mit männlicher Stimme: für die Frage fehlt die eigene – Rückfall auf die Frage der anderen Stimme
    expect(bank.medienFuer('es', ['¿Vamos?'], { lage: 'm' })['¿Vamos?'].ton?.text).toBe('¿Vamos?')
    expect(wortTon(e, 'm', '¿Vamos?')?.text).toBe('¡Vamos!')
  })
  it('Gleiche Betonung ersetzt die erste Aufnahme (kein Pendeln zwischen „look" und „Look!")', () => {
    setze('en', 'Look!')
    setze('en', 'look')
    const e = index()['en:look']
    expect(e.ton?.text).toBe('look')
    expect(e.tonAnders).toBeUndefined()
  })
  it('Löschen trifft die Betonung des Wortlauts, die zweite rückt nach', () => {
    bank.tonLoeschen('es', '¿Vamos?', 'wort', undefined, 'w')
    const e = index()['es:vamos']
    expect(e.ton?.text).toBe('¡Vamos!')
    expect(e.tonAnders).toBeUndefined()
  })
})
