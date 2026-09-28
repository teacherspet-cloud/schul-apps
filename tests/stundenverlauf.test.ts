import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { verlaufDocx } from '../src/renderer/src/shared/stundenverlauf/docx'
import {
  leererVerlauf,
  minutenAngleichen,
  summeMinuten,
  verlaufAus,
  verlaufHtml,
  verlaufsAnfrage
} from '../src/renderer/src/shared/stundenverlauf/stundenverlauf'

/*
 * Stundenverlauf (Großprogramm 0.4, F4): Die Minuten ergeben immer genau die Dauer, die KI-Antwort
 * wird bereinigt, Word und PDF sind A4 quer mit festen Spalten.
 */
describe('Stundenverlauf', () => {
  it('leere Vorlage und Angleichen: Summe genau gleich der Dauer', () => {
    expect(summeMinuten(leererVerlauf(45))).toBe(45)
    expect(summeMinuten(leererVerlauf(90))).toBe(90)
    const v = { ...leererVerlauf(45), dauer: 60 }
    expect(summeMinuten(minutenAngleichen(v))).toBe(60)
    // Viele kurze Phasen: jede mindestens eine Minute, Summe trotzdem genau
    const eng = {
      dauer: 10,
      ziel: '',
      phasen: Array.from({ length: 8 }, (_, i) => ({ id: String(i), phase: 'P', minuten: i === 0 ? 50 : 1, geschehen: '', sozialform: 'EA', medien: '' }))
    }
    const r = minutenAngleichen(eng)
    expect(summeMinuten(r)).toBe(10)
    expect(r.phasen.every((p) => p.minuten >= 1)).toBe(true)
  })

  it('bereinigt die KI-Antwort: leere Phasen weg, Minuten passend', () => {
    const v = verlaufAus(
      {
        ziel: 'Die Lernenden können die Fotosynthese erklären.',
        phasen: [
          { phase: 'Einstieg', minuten: 5, geschehen: 'Bildimpuls · Vermutungen', sozialform: 'UG', medien: 'Folie' },
          { phase: '', minuten: 3 },
          { phase: 'Erarbeitung', minuten: 30, geschehen: 'M1 lesen · Aufgabe 1–2', sozialform: 'EA', medien: 'M1' },
          { phase: 'Sicherung', minuten: 20, geschehen: 'Tafelbild', sozialform: 'UG', medien: 'Tafel' }
        ],
        hinweise: ''
      },
      45
    )
    expect(v.phasen.map((p) => p.phase)).toEqual(['Einstieg', 'Erarbeitung', 'Sicherung'])
    expect(summeMinuten(v)).toBe(45)
    expect(v.hinweise).toBeUndefined()
    expect(() => verlaufAus({ phasen: [] }, 45)).toThrow()
  })

  it('die Anfrage verlangt die genaue Summe und den Bezug auf das Material', () => {
    const r = verlaufsAnfrage('SYSTEM', 'M1: Text …', 90, 'mit Placemat')
    expect(r.schemaName).toBe('stundenverlauf')
    expect(r.user).toMatch(/GENAU 90/)
    expect(r.user).toMatch(/M1, Aufgabe 2/)
    expect(r.user).toMatch(/mit Placemat/)
  })

  it('Word: A4 quer, feste Spaltenbreiten, alle Phasen; PDF-Vorlage quer', async () => {
    const v = leererVerlauf(45)
    v.phasen[1].geschehen = 'M1 lesen · Aufgabe 1'
    const zip = await JSZip.loadAsync(await verlaufDocx(v, 'Fotosynthese', 'Biologie · Klasse 7'))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toMatch(/w:orient="landscape"/)
    expect(xml).toMatch(/<w:tblGrid><w:gridCol w:w="\d+"\/>/)
    expect(xml).toContain('Erarbeitung')
    expect(xml).toContain('M1 lesen')
    const html = verlaufHtml(v, 'Fotosynthese', 'Biologie · Klasse 7')
    expect(html).toMatch(/size: A4 landscape/)
    expect(html).toContain('M1 lesen<br>Aufgabe 1')
  })
})
