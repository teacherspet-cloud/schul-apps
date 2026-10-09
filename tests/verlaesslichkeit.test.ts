import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/*
 * Paket Verlässlichkeit (Großprogramm 0.4): Schemaprüfung, genau eine Wiederholung,
 * Verbrauchszählung, verwaiste Hörtexte, Rotation der automatischen Sicherung, Protokoll.
 * Alles gegen Wegwerf-Ordner und mit falschen Anbietern – kein KI-Kontingent.
 */
let wurzel = ''
vi.mock('electron', () => ({ app: { getPath: () => wurzel, getVersion: () => '0.0.0-test' } }))

const { pruefeSchema } = await import('../src/shared/schemaPruefung')
const { mitWiederholung, wiederholbar, SchemaVerletzt, lohntWiederholung } = await import('../src/main/services/ai/wiederholung')
const { merkeVerbrauch, leseVerbrauch, setzeVerbrauchsDatei, monat } = await import('../src/main/services/ai/verbrauch')
const { verwaisteHoertexte, raeumeHoertexteAuf } = await import('../src/main/services/storage/hoertexteAufraeumen')
const { dateiname, listeSicherungen, ladeSicherung, raeumeAuf, faellig } = await import('../src/main/services/storage/autoSicherung')
const { protokolliere, leseProtokoll, setzeProtokollOrdner, entschaerfe } = await import('../src/main/services/protokoll')

beforeEach(() => {
  wurzel = mkdtempSync(join(tmpdir(), 'schulapps-verlaesslich-'))
  setzeProtokollOrdner(wurzel)
})
afterEach(() => {
  setzeProtokollOrdner(null)
  setzeVerbrauchsDatei(null)
  rmSync(wurzel, { recursive: true, force: true })
})

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titel', 'aufgaben'],
  properties: {
    titel: { type: 'string' },
    niveau: { type: ['string', 'null'], enum: ['A1', 'A2', null] },
    aufgaben: { type: 'array', items: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, punkte: { type: 'integer' } } } },
    art: { anyOf: [{ type: 'string' }, { type: 'number' }] }
  }
}

describe('Schemaprüfung', () => {
  it('lässt eine passende Antwort durch', () => {
    expect(pruefeSchema(SCHEMA, { titel: 'T', niveau: null, aufgaben: [{ text: 'a', punkte: 2 }], art: 3 })).toEqual([])
  })
  it('meldet fehlende Pflichtfelder, falsche Typen, Aufzählungen, Listeneinträge und überzählige Felder', () => {
    const f = pruefeSchema(SCHEMA, { aufgaben: [{ punkte: 1.5 }], niveau: 'C2', art: true, extra: 1 })
    expect(f).toContain('$.titel: fehlt')
    expect(f).toContain('$.extra: nicht vorgesehen')
    expect(f).toContain('$.aufgaben[0].text: fehlt')
    expect(pruefeSchema(SCHEMA, { titel: 'T' })).toContain('$.aufgaben: fehlt (Liste)')
    expect(f.some((x) => x.startsWith('$.aufgaben[0].punkte: erwartet integer'))).toBe(true)
    expect(f.some((x) => x.startsWith('$.niveau: Wert'))).toBe(true)
    expect(f).toContain('$.art: passt zu keiner erlaubten Form')
  })
  it('ein fehlendes Pflichtfeld, das null sein darf, zählt nicht (strikte Schemata, Abo-Weg lässt leere Felder weg)', () => {
    const sch = {
      type: 'object',
      required: ['a', 'b', 'c'],
      properties: { a: { type: ['string', 'null'] }, b: { anyOf: [{ type: 'number' }, { type: 'null' }] }, c: { type: 'string' } }
    }
    expect(pruefeSchema(sch, {})).toEqual(['$.c: fehlt'])
  })
  it('begrenzt die Zahl der Meldungen', () => {
    const viele = { type: 'array', items: { type: 'string' } }
    expect(
      pruefeSchema(
        viele,
        Array.from({ length: 50 }, () => 1),
        '$',
        5
      )
    ).toHaveLength(5)
  })
})

describe('Wiederholung', () => {
  const req = { system: 'S', prompt: 'P', schema: SCHEMA, schemaName: 'probe' } as never
  it('ordnet Fehler richtig ein – nie nach Abbruch oder Schlüsselfehler', () => {
    expect(wiederholbar(new SyntaxError('Unexpected token } in JSON'))).toBe('json')
    expect(wiederholbar(new SchemaVerletzt(['x']))).toBe('schema')
    expect(wiederholbar(new Error('529 overloaded'))).toBe('server')
    expect(wiederholbar(new Error('Antwort abgeschnitten (max_tokens)'))).toBe('abgeschnitten')
    expect(wiederholbar(new Error('Vom Nutzer abgebrochen'))).toBeNull()
    expect(wiederholbar(Object.assign(new Error('x'), { name: 'AbortError' }))).toBeNull()
    expect(wiederholbar(new Error('401 invalid x-api-key'))).toBeNull()
  })
  it('fragt bei Schemaverstoß genau ein zweites Mal – mit Hinweis im Systemtext', async () => {
    const aufrufe: string[] = []
    const berichte: string[] = []
    const antwort = await mitWiederholung(
      req,
      async (r) => {
        aufrufe.push((r as { system: string }).system)
        return aufrufe.length === 1 ? { titel: 'x' } : { titel: 'gut', aufgaben: [] }
      },
      (b) => berichte.push(b.art)
    )
    expect(antwort).toEqual({ titel: 'gut', aufgaben: [] })
    expect(aufrufe).toHaveLength(2)
    expect(aufrufe[1]).toMatch(/Schema/)
    expect(berichte).toEqual(['schema'])
  })
  it('wiederholt nur für Typfehler und fehlende Listen oder Objekte', () => {
    expect(lohntWiederholung('$.blocks: fehlt (Liste)')).toBe(true)
    expect(lohntWiederholung('$.meta: fehlt (Objekt)')).toBe(true)
    expect(lohntWiederholung('$.blocks[0].items: fehlt (Liste)')).toBe(false)
    expect(lohntWiederholung('$.titel: fehlt')).toBe(false)
    expect(lohntWiederholung('$.blocks[0].ref: fehlt')).toBe(false)
    expect(lohntWiederholung('$.blocks[0].points: erwartet integer, erhalten string')).toBe(true)
    expect(lohntWiederholung('$.x: nicht vorgesehen')).toBe(false)
  })
  it('wiederholt nicht wegen überzähliger Felder', async () => {
    let n = 0
    await mitWiederholung(req, async () => {
      n++
      return { titel: 'T', aufgaben: [], extra: 1 }
    })
    expect(n).toBe(1)
  })
  it('liefert auch eine zweite abweichende Antwort, wiederholt aber nicht ein drittes Mal', async () => {
    let n = 0
    const a = await mitWiederholung(req, async () => {
      n++
      return { titel: 'nur Titel' }
    })
    expect(n).toBe(2)
    expect(a).toEqual({ titel: 'nur Titel' })
    expect(leseProtokoll()).toMatch(/auch die Wiederholung weicht vom Schema ab/)
  })
  it('wiederholt nie nach einem Abbruch', async () => {
    let n = 0
    await expect(
      mitWiederholung(req, async () => {
        n++
        throw new Error('Auftrag abgebrochen')
      })
    ).rejects.toThrow(/abgebrochen/)
    expect(n).toBe(1)
  })
  it('lässt einen Fehler der Wiederholung durch', async () => {
    let n = 0
    await expect(
      mitWiederholung(req, async () => {
        n++
        throw new Error(n === 1 ? '503 service unavailable' : '503 service unavailable again')
      })
    ).rejects.toThrow(/again/)
    expect(n).toBe(2)
  })
})

describe('Verbrauch', () => {
  it('zählt je Monat, Anbieter und Modell zusammen', () => {
    setzeVerbrauchsDatei(join(wurzel, 'verbrauch.json'))
    const sept = new Date(2026, 8, 27)
    merkeVerbrauch('anthropic', 'claude-x', { anfragen: 1, eingabe: 100, ausgabe: 50 }, undefined, sept)
    merkeVerbrauch('anthropic', 'claude-x', { anfragen: 1, wiederholungen: 1, eingabe: 10, ausgabe: Number.NaN }, undefined, sept)
    merkeVerbrauch('elevenlabs', '', { ttsZeichen: 300 }, undefined, new Date(2026, 9, 1))
    const v = leseVerbrauch()
    expect(monat(sept)).toBe('2026-09')
    expect(v['2026-09']['anthropic · claude-x']).toEqual({ anfragen: 2, wiederholungen: 1, eingabe: 110, ausgabe: 50, bilder: 0, ttsZeichen: 0 })
    expect(v['2026-10']['elevenlabs · Standard'].ttsZeichen).toBe(300)
  })
  it('übersteht eine kaputte Datei', () => {
    setzeVerbrauchsDatei(join(wurzel, 'verbrauch.json'))
    writeFileSync(join(wurzel, 'verbrauch.json'), '{kaputt')
    expect(leseVerbrauch()).toEqual({})
    merkeVerbrauch('openai', 'gpt', { anfragen: 1 })
    expect(Object.values(leseVerbrauch())[0]['openai · gpt'].anfragen).toBe(1)
  })
})

describe('Verwaiste Hörtexte', () => {
  it('findet nur unverwiesene MP3, die älter als sieben Tage sind, und löscht nur diese', () => {
    const dir = join(wurzel, 'hoertexte')
    mkdirSync(dir, { recursive: true })
    mkdirSync(join(wurzel, 'arbeitsblaetter'), { recursive: true })
    writeFileSync(join(wurzel, 'arbeitsblaetter', 'a.json'), '{"audio":"benutzt_1.mp3"}')
    const alt = (Date.now() - 10 * 24 * 3600 * 1000) / 1000
    for (const f of ['benutzt_1.mp3', 'waise_1.mp3', 'frisch_1.mp3']) writeFileSync(join(dir, f), 'x'.repeat(10))
    utimesSync(join(dir, 'benutzt_1.mp3'), alt, alt)
    utimesSync(join(dir, 'waise_1.mp3'), alt, alt)
    expect(verwaisteHoertexte(wurzel)).toEqual({ dateien: ['waise_1.mp3'], bytes: 10 })
    raeumeHoertexteAuf(wurzel)
    expect(readdirSync(dir).sort()).toEqual(['benutzt_1.mp3', 'frisch_1.mp3'])
  })
  it('kommt ohne Hörtext-Ordner aus', () => {
    expect(verwaisteHoertexte(wurzel)).toEqual({ dateien: [], bytes: 0 })
  })
})

describe('Automatische Sicherung', () => {
  it('behält nur die neuesten Stände und lädt nur eigene Dateinamen', () => {
    const dir = join(wurzel, 'sicherungen')
    mkdirSync(dir)
    for (let tag = 1; tag <= 10; tag++) writeFileSync(join(dir, dateiname(new Date(2026, 8, tag, 8, 5))), `{"tag":${tag}}`)
    writeFileSync(join(dir, 'fremd.json'), '{}')
    const weg = raeumeAuf(dir, 7)
    expect(weg).toHaveLength(3)
    const rest = listeSicherungen(dir)
    expect(rest).toHaveLength(7)
    expect(rest[0].name).toBe('Schul-Apps Sicherung 2026-09-10 08-05.json')
    expect(existsSync(join(dir, 'fremd.json'))).toBe(true)
    expect(new TextDecoder().decode(ladeSicherung(rest[0].name, dir))).toBe('{"tag":10}')
    expect(() => ladeSicherung('../settings.json', dir)).toThrow()
  })
  it('ist einmal am Tag fällig, außer abgeschaltet', () => {
    const jetzt = new Date(2026, 8, 28, 12)
    expect(faellig(undefined, undefined, jetzt)).toBe(true)
    expect(faellig(new Date(2026, 8, 28, 9).toISOString(), true, jetzt)).toBe(false)
    expect(faellig(new Date(2026, 8, 27, 11).toISOString(), true, jetzt)).toBe(true)
    expect(faellig(undefined, false, jetzt)).toBe(false)
    expect(faellig('Unsinn', undefined, jetzt)).toBe(true)
  })
})

describe('Protokoll', () => {
  it('entschärft Schlüssel und Zeilenumbrüche', () => {
    const z = entschaerfe('Fehler mit sk-ant-abcdefghijk12345 und api_key: geheim123\nzweite Zeile')
    expect(z).not.toMatch(/abcdefghijk|geheim123/)
    expect(z).not.toMatch(/\n/)
  })
  it('schreibt Zeilen mit Stufe und Quelle', () => {
    protokolliere('fehler', 'test', 'etwas ging schief')
    const text = readFileSync(join(wurzel, 'protokoll.log'), 'utf8')
    expect(text).toMatch(/\[fehler\] test \(v0\.0\.0-test\): etwas ging schief/)
  })
})
