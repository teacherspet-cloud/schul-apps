import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { istBehebbar, ohneHinweise, ohnePraefix, reparaturAuftrag, wendeReparaturAn } from '../src/renderer/src/shared/kiBeheben'
import { repariereBausteine, reparaturAus } from '../src/renderer/src/modules/arbeitsblatt/generation/reparatur'
import { pruefeBlattNeu } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { Sheet, TaskBlock, TextBlock, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * „Mit KI beheben" (Paket 12, Wunsch der Lehrkraft vom 26.09.2026): Knopf an jedem behebbaren
 * Hinweis, gezielte Reparatur statt Neu-Erzeugen, ein Rückgängig-Schritt, danach neue Prüfung.
 * Die KI ist hier eine Attrappe – kein Kontingent.
 */

const aufgabe = (id: string, instruction: string, points = 0): TaskBlock => ({
  id,
  type: 'task',
  instruction,
  operator: 'Beschreibe',
  afb: 'I',
  afbReason: '',
  socialForm: 'EA',
  minutes: 10,
  points,
  solution: 'Lösung',
  answer: { ...emptyAnswer('lines'), count: 4 },
  parts: []
})
const text = (id: string): TextBlock => ({
  id,
  type: 'text',
  title: 'Bericht',
  body: 'Die Versammlung beriet lange über den Antrag.',
  lineNumbers: true,
  source: '',
  glossary: []
})
/** Ein Baustein, wie die KI ihn schickt (flaches Schema) */
const flach = (patch: Record<string, unknown>): Record<string, unknown> => ({
  outlineIndex: 0,
  type: 'task',
  stars: 0,
  title: '',
  body: '',
  items: [],
  lineNumbers: false,
  source: '',
  glossary: [],
  instruction: '',
  operator: '',
  afb: 'I',
  afbReason: '',
  socialForm: 'EA',
  minutes: 5,
  points: 7,
  solution: 'Lösung',
  answer: { kind: 'lines', count: 4 },
  parts: [],
  ...patch
})

describe('Welche Hinweise einen Knopf bekommen', () => {
  it('Mängel am Material: ja (Beispiele aus dem Bericht der Lehrkraft)', () => {
    for (const h of [
      '[Vollständigkeit] Die Aufgabe verweist auf „M3“, es gibt aber kein Material so bezeichnet.',
      '[Blatt] Sprachmittlung 1: Es fehlt der ausformulierte Mustertext für das Lösungsblatt – Kriterien allein zeigen nicht, wie eine gute Wiedergabe klingt.',
      '[Prüfung] Die Lösung „castle" ergibt sich aus einer anderen Aufgabe.',
      'Aufgabe 2: Die Anweisung duzt („Erkläre"), in der Sekundarstufe II wird gesiezt.'
    ])
      expect(istBehebbar(h)).toBe(true)
  })
  it('reine Informationen: nein', () => {
    for (const h of [
      '[Nachgebessert] Die Aufgabe verweist auf M5 …',
      'Originalquellen (1 Textquelle(n)): Die KI gibt Quellen aus dem Gedächtnis wieder – Wortlaut und Quellenangabe vor dem Einsatz prüfen.',
      'Bilder: 2 aus dem Internet (KI-geprüft), 0 KI-generiert – Bildnachweise stehen unter den Bildern.',
      'Kein Bild für „castle" gefunden, bitte auswählen.',
      '2 Vokabel(n) weniger als gewünscht: nicht genug passende Wörter in der Liste.'
    ])
      expect(istBehebbar(h)).toBe(false)
  })
  it('die Kennzeichnung verschwindet in der Anzeige', () => {
    expect(ohnePraefix('[Blatt] Es fehlt etwas.')).toBe('Es fehlt etwas.')
  })
})

describe('Der Auftrag an die KI', () => {
  it('nennt Hinweis, Baustein, Ort, Lerngruppe, Lernziel und Anrede-Regel – und begrenzt die Änderung', () => {
    const t = reparaturAuftrag(['[Vollständigkeit] Die Aufgabe verweist auf „M3“.'], {
      material: 'Arbeitsblatt',
      lerngruppe: 'Geschichte, Klasse 12, Gymnasium',
      lernziel: 'Die Weimarer Republik',
      ort: 'Blatt ★★',
      anredeRegel: 'Die Lernenden werden gesiezt.',
      bausteinNummer: 2
    })
    expect(t).toContain('- Die Aufgabe verweist auf „M3“.')
    expect(t).not.toContain('[Vollständigkeit]')
    expect(t).toContain('Baustein (2)')
    expect(t).toContain('Blatt ★★')
    expect(t).toContain('Geschichte, Klasse 12, Gymnasium')
    expect(t).toContain('Die Weimarer Republik')
    expect(t).toContain('gesiezt')
    expect(t).toMatch(/höchstens 4 Bausteine/)
  })
})

describe('Änderungen einarbeiten – bezogen auf Kennungen, nicht auf Stellen', () => {
  const a = { id: 'a' }
  const b = { id: 'b' }
  const c = { id: 'c' }
  it('ersetzen, davor, danach, entfernen', () => {
    const neu = { id: 'n' }
    expect(wendeReparaturAn([a, b, c], [{ art: 'ersetzen', anker: 'b', block: { id: 'b2' } }]).map((x) => x.id)).toEqual(['a', 'b2', 'c'])
    expect(wendeReparaturAn([a, b, c], [{ art: 'davor', anker: 'b', block: neu }]).map((x) => x.id)).toEqual(['a', 'n', 'b', 'c'])
    expect(wendeReparaturAn([a, b, c], [{ art: 'danach', anker: 'c', block: neu }]).map((x) => x.id)).toEqual(['a', 'b', 'c', 'n'])
    expect(wendeReparaturAn([a, b, c], [{ art: 'entfernen', anker: 'a' }]).map((x) => x.id)).toEqual(['b', 'c'])
  })
  it('hat die Lehrkraft inzwischen verschoben, landet die Reparatur trotzdem am richtigen Baustein', () => {
    expect(wendeReparaturAn([c, a, b], [{ art: 'davor', anker: 'b', block: { id: 'n' } }]).map((x) => x.id)).toEqual(['c', 'a', 'n', 'b'])
  })
  it('gelöschter Anker: Neues kommt ans Ende, Ersetzen entfällt', () => {
    expect(wendeReparaturAn([a], [{ art: 'danach', anker: 'weg', block: { id: 'n' } }]).map((x) => x.id)).toEqual(['a', 'n'])
    expect(wendeReparaturAn([a], [{ art: 'ersetzen', anker: 'weg', block: { id: 'n' } }]).map((x) => x.id)).toEqual(['a'])
  })
  it('die behobenen Hinweise verschwinden, andere bleiben', () => {
    const bl = [{ id: 'a', warnings: ['x', 'y'] }]
    expect(ohneHinweise(bl, [{ text: 'x', blockId: 'a' }])[0].warnings).toEqual(['y'])
  })
})

describe('Antwort der KI übersetzen', () => {
  const bloecke: WsBlock[] = [text('q'), aufgabe('t', 'Beschreibe M3.', 5)]
  it('beim Ersetzen bleiben Kennung und – bei Kontrollen – die Punkte der Lehrkraft', () => {
    const r = reparaturAus(
      { erklaerung: 'Verweis korrigiert.', aenderungen: [{ art: 'ersetzen', nummer: 2, block: flach({ instruction: 'Beschreibe M1.' }) }] },
      bloecke,
      'du',
      'behalten'
    )
    expect(r.erklaerung).toBe('Verweis korrigiert.')
    expect(r.aenderungen[0].anker).toBe('t')
    const neu = r.aenderungen[0].block as TaskBlock
    expect(neu.id).toBe('t')
    expect(neu.instruction).toBe('Beschreibe M1.')
    expect(neu.points).toBe(5)
  })
  it('Arbeitsblätter tragen keine Punkte; neue Bausteine bekommen eine neue Kennung', () => {
    const r = reparaturAus({ aenderungen: [{ art: 'danach', nummer: 2, block: flach({ instruction: 'Vergleiche.' }) }] }, bloecke, 'du', 'keine')
    const neu = r.aenderungen[0].block as TaskBlock
    expect(neu.points).toBe(0)
    expect(['q', 't']).not.toContain(neu.id)
  })
  it('unbrauchbare Einträge fallen weg, höchstens vier Änderungen', () => {
    const viele = Array.from({ length: 7 }, () => ({ art: 'danach', nummer: 1, block: flach({ instruction: 'x' }) }))
    expect(reparaturAus({ aenderungen: viele }, bloecke, 'du', 'keine').aenderungen).toHaveLength(4)
    expect(
      reparaturAus(
        {
          aenderungen: [
            { art: 'ersetzen', nummer: 9, block: flach({}) },
            { art: 'quatsch', nummer: 1 }
          ]
        },
        bloecke,
        'du',
        'keine'
      ).aenderungen
    ).toEqual([])
  })
})

describe('Reparatur mit KI-Attrappe', () => {
  it('schickt Hinweis und nummeriertes Material; ohne Änderung ein klarer Fehler', async () => {
    let anfrage: StructuredRequest | null = null
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      anfrage = req
      return { erklaerung: 'ok', aenderungen: [{ art: 'ersetzen', nummer: 2, block: flach({ instruction: 'Beschreibe M1.' }) }] } as T
    }
    const r = await repariereBausteine(
      {
        bloecke: [text('q'), aufgabe('t', 'Beschreibe M3.')],
        hinweise: ['[Vollständigkeit] Die Aufgabe verweist auf „M3“.'],
        kontext: { material: 'Arbeitsblatt', lerngruppe: 'Geschichte, Klasse 9' },
        system: 'System',
        anrede: 'du',
        punkte: 'keine'
      },
      ai
    )
    expect(r.aenderungen).toHaveLength(1)
    expect(anfrage!.schemaName).toBe('material_reparatur')
    expect(anfrage!.user).toContain('(1) ')
    expect(anfrage!.user).toContain('(2) ')
    expect(anfrage!.user).toContain('Die Aufgabe verweist auf „M3“.')
    const leer = async <T>(): Promise<T> => ({ erklaerung: '', aenderungen: [] }) as T
    await expect(
      repariereBausteine(
        { bloecke: [text('q')], hinweise: ['x'], kontext: { material: 'A', lerngruppe: 'B' }, system: '', anrede: 'du', punkte: 'keine' },
        leer
      )
    ).rejects.toThrow(/keine Änderung/)
  })

  it('danach läuft die Prüfung neu: der alte Befund ist weg, ein neuer würde erscheinen', () => {
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'geschichte', subjectLabel: 'Geschichte', grade: 9, topic: 'Weimar' }
    const profile = profileFromMeta(meta)
    const kaputt: Sheet = { id: 's', label: 'Arbeitsblatt', blocks: [text('q'), aufgabe('t', 'Beschreibe M3.')] }
    const vorher = pruefeBlattNeu(kaputt, profile, meta)
    expect(vorher.blocks[1].warnings?.some((w) => w.includes('„M3“'))).toBe(true)
    const repariert = pruefeBlattNeu(
      { ...vorher, blocks: wendeReparaturAn(vorher.blocks, [{ art: 'ersetzen', anker: 't', block: aufgabe('t', 'Beschreibe M1.') }]) },
      profile,
      meta
    )
    expect(repariert.blocks.flatMap((b) => b.warnings ?? []).some((w) => w.includes('verweist auf'))).toBe(false)
  })
})
