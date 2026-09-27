import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { bereichSetzen, leereThemen, materialSchluessel } from '../src/shared/themen'
import { presetDesigns } from '../src/shared/design'
import { isMaterial, materialNummern } from '../src/renderer/src/modules/arbeitsblatt/didactics/integrity'
import { istLehrerbaustein, markiereLoesungsbausteine } from '../src/renderer/src/modules/arbeitsblatt/didactics/loesungsteil'
import { buildWorksheetDocx } from '../src/renderer/src/modules/arbeitsblatt/export/docx'
import { convertOutline } from '../src/renderer/src/modules/arbeitsblatt/generation/convert'
import { buildSheetForTest, themenbereichVorgabe } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { operatorRules } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { worksheetStats } from '../src/renderer/src/modules/arbeitsblatt/library'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { InfoBoxBlock, Worksheet, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { useThemen } from '../src/renderer/src/shared/themenbereiche'
import { automatischEinsortieren, bereichZumUeberthema, einsortieren, type ThemenMaterial } from '../src/renderer/src/shared/themenVorschlag'

/*
 * Zwei Befunde der Lehrkraft vom 27.09.2026:
 * 1. Ein Arbeitsblatt trug einen „Erwartungshorizont für die Lehrkraft" als Baustein auf dem
 *    Schülerblatt – solche Bausteine gehören nur in den Lösungsteil.
 * 2. Neu erstellte Arbeitsblätter landeten nicht in ihrem Themenbereich – die Wortähnlichkeit
 *    zwischen „Die Julikrise 1914" und „Ursachen des Ersten Weltkriegs" reicht der Automatik
 *    nicht, und sie lief erst beim nächsten Besuch der Startseite.
 */

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const kasten = (title: string, body = 'Inhalt', variant: InfoBoxBlock['variant'] = 'wissen'): WsBlock => ({
  ...(newBlock('infoBox') as InfoBoxBlock),
  id: title.toLowerCase().replace(/\W+/g, '-'),
  title,
  body,
  variant
})

describe('Nur im Lösungsteil', () => {
  it('erkennt Bausteine, die an die Lehrkraft gerichtet sind', () => {
    expect(istLehrerbaustein(kasten('Erwartungshorizont'))).toBe(true)
    expect(istLehrerbaustein(kasten('Erwartungshorizont für die Lehrkraft'))).toBe(true)
    expect(istLehrerbaustein(kasten('Hinweise für Lehrkräfte'))).toBe(true)
    expect(istLehrerbaustein(kasten('Bewertungsraster'))).toBe(true)
    expect(istLehrerbaustein(kasten('Merke', 'Erwartungshorizont: Die Schüler nennen …'))).toBe(true)
    expect(istLehrerbaustein(kasten('Merkkasten: Von der Krise zum Krieg'))).toBe(false)
    expect(istLehrerbaustein(kasten('Zum Text'))).toBe(false)
    // Aufgaben tragen ihre Lösung ohnehin nur im Lösungsteil
    expect(istLehrerbaustein({ ...(newBlock('task') as WsBlock), id: 't', instruction: 'Erwartungshorizont nennen' } as WsBlock)).toBe(false)
  })

  it('kennzeichnet sie einmal – und lässt eine Entscheidung der Lehrkraft stehen', () => {
    const blocks = [kasten('Zum Text'), kasten('Erwartungshorizont'), { ...kasten('Lösungshinweise'), nurLoesung: false }]
    const neu = markiereLoesungsbausteine(blocks)
    expect(neu[0]).toBe(blocks[0])
    expect(neu[1].nurLoesung).toBe(true)
    expect(neu[1].warnings?.[0]).toContain('Nur im Lösungsteil')
    // Ausdrücklich „auf dem Blatt" (false) bleibt so
    expect(neu[2].nurLoesung).toBe(false)
    expect(markiereLoesungsbausteine(neu)).toBe(neu)
  })

  it('geschieht schon bei der Umwandlung der KI-Antwort', () => {
    const s = buildSheetForTest({
      blocks: [
        { type: 'infoBox', variant: 'wissen', title: 'Zum Text', body: 'x' },
        { type: 'infoBox', variant: 'wissen', title: 'Erwartungshorizont für die Lehrkraft', body: 'Die Antworten nennen …' }
      ]
    })
    expect(s.blocks[0].nurLoesung).toBeUndefined()
    expect(s.blocks[1].nurLoesung).toBe(true)
  })

  it('zählt nicht als Material und fehlt im Word-Schülerblatt, steht aber auf den Lösungen', async () => {
    const text: WsBlock = { ...(newBlock('text') as WsBlock), id: 'q', title: 'Rede', body: 'Seit der Reichsgründung …' } as WsBlock
    const eh: WsBlock = { ...(newBlock('text') as WsBlock), id: 'eh', title: 'Erwartungshorizont', body: 'Zu erwarten ist …', nurLoesung: true } as WsBlock
    expect(isMaterial(eh)).toBe(false)
    expect([...materialNummern([text, eh]).keys()]).toEqual(['q'])
    const ws: Worksheet = {
      version: 1,
      meta: { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'geschichte', subjectLabel: 'Geschichte', topic: 'Julikrise', title: 'Julikrise' },
      design: presetDesigns()[0],
      outline: null,
      sources: [],
      createdAt: '',
      sheets: [{ id: 's1', label: 'Arbeitsblatt', blocks: [text, eh] }]
    }
    const deps = { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG, sidebar: async () => PNG }
    const xml = async (includeKey: boolean, keyOnly = false): Promise<string> => {
      const zip = await JSZip.loadAsync(await buildWorksheetDocx(ws, { sheetIds: ['s1'], includeKey, keyOnly }, deps))
      return zip.file('word/document.xml')!.async('string')
    }
    expect(await xml(false)).not.toContain('Zu erwarten ist')
    expect(await xml(true, true)).toContain('Zu erwarten ist')
  })

  it('der Auftrag verbietet Erwartungshorizonte als Baustein', () => {
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'geschichte', subjectLabel: 'Geschichte', grade: 9 }
    expect(operatorRules(meta)).toContain('NIE als Baustein auf dem Blatt')
  })
})

describe('Themenbereich über das Überthema', () => {
  const mat = (id: string, thema: string, ueberthema?: string): ThemenMaterial => ({
    moduleId: 'arbeitsblatt',
    id,
    name: thema,
    thema,
    fachId: 'geschichte',
    updatedAt: '2026-09-27T10:00:00.000Z',
    ...(ueberthema ? { ueberthema } : {})
  })
  const daten = () => bereichSetzen(leereThemen(), { id: 'bereich-1', fachId: 'geschichte', name: 'Ursachen des Ersten Weltkriegs' })

  it('findet den Bereich beim Namen – auch als letzter Teil eines Pfads, unabhängig von Groß- und Kleinschreibung', () => {
    const d = daten()
    expect(bereichZumUeberthema(mat('a', 'Julikrise', 'ursachen des ersten weltkriegs'), d.bereiche)?.id).toBe('bereich-1')
    expect(bereichZumUeberthema(mat('a', 'Julikrise', 'Geschichte › Ursachen des Ersten Weltkriegs'), d.bereiche)?.id).toBe('bereich-1')
    expect(bereichZumUeberthema(mat('a', 'Julikrise', 'Imperialismus'), d.bereiche)).toBeNull()
    expect(bereichZumUeberthema(mat('a', 'Julikrise'), d.bereiche)).toBeNull()
  })

  it('ordnet ein neues Blatt sofort zu, wo die Wortähnlichkeit versagt', () => {
    const d = daten()
    const blatt = mat('neu', 'Die Julikrise 1914 – Die Kriegsschuldfrage', 'Ursachen des Ersten Weltkriegs')
    const ohne = mat('ohne', 'Die Julikrise 1914 – Die Kriegsschuldfrage')
    const r = automatischEinsortieren([blatt, ohne], d, () => [])
    expect(r.zuordnungen[materialSchluessel('arbeitsblatt', 'neu')]).toMatchObject({ bereichId: 'bereich-1', von: 'auto' })
    // Ohne Überthema bleibt es beim alten Verhalten: kein Treffer, kein Ordner
    expect(r.zuordnungen[materialSchluessel('arbeitsblatt', 'ohne')]).toBeUndefined()
    expect(einsortieren([blatt], d)[materialSchluessel('arbeitsblatt', 'neu')]?.bereichId).toBe('bereich-1')
  })

  it('legt für ein neues Überthema den Bereich an – schon mit einem Material', () => {
    const r = automatischEinsortieren([mat('x', 'Das Attentat von Sarajevo', 'Der Erste Weltkrieg')], daten(), () => [])
    expect(r.uebernahmen).toHaveLength(1)
    expect(r.uebernahmen[0]).toMatchObject({ fachId: 'geschichte', name: 'Der Erste Weltkrieg', schluessel: [materialSchluessel('arbeitsblatt', 'x')] })
    // Von Hand Zugeordnetes bleibt unangetastet
    const d = { ...daten(), zuordnungen: { [materialSchluessel('arbeitsblatt', 'x')]: { bereichId: null, von: 'hand' as const, am: '2026' } } }
    expect(automatischEinsortieren([mat('x', 'Sarajevo', 'Der Erste Weltkrieg')], d, () => []).uebernahmen).toHaveLength(0)
  })

  it('die Planung liefert das Überthema, das Blatt trägt es, die Bibliothek gibt es weiter', () => {
    expect(convertOutline({ title: 'T', items: [], ueberthema: ' Ursachen des Ersten Weltkriegs ' }).ueberthema).toBe('Ursachen des Ersten Weltkriegs')
    expect(convertOutline({ title: 'T', items: [] }).ueberthema).toBeUndefined()
    const ws = {
      version: 1 as const,
      meta: {
        ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
        subjectId: 'geschichte',
        subjectLabel: 'Geschichte',
        topic: 'Julikrise',
        title: 'Julikrise',
        ueberthema: 'Ursachen des Ersten Weltkriegs'
      },
      design: presetDesigns()[0],
      outline: null,
      sources: [],
      createdAt: '',
      sheets: []
    }
    expect(worksheetStats(ws as never).ueberthema).toBe('Ursachen des Ersten Weltkriegs')
    expect(worksheetStats({ ...ws, meta: { ...ws.meta, ueberthemaAus: true } } as never).ueberthema).toBeUndefined()
  })

  it('der Planungsauftrag nennt die vorhandenen Bereiche des Fachs im Wortlaut', () => {
    useThemen.setState({ daten: daten(), geladen: true })
    expect(themenbereichVorgabe('geschichte')).toContain('VORHANDENE THEMENBEREICHE DES FACHS: Ursachen des Ersten Weltkriegs')
    expect(themenbereichVorgabe('biologie')).toContain('ÜBERTHEMA')
    useThemen.setState({ daten: leereThemen(), geladen: false })
  })
})
