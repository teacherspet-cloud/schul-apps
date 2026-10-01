import { describe, expect, it } from 'vitest'
import {
  ablaufZeile,
  aufnahmeVeraltet,
  dauerAngabe,
  ersetzeDauerangaben,
  fundstellen,
  hoerBearbeitungszeit,
  hoerMinuten,
  hoertextZu,
  hoerzeit,
  scriptTurns,
  skriptFingerabdruck
} from '../src/renderer/src/shared/verstehen/hoerzeit'
import { hoerablaufFuer, hoerStufe, STANDARD_ABLAUF } from '../src/renderer/src/modules/arbeitsblatt/didactics/hoerablauf'
import { gemesseneHoerzeiten, hoerteilZeitenAnpassen } from '../src/renderer/src/modules/klassenarbeit/hoertext'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { AudioBlock, TaskBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import type { Exam } from '../src/renderer/src/modules/klassenarbeit/model/types'

/*
 * Wunsch der Lehrkraft (01.10.2026): Alle Zeitangaben passen zur echten Aufnahme – Spieldauer,
 * Bearbeitungszeit des Hörteils, Zeitmarken in Transkript und Erwartungshorizont. Vorher sind
 * es Schätzungen mit „ca.".
 */
const SKRIPT = [
  'Mr Clarkson: Good morning, Anna. You look tired today.',
  'Anna: Good morning. I could not sleep last night because of the storm.',
  'Mr Clarkson: Were you worried about the maths test on Tuesday?',
  'Anna: Yes. I still do not understand the fractions.'
].join('\n')

const hoertext = (patch: Partial<AudioBlock> = {}): AudioBlock => ({
  id: 'h1',
  type: 'audio',
  title: 'Talking to the teacher',
  textType: 'Gespräch',
  transcript: SKRIPT,
  speakers: [],
  plays: 2,
  beforeListening: 'Du hörst ein Gespräch. Der Hörtext dauert ca. 0:16 Minuten.',
  seconds: 16,
  ...patch
})

const vertont = (sekunden: number, zeitmarken?: number[]): AudioBlock =>
  hoertext({ audio: { fileName: 'h1.mp3', dataUrl: 'data:audio/mpeg;base64,', sekunden, ...(zeitmarken ? { zeitmarken } : {}), skript: skriptFingerabdruck(SKRIPT) } })

describe('Spieldauer: geschätzt oder gemessen', () => {
  it('liest Sprecherzeilen wie bisher', () => {
    expect(scriptTurns(hoertext()).map((t) => t.name)).toEqual(['Mr Clarkson', 'Anna', 'Mr Clarkson', 'Anna'])
  })

  it('schätzt ohne Aufnahme nach Wörtern je Minute und kennzeichnet mit „ca."', () => {
    const h = hoerzeit(hoertext({ transcript: Array(130).fill('word').join(' ') }))
    expect(h).toMatchObject({ sekunden: 60, echt: false, veraltet: false, markenEcht: false })
    expect(dauerAngabe(h)).toBe('ca. 1:00 min')
    // Langsameres Niveau → länger
    expect(hoerzeit(hoertext({ transcript: Array(100).fill('word').join(' ') }), 100).sekunden).toBe(60)
  })

  it('nimmt die gemessene Dauer und die gemessenen Zeitmarken, sobald die Aufnahme passt', () => {
    const h = hoerzeit(vertont(200, [0, 4.2, 9.8, 15.1]))
    expect(h).toMatchObject({ sekunden: 200, echt: true, veraltet: false, markenEcht: true })
    expect(h.marken).toEqual([0, 4.2, 9.8, 15.1])
    expect(dauerAngabe(h)).toBe('3:20 min')
  })

  it('ohne gemessene Zeitmarken: Dauer gemessen, Marken nach Wörtern verteilt', () => {
    const h = hoerzeit(vertont(40))
    expect(h.echt).toBe(true)
    expect(h.markenEcht).toBe(false)
    expect(h.marken[0]).toBe(0)
    expect(h.marken[3]).toBeGreaterThan(h.marken[2])
  })

  it('geändertes Skript: Aufnahme veraltet, wieder Schätzung', () => {
    const b = vertont(200, [0, 1, 2, 3])
    b.transcript = SKRIPT.replace('storm', 'thunderstorm')
    expect(aufnahmeVeraltet(b)).toBe(true)
    expect(hoerzeit(b)).toMatchObject({ echt: false, veraltet: true })
  })

  it('eingebundene Originalaufnahme: Dauer aus dem Einbinden, nie veraltet', () => {
    const b = hoertext({ origin: 'archiv', seconds: 95, audio: { fileName: 'h1.mp3' }, transcript: 'Anna: anders' })
    expect(aufnahmeVeraltet(b)).toBe(false)
    expect(hoerzeit(b)).toMatchObject({ sekunden: 95, echt: true })
  })
})

describe('Bearbeitungszeit des Hörteils', () => {
  it('rechnet Einlesezeit, Durchgänge, Pausen und Nachbearbeitung', () => {
    // 60 + 2 × 200 + 60 + 60 = 580 s → 10 Minuten (aufgerundet)
    expect(hoerBearbeitungszeit([{ sekunden: 200, plays: 2 }], STANDARD_ABLAUF)).toBe(580)
    expect(hoerMinuten(580)).toBe(10)
    // Zwei Texte: dazwischen 15 s
    expect(hoerBearbeitungszeit([{ sekunden: 100, plays: 2 }, { sekunden: 100, plays: 1 }], STANDARD_ABLAUF)).toBe(380 + 220 + 15)
    expect(ablaufZeile({ sekunden: 200, echt: true }, 2, STANDARD_ABLAUF)).toBe('1:00 Einlesezeit · 2 × 3:20 Hören · 1:00 Pause · 1:00 Nachbearbeitung = 10 Min.')
    expect(ablaufZeile({ sekunden: 200, echt: false }, 2, STANDARD_ABLAUF)).toMatch(/= ca\. 10 Min\.$/)
  })

  it('nimmt belegte Landesvorgaben (Abitur NI: 2½ Minuten Einlesezeit, je 2 Minuten Bearbeitung)', () => {
    expect(hoerablaufFuer('NI', hoerStufe(12))).toMatchObject({ einlesen: 150, zwischen: 120, nachbearbeiten: 120 })
    expect(hoerablaufFuer('NI', hoerStufe(8))).toEqual(STANDARD_ABLAUF)
    expect(hoerablaufFuer(undefined, 'sek1')).toEqual(STANDARD_ABLAUF)
  })

  it('Klassenarbeit: Minuten des Hörteils folgen der neu gemessenen Aufnahme, sonst bleibt die Zeit stehen', () => {
    const exam = {
      meta: { ...defaultMeta('BY', 'gymnasium', 'Gymnasium'), grade: 8 },
      parts: [{ id: 'p1', label: 'Listening', formatId: 'en-listening', minutes: 15, blocks: [hoertext()] }]
    } as unknown as Exam
    const vorher = gemesseneHoerzeiten(exam)
    expect(hoerteilZeitenAnpassen(exam, vorher)).toEqual([])
    expect(exam.parts[0].minutes).toBe(15)
    exam.parts[0].blocks = [vertont(200)]
    const meldungen = hoerteilZeitenAnpassen(exam, vorher)
    expect(exam.parts[0].minutes).toBe(10)
    expect(meldungen[0]).toMatch(/15 → 10 Minuten/)
    // Erneuter Aufruf ohne neue Messung: nichts ändert sich (eine Handeinstellung bleibt)
    exam.parts[0].minutes = 12
    expect(hoerteilZeitenAnpassen(exam, gemesseneHoerzeiten(exam))).toEqual([])
    expect(exam.parts[0].minutes).toBe(12)
  })
})

describe('Längenangaben in Texten', () => {
  it('setzt die gemessene Dauer ein und streicht das „ca."', () => {
    expect(ersetzeDauerangaben('Der Hörtext dauert ca. 3 Minuten.', 185, { sekunden: 200, echt: true })).toBe('Der Hörtext dauert 3:20 Minuten.')
    expect(ersetzeDauerangaben('Der Hörtext dauert ca. 3:05 Minuten.', 185, { sekunden: 150, echt: false })).toBe('Der Hörtext dauert ca. 2:30 Minuten.')
    expect(ersetzeDauerangaben('The recording is about 2 minutes long.', 120, { sekunden: 95, echt: true })).toBe('The recording is 1:35 minutes long.')
  })

  it('lässt andere Zeitangaben stehen', () => {
    expect(ersetzeDauerangaben('Bearbeitungszeit: 10 Minuten.', 185, { sekunden: 200, echt: true })).toBe('Bearbeitungszeit: 10 Minuten.')
    expect(ersetzeDauerangaben('Ihr habt 3 Minuten Zeit zum Lesen.', 185, { sekunden: 200, echt: true })).toBe('Ihr habt 3 Minuten Zeit zum Lesen.')
    expect(ersetzeDauerangaben('Anna kommt um 3 Uhr.', 185, { sekunden: 200, echt: true })).toBe('Anna kommt um 3 Uhr.')
  })
})

describe('Fundstellen im Erwartungshorizont', () => {
  const aufgabe: TaskBlock = {
    id: 't1',
    type: 'task',
    instruction: 'Richtig oder falsch?',
    operator: '',
    afbReason: '',
    socialForm: 'EA',
    answer: {
      ...emptyAnswer('trueFalse'),
      statements: [
        { text: 'Anna could not sleep because of a storm.', isTrue: true },
        { text: 'The maths test is on Tuesday.', isTrue: true }
      ]
    },
    parts: [],
    solution: '',
    points: 2,
    minutes: 5,
    skill: 'listening',
    audioId: 'h1'
  }

  it('nennt je Item die Zeile mit gemessener Zeitmarke', () => {
    const h = hoerzeit(vertont(30, [0, 4.5, 11, 18]))
    expect(fundstellen(aufgabe, vertont(30, [0, 4.5, 11, 18]), h)).toEqual(['1) ab 0:05', '2) ab 0:11'])
  })

  it('Mehrfachwahl: Die richtige Antwort entscheidet, nicht der Stamm', () => {
    const mc: TaskBlock = {
      ...aufgabe,
      id: 't2',
      instruction: 'Why is Anna tired?',
      answer: { ...emptyAnswer('multipleChoice'), options: ['because of a party', 'because of the storm'], correct: [1] }
    }
    const b = vertont(30, [0, 4.5, 11, 18])
    expect(fundstellen(mc, b, hoerzeit(b))).toEqual(['ab 0:05'])
  })

  it('ohne Aufnahme geschätzt: „ab ca."', () => {
    const b = hoertext()
    expect(fundstellen(aufgabe, b, hoerzeit(b))[0]).toMatch(/^1\) ab ca\. \d:\d\d$/)
  })

  it('findet den Hörtext über die Kennung oder die Stellung', () => {
    const b = hoertext()
    expect(hoertextZu(aufgabe, [b, aufgabe])?.id).toBe('h1')
    const ohne = { ...aufgabe, audioId: undefined }
    expect(hoertextZu(ohne, [b, ohne])?.id).toBe('h1')
    expect(hoertextZu({ ...ohne, skill: 'writing' }, [b, ohne])).toBeUndefined()
  })
})
