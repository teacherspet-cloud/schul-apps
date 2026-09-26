import JSZip from 'jszip'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { presetDesigns } from '../src/shared/design'
import {
  aufsBlatt,
  DECKBLATT_HOECHSTENS,
  DECKBLATT_LAYOUTS,
  geltendeAnordnung,
  geltendeSeiten,
  kartenMasse,
  layoutKarten,
  SEITE_B,
  SEITE_H,
  umriss,
  vorschauFlaeche,
  waehleSeiten,
  zerlegeSchluessel,
  type DeckblattKopf,
  type SeitenKandidat
} from '../src/renderer/src/modules/arbeitsblatt/render/deckblatt'
import { deckblattKandidaten, layoutKey } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { CoverPage } from '../src/renderer/src/modules/arbeitsblatt/render/CoverPage'
import { fachSymbol, maskottchenBild, tierPlaceholder, tierPrompt } from '../src/renderer/src/modules/arbeitsblatt/render/maskottchen'
import { buildWorksheetDocx } from '../src/renderer/src/modules/arbeitsblatt/export/docx'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import type { PagePlan } from '../src/renderer/src/modules/arbeitsblatt/render/paginate'
import type { DeckblattText } from '../src/renderer/src/modules/arbeitsblatt/render/deckblattBilder'

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const KOEPFE: DeckblattKopf[] = ['band', 'seite', 'zentriert', 'titelbild']
const seiten = (n: number): string[] => Array.from({ length: n }, (_, i) => (i === n - 1 && n > 3 ? 'tafel:0' : `s:s1:print:${i}`))

describe('Deckblatt: Start-Layouts', () => {
  it('jedes Layout legt 1 bis 8 Seiten vollständig in die freie Fläche – auch gedreht, mit Rahmen und Tafelbild im Querformat', () => {
    for (const kopf of KOEPFE) {
      const f = vorschauFlaeche(kopf)
      for (const { value: layout } of DECKBLATT_LAYOUTS)
        for (const rahmen of ['schlicht', 'polaroid'] as const)
          for (let n = 1; n <= DECKBLATT_HOECHSTENS; n++) {
            const karten = layoutKarten(layout, seiten(n), f, rahmen)
            expect(karten, `${layout}/${kopf}/${n}`).toHaveLength(n)
            for (const k of karten) {
              const u = umriss(k, rahmen)
              const wo = `${layout}/${kopf}/${rahmen}/${n}: ${k.seite} ${JSON.stringify(u)}`
              expect(u.x0, wo).toBeGreaterThanOrEqual(f.x0 - 0.05)
              expect(u.y0, wo).toBeGreaterThanOrEqual(f.y0 - 0.05)
              expect(u.x1, wo).toBeLessThanOrEqual(f.x1 + 0.05)
              expect(u.y1, wo).toBeLessThanOrEqual(f.y1 + 0.05)
              expect(Number.isFinite(k.breite) && k.breite > 10, wo).toBe(true)
            }
            // Jede Seite genau einmal
            expect(new Set(karten.map((k) => k.seite)).size).toBe(n)
          }
    }
  })

  it('Vorschauen bleiben erkennbar: bei sechs Seiten mindestens ein Achtel der Blattbreite', () => {
    for (const { value: layout } of DECKBLATT_LAYOUTS) {
      const karten = layoutKarten(layout, seiten(6), vorschauFlaeche('band'), 'schlicht')
      expect(Math.min(...karten.map((k) => k.breite)), layout).toBeGreaterThanOrEqual(SEITE_B / 8)
    }
  })

  it('Fächer und Pinnwand drehen, Raster und Treppe nicht; beim Stapel liegt die erste Seite oben', () => {
    const f = vorschauFlaeche('band')
    const drehungen = (l: Parameters<typeof layoutKarten>[0]): number => new Set(layoutKarten(l, seiten(5), f, 'schlicht').map((k) => k.drehung)).size
    expect(drehungen('faecher')).toBeGreaterThan(1)
    expect(drehungen('pinnwand')).toBeGreaterThan(1)
    expect(drehungen('raster')).toBe(1)
    expect(drehungen('treppe')).toBe(1)
    const stapel = layoutKarten('stapel', seiten(5), f, 'schlicht')
    expect(stapel[0].ebene).toBe(Math.max(...stapel.map((k) => k.ebene)))
  })

  it('frei gezogene Karten bleiben auf dem Blatt und behalten eine sinnvolle Größe', () => {
    const k = aufsBlatt({ seite: 's:s1:print:0', x: -40, y: 400, breite: 400, drehung: 30, ebene: 1 }, 'polaroid')
    const u = umriss(k, 'polaroid')
    expect(u.x0).toBeGreaterThanOrEqual(-0.01)
    expect(u.y1).toBeLessThanOrEqual(SEITE_H + 0.01)
    expect(k.breite).toBeLessThanOrEqual(190)
    expect(aufsBlatt({ ...k, breite: 2 }, 'schlicht').breite).toBeGreaterThanOrEqual(18)
  })

  it('Polaroid: unten breiterer Rand als oben – die Karte ist höher als die Seite darin', () => {
    const m = kartenMasse(60, false, 'polaroid')
    expect(m.hoehe - m.innenHoehe).toBeGreaterThan((m.breite - m.innenBreite) * 1.5)
    const quer = kartenMasse(60, true, 'schlicht')
    expect(quer.hoehe).toBeLessThan(quer.breite)
  })

  it('eigene Anordnung gilt; eine neu gewählte Seite bekommt ihren Platz aus dem Layout, ganz oben', () => {
    const f = vorschauFlaeche('band')
    const eigen = [{ seite: 's:s1:print:0', x: 100, y: 200, breite: 50, drehung: 12, ebene: 3 }]
    const a = geltendeAnordnung(['s:s1:print:0', 's:s1:print:1'], 'raster', f, 'schlicht', eigen)
    expect(a[0]).toEqual(eigen[0])
    expect(a[1].ebene).toBeGreaterThan(3)
  })
})

describe('Deckblatt: Seitenwahl', () => {
  const k = (schluessel: string, art: SeitenKandidat['art'], sheetId = 's1', index = 0): SeitenKandidat => ({
    schluessel,
    art,
    sheetId,
    index,
    titel: schluessel
  })

  it('wählt 4–6 aussagekräftige Seiten: erste Seite, Tafelbild, Hilfekarten, Lösungen – nie Bildnachweise', () => {
    const kandidaten = [
      ...Array.from({ length: 8 }, (_, i) => k(`s:s1:print:${i}`, 'blatt', 's1', i)),
      k('s:s1:print:8', 'hilfekarten', 's1', 8),
      k('s:s1:print:9', 'nachweise', 's1', 9),
      k('s:s1:key:0', 'loesung', 's1', 0),
      k('s:s1:key:1', 'lehrkraft', 's1', 1),
      k('tafel:0', 'tafel', undefined, 0)
    ]
    const wahl = waehleSeiten(kandidaten)
    expect(wahl).toHaveLength(6)
    expect(wahl).toContain('s:s1:print:0')
    expect(wahl).toContain('tafel:0')
    expect(wahl).toContain('s:s1:print:8')
    expect(wahl).toContain('s:s1:key:0')
    expect(wahl).not.toContain('s:s1:print:9')
    expect(wahl).not.toContain('s:s1:key:1')
    // Reihenfolge wie im Material
    expect(wahl[0]).toBe('s:s1:print:0')
    expect(wahl[wahl.length - 1]).toBe('tafel:0')
  })

  it('kurzes Material: alle Seiten, mindestens eine; weitere Niveaustufen mit ihrer ersten Seite', () => {
    expect(waehleSeiten([k('s:s1:print:0', 'blatt')])).toEqual(['s:s1:print:0'])
    const zwei = waehleSeiten([
      k('s:a:print:0', 'blatt', 'a'),
      k('s:a:print:1', 'blatt', 'a', 1),
      k('s:b:print:0', 'blatt', 'b'),
      k('s:b:print:1', 'blatt', 'b', 1)
    ])
    expect(zwei).toContain('s:b:print:0')
    expect(zwei.length).toBeGreaterThanOrEqual(3)
  })

  it('eigene Wahl gilt (höchstens acht); verschwundene Seiten fallen still heraus', () => {
    const kandidaten = Array.from({ length: 10 }, (_, i) => k(`s:s1:print:${i}`, 'blatt', 's1', i))
    expect(geltendeSeiten(kandidaten, ['s:s1:print:3', 's:s1:print:99'])).toEqual(['s:s1:print:3'])
    expect(
      geltendeSeiten(
        kandidaten,
        kandidaten.map((x) => x.schluessel)
      )
    ).toHaveLength(DECKBLATT_HOECHSTENS)
    // Nichts Gültiges gewählt → wieder automatisch
    expect(geltendeSeiten(kandidaten, ['weg']).length).toBeGreaterThanOrEqual(4)
  })

  it('Schlüssel lassen sich zerlegen', () => {
    expect(zerlegeSchluessel('tafel:2')).toEqual({ tafel: 2 })
    expect(zerlegeSchluessel('s:blatt-1:key:3')).toEqual({ sheetId: 'blatt-1', key: true, index: 3 })
    expect(zerlegeSchluessel('quatsch')).toBeNull()
  })
})

/** Blatt mit Hilfekarten, Lösungen und Tafelbild – ohne KI */
/** Ein gemessener Kopftext des Deckblatts – mit den üblichen Werten */
const text = (t: Partial<DeckblattText> & Pick<DeckblattText, 'art' | 'text'>): DeckblattText => ({
  rich: false,
  x: 0,
  y: 0,
  breite: 50,
  hoehe: 5,
  pt: 11,
  zeile: 5,
  fett: false,
  farbe: '222222',
  ausrichtung: 'left',
  versalien: false,
  sperrungPt: 0,
  mittig: false,
  ...t
})

function blatt(): Worksheet {
  const meta = {
    ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
    subjectId: 'biologie',
    subjectLabel: 'Biologie',
    topic: 'Fotosynthese',
    title: 'Fotosynthese',
    coverPage: true,
    answerKey: true
  }
  return {
    version: 1,
    meta,
    design: presetDesigns()[0],
    outline: null,
    sources: [],
    createdAt: '',
    board: {
      title: 'Fotosynthese',
      layout: 'columns',
      sections: [{ heading: 'Stoffe', points: ['Wasser'], fromTasks: '' }],
      conclusion: '',
      steps: []
    } as unknown as Worksheet['board'],
    sheets: [
      {
        id: 's1',
        label: 'Arbeitsblatt',
        blocks: [
          { id: 'i', type: 'infoBox', variant: 'merke', title: 'Merke', body: 'Pflanzen brauchen Licht.' },
          { id: 'h', type: 'scaffold', variant: 'hilfekarten', title: 'Tipp', items: ['Denke an das Licht.'] }
        ]
      }
    ]
  }
}

describe('Deckblatt: Seiten des Materials und Darstellung', () => {
  const layouts = new Map<string, PagePlan[]>([
    [
      layoutKey('s1', false),
      [
        { items: [{ id: 'i' }], overflow: false },
        { items: [], overflow: false }
      ]
    ],
    [layoutKey('s1', true), [{ items: [{ id: 'i' }], overflow: false }]]
  ])

  it('kennt Blattseiten, Hilfekarten, Lösungen und das Tafelbild', () => {
    const arten = deckblattKandidaten(blatt(), layouts).map((k) => k.art)
    expect(arten).toEqual(['blatt', 'blatt', 'hilfekarten', 'loesung', 'tafel'])
  })

  it('der Druck zeigt Karten in mm – ohne Griffe', () => {
    const ws = blatt()
    const html = renderToStaticMarkup(
      createElement(CoverPage, {
        ws,
        vorschau: { kandidaten: deckblattKandidaten(ws, layouts), seite: (s: string) => createElement('div', { className: 'x' }, s) }
      })
    )
    expect(html).toContain('ws-cover-thumb')
    expect(html).toMatch(/left:[\d.]+mm/)
    expect(html).not.toContain('ws-cover-griff')
    expect(html).not.toContain('role="button"')
  })

  it('Maskottchen: Fuchs, Tier, Fachsymbol, eigenes Bild oder keins', () => {
    const m = blatt().meta
    expect(maskottchenBild({ ...m, coverMascot: 'keins' }, '#000', '#ccc')).toBeNull()
    expect(maskottchenBild({ ...m, coverMascot: 'bild' }, '#000', '#ccc')).toBeNull()
    expect(maskottchenBild({ ...m, coverMascot: 'bild', coverOwnImage: PNG_1PX }, '#000', '#ccc')).toBe(PNG_1PX)
    expect(maskottchenBild({ ...m, coverMascot: 'fach' }, '#123456', '#ccc')).toBe(fachSymbol('biologie', '#123456', '#ccc'))
    expect(maskottchenBild({ ...m, coverMascot: 'tier', coverAnimal: 'igel' }, '#000', '#ccc')).toBe(tierPlaceholder('igel', '#000', '#ccc'))
    expect(maskottchenBild(m, '#000', '#ccc')?.startsWith('data:image/svg+xml')).toBe(true)
    // Ohne Maskottchen fehlt das Bild auf dem Deckblatt ganz
    expect(renderToStaticMarkup(createElement(CoverPage, { ws: { ...blatt(), meta: { ...m, coverMascot: 'keins' } } }))).not.toContain('ws-cover-fox')
    const p = tierPrompt('eule', 'Biologie', 'Fotosynthese')
    expect(p).toContain('Eule')
    expect(p).toContain('ohne Text')
  })

  it('Word: Deckblatt als Abschnitt vorn, Karten als schwebende, gedrehte Bilder in ihrer Ebene', async () => {
    const deps = {
      logo: null,
      schoolName: '',
      sizer: async () => ({ width: 10, height: 10 }),
      raster: async () => PNG_1PX,
      sidebar: async () => PNG_1PX,
      deckblatt: {
        hintergrund: PNG_1PX,
        texte: [
          text({
            art: 'titel',
            text: 'Fotosynthese im Blatt',
            rich: true,
            x: 18,
            y: 16,
            breite: 120,
            hoehe: 12,
            pt: 26,
            zeile: 10.5,
            fett: true,
            farbe: 'FFFFFF'
          }),
          text({ art: 'fakten', text: 'Biologie › Stoffwechsel · Klasse 8', x: 18, y: 31, breite: 120, hoehe: 5, pt: 11, zeile: 5, farbe: 'DDE3EA' }),
          text({ art: 'kicker-fach', text: 'Biologie', x: 18, y: 10, breite: 60, hoehe: 4, pt: 8.5, zeile: 4, versalien: true, sperrungPt: 0.7 }),
          text({ art: 'kennzeichen', text: 'mit Lösungen', x: 23, y: 80, breite: 22, hoehe: 5, pt: 10, zeile: 4.5, mittig: true, ausrichtung: 'center' })
        ],
        karten: [
          { png: PNG_1PX, x0: 20, y0: 130, breite: 50, hoehe: 70, drehung: -8, ebene: 1 },
          { png: PNG_1PX, x0: 80, y0: 140, breite: 50, hoehe: 70, drehung: 6, ebene: 2 }
        ]
      }
    }
    const xml = async (ws: Worksheet, keyOnly = false): Promise<string> =>
      (await JSZip.loadAsync(await buildWorksheetDocx(ws, { sheetIds: ['s1'], includeKey: false, keyOnly }, deps))).file('word/document.xml')!.async('string')
    const doc = await xml(blatt())
    // Hintergrund + zwei Karten, alle schwebend
    expect((doc.match(/<wp:anchor/g) ?? []).length).toBeGreaterThanOrEqual(3)
    // −8° wird zu 352° (Word kennt nur 0–360°), in 60 000stel Grad
    expect(doc).toContain('rot="21120000"')
    expect(doc).toContain('rot="360000"')
    // Lage in EMU: 20 mm = 720 000
    expect(doc).toContain('<wp:posOffset>720000</wp:posOffset>')
    // Kopftexte als ECHTER Text (w:t) in Rahmen an der gemessenen Stelle – nicht im Hintergrundbild
    expect(doc).toContain('<w:t xml:space="preserve">Fotosynthese im Blatt</w:t>')
    expect(doc).toContain('Biologie › Stoffwechsel · Klasse 8</w:t>')
    expect(doc).toContain('mit Lösungen</w:t>')
    const rahmen = doc.match(/<w:framePr [^>]*>/g) ?? []
    expect(rahmen).toHaveLength(4)
    // 18 mm = 1020 Twips, 16 mm = 907 Twips; an der Seite verankert
    expect(rahmen[0]).toMatch(/w:x="1020"/)
    expect(rahmen[0]).toMatch(/w:y="907"/)
    expect(rahmen[0]).toMatch(/w:hAnchor="page"/)
    // Schrift wie im Deckblatt: 26 pt fett weiß, Zeilenhöhe genau
    expect(doc).toMatch(/<w:b\/>[\s\S]*?<w:color w:val="FFFFFF"\/>[\s\S]*?<w:sz w:val="52"\/>/)
    expect(doc).toContain('w:lineRule="exact"')
    // Versalien und Sperrung (Fach über dem betonten Überthema)
    expect(doc).toContain('<w:caps/>')
    expect(doc).toContain('<w:spacing w:val="14"/>')
    // Pille: zentriert
    expect(doc).toMatch(/<w:jc w:val="center"\/>[\s\S]*?mit Lösungen/)
    // Reiner Lösungsdruck: kein Deckblatt
    const loesung = await xml(blatt(), true)
    expect(loesung).not.toContain('rot="21120000"')
    // Ohne eingeschaltetes Deckblatt auch keins
    const ohne = await xml({ ...blatt(), meta: { ...blatt().meta, coverPage: false } })
    expect(ohne).not.toContain('rot="21120000"')
  })
})
