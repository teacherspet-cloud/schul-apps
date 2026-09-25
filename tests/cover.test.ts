import { describe, expect, it } from 'vitest'
import { COVER_DESIGNS, coverDesign, foxPlaceholder, foxPrompt } from '../src/renderer/src/modules/arbeitsblatt/render/coverDesigns'
import { vorschauSeiten } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'

describe('Deckblatt', () => {
  it('bringt die Farben der Vorlage mit', () => {
    // Aus dem Deckblatt der Lehrkraft ausgelesen
    const blau = coverDesign('blau')
    expect(blau.dark).toBe('#2f528f')
    expect(blau.mid).toBe('#b4c7e7')
    expect(blau.light).toBe('#dae3f3')
    // Blau ist die Vorgabe
    expect(coverDesign().id).toBe('blau')
    expect(coverDesign('gibtsnicht').id).toBe('blau')
  })

  it('bietet mehrere Farbgebungen, jede vollständig', () => {
    expect(COVER_DESIGNS.length).toBeGreaterThanOrEqual(5)
    for (const d of COVER_DESIGNS) {
      for (const farbe of [d.dark, d.mid, d.light, d.onDark]) {
        expect(farbe, `${d.id}: ${farbe}`).toMatch(/^#[0-9a-f]{6}$/)
      }
      expect(d.description.length, d.id).toBeGreaterThan(10)
    }
    // Die Farben einer Gebung sind wirklich verschieden hell
    for (const d of COVER_DESIGNS) expect(d.dark, d.id).not.toBe(d.light)
  })

  it('liefert ohne KI-Bild eine mitgelieferte Zeichnung', () => {
    const fox = foxPlaceholder('#2f528f', '#b4c7e7')
    expect(fox.startsWith('data:image/svg+xml;base64,')).toBe(true)
    const svg = Buffer.from(fox.split(',')[1], 'base64').toString('utf8')
    expect(svg).toContain('<svg')
    // Die Farben der gewählten Gebung tauchen darin auf
    expect(svg).toContain('#2f528f')
  })

  it('beschreibt den Fuchs so, dass kein Material daraus wird', () => {
    const prompt = foxPrompt('Geschichte', 'Der Balkan vor 1914')
    expect(prompt).toContain('Geschichte')
    expect(prompt).toContain('Der Balkan vor 1914')
    // Kein Text im Bild – sonst stünde dort womöglich Falsches
    expect(prompt).toContain('ohne Text')
    expect(prompt).toContain('keine realen Personen')
    // Ohne Thema bleibt der Satz dazu weg
    expect(foxPrompt('Mathematik', '')).not.toContain('Thema des Materials')
  })
})

describe('Seitenauswahl für das Deckblatt', () => {
  /*
   * Gewünscht von der Lehrkraft (24.09.2026): „Aktuell werden alle Seiten des Materials
   * untereinander angezeigt. Trenne auf dem Deckblatt die Seiten voneinander und nutze 4-6
   * repräsentative Seiten des Materials einzeln angeordnet."
   */
  it('zeigt alle Seiten, solange es wenige sind', () => {
    expect(vorschauSeiten(3)).toEqual([0, 1, 2])
    expect(vorschauSeiten(6)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('nimmt bei vielen Seiten höchstens sechs', () => {
    expect(vorschauSeiten(20)).toHaveLength(6)
  })

  it('zeigt immer die erste und die letzte Seite', () => {
    // Sie zeigen Einstieg und Abschluss
    const a = vorschauSeiten(20)
    expect(a[0]).toBe(0)
    expect(a[a.length - 1]).toBe(19)
  })

  it('verteilt die übrigen gleichmäßig', () => {
    /*
     * Sonst sähe man bei einem achtseitigen Blatt viermal den Anfang und nie eine Aufgabe.
     * Die Abstände dürfen sich um höchstens eine Seite unterscheiden.
     */
    const a = vorschauSeiten(12)
    const abstaende = a.slice(1).map((x, i) => x - a[i])
    expect(Math.max(...abstaende) - Math.min(...abstaende)).toBeLessThanOrEqual(1)
  })

  it('kommt mit einem leeren Blatt zurecht', () => {
    expect(vorschauSeiten(0)).toEqual([])
  })

  it('liefert jede Seite nur einmal', () => {
    for (const n of [7, 8, 9, 13, 40]) {
      const a = vorschauSeiten(n)
      expect(new Set(a).size, `${n} Seiten`).toBe(a.length)
    }
  })
})
