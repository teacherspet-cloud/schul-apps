import { describe, expect, it, vi } from 'vitest'
import {
  alsVorschau,
  meldeVorschauGespeichert,
  vorschauAktiv,
  vorschauArt,
  vorschauPdfs,
  type VorschauWerkzeug
} from '../src/renderer/src/shared/export/pdfVorschauLogik'

/** PDF-Vorschau ohne Speichern (10.10.2026): Umrechnen, Anzeigeart je Gerät, Vorschau-Lauf */

const werkzeug = (): VorschauWerkzeug & { aufrufe: string[] } => {
  const aufrufe: string[] = []
  return {
    aufrufe,
    preview: vi.fn(async (html: string) => {
      aufrufe.push(`preview:${html}`)
      return new Uint8Array([1, 2, 3])
    }),
    fillablePreview: vi.fn(async (html: string, audio) => {
      aufrufe.push(`formular:${html}:${audio?.length ?? 0}`)
      return new Uint8Array([4, 5])
    }),
    mitSeiten: vi.fn(async (bytes: Uint8Array, seiten: number[]) => {
      aufrufe.push(`seiten:${seiten.join(',')}`)
      return bytes.slice(0, 1)
    })
  }
}

describe('vorschauPdfs', () => {
  it('baut das reine Abbild wie beim Speichern', async () => {
    const w = werkzeug()
    const pdfs = await vorschauPdfs([{ name: 'Blatt.pdf', html: 'A' }], w)
    expect(pdfs).toEqual([{ name: 'Blatt.pdf', bytes: new Uint8Array([1, 2, 3]) }])
    expect(w.aufrufe).toEqual(['preview:A'])
  })

  it('nimmt für Formular und Hörtexte die Formular-Vorschau', async () => {
    const w = werkzeug()
    await vorschauPdfs(
      [
        { name: 'a.pdf', html: 'A', pdf: { fillable: true } },
        { name: 'b.pdf', html: 'B', pdf: { audio: [{ id: '1', fileName: 'x.mp3', title: 'x', base64: '' }] } },
        { name: 'c.pdf', html: 'C', pdf: { audio: [] } }
      ],
      w
    )
    expect(w.aufrufe).toEqual(['formular:A:0', 'formular:B:1', 'preview:C'])
  })

  it('schneidet gewählte Seiten heraus wie beim Speichern', async () => {
    const w = werkzeug()
    const [pdf] = await vorschauPdfs([{ name: 'a.pdf', html: 'A', pdf: { seiten: [1, 3] } }], w)
    expect(w.aufrufe).toEqual(['preview:A', 'seiten:1,3'])
    expect(pdf.bytes).toEqual(new Uint8Array([1]))
  })
})

describe('vorschauArt', () => {
  const pc = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'
  it('PC mit PDF-Betrachter (Exe, Chrome, Edge, Firefox): im Rahmen', () => {
    expect(vorschauArt({ pdfViewerEnabled: true, ios: false, userAgent: pc })).toBe('rahmen')
  })
  it('ohne Betrachter: Seitenbilder', () => {
    expect(vorschauArt({ pdfViewerEnabled: false, ios: false, userAgent: pc })).toBe('seiten')
    expect(vorschauArt({ ios: false, userAgent: pc })).toBe('seiten')
  })
  it('iPad/iPhone (App und Safari): Seitenbilder, auch wenn Safari einen Betrachter meldet', () => {
    expect(vorschauArt({ pdfViewerEnabled: true, ios: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15' })).toBe('seiten')
  })
  it('Android und Handys: Seitenbilder', () => {
    expect(vorschauArt({ pdfViewerEnabled: true, ios: false, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/140 Mobile Safari/537.36' })).toBe('seiten')
  })
})

describe('alsVorschau', () => {
  it('ist nur während des Laufs aktiv und liefert die Zahl der gespeicherten Dateien', async () => {
    expect(vorschauAktiv()).toBe(false)
    let drin = false
    const n = await alsVorschau(async () => {
      drin = vorschauAktiv()
      meldeVorschauGespeichert(2)
    })
    expect(drin).toBe(true)
    expect(n).toBe(2)
    expect(vorschauAktiv()).toBe(false)
  })

  it('nur geschlossen: 0', async () => {
    expect(await alsVorschau(async () => undefined)).toBe(0)
  })

  it('bleibt nach einem Fehler nicht hängen – das nächste Speichern ist wieder echt', async () => {
    await expect(
      alsVorschau(async () => {
        throw new Error('kaputt')
      })
    ).rejects.toThrow('kaputt')
    expect(vorschauAktiv()).toBe(false)
  })
})
