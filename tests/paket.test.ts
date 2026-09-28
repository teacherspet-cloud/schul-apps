import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { afterAll, describe, expect, it } from 'vitest'
import {
  designIn,
  hoertexteIn,
  maskottchenIn,
  PAKET_ARTEN,
  paketBauen,
  paketEinlesen,
  paketVorschau,
  type Ablageweg,
  type PaketArt
} from '../src/main/services/paket/paket'

/** Ablagen im Speicher – wie die echten: get wirft bei unbekannter Kennung, save legt an/überschreibt */
function speicher(): { wege: Record<PaketArt, Ablageweg>; inhalt: Record<string, Map<string, Record<string, unknown>>> } {
  const inhalt: Record<string, Map<string, Record<string, unknown>>> = {}
  const wege = {} as Record<PaketArt, Ablageweg>
  for (const art of PAKET_ARTEN) {
    const m = new Map<string, Record<string, unknown>>()
    inhalt[art] = m
    wege[art] = {
      get: (id) => {
        const x = m.get(id)
        if (!x) throw new Error('nicht gefunden')
        return x
      },
      save: (input) => {
        m.set(input.id, {
          ...input.stats,
          id: input.id,
          name: input.name,
          createdAt: 'x',
          updatedAt: 'x',
          payload: input.payload,
          ...(input.thumb ? { thumb: input.thumb } : {})
        })
        return { id: input.id }
      }
    }
  }
  return { wege, inhalt }
}

const ordner = mkdtempSync(join(tmpdir(), 'paket-'))
afterAll(() => rmSync(ordner, { recursive: true, force: true }))
const pfad = (n: string): string => join(ordner, n)

describe('Schulpaket', () => {
  it('findet Hörtexte im Material', () => {
    expect(hoertexteIn({ a: { audio: 'abc_1.mp3' }, b: ['abc_1.mp3', 'x-2.mp3'] }).sort()).toEqual(['abc_1.mp3', 'x-2.mp3'])
  })

  it('packt Material samt Hörtext und liest es mit neuen Kennungen wieder ein', () => {
    writeFileSync(pfad('hoer1.mp3'), Buffer.from([1, 2, 3]))
    const quelle = speicher()
    quelle.wege.arbeitsblatt.save({
      id: 'ab-1',
      name: 'Julikrise',
      stats: { subjectLabel: 'Geschichte', grade: 9 },
      payload: { audio: 'hoer1.mp3' },
      thumb: 'data:x'
    })
    quelle.wege.elternbrief.save({ id: 'eb-1', name: 'Wandertag', stats: {}, payload: { text: null } })
    const daten = paketBauen(
      'Einheit 9b',
      [
        { art: 'arbeitsblatt', id: 'ab-1' },
        { art: 'elternbrief', id: 'eb-1' }
      ],
      quelle.wege,
      pfad
    )
    const v = paketVorschau(daten)
    expect(v.titel).toBe('Einheit 9b')
    expect(v.eintraege).toEqual([
      { art: 'arbeitsblatt', name: 'Julikrise' },
      { art: 'elternbrief', name: 'Wandertag' }
    ])
    expect(v.hoertexte).toBe(1)

    const ziel = speicher()
    ziel.wege.arbeitsblatt.save({ id: 'ab-1', name: 'Eigenes', stats: {}, payload: 1 })
    const geschrieben: string[] = []
    const neu = paketEinlesen(daten, ziel.wege, (n) => geschrieben.push(n))
    expect(geschrieben).toEqual(['hoer1.mp3'])
    expect(neu).toHaveLength(2)
    expect(neu[0].id).not.toBe('ab-1')
    expect(neu[0].id).toMatch(/^[A-Za-z0-9_-]{4,64}$/)
    // Nichts überschrieben
    expect(ziel.inhalt.arbeitsblatt.get('ab-1')?.name).toBe('Eigenes')
    const kopie = ziel.inhalt.arbeitsblatt.get(neu[0].id)!
    expect(kopie).toMatchObject({ name: 'Julikrise', subjectLabel: 'Geschichte', grade: 9, thumb: 'data:x', payload: { audio: 'hoer1.mp3' } })
    // Zweimal einlesen gibt zwei Kopien
    const nochmal = paketEinlesen(daten, ziel.wege, () => undefined)
    expect(nochmal[0].id).not.toBe(neu[0].id)
    expect(ziel.inhalt.arbeitsblatt.size).toBe(3)
  })

  it('lässt fehlende Hörtexte weg und verlangt eine Auswahl', () => {
    const q = speicher()
    q.wege.vokabeltest.save({ id: 'vt-1', name: 'Unit 3', stats: {}, payload: { a: 'fehlt.mp3' } })
    const daten = paketBauen('P', [{ art: 'vokabeltest', id: 'vt-1' }], q.wege, pfad)
    expect(paketVorschau(daten).hoertexte).toBe(0)
    expect(() => paketBauen('P', [], q.wege, pfad)).toThrow(/kein Material/)
  })

  it('liest nur die erwarteten Pfade – keine Pfade nach draußen', () => {
    const manifest = {
      app: 'schul-apps',
      typ: 'schulpaket',
      version: 1,
      titel: 'Böse',
      erstellt: '',
      eintraege: [{ art: 'arbeitsblatt', name: 'x', datei: 'material/1.json' }],
      hoertexte: []
    }
    const daten = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'material/1.json': strToU8(JSON.stringify({ name: 'x', payload: {} })),
      'hoertexte/../../boese.mp3': new Uint8Array([1]),
      'hoertexte/ok.mp3': new Uint8Array([1]),
      '../ausbruch.txt': strToU8('x')
    })
    const geschrieben: string[] = []
    paketEinlesen(daten, speicher().wege, (n) => geschrieben.push(n))
    expect(geschrieben).toEqual(['ok.mp3'])
    expect(Object.keys(unzipSync(daten))).toContain('../ausbruch.txt')
  })

  it('nimmt eigene Designvorlagen und Maskottchen mit – mitgelieferte nicht', () => {
    const eigenes = { id: 'eigen-1', name: 'Schulfarben', isDefault: true, page: { marginMm: 15 }, header: { layout: 'band' } }
    expect(designIn({ design: eigenes })).toBe(eigenes)
    expect(designIn({ design: { ...eigenes, id: 'preset-klassisch' } })).toBeNull()
    expect(maskottchenIn({ illustration: { maskottchenId: 'eule-1', pose: 'winkend' }, x: { maskottchenId: 'eule-1' } })).toEqual(['eule-1'])

    const q = speicher()
    q.wege.arbeitsblatt.save({
      id: 'ab-9',
      name: 'Mit Eule',
      stats: {},
      payload: { design: eigenes, illustration: { maskottchenId: 'eule-1', pose: 'winkend' } }
    })
    q.wege.arbeitsblatt.save({ id: 'ab-8', name: 'Mit Fuchs', stats: {}, payload: { illustration: { maskottchenId: 'fuchs', pose: 'winkend' } } })
    const figuren: Record<string, Record<string, Uint8Array>> = {
      'eule-1': {
        'figur.json': strToU8('{"id":"eule-1","name":"Eule"}'),
        'vorlage.png': new Uint8Array([1]),
        'winkend.png': new Uint8Array([2]),
        'boese.exe': new Uint8Array([3])
      }
    }
    const daten = paketBauen(
      'Design',
      [
        { art: 'arbeitsblatt', id: 'ab-9' },
        { art: 'arbeitsblatt', id: 'ab-8' }
      ],
      q.wege,
      pfad,
      new Date(),
      { maskottchenDateien: (id) => figuren[id] ?? null }
    )
    const v = paketVorschau(daten)
    expect(v.designs).toBe(1)
    expect(v.maskottchen).toBe(1)
    expect(
      Object.keys(unzipSync(daten))
        .filter((n) => n.startsWith('maskottchen/'))
        .sort()
    ).toEqual(['maskottchen/eule-1/figur.json', 'maskottchen/eule-1/vorlage.png', 'maskottchen/eule-1/winkend.png'])

    const designs: Record<string, unknown>[] = []
    const neueFiguren: Record<string, string[]> = {}
    paketEinlesen(daten, speicher().wege, () => undefined, {
      design: (d) => designs.push(d),
      maskottchen: (id, teile) => (neueFiguren[id] = Object.keys(teile).sort())
    })
    expect(designs.map((d) => d.id)).toEqual(['eigen-1'])
    expect(neueFiguren).toEqual({ 'eule-1': ['figur.json', 'vorlage.png', 'winkend.png'] })
  })

  it('übernimmt keine Maskottchen-Dateien mit fremden Namen', () => {
    const manifest = {
      app: 'schul-apps',
      typ: 'schulpaket',
      version: 1,
      titel: 'x',
      erstellt: '',
      eintraege: [{ art: 'arbeitsblatt', name: 'x', datei: 'material/1.json' }],
      hoertexte: []
    }
    const daten = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'material/1.json': strToU8(JSON.stringify({ name: 'x', payload: {} })),
      'maskottchen/eule/figur.json': strToU8('{}'),
      'maskottchen/eule/../../boese.png': new Uint8Array([1]),
      'maskottchen/eule/skript.js': strToU8('x'),
      'maskottchen/ohne-figur/pose.png': new Uint8Array([1])
    })
    const neueFiguren: Record<string, string[]> = {}
    paketEinlesen(daten, speicher().wege, () => undefined, { maskottchen: (id, teile) => (neueFiguren[id] = Object.keys(teile)) })
    expect(neueFiguren).toEqual({ eule: ['figur.json'] })
  })

  it('lehnt kaputte, fremde und unvollständige Dateien verständlich ab', () => {
    expect(() => paketVorschau(strToU8('kein zip'))).toThrow(/kein gültiges Schulpaket/)
    expect(() => paketVorschau(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/kein gültiges Schulpaket/)
    expect(() => paketVorschau(zipSync({ 'manifest.json': strToU8('{"typ":"anderes"}') }))).toThrow(/kein gültiges Schulpaket/)
    const halb = {
      app: 'schul-apps',
      typ: 'schulpaket',
      version: 1,
      titel: '',
      erstellt: '',
      eintraege: [{ art: 'arbeitsblatt', name: 'x', datei: 'material/1.json' }]
    }
    expect(() => paketVorschau(zipSync({ 'manifest.json': strToU8(JSON.stringify(halb)) }))).toThrow(/unvollständig/)
    const fremdeArt = { ...halb, eintraege: [{ art: 'einstellungen', name: 'x', datei: 'material/1.json' }] }
    expect(() => paketVorschau(zipSync({ 'manifest.json': strToU8(JSON.stringify(fremdeArt)), 'material/1.json': strToU8('{}') }))).toThrow(/unvollständig/)
    const ohneNutzlast = zipSync({ 'manifest.json': strToU8(JSON.stringify(halb)), 'material/1.json': strToU8('{"name":"x"}') })
    expect(() => paketEinlesen(ohneNutzlast, speicher().wege, () => undefined)).toThrow(/beschädigt/)
  })
})
