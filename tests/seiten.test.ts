/**
 * Seitenzahl automatisch oder vorgegeben – Paket 7 (Nachtrag der Lehrkraft, 25.09.2026).
 *
 * Wie bei der Zahl der Aufgaben legt die KI die Seitenzahl standardmäßig selbst fest. Eine von
 * Hand eingestellte Zahl gilt als Richtwert, eine Spanne („2–3“) als Bereich nach Bedarf des
 * Materials. Ältere Blätter behalten ihre gespeicherte Zahl.
 */
import { describe, expect, it } from 'vitest'
import {
  seitenAbweichung,
  seitenArt,
  seitenBereich,
  seitenPlanAus,
  seitenPlanRegeln,
  seitenSchaetzung,
  seitenText,
  seitenVorgabe
} from '../src/renderer/src/modules/arbeitsblatt/didactics/seiten'
import { blockLayout } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { paginate } from '../src/renderer/src/shared/render/paginate'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { taskContext, taskCountRules, umfangRegeln } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { pageLimitFits, pageLimitMin, pageLimitText } from '../src/renderer/src/modules/vokabeltest/render/useTestLayout'
import { buildSheetForTest } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { checkImageWish } from '../src/renderer/src/modules/arbeitsblatt/didactics/sheetChecks'
import { buildLearnerProfile } from '../src/renderer/src/modules/arbeitsblatt/didactics/profile'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { Sheet, WorksheetMeta, WsBlock, WsBlockType } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const meta = (over: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'biologie',
  subjectLabel: 'Biologie',
  topic: 'Fotosynthese',
  grade: 6,
  ...over
})
const profil = (m: WorksheetMeta) =>
  buildLearnerProfile({
    stateId: m.stateId,
    schoolTypeId: m.schoolTypeId,
    schoolTypeName: m.schoolTypeName,
    grade: m.grade,
    courseLevel: m.courseLevel,
    subjectId: m.subjectId,
    subjectLabel: m.subjectLabel,
    languageMode: m.languageMode
  })

describe('Seitenzahl: automatisch als Standard', () => {
  it('ein neues Blatt hat keine Seitenvorgabe', () => {
    expect(defaultMeta('NI', 'gymnasium', 'Gymnasium').pages).toBe(0)
    expect(seitenVorgabe(meta())).toBeNull()
    expect(seitenArt(meta())).toBe('auto')
  })
  it('schätzt ohne Vorgabe aus Bearbeitungszeit und Altersband – zwischen 1 und 4', () => {
    expect(seitenSchaetzung(meta({ minutes: 45 }))).toBe(1)
    expect(seitenSchaetzung(meta({ minutes: 90 }))).toBe(2)
    expect(seitenSchaetzung(meta({ minutes: 10 }))).toBe(1)
    expect(seitenSchaetzung(meta({ minutes: 180 }))).toBe(4)
    expect(seitenText(meta({ minutes: 90 }))).toBe('etwa 2 Seiten')
  })
  it('eine vorgegebene Aufgabenzahl bestimmt die Schätzung', () => {
    expect(seitenSchaetzung(meta({ taskCount: 12 }))).toBe(3)
  })
  it('eine Vorgabe (auch aus einem alten Blatt) gilt genau', () => {
    expect(seitenBereich(meta({ pages: 3 }))).toEqual({ min: 3, max: 3 })
    expect(seitenArt(meta({ pages: 2 }))).toBe('genau')
    expect(seitenText(meta({ pages: 1 }))).toBe('1 Seite')
  })
  it('eine Spanne hat Unter- und Obergrenze; eine verdrehte Obergrenze zählt nicht', () => {
    expect(seitenBereich(meta({ pages: 2, pagesBis: 3 }))).toEqual({ min: 2, max: 3 })
    expect(seitenArt(meta({ pages: 2, pagesBis: 3 }))).toBe('spanne')
    expect(seitenText(meta({ pages: 2, pagesBis: 3 }))).toBe('2–3 Seiten')
    expect(seitenArt(meta({ pages: 3, pagesBis: 2 }))).toBe('genau')
    // Ohne Untergrenze bleibt es automatisch
    expect(seitenArt(meta({ pages: 0, pagesBis: 3 }))).toBe('auto')
  })
})

describe('Seitenzahl im Auftrag an die KI', () => {
  it('ohne Vorgabe wählt die KI die Seitenzahl selbst', () => {
    const m = meta()
    const kontext = taskContext(m, profil(m))
    expect(kontext).toContain('Seitenzahl nicht vorgegeben')
    expect(kontext).not.toContain('RICHTWERT')
    expect(umfangRegeln(m)).toContain('Die Seitenzahl ist nicht vorgegeben')
    expect(umfangRegeln(m)).not.toContain('EINE Seite mehr')
    expect(taskCountRules(m, profil(m))).toContain('Minuten Bearbeitungszeit')
  })
  it('mit Vorgabe bleibt es beim Richtwert wie bisher', () => {
    const m = meta({ pages: 3 })
    expect(taskContext(m, profil(m))).toContain('RICHTWERT 3 DIN-A4-Seite(n)')
    expect(umfangRegeln(m)).toContain('Seitenzahl (3;')
    expect(umfangRegeln(m)).toContain('EINE Seite mehr')
    expect(taskCountRules(m, profil(m))).toContain('für 3 Seiten')
  })
  it('bei einer Spanne: zwischen zwei und drei Seiten, nach Bedarf des Materials', () => {
    const m = meta({ pages: 2, pagesBis: 3 })
    expect(taskContext(m, profil(m))).toContain('zwischen 2 und 3 DIN-A4-Seiten, nach Bedarf des Materials')
    expect(umfangRegeln(m)).toContain('zwischen 2 und 3 Seiten, nach Bedarf des Materials')
    expect(umfangRegeln(m)).toContain('höchstens 4')
    // Aufgaben-Richtwert: Untergrenze × kleinste, Obergrenze × größte Aufgabenzahl je Seite (Klasse 6: 3–5)
    expect(taskCountRules(m, profil(m))).toContain('6–15 Aufgaben für 2–3 Seiten')
  })
})

describe('Prüfungen rechnen ohne Vorgabe mit der Schätzung', () => {
  const blatt = (bilder: number): Sheet => ({ blocks: Array.from({ length: bilder }, (_, i) => ({ id: `b${i}`, type: 'image' })) }) as unknown as Sheet
  it('„mindestens ein Bild je Seite“ ohne Vorgabe', () => {
    const m = meta({ imageAmount: 'min1', minutes: 90 })
    expect(checkImageWish(blatt(2), m)).toEqual([])
    expect(checkImageWish(blatt(1), m)[0]?.message).toContain('etwa 2 Seiten')
  })
  it('bei einer Spanne genügt ein Bild je Seite der Untergrenze', () => {
    const m = meta({ imageAmount: 'min1', pages: 2, pagesBis: 4 })
    expect(checkImageWish(blatt(2), m)).toEqual([])
    expect(checkImageWish(blatt(1), m)).toHaveLength(1)
  })
})

describe('Vokabeltest: Seitenumfang auch als Spanne', () => {
  it('Text, Untergrenze und Prüfung der Spanne', () => {
    const spanne = { mode: 'range' as const, pages: 3, pagesMin: 2 }
    expect(pageLimitText(spanne)).toBe('2–3 Seiten')
    expect(pageLimitMin(spanne)).toBe(2)
    expect(pageLimitFits(spanne, [2, 3])).toBe(true)
    expect(pageLimitFits(spanne, [1])).toBe(false)
    expect(pageLimitFits(spanne, [4])).toBe(false)
  })
  it('ohne gültige Untergrenze gilt eine Seite weniger als die Obergrenze', () => {
    expect(pageLimitMin({ mode: 'range', pages: 3 })).toBe(2)
    expect(pageLimitMin({ mode: 'range', pages: 3, pagesMin: 5 })).toBe(2)
  })
  it('die bisherigen Arten bleiben unverändert', () => {
    expect(pageLimitText({ mode: 'max', pages: 1 })).toBe('höchstens 1 Seite')
    expect(pageLimitText({ mode: 'exact', pages: 2 })).toBe('genau 2 Seiten')
    expect(pageLimitFits({ mode: 'auto', pages: 2 }, [7])).toBe(true)
    expect(pageLimitFits({ mode: 'exact', pages: 2 }, [1])).toBe(false)
  })
})

describe('Abweichung von der Seitenvorgabe: Hinweis mit Grund und Vorschlägen', () => {
  const block = (type: WsBlockType, patch: Record<string, unknown> = {}): WsBlock => ({ ...newBlock(type), ...patch }) as WsBlock
  const blatt = (blocks: WsBlock[], seitenPlan?: Sheet['seitenPlan']): Sheet => ({
    id: 's',
    label: 'Arbeitsblatt',
    blocks,
    ...(seitenPlan ? { seitenPlan } : {})
  })

  it('ohne Vorgabe oder innerhalb der Vorgabe: kein Hinweis', () => {
    const s = blatt([block('task')])
    expect(seitenAbweichung(meta(), s, 3)).toBeNull()
    expect(seitenAbweichung(meta({ pages: 2, pagesBis: 3 }), s, 3)).toBeNull()
    expect(seitenAbweichung(meta({ pages: 2 }), s, 2)).toBeNull()
  })

  it('zu viele Seiten: Grund und Vorschläge der KI, wenn sie in die richtige Richtung gehen', () => {
    const text = block('text', { title: 'Quelle' })
    const s = blatt([text, block('task')], {
      geplant: 3,
      grund: 'Der Originalauszug lässt sich nicht kürzen.',
      vorschlaege: [
        { richtung: 'weniger', art: 'materialKuerzen', text: 'Den zweiten Absatz der Quelle kürzen.', blockId: text.id },
        { richtung: 'mehr', art: 'vertiefung', text: 'passt nicht zur Richtung' }
      ]
    })
    const a = seitenAbweichung(meta({ pages: 2 }), s, 3)!
    expect(a).toMatchObject({ gezaehlt: 3, richtung: 'weniger', grund: 'Der Originalauszug lässt sich nicht kürzen.' })
    // Die Vorschläge der KI zuerst, dazu die Stellschrauben der App (Schreibraum der Aufgabe)
    expect(a.vorschlaege.map((v) => v.art)).toEqual(['materialKuerzen', 'schreibraumKnapper'])
  })

  it('verschweigt die KI die Abweichung, meldet die App sie trotzdem – mit eigenen Vorschlägen (Faustregeln)', () => {
    const s = blatt([block('scaffold', { variant: 'wortspeicher' }), block('task'), block('task'), block('task'), block('task')])
    const a = seitenAbweichung(meta({ pages: 1 }), s, 2)!
    expect(a.grund).toBe('')
    expect(a.vorschlaege.every((v) => v.lokal)).toBe(true)
    expect(a.vorschlaege.map((v) => v.art)).toEqual(['hilfenAufKarten', 'zusammenlegen', 'schreibraumKnapper'])
    const zuWenig = seitenAbweichung(meta({ pages: 3 }), s, 2)!
    expect(zuWenig.richtung).toBe('mehr')
    expect(zuWenig.vorschlaege.map((v) => v.art)).toEqual(['vertiefung', 'sicherung', 'transfer'])
  })

  it('übernimmt die Angabe der KI und übersetzt Bausteinnummern in Kennungen', () => {
    const plan = seitenPlanAus(
      {
        geplant: 3,
        grund: ' Quelle ',
        vorschlaege: [{ richtung: 'weniger', art: 'zusammenlegen', text: 'Aufgabe 2 und 3 zusammenlegen', baustein: 1 }, { text: '' }]
      },
      ['a', 'b']
    )
    expect(plan).toEqual({
      geplant: 3,
      grund: 'Quelle',
      vorschlaege: [{ richtung: 'weniger', art: 'zusammenlegen', text: 'Aufgabe 2 und 3 zusammenlegen', blockId: 'b' }]
    })
    expect(seitenPlanAus({ geplant: 0, grund: '', vorschlaege: [] }, [])).toBeUndefined()
    expect(seitenPlanAus(undefined, [])).toBeUndefined()
  })

  it('der Auftrag verlangt die Angabe nur mit Vorgabe und zählt nur Aufgaben- und Materialseiten', () => {
    expect(seitenPlanRegeln(meta())).toContain('Keine Seitenvorgabe')
    const r = seitenPlanRegeln(meta({ pages: 2, pagesBis: 3 }))
    expect(r).toContain('Vorgabe 2–3 Seite(n)')
    expect(r).toContain('ohne Hilfekarten')
    expect(r).toContain('mehr ODER weniger')
  })

  it('Hilfekarten zählen nicht: 2 Aufgabenseiten + 1 Hilfekartenseite erfüllen die Vorgabe 2', () => {
    const karten = block('scaffold', { variant: 'hilfekarten', items: ['Tipp 1', 'Tipp 2'] })
    const s = blatt([block('task'), block('task'), karten])
    // Die Hilfekarten stehen nicht im Fluss des Blattes – sie bekommen ihre eigene Schlussseite
    const imFluss = blockLayout(s.blocks).map((e) => ({ id: e.block.id, height: 900 }))
    expect(imFluss.some((i) => i.id === karten.id)).toBe(false)
    const seiten = paginate(imFluss, 1000, 1000)
    expect(seiten).toHaveLength(2)
    expect(seitenAbweichung(meta({ pages: 2 }), s, seiten.length)).toBeNull()
  })
})

describe('Die Angabe der KI landet am Blatt', () => {
  it('buildSheet übernimmt seiten und ordnet den Baustein zu', () => {
    const s = buildSheetForTest({
      blocks: [
        { outlineIndex: 0, type: 'text', title: 'Quelle', body: 'Text' },
        { outlineIndex: 1, type: 'task', instruction: 'Nenne …' }
      ],
      seiten: { geplant: 3, grund: 'Quelle ungekürzt', vorschlaege: [{ richtung: 'weniger', art: 'materialKuerzen', text: 'Quelle kürzen', baustein: 0 }] }
    })
    expect(s.seitenPlan?.grund).toBe('Quelle ungekürzt')
    expect(s.seitenPlan?.vorschlaege[0].blockId).toBe(s.blocks.find((b) => b.type === 'text')?.id)
  })
})
