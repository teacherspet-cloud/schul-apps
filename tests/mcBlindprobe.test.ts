import { afterEach, describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock, TextBlock, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import {
  BLIND_HINWEIS,
  blindprobeBloecke,
  blindprobeMeldung,
  mcAusschlussRegeln,
  mcSignatur,
  setzeBlindprobe,
  ungepruefteMcAufgaben,
  uebernimmBlindprobe
} from '../src/renderer/src/shared/verstehen/blindprobe'
import { systemPrompt } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { mitBlindprobe } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { kurztestPrompt } from '../src/renderer/src/modules/lernzielkontrolle/generation/generateKurztest'
import { emptyKurztest } from '../src/renderer/src/modules/lernzielkontrolle/model/defaults'

/*
 * Ankreuzfragen zu Texten (Wunsch der Lehrkraft 01.10.2026): Ohne den Text darf keine Möglichkeit
 * ausschließbar sein. Regeln im Auftrag, Blindprobe nach dem Erzeugen (höchstens zwei Neufassungen,
 * sonst Hinweis), Blindprobe auf Abruf für bestehende Materialien. Die KI ist eine Attrappe.
 */

const text: TextBlock = {
  id: 'm1',
  type: 'text',
  title: 'A day at the harbour',
  body: 'Mia works at the harbour café every Saturday. She starts at seven, when the fishing boats come in, and the first customers are the fishermen, who always order tea with lemon. '.repeat(
    3
  ),
  lineNumbers: true,
  source: '',
  glossary: []
}

const frage = (instruction: string, options: string[], correct: number) => ({
  id: `p-${instruction.length}`,
  instruction,
  answer: { ...emptyAnswer('multipleChoice'), options, correct: [correct] },
  solution: options[correct]
})

const aufgabe = (): TaskBlock => ({
  id: 't1',
  type: 'task',
  instruction: '**Tick** the correct answer.',
  operator: 'tick',
  afbReason: '',
  socialForm: 'EA',
  skill: 'reading',
  answer: emptyAnswer('none'),
  parts: [
    // Ohne Text lösbar: Weltwissen (Fischer trinken … ) und ein abwegiger Distraktor
    frage('What is the capital of France?', ['Paris', 'a small fish', 'seven o’clock'], 0),
    frage('When does Mia start work?', ['at six', 'at seven', 'at eight'], 1)
  ],
  solution: '',
  points: 2,
  minutes: 5
})

/** KI-Attrappe: Blindprobe löst „capital" sicher; Neufassungen liefern eine Frage, die die Attrappe nicht mehr löst */
function attrappe(opts: { immerLoesbar?: boolean } = {}) {
  const calls: StructuredRequest[] = []
  const ai = async <T,>(req: StructuredRequest): Promise<T> => {
    calls.push(req)
    if (req.schemaName === 'mc_blindprobe') {
      // Je Frage ihre Optionen; „gewusst" wird, was nach Weltwissen klingt (Paris, Zitrone, sieben)
      const bloecke = req.user.split(/\n(?=\d+\. )/).filter((x) => /^\d+\. /.test(x))
      return {
        antworten: bloecke.map((blk) => {
          const nr = Number(blk.match(/^(\d+)\./)![1])
          const optionen = [...blk.matchAll(/^\s+(\d+)\) (.*)$/gm)].map((m) => m[2])
          const gewusst = Math.max(0, optionen.findIndex((o) => /Paris|lemon|seven/.test(o)))
          return opts.immerLoesbar || /capital/i.test(blk)
            ? {
                nr,
                antwort: gewusst,
                sicherheit: 95,
                ausgeschlossen: optionen.map((_, k) => k).filter((k) => k !== gewusst).map((k) => ({ option: k, grund: 'abwegig' }))
              }
            : { nr, antwort: 2, sicherheit: 30, ausgeschlossen: [] }
        })
      } as T
    }
    if (req.schemaName === 'mc_neufassung') {
      const n = [...req.user.matchAll(/^(\d+)\. /gm)].length
      return {
        fragen: Array.from({ length: n }, (_, i) => ({
          nr: i + 1,
          frage: opts.immerLoesbar ? 'What is the capital of Italy?' : 'What do the fishermen order?',
          optionen: ['tea with milk', 'tea with lemon', 'coffee with sugar'],
          richtig: 1
        }))
      } as T
    }
    throw new Error(`unerwartete Anfrage ${req.schemaName}`)
  }
  return { ai, calls }
}

afterEach(() => setzeBlindprobe(true))

describe('Ankreuzfragen zu Texten: Regeln im Auftrag', () => {
  it('die Regeln nennen Distraktoren, Länge, Weltwissen, Absolutwörter, Grammatik, all/none, Einzelheit, Paraphrase', () => {
    const r = mcAusschlussRegeln()
    for (const m of ['plausibel', 'gleiche Länge', 'Weltwissen', 'Absolutwörter', 'grammatisch', 'none of the above', 'längste', 'Einzelheit', 'Paraphrase'])
      expect(r).toContain(m)
  })

  it('der gemeinsame Auftrag (Arbeitsblatt, Klassenarbeit) und die Lernzielkontrolle enthalten sie', () => {
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'englisch', subjectLabel: 'Englisch', grade: 8, skillFocus: 'reading' as const }
    expect(systemPrompt(meta, profileFromMeta(meta))).toContain('NUR MIT DEM TEXT LÖSBAR')
    expect(kurztestPrompt(emptyKurztest('NI', 'gymnasium', 'Gymnasium'), '')).toContain('NUR MIT DEM TEXT LÖSBAR')
  })
})

describe('Blindprobe nach dem Erzeugen', () => {
  it('eine ohne Text lösbare Frage wird neu gefasst, eine nicht lösbare bleibt – je Aufgabe EINE Blindanfrage ohne Text', async () => {
    const { ai, calls } = attrappe()
    const b = await blindprobeBloecke([text, aufgabe()], ai)
    const t = b.bloecke[1] as TaskBlock
    expect(t.parts[0].instruction).toBe('What do the fishermen order?')
    expect(t.parts[0].answer.correct).toEqual([1])
    expect(t.parts[0].solution).toBe('tea with lemon')
    expect(t.parts[1].instruction).toBe('When does Mia start work?')
    expect(b).toMatchObject({ geprueft: 1, ersetzt: 1, markiert: 0 })
    expect(t.mcBlindprobe).toBe(mcSignatur(t))
    expect(t.warnings ?? []).toEqual([])
    // Blindprobe: ohne Material und ohne die richtige Lösung; Neufassung: mit Material
    const blind = calls.filter((c) => c.schemaName === 'mc_blindprobe')
    expect(blind.length).toBe(2)
    expect(blind[0].user).not.toContain('harbour café')
    expect(blind[0].user).not.toContain('[richtig]')
    expect(blind[0].user).toContain('When does Mia start work?')
    expect(calls.find((c) => c.schemaName === 'mc_neufassung')!.user).toContain('harbour café')
    // Danach gilt die Aufgabe als geprüft
    expect(ungepruefteMcAufgaben(b.bloecke)).toEqual([])
  })

  it('bleibt eine Frage nach zwei Neufassungen lösbar, bekommt sie einen Hinweis', async () => {
    const { ai, calls } = attrappe({ immerLoesbar: true })
    const b = await blindprobeBloecke([text, aufgabe()], ai)
    const t = b.bloecke[1] as TaskBlock
    expect(calls.filter((c) => c.schemaName === 'mc_neufassung').length).toBe(2)
    expect(calls.filter((c) => c.schemaName === 'mc_blindprobe').length).toBe(3)
    expect(b.markiert).toBe(2)
    expect((t.warnings ?? []).filter((w) => w.includes(BLIND_HINWEIS)).length).toBe(2)
    expect(t.warnings![0]).toContain('auch nach 2 Neufassungen')
    expect(blindprobeMeldung(b)).toContain('2 mit Hinweis markiert')
  })

  it('Grammatik- und Schreibaufgaben und Aufgaben ohne Material bleiben unberührt; der Schalter in den Einstellungen gilt', async () => {
    const grammatik = { ...aufgabe(), id: 'g', skill: 'grammar' as const }
    const ohneMaterial = { ...aufgabe(), id: 'o', skill: undefined }
    expect(ungepruefteMcAufgaben([text, grammatik])).toEqual([])
    expect(ungepruefteMcAufgaben([ohneMaterial])).toEqual([])
    // Grammatiktest: nur ausgewiesene Verstehensaufgaben
    expect(ungepruefteMcAufgaben([text, { ...aufgabe(), skill: undefined, instruction: 'Read the text and tick.' }], true)).toEqual([])
    const { ai, calls } = attrappe()
    setzeBlindprobe(false)
    const sheet = { id: 's', label: 'Blatt', blocks: [text, aufgabe()] as WsBlock[] }
    expect(await mitBlindprobe(sheet, ai)).toBe(sheet)
    expect(calls.length).toBe(0)
  })

  it('scheitert die KI, bleibt das Blatt, wie es ist', async () => {
    const ai = async <T,>(): Promise<T> => {
      throw new Error('Kontingent erschöpft')
    }
    const b = await blindprobeBloecke([text, aufgabe()], ai)
    expect(b.geprueft).toBe(0)
    expect((b.bloecke[1] as TaskBlock).parts[0].instruction).toBe('What is the capital of France?')
  })
})

describe('Bestehende Materialien: Blindprobe auf Abruf', () => {
  it('ungeprüfte Aufgaben werden erkannt; eine von Hand geänderte Frage gilt wieder als ungeprüft', async () => {
    expect(ungepruefteMcAufgaben([text, aufgabe()]).map((t) => t.id)).toEqual(['t1'])
    const { ai } = attrappe()
    const b = await blindprobeBloecke([text, aufgabe()], ai)
    const t = b.bloecke[1] as TaskBlock
    const geaendert = { ...t, parts: t.parts.map((p, i) => (i === 1 ? { ...p, answer: { ...p.answer, options: ['at six', 'at seven', 'never'] } } : p)) }
    expect(ungepruefteMcAufgaben([text, geaendert]).map((x) => x.id)).toEqual(['t1'])
  })

  it('die Übernahme ersetzt nur Aufgaben, die die Lehrkraft seit dem Start nicht angefasst hat', async () => {
    const { ai } = attrappe()
    const vorher: WsBlock[] = [text, aufgabe(), { ...aufgabe(), id: 't2' }]
    const b = await blindprobeBloecke(vorher, ai)
    const vonHand = { ...(vorher[2] as TaskBlock), instruction: 'Von Hand geändert' }
    const aktuell = [vorher[0], vorher[1], vonHand]
    const neu = uebernimmBlindprobe(aktuell, vorher, b.bloecke)
    expect((neu[1] as TaskBlock).parts[0].instruction).toBe('What do the fishermen order?')
    expect(neu[2]).toBe(vonHand)
  })
})
