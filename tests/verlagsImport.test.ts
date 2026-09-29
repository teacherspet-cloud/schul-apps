import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { presetDesigns } from '../src/shared/design'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'
import type { TaskBlock, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { itemZahl, zerlegenAnfrage, zerlegungAus } from '../src/renderer/src/modules/klassenarbeit/import/zerlegen'
import { aufgabeAlsBausteine } from '../src/renderer/src/modules/klassenarbeit/import/bausteine'
import { fassungBAnfrage, fassungBAus, uebernehme, zielTeil } from '../src/renderer/src/modules/klassenarbeit/import/uebernahme'
import { bezugFuer, fuegeEin, neueItemsAus, zusatzfragenAnfrage } from '../src/renderer/src/modules/klassenarbeit/import/zusatzfragen'
import { RECHTSHINWEIS_ABSAETZE, RECHTSHINWEIS_BESTAETIGUNG } from '../src/renderer/src/modules/klassenarbeit/import/rechtshinweisTexte'
import { arbeitsmaterialAblage, arbeitsmaterialQuellen, arbeitsmaterialTeil, unterlagenBilder } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { transkriptAusHtml, transkriptAusPdfText } from '../src/renderer/src/shared/verstehen/hoerdatei'
import { ENTWURF_VERMERK } from '../src/renderer/src/modules/rueckmeldung/aufgabeAusMaterial'
import { ERLAUBTE_KANAELE } from '../src/main/services/lanServer'

/*
 * Verlagsmaterial in der Klassenarbeit (Entscheidungen der Lehrkraft vom 29.09.2026):
 * Rechtshinweis + Häkchen, KI zerlegt in Aufgaben, Lehrkraft wählt aus, wörtlich übernehmen,
 * Entwürfe markiert, A/B-Fassung, Stufen; Hörverstehen mit Original-MP3 und Transkript.
 */

const userData = mkdtempSync(join(tmpdir(), 'schulapps-import-'))
vi.mock('electron', () => ({ app: { getPath: () => userData } }))
const { istMp3, audioDateiName, importiereAudio } = await import('../src/main/services/audio/importAudio')
afterAll(() => rmSync(userData, { recursive: true, force: true }))

const TRANSKRIPT =
  "Mia: The bus to the museum leaves at nine fifteen, so we should meet at the station at nine.\nTom: The museum doesn't open until ten on Saturdays."

/** Antwort der KI, wie sie das Schema vorgibt (alle Felder da) */
const leer = {
  kind: 'lines',
  count: 3,
  gapText: '',
  left: [],
  right: [],
  pairs: [],
  options: [],
  correct: [],
  statements: [],
  items: [],
  displayOrder: [],
  headers: [],
  rows: [],
  solutionRows: []
}
const kiAntwort = {
  titel: 'Klassenarbeitsvorschlag Unit 2',
  unklar: [],
  aufgaben: [
    {
      nummer: '1',
      titel: 'Listening: a school trip',
      kompetenz: 'listening',
      material: [{ art: 'hoertext', titel: 'A school trip', text: TRANSKRIPT, zeilen: [], quelle: '' }],
      anweisung: '**Tick** the correct answer.',
      operator: 'tick',
      afb: 'I',
      antwort: { ...leer, kind: 'none' },
      teile: [
        {
          anweisung: 'Where do they meet?',
          antwort: { ...leer, kind: 'multipleChoice', options: ['at school', 'at the station', "at Tom's house"], correct: [1] },
          loesung: 'b',
          punkte: 1,
          stufe: 1,
          stufeGrund: 'Option wörtlich im Text'
        },
        {
          anweisung: 'When does the museum open on Saturdays?',
          antwort: { ...leer, kind: 'multipleChoice', options: ['at nine', 'at ten', 'at nine fifteen'], correct: [1] },
          loesung: 'b',
          punkte: 1,
          stufe: 2,
          stufeGrund: 'doesn’t open until ten → opens at ten'
        }
      ],
      loesung: '',
      loesungQuelle: 'loesungsblatt',
      punkte: 2,
      punkteQuelle: 'material',
      stufe: 0,
      stufeGrund: '',
      hinweis: ''
    },
    {
      nummer: '2',
      titel: 'Writing: an e-mail',
      kompetenz: 'writing',
      material: [],
      anweisung: '**Write** an e-mail to your friend about the trip.',
      operator: 'write',
      afb: 'III',
      antwort: { ...leer, kind: 'lines', count: 12 },
      teile: [],
      loesung: 'Inhalt: Anlass, Erlebnisse, Wertung.',
      loesungQuelle: 'entwurf',
      punkte: 10,
      punkteQuelle: 'entwurf',
      stufe: 0,
      stufeGrund: '',
      hinweis: 'Seite 2 schwer lesbar.'
    }
  ]
}

const part = (id: string, formatId: string, blocks: WsBlock[] = []): ExamPart =>
  ({ id, formatId, label: formatId, competence: '', minutes: 20, points: 10, weight: 50, gradeGroup: 'other', afbMix: {}, blocks }) as unknown as ExamPart

const exam = (parts: ExamPart[] = [part('p1', 'en-listening'), part('p2', 'en-writing')], patch: Partial<Exam['meta']> = {}): Exam =>
  ({
    version: 1,
    meta: { ...defaultExamMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'englisch', subjectLabel: 'Englisch', topic: 'Trips', grade: 8, variants: 1, ...patch },
    parts,
    design: presetDesigns()[0],
    createdAt: ''
  }) as unknown as Exam

describe('Rechtshinweis', () => {
  it('nennt das KI-Verbot der Verlage und bestätigt unpersönlich', () => {
    expect(RECHTSHINWEIS_ABSAETZE.join(' ')).toContain('nicht in KI-Anwendungen geladen werden')
    expect(RECHTSHINWEIS_BESTAETIGUNG).toBe('Die Nutzungsrechte für dieses Material liegen vor; die Verantwortung liegt bei der Lehrkraft.')
    expect(`${RECHTSHINWEIS_ABSAETZE.join(' ')} ${RECHTSHINWEIS_BESTAETIGUNG}`).not.toMatch(/\b(du|Sie|Ihr|Ihre)\b/)
  })
})

describe('Material zerlegen', () => {
  it('schickt Material, Lösungsblatt und Scans in EINER Anfrage', () => {
    const req = zerlegenAnfrage(
      exam(),
      [
        { fileName: 'Test.pdf', text: 'Listening 1 …' },
        { fileName: 'Scan.jpg', text: '', pageImages: ['data:image/jpeg;base64,AAA'] }
      ],
      [{ fileName: 'Loesung.pdf', text: '1 b, 2 b' }]
    )
    expect(req.user).toContain('WÖRTLICH')
    expect(req.user).toContain('LÖSUNGSBLATT')
    expect(req.user).toContain('1 b, 2 b')
    expect(req.user).toContain('Stufe 1 (sehr leicht)')
    expect(req.images).toEqual(['data:image/jpeg;base64,AAA'])
  })

  it('liest die Antwort der KI in feste Form', () => {
    const z = zerlegungAus(kiAntwort, ['Test.pdf'])
    expect(z.aufgaben).toHaveLength(2)
    expect(z.aufgaben[0].teile[0].stufe).toBe(1)
    expect(z.aufgaben[0].stufe).toBeUndefined()
    expect(itemZahl(z.aufgaben[0])).toBe(2)
    expect(() => zerlegungAus({ aufgaben: [] })).toThrow(/keine Aufgaben/)
  })
})

describe('Übernahme in die Arbeit', () => {
  const z = zerlegungAus(kiAntwort)

  it('übernimmt wörtlich, ohne die Antwortmöglichkeiten zu mischen, und verknüpft den Hörtext', () => {
    const bloecke = aufgabeAlsBausteine(z.aufgaben[0], { entwuerfe: true, stufen: true })
    const [audio, task] = bloecke
    expect(audio.type).toBe('audio')
    expect(audio.type === 'audio' && audio.origin).toBe('archiv')
    expect(audio.type === 'audio' && audio.transcript).toBe(TRANSKRIPT)
    const t = task as TaskBlock
    expect(t.audioId).toBe(audio.id)
    expect(t.skill).toBe('listening')
    expect(t.parts[0].answer.options).toEqual(['at school', 'at the station', "at Tom's house"])
    expect(t.parts[0].answer.correct).toEqual([1])
    expect(t.parts.map((p) => p.stufe)).toEqual([1, 2])
  })

  it('verwirft Stufen und Entwürfe, wenn sie abgewählt sind – und markiert sie sonst', () => {
    const ohne = aufgabeAlsBausteine(z.aufgaben[0], { entwuerfe: false, stufen: false })[1] as TaskBlock
    expect(ohne.parts.every((p) => p.stufe === undefined)).toBe(true)
    const schreibenOhne = aufgabeAlsBausteine(z.aufgaben[1], { entwuerfe: false, stufen: true })[0] as TaskBlock
    expect(schreibenOhne.solution).toBe('')
    expect(schreibenOhne.points).toBe(0)
    const schreibenMit = aufgabeAlsBausteine(z.aufgaben[1], { entwuerfe: true, stufen: true })[0] as TaskBlock
    expect(schreibenMit.solution.startsWith(ENTWURF_VERMERK)).toBe(true)
    expect(schreibenMit.points).toBe(10)
    expect(schreibenMit.warnings?.join(' ')).toContain('Vorschlag der KI')
    // Schreiben hat keine Stufe
    expect(schreibenMit.stufe).toBeUndefined()
  })

  it('schlägt den passenden Teil vor und hängt die Aufgaben dort an', () => {
    const e = exam()
    expect(zielTeil(e, 'listening')?.id).toBe('p1')
    expect(zielTeil(e, 'writing')?.id).toBe('p2')
    expect(zielTeil(e, 'sonstiges')?.id).toBe('p1')
    const { exam: neu } = uebernehme(
      e,
      z.aufgaben.map((a) => ({ aufgabe: a, teilId: zielTeil(e, a.kompetenz)!.id })),
      { entwuerfe: true, stufen: true }
    )
    expect(neu.parts[0].blocks.map((b) => b.type)).toEqual(['audio', 'task'])
    expect(neu.parts[1].blocks.map((b) => b.type)).toEqual(['task'])
    expect(e.parts[0].blocks).toHaveLength(0)
  })

  it('leitet eine B-Fassung ab: gleiches Material (gleiche id), neue Items, zweite Fassung überall', () => {
    const req = fassungBAnfrage(exam(), [z.aufgaben[0]], { entwuerfe: true, stufen: true })
    expect(req.user).toContain('B-Fassung')
    expect(req.user).toContain('Where do they meet?')
    const b = fassungBAus(
      {
        ...kiAntwort,
        aufgaben: [
          {
            ...kiAntwort.aufgaben[0],
            material: [],
            teile: [{ ...kiAntwort.aufgaben[0].teile[0], anweisung: 'What time does the bus leave?' }]
          }
        ]
      },
      1
    )
    const { exam: neu, hinweise } = uebernehme(exam(), [{ aufgabe: z.aufgaben[0], teilId: 'p1' }], { entwuerfe: true, stufen: true }, b)
    expect(neu.meta.variants).toBe(2)
    expect(neu.parts.every((p) => p.weitereFassungen?.length === 1)).toBe(true)
    const [aAudio] = neu.parts[0].blocks
    const bListe = neu.parts[0].weitereFassungen![0]
    expect(bListe[0].id).toBe(aAudio.id)
    const bTask = bListe[1] as TaskBlock
    expect(bTask.parts[0].instruction).toBe('What time does the bus leave?')
    expect(bTask.audioId).toBe(aAudio.id)
    expect(hinweise.join(' ')).toContain('zwei Fassungen')
  })
})

describe('Weitere Fragen im gleichen Format', () => {
  const audio: WsBlock = {
    id: 'a1',
    type: 'audio',
    title: 'Trip',
    textType: 'Gespräch',
    transcript: TRANSKRIPT,
    speakers: [],
    plays: 2,
    beforeListening: '',
    seconds: 30,
    origin: 'archiv'
  }
  const mcAufgabe = (): TaskBlock => ({
    id: 't1',
    type: 'task',
    instruction: '**Tick** the correct answer.',
    operator: 'tick',
    afbReason: '',
    socialForm: 'EA',
    answer: emptyAnswer('none'),
    parts: [
      { id: 'x', instruction: 'Where do they meet?', answer: { ...emptyAnswer('multipleChoice'), options: ['a', 'b', 'c'], correct: [0] }, solution: 'a', stufe: 1 }
    ],
    solution: '',
    points: 1,
    minutes: 5,
    skill: 'listening',
    audioId: 'a1'
  })

  it('findet das Transkript und merkt, dass es fremdes Material ist', () => {
    const b = bezugFuer([audio, mcAufgabe()], 't1')
    expect(b?.art).toBe('audio')
    expect(b?.fremd).toBe(true)
  })

  it('schickt nur das Transkript, das Format, die vorhandenen Items und den Stufenmix', () => {
    const req = zusatzfragenAnfrage({ aufgabe: mcAufgabe(), bezug: bezugFuer([audio, mcAufgabe()], 't1')!, mix: [0, 1, 1, 0, 0], trueFalseErlaubt: true, fach: 'Englisch', klasse: 8 })
    expect(req.user).toContain('multipleChoice')
    expect(req.user).toContain('1: Where do they meet? (Stufe 1)')
    expect(req.user).toContain('GENAU 2 NEUE ITEMS')
    expect(req.user).toContain(TRANSKRIPT.slice(0, 40))
  })

  it('fügt neue Teilaufgaben an der Textstelle ein, zählt Punkte hoch und prüft die Stufe', () => {
    const bloecke: WsBlock[] = [audio, mcAufgabe()]
    const items = neueItemsAus({
      items: [
        {
          position: 1,
          stamm: 'Where does the bus to the museum leave from?',
          optionen: ['at school', 'at the station', 'at home'],
          richtig: 1,
          wahr: false,
          links: '',
          rechts: '',
          zeile: [],
          zeilenLoesung: [],
          loesung: 'at the station',
          stufe: 3,
          stufeGrund: 'Umformung',
          textstelle: "doesn't open until ten"
        }
      ]
    })
    const hinweise = fuegeEin(bloecke, 't1', items, TRANSKRIPT)
    const t = bloecke[1] as TaskBlock
    expect(t.parts).toHaveLength(2)
    expect(t.parts[1].instruction).toBe('Where does the bus to the museum leave from?')
    expect(t.parts[1].answer.options).toEqual(['at school', 'at the station', 'at home'])
    expect(t.parts[1].stufe).toBe(3)
    expect(t.points).toBe(2)
    // „at the station" steht wörtlich im Text – für Stufe 3 ein Befund der App-Prüfung
    expect(hinweise.join(' ')).toContain('Stufe 1')
    expect(t.warnings?.length).toBeGreaterThan(0)
  })

  it('ergänzt Richtig/Falsch-Aussagen und Zuordnungen im selben Baustein', () => {
    const tf: TaskBlock = { ...mcAufgabe(), parts: [], answer: { ...emptyAnswer('trueFalse'), statements: [{ text: 'They meet at nine.', isTrue: true }] } }
    const bloecke: WsBlock[] = [audio, tf]
    fuegeEin(bloecke, 't1', neueItemsAus({ items: [{ position: 1, stamm: 'The museum opens at nine on Saturdays.', wahr: false, stufe: 3 }] }), TRANSKRIPT)
    expect((bloecke[1] as TaskBlock).answer.statements.map((s) => s.isTrue)).toEqual([true, false])
    expect((bloecke[1] as TaskBlock).answer.statements[1].stufe).toBe(3)

    const zu: TaskBlock = { ...mcAufgabe(), parts: [], answer: { ...emptyAnswer('matching'), left: ['Mia'], right: ['bus'], pairs: [0] } }
    const b2: WsBlock[] = [audio, zu]
    fuegeEin(b2, 't1', neueItemsAus({ items: [{ position: 1, links: 'Tom', rechts: 'museum', stufe: 2 }] }), TRANSKRIPT, () => 0)
    const a = (b2[1] as TaskBlock).answer
    expect(a.right).toEqual(['museum', 'bus'])
    expect(a.left).toEqual(['Mia', 'Tom'])
    expect(a.left.map((_, i) => a.right[a.pairs[i]])).toEqual(['bus', 'museum'])
  })
})

describe('Scans im Material für die Arbeit (Befund 29.09.2026)', () => {
  const scan = { id: 's', fileName: 'Scan.jpg', kind: 'image' as const, text: '', bilder: ['data:image/jpeg;base64,BBB'], aktiv: true }
  const textQuelle = { id: 't', fileName: 'Text.pdf', kind: 'pdf' as const, text: 'Ein Lesetext.', bilder: ['data:image/jpeg;base64,CCC'], aktiv: true }

  it('fallen nicht mehr stillschweigend heraus – ihre Bilder gehen an die KI', () => {
    const e = exam([part('p1', 'en-reading')], { arbeitsmaterial: [scan, textQuelle] })
    expect(arbeitsmaterialQuellen(e).map((q) => q.id)).toEqual(['s', 't'])
    // Wörtlich eingesetzt wird nur Text
    expect(arbeitsmaterialAblage(e)?.text).toBe('Ein Lesetext.')
    expect(arbeitsmaterialTeil(e, e.parts[0])).toContain('beigefügten Bild')
    // Nur das Bild des Scans – die digitale PDF steht schon als Text im Auftrag
    expect(unterlagenBilder(e).images).toEqual(['data:image/jpeg;base64,BBB'])
  })
})

describe('Original-Hördatei und Transkript', () => {
  it('nimmt nur MP3 an und legt sie unter der Kennung des Bausteins ab', () => {
    expect(istMp3(new Uint8Array([0x49, 0x44, 0x33, 4]))).toBe(true)
    expect(istMp3(new Uint8Array([0xff, 0xfb, 0x90, 0]))).toBe(true)
    expect(istMp3(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false)
    expect(audioDateiName('ab/../c')).toBe('abc.mp3')
    const r = importiereAudio('hoer-1', new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0]))
    expect(r.fileName).toBe('hoer-1.mp3')
    expect(r.dataUrl.startsWith('data:audio/mpeg;base64,')).toBe(true)
    expect(() => importiereAudio('x', new Uint8Array([1, 2, 3, 4]))).toThrow(/keine MP3/)
    expect(ERLAUBTE_KANAELE).toContain('audio:import')
  })

  it('bereitet Transkripte aus Word und PDF auf', () => {
    expect(transkriptAusHtml('<p>Mia: Hello&nbsp;there.</p><p>Tom: Hi.</p>')).toBe('Mia: Hello there.\nTom: Hi.')
    expect(transkriptAusPdfText('--- Seite 1 ---\nMia: Hello | there.\n\n')).toBe('Mia: Hello there.')
  })
})
