import { describe, expect, it } from 'vitest'
import { defaultWeights, writingWeightFor } from '../src/renderer/src/modules/klassenarbeit/model/formats'
import { generateExam, partNotes, partPrompt, vocabRules, worksheetMetaFor } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { examHeadBlock, examToWorksheet } from '../src/renderer/src/modules/klassenarbeit/render/examWorksheet'
import { upperSecondary, upperSecondaryRules } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { AIDS_SUGGESTIONS, translateAids } from '../src/renderer/src/modules/klassenarbeit/model/aids'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { presetDesigns } from '@shared/design'

const part = (formatId: string, patch: Partial<ExamPart> = {}): ExamPart => ({
  id: formatId,
  formatId,
  label: formatId,
  competence: 'Kompetenz',
  weight: 30,
  points: 21,
  minutes: 27,
  gradeGroup: formatId === 'en-writing' ? 'writing' : 'other',
  afbMix: { I: 30, II: 45, III: 25 },
  blocks: [],
  ...patch
})

const exam = (parts: ExamPart[], patch: Partial<Exam['meta']> = {}): Exam => ({
  version: 1,
  design: presetDesigns()[0],
  parts,
  createdAt: '2026-09-18',
  meta: {
    title: '2. Klassenarbeit',
    subjectId: 'englisch',
    subjectLabel: 'Englisch',
    topic: 'Going abroad',
    content: 'simple past, Reisewortschatz',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    schoolTypeName: 'Gymnasium',
    grade: 9,
    courseLevel: 'mixed',
    cefrLevel: 'B1',
    grammarTopic: '',
    vocab: [],
    infoBox: true,
    minutes: 90,
    points: 21,
    aids: 'einsprachiges Wörterbuch',
    variants: 1,
    gradeScale: true,
    separateWritingGrade: true,
    answerKey: true,
    answerKeyDetail: 'ausfuehrlich',
    teacherNote: '',
    ...patch
  }
})

describe('Gewichtung beim einzelnen Hinzufügen', () => {
  it('setzt Lesen auf 30 % und Schreiben auf 70 %', () => {
    const parts = [
      { formatId: 'en-reading', gradeGroup: 'other' as const },
      { formatId: 'en-writing', gradeGroup: 'writing' as const }
    ]
    expect(defaultWeights('englisch', 9, parts)).toEqual([30, 70])
    // Klasse 5: 40 / 60
    expect(defaultWeights('englisch', 5, parts)).toEqual([40, 60])
    expect(writingWeightFor(9)).toBe(70)
  })

  it('gilt auch, wenn der Schreibteil zuerst hinzugefügt wurde', () => {
    const parts = [
      { formatId: 'en-writing', gradeGroup: 'writing' as const },
      { formatId: 'en-mediation', gradeGroup: 'other' as const }
    ]
    expect(defaultWeights('englisch', 8, parts)).toEqual([70, 30])
  })

  it('teilt mehrere weitere Kompetenzen den Rest untereinander auf', () => {
    const parts = [
      { formatId: 'en-listening', gradeGroup: 'other' as const },
      { formatId: 'en-reading', gradeGroup: 'other' as const },
      { formatId: 'en-writing', gradeGroup: 'writing' as const }
    ]
    const w = defaultWeights('englisch', 9, parts)
    expect(w[2]).toBe(70)
    expect(w[0] + w[1]).toBe(30)
  })

  it('verteilt ohne Schreibteil gleichmäßig', () => {
    const w = defaultWeights('englisch', 9, [
      { formatId: 'en-reading', gradeGroup: 'other' as const },
      { formatId: 'en-listening', gradeGroup: 'other' as const }
    ])
    expect(w.reduce((a, b) => a + b, 0)).toBe(100)
  })
})

describe('Auftrag an die KI', () => {
  it('überträgt den Kompetenzschwerpunkt in das Arbeitsblatt-Profil', () => {
    expect(worksheetMetaFor(exam([]), part('en-mediation')).skillFocus).toBe('mediation')
    expect(worksheetMetaFor(exam([]), part('en-reading')).skillFocus).toBe('reading')
    expect(worksheetMetaFor(exam([]), part('en-writing')).skillFocus).toBe('writing')
    // In der Arbeit gibt es keine Differenzierung und keine Bilder
    expect(worksheetMetaFor(exam([])).differentiation.levels).toBe(1)
    expect(worksheetMetaFor(exam([])).sheetType).toBe('lernkontrolle')
  })

  it('nennt Punkte, Zeit und die Regeln einer Leistungssituation', () => {
    const p = partPrompt(exam([]), part('en-reading'), 1)
    expect(p).toContain('21 Punkte')
    expect(p).toContain('27 Minuten')
    expect(p).toContain('Keine Hilfen')
    expect(p).toContain('kein Deckblatt')
    expect(p).toContain('einsprachiges Wörterbuch')
  })

  it('richtet den Erwartungshorizont nach der eingestellten Ausführlichkeit', () => {
    const writing = part('en-writing', { contentShare: 40, points: 0, weight: 70 })
    expect(partPrompt(exam([], { answerKeyDetail: 'kurz' }), writing, 2)).toContain('Stichpunkte')
    expect(partPrompt(exam([], { answerKeyDetail: 'ausfuehrlich' }), writing, 2)).toContain('ausformulierte Musterlösung')
    const raster = partPrompt(exam([], { answerKeyDetail: 'raster' }), writing, 2)
    expect(raster).toContain('Bewertungsraster')
    expect(raster).toContain('40 % Inhalt')
    expect(raster).toContain('60 % Sprache')
  })
})

describe('Arbeit als Arbeitsblatt', () => {
  it('stellt Zeit, Hilfsmittel und Notenschlüssel an den Anfang', () => {
    const head = examHeadBlock(exam([part('en-reading'), part('en-writing', { points: 0, weight: 70, contentShare: 40 })]))
    expect(head?.type).toBe('infoBox')
    const body = head?.type === 'infoBox' ? head.body : ''
    // Englischarbeit: Kasten in der Zielsprache
    expect(body).toContain('Time: 90 minutes')
    // Auch die Hilfsmittel stehen in der Sprache des Faches
    expect(body).toContain('You may use: a monolingual dictionary')
    expect(body).not.toContain('Wörterbuch')
    // Der Notenschlüssel gilt nur für den Teil, der über Punkte bewertet wird.
    // Die Schreibkompetenz bekommt eine eigene Teilnote nach Inhalt und Sprache – dort sagt
    // ein Punkteschlüssel nichts aus und steht deshalb nicht da.
    expect(body).toContain('Weitere Kompetenzen: 1 ab')
    expect(body).not.toContain('Writing: 1 ab')
  })

  it('druckt den Notenschlüssel nur auf Wunsch aufs Schülermaterial', () => {
    // Voreinstellung: Er steht im Erwartungshorizont, nicht auf der Arbeit
    const without = examHeadBlock(exam([part('en-reading')], { gradeScale: false }))
    const body = without?.type === 'infoBox' ? without.body : ''
    expect(body).not.toContain('Marks:')
    expect(body).toContain('Time:')
  })

  it('macht aus jedem Teil eine Überschrift mit den Bausteinen', () => {
    const e = exam([
      part('en-reading', { blocks: [{ id: 't1', type: 'divider', title: 'x' }] }),
      part('en-writing', { points: 0, weight: 70, contentShare: 40, blocks: [] })
    ])
    const ws = examToWorksheet(e)
    const titles = ws.sheets[0].blocks.filter((b) => b.type === 'divider').map((b) => (b.type === 'divider' ? b.title : ''))
    // Englischarbeit: auch die Überschriften der Teile sind englisch
    expect(titles.some((t) => t.startsWith('Part 1'))).toBe(true)
    expect(titles.some((t) => t.startsWith('Part 2'))).toBe(true)
    // Punkte stehen an der Überschrift, wenn der Teil über Punkte bewertet wird
    expect(titles.find((t) => t.startsWith('Part 1'))).toContain('21 points')
    expect(titles.find((t) => t.startsWith('Part 2'))).not.toContain('points')
  })
})

describe('Erzeugung mit simulierter KI', () => {
  it('legt die Bausteine an jeden Teil', async () => {
    const calls: string[] = []
    const fakeAi = async <T>(req: { system: string; user: string }): Promise<T> => {
      calls.push(req.user)
      return {
        blocks: [
          { outlineIndex: 0, type: 'text', title: 'Text', body: 'A short text.', lineNumbers: true },
          {
            outlineIndex: 1,
            type: 'task',
            instruction: '**Tick** the correct answer.',
            operator: 'tick',
            afb: 'I',
            solution: 'a)',
            points: 3,
            answer: { kind: 'multipleChoice', options: ['a', 'b', 'c'], correct: [0] }
          }
        ]
      } as T
    }
    const e = exam([part('en-reading'), part('en-writing', { points: 0, weight: 70, contentShare: 40 })])
    const steps: string[] = []
    const result = await generateExam(e, fakeAi, (m) => steps.push(m))
    expect(result.parts[0].blocks).toHaveLength(2)
    expect(result.parts[1].blocks).toHaveLength(2)
    expect(result.parts[0].blocks[1].type).toBe('task')
    // Für jeden Teil eine eigene Anfrage, mit dem jeweiligen Auftrag
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain('Teil 1')
    expect(calls[1]).toContain('Teil 2')
    expect(steps[steps.length - 1]).toBe('fertig')
    // Die erzeugten Bausteine landen im Arbeitsblatt
    const ws = examToWorksheet(result)
    expect(ws.sheets[0].blocks.filter((b) => b.type === 'task')).toHaveLength(2)
  })
})

describe('Hörverstehen: Zuordnung übersteht die Nachbesserung', () => {
  it('ordnet die Höraufgaben auch nach einer Nachbesserung dem Hörtext zu', async () => {
    /*
     * Der Fehler, den erst ein Lauf mit echter KI zeigte: Die Nachbesserung ersetzt die
     * Bausteine eines Teils durch frische. Die Zuordnung von vorher galt dann für Bausteine,
     * die es nicht mehr gab – in der fertigen Arbeit trug keine einzige Höraufgabe ihren
     * Hörtext. Die Prüfung fiel still auf „gegen alle Skripte zugleich" zurück und ging durch.
     */
    const audio = { outlineIndex: 0, type: 'audio', title: 'Growing up in the UK', body: 'Anna: I grew up in Leeds.', plays: 2, speakers: [{ name: 'Anna' }] }
    const task = (instruction: string) => ({
      outlineIndex: 1,
      type: 'task',
      instruction,
      operator: 'tick',
      afb: 'I',
      skill: 'listening',
      solution: 'Leeds',
      points: 3,
      answer: { kind: 'multipleChoice', options: ['Leeds', 'Hull'], correct: [0] }
    })
    let revised = false
    const fakeAi = async <T>(req: { system: string; user: string }): Promise<T> => {
      // Der erste Entwurf verweist auf ein Material, das es nicht gibt – das erzwingt die Nachbesserung
      if (req.user.includes('Behebe diese Mängel')) {
        revised = true
        return { blocks: [audio, task('**Tick** the correct answer.')] } as T
      }
      return { blocks: [audio, task('**Tick** the correct answer in M1.')] } as T
    }
    const result = await generateExam(exam([part('en-listening')]), fakeAi, () => undefined)
    expect(revised).toBe(true)
    const blocks = result.parts[0].blocks
    const audioBlock = blocks.find((b) => b.type === 'audio')
    const tasks = blocks.filter((b) => b.type === 'task')
    expect(audioBlock).toBeDefined()
    expect(tasks.length).toBeGreaterThan(0)
    for (const t of tasks) expect(t.type === 'task' && t.audioId).toBe(audioBlock!.id)
  })
})

describe('Vokabellisten und Kopf der Arbeit', () => {
  const withVocab = exam([part('en-reading')], {
    vocab: [
      {
        id: 'l1',
        name: 'Unit 3',
        words: [
          { term: 'journey', translation: 'Reise' },
          { term: 'luggage', translation: 'Gepäck' }
        ]
      }
    ]
  })

  it('übergibt den geübten Wortschatz an die KI', () => {
    const rules = vocabRules(withVocab)
    expect(rules).toContain('Unit 3')
    expect(rules).toContain('journey – Reise')
    expect(rules).toContain('gilt als bekannt')
    // Im Auftrag für den Teil steht der Wortschatz mit drin
    expect(partPrompt(withVocab, part('en-reading'), 1)).toContain('luggage')
  })

  it('bleibt ohne zugeordnete Liste leer', () => {
    expect(vocabRules(exam([part('en-reading')]))).toBe('')
  })

  it('kürzt sehr lange Listen', () => {
    const many = exam([part('en-reading')], {
      vocab: [{ id: 'l', name: 'Groß', words: Array.from({ length: 200 }, (_, i) => ({ term: `w${i}`, translation: `d${i}` })) }]
    })
    const rules = vocabRules(many)
    expect(rules).toContain('und 80 weitere')
    expect(rules).not.toContain('w150')
  })

  it('setzt Name, Klasse und Datum in den Kopf der Arbeit', () => {
    const ws = examToWorksheet(exam([part('en-reading')]))
    expect(ws.design.header.fields).toEqual({ name: true, class: true, date: true })
  })
})

describe('Nähere Vorgaben je Teil', () => {
  it('übernimmt die vorgegebene Textsorte', () => {
    const writing = part('en-writing', { contentShare: 40, points: 0, weight: 70, studentTextType: 'email' })
    const notes = partNotes(writing)
    expect(notes).toContain('TEXTSORTE VORGEGEBEN')
    expect(notes).toContain('E-Mail')
    expect(notes).toContain('brief.textType = "email"')
  })

  it('übernimmt freie Vorgaben der Lehrkraft', () => {
    const reading = part('en-reading', { notes: 'Sachtext über ein Musikfestival.' })
    expect(partNotes(reading)).toContain('VORGABEN DER LEHRKRAFT')
    expect(partNotes(reading)).toContain('Musikfestival')
    // Und sie landen im Auftrag für den Teil
    expect(partPrompt(exam([]), reading, 1)).toContain('Musikfestival')
  })

  it('bleibt ohne Vorgaben leer', () => {
    expect(partNotes(part('en-reading'))).toBe('')
    expect(partNotes(part('en-writing', { studentTextType: '' }))).toBe('')
  })
})

describe('Hilfsmittel in der Sprache des Faches', () => {
  it('übersetzt die Vorschläge und lässt eigenen Text stehen', () => {
    expect(translateAids('einsprachiges Wörterbuch', 'en')).toBe('a monolingual dictionary')
    expect(translateAids('einsprachiges Wörterbuch, Vokabelheft', 'en')).toBe('a monolingual dictionary, your vocabulary notebook')
    expect(translateAids('keine Hilfsmittel', 'en')).toBe('no dictionaries or other aids')
    // In Geschichte bleibt alles deutsch
    expect(translateAids('einsprachiges Wörterbuch', 'de')).toBe('einsprachiges Wörterbuch')
    // Frei eingetippter Text geht nicht verloren
    expect(translateAids('Liste der Operatoren von Frau M.', 'en')).toBe('Liste der Operatoren von Frau M.')
    expect(translateAids('', 'en')).toBe('')
  })

  it('kennt zu jedem Vorschlag eine englische Entsprechung', () => {
    for (const aid of AIDS_SUGGESTIONS) expect(translateAids(aid, 'en')).not.toBe(aid)
  })
})

describe('Kopf der Arbeit in der Sprache des Faches', () => {
  it('beschriftet eine Englischarbeit durchgehend englisch – auch für PDF und Word', () => {
    const ws = examToWorksheet(exam([part('en-reading')]))
    expect(ws.meta.labelLanguage).toBe('en')
    expect(ws.meta.subjectLabel).toBe('English')
    // Ein eigener Titel der Lehrkraft bleibt stehen, sonst steht dort der englische Standard
    expect(ws.meta.title).toBe('2. Klassenarbeit')
    expect(examToWorksheet(exam([part('en-reading')], { title: '' })).meta.title).toBe('English test')
  })
})

describe('Gymnasiale Oberstufe: nur Originalmaterial', () => {
  it('erkennt die Oberstufe und schaltet Originalquellen ein', () => {
    expect(upperSecondary(exam([], { grade: 9 }).meta)).toBe(false)
    expect(upperSecondary(exam([], { grade: 11 }).meta)).toBe(true)
    // Klasse 9: KI-Material erlaubt, keine Bildsuche
    const sek1 = worksheetMetaFor(exam([], { grade: 9 }))
    expect(sek1.originalSources).toBe('off')
    expect(sek1.imageSource).toBe('placeholder')
    // Oberstufe: Originalquellen und Bilder aus dem Internet
    const sek2 = worksheetMetaFor(exam([], { grade: 12 }))
    expect(sek2.originalSources).toBe('on')
    expect(sek2.imageSource).toBe('web')
  })

  it('schreibt die Vorgabe in den Auftrag an die KI', () => {
    expect(upperSecondaryRules(exam([], { grade: 9 }).meta)).toBe('')
    const rules = upperSecondaryRules(exam([], { grade: 12 }).meta)
    expect(rules).toContain('KEIN von einer KI erfundenes Material')
    expect(rules).toContain('Quellenangabe')
    const prompt = partPrompt(exam([], { grade: 12 }), part('en-reading'), 1)
    expect(prompt).toContain('OBERSTUFE – NUR ORIGINALMATERIAL')
    expect(prompt).toContain('ORIGINALQUELLEN')
    // In der Mittelstufe steht die Vorgabe nicht im Auftrag
    expect(partPrompt(exam([], { grade: 9 }), part('en-reading'), 1)).not.toContain('OBERSTUFE')
  })
})
