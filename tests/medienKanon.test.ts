import { afterAll, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  einmalErzeugen,
  ErzeugungsSperre,
  medienSchluessel,
  medienSchluesselAlt,
  satzSchluessel,
  tonKennung,
  tonPasst,
  type MedienEintrag
} from '../src/shared/medienbank'
import { formSchluessel } from '../src/shared/verbTraining'
import { sprechTextFuerWort } from '../src/shared/sprechtext'

/**
 * Dieselbe Vokabel nie zweimal vertonen (10.10.2026): einheitlicher Schlüssel der Medienbank, Rückfall auf alte
 * Schlüssel mit Umzug, Dubletten zählen und zusammenführen, Erzeugungssperre bei gleichzeitigen Aufträgen.
 */

const ordner = mkdtempSync(join(tmpdir(), 'medienkanon-'))
process.env.SCHULAPPS_SERVER = '1'
process.env.SCHULAPPS_DATEN = ordner
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nie-benutzt' } }))
const bank = await import('../src/main/services/storage/medienbank')
afterAll(() => rmSync(ordner, { recursive: true, force: true }))

const wurzel = join(ordner, 'medienbank')
const indexPfad = join(wurzel, 'index.json')
const MP3 = 'data:audio/mpeg;base64,SUQzAwAAAAAAAA=='
let nr = 0
/** Aufnahme mit echter Datei – so lässt sich prüfen, dass nichts gelöscht wird */
const ton = (text: string, zeit: number, gesprochen?: string): MedienEintrag['ton'] => {
  const datei = `${(++nr).toString(16).padStart(24, '0')}.mp3`
  mkdirSync(join(wurzel, 'dateien'), { recursive: true })
  writeFileSync(join(wurzel, 'dateien', datei), 'x')
  return { datei, stimme: 'v1', text, zeit, ...(gesprochen ? { gesprochen } : {}) }
}
const setzeIndex = (i: Record<string, MedienEintrag>): void => {
  mkdirSync(wurzel, { recursive: true })
  writeFileSync(indexPfad, JSON.stringify(i))
  bank.medienbankNeuLesen()
}
const leseIndex = (): Record<string, MedienEintrag> => JSON.parse(readFileSync(indexPfad, 'utf-8'))

describe('Einheitlicher Schlüssel', () => {
  const k = (w: string): string => medienSchluessel('en-GB', w)
  it('Leerraum um „/", Auslassungspunkte, Apostrophe, Anführungszeichen, Leerraum, Satzzeichen am Rand, Groß/klein, NFC/NFD', () => {
    expect(k('a / one')).toBe(k('a/one'))
    expect(k('a /one')).toBe('en:a/one')
    expect(k('to look forward to …')).toBe(k('to look forward to...'))
    expect(k('… ago')).toBe(k('... ago'))
    expect(k('it’s')).toBe(k("it's"))
    expect(k('don‘t')).toBe(k("don't"))
    expect(k('„hello“')).toBe(k('"hello"'))
    expect(k('the  park')).toBe(k('the park'))
    expect(k('Park!')).toBe(k('park'))
    expect(k('Park')).toBe('en:park')
    expect(k('café'.normalize('NFD'))).toBe(k('café'.normalize('NFC')))
  })
  it('bedeutsame Unterschiede bleiben getrennt', () => {
    expect(k('park')).not.toBe(k('bark'))
    // Initialwort klingt anders als das Wort („U. S." gegen „us")
    expect(k('US')).not.toBe(k('us'))
    expect(sprechTextFuerWort({ term: 'US' })).not.toBe(sprechTextFuerWort({ term: 'us' }))
    expect(k('R&B')).toBe('en:R&B')
    // Gleiches Wort, andere Sprache
    expect(medienSchluessel('fr', 'table')).not.toBe(medienSchluessel('en', 'table'))
  })
  it('Homograph der Verbformen behält seinen eigenen Satz-Schlüssel', () => {
    const vergangen = satzSchluessel(formSchluessel('read', 'en', 'past'))
    expect(vergangen).toBe('read (Vergangenheit)')
    expect(vergangen).not.toBe(satzSchluessel(formSchluessel('read', 'en', 'inf')))
    expect(satzSchluessel('It’s  fine…')).toBe(satzSchluessel("It's fine..."))
  })
  it('passt: Schreibvarianten ja, anderer Sprechtext oder anderes Wort nein', () => {
    const t = { text: 'a/one', gesprochen: sprechTextFuerWort({ term: 'a/one' }) }
    expect(tonPasst(t, 'a / one', sprechTextFuerWort({ term: 'a / one' }))).toBe(true)
    expect(tonPasst({ text: 'Park' }, 'park', 'park')).toBe(true)
    // Eigene Aussprache der Lehrkraft („Aussprache als …") → anderer Sprechtext → neu erzeugen
    expect(tonPasst({ text: 'live' }, 'live', 'lyve')).toBe(false)
    expect(tonPasst({ text: 'US', gesprochen: 'U. S.' }, 'us', 'us')).toBe(false)
    expect(tonPasst({ text: 'It’s fine.' }, "It's fine.", "It's fine.", 'satz')).toBe(true)
    expect(tonPasst(undefined, 'x', 'x')).toBe(false)
  })
  it('Sperr-Kennung: je Wort, Art, Fassung und Satz', () => {
    expect(tonKennung('en', 'a / one', 'wort', 'w', 'a / one')).toBe(tonKennung('en', 'a/one', 'wort', 'w', 'a/one'))
    expect(tonKennung('en', 'go', 'wort', 'w', 'go')).not.toBe(tonKennung('en', 'go', 'wort', 'm', 'go'))
    expect(tonKennung('en', 'read', 'satz', 'w', 'read')).not.toBe(tonKennung('en', 'read', 'satz', 'w', 'read (Vergangenheit)'))
  })
})

describe('Rückfall auf alte Schlüssel', () => {
  it('findet den alten Eintrag und zieht ihn auf den kanonischen Schlüssel um', () => {
    const t = ton('a / one', 100)
    setzeIndex({ [medienSchluesselAlt('en', 'a / one')]: { ton: t } })
    expect(medienSchluesselAlt('en', 'a / one')).toBe('en:a / one')
    const m = bank.medienFuer('en', ['a/one'])
    expect(m['a/one'].ton?.datei).toBe(t!.datei)
    // Umgezogen: das nächste Nachschlagen trifft direkt
    expect(Object.keys(leseIndex())).toEqual(['en:a/one'])
    bank.medienbankNeuLesen()
    expect(bank.medienFuer('en', ['a / one'])['a / one'].ton?.datei).toBe(t!.datei)
  })
  it('Initialwort im alten Schlüssel („en:us" mit der Aufnahme von „US") – das Wort „us" bekommt einen eigenen Eintrag', () => {
    const us = ton('US', 100, 'U. S.')
    setzeIndex({ 'en:us': { ton: us } })
    expect(bank.medienFuer('en', ['US']).US.ton?.datei).toBe(us!.datei)
    expect(leseIndex()['en:US']?.ton?.datei).toBe(us!.datei)
    bank.tonSetzen('en', 'us', 'wort', { dataUrl: MP3, stimme: 'v1', text: 'us' })
    const i = leseIndex()
    expect(i['en:US'].ton?.datei).toBe(us!.datei)
    expect(i['en:us'].ton?.text).toBe('us')
    expect(existsSync(join(wurzel, 'dateien', us!.datei))).toBe(true)
  })
  it('Schreiben unter einer Variante ersetzt die vorhandene Aufnahme statt eine zweite anzulegen', () => {
    const alt = ton('it’s', 100)
    setzeIndex({ 'en:it’s': { ton: alt, bild: { datei: 'a'.repeat(24) + '.jpg', herkunft: 'ki', nachweis: 'KI', zeit: 1 } } })
    bank.tonSetzen('en', "it's", 'wort', { dataUrl: MP3, stimme: 'v1', text: "it's" }, 'm')
    const i = leseIndex()
    expect(Object.keys(i)).toEqual(["en:it's"])
    // Bild und weibliche Aufnahme bleiben, die männliche kommt dazu
    expect(i["en:it's"].ton?.datei).toBe(alt!.datei)
    expect(i["en:it's"].bild?.nachweis).toBe('KI')
    expect(i["en:it's"].tonM?.text).toBe("it's")
  })
  it('Sätze in anderer Schreibweise: gefunden unter dem neuen Satz-Schlüssel, beim Neu-Erzeugen ersetzt', () => {
    const s = ton('It’s fine.', 100)
    setzeIndex({ 'en:fine': { saetze: { 'It’s fine.': s! } } })
    expect(bank.medienFuer('en', ['fine']).fine.saetze?.[satzSchluessel("It's fine.")]?.datei).toBe(s!.datei)
    bank.tonSetzen('en', 'fine', 'satz', { dataUrl: MP3, stimme: 'v1', text: "It's fine." })
    expect(Object.keys(leseIndex()['en:fine'].saetze ?? {})).toEqual(["It's fine."])
    // Die ersetzte Aufnahme dieses Satzes ist weg (ausdrücklich neu erzeugt), die neue liegt da
    expect(existsSync(join(wurzel, 'dateien', s!.datei))).toBe(false)
  })
})

describe('Dubletten', () => {
  it('mehrere alte Einträge desselben Wortes: der beste gilt, gezählt, zusammengeführt – keine Datei gelöscht', () => {
    const neu = ton('a / one', 300)
    const eigen = ton('a/ one', 200, 'a, one')
    const mann = ton('a /one', 100)
    setzeIndex({ 'en:a / one': { ton: neu }, 'en:a/ one': { ton: eigen }, 'en:a /one': { tonM: mann } })
    // Ausdrücklicher Sprechtext vor der neueren Aufnahme
    expect(bank.medienFuer('en', ['a/one'])['a/one'].ton?.datei).toBe(eigen!.datei)
    const d = bank.medienDubletten()
    expect(d.gruppen).toBe(1)
    expect(d.eintraege).toBe(2)
    const melder = vi.fn()
    bank.dublettenMelder(melder)
    bank.dublettenPruefen()
    bank.dublettenPruefen()
    expect(melder).toHaveBeenCalledTimes(1)
    expect(melder.mock.calls[0][0]).toMatch(/1 Wörter mit 2 zusätzlichen Einträgen/)
    const z = bank.medienKanonOrdnen()
    expect(z.zusammengefuehrt).toBe(1)
    const i = leseIndex()
    expect(Object.keys(i)).toEqual(['en:a/one'])
    expect(i['en:a/one'].ton?.datei).toBe(eigen!.datei)
    expect(i['en:a/one'].tonM?.datei).toBe(mann!.datei)
    for (const t of [neu, eigen, mann]) expect(existsSync(join(wurzel, 'dateien', t!.datei))).toBe(true)
    expect(Object.keys(JSON.parse(readFileSync(join(wurzel, 'dubletten.json'), 'utf-8'))).length).toBeGreaterThanOrEqual(2)
    expect(existsSync(join(wurzel, 'sicherung-kanon-2026-10-10', 'index.json'))).toBe(true)
    expect(bank.medienDubletten().gruppen).toBe(0)
    bank.dublettenMelder(null)
  })
  it('ohne Dubletten: keine Protokollzeile', () => {
    setzeIndex({ 'en:park': { ton: ton('park', 1) } })
    const melder = vi.fn()
    bank.dublettenMelder(melder)
    bank.dublettenPruefen()
    expect(melder).not.toHaveBeenCalled()
    bank.dublettenMelder(null)
  })
})

describe('Gleichzeitige Erzeugung', () => {
  it('zwei Aufträge für dieselbe Vokabel – die Sprach-KI wird nur einmal gerufen', async () => {
    const sperre = new ErzeugungsSperre(10_000, 5_000)
    let da = false
    const tts = vi.fn(async () => {
      await new Promise((ok) => setTimeout(ok, 30))
      da = true
    })
    const kennung = tonKennung('en', 'a / one', 'wort', 'w', 'a / one')
    const auftrag = (wort: string): Promise<'erzeugt' | 'vorhanden'> =>
      einmalErzeugen({
        reservieren: () => sperre.reservieren(tonKennung('en', wort, 'wort', 'w', wort)),
        freigeben: () => sperre.freigeben(tonKennung('en', wort, 'wort', 'w', wort)),
        passt: async () => da,
        erzeugen: tts
      })
    const [a, b] = await Promise.all([auftrag('a / one'), auftrag('a/one')])
    expect(tts).toHaveBeenCalledTimes(1)
    expect([a, b].sort()).toEqual(['erzeugt', 'vorhanden'])
    expect(sperre.anzahl).toBe(0)
    expect(kennung).toBe(tonKennung('en', 'a/one', 'wort', 'w', 'a/one'))
  })
  it('über die Sperre der Medienbank (wie am Server für alle Lehrkräfte)', async () => {
    let da = false
    const tts = vi.fn(async () => {
      await new Promise((ok) => setTimeout(ok, 20))
      da = true
    })
    const k = tonKennung('en', 'river', 'wort', 'm', 'river')
    const auftrag = (): Promise<'erzeugt' | 'vorhanden'> =>
      einmalErzeugen({ reservieren: () => bank.tonReservieren(k), freigeben: () => bank.tonFreigeben(k), passt: async () => da, erzeugen: tts })
    await Promise.all([auftrag(), auftrag(), auftrag()])
    expect(tts).toHaveBeenCalledTimes(1)
  })
  it('scheitert die erste Erzeugung, versucht es die zweite selbst', async () => {
    const sperre = new ErzeugungsSperre(10_000, 5_000)
    let n = 0
    const tts = vi.fn(async () => {
      await new Promise((ok) => setTimeout(ok, 10))
      if (++n === 1) throw new Error('429')
    })
    const auftrag = (): Promise<'erzeugt' | 'vorhanden'> =>
      einmalErzeugen({ reservieren: () => sperre.reservieren('k'), freigeben: () => sperre.freigeben('k'), passt: async () => n > 1, erzeugen: tts })
    const erg = await Promise.allSettled([auftrag(), auftrag()])
    expect(erg.map((e) => e.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(tts).toHaveBeenCalledTimes(2)
  })
  it('ausdrücklich „neu erzeugen" ersetzt auch eine passende Aufnahme', async () => {
    const tts = vi.fn(async () => undefined)
    const sperre = new ErzeugungsSperre()
    expect(
      await einmalErzeugen({ reservieren: () => sperre.reservieren('x'), freigeben: () => sperre.freigeben('x'), passt: async () => true, erzeugen: tts, trotzdem: true })
    ).toBe('erzeugt')
    expect(
      await einmalErzeugen({ reservieren: () => sperre.reservieren('x'), freigeben: () => sperre.freigeben('x'), passt: async () => true, erzeugen: tts })
    ).toBe('vorhanden')
    expect(tts).toHaveBeenCalledTimes(1)
  })
})
