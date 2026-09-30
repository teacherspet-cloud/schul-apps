/**
 * Änderungswunsch an einem Baustein (30.09.2026): Zauberstab „Überarbeiten" und Kreis „Neu
 * erzeugen" mit gemeinsamem Wunschfeld, Regel- und KI-Vorschlägen – in allen Programmen.
 * Geprüft wird ohne KI: Vorschläge, Anfragen, der Auftrag und dass der Wunsch ankommt.
 */
import { describe, expect, it } from 'vitest'
import {
  fuegeVorschlagEin,
  inhaltsSchluessel,
  kiVorschlaegeAus,
  kiVorschlagAnfrage,
  MAX_REGELVORSCHLAEGE,
  regelVorschlaege,
  wunschAuftrag,
  type WunschKontext
} from '../src/renderer/src/shared/kiWunsch'
import { falscheAnrede } from '../src/renderer/src/shared/anrede'
import { regenerateBlock } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { bausteinNachWunsch, wunschKontextFuer, wunschNutzerauftrag } from '../src/renderer/src/modules/arbeitsblatt/generation/wunsch'
import { buildLearnerProfile } from '../src/renderer/src/modules/arbeitsblatt/didactics/profile'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { TaskBlock, Worksheet, WorksheetMeta, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { vokabelWunschHinweis } from '../src/renderer/src/modules/vokabeltest/wunsch'
import { blockHelp } from '../src/renderer/src/modules/vokabeltest/render/helpTexts'
import { testHeadBlock } from '../src/renderer/src/modules/grammatiktest/render/testWorksheet'
import { newTest } from '../src/renderer/src/modules/grammatiktest/model/defaults'
import type { Block } from '../src/renderer/src/modules/vokabeltest/model/types'
import type { StructuredRequest } from '@shared/types'
import { presetDesigns } from '@shared/design'

const meta = (over: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'geschichte',
  subjectLabel: 'Geschichte',
  topic: 'Weimarer Republik',
  learningGoals: 'Ich kann die Belastungen der Republik erklären.',
  grade: 8,
  ...over
})

const aufgabe = (id: string, instruction: string, over: Partial<TaskBlock> = {}): TaskBlock => ({
  id,
  type: 'task',
  instruction,
  operator: 'Erkläre',
  afb: 'II',
  afbReason: '',
  socialForm: 'EA',
  answer: emptyAnswer('lines'),
  parts: [],
  solution: 'Lösung',
  points: 4,
  minutes: 5,
  ...over
})

const kontext = (over: Partial<WunschKontext> = {}): WunschKontext => ({ typ: 'task', inhalt: 'Erkläre M1.', ...over })

describe('Regelvorschläge – sofort da, passend zu Baustein, Fach und Jahrgang', () => {
  it('Aufgabe: AFB, Differenzierung, Antwortform', () => {
    const v = regelVorschlaege(kontext({ afb: 1, antwortArt: 'lines', fachId: 'geschichte', klasse: 8 }))
    expect(v).toContain('Anspruchsvoller (AFB II)')
    expect(v).toContain('Mehr Differenzierung (★/★★/★★★)')
    expect(v).toContain('Satzanfänge als Hilfe')
    expect(v.length).toBeLessThanOrEqual(MAX_REGELVORSCHLAEGE)
    // AFB III: der Weg geht nach unten
    expect(regelVorschlaege(kontext({ afb: 3 }))).toContain('Leichterer Einstieg (AFB I)')
    // Mit Teilaufgaben wird nicht noch einmal „kleinschrittiger" angeboten
    expect(regelVorschlaege(kontext({ teilaufgaben: 3 }))).not.toContain('Kleinschrittiger mit Teilaufgaben')
  })

  it('je Bausteintyp eigene Vorschläge', () => {
    expect(regelVorschlaege(kontext({ typ: 'text', fachId: 'geschichte' }))).toContain('Originalquelle statt Darstellung')
    expect(regelVorschlaege(kontext({ typ: 'text', fachId: 'biologie' }))).not.toContain('Originalquelle statt Darstellung')
    expect(regelVorschlaege(kontext({ typ: 'infoBox' }))).toContain('Mit Beispiel')
    expect(regelVorschlaege(kontext({ typ: 'vokabel', fachId: 'englisch' }))).toContain('Mehr Kontextsätze')
  })

  it('Fach, Jahrgang, Schulform, Niveau, Land und Lernziel', () => {
    expect(regelVorschlaege(kontext({ fachId: 'mathematik', typ: 'infoBox' }))).toContain('Zahlen aus dem Alltag')
    expect(regelVorschlaege(kontext({ typ: 'infoBox', fachId: 'englisch', klasse: 5 }))).toContain('Mehr Bildunterstützung')
    expect(regelVorschlaege(kontext({ typ: 'infoBox', klasse: 5 }))).toContain('Kindgerechter formuliert')
    expect(regelVorschlaege(kontext({ typ: 'table', schulform: 'Förderschule Lernen' }))).toContain('Leichte Sprache')
    expect(regelVorschlaege(kontext({ typ: 'infoBox', fachId: 'franzoesisch', niveau: 'A2' }))).toContain('Genau auf Niveau A2')
    const abi = regelVorschlaege(kontext({ fachId: 'deutsch', klasse: 12, bundesland: 'Bayern', teilaufgaben: 2, afb: 2 }))
    expect(abi.some((s) => s.includes('Abitur') && s.includes('Bayern'))).toBe(true)
    const ziel = regelVorschlaege(kontext({ typ: 'table', lernziel: 'Ich kann Ursachen der Inflation nennen.\nZweites Ziel' }))
    expect(ziel.some((s) => s.startsWith('Engerer Bezug zum Lernziel „Ich kann Ursachen'))).toBe(true)
  })

  it('keine Anrede und kein Imperativ am Anfang', () => {
    const alle = ['task', 'text', 'infoBox', 'image', 'table', 'scaffold', 'phrases', 'vokabel'].flatMap((typ) =>
      regelVorschlaege(kontext({ typ, fachId: 'englisch', klasse: 12, bundesland: 'Hessen', niveau: 'B2' }))
    )
    for (const s of alle) {
      expect(s, s).not.toMatch(/\b(du|Sie|dein|Ihr)\b/)
      expect(falscheAnrede(s, 'du') ?? falscheAnrede(s, 'sie'), s).toBeNull()
    }
  })
})

describe('Wunschfeld: Vorschläge einfügen', () => {
  it('leer = ersetzen, sonst anhängen, doppelt nie', () => {
    expect(fuegeVorschlagEin('', 'Einfachere Sprache')).toBe('Einfachere Sprache')
    expect(fuegeVorschlagEin('Einfachere Sprache', 'Mit Beispiel')).toBe('Einfachere Sprache, Mit Beispiel')
    expect(fuegeVorschlagEin('Einfachere Sprache, Mit Beispiel', 'Mit Beispiel')).toBe('Einfachere Sprache, Mit Beispiel')
    expect(fuegeVorschlagEin('Eigener Text,', 'Mit Beispiel')).toBe('Eigener Text, Mit Beispiel')
  })

  it('Schlüssel des Vorschlagsspeichers hängt an Baustein und Inhalt', () => {
    expect(inhaltsSchluessel('a1', 'x')).toBe(inhaltsSchluessel('a1', 'x'))
    expect(inhaltsSchluessel('a1', 'x')).not.toBe(inhaltsSchluessel('a1', 'y'))
    expect(inhaltsSchluessel('a1', 'x')).not.toBe(inhaltsSchluessel('a2', 'x'))
  })
})

describe('KI-Vorschläge: Anfrage und Antwort', () => {
  it('die Anfrage nennt Baustein, Lerngruppe, Land, Lernziel und die schon gezeigten Vorschläge', () => {
    const k = wunschKontextFuer(aufgabe('a1', 'Erkläre die Belastungen der Republik mithilfe von M1.', { afb: 'I' }), meta({ stateId: 'BY' }), 'Arbeitsblatt')
    const r = kiVorschlagAnfrage(k, ['Einfachere Sprache'])
    expect(r.schemaName).toBe('baustein_wunsch_vorschlaege')
    expect(r.user).toContain('Erkläre die Belastungen der Republik')
    expect(r.user).toContain('Klasse 8')
    expect(r.user).toContain('Bayern')
    expect(r.user).toContain('Ich kann die Belastungen')
    expect(r.user).toContain('AFB 1')
    expect(r.user).toContain('nicht wiederholen: Einfachere Sprache')
    expect(r.user).toMatch(/4 bis 6/)
    expect(JSON.stringify(r.schema)).toContain('vorschlaege')
  })

  it('die Antwort wird gesäubert: Doppeltes, Vorhandenes und Überlanges', () => {
    const aus = kiVorschlaegeAus({ vorschlaege: ['Mehr Bezug auf M2.', 'mehr bezug auf m2', 'Einfachere Sprache', 42, '  ', 'x'.repeat(120), 'A', 'B', 'C', 'D'] }, [
      'Einfachere Sprache'
    ])
    expect(aus[0]).toBe('Mehr Bezug auf M2')
    expect(aus).not.toContain('Einfachere Sprache')
    expect(aus[1].length).toBeLessThanOrEqual(70)
    expect(aus.length).toBeLessThanOrEqual(6)
    expect(kiVorschlaegeAus(null)).toEqual([])
  })
})

describe('Auftrag an die KI: Überarbeiten vs. Neu erzeugen, mit Wunsch', () => {
  it('wunschAuftrag', () => {
    expect(wunschAuftrag('ueberarbeiten', 'Einfachere Sprache', 2)).toMatch(/Überarbeite Baustein \(2\).*erkennbar[\s\S]*Änderungswunsch der Lehrkraft.*Einfachere Sprache/)
    expect(wunschAuftrag('ueberarbeiten', '')).toMatch(/Verbessere ihn didaktisch/)
    expect(wunschAuftrag('neu', 'Mit Karikatur', 1)).toMatch(/komplett NEU[\s\S]*Wunsch der Lehrkraft für den neuen Entwurf.*Mit Karikatur/)
    expect(wunschAuftrag('neu', '')).not.toMatch(/Wunsch/)
  })

  it('Arbeitsblatt/Klassenarbeit: regenerateBlock schickt Wunsch und Art mit', async () => {
    const ws = {
      version: 1,
      meta: meta(),
      design: presetDesigns()[0],
      outline: null,
      sheets: [{ id: 's', label: 'Blatt', blocks: [aufgabe('a1', 'Erkläre M1.'), aufgabe('a2', 'Nenne zwei Gründe.')] }],
      sources: [],
      createdAt: ''
    } as unknown as Worksheet
    const anfragen: StructuredRequest[] = []
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      anfragen.push(req)
      return { block: { type: 'task', instruction: 'Nenne drei Gründe.', parts: [], solution: 'x' } } as T
    }
    const profil = buildLearnerProfile(ws.meta)
    const neu = await regenerateBlock(ws, ws.sheets[0], 'a2', profil, ai as never, '', 'Mit Alltagsbezug', 'neu')
    expect(neu.id).toBe('a2')
    expect(anfragen[0].user).toMatch(/Erzeuge Baustein \(2\) komplett NEU/)
    expect(anfragen[0].user).toContain('Mit Alltagsbezug')
    expect(anfragen[0].user).toContain('Bisheriger Baustein (nur zur Orientierung')
    await regenerateBlock(ws, ws.sheets[0], 'a2', profil, ai as never, '', 'Kürzer')
    expect(anfragen[1].user).toMatch(/Überarbeite Baustein \(2\)[\s\S]*Änderungswunsch der Lehrkraft.*Kürzer/)
    expect(anfragen[1].user).toContain('Zu überarbeitender Baustein')
    // „Mit KI beheben" bleibt beim alten Auftrag
    await regenerateBlock(ws, ws.sheets[0], 'a2', profil, ai as never, 'Operator fehlt')
    expect(anfragen[2].user).toContain('Zu behebende Probleme: Operator fehlt')
  })

  it('Lernzielkontrolle/Grammatiktest: bausteinNachWunsch behält Kennung und Punkte, nimmt den Systemauftrag des Programms', async () => {
    const bloecke: WsBlock[] = [aufgabe('a1', 'Erkläre M1.'), aufgabe('a2', 'Nenne zwei Gründe.', { points: 6 })]
    const anfrage = { bloecke, blockId: 'a2', art: 'ueberarbeiten' as const, wunsch: 'Mehr Differenzierung', system: 'SYSTEM-LZK', zusammenhang: ['Lerngruppe: Klasse 8.'], anrede: 'du' as const, punkteBehalten: true }
    expect(wunschNutzerauftrag(anfrage)).toMatch(/Überarbeite Baustein \(2\)[\s\S]*Mehr Differenzierung[\s\S]*\(2\) Aufgabe/)
    let gesehen: StructuredRequest | null = null
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      gesehen = req
      return { block: { type: 'task', instruction: 'Nenne drei Gründe.', parts: [], solution: 'x', points: 1 } } as T
    }
    const neu = await bausteinNachWunsch(anfrage, ai as never)
    expect(gesehen!.system).toBe('SYSTEM-LZK')
    expect(neu.id).toBe('a2')
    expect(neu.type === 'task' && neu.points).toBe(6)
    expect(neu.type === 'task' && neu.instruction).toBe('Nenne drei Gründe.')
  })

  it('Vokabeltest: Hinweis für Überarbeiten bzw. Neu erzeugen', () => {
    const block = { id: 'b', kind: 'gap', taskType: 'gapSentences', title: 'Gaps', instruction: 'Fill in', items: [], pointsPerItem: 1 } as unknown as Block
    expect(vokabelWunschHinweis(block, 'ueberarbeiten', 'Shorter sentences')).toMatch(/Revise the EXISTING task[\s\S]*Shorter sentences/)
    expect(vokabelWunschHinweis(block, 'neu', 'Topic: sports')).toMatch(/completely NEW[\s\S]*Topic: sports/)
    expect(vokabelWunschHinweis(block, 'neu', '')).not.toMatch(/wish/)
  })
})

describe('Texte auf dem Blatt bearbeitbar', () => {
  it('Vokabeltest: die Hinweiszeile (ⓘ) folgt der Änderung von Hand; leer = keine', () => {
    const block = { id: 'b', kind: 'gap', taskType: 'gapSentences', title: 'Gaps', instruction: 'Fill in', items: [], wordBank: [], pointsPerItem: 1 } as unknown as Block
    expect(blockHelp({ ...block, helpText: 'Eigener Hinweis.' }, 'en')).toEqual(['Eigener Hinweis.'])
    expect(blockHelp({ ...block, helpText: '' }, 'en')).toEqual([])
    expect(blockHelp({ ...block, helpText: 'X', showHelp: false }, 'en')).toEqual([])
  })

  it('Grammatiktest: der Kopfkasten übernimmt den Wortlaut von Hand', () => {
    const t = newTest(presetDesigns()[0], 'NI', 'gymnasium', 'Gymnasium')
    const kopf = testHeadBlock({ ...t, meta: { ...t.meta, infoBox: true, kopfText: '- Eigener Kopf' } })
    expect(kopf?.type === 'infoBox' && kopf.body).toBe('- Eigener Kopf')
    const berechnet = testHeadBlock({ ...t, meta: { ...t.meta, infoBox: true, kopfText: undefined } })
    expect(berechnet?.type === 'infoBox' && berechnet.body).toMatch(/Bearbeitungszeit|Time/)
  })
})
