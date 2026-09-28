import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { aktuelleKi, kiMetaTag, kiVermerkText, leseKiMeta, stempleKi, vermerkSichtbar } from '../src/shared/kiKennzeichnung'
import { DEFAULT_SETTINGS } from '../src/shared/types'
import { buildWorksheetDocx } from '../src/renderer/src/modules/arbeitsblatt/export/docx'
import { buildWorksheetHtml } from '../src/renderer/src/modules/arbeitsblatt/render/printHtml'
import { sampleWorksheet } from './worksheetExport.test'

/*
 * KI-Kennzeichnung (Großprogramm 0.4, Rechtspaket): maschinenlesbar in Word und PDF, sichtbar
 * nach Wahl im Lösungsteil, auf jeder Seite oder gar nicht.
 */
const KI = { anbieter: 'OpenAI', modell: 'gpt-5.5', am: '2026-09-28' }
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const deps = { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG, sidebar: async () => PNG }

describe('Herkunft', () => {
  it('liest die eingestellte Text-KI', () => {
    const k = aktuelleKi(DEFAULT_SETTINGS, new Date('2026-09-28T10:00:00Z'))
    expect(k).toEqual({ anbieter: 'OpenAI', modell: DEFAULT_SETTINGS.ai.textModels.openai, am: '2026-09-28' })
  })

  it('stempelt Arbeitsblätter (meta) und Vokabeltests (doc), übernimmt die Voreinstellung nur, wenn am Material nichts gewählt ist', () => {
    expect(stempleKi({ meta: { title: 'x' } }, KI, 'ueberall')).toEqual({ meta: { title: 'x', ki: KI, kiVermerk: 'ueberall' } })
    expect(stempleKi({ meta: { kiVermerk: 'aus' } }, KI, 'ueberall')).toEqual({ meta: { kiVermerk: 'aus', ki: KI } })
    expect(stempleKi({ vocab: [], doc: { header: {} } }, KI)).toEqual({ vocab: [], doc: { header: {}, ki: KI } })
    expect(stempleKi({ doc: null }, KI)).toEqual({ doc: null })
  })

  it('zeigt den Vermerk nach Wahl', () => {
    expect(vermerkSichtbar(undefined, 'ueberall', true)).toBe(false)
    expect(vermerkSichtbar(KI, undefined, false)).toBe(false)
    expect(vermerkSichtbar(KI, undefined, true)).toBe(true)
    expect(vermerkSichtbar(KI, 'ueberall', false)).toBe(true)
    expect(vermerkSichtbar(KI, 'aus', true)).toBe(false)
    expect(kiVermerkText(KI)).toBe('Mit KI-Unterstützung erstellt (OpenAI · gpt-5.5, 28.09.2026) und von der Lehrkraft bearbeitet.')
  })

  it('trägt die Herkunft über den HTML-Kopf ins PDF', () => {
    const tag = kiMetaTag({ ...KI, modell: 'a"b<c>' })
    expect(leseKiMeta(`<head>${tag}</head>`)).toEqual({ ...KI, modell: 'a"b<c>' })
    expect(leseKiMeta('<head></head>')).toBeNull()
  })
})

describe('Word und Druckfassung', () => {
  it('schreibt Beschreibung, Stichwörter und eigene Eigenschaften in die Word-Datei; Vermerk im Fuß des Lösungsteils', async () => {
    const ws = sampleWorksheet()
    ws.meta.ki = KI
    const zip = await JSZip.loadAsync(await buildWorksheetDocx(ws, { sheetIds: [ws.sheets[0].id], includeKey: true }, deps as never))
    const custom = (await zip.file('docProps/custom.xml')?.async('string')) ?? ''
    const core = (await zip.file('docProps/core.xml')?.async('string')) ?? ''
    expect(custom).toContain('KI-Anbieter')
    expect(custom).toContain('gpt-5.5')
    expect(core).toContain('KI-generiert')
    const fuesse = await Promise.all(
      Object.keys(zip.files)
        .filter((f) => /word\/footer\d+\.xml/.test(f))
        .map((f) => zip.file(f)!.async('string'))
    )
    expect(fuesse.some((f) => f.includes('Mit KI-Unterstützung erstellt'))).toBe(true)
  })

  it('ohne KI keine Kennzeichnung', async () => {
    const ws = sampleWorksheet()
    const zip = await JSZip.loadAsync(await buildWorksheetDocx(ws, { sheetIds: [ws.sheets[0].id], includeKey: true }, deps as never))
    expect((await zip.file('docProps/custom.xml')?.async('string')) ?? '').not.toContain('KI-Anbieter')
  })

  it('setzt die Herkunft in den Kopf der Druckfassung', () => {
    const ws = sampleWorksheet()
    ws.meta.ki = KI
    const html = buildWorksheetHtml(ws, new Map(), { sheetIds: [ws.sheets[0].id], includeKey: true }, null, '')
    expect(leseKiMeta(html)).toEqual(KI)
    expect(html).toContain('ws-ki-vermerk')
  })
})
