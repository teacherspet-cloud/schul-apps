import { describe, expect, it } from 'vitest'
import { checkIntegrity, materialNummern } from '../src/renderer/src/modules/arbeitsblatt/didactics/integrity'
import { checkListening, checkMediation, checkSkillFocus } from '../src/renderer/src/modules/arbeitsblatt/didactics/languageChecks'
import { materialBausteine, setzeMaterialEin } from '../src/renderer/src/modules/arbeitsblatt/generation/originalmaterial'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type {
  AudioBlock,
  OriginalMaterialAblage,
  Sheet,
  TaskBlock,
  TextBlock,
  WorksheetMeta,
  WsBlock
} from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { pruefeKurztest } from '../src/renderer/src/modules/lernzielkontrolle/didactics/pruefungen'
import { emptyKurztest } from '../src/renderer/src/modules/lernzielkontrolle/model/defaults'

/*
 * Paket 12 (Bericht der Lehrkraft, 26.09.2026): Fehlalarme der Prüfungen, weil sie nur einen
 * Ausschnitt sahen – das gerade geprüfte Blatt, den einzelnen Teil der Klassenarbeit oder das
 * Blatt vor dem Einsetzen des Originaltextes. Gemeldete Hinweistexte:
 *  - „Die Aufgabe verweist auf ‚M1‘, auf dem Blatt ist aber kein Material so bezeichnet.“
 *  - „Sprachmittlung 1: Es fehlt der deutsche Ausgangstext vor der Aufgabe.“
 *  - „Schwerpunkt Sprachmittlung: zusätzliche Bausteine (phrases) – das Blatt enthält nur den
 *    Text und die eine Aufgabe.“ (die phrases standen auf Seite 4 und waren bestellt)
 */

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 12,
  cefrLevel: 'B2',
  ...patch
})
const klausur = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta =>
  meta({ skillFocus: 'mediation', abitur: { an: true, niveau: 'eA', aufgabenart: 'mediation', klausur: true } as WorksheetMeta['abitur'], ...patch })

const aufgabe = (instruction: string, patch: Partial<TaskBlock> = {}): TaskBlock => ({
  id: `t-${Math.random().toString(36).slice(2)}`,
  type: 'task',
  instruction,
  operator: 'write',
  afb: 'II',
  afbReason: '',
  socialForm: 'EA',
  minutes: 45,
  points: 0,
  solution: 'Erwartungshorizont',
  answer: { ...emptyAnswer('lines'), count: 20 },
  parts: [],
  ...patch
})
const text = (id: string, patch: Partial<TextBlock> = {}): TextBlock => ({
  id,
  type: 'text',
  title: 'Schulpartnerschaft',
  body: Array.from({ length: 150 }, () => 'Wort').join(' '),
  lineNumbers: true,
  source: '',
  glossary: [],
  ...patch
})
const blatt = (blocks: WsBlock[]): Sheet => ({ id: 's', label: 'Arbeitsblatt', blocks })

describe('Materialverweise: die Nummern vergibt die App, geprüft wird das ganze Dokument', () => {
  it('„M1“ nach der Aufgabe auf eigener Seite ist KEIN fehlendes Material', () => {
    const s = blatt([aufgabe('Mediate the article M1 for your partner.'), text('m', { pageBreakBefore: true, language: 'de' })])
    const befunde = checkIntegrity(s)
    expect(befunde.map((b) => b.message)).toEqual([])
  })

  it('ein wirklich fehlendes Material wird weiter gemeldet – mit den vorhandenen Nummern', () => {
    const s = blatt([text('m1'), aufgabe('Describe M3.')])
    const [befund] = checkIntegrity(s)
    expect(befund?.message).toMatch(/„M3“.*nur M1/)
  })

  it('Klassenarbeit: M2 aus Teil 1 zählt auch für die Aufgabe in Teil 2', () => {
    const teil1 = [text('a'), text('b')]
    const teil2 = [aufgabe('Compare M1 and M2.')]
    // Nur der Teil für sich: Fehlalarm (so war es bis Paket 12)
    expect(checkIntegrity(blatt(teil2)).length).toBeGreaterThan(0)
    // Mit dem ganzen Dokument: in Ordnung
    expect(checkIntegrity(blatt(teil2), [...teil1, ...teil2])).toEqual([])
  })

  it('Darstellung und Prüfung zählen gleich (Texte, Bilder, Tabellen, Hörtexte …, keine Aufgaben)', () => {
    const n = materialNummern([text('a'), aufgabe('x'), { id: 'i', type: 'image', caption: '' } as unknown as WsBlock, text('c')])
    expect([...n.values()]).toEqual(['M1', 'M2', 'M3'])
  })
})

describe('Sprachmittlung: Ausgangstext auch NACH der Aufgabe', () => {
  const mediation = aufgabe(
    'Your exchange partner from Leeds wants to visit your school next spring. You have found this German article and want to write him an email about it.',
    { skill: 'mediation' }
  )
  it('Übungsklausur: Aufgabe vorn, deutscher Text auf der nächsten Seite – kein „Es fehlt der deutsche Ausgangstext“', () => {
    const w = checkMediation(blatt([mediation, text('q', { language: 'de', pageBreakBefore: true })]), klausur())
    expect(w.some((x) => x.message.includes('Ausgangstext'))).toBe(false)
  })
  it('ganz ohne deutschen Text bleibt der Befund', () => {
    const w = checkMediation(blatt([mediation]), klausur())
    expect(w.some((x) => x.message.includes('Es fehlt der deutsche Ausgangstext'))).toBe(true)
  })
  it('der eingesetzte Originaltext trägt die Sprache – für die Sprachmittlung Deutsch', () => {
    const ablage: OriginalMaterialAblage = {
      titel: 'Artikel',
      text: 'Die Schule plant einen Austausch.',
      url: 'https://example.org/artikel',
      hinweis: '',
      quellenangabe: 'Zeitung',
      protokoll: [],
      wortlautGeprueft: true
    }
    const q = materialBausteine(ablage, { subjectId: 'englisch', skillFocus: 'mediation' }, () => 'x').find((b) => b.type === 'text') as TextBlock
    expect(q.language).toBe('de')
    const englisch = materialBausteine(ablage, { subjectId: 'englisch', skillFocus: 'reading' as WorksheetMeta['skillFocus'] }, () => 'y').find(
      (b) => b.type === 'text'
    ) as TextBlock
    expect(englisch.language).toBe('target')
    // Und mit dem eingesetzten Text besteht die Klausur beide Prüfungen
    let n = 0
    const mit = setzeMaterialEin(blatt([aufgabe('Write an e-mail to your partner based on M1.', { skill: 'mediation' })]), ablage, klausur(), () => `id${n++}`)
    expect(checkIntegrity(mit)).toEqual([])
    expect(checkMediation(mit, klausur()).some((x) => x.message.includes('Es fehlt der deutsche Ausgangstext'))).toBe(false)
  })
})

describe('Schwerpunkt Sprachmittlung: das bestellte Hilfsblatt ist kein Zusatz', () => {
  const s = blatt([
    aufgabe('Mediate M1.', { skill: 'mediation' }),
    text('q', { language: 'de', pageBreakBefore: true }),
    { id: 'p', type: 'phrases', title: 'Useful phrases', items: [] } as unknown as WsBlock,
    { id: 'w', type: 'workspace', kind: 'lines', heightMm: 100, label: '' } as unknown as WsBlock
  ])
  it('phrases auf Seite 4 bei eingeschaltetem Hilfsblatt: keine Meldung', () => {
    expect(checkSkillFocus(s, klausur({ phraseSheet: 'blatt' })).some((w) => w.message.includes('zusätzliche Bausteine'))).toBe(false)
  })
  it('ohne Hilfsblatt (und ohne Klausur) bleibt es ein Zusatz', () => {
    const w = checkSkillFocus(s, meta({ skillFocus: 'mediation', phraseSheet: 'aus' }))
    expect(w.some((x) => x.message.includes('zusätzliche Bausteine (phrases)'))).toBe(true)
  })
})

describe('Hörverstehen in der Übungsklausur: Aufgaben vor dem Hörtext sind erlaubt', () => {
  const audio: AudioBlock = {
    id: 'a',
    type: 'audio',
    title: 'Radio feature',
    textType: 'Feature',
    transcript: Array.from({ length: 80 }, () => 'word').join(' '),
    speakers: [],
    plays: 2,
    beforeListening: 'Listen for the reasons.',
    seconds: 90
  }
  const hoeren = aufgabe('Tick the correct answer.', { skill: 'listening', answer: { ...emptyAnswer('multipleChoice') } })
  it('Klausur: keine Meldung „steht vor dem Hörtext“', () => {
    expect(checkListening(blatt([hoeren, audio]), klausur()).some((w) => w.message.includes('vor dem Hörtext'))).toBe(false)
  })
  it('gewöhnliches Blatt: die Reihenfolge wird weiter geprüft', () => {
    expect(checkListening(blatt([hoeren, audio]), meta()).some((w) => w.message.includes('vor dem Hörtext'))).toBe(true)
  })
})

describe('Lernzielkontrolle: Materialverweise werden jetzt auch hier geprüft', () => {
  const kurztest = (blocks: WsBlock[]) => {
    const t = emptyKurztest('NI', 'gymnasium', 'Gymnasium')
    t.meta = { ...t.meta, subjectId: 'geschichte', subjectLabel: 'Geschichte', grade: 9, thema: 'Weimar', minutes: 20 }
    t.varianten = [{ id: 'v1', label: '', blocks }]
    return t
  }
  it('„M3“ ohne drittes Material ist eine Warnung, „M1“ nicht', () => {
    const tot = pruefeKurztest(kurztest([text('q'), aufgabe('**Beschreibe** M3.')]))
    expect(tot.some((b) => b.message.includes('„M3“'))).toBe(true)
    const gut = pruefeKurztest(kurztest([text('q'), aufgabe('**Beschreibe** M1.')]))
    expect(gut.some((b) => b.message.includes('verweist auf'))).toBe(false)
  })
})
