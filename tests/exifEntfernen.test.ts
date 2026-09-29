import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { exifEntfernen } from '../src/shared/exifEntfernen'

/*
 * Bildmetadaten (Großprogramm 0.4, Rechtspaket): Bilder aus dem Netz verlieren EXIF/XMP ohne
 * Neukodierung; hochgeladene Bilder laufen über die Zeichenfläche (normalizeImage).
 */
const seg = (marker: number, inhalt: number[]): number[] => [0xff, marker, (inhalt.length + 2) >> 8, (inhalt.length + 2) & 0xff, ...inhalt]
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))

describe('JPEG', () => {
  const bilddaten = [0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9]
  const jpeg = new Uint8Array([
    0xff,
    0xd8,
    ...seg(0xe0, ascii('JFIF\0')),
    ...seg(0xe1, ascii('Exif\0\0GPS 52.3N 9.7E')),
    ...seg(0xe2, ascii('ICC_PROFILE')),
    ...seg(0xfe, ascii('Kommentar: Lea')),
    ...seg(0xdb, [0, 1, 2]),
    ...bilddaten
  ])

  it('entfernt EXIF und Kommentare, behält JFIF, Farbprofil, Tabellen und Bilddaten', () => {
    const r = exifEntfernen(jpeg)
    const text = String.fromCharCode(...r)
    expect(text).not.toContain('GPS')
    expect(text).not.toContain('Lea')
    expect(text).toContain('JFIF')
    expect(text).toContain('ICC_PROFILE')
    expect([...r.slice(-bilddaten.length)]).toEqual(bilddaten)
    expect(r.length).toBeLessThan(jpeg.length)
  })

  it('lässt Kaputtes unverändert', () => {
    const kaputt = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2])
    expect(exifEntfernen(kaputt)).toBe(kaputt)
  })
})

describe('PNG', () => {
  const chunk = (typ: string, inhalt: number[]): number[] => [0, 0, 0, inhalt.length, ...ascii(typ), ...inhalt, 0, 0, 0, 0]
  const png = new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', [1, 2, 3]),
    ...chunk('tEXt', ascii('Author\0Lea')),
    ...chunk('eXIf', ascii('GPS')),
    ...chunk('IDAT', [9, 9]),
    ...chunk('IEND', [])
  ])

  it('entfernt Text- und EXIF-Blöcke', () => {
    const text = String.fromCharCode(...exifEntfernen(png))
    expect(text).not.toContain('Lea')
    expect(text).not.toContain('GPS')
    expect(text).toContain('IHDR')
    expect(text).toContain('IDAT')
    expect(text).toContain('IEND')
  })
})

describe('Hochgeladene Bilder', () => {
  it('jede gelesene Bilddatei läuft über die Zeichenfläche (normalizeImage, preparePickedImage, cleanImageBackground)', () => {
    const dateien: string[] = []
    const gehe = (d: string): void => {
      for (const f of readdirSync(d)) {
        const p = join(d, f)
        if (statSync(p).isDirectory()) gehe(p)
        else if (/\.tsx?$/.test(f)) dateien.push(p)
      }
    }
    gehe(join(__dirname, '..', 'src', 'renderer', 'src'))
    const roh: string[] = []
    for (const p of dateien) {
      const zeilen = readFileSync(p, 'utf8').split('\n')
      zeilen.forEach((z, i) => {
        if (!z.includes('readFileAsDataUrl(') || z.includes('export function readFileAsDataUrl')) return
        const umgebung = zeilen.slice(i, i + 3).join(' ')
        // unterschriftAusBild (Briefkopf, 29.09.2026) zeichnet ebenfalls neu auf eine Zeichenfläche
        if (!/normalizeImage|preparePickedImage|cleanImageBackground|unterschriftAusBild|normalizeImage\(await readFileAsDataUrl/.test(umgebung))
          roh.push(`${p}:${i + 1}`)
      })
    }
    expect(roh).toEqual([])
  })
})
