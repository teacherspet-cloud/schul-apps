/**
 * Fachfarben (Paket 10a): Palette, Graustufen-Prüfung und der Vorrang
 * Fachfarbe › Vorlagenfarbe – in allen Programmen, die ihr Blatt als Arbeitsblatt darstellen,
 * und im Vokabeltest. Ohne Oberfläche und ohne KI.
 */
import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'
import { presetDesigns } from '@shared/design'
import {
  designMitFachfarbe,
  druckDesign,
  FACH_PALETTE,
  FACH_VORSCHLAG,
  fachFarbe,
  fachFarbeAus,
  fachIdVon,
  farbabstand,
  GETEILTE_VORSCHLAEGE,
  graustufenPruefung,
  kontrast,
  merkeFachfarben,
  wirksameFarbe
} from '../src/renderer/src/shared/fachfarben'
import { SUBJECTS } from '../src/renderer/src/modules/arbeitsblatt/model/subjects'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { pageInfoFor } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { deckblattFarben } from '../src/renderer/src/modules/arbeitsblatt/render/coverDesigns'
import { buildWorksheetDocx } from '../src/renderer/src/modules/arbeitsblatt/export/docx'
import { emptyKurztest } from '../src/renderer/src/modules/lernzielkontrolle/model/defaults'
import { kurztestToWorksheet } from '../src/renderer/src/modules/lernzielkontrolle/render/kurztestWorksheet'
import { newTest } from '../src/renderer/src/modules/grammatiktest/model/defaults'
import { testToWorksheet } from '../src/renderer/src/modules/grammatiktest/render/testWorksheet'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import { examToWorksheet } from '../src/renderer/src/modules/klassenarbeit/render/examWorksheet'
import type { Exam } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { vokabeltestFarbe } from '../src/renderer/src/modules/vokabeltest/render/TestPage'
import type { TestDocument } from '../src/renderer/src/modules/vokabeltest/model/types'

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const GRUEN = FACH_VORSCHLAG.biologie

afterEach(() => merkeFachfarben({}))

describe('Druckfeste Palette', () => {
  it('hat rund 16 Farben, jede fürs Auge klar von jeder anderen verschieden', () => {
    expect(FACH_PALETTE.length).toBe(16)
    for (let i = 0; i < FACH_PALETTE.length; i++)
      for (let j = i + 1; j < FACH_PALETTE.length; j++) {
        const a = FACH_PALETTE[i]
        const b = FACH_PALETTE[j]
        expect(farbabstand(a.hex, b.hex), `${a.name} ↔ ${b.name}`).toBeGreaterThanOrEqual(12)
      }
  })

  it('besteht die Graustufen-Prüfung ohne jeden Hinweis', () => {
    for (const f of FACH_PALETTE) expect(graustufenPruefung(f.hex).stufe, f.name).toBe('gut')
  })

  it('gibt jedem Fach einen Vorschlag aus der Palette – doppelt nur, wo es begründet ist', () => {
    const palette = new Set(FACH_PALETTE.map((f) => f.hex))
    for (const s of SUBJECTS) expect(palette.has(FACH_VORSCHLAG[s.id]), s.id).toBe(true)
    for (const s of SUBJECTS) {
      const gleich = SUBJECTS.filter((x) => x.id !== s.id && FACH_VORSCHLAG[x.id] === FACH_VORSCHLAG[s.id]).map((x) => x.id)
      const erlaubt = [GETEILTE_VORSCHLAEGE[s.id], ...Object.keys(GETEILTE_VORSCHLAEGE).filter((k) => GETEILTE_VORSCHLAEGE[k] === s.id)].filter(Boolean)
      expect(gleich.sort(), s.id).toEqual(erlaubt.sort())
    }
    // Die häufigen Kombinationen der Lehrkraft (z. B. Englisch/Geschichte, Mathe/Physik) sind verschieden
    expect(FACH_VORSCHLAG.englisch).not.toBe(FACH_VORSCHLAG.geschichte)
    expect(FACH_VORSCHLAG.mathematik).not.toBe(FACH_VORSCHLAG.physik)
    expect(FACH_VORSCHLAG.deutsch).not.toBe(FACH_VORSCHLAG.daz)
  })
})

describe('Graustufen-Prüfung', () => {
  it('rechnet den Kontrast nach WCAG', () => {
    expect(kontrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(kontrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
  })

  it('warnt vor zu hellen Farben, die auf der S/W-Kopie verblassen', () => {
    for (const hell of ['#ffe066', '#a5d8ff', '#ffc9c9']) {
      const p = graustufenPruefung(hell)
      expect(p.stufe, hell).toBe('zu-hell')
      expect(p.hinweis).toMatch(/S\/W/)
    }
  })

  it('meldet „knapp" zwischen Linien- und Textkontrast', () => {
    const p = graustufenPruefung('#e8590c')
    expect(p.gegenWeiss).toBeGreaterThanOrEqual(3)
    expect(p.gegenWeiss).toBeLessThan(4.5)
    expect(p.stufe).toBe('knapp')
  })

  it('kennzeichnet fast schwarze Farben (Faustregel)', () => {
    const p = graustufenPruefung('#111111')
    expect(p.stufe).toBe('zu-dunkel')
    expect(p.hinweis).toMatch(/Faustregel/)
  })
})

describe('Vorrang Fachfarbe › Vorlage', () => {
  const vorlage = '#5f3dc4'

  it('nimmt die eigene Wahl, sonst den Vorschlag, bei „Farbe der Vorlage“ die Vorlage', () => {
    expect(wirksameFarbe(vorlage, 'biologie', false, {})).toBe(GRUEN)
    expect(wirksameFarbe(vorlage, 'biologie', undefined, { biologie: '#123456' })).toBe('#123456')
    // '' = zurück zum Vorschlag
    expect(wirksameFarbe(vorlage, 'biologie', false, { biologie: '' })).toBe(GRUEN)
    expect(wirksameFarbe(vorlage, 'biologie', true, { biologie: '#123456' })).toBe(vorlage)
    // Unbekanntes Fach (Niederländisch im Vokabeltest): Vorlage
    expect(wirksameFarbe(vorlage, 'nl', false, {})).toBe(vorlage)
  })

  it('findet das Fach über Kennung, Namen oder Sprachcode', () => {
    expect(fachIdVon('biologie')).toBe('biologie')
    expect(fachIdVon('Biologie')).toBe('biologie')
    expect(fachIdVon('en')).toBe('englisch')
    expect(fachIdVon('Englisch')).toBe('englisch')
    expect(fachIdVon('Klingonisch')).toBeNull()
    expect(fachFarbeAus('la', {})).toBe(FACH_VORSCHLAG.latein)
  })

  it('ersetzt Akzent und Seitenleiste, lässt Aufbau und Schrift der Vorlage', () => {
    const d = presetDesigns().find((x) => x.id === 'preset-seitenleiste')!
    const mit = designMitFachfarbe(d, 'biologie', false, {})
    expect(mit.page.accentColor).toBe(GRUEN)
    expect(mit.sidebar.color).toBe(GRUEN)
    expect(mit.page.fontFamily).toBe(d.page.fontFamily)
    expect(mit.header).toBe(d.header)
    // Abgeschaltet: unverändert dasselbe Objekt (die Vorschau misst nichts neu)
    expect(designMitFachfarbe(d, 'biologie', true, {})).toBe(d)
  })

  it('liest die Einstellungen, die der Store hereinreicht', () => {
    expect(fachFarbe('Biologie')).toBe(GRUEN)
    merkeFachfarben({ biologie: '#0000aa' })
    expect(fachFarbe('Biologie')).toBe('#0000aa')
  })
})

/** Kleinstes Arbeitsblatt mit farbiger Zwischenüberschrift – Seitenleisten-Vorlage, damit auch deren Farbe geprüft wird */
function blatt(vorlagenfarbe?: boolean): Worksheet {
  const design = presetDesigns().find((x) => x.id === 'preset-seitenleiste')!
  return {
    version: 1,
    meta: {
      ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
      subjectId: 'biologie',
      subjectLabel: 'Biologie',
      topic: 'Zelle',
      title: 'Die Zelle',
      vorlagenfarbe
    },
    design,
    outline: null,
    sources: [],
    createdAt: '2026-09-26',
    sheets: [{ id: 's1', label: 'Arbeitsblatt', blocks: [{ id: 'b1', type: 'divider', title: 'Teil 1: Zellbestandteile' }] }]
  } as unknown as Worksheet
}

describe('Wirkung in allen Programmen', () => {
  it('Arbeitsblatt: Vorschau/Druck (pageInfoFor) nehmen die Fachfarbe, abgeschaltet die Vorlage', () => {
    expect(pageInfoFor(blatt(), blatt().sheets[0], null, '', false).design.page.accentColor).toBe(GRUEN)
    expect(pageInfoFor(blatt(), blatt().sheets[0], null, '', false).design.sidebar.color).toBe(GRUEN)
    expect(pageInfoFor(blatt(true), blatt().sheets[0], null, '', false).design.page.accentColor).toBe('#5f3dc4')
    merkeFachfarben({ biologie: '#0000aa' })
    expect(pageInfoFor(blatt(), blatt().sheets[0], null, '', false).design.page.accentColor).toBe('#0000aa')
  })

  it('Arbeitsblatt: der Word-Export färbt mit der Fachfarbe', async () => {
    merkeFachfarben({ biologie: '#0000aa' })
    const deps = { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG_1PX, sidebar: async () => PNG_1PX }
    const lesen = async (ws: Worksheet): Promise<string> =>
      (await JSZip.loadAsync(await buildWorksheetDocx(ws, { sheetIds: ['s1'], includeKey: false, includeBoard: false }, deps)))
        .file('word/document.xml')!
        .async('string')
    const mit = await lesen(blatt())
    expect(mit).toContain('0000AA')
    const ohne = await lesen(blatt(true))
    expect(ohne).not.toContain('0000AA')
    expect(ohne).toContain('5F3DC4')
  })

  it('Deckblatt folgt der Fachfarbe, solange keine eigene Deckblattfarbe gewählt ist', () => {
    expect(deckblattFarben({ subjectId: 'biologie' }).dark).toBe(GRUEN)
    expect(deckblattFarben({ subjectId: 'biologie', coverDesign: 'fach' }).dark).toBe(GRUEN)
    expect(deckblattFarben({ subjectId: 'biologie', coverDesign: 'rot' }).id).toBe('rot')
    expect(deckblattFarben({ subjectId: 'biologie', vorlagenfarbe: true }).id).toBe('blau')
  })

  it('Lernzielkontrolle, Grammatiktest und Klassenarbeit reichen Fach und Schalter durch', () => {
    const lzk = emptyKurztest('NI', 'gymnasium', 'Gymnasium')
    lzk.meta.subjectId = 'biologie'
    const kopf = (ws: Worksheet): string => pageInfoFor(ws, ws.sheets[0], null, '', false).design.page.accentColor
    expect(kopf(kurztestToWorksheet(lzk, 0))).toBe(GRUEN)
    lzk.meta.vorlagenfarbe = true
    expect(kopf(kurztestToWorksheet(lzk, 0))).toBe(lzk.design.page.accentColor)

    const gt = newTest(presetDesigns()[0], 'NI', 'gymnasium', 'Gymnasium')
    expect(kopf(testToWorksheet(gt))).toBe(FACH_VORSCHLAG[gt.meta.subjectId])
    gt.meta.vorlagenfarbe = true
    expect(kopf(testToWorksheet(gt))).toBe(gt.design.page.accentColor)

    const ka = { version: 1, design: presetDesigns()[0], parts: [], createdAt: '', meta: defaultExamMeta('NI', 'gymnasium', 'Gymnasium') } as unknown as Exam
    expect(druckDesign(examToWorksheet(ka)).page.accentColor).toBe(FACH_VORSCHLAG[ka.meta.subjectId])
    ka.meta.vorlagenfarbe = true
    expect(druckDesign(examToWorksheet(ka)).page.accentColor).toBe(ka.design.page.accentColor)
  })

  it('Vokabeltest: Fachfarbe der Sprache, abgeschaltet oder unbekannte Sprache schwarz', () => {
    const doc = (targetLanguage: string, vorlagenfarbe?: boolean): TestDocument =>
      ({ settings: { targetLanguage }, header: { vorlagenfarbe } }) as unknown as TestDocument
    expect(vokabeltestFarbe(doc('fr'))).toBe(FACH_VORSCHLAG.franzoesisch)
    expect(vokabeltestFarbe(doc('fr', true))).toBeNull()
    expect(vokabeltestFarbe(doc('nl'))).toBeNull()
  })
})
