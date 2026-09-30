import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ImageLabel } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { automatischeLage, ImageLabelLayer, punktVerschieben } from '../src/renderer/src/modules/arbeitsblatt/render/ImageLabels'
import { bauteilLinie, begradigt, layoutImageLabels, spaltenLinie } from '../src/renderer/src/modules/arbeitsblatt/render/imageLabelLayout'
import { beschriftetesBildSvg } from '../src/renderer/src/modules/arbeitsblatt/render/beschriftungSvg'

/*
 * Wunsch der Lehrkraft (30.09.2026): „Bei beschrifteten Bildern die runden Punkte mit ihren
 * Linien frei verschieben, um nachzujustieren." Geprüft wird das Modell hinter dem Ziehen:
 * Punkt und Schild unabhängig, Lage bleibt gespeichert (keine Setzung überschreibt sie),
 * „Automatische Lage" stellt sie wieder her, und Druck/Word zeigen die verschobene Lage.
 */

// 1×1-PNG (4:3 wird über groesse vorgegeben)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const spalte = (patch: Partial<ImageLabel> = {}): ImageLabel => ({ id: 'a', text: 'Kern', x: 30, y: 40, ...patch })
const amBauteil = (patch: Partial<ImageLabel> = {}): ImageLabel => ({ id: 's', text: 'Lampe', x: 50, y: 20, inline: 'oben', ...patch })

describe('Beschriftung ziehen: Modell', () => {
  it('Punkt verschieben merkt die automatische Lage einmal; „Automatische Lage" stellt sie wieder her', () => {
    const l = spalte()
    punktVerschieben(l, 60, 70)
    punktVerschieben(l, 65, 75)
    expect(l).toMatchObject({ x: 65, y: 75, ursprung: { x: 30, y: 40 } })
    l.schild = { x: 100, y: 10 }
    automatischeLage(l)
    expect(l).toEqual(spalte())
  })

  it('am Bauteil: Punkt und Schild sind unabhängig – das Schild bleibt stehen, die Linie entsteht', () => {
    const l = amBauteil()
    expect(bauteilLinie(l)).toBeNull()
    punktVerschieben(l, 58, 35)
    expect(l.schild).toEqual({ x: 50, y: 20 })
    // Rechtwinklig: erst senkrecht, dann waagerecht
    expect(bauteilLinie(l)).toEqual([
      { x: 58, y: 35 },
      { x: 58, y: 20 },
      { x: 50, y: 20 }
    ])
    l.schild = begradigt(l)
    expect(bauteilLinie(l)).toEqual([
      { x: 58, y: 35 },
      { x: 58, y: 20 }
    ])
  })

  it('Randspalte: rechtwinklige Linie; begradigt liegt das Schild auf Punkthöhe und die Linie ist gerade', () => {
    const l = spalte()
    const pts = spaltenLinie(l, { side: 'left', top: 70 })
    for (let i = 1; i < pts.length; i++) expect(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y).toBe(true)
    l.schild = begradigt(l)
    expect(spaltenLinie(l, { side: 'left', top: l.schild.y })).toEqual([
      { x: 30, y: 40 },
      { x: 0, y: 40 }
    ])
  })

  it('gezogene Schilder bleiben, wo sie sind – die Setzung verschiebt nur die übrigen', () => {
    const labels = [spalte({ id: 'a', y: 50, schild: { x: 0, y: 12 }, side: 'left' }), spalte({ id: 'b', y: 50 }), spalte({ id: 'c', y: 50 })]
    const gesetzt = layoutImageLabels(labels, { imageHeightMm: 60 })
    expect(gesetzt.get('a')).toMatchObject({ side: 'left', top: 12 })
    expect(gesetzt.get('b')!.top).not.toBe(gesetzt.get('c')!.top)
  })
})

describe('Beschriftung ziehen: Darstellung', () => {
  const zeige = (labels: ImageLabel[], bearbeiten: boolean): string =>
    renderToStaticMarkup(
      createElement(ImageLabelLayer, {
        labels,
        showAnswers: false,
        widthMm: 120,
        imageDataUrl: PNG,
        ...(bearbeiten ? { onChange: () => undefined } : {}),
        children: createElement('img', { src: PNG })
      })
    )

  it('im Editor: Punkt und Schild sind Griffe (Maus, Finger, Tastatur); im Druck nicht', () => {
    const edit = zeige([spalte(), amBauteil()], true)
    expect((edit.match(/data-griff="punkt"/g) ?? []).length).toBe(2)
    expect((edit.match(/data-griff="schild"/g) ?? []).length).toBe(2)
    expect(edit).toContain('touch-action:none')
    expect(edit).toContain('tabindex="0"')
    const druck = zeige([spalte(), amBauteil()], false)
    expect(druck).not.toContain('data-griff')
    // Im Druck: Punkt nur in der Randspalte, am Bauteil ohne Linie auch ohne Punkt
    expect((druck.match(/ws-imglabel-dot/g) ?? []).length).toBe(1)
  })

  it('gespeicherte Lage erscheint im Druck: Schild der Randspalte auf seiner Höhe, Schild am Bauteil an seinem Punkt', () => {
    const html = zeige([spalte({ schild: { x: 0, y: 12.5 }, side: 'left' }), amBauteil({ x: 58, y: 35, schild: { x: 40, y: 22 } })], false)
    expect(html).toContain('ws-imglabel-box" style="top:12.5%"')
    expect(html).toContain('left:40%;top:22%')
    // Die Linie am Bauteil samt Punkt ist jetzt sichtbar
    expect(html).toContain('58,35 58,22 40,22')
    expect((html.match(/ws-imglabel-dot/g) ?? []).length).toBe(2)
  })
})

describe('Beschriftung ziehen: Word übernimmt die Lage', () => {
  it('Punkte, Linien und Schilder stehen im gerasterten Bild dort, wohin sie gezogen wurden', () => {
    const labels = [spalte({ x: 25, y: 50, schild: { x: 0, y: 50 }, side: 'left' }), spalte({ id: 'b', text: 'Hülle', x: 75, y: 20, blank: true })]
    const { svg, breiteMm, hoeheMm } = beschriftetesBildSvg({ dataUrl: PNG, groesse: { width: 400, height: 300 }, labels, mitLoesung: true, breiteMm: 120 })
    expect(breiteMm).toBe(120)
    // Bildfläche 120 − 2 × 26 = 68 mm, Höhe 51 mm
    expect(hoeheMm).toBeCloseTo(51, 1)
    expect(svg).toContain(`<circle cx="${26 + 0.25 * 68}" cy="25.5"`)
    expect(svg).toContain('>Kern</text>')
    expect(svg).toContain('>Hülle</text>')
    const schueler = beschriftetesBildSvg({ dataUrl: PNG, groesse: { width: 400, height: 300 }, labels, mitLoesung: false, breiteMm: 120 }).svg
    expect(schueler).not.toContain('Hülle')
  })
})
