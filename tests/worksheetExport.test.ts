import { writeFileSync } from 'fs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { presetDesigns } from '../src/shared/design'
import { buildWorksheetDocx } from '../src/renderer/src/modules/arbeitsblatt/export/docx'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { Answer, Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { parseWorksheetFile, serializeWorksheet } from '../src/renderer/src/modules/arbeitsblatt/project'

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const para = (n: number): string =>
  `Absatz ${n}: Pflanzen nehmen über die Wurzeln Wasser auf und über die Spaltöffnungen der Blätter Kohlenstoffdioxid. Mit Hilfe des Sonnenlichts entsteht im Blattgrün daraus Traubenzucker. Dabei wird Sauerstoff frei, den Menschen und Tiere zum Atmen brauchen. Die Pflanze nutzt den Zucker als Energiequelle und als Baustoff.`

export function sampleWorksheet(): Worksheet {
  const design = presetDesigns()[2] // Seitenleiste
  const meta = {
    ...defaultMeta('NI', 'integrierte-gesamtschule', 'Integrierte Gesamtschule'),
    subjectId: 'biologie',
    subjectLabel: 'Biologie',
    topic: 'Fotosynthese',
    title: 'Wie Pflanzen Energie gewinnen',
    grade: 7,
    sheetNumber: '4',
    differentiation: { levels: 3 as const, mode: 'combined' as const }
  }
  return {
    version: 1,
    meta,
    design: { ...design, header: { ...design.header, showSheetNumber: true } },
    outline: null,
    sources: [],
    createdAt: '2026-09-16',
    sheets: [
      {
        id: 'sheet-1',
        label: 'Arbeitsblatt',
        blocks: [
          {
            id: 'b1',
            type: 'learningGoals',
            title: 'Das lernst du',
            goals: ['Ich kann die Fotosynthese mit einer Wortgleichung beschreiben.', 'Ich kann erklären, warum Pflanzen Licht brauchen.']
          },
          {
            id: 'b2',
            type: 'text',
            title: 'M1 Die Fotosynthese',
            body: [1, 2, 3, 4, 5, 6, 7, 8].map(para).join('\n\n'),
            lineNumbers: true,
            source: 'eigener Text',
            glossary: [{ term: 'Spaltöffnung', explanation: 'kleine Öffnung an der Blattunterseite' }]
          },
          {
            id: 'b3',
            type: 'infoBox',
            variant: 'merke',
            title: 'Merke',
            body: 'Fotosynthese als Gleichung:\n\n$$\\ce{6CO2 + 6H2O ->[Licht] C6H12O6 + 6O2}$$\n\nDie Energie des Lichts wird in **Traubenzucker** gespeichert.'
          },
          {
            id: 'b4',
            type: 'task',
            instruction: '**Nenne** die Stoffe, die eine Pflanze für die Fotosynthese braucht.',
            operator: 'nennen',
            afb: 'I',
            afbReason: 'Wiedergabe aus M1',
            socialForm: 'EA',
            answer: { ...emptyAnswer('lines'), count: 2 },
            parts: [],
            solution: 'Wasser, Kohlenstoffdioxid, Licht',
            points: 2,
            minutes: 5
          },
          {
            id: 'b5',
            type: 'task',
            instruction: '**Ergänze** den Lückentext.',
            operator: 'ergänzen',
            afb: 'I',
            afbReason: '',
            socialForm: 'PA',
            answer: {
              ...emptyAnswer('gapText'),
              gapText: 'Pflanzen nehmen [[Wasser]] über die Wurzeln auf. Aus Licht entsteht $x = \\frac{a}{b}$ und [[Traubenzucker]].'
            },
            parts: [],
            solution: '',
            points: 2,
            minutes: 5
          },
          {
            id: 'b6',
            type: 'task',
            stars: 2,
            instruction: '**Ordne** zu und **kreuze an**.',
            operator: 'zuordnen',
            afb: 'II',
            afbReason: '',
            socialForm: 'EA',
            answer: emptyAnswer('none'),
            parts: [
              {
                id: 'p1',
                instruction: 'Ordne die Begriffe zu.',
                answer: { ...emptyAnswer('matching'), left: ['Chlorophyll', 'Spaltöffnung'], right: ['Blattgrün', 'Gasaustausch', 'Wurzel'], pairs: [0, 1] },
                solution: ''
              },
              {
                id: 'p2',
                instruction: 'Was entsteht?',
                answer: { ...emptyAnswer('multipleChoice'), options: ['Sauerstoff', 'Stickstoff', 'Traubenzucker'], correct: [0, 2] },
                solution: ''
              },
              {
                id: 'p3',
                instruction: 'Richtig oder falsch?',
                answer: {
                  ...emptyAnswer('trueFalse'),
                  statements: [
                    { text: 'Pflanzen brauchen Licht.', isTrue: true },
                    { text: 'Nachts bilden Pflanzen Zucker.', isTrue: false }
                  ]
                },
                solution: ''
              },
              {
                id: 'p4',
                instruction: 'Bringe in die richtige Reihenfolge.',
                answer: {
                  ...emptyAnswer('ordering'),
                  items: ['Licht trifft auf das Blatt', 'Zucker entsteht', 'Zucker wird gespeichert'],
                  displayOrder: [2, 0, 1]
                },
                solution: ''
              }
            ],
            solution: 'siehe Teilaufgaben',
            points: 6,
            minutes: 10
          },
          {
            id: 'b7',
            type: 'task',
            stars: 3,
            instruction: '**Beurteile**, ob Zimmerpflanzen die Luft im Klassenraum verbessern.',
            operator: 'beurteilen',
            afb: 'III',
            afbReason: 'eigenes Urteil',
            socialForm: 'GA',
            answer: {
              ...emptyAnswer('tableFill'),
              headers: ['Argument', 'dafür/dagegen'],
              rows: [
                ['Sauerstoff', ''],
                ['', 'dagegen']
              ],
              solutionRows: [
                ['', 'dafür'],
                ['geringe Menge', '']
              ]
            },
            parts: [],
            solution: 'Nur geringe Wirkung.',
            points: 4,
            minutes: 15
          },
          { id: 'b8', type: 'scaffold', variant: 'wortspeicher', title: 'Wortspeicher', items: ['das Blattgrün', 'der Traubenzucker', 'der Sauerstoff'] },
          {
            id: 'b9',
            type: 'scaffold',
            variant: 'hilfekarten',
            title: 'Hilfekarten zu Aufgabe 4',
            items: ['Lies die Aufgabe noch einmal.', 'Denke an M1.', 'Sauerstoff entsteht.', 'Beispiel: Ich finde …']
          },
          {
            id: 'b10',
            type: 'table',
            title: 'Tabelle',
            headers: ['Stoff', 'Herkunft'],
            rows: [
              ['Wasser', 'Boden'],
              ['CO$_2$', 'Luft']
            ]
          },
          {
            id: 'b11',
            type: 'image',
            description: 'Blatt mit Pfeilen',
            caption: 'Abb. 1',
            widthPercent: 40,
            image: { dataUrl: PNG_1PX, source: 'own', credit: 'eigene Zeichnung' }
          },
          { id: 'b12', type: 'workspace', kind: 'grid', heightMm: 20, label: 'Rechne hier:' },
          { id: 'b13', type: 'selfCheck', title: 'Das kann ich jetzt', statements: ['Ich kann die Wortgleichung aufschreiben.'], format: 'smileys' },
          { id: 'b14', type: 'divider', title: 'Zusatz' }
        ]
      }
    ]
  }
}

describe('Arbeitsblatt-Export', () => {
  it('Word-Datei enthält Kopf-/Fußzeilen, Seitenzahlen, Zeilennummern, Bilder und Lösungen', async () => {
    const ws = sampleWorksheet()
    const bytes = await buildWorksheetDocx(
      ws,
      { sheetIds: ['sheet-1'], includeKey: true },
      { logo: PNG_1PX, schoolName: 'Musterschule', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG_1PX, sidebar: async () => PNG_1PX }
    )
    const zip = await JSZip.loadAsync(bytes)
    const files = Object.keys(zip.files)
    expect(files.some((f) => /word\/header\d+\.xml/.test(f))).toBe(true)
    expect(files.some((f) => /word\/footer\d+\.xml/.test(f))).toBe(true)
    const doc = await zip.file('word/document.xml')!.async('string')
    expect(doc).toContain('w:titlePg')
    expect(doc).toContain('w:lnNumType')
    expect(doc).toContain('Traubenzucker')
    expect(doc).toContain('Hilfe 1')
    expect(doc).toContain('Lösung:')
    const headers = await Promise.all(files.filter((f) => /word\/header\d+\.xml/.test(f)).map((f) => zip.file(f)!.async('string')))
    expect(headers.join('')).toContain('Musterschule')
    expect(headers.join('')).toContain('Wie Pflanzen Energie gewinnen')
    expect(headers.join('')).toContain('wp:anchor') // Seitenleiste
    const footers = await Promise.all(files.filter((f) => /word\/footer\d+\.xml/.test(f)).map((f) => zip.file(f)!.async('string')))
    expect(footers.join('')).toContain('PAGE')
    // Gleiche Bilddaten werden in Word nur einmal gespeichert, daher die Verwendungen zählen
    expect(files.some((f) => f.startsWith('word/media/'))).toBe(true)
    expect((doc.match(/<w:drawing>/g) ?? []).length).toBeGreaterThan(3)
  })

  it('Word-Lösungsteil enthält den Notenschlüssel – Sek I als Noten, Sek II als Notenpunkte (26.09.2026)', async () => {
    const deps = { logo: PNG_1PX, schoolName: 'Musterschule', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG_1PX, sidebar: async () => PNG_1PX }
    const sekI = sampleWorksheet()
    sekI.meta = { ...sekI.meta, gradeScale: { thresholds: [91, 78, 64, 50, 25, 0], groups: [{ label: '', points: 40 }] } }
    const docI = await (await JSZip.loadAsync(await buildWorksheetDocx(sekI, { sheetIds: ['sheet-1'], includeKey: true }, deps))).file('word/document.xml')!.async('string')
    expect(docI).toContain('Notenschlüssel')
    expect(docI).toContain('1 (sehr gut)')
    expect(docI).toContain('gerundet wird ab ,5 aufwärts')
    expect(docI).not.toContain('Notenpunkte')

    const sekII = sampleWorksheet()
    sekII.meta = {
      ...sekII.meta,
      gradeScale: {
        groups: [{ label: '', points: 60 }],
        punkte: { schwellen: [95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 33, 27, 20, 0], hinweis: 'Prüfstand: KMK-Raster.' }
      }
    }
    const docII = await (await JSZip.loadAsync(await buildWorksheetDocx(sekII, { sheetIds: ['sheet-1'], includeKey: true }, deps))).file('word/document.xml')!.async('string')
    expect(docII).toContain('Notenpunkte')
    expect(docII).toContain('1+')
    expect(docII).toContain('57 – 60')
    expect(docII).toContain('Prüfstand: KMK-Raster.')

    // Auf dem Schülerblatt steht der Schlüssel nicht
    const nurSchueler = await (await JSZip.loadAsync(await buildWorksheetDocx(sekII, { sheetIds: ['sheet-1'], includeKey: false }, deps))).file('word/document.xml')!.async('string')
    expect(nurSchueler).not.toContain('Notenpunkte')
  })

  it('Tafelbild wird als eigene Seite in Word und Druckansicht angehängt', async () => {
    const ws = sampleWorksheet()
    ws.board = {
      title: 'Wie gewinnen Pflanzen Energie?',
      layout: 'flow',
      sections: [
        { heading: 'Ausgangsstoffe', points: ['Wasser', 'Kohlenstoffdioxid'], fromTasks: 'Aufgabe 1' },
        { heading: 'Produkte', points: ['Traubenzucker', 'Sauerstoff'], fromTasks: 'Aufgabe 2' }
      ],
      conclusion: 'Pflanzen bauen mit Lichtenergie Traubenzucker auf.',
      steps: [{ phase: 'Aufgabe 1 vergleichen', impulse: 'Was braucht die Pflanze?', expected: 'Wasser, CO2, Licht' }]
    }
    const deps = { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG_1PX, sidebar: async () => PNG_1PX }
    const onlyBoard = await buildWorksheetDocx(ws, { sheetIds: [], includeKey: false, includeBoard: true }, deps)
    const doc = await (await JSZip.loadAsync(onlyBoard)).file('word/document.xml')!.async('string')
    expect(doc).toContain('Tafelbild · für die Lehrkraft')
    expect(doc).toContain('Produkte')
    expect(doc).toContain('→ ')
    expect(doc).toContain('Merke: ')
    expect(doc).toContain('So entsteht das Tafelbild')
    expect(doc).not.toContain('Absatz 1')

    const { buildWorksheetHtml } = await import('../src/renderer/src/modules/arbeitsblatt/render/printHtml')
    const html = buildWorksheetHtml(ws, new Map(), { sheetIds: [], includeKey: false, includeBoard: true }, null, '')
    expect(html).toContain('ws-board-page')
    expect(html).toContain('ws-board-flow')
    expect(html).toContain('Was braucht die Pflanze?')
  })

  it('Projektdatei lässt sich speichern und wieder öffnen', () => {
    const ws = sampleWorksheet()
    const restored = parseWorksheetFile(new TextEncoder().encode(serializeWorksheet(ws)))
    expect(restored).toEqual(ws)
    if (process.env.WRITE_FIXTURE_WS) writeFileSync(process.env.WRITE_FIXTURE_WS, serializeWorksheet(ws))
  })
})

describe('Beschriftungen am Bild', () => {
  const labelled = () => {
    const ws = sampleWorksheet()
    ws.sheets[0].blocks.push({
      id: 'bild-beschriftet',
      type: 'image',
      description: 'Querschnitt durch ein Blatt',
      caption: 'M9 Blattquerschnitt',
      widthPercent: 70,
      fn: 'organisation',
      image: { dataUrl: PNG_1PX, source: 'ai', credit: 'KI-generiert', aiPrompt: 'cross section of a leaf' },
      labels: [
        { id: 'l1', text: 'Spaltöffnung', x: 22, y: 78 },
        { id: 'l2', text: 'Chloroplast', x: 68, y: 40, blank: true }
      ]
    })
    return ws
  }

  it('setzt Schild, Linie und Punkt ins Druck-HTML', async () => {
    const { buildWorksheetHtml } = await import('../src/renderer/src/modules/arbeitsblatt/render/printHtml')
    const html = buildWorksheetHtml(labelled(), new Map(), { sheetIds: ['sheet-1'], includeKey: false, includeBoard: false }, null, '')
    expect(html).toContain('ws-imglabel-grid')
    expect(html).toContain('ws-imglabel-line')
    expect(html).toContain('ws-imglabel-dot')
    expect(html).toContain('Spaltöffnung')
    // Die Lage steht als Anteil im Stil – daraus entsteht die waagerechte Verbindung
    expect(html).toMatch(/top:\s*78%/)
  })

  it('zeigt die Lückenbeschriftung erst im Lösungsteil', async () => {
    const { buildWorksheetHtml } = await import('../src/renderer/src/modules/arbeitsblatt/render/printHtml')
    const student = buildWorksheetHtml(labelled(), new Map(), { sheetIds: ['sheet-1'], includeKey: false, includeBoard: false }, null, '')
    expect(student).toContain('ws-imglabel-blank')
    expect(student).not.toContain('Chloroplast')

    const withKey = buildWorksheetHtml(labelled(), new Map(), { sheetIds: ['sheet-1'], includeKey: true, includeBoard: false }, null, '')
    expect(withKey).toContain('Chloroplast')
  })

  it('kennzeichnet das KI-Bild sichtbar am Bild', async () => {
    // Art. 50 Abs. 4 KI-Verordnung – ein Eintrag auf der Nachweisseite allein genügt nicht
    const { buildWorksheetHtml } = await import('../src/renderer/src/modules/arbeitsblatt/render/printHtml')
    const html = buildWorksheetHtml(labelled(), new Map(), { sheetIds: ['sheet-1'], includeKey: false, includeBoard: false }, null, '')
    expect(html).toContain('ws-ai-mark')
  })

  it('verliert die Beschriftungen im Word-Export nicht', async () => {
    // Word kann sie nicht am Bildteil platzieren; sie stehen dort als Liste darunter
    const JSZip = (await import('jszip')).default
    const deps = { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG_1PX, sidebar: async () => PNG_1PX }
    const buffer = await buildWorksheetDocx(labelled(), { sheetIds: ['sheet-1'], includeKey: false, includeBoard: false }, deps)
    const doc = await (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string')
    expect(doc).toContain('Spaltöffnung')
    expect(doc).toContain('KI-erzeugt')
  })
})

describe('Hörtexte als eigenes Dokument', () => {
  const audio = (over: Record<string, unknown> = {}) =>
    ({
      id: 'a1',
      type: 'audio',
      title: 'At the station',
      textType: 'Durchsage',
      transcript: 'Speaker: The train to Edinburgh leaves from platform four.\nSpeaker: Please mind the gap.',
      speakers: [{ id: 's1', name: 'Speaker', voiceId: 'v1', voiceName: 'Rachel' }],
      plays: 2,
      beforeListening: 'Achte auf die Gleisnummer.',
      seconds: 45,
      ...over
    }) as never

  it('nennt Textsorte, Dauer, Wiedergaben und Sprecher', async () => {
    const { transcriptFacts } = await import('../src/renderer/src/modules/arbeitsblatt/export/transcriptDocx')
    const facts = transcriptFacts(audio()).join(' · ')
    expect(facts).toContain('Durchsage')
    expect(facts).toContain('2-mal vorspielen')
    expect(facts).toContain('Rachel')
  })

  it('sagt, ob der Text vertont ist – sonst wird er vorgelesen', async () => {
    const { transcriptFacts } = await import('../src/renderer/src/modules/arbeitsblatt/export/transcriptDocx')
    expect(transcriptFacts(audio()).join(' ')).toContain('nicht vertont')
    expect(transcriptFacts(audio({ audio: { dataUrl: 'data:audio/mpeg;base64,AA' } })).join(' ')).toContain('vertont')
  })

  it('schreibt ein Dokument mit Skript und Hinweis für die Lehrkraft', async () => {
    const JSZip = (await import('jszip')).default
    const { buildTranscriptDocx } = await import('../src/renderer/src/modules/arbeitsblatt/export/transcriptDocx')
    const bytes = await buildTranscriptDocx([audio()], { title: 'Edinburgh', subtitle: 'Englisch · Klasse 8' })
    const doc = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')
    expect(doc).toContain('Edinburgh')
    // Der Warnhinweis muss drinstehen: Das Skript darf nicht in die Klasse
    expect(doc).toContain('nicht an die Lernenden austeilen')
    expect(doc).toContain('platform four')
    expect(doc).toContain('Vor dem Hören')
  })

  it('kommt mit einem Material ohne Hörtext zurecht', async () => {
    const JSZip = (await import('jszip')).default
    const { buildTranscriptDocx } = await import('../src/renderer/src/modules/arbeitsblatt/export/transcriptDocx')
    const bytes = await buildTranscriptDocx([], { title: 'Ohne Ton' })
    const doc = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')
    expect(doc).toContain('keine Hörtexte')
  })

  it('macht aus dem Titel einen zulässigen Dateinamen', async () => {
    const { transcriptFileName } = await import('../src/renderer/src/modules/arbeitsblatt/export/transcriptDocx')
    expect(transcriptFileName('A/B: C?')).not.toMatch(/[\/:*?"<>|]/)
    expect(transcriptFileName('')).toContain('Material')
  })
})

describe('Transkript als PDF-Vorlage', () => {
  const audio = (over: Record<string, unknown> = {}) =>
    ({
      id: 'a1',
      type: 'audio',
      title: 'At the station',
      textType: 'Durchsage',
      transcript: 'Speaker: The train to Edinburgh leaves from platform four.',
      speakers: [{ id: 's1', name: 'Speaker', voiceId: 'v1', voiceName: 'Rachel' }],
      plays: 2,
      beforeListening: 'Achte auf die Gleisnummer.',
      seconds: 45,
      ...over
    }) as never

  it('baut eine vollständige Seite mit Skript und Warnhinweis', async () => {
    const { buildTranscriptHtml } = await import('../src/renderer/src/modules/arbeitsblatt/export/transcriptDocx')
    const html = buildTranscriptHtml([audio()], { title: 'Edinburgh', subtitle: 'Englisch · Klasse 8' })
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('@page')
    expect(html).toContain('nicht an die Lernenden austeilen')
    expect(html).toContain('platform four')
    expect(html).toContain('<b>Speaker:</b>')
  })

  it('macht spitze Klammern im Skript unschädlich', async () => {
    const { buildTranscriptHtml } = await import('../src/renderer/src/modules/arbeitsblatt/export/transcriptDocx')
    const html = buildTranscriptHtml([audio({ transcript: 'Ann: 5 < 6 & <b>fett</b>' })], { title: 'T' })
    expect(html).not.toContain('<b>fett</b>')
    expect(html).toContain('&lt;b&gt;')
  })

  it('sagt auch ohne Hörtext etwas Sinnvolles', async () => {
    const { buildTranscriptHtml } = await import('../src/renderer/src/modules/arbeitsblatt/export/transcriptDocx')
    expect(buildTranscriptHtml([], { title: 'T' })).toContain('keine Hörtexte')
  })

  it('nennt die PDF-Datei wie die Word-Datei, nur mit anderer Endung', async () => {
    const { transcriptFileName, transcriptPdfName } = await import('../src/renderer/src/modules/arbeitsblatt/export/transcriptDocx')
    expect(transcriptPdfName('Edinburgh')).toBe(transcriptFileName('Edinburgh').replace('.docx', '.pdf'))
    expect(transcriptPdfName('A/B')).not.toMatch(/[\/:*?"<>|]/)
  })
})

/*
 * Ankreuzfragen im Word-Export.
 *
 * Bildschirm und Word müssen dieselbe Anordnung zeigen – sonst sieht die Lehrkraft beim
 * Bearbeiten etwas anderes als die Klasse auf dem Ausdruck. Geprüft wird deshalb genau das,
 * was die Anordnung ausmacht: eine Tabelle, spaltenweise gefüllt, ohne sichtbaren Rahmen,
 * und ohne das wiederholte „Tick" in jeder Frage.
 */
describe('Ankreuzfragen im Word-Export', () => {
  const mcWorksheet = (): Worksheet => {
    const frage = (id: string, text: string, optionen: string[]) => ({
      id,
      instruction: `**Tick** ${text}`,
      answer: { ...emptyAnswer('multipleChoice'), options: optionen, correct: [0] },
      solution: ''
    })
    return {
      version: 1,
      meta: { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'englisch', subjectLabel: 'Englisch', topic: 'At school', grade: 5 },
      design: presetDesigns()[0],
      outline: null,
      sources: [],
      createdAt: '2026-09-22',
      sheets: [
        {
          id: 'sheet-1',
          label: 'Arbeitsblatt',
          blocks: [
            {
              id: 'mc1',
              type: 'task' as const,
              instruction: '**Tick** the correct answer.',
              operator: 'tick',
              afb: 'I' as const,
              afbReason: '',
              socialForm: 'EA' as const,
              minutes: 8,
              points: 0,
              solution: '',
              answer: emptyAnswer('none'),
              parts: [
                frage('p1', 'ERSTE.', ['a dog', 'a ball']),
                frage('p2', 'ZWEITE.', ['a pet', 'a teacher']),
                frage('p3', 'DRITTE.', ['the library', 'his classroom']),
                frage('p4', 'VIERTE.', ['Lily', 'Ruby'])
              ]
            }
          ]
        }
      ]
    } as Worksheet
  }
  const deps = { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG_1PX, sidebar: async () => PNG_1PX }

  it('setzt die Fragen in eine Tabelle, spaltenweise gefüllt', async () => {
    const bytes = await buildWorksheetDocx(mcWorksheet(), { sheetIds: ['sheet-1'], includeKey: false }, deps)
    const doc = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')
    expect(doc).toContain('<w:tbl>')
    // Erste Zeile trägt Frage 1 (links) und Frage 3 (rechts) – nicht 1 und 2
    const ersteZeile = doc.slice(doc.indexOf('<w:tr'), doc.indexOf('</w:tr>'))
    expect(ersteZeile).toContain('ERSTE.')
    expect(ersteZeile).toContain('DRITTE.')
    expect(ersteZeile).not.toContain('ZWEITE.')
  })

  it('nummeriert die Fragen und buchstabiert die Möglichkeiten', async () => {
    const bytes = await buildWorksheetDocx(mcWorksheet(), { sheetIds: ['sheet-1'], includeKey: false }, deps)
    const doc = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')
    for (const t of ['1. ', '4. ', 'a) ', 'b) ', '☐ ']) expect(doc).toContain(t)
  })

  it('nimmt das wiederholte „Tick" aus den Fragen, lässt es aber in der Anweisung', async () => {
    const bytes = await buildWorksheetDocx(mcWorksheet(), { sheetIds: ['sheet-1'], includeKey: false }, deps)
    const doc = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')
    expect(doc).toContain('the correct answer.')
    // Genau einmal – in der Arbeitsanweisung
    expect(doc.split('Tick').length - 1).toBe(1)
  })

  it('markiert im Lösungsblatt das richtige Kästchen', async () => {
    const bytes = await buildWorksheetDocx(mcWorksheet(), { sheetIds: ['sheet-1'], includeKey: true }, deps)
    const doc = await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')
    expect(doc).toContain('☒ ')
  })
})

/*
 * Anlass: In einer Lernzielkontrolle zu den Potenzgesetzen stand in Ausfülltabelle,
 * Zuordnung und Ankreuzfrage wörtlich `$(-3)^4$` auf dem Blatt, während dieselbe Formel in
 * der Arbeitsanweisung sauber gesetzt war. Ursache waren zwei getrennte Textwege: `RichText`
 * setzt Formeln, `Editable` und `run()` geben reinen Text aus.
 *
 * Im Word-Export wird eine Formel zu einem Bild. Mit einer Attrappe als Rasterer ist jedes
 * `<w:drawing>` in diesem Blatt deshalb eine Formel – andere Bilder gibt es hier nicht.
 */
describe('Formeln in allen Feldern der Word-Datei', () => {
  const deps = { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG_1PX, sidebar: async () => PNG_1PX }

  const aufgabe = (id: string, answer: Answer) =>
    ({
      id,
      type: 'task' as const,
      instruction: '**Berechne** den Wert von $(-3)^4$.',
      operator: 'berechnen',
      afb: 'I' as const,
      afbReason: '',
      socialForm: 'EA' as const,
      minutes: 5,
      points: 0,
      solution: '',
      answer,
      parts: []
    }) as never

  const mathe = (): Worksheet =>
    ({
      version: 1,
      meta: { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'mathematik', subjectLabel: 'Mathematik', topic: 'Potenzgesetze', grade: 10 },
      design: presetDesigns()[0],
      outline: null,
      sources: [],
      createdAt: '2026-09-23',
      sheets: [
        {
          id: 'sheet-1',
          label: 'Arbeitsblatt',
          blocks: [
            aufgabe('t1', {
              ...emptyAnswer('tableFill'),
              headers: ['Potenz', 'Wert'],
              rows: [['$(-3)^4$', '']],
              solutionRows: [['$(-3)^4$', '$81$']]
            }),
            aufgabe('t2', {
              ...emptyAnswer('matching'),
              left: ['$b^4 \cdot b^3 = b^7$'],
              right: ['Produktgesetz'],
              pairs: [0]
            }),
            aufgabe('t3', { ...emptyAnswer('multipleChoice'), options: ['$a^3 \cdot a^3 = a^6$', 'keine der Möglichkeiten'], correct: [0] }),
            aufgabe('t4', { ...emptyAnswer('ordering'), items: ['$a^1$', '$a^2$'], displayOrder: [1, 0] }),
            {
              id: 't5',
              type: 'table' as const,
              title: 'Potenzgesetze im Überblick',
              headers: ['Gesetz', 'Beispiel mit $a$'],
              rows: [['$a^m \cdot a^n = a^{m+n}$', '$a^2 \cdot a^3 = a^5$']]
            }
          ]
        }
      ]
    }) as Worksheet

  const text = async (key: boolean): Promise<string> => {
    const bytes = await buildWorksheetDocx(mathe(), { sheetIds: ['sheet-1'], includeKey: key, keyOnly: key }, deps)
    return await (await JSZip.loadAsync(bytes)).file('word/document.xml')!.async('string')
  }

  it('lässt kein Dollarzeichen im Dokument stehen', async () => {
    const doc = await text(false)
    expect(doc).not.toMatch(/\$[^$<]{1,30}\$/)
  })

  it('setzt Ausfülltabelle, Zuordnung, Ankreuzfrage, Reihenfolge und Tabellenkopf als Bild', async () => {
    const doc = await text(false)
    // Anweisung (1) + Tabellenkopf-Zelle (1) + Tabellenzeile (2) + Kopf der Ausfülltabelle (0)
    // + Ausfülltabelle (1) + Zuordnung (1) + Ankreuzen (1) + Reihenfolge (2) + Überschrift (0)
    // Ohne die Umstellung wären es nur die fünf aus den Anweisungen.
    expect(doc.split('<w:drawing>').length - 1).toBeGreaterThanOrEqual(12)
    /*
     * Der eigentliche Nachweis. Vor der Umstellung lief Word über `plainText()`, und das
     * gibt den rohen TeX-Ausdruck aus – ohne Dollarzeichen, aber eben auch ohne Formel.
     * Auf dem Blatt stand dann `b^4 \cdot b^3 = b^7`.
     */
    expect(doc).not.toContain('cdot')
    expect(doc).not.toContain('a^m')
  })

  it('setzt auch die Lösung in der Ausfülltabelle', async () => {
    const doc = await text(true)
    expect(doc).not.toMatch(/\$[^$<]{1,30}\$/)
  })
})
