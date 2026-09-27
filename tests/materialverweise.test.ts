import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import {
  checkIntegrity,
  loeseMaterialverweise,
  materialNummern,
  verschluesseleBaustein,
  verschluesseleMaterialverweise
} from '../src/renderer/src/modules/arbeitsblatt/didactics/integrity'
import { standardBildbreite } from '../src/renderer/src/modules/arbeitsblatt/didactics/imageDesign'
import { buildSheetForTest } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { contextRules, operatorRules, originalMaterialVorgabe, scaffoldRules, systemPrompt } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import {
  completeWorksheetImages,
  mindestanforderung,
  needsRealMaterial,
  worksheetImagePrompt
} from '../src/renderer/src/modules/arbeitsblatt/generation/worksheetImages'
import { setzeMaterialEin } from '../src/renderer/src/modules/arbeitsblatt/generation/originalmaterial'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { ImageBlock, Sheet, TaskBlock, TextBlock, Worksheet, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { contextFor, profileFromMeta, zurAnzeige } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { presetDesigns } from '../src/shared/design'
import type { ImageServices } from '../src/renderer/src/shared/imageChoice'

/**
 * Wache für die Befunde vom Blatt „Die Julikrise 1914" (27.09.2026):
 * 1. Aufgaben verwiesen auf „Rede M2" und „Zeitleiste M1", das Blatt zeigte die Rede als M1
 *    und die Zeitleiste ohne Nummer – die KI hatte selbst gezählt, die App anders.
 * 2. Eine KI-gezeichnete Zeitleiste stand mit 60 % Breite und unlesbarer Schrift auf dem Blatt.
 * 3. Die Europakarte blieb leer, weil die Beschreibung Zusätze verlangte, die keine Archivkarte hat.
 * 4. Im Wortspeicher standen **Sternchen**, und niemand sah, zu welcher Aufgabe er gehört.
 */

const text = (id: string, ref?: string): TextBlock => ({ ...(newBlock('text') as TextBlock), id, title: id, body: 'Text', ...(ref ? { ref } : {}) })
const bild = (id: string, ref?: string): ImageBlock => ({
  id,
  type: 'image',
  description: 'Zeitleiste',
  caption: 'Zeitleiste',
  widthPercent: 100,
  ...(ref ? { ref } : {})
})
const aufgabe = (id: string, instruction: string, teil?: string): TaskBlock => ({
  ...(newBlock('task') as TaskBlock),
  id,
  instruction,
  parts: teil ? [{ id: `${id}-a`, instruction: teil, answer: { kind: 'none' as const, count: 0 } } as never] : []
})

describe('Materialverweise über Kennungen', () => {
  it('ersetzt M{kennung} überall durch die Nummer, die die App vergibt', () => {
    const blocks: WsBlock[] = [
      text('rede', 'quelle'),
      text('einstieg'),
      bild('zeit', 'zeitleiste'),
      aufgabe('a1', '**Erkläre** anhand der Zeitleiste M{zeitleiste}, wie …', 'Vergleiche mit M{quelle}.'),
      { ...(newBlock('table') as WsBlock), id: 't', title: 'Strategien', headers: ['Strategie', 'Abgleich mit M{zeitleiste}'], rows: [['a', 'b']] } as WsBlock,
      { ...(newBlock('scaffold') as WsBlock), id: 's', variant: 'tipp', title: 'Tipp', items: ['Nutze M{quelle}, Z. 4–7.'] } as WsBlock
    ]
    const neu = loeseMaterialverweise(blocks)
    const nummern = materialNummern(blocks)
    expect(nummern.get('rede')).toBe('M1')
    expect(nummern.get('einstieg')).toBe('M2')
    expect(nummern.get('zeit')).toBe('M3')
    const a1 = neu[3] as TaskBlock
    expect(a1.instruction).toBe('**Erkläre** anhand der Zeitleiste M3, wie …')
    expect(a1.parts[0].instruction).toBe('Vergleiche mit M1.')
    expect((neu[4] as never as { headers: string[] }).headers[1]).toBe('Abgleich mit M3')
    expect((neu[5] as never as { items: string[] }).items[0]).toBe('Nutze M1, Z. 4–7.')
    // Bausteine ohne Verweis bleiben dasselbe Objekt; Kennung und Kennzeichnung bleiben stehen
    expect(neu[0]).toBe(blocks[0])
    expect(neu[2]).toBe(blocks[2])
    expect((neu[4] as never as { ref?: string; id: string }).id).toBe('t')
  })

  it('lässt unbekannte Kennungen stehen und meldet sie in der Vollständigkeitsprüfung', () => {
    const blocks: WsBlock[] = [text('rede', 'quelle'), aufgabe('a1', 'Beurteile mithilfe von M{quelle} und M{karte} …')]
    const neu = loeseMaterialverweise(blocks)
    expect((neu[1] as TaskBlock).instruction).toBe('Beurteile mithilfe von M1 und M{karte} …')
    const sheet: Sheet = { id: 's', label: 'Arbeitsblatt', blocks: neu }
    const befunde = checkIntegrity(sheet)
    expect(befunde.some((f) => f.blockId === 'a1' && f.message.includes('M{karte}') && f.message.includes('Kennung'))).toBe(true)
    // Ohne Kennungen ändert sich nichts (ältere Blätter, andere Modelle)
    const alt: WsBlock[] = [text('x'), aufgabe('a', 'Nenne anhand von M1 …')]
    expect(loeseMaterialverweise(alt)).toBe(alt)
  })

  it('zählt bei der Klassenarbeit über alle Teile (dokument) und nicht nur über den eigenen Teil', () => {
    const teil1: WsBlock[] = [text('q1', 'quelle'), aufgabe('a1', 'Fasse M{quelle} zusammen.')]
    const teil2: WsBlock[] = [bild('k', 'karte'), aufgabe('a2', 'Ordne M{karte} und M{quelle} …')]
    const neu = loeseMaterialverweise(teil2, [...teil1, ...teil2])
    expect((neu[1] as TaskBlock).instruction).toBe('Ordne M2 und M1 …')
  })

  it('übernimmt die Kennung aus der KI-Antwort nur bei Material – bereinigt – und setzt „quelle" am Ausgangstext', () => {
    const s = buildSheetForTest({
      blocks: [
        {
          type: 'image',
          ref: ' Zeit Leiste! ',
          title: 'Zeitleiste',
          imageDescription: 'Zeitleiste der Julikrise',
          imageFunction: 'organisation',
          imageRole: 'material'
        },
        { type: 'task', ref: 'aufgabe', instruction: 'Erkläre anhand von M{zeit-leiste} …' },
        { type: 'infoBox', ref: 'kasten', variant: 'wissen', title: 'Einstieg', body: 'Erinnere dich …' }
      ]
    })
    const [img, task, box] = s.blocks
    expect(img.ref).toBe('zeit-leiste')
    expect(task.ref).toBeUndefined()
    expect(box.ref).toBeUndefined()
    // Erst nach dem Einsetzen des Ausgangstextes werden die Verweise aufgelöst (generate.ts, mitMaterial)
    const material = {
      titel: 'Rede',
      urheber: 'Wilhelm II.',
      url: '',
      text: 'Seit der Reichsgründung …',
      quellenangabe: 'DHM',
      hinweis: '',
      protokoll: [],
      wortlautGeprueft: true
    }
    const mit = setzeMaterialEin(s, material, { subjectId: 'geschichte' }, () => 'neu')
    const quelle = mit.blocks.find((b) => b.type === 'text')
    expect(quelle?.ref).toBe('quelle')
    const aufgeloest = loeseMaterialverweise(mit.blocks)
    // Ausgangstext hinter den Lernzielen = M1, die Zeitleiste danach = M2
    expect((aufgeloest.find((b) => b.type === 'task') as TaskBlock).instruction).toBe('Erkläre anhand von M2 …')
  })

  it('erklärt der KI Kennungen, den Platz des Ausgangstextes und den Einstieg – in allen Erzeugungswegen', () => {
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'geschichte', subjectLabel: 'Geschichte', grade: 9 }
    const regeln = operatorRules(meta)
    expect(regeln).toContain('M{zeitleiste}')
    expect(regeln).toContain('M{quelle}')
    expect(regeln).toMatch(/Einstiegsimpuls/)
    expect(regeln).not.toMatch(/höchstens M2/)
    // Fremdsprachen (Kontextbindung): derselbe Weg
    expect(contextRules({ ...meta, subjectId: 'englisch', subjectLabel: 'Englisch' })).toContain('M{text}')
    const vorgabe = originalMaterialVorgabe({
      titel: 'Rede',
      urheber: '',
      url: '',
      text: 'x',
      quellenangabe: 'q',
      hinweis: '',
      protokoll: [],
      wortlautGeprueft: true
    })
    expect(vorgabe).toContain('M{quelle}')
    expect(vorgabe).toContain('ERSTES Material')
    expect(systemPrompt(meta, profileFromMeta(meta))).toContain('M{')
  })
})

describe('Bilder: Breite, Auflösung, echtes Material', () => {
  it('gibt ordnenden Bildern die ganze Breite, Fotos weniger, Schmuck wenig', () => {
    expect(standardBildbreite('organisation', 'material')).toBe(100)
    expect(standardBildbreite('repraesentation', 'material')).toBe(80)
    expect(standardBildbreite('repraesentation', 'illustration')).toBe(45)
    expect(standardBildbreite('schmuck', 'material')).toBe(35)
    expect(standardBildbreite('repraesentation', 'motivation')).toBe(35)
    expect(standardBildbreite('organisation', 'material', 'right')).toBe(45)
    // Und so kommt es aus der KI-Antwort auf das Blatt
    const s = buildSheetForTest({
      blocks: [
        { type: 'image', title: 'Zeitleiste', imageDescription: 'Zeitleiste', imageFunction: 'organisation', imageRole: 'material' },
        { type: 'image', title: 'Fuchs', imageDescription: 'Ein Rotfuchs', imageFunction: 'repraesentation', imageRole: 'material' }
      ]
    })
    expect((s.blocks[0] as ImageBlock).widthPercent).toBe(100)
    expect((s.blocks[1] as ImageBlock).widthPercent).toBe(80)
  })

  it('Zeitleisten und Ereignisfolgen sind echtes Material – kein KI-Bild mit erfundener Schrift', () => {
    expect(needsRealMaterial({ caption: 'Zeitleiste der Julikrise vom 28. Juni bis 4. August 1914', description: 'Breite Zeitachse mit Ereigniskarten' })).toBe(
      true
    )
    expect(needsRealMaterial({ caption: 'Bündnisse 1914', description: 'Schematische Europakarte' })).toBe(true)
    expect(needsRealMaterial({ caption: 'Rotfuchs', description: 'Ein Rotfuchs auf einer Wiese' })).toBe(false)
    const prompt = worksheetImagePrompt(
      { id: 'i', type: 'image', description: 'Ein Rotfuchs', caption: '', widthPercent: 80 },
      { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectLabel: 'Biologie', grade: 5, topic: 'Wald' }
    )
    expect(prompt).toMatch(/no text, no labels, no letters, no numbers and no dates/i)
    expect(prompt).not.toMatch(/unless/)
  })

  it('der Auftrag verlangt Zeitleisten als Tabelle und Karten als Mindestanforderung', () => {
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'geschichte', subjectLabel: 'Geschichte', grade: 9 }
    const prompt = systemPrompt(meta, profileFromMeta(meta))
    expect(prompt).toContain('MINDESTANFORDERUNG')
    expect(prompt).toMatch(/Zeitleisten und Chronologien: als Bild anfordern/)
  })
})

describe('Karte: zweiter Durchgang mit Mindestanforderung', () => {
  const hit = (id: string, title: string) => ({
    id,
    title,
    thumbnail: `https://t/${id}`,
    url: `https://u/${id}`,
    creator: 'Autor',
    license: 'CC0',
    source: 'wikimedia' as const
  })
  const services: ImageServices = {
    searchOpenMoji: async () => [],
    openMojiPng: async (hex) => `data:image/png;base64,${hex}`,
    search: async (q) => [hit(`${q}-1`, `Map of Europe 1914 alliances`), hit(`${q}-2`, `Europe 1914`)],
    fetchImage: async (url) => `data:image/jpeg;base64,${url}`,
    normalize: async (d) => d
  }
  /** Prüfer, der die Wunschliste ablehnt (fehlende Pfeile) und die Mindestanforderung annimmt */
  const pruefer =
    (calls: StructuredRequest[]) =>
    async <T>(req: StructuredRequest): Promise<T> => {
      calls.push(req)
      const entries = [...req.user.matchAll(/- id="([^"]+)": (.*)\n {2}Kandidaten: (.*)/g)]
      return {
        choices: entries.map(([, id, subject]) =>
          subject.includes('Mindestanforderung')
            ? { id, image: 1, fit: 'brauchbar', reason: 'zeigt die Bündnisse, ohne datierte Pfeile' }
            : { id, image: 0, fit: 'ungeeignet', reason: 'Die Karten zeigen keine datierten Mobilmachungspfeile' }
        )
      } as T
    }

  it('nimmt die Karte, die das Kernmotiv zeigt, statt die Stelle leer zu lassen – und erzeugt keine Karte', async () => {
    const calls: StructuredRequest[] = []
    const generated: string[] = []
    const karte: ImageBlock = {
      id: 'k',
      type: 'image',
      description: 'Schematische Europakarte für 1914 mit Richtungspfeilen und Datumsangaben der Kriegserklärungen',
      caption: 'Bündnisse und militärische Schritte in Europa 1914',
      widthPercent: 100,
      search: 'Europe alliances 1914 map',
      role: 'material',
      fn: 'organisation'
    }
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'geschichte', subjectLabel: 'Geschichte', topic: 'Julikrise', grade: 9 }
    const stats = await completeWorksheetImages([karte], meta, {
      ai: pruefer(calls),
      services,
      generateImage: async (p) => (generated.push(p), 'data:image/png;base64,KI'),
      variants: (q) => [q]
    })
    expect(calls).toHaveLength(2)
    expect(calls[1].user).toContain('Mindestanforderung')
    expect(karte.image?.source).toBe('wikimedia')
    expect(karte.warnings?.[0]).toContain('Kernmotiv')
    expect(generated).toHaveLength(0)
    expect(stats.web).toBe(1)
    expect(mindestanforderung(karte)).toContain('„Bündnisse und militärische Schritte in Europa 1914“')
  })
})

describe('Wortspeicher gehört zu einer Aufgabe', () => {
  it('der Auftrag verlangt Aufgabenbezug und Hinweistext', () => {
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'geschichte', subjectLabel: 'Geschichte', grade: 9 }
    expect(scaffoldRules(meta)).toMatch(/DIREKT hinter dieser Aufgabe/)
    expect(scaffoldRules(meta)).toContain('Für Aufgabe 2')
  })
})

// ---------- Dynamische Nummern (27.09.2026, zweite Rückmeldung der Lehrkraft):
// „Wenn man M2 nach oben verschiebt und es vor M1 landet, soll M2 das neue M1 und das vorherige
// M1 das neue M2 werden" – und die Aufgaben müssen die Nummer automatisch mit anpassen.

describe('Nummern folgen der Reihenfolge – auch in den Aufgaben', () => {
  const rede = (): TextBlock => text('rede', 'quelle')
  const zeit = (): ImageBlock => bild('zeit', 'zeitleiste')
  const frage = (): TaskBlock => aufgabe('a1', 'Vergleiche die Rede M{quelle} mit der Zeitleiste M{zeitleiste}.')

  it('nach dem Verschieben zeigt das Blatt die neuen Nummern in Badge UND Aufgabe', () => {
    const vorher: WsBlock[] = [rede(), zeit(), frage()]
    expect(materialNummern(vorher).get('rede')).toBe('M1')
    expect((loeseMaterialverweise(vorher)[2] as TaskBlock).instruction).toBe('Vergleiche die Rede M1 mit der Zeitleiste M2.')
    // Die Zeitleiste rutscht vor die Rede – gespeichert ändert sich an der Aufgabe NICHTS
    const nachher: WsBlock[] = [zeit(), rede(), frage()]
    expect(materialNummern(nachher).get('zeit')).toBe('M1')
    expect((loeseMaterialverweise(nachher)[2] as TaskBlock).instruction).toBe('Vergleiche die Rede M2 mit der Zeitleiste M1.')
  })

  it('Material ohne KI-Kennung ist über seine Bausteinkennung erreichbar – auch von Hand eingefügtes', () => {
    const blocks: WsBlock[] = [text('t-neu'), aufgabe('a', 'Lies M{t-neu}.')]
    expect((loeseMaterialverweise(blocks)[1] as TaskBlock).instruction).toBe('Lies M1.')
  })

  it('beim Speichern wird eine getippte Nummer zur Kennung des Materials, das jetzt so heißt', () => {
    const blocks: WsBlock[] = [rede(), zeit(), aufgabe('a1', 'Fasse die Rede M2 zusammen; M7 gibt es nicht.', 'Nutze M1, Z. 3.')]
    const gespeichert = verschluesseleMaterialverweise(blocks)
    expect((gespeichert[2] as TaskBlock).instruction).toBe('Fasse die Rede M{zeitleiste} zusammen; M7 gibt es nicht.')
    expect((gespeichert[2] as TaskBlock).parts[0].instruction).toBe('Nutze M{quelle}, Z. 3.')
    // Bausteine ohne Nummern bleiben dasselbe Objekt
    expect(gespeichert[0]).toBe(blocks[0])
    // Hin und zurück ändert nichts
    expect((loeseMaterialverweise(gespeichert)[2] as TaskBlock).instruction).toBe('Fasse die Rede M2 zusammen; M7 gibt es nicht.')
    // An Ort und Stelle (Entwurf im Editor)
    const draft = aufgabe('d', 'Siehe M1 und M2.')
    verschluesseleBaustein(draft, blocks)
    expect(draft.instruction).toBe('Siehe M{quelle} und M{zeitleiste}.')
  })

  it('die Anzeige des Blattes ist aufgelöst, das gespeicherte Blatt bleibt verschlüsselt', () => {
    const sheet: Sheet = { id: 's', label: 'Arbeitsblatt', blocks: [rede(), zeit(), frage()] }
    const anzeige = zurAnzeige(sheet)
    expect((anzeige.blocks[2] as TaskBlock).instruction).toBe('Vergleiche die Rede M1 mit der Zeitleiste M2.')
    expect((sheet.blocks[2] as TaskBlock).instruction).toContain('M{quelle}')
    // Einmal je Blattobjekt; ohne Verweise dasselbe Objekt
    expect(zurAnzeige(sheet)).toBe(anzeige)
    const ohne: Sheet = { id: 'o', label: 'Arbeitsblatt', blocks: [rede(), aufgabe('a', 'Nenne drei Dinge.')] }
    expect(zurAnzeige(ohne)).toBe(ohne)
  })

  it('der Editor verschlüsselt Eingaben beim Speichern (contextFor umhüllt update)', () => {
    const sheet: Sheet = { id: 's', label: 'Arbeitsblatt', blocks: [rede(), zeit(), aufgabe('a1', 'Alt.')] }
    const ws: Worksheet = {
      version: 1,
      meta: { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'geschichte', subjectLabel: 'Geschichte', topic: 'Julikrise', title: 'Julikrise' },
      design: presetDesigns()[0],
      outline: null,
      sources: [],
      createdAt: '',
      sheets: [sheet]
    }
    const ctx = contextFor(ws, sheet, 'edit', {
      update: (blockId, fn) => {
        const b = sheet.blocks.find((x) => x.id === blockId)
        if (b) fn(b)
      }
    })
    ctx.update!('a1', (d) => ((d as TaskBlock).instruction = 'Fasse die Rede M1 zusammen und vergleiche mit M2.'))
    expect((sheet.blocks[2] as TaskBlock).instruction).toBe('Fasse die Rede M{quelle} zusammen und vergleiche mit M{zeitleiste}.')
    expect((zurAnzeige({ ...sheet }).blocks[2] as TaskBlock).instruction).toBe('Fasse die Rede M1 zusammen und vergleiche mit M2.')
  })

  it('die Vollständigkeitsprüfung liest die Nummern wie auf dem Blatt', () => {
    const sheet: Sheet = { id: 's', label: 'Arbeitsblatt', blocks: [rede(), zeit(), frage()] }
    expect(checkIntegrity(sheet).filter((f) => f.message.includes('verweist'))).toEqual([])
  })
})
