import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/*
 * Bilder je Bedeutung und Wortart in der Ablage (21.10.2026): bedeutungen.json neben index.json, Einrichten aus dem
 * Bestand (Phase A, ohne KI), Zuordnung im Medienauftrag, Zusammenführen und Bildprüfung (Phase B).
 */
const ordner = mkdtempSync(join(tmpdir(), 'bedeutungen-'))
process.env.SCHULAPPS_SERVER = '1'
process.env.SCHULAPPS_DATEN = ordner
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nie-benutzt' } }))
const m = await import('../src/main/services/storage/medienbank')
afterAll(() => rmSync(ordner, { recursive: true, force: true }))

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const bild = (n: string): { dataUrl: string; herkunft: 'ki'; nachweis: string } => ({ dataUrl: PNG, herkunft: 'ki', nachweis: n })
const wurzel = join(ordner, 'medienbank')
const leeren = (): void => {
  rmSync(wurzel, { recursive: true, force: true })
  m.medienbankNeuLesen()
  m.bedeutungenNeuLesen()
}
const neu = (): void => {
  m.medienbankNeuLesen()
  m.bedeutungenNeuLesen()
}

describe('Bilder je Bedeutung', () => {
  beforeEach(() => {
    leeren()
    m.medienKorpusQuelle(() => [])
  })
  it('Verb und Nomen von „bear" bekommen verschiedene Bilder; Verbliste („bear", Verb) sieht nie den Bären', () => {
    m.bildSetzen('en', 'bear', bild('Bär'), 's2', { wortart: 'andere', deutsch: 'Bär' })
    m.bildSetzen('en', 'to bear', bild('ertragen'), 's2', { wortart: 'verb', deutsch: 'ertragen' })
    neu()
    const d = m.medienFuer('en', [
      { w: 'bear', de: 'Bär', pos: 'noun' },
      { w: 'to bear', de: 'ertragen' }
    ])
    expect(Object.values(d.bear.bilder ?? {})[0]?.bild?.nachweis).toBe('Bär')
    expect(Object.values(d['to bear'].bilder ?? {})[0]?.bild?.nachweis).toBe('ertragen')
    const verbliste = m.medienFuer('en', [{ w: 'bear', de: 'ertragen', art: 'verb' }])
    expect(Object.values(verbliste.bear.bilder ?? {})[0]?.bild?.nachweis).toBe('ertragen')
    // Ein Verb mit unbekannter Übersetzung: das einzige Verb-Bild, vorläufig – nie das Nomen
    const anders = m.medienFuer('en', [{ w: 'bear', de: 'tragen', art: 'verb' }])
    expect(Object.values(anders.bear.bilder ?? {})[0]).toMatchObject({ bild: { nachweis: 'ertragen' }, vorlaeufig: true })
    // Einfache Anfrage (ältere Seite): zwei Bedeutungen – kein Bild
    expect(m.medienFuer('en', ['bear']).bear?.bild).toBeUndefined()
  })
  it('Löschen trifft nur die eigene Bedeutung', () => {
    m.bildSetzen('en', 'bat', bild('Fledermaus'), 's2', { wortart: 'andere', deutsch: 'Fledermaus' })
    m.bildSetzen('en', 'bat', bild('Schläger'), 's2', { wortart: 'andere', deutsch: 'Schläger' })
    m.bildLoeschen('en', 'bat', 's2', { wortart: 'andere', deutsch: 'Schläger' })
    neu()
    const d = m.medienFuer('en', [
      { w: 'bat', de: 'Fledermaus' },
      { w: 'bat', de: 'Schläger' }
    ])
    const bilder = Object.values(d.bat.bilder ?? {})
    expect(bilder.map((x) => x.bild?.nachweis)).toEqual(['Fledermaus', undefined])
  })
  it('Zuordnen: genau, Teil und neue Wortart ohne KI; abweichende Übersetzung fragt', () => {
    m.bildSetzen('en', 'book', bild('Buch'), 's2', { wortart: 'andere', deutsch: 'Buch' })
    const z = m.sinneZuordnen('en', [
      { w: 'book', de: 'das Buch' },
      { w: 'to book', de: 'buchen' },
      { w: 'book', de: 'Heft' }
    ])
    expect('id' in z[0]).toBe(true)
    expect('id' in z[1]).toBe(true)
    expect(z[2]).toMatchObject({ fragen: [{ deutsch: 'Buch' }] })
    // Ergebnis der KI: „Heft" ist eine eigene Bedeutung – danach genau
    const f = m.sinnFestlegen('en', 'book', 'andere', 'Heft', 'neu')
    neu()
    expect(m.sinneZuordnen('en', [{ w: 'book', de: 'Heft' }])[0]).toEqual(f)
  })
  it('erste Bedeutung eines Wortes übernimmt das alte Bild derselben Wortart', () => {
    mkdirSync(join(wurzel, 'dateien'), { recursive: true })
    m.bildSetzen('en', 'cat', bild('Katze alt'))
    neu()
    m.sinneZuordnen('en', [{ w: 'cat', de: 'Katze' }])
    neu()
    const d = m.medienFuer('en', [{ w: 'cat', de: 'Katze' }])
    expect(Object.values(d.cat.bilder ?? {})[0]?.bild?.nachweis).toBe('Katze alt')
  })
})

describe('Einrichten aus dem Bestand (ohne KI)', () => {
  beforeEach(() => leeren())
  it('eindeutige alte Bilder ziehen in ihre Bedeutung, mehrdeutige warten; vorher gesichert; zweiter Lauf ändert nichts', () => {
    // Alte Medienbank: „bear" (vom Nomen), „to bear" (vom Verb), „cat"
    m.medienKorpusQuelle(() => [])
    m.bildSetzen('en', 'cat', bild('Katze'))
    m.bildSetzen('en', 'to bear', bild('ertragen'))
    m.bildSetzen('en', 'bear', bild('Bär oder ertragen?'))
    rmSync(join(wurzel, 'bedeutungen.json'), { force: true })
    neu()
    const korpus = [
      { sprache: 'en', term: 'cat', translation: 'Katze', pos: 'noun' },
      { sprache: 'en', term: 'bear', translation: 'Bär', pos: 'noun' },
      { sprache: 'en', term: 'to bear', translation: 'ertragen' },
      // Verbliste: „bear" als Verb – das Wort „bear" kommt als Nomen und als Verb vor
      { sprache: 'en', term: 'bear', translation: 'ertragen', art: 'verb' as const }
    ]
    const z = m.sinneEinrichten(korpus)
    expect(z).toMatchObject({ lemmata: 2, verschoben: 2, offen: 1 })
    expect(existsSync(join(wurzel, 'sicherung-bedeutungen-2026-10-21', 'index.json'))).toBe(true)
    neu()
    const d = m.medienFuer('en', [
      { w: 'cat', de: 'Katze' },
      { w: 'bear', de: 'ertragen', art: 'verb' },
      { w: 'bear', de: 'Bär', pos: 'noun' }
    ])
    expect(Object.values(d.cat.bilder ?? {})[0]?.bild?.nachweis).toBe('Katze')
    const bear = Object.values(d.bear.bilder ?? {})
    expect(bear.map((x) => x.bild?.nachweis)).toEqual(['ertragen', undefined])
    // Das mehrdeutige alte Bild wartet auf die Bildprüfung
    const stand = m.sinnStand()
    expect(stand.offen).toBe(1)
    const e = stand.liste.find((x) => x.schluessel === 'en:bear')!
    const baer = e.bedeutungen.find((x) => x.deutsch === 'Bär')!
    expect(m.altbildZuordnen('en:bear', e.offen[0].datei, baer.id)).toBe(true)
    neu()
    const nachher = Object.values(m.medienFuer('en', [{ w: 'bear', de: 'Bär', pos: 'noun' }]).bear.bilder ?? {})
    expect(nachher[0]?.bild?.nachweis).toBe('Bär oder ertragen?')
    // Zweiter Lauf: nichts mehr zu tun
    expect(m.sinneEinrichten(korpus)).toMatchObject({ lemmata: 0, verschoben: 0, offen: 0 })
    // Keine Bilddatei gelöscht
    expect(readdirSync(join(wurzel, 'dateien')).length).toBe(3)
  })
  it('Synonyme zusammenführen: Varianten zusammen, ein Bild bleibt', () => {
    m.medienKorpusQuelle(() => [])
    mkdirSync(wurzel, { recursive: true })
    writeFileSync(join(wurzel, 'index.json'), '{}')
    m.bildSetzen('en', 'pen', bild('Füller'), 's2', { wortart: 'andere', deutsch: 'Füller' })
    m.sinnFestlegen('en', 'pen', 'andere', 'Kugelschreiber', 'neu')
    neu()
    const e = m.sinnStand().liste.find((x) => x.schluessel === 'en:pen')
    const ids = JSON.parse(readFileSync(join(wurzel, 'bedeutungen.json'), 'utf8')).eintraege['en:pen'].bedeutungen.map((x: { id: string }) => x.id)
    expect(m.sinneZusammenfuehren('en:pen', [ids])).toBe(1)
    neu()
    const d = m.medienFuer('en', [{ w: 'pen', de: 'Kugelschreiber' }])
    expect(Object.values(d.pen.bilder ?? {})[0]).toMatchObject({ bild: { nachweis: 'Füller' } })
    expect(Object.values(d.pen.bilder ?? {})[0]?.vorlaeufig).toBeUndefined()
    void e
  })
})
