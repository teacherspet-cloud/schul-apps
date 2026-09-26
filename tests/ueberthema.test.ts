import JSZip from 'jszip'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { presetDesigns, type DesignTemplate } from '../src/shared/design'
import { fachPfad, mitThemenbereich, ueberthemaVon, unitAusName } from '../src/renderer/src/shared/ueberthema'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { kopfUeberthema, PageFrame, sidebarText } from '../src/renderer/src/modules/arbeitsblatt/render/PageFrame'
import { pageInfoFor } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { CoverPage } from '../src/renderer/src/modules/arbeitsblatt/render/CoverPage'
import { buildWorksheetDocx } from '../src/renderer/src/modules/arbeitsblatt/export/docx'
import { emptyKurztest } from '../src/renderer/src/modules/lernzielkontrolle/model/defaults'
import { kurztestToWorksheet } from '../src/renderer/src/modules/lernzielkontrolle/render/kurztestWorksheet'
import { newTest } from '../src/renderer/src/modules/grammatiktest/model/defaults'
import { testToWorksheet } from '../src/renderer/src/modules/grammatiktest/render/testWorksheet'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import { examToWorksheet } from '../src/renderer/src/modules/klassenarbeit/render/examWorksheet'
import type { Exam } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { vokabeltestPfad } from '../src/renderer/src/modules/vokabeltest/render/TestPage'
import type { TestDocument } from '../src/renderer/src/modules/vokabeltest/model/types'
import { nimmFachVorgabe, setzeFachVorgabe } from '../src/renderer/src/shared/fachVorgabe'

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('Überthema: woher es kommt', () => {
  it('eigener Eintrag vor Themenbereich vor Rückfall; abgeschaltet = nichts', () => {
    expect(ueberthemaVon({ themenbereich: 'Ökologie' })).toBe('Ökologie')
    expect(ueberthemaVon({ themenbereich: 'Ökologie', ueberthema: ' Stoffwechsel ' })).toBe('Stoffwechsel')
    expect(ueberthemaVon({ themenbereich: 'Ökologie', ueberthemaAus: true })).toBe('')
    expect(ueberthemaVon({ ueberthema: 'X', ueberthemaAus: true }, 'Unit 3')).toBe('')
    expect(ueberthemaVon({}, 'Unit 3')).toBe('Unit 3')
    expect(ueberthemaVon({ ueberthema: '   ' }, '')).toBe('')
    expect(ueberthemaVon(undefined)).toBe('')
  })

  it('Pfad ohne einsamen Pfeil', () => {
    expect(fachPfad('Biologie', 'Ökologie')).toBe('Biologie › Ökologie')
    expect(fachPfad('Biologie', '')).toBe('Biologie')
    expect(fachPfad('', 'Ökologie')).toBe('Ökologie')
    expect(fachPfad('', '')).toBe('')
  })

  it('Themenbereich nur zum Anzeigen einsetzen – dasselbe Objekt, wenn nichts zu tun ist', () => {
    const m = { meta: { ueberthema: undefined as string | undefined } }
    expect(mitThemenbereich(m, null)).toBe(m)
    const mit = mitThemenbereich(m, 'Ökologie')
    expect(mit).not.toBe(m)
    expect((mit.meta as { themenbereich?: string }).themenbereich).toBe('Ökologie')
    expect(mitThemenbereich(mit, 'Ökologie')).toBe(mit)
  })

  it('Vokabeltest: die Unit aus dem Namen der Liste', () => {
    expect(unitAusName('Green Line 5 – Unit 3, Station 1')).toBe('Unit 3')
    expect(unitAusName('Découvertes 2 – Unité 4')).toBe('Unité 4')
    expect(unitAusName('Prima nova Lektion 12')).toBe('Lektion 12')
    expect(unitAusName('Tiere und Pflanzen')).toBe('')
    expect(unitAusName(undefined)).toBe('')
  })

  it('„Neu in diesem Bereich": Fach wird einmal abgeholt', () => {
    setzeFachVorgabe('arbeitsblatt', 'biologie')
    expect(nimmFachVorgabe('arbeitsblatt')).toBe('biologie')
    expect(nimmFachVorgabe('arbeitsblatt')).toBeNull()
    expect(nimmFachVorgabe('lernzielkontrolle')).toBeNull()
  })
})

function blatt(design: DesignTemplate, meta: Partial<Worksheet['meta']> = {}): Worksheet {
  return {
    version: 1,
    meta: {
      ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
      subjectId: 'biologie',
      subjectLabel: 'Biologie',
      topic: 'Fotosynthese',
      title: 'Wie Pflanzen Energie gewinnen',
      ...meta
    },
    design,
    outline: null,
    sources: [],
    createdAt: '',
    sheets: [{ id: 's1', label: 'Arbeitsblatt', blocks: [{ id: 'i', type: 'infoBox', variant: 'merke', title: 'Merke', body: 'Licht.' }] }]
  }
}

const mitStil = (stil: 'path' | 'split' | 'emphasis', layout: DesignTemplate['header']['layout'] = 'logoLeft'): DesignTemplate => {
  const d = presetDesigns()[0]
  return { ...d, header: { ...d.header, layout, overTopicStyle: stil } }
}

const kopf = (ws: Worksheet, seite = 1): string =>
  renderToStaticMarkup(createElement(PageFrame, { info: pageInfoFor(ws, ws.sheets[0], null, '', false), page: seite, pages: 2 }))

describe('Überthema im Kopf des Arbeitsblatts', () => {
  it('(a) Pfad „Fach › Überthema" in der Fachzeile, auch im kompakten Kopf der Folgeseiten', () => {
    const ws = blatt(mitStil('path'), { themenbereich: 'Ökologie' })
    expect(kopf(ws)).toContain('Biologie › Ökologie')
    expect(kopf(ws, 2)).toContain('Biologie › Ökologie · ')
    // Nicht in der Blattüberschrift
    expect(kopf(ws)).not.toMatch(/ws-title[^>]*>[^<]*Ökologie/)
  })

  it('(b) Fach links, Überthema rechts als eigener Block', () => {
    const html = kopf(blatt(mitStil('split'), { themenbereich: 'Ökologie' }))
    expect(html).toContain('ws-ueberthema ws-ueberthema-split')
    expect(html).not.toContain('Biologie › Ökologie')
    expect(html).toMatch(/ws-subject[^>]*>Biologie · Klasse/)
  })

  it('(c) Überthema betont, Fach klein darüber – das Fach steht dann nicht noch einmal in der Fachzeile', () => {
    const ws = blatt(mitStil('emphasis', 'colorBand'), { themenbereich: 'Ökologie' })
    const html = kopf(ws)
    expect(html).toContain('ws-ueberthema-fach">Biologie')
    expect(html).toContain('ws-ueberthema-thema">Ökologie')
    expect(kopfUeberthema(pageInfoFor(ws, ws.sheets[0], null, '', false)).fachZeile).toBe('')
  })

  it('ohne Überthema und abgeschaltet: der Kopf wie vor Paket 11', () => {
    for (const stil of ['path', 'split', 'emphasis'] as const) {
      const ohne = kopf(blatt(mitStil(stil)))
      const aus = kopf(blatt(mitStil(stil), { themenbereich: 'Ökologie', ueberthemaAus: true }))
      for (const html of [ohne, aus]) {
        expect(html, stil).not.toContain('›')
        expect(html, stil).not.toContain('ws-ueberthema')
        expect(html, stil).not.toContain('Ökologie')
      }
    }
  })

  it('Seitenleiste: „Überthema" und „Fach › Überthema"', () => {
    const d = presetDesigns()[2]
    const ws = (content: DesignTemplate['sidebar']['content'], meta: Partial<Worksheet['meta']> = { ueberthema: 'Ökologie' }): string =>
      sidebarText(pageInfoFor(blatt({ ...d, sidebar: { ...d.sidebar, content } }, meta), blatt(d).sheets[0], null, '', false))
    expect(ws('overTopic')).toBe('Ökologie')
    expect(ws('subjectOverTopic')).toBe('Biologie › Ökologie')
    expect(ws('subjectOverTopic', {})).toBe('Biologie')
    expect(ws('overTopic', { ueberthema: 'Ökologie', ueberthemaAus: true })).toBe('')
  })

  it('Deckblatt-Kopf trägt das Überthema', () => {
    const html = renderToStaticMarkup(createElement(CoverPage, { ws: blatt(mitStil('path'), { themenbereich: 'Ökologie', coverPage: true }) }))
    expect(html).toContain('Biologie › Ökologie')
    const betont = renderToStaticMarkup(createElement(CoverPage, { ws: blatt(mitStil('emphasis'), { themenbereich: 'Ökologie' }) }))
    expect(betont).toContain('ws-cover-kicker-thema">Ökologie')
  })

  it('Word: dieselbe Darstellung im Kopf', async () => {
    const deps = { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG_1PX, sidebar: async () => PNG_1PX }
    const kopfXml = async (ws: Worksheet): Promise<string> => {
      const zip = await JSZip.loadAsync(await buildWorksheetDocx(ws, { sheetIds: ['s1'], includeKey: false }, deps))
      const dateien = Object.keys(zip.files).filter((n) => /word\/header\d+\.xml/.test(n))
      return (await Promise.all(dateien.map((n) => zip.file(n)!.async('string')))).join('\n')
    }
    expect(await kopfXml(blatt(mitStil('path'), { themenbereich: 'Ökologie' }))).toContain('Biologie › Ökologie')
    const geteilt = await kopfXml(blatt(mitStil('split'), { themenbereich: 'Ökologie' }))
    expect(geteilt).toContain('>Ökologie<')
    expect(geteilt).not.toContain('Biologie › Ökologie')
    const aus = await kopfXml(blatt(mitStil('path'), { themenbereich: 'Ökologie', ueberthemaAus: true }))
    expect(aus).not.toContain('Ökologie')
  })
})

describe('Überthema in den übrigen Programmen', () => {
  const kopfVon = (ws: Worksheet): string => kopf(mitThemenbereich(ws, 'Potenzen'))

  it('Lernzielkontrolle, Grammatiktest und Klassenarbeit reichen Eintrag und Schalter durch', () => {
    const lzk = emptyKurztest('NI', 'gymnasium', 'Gymnasium')
    expect(kopfVon(kurztestToWorksheet(lzk, 0))).toContain('Mathematik › Potenzen')
    lzk.meta.ueberthema = 'Algebra'
    expect(kopfVon(kurztestToWorksheet(lzk, 0))).toContain('Mathematik › Algebra')
    lzk.meta.ueberthemaAus = true
    expect(kopfVon(kurztestToWorksheet(lzk, 0))).not.toContain('›')

    const gt = newTest(presetDesigns()[0], 'NI', 'gymnasium', 'Gymnasium')
    gt.meta.ueberthema = 'Tenses'
    expect(kopf(testToWorksheet(gt))).toContain('English › Tenses')

    const exam: Exam = {
      version: 1,
      design: presetDesigns()[0],
      createdAt: '',
      meta: { ...defaultExamMeta('NI', 'gymnasium', 'Gymnasium', 9), subjectId: 'geschichte', subjectLabel: 'Geschichte', ueberthemaAus: false },
      parts: []
    } as unknown as Exam
    expect(kopfVon(examToWorksheet(exam))).toContain('Geschichte › Potenzen')
  })

  it('Vokabeltest: „Englisch › Unit 3", ohne Überthema nichts', () => {
    const doc = { header: { themenbereich: 'Unit 3' }, settings: { targetLanguage: 'en' } } as unknown as TestDocument
    expect(vokabeltestPfad(doc)).toBe('Englisch › Unit 3')
    expect(vokabeltestPfad({ ...doc, header: { ...doc.header, ueberthemaAus: true } } as TestDocument)).toBe('')
    expect(vokabeltestPfad({ ...doc, header: {} } as TestDocument)).toBe('')
  })
})
