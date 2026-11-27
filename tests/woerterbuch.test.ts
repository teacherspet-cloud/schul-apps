import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { nachschlagen, woerterbuchSchliessen } from '../src/server/woerterbuch'
import { woerterbuchNorm, woerterbuecherAus, woerterbuchVorschlag } from '../src/shared/woerterbuecher'

const ordner = mkdtempSync(join(tmpdir(), 'wb-'))
const datei = join(ordner, 'woerterbuch.sqlite')

beforeAll(() => {
  const d = new DatabaseSync(datei)
  d.exec(`CREATE TABLE meta (schluessel TEXT PRIMARY KEY, wert TEXT);
CREATE TABLE eintrag (id INTEGER PRIMARY KEY, wb TEXT NOT NULL, lemma TEXT NOT NULL, norm TEXT NOT NULL, wortart TEXT NOT NULL DEFAULT '', rang INTEGER NOT NULL DEFAULT 0, daten TEXT NOT NULL);
CREATE INDEX eintrag_suche ON eintrag (wb, norm);
CREATE TABLE form (wb TEXT, norm TEXT, lemma_id INTEGER, PRIMARY KEY (wb, norm, lemma_id)) WITHOUT ROWID;`)
  const neu = d.prepare('INSERT INTO eintrag (id, wb, lemma, norm, wortart, rang, daten) VALUES (?, ?, ?, ?, ?, ?, ?)')
  neu.run(1, 'en', 'go', 'go', 'Verb', -50, JSON.stringify({ bedeutungen: [{ text: 'To move from one place to another.' }] }))
  neu.run(2, 'en', 'house', 'house', 'Substantiv', -40, JSON.stringify({ bedeutungen: [{ text: 'A building people live in.' }] }))
  neu.run(3, 'en', 'cock', 'cock', 'Verb', -10, JSON.stringify({ bedeutungen: [{ text: 'A male bird.' }, { text: 'To copulate with; to fuck.' }] }))
  neu.run(4, 'de', 'Straße', 'strasse', 'Substantiv', -30, JSON.stringify({ genus: 'die', silben: 'Stra·ße' }))
  d.prepare('INSERT INTO form (wb, norm, lemma_id) VALUES (?, ?, ?)').run('en', 'went', 1)
  d.close()
  process.env.SCHULAPPS_WOERTERBUCH = datei
})
afterAll(() => {
  woerterbuchSchliessen()
  delete process.env.SCHULAPPS_WOERTERBUCH
  rmSync(ordner, { recursive: true, force: true })
})

describe('Wörterbuch (27.11.2026)', () => {
  it('Vereinheitlichung wie beim Bau', () => {
    expect(woerterbuchNorm(' Straße ')).toBe('strasse')
    expect(woerterbuchNorm('Rēx')).toBe('rex')
    expect(woerterbuchNorm('¿Dónde')).toBe('¿donde')
  })
  it('genau, über Formen, Wortanfang', () => {
    expect(nachschlagen('en', 'go', true).treffer[0].lemma).toBe('go')
    const f = nachschlagen('en', 'went', true)
    expect(f.treffer[0]).toMatchObject({ lemma: 'go', ueberForm: 'went' })
    expect(nachschlagen('en', 'hou', true).treffer.map((t) => t.lemma)).toEqual(['house'])
    expect(nachschlagen('de', 'STRASSE', true).treffer[0].daten.silben).toBe('Stra·ße')
  })
  it('ähnliche Wörter nur auf Arbeitsblättern, nie in Prüfungen', () => {
    expect(nachschlagen('en', 'hause', false).aehnlich).toEqual(['house'])
    expect(nachschlagen('en', 'hause', true).aehnlich).toBeUndefined()
  })
  it('derbe Bedeutungen fallen weg', () => {
    expect(nachschlagen('en', 'cock', true).treffer[0].daten.bedeutungen?.map((b) => b.text)).toEqual(['A male bird.'])
  })
  it('Auswahl und Vorschlag', () => {
    expect(woerterbuecherAus(['en-de', 'quatsch', 'en'])).toEqual(['en', 'en-de'])
    expect(woerterbuchVorschlag('spanisch')).toEqual(['es', 'es-de', 'de-es'])
  })
})
