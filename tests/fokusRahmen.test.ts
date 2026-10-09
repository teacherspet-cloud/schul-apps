import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { escBeendet, fokusVorgabe, imVollbild, istEigenerEintrag, mitFokus, vollbildAnfordern, vollbildMoeglich, vollbildVerlassen, type VollbildDokument } from '../src/renderer/src/modules/lernen/fokus/fokusLogik'

// Vollbild beim Lernen (09.10.2026): Vorgabe, Fullscreen-API mit/ohne Vorsilbe, Esc, Verlauf, Feld im Server
describe('Vollbild beim Lernen', () => {
  it('Vorgabe an – nur ausdrücklich „false" schaltet ab', () => {
    expect(fokusVorgabe(undefined)).toBe(true)
    expect(fokusVorgabe(true)).toBe(true)
    expect(fokusVorgabe(false)).toBe(false)
  })

  it('Einstellung: Vorgabe an, wird mitgespeichert und vom Server übernommen (Feld in der Freigabeliste von http.ts)', () => {
    const quelle = readFileSync('src/renderer/src/modules/onlinetest/schuelerDarstellung.ts', 'utf8')
    expect(quelle).toMatch(/vollbild: true\s*\n\}/)
    const server = readFileSync('src/server/http.ts', 'utf8')
    expect(server).toMatch(/vollbild: k0\.vollbild !== false/)
  })

  const dok = (o: Partial<VollbildDokument> & { el?: VollbildDokument['documentElement'] }): VollbildDokument & { aufrufe: string[] } => {
    const aufrufe: string[] = []
    return { aufrufe, documentElement: o.el ?? {}, ...o }
  }

  it('Fullscreen: ohne Vorsilbe, mit webkit (iPad), gar nicht (iPhone)', () => {
    const aufrufe: string[] = []
    const chrome = dok({ fullscreenEnabled: true, el: { requestFullscreen: () => void aufrufe.push('std') } })
    expect(vollbildMoeglich(chrome)).toBe(true)
    expect(vollbildAnfordern(chrome)).toBe(true)
    const ipad = dok({ webkitFullscreenEnabled: true, el: { webkitRequestFullscreen: () => void aufrufe.push('webkit') } })
    expect(vollbildAnfordern(ipad)).toBe(true)
    expect(aufrufe).toEqual(['std', 'webkit'])
    const iphone = dok({ el: {} })
    expect(vollbildMoeglich(iphone)).toBe(false)
    expect(vollbildAnfordern(iphone)).toBe(false)
    // Schon im Vollbild: nicht noch einmal
    expect(vollbildAnfordern(dok({ fullscreenEnabled: true, fullscreenElement: {}, el: { requestFullscreen: () => undefined } }))).toBe(false)
  })

  it('Abgelehnt oder Fehler: still', async () => {
    const abgelehnt = dok({ fullscreenEnabled: true, el: { requestFullscreen: () => Promise.reject(new Error('nein')) } })
    expect(vollbildAnfordern(abgelehnt)).toBe(true)
    const wirft = dok({
      fullscreenEnabled: true,
      el: {
        requestFullscreen: () => {
          throw new Error('nein')
        }
      }
    })
    expect(vollbildAnfordern(wirft)).toBe(false)
    await new Promise((r) => setTimeout(r, 0))
  })

  it('Vollbild verlassen nur, wenn eines da ist', () => {
    const raus: string[] = []
    vollbildVerlassen(dok({ exitFullscreen: () => void raus.push('x') }))
    expect(raus).toEqual([])
    const d = dok({ webkitFullscreenElement: {}, webkitExitFullscreen: () => void raus.push('webkit') })
    expect(imVollbild(d)).toBe(true)
    vollbildVerlassen(d)
    expect(raus).toEqual(['webkit'])
  })

  it('Esc beendet nur ohne offenes Fenster und außerhalb des echten Vollbilds', () => {
    const grund = { key: 'Escape', behandelt: false, inFenster: false, vollbild: false, seitVollbildEnde: 10_000 }
    expect(escBeendet(grund)).toBe(true)
    expect(escBeendet({ ...grund, key: 'Enter' })).toBe(false)
    expect(escBeendet({ ...grund, behandelt: true })).toBe(false)
    expect(escBeendet({ ...grund, inFenster: true })).toBe(false)
    // Im echten Vollbild verlässt der Browser mit Esc das Vollbild – die Übung bleibt (Fokusansicht mit ×)
    expect(escBeendet({ ...grund, vollbild: true })).toBe(false)
    expect(escBeendet({ ...grund, seitVollbildEnde: 100 })).toBe(false)
  })

  it('Verlauf: eigener Eintrag übernimmt den Zustand (Ebene im Fachordner)', () => {
    const s = mitFokus({ ordnerTiefe: 2, ordnerEbene: 'uebung' }, 'f1')
    expect(s).toEqual({ ordnerTiefe: 2, ordnerEbene: 'uebung', saFokus: 'f1' })
    expect(istEigenerEintrag(s, 'f1')).toBe(true)
    expect(istEigenerEintrag(s, 'f2')).toBe(false)
    expect(istEigenerEintrag(null, 'f1')).toBe(false)
    expect(mitFokus(null, 'f3')).toEqual({ saFokus: 'f3' })
  })
})
