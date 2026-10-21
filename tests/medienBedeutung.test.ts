import { describe, expect, it } from 'vitest'
import {
  altSchluesselFuer,
  anfrageSchluessel,
  aufloesen,
  bedeutungFinden,
  bedeutungNorm,
  bedeutungsHinweis,
  bildLemma,
  bildVon,
  gruppiereKorpus,
  sinnSchluessel,
  suchbegriffFuer,
  wortartFuer,
  type MedienBedeutung,
  type SinnEintrag
} from '../src/shared/medienBedeutung'
import type { MedienSicht } from '../src/shared/medienbank'

/*
 * Bilder je Bedeutung und Wortart (21.10.2026, Befund der Lehrkraft: das Verb „bear" bekam das Bild eines Bären).
 */
const b = (id: string, wortart: 'verb' | 'andere', deutsch: string, varianten: string[] = []): MedienBedeutung => ({
  id,
  wortart,
  deutsch,
  varianten: [bedeutungNorm(deutsch), ...varianten],
  quelle: 'neu',
  zeit: 0
})
const BEAR: SinnEintrag = { bedeutungen: [b('00000001', 'andere', 'Bär'), b('00000002', 'verb', 'ertragen')] }

describe('Wortart und Lemma', () => {
  it('Verb: ausdrücklich, aus der Liste, „(to) …" / „to …"; die Wortart der Liste gewinnt', () => {
    expect(wortartFuer({ w: 'bear', art: 'verb' })).toBe('verb')
    expect(wortartFuer({ w: 'bear', pos: 'verb' })).toBe('verb')
    expect(wortartFuer({ w: 'to bear' })).toBe('verb')
    expect(wortartFuer({ w: '(to) bear' })).toBe('verb')
    expect(wortartFuer({ w: 'bear' })).toBe('andere')
    expect(wortartFuer({ w: 'bear', pos: 'noun' })).toBe('andere')
    expect(wortartFuer({ w: 'to and fro', pos: 'phrase' })).toBe('andere')
    // Außerhalb des Englischen kein „to"
    expect(wortartFuer({ w: 'to fait' }, 'fr')).toBe('andere')
  })
  it('„to bear", „(to) bear" und das „bear" der Verbliste haben dasselbe Lemma wie das Nomen', () => {
    expect(bildLemma('(to) bear', 'verb')).toBe('bear')
    expect(bildLemma('to burn (sth.)', 'verb')).toBe('burn')
    expect(bildLemma('burn/burnt', 'verb')).toBe('burn')
    expect(bildLemma('to and fro', 'andere')).toBe('to and fro')
    const s = sinnSchluessel('en', 'bear', 'andere')
    expect([sinnSchluessel('en', 'to bear', 'verb'), sinnSchluessel('en', '(to) bear', 'verb'), sinnSchluessel('en', 'bear', 'verb')]).toEqual([s, s, s])
  })
})

describe('Bedeutung finden', () => {
  it('„Bär", „der Bär", „Bär (Tier)" sind dieselbe Bedeutung', () => {
    expect(bedeutungNorm('der Bär')).toBe('bär')
    expect(bedeutungNorm('Bär (Tier)')).toBe('bär')
    expect(bedeutungNorm('etw. ertragen')).toBe('ertragen')
  })
  it('ein Verb landet nie beim Nomen – und umgekehrt', () => {
    expect(bedeutungFinden(BEAR, 'verb', 'Bär').b?.id).toBe('00000002')
    expect(bedeutungFinden(BEAR, 'verb', 'Bär').wie).toBe('einzig')
    expect(bedeutungFinden(BEAR, 'andere', 'ertragen').b?.id).toBe('00000001')
    expect(bedeutungFinden({ bedeutungen: [b('00000001', 'andere', 'Bär')] }, 'verb', 'ertragen').wie).toBe('keine')
  })
  it('genau, gemeinsamer Teil, mehrdeutig', () => {
    expect(bedeutungFinden(BEAR, 'andere', 'der Bär')).toMatchObject({ wie: 'genau' })
    const book: SinnEintrag = { bedeutungen: [b('00000003', 'verb', 'buchen')] }
    expect(bedeutungFinden(book, 'verb', 'buchen, reservieren')).toMatchObject({ wie: 'teil' })
    const bat: SinnEintrag = { bedeutungen: [b('00000004', 'andere', 'Fledermaus'), b('00000005', 'andere', 'Schläger')] }
    expect(bedeutungFinden(bat, 'andere', 'Keule').wie).toBe('mehrdeutig')
    expect(bedeutungFinden(bat, 'andere', 'Schläger (Sport)').b?.id).toBe('00000005')
  })
})

describe('Lese-Regeln', () => {
  it('Anfrage mit Bedeutung: das Bild der eigenen Bedeutung, einzig = vorläufig, mehrdeutig = keins', () => {
    expect(aufloesen(BEAR, { w: 'bear', art: 'verb', de: 'ertragen' })).toMatchObject({ b: { id: '00000002' }, altErlaubt: false })
    expect(aufloesen(BEAR, { w: 'bear', de: 'Bärin', pos: 'noun' })).toMatchObject({ b: { id: '00000001' }, vorlaeufig: true })
    const bat: SinnEintrag = { bedeutungen: [b('00000004', 'andere', 'Fledermaus'), b('00000005', 'andere', 'Schläger')] }
    expect(aufloesen(bat, { w: 'bat', de: 'Keule' })).toEqual({ mehrdeutig: true, altErlaubt: false })
  })
  it('einfache Anfrage: nur bei genau einer Bedeutung; ohne Bedeutungen das alte Bild', () => {
    expect(aufloesen(BEAR, { w: 'bear' })).toMatchObject({ mehrdeutig: true, altErlaubt: false })
    expect(aufloesen({ bedeutungen: [b('00000001', 'andere', 'Bär')] }, { w: 'bear' }).b?.id).toBe('00000001')
    expect(aufloesen(undefined, { w: 'bear' }).altErlaubt).toBe(true)
    // Ein altes Bild wartet auf die Zuordnung: kein Rückfall
    expect(aufloesen({ bedeutungen: [], offen: [{ datei: 'x', stufe: 's2', wortarten: ['verb'], bild: {} as never }] }, { w: 'bear' }).altErlaubt).toBe(false)
  })
  it('altes Bild eines englischen Verbs nur unter „to …"', () => {
    expect(altSchluesselFuer('en', { w: 'bear', art: 'verb' })).toEqual(['to bear'])
    expect(altSchluesselFuer('en', { w: 'to bear', de: 'ertragen' })).toEqual(['to bear'])
    expect(altSchluesselFuer('en', { w: 'bear', pos: 'noun' })).toEqual(['bear'])
    expect(altSchluesselFuer('fr', { w: 'aller', art: 'verb' })).toEqual(['aller'])
  })
  it('bildVon: das Bild der Anfrage; ältere Antwort ohne `bilder` – nie für ein Verb der Verbliste', () => {
    const sicht: MedienSicht = {
      bilder: { [anfrageSchluessel({ w: 'bear', art: 'verb', de: 'ertragen' })]: { bild: { datei: 'v.png', herkunft: 'ki', nachweis: 'Verb', zeit: 1 } } }
    }
    expect(bildVon(sicht, { term: 'bear', translation: 'ertragen', wortart: 'verb' })?.bild?.nachweis).toBe('Verb')
    expect(bildVon(sicht, { term: 'bear', translation: 'Bär', pos: 'noun' })).toBeUndefined()
    const alt: MedienSicht = { bild: { datei: 'n.png', herkunft: 'ki', nachweis: 'Nomen', zeit: 1 } }
    expect(bildVon(alt, { term: 'bear', translation: 'ertragen', wortart: 'verb' })).toBeUndefined()
    expect(bildVon(alt, { term: 'bear', translation: 'Bär' })?.bild?.nachweis).toBe('Nomen')
  })
})

describe('Hinweise an die KI', () => {
  it('Suchbegriff „to …" für englische Verben', () => {
    expect(suchbegriffFuer('en', 'bear', 'verb')).toBe('to bear')
    expect(suchbegriffFuer('en', '(to) bear', 'verb')).toBe('to bear')
    expect(suchbegriffFuer('en', 'bear', 'andere')).toBe('bear')
    expect(suchbegriffFuer('en', 'bear', 'verb', { suchbegriff: 'to endure' })).toBe('to endure')
  })
  it('Verb: die Handlung, nicht das gleichnamige Tier – andere Bedeutungen ausdrücklich nicht gemeint', () => {
    const h = bedeutungsHinweis('en', 'bear', 'verb', 'ertragen', [{ wortart: 'andere', deutsch: 'Bär' }])
    expect(h).toMatch(/Verb \(„to bear"\)/)
    expect(h).toMatch(/nie ein gleichnamiges Tier/)
    expect(h).toMatch(/NICHT gemeint: „Bär" \(kein Verb\)/)
  })
})

describe('Einrichten aus dem Bestand', () => {
  it('je Lemma und Wortart, Übersetzungen mit gemeinsamem Teil = eine Bedeutung', () => {
    const g = gruppiereKorpus([
      { sprache: 'en', term: 'bear', translation: 'Bär', pos: 'noun' },
      { sprache: 'en', term: 'bear', translation: 'der Bär' },
      { sprache: 'en', term: 'bear', translation: 'ertragen', art: 'verb' },
      { sprache: 'en', term: 'to bear', translation: 'ertragen, aushalten' },
      { sprache: 'en', term: 'bat', translation: 'Fledermaus' },
      { sprache: 'en', term: 'bat', translation: 'Schläger' }
    ])
    const bear = g.get('en:bear')!
    expect(bear.gruppen.map((x) => `${x.wortart}:${x.deutsch}`).sort()).toEqual(['andere:Bär', 'verb:ertragen'])
    expect(bear.woerter.map((w) => `${w.wort}:${w.wortart}`).sort()).toEqual(['bear:andere', 'bear:verb', 'to bear:verb'])
    expect(g.get('en:bat')!.gruppen).toHaveLength(2)
  })
})
