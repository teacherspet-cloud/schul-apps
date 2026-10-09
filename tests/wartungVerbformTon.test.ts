import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/* Einmalige Wartung „verbform-ton-2026-10-09": Aufnahmen mit „slash" und alter Verbform-Aussprache entfernen (gesichert) */

vi.mock('electron', () => ({ app: { getPath: () => join(tmpdir(), 'nie-benutzt') } }))

const daten = mkdtempSync(join(tmpdir(), 'verbform-ton-'))
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
const saetze = (...texte: string[]): Record<string, unknown> => Object.fromEntries(texte.map((t) => [t, ton(t)]))

describe('Wartung: Aufnahmen mit Schrägstrich und alten Verbformen', () => {
  it('ohne Medienbank geschieht nichts und es wird nichts angelegt', async () => {
    const { verbformToeneLoeschen } = await import('../src/server/wartungVerbformTon')
    expect(verbformToeneLoeschen()).toMatch(/^0 Wort- und 0 Satz-Aufnahmen .*\(0 Dateien/)
    expect(existsSync(wurzel)).toBe(false)
  })

  it('entfernt genau die betroffenen Aufnahmen beider Fassungen und sichert sie vorher', async () => {
    mkdirSync(join(wurzel, 'dateien'), { recursive: true })
    const bild = { datei: 'ffffffffffffffffffffffff.jpg', herkunft: 'suche', nachweis: '', zeit: 1 }
    writeFileSync(join(wurzel, 'dateien', bild.datei), 'jpg')
    const index: Record<string, Record<string, unknown>> = {
      // Verb „be": „was, were" (alter Sprechtext ohne Pause) weg, „to be"/„been" bleiben
      'en:be': { bild, saetze: saetze('to be', 'was, were', 'been'), saetzeM: saetze('was, were') },
      // „read": die eine alte Aufnahme bleibt (künftig der Infinitiv)
      'en:read': { saetze: saetze('read') },
      // „lead": Infinitiv jetzt „leed" – weg; „led" bleibt
      'en:lead': { saetze: saetze('lead', 'led') },
      // „wind – wound – wound": beide anders
      'en:wind': { saetze: saetze('wind', 'wound') },
      // Französisch: „je suis allée" aus „allé(e)" – weg
      'fr:aller': { saetze: saetze('aller', 'je vais', 'je suis allée') },
      // Italienisch: „sono stato, a" aus „stato/a" – weg
      'it:essere': { saetze: saetze('essere', 'sono', 'sono stato, a') },
      // Latein: Aufnahme eines Strichs – weg
      'la:sum': { saetze: saetze('sum', 'esse', 'fui', '—') },
      // Wort mit Schrägstrich – weg; Wort ohne – bleibt
      'en:he/she': { ton: ton('he/she'), tonM: ton('he/she') },
      'en:house': { ton: ton('house'), saetze: saetze('This is my house, and/or my home.', 'I like it, really.') },
      // Hinweis im Verb-Eintrag (mit Doppelpunkt) bleibt
      'en:learn': { saetze: { ...saetze('learn', 'learnt, learned'), 'auch: learned': ton('auch: learned') } },
      // Schon nach den neuen Regeln erzeugt: bleibt
      'en:burn': { saetze: { burn: ton('burn'), 'burnt, burned': ton('burnt, burned', { gesprochen: 'burnt … burned' }) } },
      // Herkunft unbekannt (keine Stimme): bleibt
      'en:dream': { saetze: { dream: ton('dream'), 'dreamt, dreamed': ton('dreamt, dreamed', { stimme: '' }) } }
    }
    writeFileSync(join(wurzel, 'index.json'), JSON.stringify(index))
    const vorher = readFileSync(join(wurzel, 'index.json'), 'utf8')
    const { verbformToeneLoeschen, VERBFORM_SICHERUNG } = await import('../src/server/wartungVerbformTon')
    expect(verbformToeneLoeschen()).toBe(
      `2 Wort- und 10 Satz-Aufnahmen mit Schrägstrich bzw. alter Verbform-Aussprache entfernt (12 Dateien, gesichert in ${VERBFORM_SICHERUNG})`
    )
    const neu = JSON.parse(readFileSync(join(wurzel, 'index.json'), 'utf8')) as Record<string, Record<string, Record<string, unknown>>>
    expect(Object.keys(neu['en:be'].saetze)).toEqual(['to be', 'been'])
    expect(neu['en:be'].saetzeM).toBeUndefined()
    expect(neu['en:be'].bild).toEqual(bild)
    expect(Object.keys(neu['en:read'].saetze)).toEqual(['read'])
    expect(Object.keys(neu['en:lead'].saetze)).toEqual(['led'])
    expect(neu['en:wind']).toBeUndefined()
    expect(Object.keys(neu['fr:aller'].saetze)).toEqual(['aller', 'je vais'])
    expect(Object.keys(neu['it:essere'].saetze)).toEqual(['essere', 'sono'])
    expect(Object.keys(neu['la:sum'].saetze)).toEqual(['sum', 'esse', 'fui'])
    expect(neu['en:he/she']).toBeUndefined()
    expect(Object.keys(neu['en:house'].saetze)).toEqual(['I like it, really.'])
    expect(neu['en:house'].ton).toBeDefined()
    expect(Object.keys(neu['en:learn'].saetze)).toEqual(['learn', 'auch: learned'])
    expect(Object.keys(neu['en:burn'].saetze)).toEqual(['burn', 'burnt, burned'])
    expect(Object.keys(neu['en:dream'].saetze)).toEqual(['dream', 'dreamt, dreamed'])
    // Sicherung: alter Index und die verschobenen Dateien
    const sich = join(wurzel, VERBFORM_SICHERUNG)
    expect(readFileSync(join(sich, 'index.json'), 'utf8')).toBe(vorher)
    const weg = index['en:be'].saetze as Record<string, { datei: string }>
    expect(existsSync(join(wurzel, 'dateien', weg['was, were'].datei))).toBe(false)
    expect(existsSync(join(sich, weg['was, were'].datei))).toBe(true)
    expect(existsSync(join(wurzel, 'dateien', weg['to be'].datei))).toBe(true)
    expect(existsSync(join(wurzel, 'dateien', bild.datei))).toBe(true)
    // Zweiter Lauf: nichts mehr zu tun, die Sicherung bleibt die vom ersten Lauf
    expect(verbformToeneLoeschen()).toMatch(/^0 Wort- und 0 Satz-Aufnahmen/)
    expect(readFileSync(join(sich, 'index.json'), 'utf8')).toBe(vorher)
  })

  it('ist als Wartung angemeldet', async () => {
    const { VERBFORM_TON } = await import('../src/server/wartungVerbformTon')
    expect(VERBFORM_TON[0]).toBe('verbform-ton-2026-10-09')
  })
})
