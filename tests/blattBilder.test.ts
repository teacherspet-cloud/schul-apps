// Bilder zum Vergrößern und Markieren im digitalen Blatt (25.10.2026, shared/blattBilder.ts)
import { describe, expect, it } from 'vitest'
import { BILD_SEITE, BILD_TINTE_MUSTER, bildTinteSchluessel, blattBilder } from '../src/shared/blattBilder'
import { objekteAus } from '../src/shared/blattObjekte'

describe('blattBilder', () => {
  it('Tinte-Schlüssel je Bild passen zum Muster des Servers (höchstens 20 Bilder)', () => {
    expect(BILD_TINTE_MUSTER.test(bildTinteSchluessel('b0'))).toBe(true)
    expect(BILD_TINTE_MUSTER.test(bildTinteSchluessel('b19'))).toBe(true)
    expect(BILD_TINTE_MUSTER.test(bildTinteSchluessel('b20'))).toBe(false)
    expect(BILD_TINTE_MUSTER.test('0')).toBe(false)
    expect(BILD_TINTE_MUSTER.test('bild:x')).toBe(false)
  })
  it('Objekte auf Bild-„Seiten" überstehen die Bereinigung (objekteAus erlaubt Seiten bis 40)', () => {
    const o = objekteAus([{ id: 'k1', t: 'text', s: BILD_SEITE + 19, x: 10, y: 10, text: 'Markiert' }])
    expect(o).toHaveLength(1)
    expect(o[0].s).toBe(BILD_SEITE + 19)
  })
  it('ist selbstständig – der Server führt sie per toString() im Blatt aus', () => {
    const quelle = blattBilder.toString()
    // keine Bezüge auf Modulkonstanten oder Importe
    expect(quelle).not.toMatch(/BILDER_HOECHSTENS|BILD_SEITE|require\(|import\s/)
    expect(quelle).toContain('.ws-page')
    expect(quelle).toContain('.ws-imglabel-area')
  })
})
