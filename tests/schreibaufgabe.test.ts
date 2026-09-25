import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { presetDesigns } from '../src/shared/design'
import { buildWorksheetDocx } from '../src/renderer/src/modules/arbeitsblatt/export/docx'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock, Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/*
 * Schreibaufgaben in den Fremdsprachen.
 *
 * Eine Schreibaufgabe besteht nicht nur aus dem Arbeitsauftrag. Sie situiert (wer schreibt
 * an wen, warum), gibt Inhaltspunkte vor und nennt den Umfang. Genau dafür trägt die
 * Aufgabe ein `brief`, und die Prüfungen der App verlangen, dass es ausgefüllt ist.
 *
 * Diese Tests halten fest, dass es auch AUF DEM BLATT ankommt. Ohne sie war es möglich,
 * dass die App Situation, Adressat und Inhaltspunkte erzeugt, prüft – und dann nicht
 * druckt. Für die Lehrkraft sähe das wie ein KI-Fehler aus („die Aufgabe ist unvollständig"),
 * obwohl die Angaben in der Datei stehen.
 */
const SITUATION = 'You took part in an international youth conference in Singapore.'
const ADRESSAT = 'your head teacher'
const TEXTSORTE = 'report'

export function schreibblatt(brief: TaskBlock['brief'], wordLimit = false): Worksheet {
  const meta = {
    ...defaultMeta('NI', 'integrierte-gesamtschule', 'Integrierte Gesamtschule'),
    subjectId: 'englisch',
    subjectLabel: 'Englisch',
    topic: 'Cities of the future',
    title: 'Writing: a report',
    grade: 10,
    wordLimit
  }
  const aufgabe: TaskBlock = {
    id: 't1',
    type: 'task',
    instruction: '**Write** a report about the conference.',
    operator: 'write',
    afbReason: '',
    socialForm: 'EA',
    answer: { ...emptyAnswer(), kind: 'lines', heightMm: 120 },
    parts: [],
    solution: '',
    points: 20,
    minutes: 45,
    skill: 'writing',
    brief
  }
  return {
    version: 1,
    meta,
    design: presetDesigns()[0],
    outline: null,
    sources: [],
    createdAt: '2026-09-23',
    sheets: [{ id: 'sheet-1', label: 'Arbeitsblatt', blocks: [aufgabe] }]
  }
}

const brief = (): TaskBlock['brief'] => ({
  situation: SITUATION,
  audience: ADRESSAT,
  textType: TEXTSORTE,
  purpose: 'help the school decide whether students should take part again',
  words: 275,
  points: ['what you did at the conference', 'what you learned from working with young people from different countries'],
  criteria: ['Inhalt vollständig', 'Textsorte eingehalten']
})

/** Der Text des erzeugten Word-Dokuments. */
async function docxText(ws: Worksheet, includeKey = false): Promise<string> {
  const data = await buildWorksheetDocx(
    ws,
    { sheetIds: ['sheet-1'], includeKey },
    { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG_1PX, sidebar: async () => PNG_1PX }
  )
  const zip = await JSZip.loadAsync(data)
  const xml = await zip.file('word/document.xml')!.async('string')
  return xml.replace(/<[^>]+>/g, '')
}

describe('Die Vorgaben einer Schreibaufgabe stehen auf dem Blatt', () => {
  it('druckt die Situation', async () => {
    const text = await docxText(schreibblatt(brief()))
    expect(text, 'Die Situation fehlt auf dem Blatt').toContain(SITUATION)
  })

  it('druckt Adressat und Textsorte', async () => {
    const text = await docxText(schreibblatt(brief()))
    expect(text).toContain(ADRESSAT)
    expect(text).toContain(TEXTSORTE)
  })

  it('druckt die Inhaltspunkte, die der Text abdecken muss', async () => {
    const text = await docxText(schreibblatt(brief()))
    for (const p of brief()!.points) expect(text, `Inhaltspunkt fehlt: ${p}`).toContain(p)
  })

  it('druckt den geforderten Umfang, wenn das Blatt ihn nennen soll', async () => {
    const text = await docxText(schreibblatt(brief(), true))
    expect(text).toMatch(/275 Wörter/)
  })

  it('schweigt über den Umfang, wenn das Blatt ihn nicht nennen soll', async () => {
    /*
     * Die Wortzahl an- und abzuschalten ist eine Einstellung des ganzen Blattes. Sie darf
     * nicht dadurch unterlaufen werden, dass die Angabe bei den Schreibvorgaben doch
     * auftaucht – nur an anderer Stelle als in der Arbeitsanweisung. `brief.words` dient
     * dann allein der Planung von Schreibraum und Erwartungshorizont.
     */
    const text = await docxText(schreibblatt(brief(), false))
    expect(text).not.toMatch(/275 Wörter/)
  })

  it('druckt die Bewertungskriterien NICHT auf dem Schülerblatt', async () => {
    // Die Kriterien gehören in den Erwartungshorizont, nicht in die Hand der Lernenden
    const text = await docxText(schreibblatt(brief()))
    expect(text).not.toContain('Inhalt vollständig')
  })

  it('druckt die Notizentabelle mit Stichpunkten und offenen Impulsen', async () => {
    const mitNotizen = brief()!
    mitNotizen.notes = [
      { title: 'The Conference', items: ['5 days', 'students from 12 countries'], prompts: ['Positives: …'] },
      { title: 'Experiencing Singapore', items: ['use public transport'], prompts: ['Surprises: …'] }
    ]
    const text = await docxText(schreibblatt(mitNotizen))
    for (const s of ['The Conference', '5 days', 'Experiencing Singapore', 'use public transport', 'Positives: …', 'Surprises: …']) {
      expect(text, `fehlt: ${s}`).toContain(s)
    }
  })

  it('druckt die Formvorgaben', async () => {
    const mitForm = brief()!
    mitForm.form = ['Überschrift und Zwischenüberschriften verwenden']
    const text = await docxText(schreibblatt(mitForm))
    expect(text).toContain('Überschrift und Zwischenüberschriften verwenden')
  })

  it('kommt ohne brief aus', async () => {
    // Fächer ohne Schreibaufgabe haben kein brief – das darf den Export nicht stören
    const text = await docxText(schreibblatt(undefined))
    expect(text).toContain('Write')
  })
})

describe('Der Erwartungshorizont steht auf dem Lösungsblatt – und nur dort', () => {
  const mitHorizont = (): TaskBlock['brief'] => ({
    ...brief()!,
    expected: [
      {
        aspect: 'describe what you did at the conference',
        criterion: 'nennt mindestens drei Programmpunkte und führt zwei davon aus',
        examples: ['workshops in English', 'group project „The city of the future"'],
        points: 6
      }
    ],
    model: 'Last month I took part in an international youth conference in Singapore.'
  })

  /** Der Text des Lösungsblatts. */
  const loesung = (ws: Worksheet): Promise<string> => docxText(ws, true)

  it('führt das übergeordnete Kriterium mit seiner Punktzahl', async () => {
    const text = await loesung(schreibblatt(mitHorizont()))
    expect(text).toContain('Erwartungshorizont')
    expect(text).toContain('nennt mindestens drei Programmpunkte')
    expect(text).toMatch(/6 P\./)
  })

  it('kennzeichnet die Beispiele als nicht verbindlich', async () => {
    /*
     * Ohne diesen Satz läse sich die Liste wie eine abschließende Aufzählung, und eine gute
     * eigene Idee der Lernenden bekäme keine Punkte. Die Formulierung folgt den amtlichen
     * Vorgaben zur ZP10 in Nordrhein-Westfalen.
     */
    const text = await loesung(schreibblatt(mitHorizont()))
    expect(text).toContain('nicht verbindlich')
    expect(text).toMatch(/Höchstpunktzahl des Aspekts wird dabei nicht überschritten/)
  })

  it('führt den Mustertext', async () => {
    const text = await loesung(schreibblatt(mitHorizont()))
    expect(text).toContain('Last month I took part in an international youth conference')
  })

  it('zeigt nichts davon auf dem Schülerblatt', async () => {
    const text = await docxText(schreibblatt(mitHorizont()))
    expect(text, 'Der Erwartungshorizont steht auf dem Schülerblatt').not.toContain('Erwartungshorizont')
    expect(text).not.toContain('nennt mindestens drei Programmpunkte')
    expect(text, 'Der Mustertext steht auf dem Schülerblatt').not.toContain('Last month I took part')
  })
})
