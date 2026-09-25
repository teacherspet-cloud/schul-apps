import { describe, expect, it } from 'vitest'
import {
  chromaKey,
  cleanBackground,
  detectBackground,
  hexToRgb,
  KEY_GREEN,
  PixelData,
  removeCheckerboard,
  toCbCr
} from '../src/renderer/src/shared/imageCleanup'

/** Testbild bauen: fn liefert je Pixel die Farbe */
function image(width: number, height: number, fn: (x: number, y: number) => [number, number, number]): PixelData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fn(x, y)
      data.set([r, g, b, 255], (y * width + x) * 4)
    }
  }
  return { data, width, height }
}

const alphaAt = (d: PixelData, x: number, y: number): number => d.data[(y * d.width + x) * 4 + 3]
const inMiddle = (x: number, y: number, size = 60): boolean => x > size * 0.3 && x < size * 0.7 && y > size * 0.3 && y < size * 0.7

describe('Hintergrund erkennen und entfernen', () => {
  const GREEN = hexToRgb(KEY_GREEN)
  const checker = (x: number, y: number): [number, number, number] => {
    const v = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 255 : 204
    return [v, v, v]
  }

  it('erkennt Neongrün und macht es durchsichtig, ohne das Motiv anzugreifen', () => {
    const d = image(60, 60, (x, y) => (inMiddle(x, y) ? [220, 40, 30] : GREEN))
    expect(detectBackground(d)).toMatchObject({ kind: 'chroma' })
    expect(cleanBackground(d)).toBe('chroma')
    expect(alphaAt(d, 2, 2)).toBe(0)
    expect(alphaAt(d, 30, 30)).toBe(255)
    // Motivfarbe bleibt erhalten
    expect([d.data[(30 * 60 + 30) * 4], d.data[(30 * 60 + 30) * 4 + 1]]).toEqual([220, 40])
  })

  it('keyt auch bei ungleichmäßigem Grün (Schatten, Helligkeitsunterschiede)', () => {
    const d = image(60, 60, (x, y) => {
      if (inMiddle(x, y)) return [30, 30, 200]
      const shade = y < 30 ? 1 : 0.55 // dunklere Hälfte des Greenscreens
      return [Math.round(GREEN[0] * shade), Math.round(GREEN[1] * shade), Math.round(GREEN[2] * shade)]
    })
    expect(cleanBackground(d)).toBe('chroma')
    expect(alphaAt(d, 5, 5)).toBe(0)
    expect(alphaAt(d, 5, 55)).toBe(0)
    expect(alphaAt(d, 30, 30)).toBe(255)
  })

  it('nimmt den grünen Saum (Spill) an den Rändern zurück', () => {
    const d = image(20, 20, () => [120, 200, 120])
    chromaKey(d, toCbCr(...GREEN), { threshold: 42, feather: 14, despill: 1 })
    // Grünüberschuss ist weg (Mittel aus Rot und Blau), Rot und Blau bleiben
    expect([d.data[0], d.data[1], d.data[2]]).toEqual([120, 120, 120])
  })

  it('entfernt Schachbrettmuster von den Rändern, lässt graue Motivflächen stehen', () => {
    const d = image(60, 60, (x, y) => (inMiddle(x, y) ? [204, 204, 204] : checker(x, y)))
    expect(detectBackground(d)).toMatchObject({ kind: 'checkerboard' })
    expect(removeCheckerboard(d, [255, 204], 8)).toBeGreaterThan(1000)
    expect(alphaAt(d, 1, 1)).toBe(0)
    // graue Fläche im Motiv bleibt sichtbar
    expect(alphaAt(d, 30, 30)).toBe(255)
  })

  it('lässt Fotos und weiße Hintergründe unangetastet', () => {
    const photo = image(60, 60, (x, y) => [120 + x, 90 + y, 70])
    expect(cleanBackground(photo)).toBe('none')
    const white = image(60, 60, (x, y) => (inMiddle(x, y) ? [10, 10, 10] : [255, 255, 255]))
    expect(cleanBackground(white)).toBe('none')
    const sky = image(60, 60, () => [120, 170, 235])
    expect(detectBackground(sky).kind).toBe('none')
  })
})
