import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/*
 * Einstellungen › KI-Zugang › Verbrauch mit Diagrammen (09.10.2026): Zählung je Tag, Auftragsart und Limit
 * (main/services/ai/verbrauch.ts), Auswertung für Kennzahlen und Diagramme (shared/verbrauch.ts), die Regel, wann der
 * Verbrauch erscheint, und die Statuszeilen der eingeklappten Karten (shared/einstellungsStatus.ts). Ohne KI.
 */
let wurzel = ''
vi.mock('electron', () => ({ app: { getPath: () => wurzel, getVersion: () => '0.0.0-test' } }))

const { merkeVerbrauch, merkeLimit, leseVerbrauch, verbrauchsDaten, setzeVerbrauchsDatei } = await import('../src/main/services/ai/verbrauch')
const { werteVerbrauchAus, verbrauchSichtbar, letzteTage } = await import('../src/shared/verbrauch')
const { artVonSchema, istLimit } = await import('../src/shared/kiArten')
const s = await import('../src/shared/einstellungsStatus')

beforeEach(() => {
  wurzel = mkdtempSync(join(tmpdir(), 'schulapps-verbrauch-'))
  setzeVerbrauchsDatei(join(wurzel, 'verbrauch.json'))
})
afterEach(() => {
  setzeVerbrauchsDatei(null)
  rmSync(wurzel, { recursive: true, force: true })
})

describe('Verbrauch sichtbar', () => {
  it('nur mit mindestens einem eingerichteten Zugang (Text, Bild oder Vertonung)', () => {
    expect(verbrauchSichtbar(null)).toBe(false)
    expect(verbrauchSichtbar({ hasTextKey: false, hasImageKey: false, hasTts: false })).toBe(false)
    expect(verbrauchSichtbar({ hasTextKey: true, hasImageKey: false, hasTts: false })).toBe(true)
    expect(verbrauchSichtbar({ hasTextKey: false, hasImageKey: true, hasTts: false })).toBe(true)
    expect(verbrauchSichtbar({ hasTextKey: false, hasImageKey: false, hasTts: true })).toBe(true)
  })
})

describe('Zählung je Tag', () => {
  it('zählt je Tag Anbieter, Auftragsart und Limits – die Monate bleiben wie bisher', () => {
    const tag = new Date(2026, 9, 8, 10)
    merkeVerbrauch('anthropic', 'claude-x', { anfragen: 1 }, artVonSchema('worksheet_block'), tag)
    merkeVerbrauch('anthropic', 'claude-x', { anfragen: 1, wiederholungen: 1 }, artVonSchema('worksheet_block'), tag)
    // Token-Meldung des Anbieters ohne Art: zählt Token, aber keinen weiteren Aufruf
    merkeVerbrauch('anthropic', 'claude-x', { eingabe: 500, ausgabe: 200 }, undefined, tag)
    merkeVerbrauch('openai', '', { bilder: 1 }, 'bild', tag)
    merkeVerbrauch('elevenlabs', 'eleven_v3', { ttsZeichen: 900 }, 'hoertext', tag)
    merkeLimit('anthropic', 'Anthropic: Limit erreicht (429). Bitte kurz warten.', 'grammatik', tag)
    const d = verbrauchsDaten()
    expect(Object.keys(leseVerbrauch())).toEqual(['2026-10'])
    expect(d.monate['2026-10']['anthropic · claude-x']).toMatchObject({ anfragen: 2, wiederholungen: 1, eingabe: 500, ausgabe: 200 })
    const t = d.tage['2026-10-08']
    expect(t.anbieter.anthropic).toMatchObject({ n: 2, anfragen: 2, wiederholungen: 1, eingabe: 500, ausgabe: 200, limits: 1 })
    expect(t.anbieter.openai).toMatchObject({ n: 1, bilder: 1 })
    expect(t.anbieter.elevenlabs).toMatchObject({ n: 1, ttsZeichen: 900 })
    expect(t.arten).toEqual({ arbeitsblatt: 2, bild: 1, hoertext: 1 })
    expect(d.limits).toHaveLength(1)
    expect(d.limits[0]).toMatchObject({ anbieter: 'anthropic', art: 'grammatik' })
  })

  it('hält Tage und Limits begrenzt', () => {
    merkeVerbrauch('openai', 'gpt', { anfragen: 1 }, 'vokabeln', new Date(2026, 0, 1))
    for (let i = 0; i < 40; i++) merkeLimit('openai', '429 zu viele Anfragen', undefined, new Date(2026, 9, 8, 8, i))
    const d = verbrauchsDaten()
    expect(d.tage['2026-01-01']).toBeUndefined()
    expect(d.limits.length).toBe(30)
  })
})

describe('Auswertung für die Diagramme', () => {
  const jetzt = new Date(2026, 9, 9, 12) // Freitag
  it('Kennzahlen, Säulen je Tag, Programme und Limits', () => {
    merkeVerbrauch('anthropic', 'm', { anfragen: 3 }, 'arbeitsblatt', new Date(2026, 9, 6, 9)) // Dienstag
    merkeVerbrauch('openai', 'g', { anfragen: 1 }, 'grammatik', new Date(2026, 9, 9, 9))
    merkeVerbrauch('anthropic', 'm', { anfragen: 2, wiederholungen: 1 }, 'arbeitsblatt', new Date(2026, 9, 2, 9)) // Vorwoche
    merkeVerbrauch('openai', 'g', { anfragen: 4 }, 'vokabeln', new Date(2026, 8, 20, 9)) // Vormonat, im Zeitraum
    merkeLimit('openai', '429', 'grammatik', new Date(2026, 9, 9, 10))
    const a = werteVerbrauchAus(verbrauchsDaten(), jetzt)
    expect(a.tage).toHaveLength(30)
    expect(a.tage[29]).toBe('2026-10-09')
    expect(a.kennzahlen.woche).toBe(4)
    expect(a.kennzahlen.monat).toBe(6)
    expect(a.kennzahlen.zeitraum).toBe(10)
    expect(a.kennzahlen.limits).toBe(1)
    expect(a.kennzahlen.ohneWiederholung).toBeCloseTo(1 - 1 / 10)
    expect(a.anbieter.map((x) => x.id)).toEqual(['openai', 'anthropic'])
    expect(a.arten[0]).toMatchObject({ art: 'arbeitsblatt', name: 'Arbeitsblatt', wert: 5 })
    const heute = a.jeTag[29]
    expect(heute).toMatchObject({ summe: 1, limits: 1, anbieter: { openai: 1 }, arten: { grammatik: 1 } })
    expect(a.limits).toHaveLength(1)
  })
  it('kommt mit leeren und alten Daten zurecht', () => {
    const a = werteVerbrauchAus({ monate: {}, tage: {}, limits: [] }, jetzt)
    expect(a.kennzahlen).toMatchObject({ woche: 0, monat: 0, zeitraum: 0, ohneWiederholung: null })
    expect(a.arten).toEqual([])
    // Ältere Tageszähler ohne `n`
    const b = werteVerbrauchAus({ monate: {}, tage: { '2026-10-09': { anbieter: { google: { anfragen: 2, bilder: 1 } }, arten: {} } }, limits: [] }, jetzt)
    expect(b.jeTag[29].summe).toBe(3)
  })
  it('letzte Tage über den Monatswechsel', () => {
    expect(letzteTage(3, new Date(2026, 9, 1))).toEqual(['2026-09-29', '2026-09-30', '2026-10-01'])
  })
  it('erkennt Limits und Auftragsarten', () => {
    expect(istLimit('OpenAI: Zu viele Anfragen in kurzer Zeit (429).')).toBe(true)
    expect(istLimit('Das Kontingent des Google-Abos ist erschöpft.')).toBe(true)
    expect(istLimit('Netzwerkfehler')).toBe(false)
    expect(artVonSchema('grammatik_pool')).toBe('grammatik')
    expect(artVonSchema('vocab_list')).toBe('vokabeln')
    expect(artVonSchema('unbekannt')).toBe('sonstiges')
  })
})

describe('Statuszeilen der eingeklappten Karten', () => {
  it('KI für Texte und Bilder', () => {
    expect(s.textKiStatus({ hasTextKey: true, textAccess: 'subscription' }, 'Anthropic (Claude)')).toBe('Claude · Abo eingerichtet')
    expect(s.textKiStatus({ hasTextKey: true, textAccess: 'api' }, 'OpenAI (ChatGPT)')).toBe('ChatGPT · Schlüssel hinterlegt')
    expect(s.textKiStatus({ hasTextKey: false, textAccess: 'api' }, 'Mistral')).toBe('Mistral · noch nicht eingerichtet')
    expect(s.textKiStatus(null, 'Google (Gemini)', true)).toBe('Über Schul-Apps am PC')
    expect(s.bildKiStatus({ imageProvider: 'none' }, null)).toBe('Keine KI-Bilder')
    expect(s.bildKiStatus({ imageProvider: 'openai', imageAccess: 'api', hasImageKey: true }, 'OpenAI (ChatGPT)')).toBe('ChatGPT · Schlüssel hinterlegt')
  })
  it('Hörtexte, Bildsuche, Stimmen, Verbrauch', () => {
    expect(s.hoertextStatus(true, false)).toBe('ElevenLabs · Schlüssel hinterlegt')
    expect(s.hoertextStatus(false, true)).toBe('OpenAI-Stimmen über den API-Schlüssel')
    expect(s.hoertextStatus(false, false)).toMatch(/Kein Schlüssel/)
    expect(s.bildsucheStatus(false)).toBe('Openverse (ohne Schlüssel)')
    expect(s.stimmenStatus({ en: { w: 'a', m: 'b' }, fr: { w: 'c' } })).toBe('3 Stimmen für 2 Sprachen')
    expect(s.stimmenStatus({})).toBe('Noch keine Stimmen gewählt')
    expect(s.verbrauchStatus(1234, 2)).toBe('1.234 Anfragen in 30 Tagen · 2 Limits erreicht')
    expect(s.verbrauchStatus(0)).toBe('Keine Anfragen in 30 Tagen')
  })
  it('gemerkter Klappzustand übersteht kaputte Werte', () => {
    expect(s.leseOffen(null)).toEqual({})
    expect(s.leseOffen('{kaputt')).toEqual({})
    expect(s.leseOffen('[1]')).toEqual({})
    expect(s.leseOffen('{"verbrauch":true,"x":"ja"}')).toEqual({ verbrauch: true })
  })
})
