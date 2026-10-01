import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import {
  aufgabenAnpassenAuftrag,
  hoertextAufgaben,
  hoertextWunschAusfuehren,
  skriptWunschAuftrag,
  wendeHoertextWunschAn
} from '../src/renderer/src/modules/arbeitsblatt/generation/hoertextWunsch'
import { regelVorschlaege } from '../src/renderer/src/shared/kiWunsch'
import { aufnahmeVeraltet, hoerzeit, skriptFingerabdruck } from '../src/renderer/src/shared/verstehen/hoerzeit'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { LearnerProfile } from '../src/renderer/src/modules/arbeitsblatt/didactics/profile'
import type { AudioBlock, TaskBlock, WorksheetMeta, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Wunsch der Lehrkraft (01.10.2026): Änderungswunsch am Hörtext wie an jedem Baustein – die KI
 * ändert das SKRIPT, die Aufgaben dazu werden an das neue Skript angepasst (Aufbau und Nummern
 * bleiben, neu nur, was nicht mehr stimmt), eine Zusammenfassung sagt, was sich geändert hat.
 */
const meta: WorksheetMeta = {
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  topic: 'At school',
  grade: 8,
  cefrLevel: 'A2'
}

const ALT = [
  'Mr Clarkson: Good morning, Anna. You look tired today.',
  'Anna: Good morning. I could not sleep last night because of the storm.',
  'Mr Clarkson: Were you worried about the maths test on Tuesday?',
  'Anna: Yes. I still do not understand the fractions.',
  'Mr Clarkson: Then come to my room after lunch and we will practise together.'
].join('\n')
const NEU = ['Mr Clarkson: You look tired, Anna.', 'Anna: I could not sleep because of the storm.', 'Mr Clarkson: Is it the maths test on Wednesday?', 'Anna: Yes, the fractions.'].join(
  '\n'
)

const hoertext: AudioBlock = {
  id: 'h1',
  type: 'audio',
  title: 'Talking to the teacher',
  textType: 'Gespräch',
  transcript: ALT,
  speakers: [
    { id: 'h1-0', name: 'Mr Clarkson', voiceId: 'stimme-m', voiceName: 'Brian' },
    { id: 'h1-1', name: 'Anna', voiceId: 'stimme-w', voiceName: 'Rachel' }
  ],
  plays: 2,
  beforeListening: 'Du hörst ein Gespräch.',
  seconds: 30,
  audio: { fileName: 'h1.mp3', dataUrl: 'data:audio/mpeg;base64,', sekunden: 31, skript: skriptFingerabdruck(ALT) }
}

const mc: TaskBlock = {
  id: 'a1',
  type: 'task',
  instruction: 'Why is Anna tired?',
  operator: '',
  afbReason: '',
  socialForm: 'EA',
  answer: { ...emptyAnswer('multipleChoice'), options: ['the storm', 'a party', 'her brother'], correct: [0] },
  parts: [],
  solution: 'the storm',
  points: 1,
  minutes: 3,
  skill: 'listening',
  audioId: 'h1'
}
const rf: TaskBlock = {
  id: 'a2',
  type: 'task',
  instruction: 'True or false?',
  operator: '',
  afbReason: '',
  socialForm: 'EA',
  answer: {
    ...emptyAnswer('trueFalse'),
    statements: [
      { text: 'The maths test is on Tuesday.', isTrue: true },
      { text: 'Anna understands fractions.', isTrue: false }
    ]
  },
  parts: [],
  solution: '',
  points: 2,
  minutes: 4,
  skill: 'listening',
  audioId: 'h1'
}
const schreiben: TaskBlock = { ...mc, id: 'a3', skill: 'writing', audioId: undefined, instruction: 'Write an email.' }

/** KI-Attrappe: je Auftragsart eine Antwort, alle Anfragen werden gemerkt */
function attrappe(): { ai: <T>(r: StructuredRequest) => Promise<T>; anfragen: StructuredRequest[] } {
  const anfragen: StructuredRequest[] = []
  return {
    anfragen,
    ai: async <T,>(r: StructuredRequest): Promise<T> => {
      anfragen.push(r)
      if (r.schemaName === 'hoertext_wunsch')
        return {
          title: 'Talking to the teacher',
          textType: 'Gespräch',
          speakers: ['Mr Clarkson', 'Anna'],
          transcript: NEU,
          beforeListening: 'Du hörst ein kurzes Gespräch.',
          plays: 2,
          aenderungen: 'Gekürzt; der Test ist jetzt am Mittwoch.'
        } as T
      return {
        aufgaben: [
          { id: 'a1', geaendert: false, grund: '', block: {} },
          {
            id: 'a2',
            geaendert: true,
            grund: 'Aussage 1: Test jetzt am Mittwoch',
            block: {
              type: 'task',
              instruction: 'True or false?',
              answer: {
                kind: 'trueFalse',
                statements: [
                  { text: 'The maths test is on Wednesday.', isTrue: true },
                  { text: 'Anna understands fractions.', isTrue: false }
                ]
              },
              parts: [],
              solution: '',
              points: 0
            }
          }
        ],
        zusammenfassung: 'Aufgabe 2 an den neuen Testtag angepasst.'
      } as T
    }
  }
}

describe('Änderungswunsch am Hörtext', () => {
  it('Regelvorschläge für Hörtexte', () => {
    const v = regelVorschlaege({ typ: 'audio', inhalt: 'Hörtext', fachId: 'englisch' })
    expect(v).toEqual(expect.arrayContaining(['Kürzer', 'Langsamer und einfachere Sprache', 'Mehr Sprecherinnen und Sprecher', 'Mit regionalem Akzent oder Dialekt', 'Andere Situation']))
  })

  it('findet nur die Aufgaben zu diesem Hörtext', () => {
    expect(hoertextAufgaben([hoertext, mc, rf, schreiben], 'h1').map((a) => a.id)).toEqual(['a1', 'a2'])
  })

  it('der Skript-Auftrag nennt Wunsch, bisheriges Skript und die Regeln für vorgelesene Texte', () => {
    const t = skriptWunschAuftrag(hoertext, 'ueberarbeiten', 'Kürzer', meta)
    expect(t).toContain('Kürzer')
    expect(t).toContain(ALT)
    expect(t).toMatch(/Computerstimme/)
    expect(t).toMatch(/Wunsch der Lehrkraft geht den allgemeinen Regeln vor/)
  })

  it('der Aufgaben-Auftrag zeigt altes und neues Skript und hält die Qualitätsregeln für Items', () => {
    const t = aufgabenAnpassenAuftrag(ALT, NEU, [mc, rf], meta)
    expect(t.indexOf('BISHERIGES Skript')).toBeLessThan(t.indexOf('NEUES Skript'))
    expect(t).toContain('[a1]')
    expect(t).toContain('[a2]')
    expect(t).toMatch(/Distraktoren gleich lang/)
    expect(t).toMatch(/Nummerierung bleiben/)
    // In Niedersachsen (Sek I) ist Richtig/Falsch nicht zugelassen – die Regel geht mit
    expect(t).toMatch(/KEINE Richtig\/Falsch|Richtig\/Falsch/)
  })

  it('„kürzer": neues Skript, nur die betroffene Aufgabe angepasst, Rest unverändert, ein Schritt', async () => {
    const { ai, anfragen } = attrappe()
    const bloecke: WsBlock[] = [hoertext, mc, rf, schreiben]
    const erg = await hoertextWunschAusfuehren({
      listen: [bloecke],
      audioId: 'h1',
      art: 'ueberarbeiten',
      wunsch: 'Kürzer',
      meta,
      profile: {} as LearnerProfile,
      ai,
      system: 'SYSTEM'
    })
    expect(anfragen.map((a) => a.schemaName)).toEqual(['hoertext_wunsch', 'hoertext_aufgaben'])
    expect(anfragen[1].user).toContain(NEU)
    expect(erg.skript.transcript.length).toBeLessThan(ALT.length)
    expect([...erg.anpassungen[0].bloecke.keys()]).toEqual(['a2'])
    expect(erg.zusammenfassung).toMatch(/Gekürzt/)
    expect(erg.zusammenfassung).toMatch(/Angepasst: Aufgabe 2 \(Aussage 1: Test jetzt am Mittwoch\)/)
    expect(erg.zusammenfassung).toMatch(/Unverändert: Aufgabe 1/)
    expect(erg.zusammenfassung).toMatch(/neu vertonen/i)

    const neu = wendeHoertextWunschAn(bloecke, 'h1', erg.skript, erg.anpassungen[0].bloecke)
    const h = neu[0] as AudioBlock
    expect(h.transcript).toBe(NEU)
    // Stimmen bleiben bei den Namen
    expect(h.speakers.map((s) => s.voiceId)).toEqual(['stimme-m', 'stimme-w'])
    // Die Aufnahme bleibt stehen, gilt aber als veraltet – die Zeitangaben sind wieder Schätzungen
    expect(h.audio?.fileName).toBe('h1.mp3')
    expect(aufnahmeVeraltet(h)).toBe(true)
    expect(hoerzeit(h).echt).toBe(false)
    // Aufgabe 1 unverändert (dasselbe Objekt), Aufgabe 2 angepasst mit Kennung, Punkten und Zuordnung
    expect(neu[1]).toBe(mc)
    const a2 = neu[2] as TaskBlock
    expect(a2.id).toBe('a2')
    expect(a2.points).toBe(2)
    expect(a2.audioId).toBe('h1')
    expect(a2.skill).toBe('listening')
    expect(a2.answer.statements[0].text).toMatch(/Wednesday/)
    expect(neu[3]).toBe(schreiben)
  })

  it('mehrere Fassungen: je Fassung eine Anpassung, der Hörtext ändert sich überall', async () => {
    const { ai, anfragen } = attrappe()
    const erg = await hoertextWunschAusfuehren({
      listen: [
        [hoertext, mc],
        [hoertext, rf]
      ],
      audioId: 'h1',
      art: 'neu',
      wunsch: 'Andere Situation',
      meta,
      profile: {} as LearnerProfile,
      ai,
      system: 'SYSTEM'
    })
    expect(anfragen.filter((a) => a.schemaName === 'hoertext_aufgaben')).toHaveLength(2)
    expect(anfragen[0].user).toMatch(/komplett NEU/)
    expect(erg.anpassungen).toHaveLength(2)
  })
})
