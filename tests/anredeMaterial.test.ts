/**
 * Anrede der Lernenden auf dem MATERIAL (Paket 8b, Entscheidung der Lehrkraft 25.09.2026):
 * Deutschsprachige Texte für die Sekundarstufe II siezen („Erläutern Sie …"), sonst duzen
 * („Erkläre …"). Fremdsprachige Anweisungen sind nicht betroffen.
 *
 * Geprüft wird jeder Erzeugungsweg einzeln – eine Regel im Arbeitsblatt galt in diesem
 * Projekt schon mehrfach nicht im Nachbarmodul –, die festen Texte der App in beiden Formen
 * und die lokale Prüfung, die falsche Anrede meldet, ohne bei Material anzuschlagen.
 */
import { describe, expect, it } from 'vitest'
import { ANREDE_TEXTE, anredeFuerStufe, anredeRegel, falscheAnrede } from '../src/renderer/src/shared/anrede'
import { evidenceInstruction } from '../src/renderer/src/shared/evidenceInstruction'
import { anredeFuer, anredeFuerMeta, checkAnrede } from '../src/renderer/src/modules/arbeitsblatt/didactics/anrede'
import { buildLearnerProfile, stageForGrade } from '../src/renderer/src/modules/arbeitsblatt/didactics/profile'
import { gehoertZurSekII, gymnasialerBildungsgang } from '../src/renderer/src/modules/arbeitsblatt/didactics/bildungsgang'
import { playsLabelFor } from '../src/renderer/src/modules/arbeitsblatt/didactics/audioRules'
import { systemPrompt } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { regenerateBlock } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { generateExample } from '../src/renderer/src/modules/arbeitsblatt/generation/example'
import { convertBlock } from '../src/renderer/src/modules/arbeitsblatt/generation/convert'
import { emptyAnswer, istLeer, newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { contextFor } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import type { Sheet, TaskBlock, Worksheet, WorksheetMeta, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { createRng } from '../src/renderer/src/modules/vokabeltest/model/random'
import { newTest } from '../src/renderer/src/modules/grammatiktest/model/defaults'
import { testPrompt } from '../src/renderer/src/modules/grammatiktest/generation/generateTest'
import { testToWorksheet } from '../src/renderer/src/modules/grammatiktest/render/testWorksheet'
import { emptyKurztest } from '../src/renderer/src/modules/lernzielkontrolle/model/defaults'
import { kurztestPrompt } from '../src/renderer/src/modules/lernzielkontrolle/generation/generateKurztest'
import { pruefeKurztest } from '../src/renderer/src/modules/lernzielkontrolle/didactics/pruefungen'
import { profilFuer } from '../src/renderer/src/modules/lernzielkontrolle/didactics/operatoren'
import { worksheetMetaForKurztest } from '../src/renderer/src/modules/lernzielkontrolle/render/kurztestWorksheet'
import type { Kurztest } from '../src/renderer/src/modules/lernzielkontrolle/model/types'
import { reviseExamPart } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { anredeHinweise, systemPrompt as vokabelPrompt } from '../src/renderer/src/modules/vokabeltest/generation/generate'
import { TASK_TYPES } from '../src/renderer/src/modules/vokabeltest/generation/taskTypes'
import type { Block, TestSettings } from '../src/renderer/src/modules/vokabeltest/model/types'
import { presetDesigns } from '@shared/design'

const SIE_REGEL = /ANREDE \(verbindlich, Sekundarstufe II\).*Sie-Form/
const DU_REGEL = /ANREDE \(verbindlich, Sekundarstufe I\).*du-Form/

const meta = (over: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'geschichte',
  subjectLabel: 'Geschichte',
  topic: 'Weimarer Republik',
  grade: 8,
  ...over
})

const aufgabe = (id: string, instruction: string, teile: string[] = []): TaskBlock => ({
  id,
  type: 'task',
  instruction,
  operator: '',
  afb: 'II',
  afbReason: '',
  socialForm: 'EA',
  answer: emptyAnswer('lines'),
  parts: teile.map((t, i) => ({ id: `${id}-${i}`, instruction: t, answer: emptyAnswer('lines'), solution: '' })),
  solution: 'Lösung',
  points: 0,
  minutes: 5
})

const text = (id: string, body: string): WsBlock => ({ id, type: 'text', title: 'M1', body, lineNumbers: false, source: '', glossary: [] }) as WsBlock

const blatt = (blocks: WsBlock[]): Sheet => ({ id: 's', label: 'Arbeitsblatt', blocks })

describe('Stufe → Anrede: Sek II siezen, auch in der G8-Einführungsphase', () => {
  it('siezt ab Klasse 11 wie stageForGrade – in G9-Ländern überall genau dort', () => {
    for (const schule of ['gymnasium', 'gesamtschule', 'realschule', 'grundschule']) {
      for (let k = 1; k <= 13; k++) {
        expect(anredeFuer(k, schule, 'NI'), `${schule} ${k}`).toBe(stageForGrade(k, schule) === 'sek2' ? 'sie' : 'du')
      }
    }
    expect(anredeFuerStufe('primar')).toBe('du')
  })

  it('G8 Klasse 10 Sie, G9 Klasse 10 du, Klasse 11 Sie, Klasse 9 du', () => {
    // Sachsen, Berlin, Thüringen: G8 – Klasse 10 ist Einführungsphase
    for (const land of ['SN', 'BE', 'TH', 'HH']) {
      expect(anredeFuer(10, 'gymnasium', land), land).toBe('sie')
      expect(anredeFuer(9, 'gymnasium', land), land).toBe('du')
      expect(anredeFuer(11, 'gymnasium', land), land).toBe('sie')
    }
    // Niedersachsen, NRW, Bayern: G9 – Klasse 10 ist noch Sek I
    for (const land of ['NI', 'NW', 'BY']) {
      expect(anredeFuer(10, 'gymnasium', land), land).toBe('du')
      expect(anredeFuer(11, 'gymnasium', land), land).toBe('sie')
      expect(anredeFuer(9, 'gymnasium', land), land).toBe('du')
    }
    // Schulformen mit eigener Oberstufe führen in neun Jahren zum Abitur – auch in G8-Ländern
    expect(anredeFuer(10, 'stadtteilschule', 'HH')).toBe('du')
    expect(anredeFuer(10, 'integrierte-sekundarschule', 'BE')).toBe('du')
    expect(anredeFuer(11, 'stadtteilschule', 'HH')).toBe('sie')
    // Die übrigen Stufenregeln bleiben bewusst bei Sek I (bildungsgang.ts)
    expect(stageForGrade(10, 'gymnasium')).toBe('sek1')
  })

  it('Länder im Übergang zu G9: der Jahrgang entscheidet', () => {
    const herbst = (jahr: number): Date => new Date(jahr, 8, 15)
    // Baden-Württemberg: erster G9-Jahrgang in Klasse 5 im Schuljahr 2024/25
    expect(gymnasialerBildungsgang(10, 'gymnasium', 'BW', null, herbst(2026))).toBe('G8')
    expect(gehoertZurSekII(10, 'gymnasium', 'BW', null, herbst(2026))).toBe(true)
    expect(gymnasialerBildungsgang(10, 'gymnasium', 'BW', null, herbst(2029))).toBe('G9')
    expect(gehoertZurSekII(10, 'gymnasium', 'BW', null, herbst(2029))).toBe(false)
    expect(gymnasialerBildungsgang(7, 'gymnasium', 'BW', null, herbst(2026))).toBe('G9')
  })

  it('die Schuleinstellung der Lehrkraft geht für die eigene Schule vor', () => {
    const g8Hessen = { stateId: 'HE', schoolTypeId: 'gymnasium', abiturNach: 'G8' as const }
    expect(gehoertZurSekII(10, 'gymnasium', 'HE', null)).toBe(false)
    expect(gehoertZurSekII(10, 'gymnasium', 'HE', g8Hessen)).toBe(true)
    // … aber nur für die eigene Schule: ein Blatt für ein anderes Land folgt dessen Regel
    expect(gehoertZurSekII(10, 'gymnasium', 'NI', g8Hessen)).toBe(false)
    // Thüringer Gemeinschaftsschule mit Abitur nach Klasse 12
    expect(gehoertZurSekII(10, 'gemeinschaftsschule', 'TH', { stateId: 'TH', schoolTypeId: 'gemeinschaftsschule', abiturNach: 'G8' })).toBe(true)
    expect(gehoertZurSekII(10, 'gemeinschaftsschule', 'TH', null)).toBe(false)
    // „wie im Land üblich" ändert nichts; G9 an einer G8-Landesschule hebt die Einführungsphase auf
    expect(gehoertZurSekII(10, 'gymnasium', 'SN', { stateId: 'SN', schoolTypeId: 'gymnasium', abiturNach: 'land' })).toBe(true)
    expect(gehoertZurSekII(10, 'gymnasium', 'SN', { stateId: 'SN', schoolTypeId: 'gymnasium', abiturNach: 'G9' })).toBe(false)
  })

  it('G8 Klasse 10 in allen Erzeugungswegen: Arbeitsblatt, Grammatiktest, Lernzielkontrolle', () => {
    const m = meta({ stateId: 'SN', grade: 10 })
    expect(anredeFuerMeta(m)).toBe('sie')
    expect(systemPrompt(m, buildLearnerProfile(m))).toMatch(SIE_REGEL)
    expect(systemPrompt(meta({ stateId: 'NI', grade: 10 }), buildLearnerProfile(meta({ stateId: 'NI', grade: 10 })))).toMatch(DU_REGEL)
    const gt = newTest(presetDesigns()[0], 'SN', 'gymnasium', 'Gymnasium')
    gt.meta = { ...gt.meta, subjectId: 'deutsch', subjectLabel: 'Deutsch', grade: 10, topics: [] }
    expect(testPrompt(gt)).toMatch(SIE_REGEL)
    const lzk = emptyKurztest('SN', 'gymnasium', 'Gymnasium')
    lzk.meta = { ...lzk.meta, subjectId: 'mathematik', subjectLabel: 'Mathematik', grade: 10, stufe: 'sek1', thema: 'Potenzen' }
    expect(worksheetMetaForKurztest(lzk).anrede).toBe('sie')
    expect(kurztestPrompt(lzk, '')).toMatch(SIE_REGEL)
    lzk.meta = { ...lzk.meta, stateId: 'NI' }
    expect(worksheetMetaForKurztest(lzk).anrede).toBe('du')
  })

  it('eine ausdrücklich gesetzte Anrede (LZK) geht vor', () => {
    expect(anredeFuerMeta(meta({ grade: 9, anrede: 'sie' }))).toBe('sie')
    expect(anredeFuerMeta(meta({ grade: 12 }))).toBe('sie')
  })
})

describe('Die Regel steht in jedem Erzeugungsweg', () => {
  it('Arbeitsblatt (und alle Nebenwege über denselben Systemauftrag)', () => {
    const p8 = systemPrompt(meta({ grade: 8 }), buildLearnerProfile(meta({ grade: 8 })))
    const p12 = systemPrompt(meta({ grade: 12 }), buildLearnerProfile(meta({ grade: 12 })))
    expect(p8).toMatch(DU_REGEL)
    expect(p8).not.toMatch(SIE_REGEL)
    expect(p12).toMatch(SIE_REGEL)
    // Die du-Beispiele in den Aufträgen sind ausdrücklich umzuformen
    expect(p12).toMatch(/du-Form stehen.*überträgst du in die Sie-Form/)
  })

  it('Arbeitsblatt: gelöstes Beispiel („Punkt 0") mit eigenem Auftrag', async () => {
    const systeme: string[] = []
    const ai = async <T>(req: { system: string }): Promise<T> => {
      systeme.push(req.system)
      return { instruction: 'Beispiel', options: [], correct: 0, solution: 'x' } as T
    }
    await generateExample(aufgabe('t', 'Ordne zu.'), meta({ grade: 12 }), ai as never)
    await generateExample(aufgabe('t', 'Ordne zu.'), meta({ grade: 7 }), ai as never)
    expect(systeme[0]).toMatch(SIE_REGEL)
    expect(systeme[1]).toMatch(DU_REGEL)
  })

  it('Grammatiktest: nur bei deutschen Anweisungen', () => {
    const design = presetDesigns()[0]
    const gt = (patch: object) => {
      const t = newTest(design, 'NI', 'gymnasium', 'Gymnasium')
      return { ...t, meta: { ...t.meta, ...patch } }
    }
    expect(testPrompt(gt({ subjectId: 'deutsch', subjectLabel: 'Deutsch', grade: 12, topics: [] }))).toMatch(SIE_REGEL)
    expect(testPrompt(gt({ subjectId: 'deutsch', subjectLabel: 'Deutsch', grade: 7, topics: [] }))).toMatch(DU_REGEL)
    expect(testPrompt(gt({ subjectId: 'englisch', subjectLabel: 'Englisch', grade: 12, topics: [], instructionsInGerman: true }))).toMatch(SIE_REGEL)
    // Englische Anweisungen: keine deutsche Anrede-Regel
    expect(testPrompt(gt({ subjectId: 'englisch', subjectLabel: 'Englisch', grade: 12, topics: [], instructionsInGerman: false }))).not.toMatch(/ANREDE/)
  })

  it('Lernzielkontrolle: nach der gewählten Stufe, nicht nach der Anrede der Landesliste', () => {
    const lzk = (stateId: string, stufe: 'sek1' | 'sek2'): Kurztest => {
      const t = emptyKurztest(stateId, 'gymnasium', 'Gymnasium')
      t.meta = { ...t.meta, subjectId: 'mathematik', subjectLabel: 'Mathematik', grade: stufe === 'sek2' ? 11 : 8, stufe, thema: 'Potenzen' }
      return t
    }
    // Sachsen führt eine Sek-I-Liste in der Sie-Form – die Regel der Lehrkraft geht vor
    expect(profilFuer('SN', 'mathematik', 'sek1')!.anrede).toBe('sie')
    const sn = kurztestPrompt(lzk('SN', 'sek1'), '')
    expect(sn).toMatch(DU_REGEL)
    expect(sn).not.toMatch(SIE_REGEL)
    expect(kurztestPrompt(lzk('NW', 'sek2'), '')).toMatch(SIE_REGEL)
    expect(kurztestPrompt(lzk('BY', 'sek1'), '')).toMatch(DU_REGEL)
  })

  it('Klassenarbeit: Überarbeitung eines Teils', async () => {
    const systeme: string[] = []
    const ai = async <T>(req: { system: string }): Promise<T> => {
      systeme.push(req.system)
      return { blocks: [] } as T
    }
    const teil: ExamPart = {
      id: 'p',
      formatId: 'ge-source',
      label: 'Quelle',
      competence: '',
      weight: 100,
      points: 20,
      minutes: 45,
      gradeGroup: 'other',
      afbMix: { I: 30, II: 40, III: 30 },
      blocks: []
    }
    const arbeit = (grade: number): Exam =>
      ({
        version: 1,
        design: presetDesigns()[0],
        parts: [teil],
        createdAt: '',
        meta: {
          title: 'Klausur',
          subjectId: 'geschichte',
          subjectLabel: 'Geschichte',
          topic: 'Weimar',
          content: '',
          stateId: 'NI',
          schoolTypeId: 'gymnasium',
          schoolTypeName: 'Gymnasium',
          grade,
          courseLevel: 'mixed',
          cefrLevel: 'B1',
          grammarTopic: '',
          vocab: [],
          infoBox: true,
          minutes: 90,
          points: 20,
          aids: '',
          variants: 1,
          gradeScale: true,
          separateWritingGrade: false,
          answerKey: true,
          answerKeyDetail: 'knapp',
          teacherNote: ''
        }
      }) as unknown as Exam
    await reviseExamPart(arbeit(12), teil, 1, 'kürzer', ai as never)
    await reviseExamPart(arbeit(8), teil, 1, 'kürzer', ai as never)
    expect(systeme[0]).toMatch(SIE_REGEL)
    expect(systeme[1]).toMatch(DU_REGEL)
  })

  it('Vokabeltest: nur Latein – dort stehen die Anweisungen auf Deutsch', () => {
    const s = (targetLanguage: string, grade: number): TestSettings =>
      ({ targetLanguage, stateId: 'NI', schoolTypeId: 'gymnasium', languageOrder: 2, grade, level: 'A1', tasks: [] }) as unknown as TestSettings
    expect(vokabelPrompt(s('la', 12))).toMatch(SIE_REGEL)
    expect(vokabelPrompt(s('la', 7))).toMatch(DU_REGEL)
    expect(vokabelPrompt(s('en', 12))).not.toMatch(/ANREDE/)
  })
})

describe('Feste Texte der App in beiden Formen', () => {
  it('jede Form ist die ihre', () => {
    for (const [name, formen] of Object.entries(ANREDE_TEXTE)) {
      expect(falscheAnrede(formen.du, 'du'), `${name} du`).toBeNull()
      expect(falscheAnrede(formen.sie, 'sie'), `${name} Sie`).toBeNull()
      // … und die Prüfung erkennt die jeweils andere
      expect(falscheAnrede(formen.du, 'sie'), `${name} du in Sek II`).not.toBeNull()
      expect(falscheAnrede(formen.sie, 'du'), `${name} Sie in Sek I`).not.toBeNull()
    }
  })

  it('Lernziel-Kasten und Hilfsblatt: neuer Baustein und KI-Baustein ohne Überschrift', () => {
    expect((newBlock('learningGoals', 'sie') as { title: string }).title).toBe('Das lernen Sie')
    expect((newBlock('learningGoals') as { title: string }).title).toBe('Das lernst du')
    expect((newBlock('phrases', 'sie') as { hint: string }).hint).toBe('Diese Wendungen helfen Ihnen bei den Aufgaben.')
    const ki = convertBlock({ type: 'learningGoals', title: '', items: ['Ich kann …'] }, createRng(1), [], 'sie') as { title: string }
    expect(ki.title).toBe('Das lernen Sie')
    // Beide Formen gelten als Platzhalter, nicht als Inhalt
    expect(istLeer(newBlock('learningGoals', 'sie'))).toBe(istLeer(newBlock('learningGoals', 'du')))
  })

  it('Hörtext, Textbeleg und Darstellung folgen der Stufe', () => {
    expect(playsLabelFor('geschichte', 1, 'sie')).toBe('so oft anhören, wie Sie möchten')
    expect(playsLabelFor('geschichte', 1)).toBe('so oft anhören, wie du möchtest')
    expect(evidenceInstruction('de', 'sie').instruction).toMatch(/^Kreuzen Sie an/)
    expect(evidenceInstruction('de').instruction).toMatch(/^Kreuze an/)
    // Fremdsprachige Fassung unberührt
    expect(evidenceInstruction('en', 'sie').instruction).toMatch(/^Tick/)
    const ws = {
      meta: meta({ grade: 12 }),
      design: presetDesigns()[0],
      sheets: [],
      sources: [],
      outline: null,
      version: 1,
      createdAt: ''
    } as unknown as Worksheet
    expect(contextFor(ws, blatt([]), 'print').anrede).toBe('sie')
  })

  it('Lernzielkontrolle reicht ihre gewählte Stufe an das Blatt durch', () => {
    const t = emptyKurztest('NI', 'gymnasium', 'Gymnasium')
    t.meta = { ...t.meta, grade: 10, stufe: 'sek2' }
    expect(worksheetMetaForKurztest(t).anrede).toBe('sie')
  })
})

describe('Die Prüfung meldet falsche Anrede – und schweigt bei Material', () => {
  it('Sek II: du-Formen und du-Imperative', () => {
    expect(falscheAnrede('Erkläre, warum die Republik scheiterte.', 'sie')).toBe('Erkläre')
    expect(falscheAnrede('Lies M1 und begründe deine Meinung.', 'sie')).not.toBeNull()
    expect(falscheAnrede('**Analysiere** die Rede.', 'sie')).toBe('Analysiere')
    expect(falscheAnrede('Erläutern Sie die Ursachen der Inflation.', 'sie')).toBeNull()
    expect(falscheAnrede('Beurteilen Sie Ihre Ergebnisse.', 'sie')).toBeNull()
  })

  it('Sek I: Sie-Imperative und Ihr… mitten im Satz', () => {
    expect(falscheAnrede('Erläutern Sie die Ursachen.', 'du')).toBe('Erläutern Sie')
    expect(falscheAnrede('Begründe Ihre Antwort.', 'du')).toBe('Ihre')
    expect(falscheAnrede('Erkläre die Ursachen.', 'du')).toBeNull()
    // „Sie" am Satzanfang meint meist „sie" (Plural)
    expect(falscheAnrede('Sie leben im Wald. Beschreibe, wie sie jagen.', 'du')).toBeNull()
  })

  it('Fehlalarme bleiben aus: Zitate, Titel, Beispielsätze in Anführung', () => {
    expect(falscheAnrede('Erläutern Sie den Satz „Du bist nichts, dein Volk ist alles".', 'sie')).toBeNull()
    expect(falscheAnrede('Lies den Brief „Können Sie mir helfen?“ und beschreibe die Bitte.', 'du')).toBeNull()
    // Französisch mit deutschen Anweisungen: der Teilungsartikel „du" ist keine Anrede
    expect(falscheAnrede('Ergänzen Sie du, de la oder des.', 'sie', { fremdsprache: 'fr' })).toBeNull()
  })

  it('seltene Imperative aus allen Operatorenlisten, regelhaft gebildet (Sek II)', () => {
    const sek2 = (t: string): string | null => falscheAnrede(t, 'sie')
    expect(sek2('Skizziere den Verlauf der Kurve.')).toBe('Skizziere')
    expect(sek2('Erörtere die These des Autors.')).toBe('Erörtere')
    expect(sek2('Beurteile die Maßnahme.')).toBe('Beurteile')
    expect(sek2('Problematisiere die Aussage.')).toBe('Problematisiere')
    expect(sek2('Charakterisiere die Hauptfigur.')).toBe('Charakterisiere')
    // e→i-Wechsel, auch mit Vorsilbe
    expect(sek2('Lies M2.')).toBe('Lies')
    expect(sek2('Nimm Stellung zur These.')).toBe('Nimm')
    expect(sek2('Entwirf ein Plakat.')).toBe('Entwirf')
    expect(sek2('Entnimm der Tabelle die Werte.')).toBe('Entnimm')
    expect(sek2('Sieh dir die Karikatur an.')).not.toBeNull()
    expect(sek2('Gib die Definition an.')).toBe('Gib')
    expect(sek2('Hilf deinem Partner.')).not.toBeNull()
    // trennbare Verben: Grundverb vorn, Vorsilbe am Ende
    expect(sek2('Setze die fehlenden Wörter ein.')).toBe('Setze')
    expect(sek2('Ordne die Begriffe zu.')).toBe('Ordne')
    expect(sek2('Werte die Umfrage aus.')).toBe('Werte')
    expect(sek2('Stelle die Entwicklung grafisch dar.')).toBe('Stelle')
    // -eln und -ern
    expect(sek2('Ermittle den Schnittpunkt.')).toBe('Ermittle')
    expect(sek2('Verallgemeinere das Ergebnis.')).toBe('Verallgemeinere')
    // im Satz, nach Komma
    expect(sek2('Lesen Sie M1, erörtere dann die Frage.')).not.toBeNull()
    expect(sek2('Lesen Sie M1 und skizziere den Aufbau.')).toBe('skizziere')
    // Verbformen der 2. Person und „ihr" als Anrede
    expect(sek2('Wenn ihr fertig seid, vergleichen Sie.')).toBe('seid')
    expect(sek2('Tauscht euch aus.')).toBe('euch')
    expect(sek2('Arbeitet ihr zu zweit.')).not.toBeNull()
    expect(sek2('Überlege, was du weißt.')).not.toBeNull()
  })

  it('seltene Sie-Formen in der Sek I', () => {
    const sek1 = (t: string): string | null => falscheAnrede(t, 'du')
    expect(sek1('Skizzieren Sie den Verlauf.')).toBe('Skizzieren Sie')
    expect(sek1('Nehmen Sie Stellung zur These.')).toBe('Nehmen Sie')
    expect(sek1('Setzen Sie die fehlenden Wörter ein.')).toBe('Setzen Sie')
    expect(sek1('b) Erörtern Sie die These.')).toBe('Erörtern Sie')
    expect(sek1('Lies M1 und beurteilen Sie die Rede.')).toBe('Sie')
    expect(sek1('Lies M1. Was meinen Sie?')).toBe('Sie')
    // die du-Formen selbst sind in der Sek I richtig
    for (const t of ['Skizziere den Verlauf.', 'Nimm Stellung.', 'Setze ein.', 'Lies M2 und erörtere.', 'Entwirf ein Plakat.', 'Tauscht euch aus.']) {
      expect(sek1(t), t).toBeNull()
    }
  })

  it('Fehlalarme bleiben aus: Nomen am Satzanfang, „sie" als 3. Person, Mathematik', () => {
    const sek2 = (t: string): string | null => falscheAnrede(t, 'sie')
    // Formen, die zugleich Nomen sind
    expect(sek2('Teile der Bevölkerung litten Hunger. Erläutern Sie die Ursachen.')).toBeNull()
    expect(sek2('Frage 3: Beurteilen Sie die Maßnahme.')).toBeNull()
    expect(sek2('Werte der Tabelle: Berechnen Sie den Mittelwert.')).toBeNull()
    expect(sek2('Rede des Kanzlers (M2). Analysieren Sie die Rede.')).toBeNull()
    expect(sek2('Stelle 2 im Text: Erläutern Sie sie.')).toBeNull()
    expect(sek2('Folge 3 der Serie zeigt den Konflikt. Beschreiben Sie ihn.')).toBeNull()
    // Mathematik: Konjunktiv und 3. Person
    expect(sek2('Sei f eine Funktion. Zeigen Sie, dass f stetig ist.')).toBeNull()
    expect(sek2('Gilt die Gleichung für alle x? Begründen Sie.')).toBeNull()
    // „ihr" als Besitzwort, „Sie" am Satzanfang als 3. Person Plural
    expect(sek2('Hat ihr Vater recht? Begründen Sie Ihre Antwort.')).toBeNull()
    expect(sek2('Einige Historiker widersprechen. Nehmen Sie Stellung.')).toBeNull()
    const sek1 = (t: string): string | null => falscheAnrede(t, 'du')
    expect(sek1('Sie leben im Wald. Beschreibe, wie sie jagen.')).toBeNull()
    expect(sek1('Ihr Mann war Arzt. Beschreibe sein Leben.')).toBeNull()
    expect(sek1('Sie erläutern die Ursachen. Vergleiche ihre Argumente.')).toBeNull()
    // Zitate und wörtliche Rede behalten ihre Anrede
    expect(sek2('Deuten Sie den Satz „Nimm dir, was du brauchst".')).toBeNull()
    expect(sek1('Erkläre den Satz „Setzen Sie sich!".')).toBeNull()
  })

  it('Blattprüfung: Aufgaben und Hilfen ja, Material nein', () => {
    const sek2 = meta({ grade: 12 })
    const s = blatt([
      text('m1', 'Du musst verstehen, sagte der Vater zu seinem Sohn. Kannst du das?'),
      aufgabe('a1', 'Analysieren Sie M1.'),
      aufgabe('a2', 'Erkläre die Haltung des Vaters.'),
      { id: 'h', type: 'scaffold', variant: 'tipp', title: 'Tipp', items: ['Achte auf die Wortwahl.'] } as WsBlock
    ])
    const befunde = checkAnrede(s, sek2).map((w) => w.message)
    expect(befunde).toHaveLength(2)
    expect(befunde[0]).toMatch(/^Aufgabe 2: „Erkläre"/)
    expect(befunde[1]).toMatch(/^Tipp: „Achte"/)
    // Dasselbe Blatt in Klasse 8: die Aufgabe in Sie-Form fällt auf, das Material nicht
    expect(checkAnrede(s, meta({ grade: 8 })).map((w) => w.message)).toEqual([expect.stringMatching(/^Aufgabe 1: „Analysieren Sie"/)])
    // Englische Anweisungen werden nicht geprüft
    expect(checkAnrede(blatt([aufgabe('e', 'Explain the cartoon.')]), meta({ subjectId: 'englisch', subjectLabel: 'Englisch', grade: 12 }))).toEqual([])
  })

  it('Arbeitsblatt: auch ein einzeln neu erzeugter Baustein wird geprüft', async () => {
    const ws = {
      version: 1,
      meta: meta({ grade: 12 }),
      design: presetDesigns()[0],
      outline: null,
      sheets: [blatt([aufgabe('a1', 'Erläutern Sie M1.'), aufgabe('a2', 'Nennen Sie zwei Gründe.')])],
      sources: [],
      createdAt: ''
    } as unknown as Worksheet
    const ai = async <T>(): Promise<T> => ({ block: { type: 'task', instruction: 'Nenne zwei Gründe.', parts: [], solution: 'x' } }) as T
    const neu = await regenerateBlock(ws, ws.sheets[0], 'a2', buildLearnerProfile(ws.meta), ai as never)
    expect(neu.warnings?.some((w) => /^\[Prüfung\] Aufgabe 2: „Nenne"/.test(w))).toBe(true)
  })

  it('Grammatiktest: die Blattprüfung sieht die Aufgaben, nicht den Kopfkasten', () => {
    const t = newTest(presetDesigns()[0], 'NI', 'gymnasium', 'Gymnasium')
    const gt = { ...t, meta: { ...t.meta, subjectId: 'deutsch', subjectLabel: 'Deutsch', grade: 11 }, blocks: [aufgabe('g', 'Setze die richtige Form ein.')] }
    const ws = testToWorksheet(gt)
    expect(checkAnrede(ws.sheets[0], ws.meta).map((w) => w.message)).toEqual([expect.stringMatching(/„Setze"/)])
  })

  it('Lernzielkontrolle: Befund im Bereich „Anrede", als Hinweis', () => {
    const t = emptyKurztest('BY', 'gymnasium', 'Gymnasium')
    t.meta = { ...t.meta, subjectId: 'mathematik', subjectLabel: 'Mathematik', grade: 11, stufe: 'sek2', thema: 'Ableitungen' }
    t.varianten = [{ id: 'v1', label: '', blocks: [aufgabe('a', '**Berechne** die Ableitung.', ['$f(x)=x^2$'])] }]
    const anrede = pruefeKurztest(t).filter((b) => b.bereich === 'Anrede')
    expect(anrede).toHaveLength(1)
    expect(anrede[0].schwere).toBe('hinweis')
    t.meta.stufe = 'sek1'
    expect(pruefeKurztest(t).filter((b) => b.bereich === 'Anrede')).toEqual([])
  })

  it('Vokabeltest (Latein): Hinweis am Block, feste Anweisung in beiden Formen', () => {
    const s = (grade: number): TestSettings =>
      ({ targetLanguage: 'la', stateId: 'NI', schoolTypeId: 'gymnasium', languageOrder: 2, grade, level: 'A1', tasks: [] }) as unknown as TestSettings
    const block = { instruction: 'Kreuze die Bedeutung an, die im Satz passt.' } as Block
    expect(anredeHinweise(block, s(12))).toHaveLength(1)
    expect(anredeHinweise(block, s(7))).toEqual([])
    expect(anredeHinweise(block, { ...s(12), targetLanguage: 'en' })).toEqual([])
    const lateinisch = Object.values(TASK_TYPES).filter((d) => d.defaultInstructionSie)
    expect(lateinisch.length).toBeGreaterThanOrEqual(4)
    for (const d of lateinisch) {
      expect(falscheAnrede(d.defaultInstruction, 'du'), d.id).toBeNull()
      expect(falscheAnrede(d.defaultInstructionSie!, 'sie'), d.id).toBeNull()
      expect(falscheAnrede(d.defaultInstruction, 'sie'), d.id).not.toBeNull()
    }
  })
})

describe('Regeltext', () => {
  it('nennt Zitate, Quellen und Fremdsprachen als Ausnahme', () => {
    for (const a of ['du', 'sie'] as const) {
      expect(anredeRegel(a)).toMatch(/Wörtliche Zitate, Quellentexte, Rollentexte/)
      expect(anredeRegel(a)).toMatch(/Fremdsprachige Arbeitsanweisungen/)
    }
  })
})
