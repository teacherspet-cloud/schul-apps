import { describe, expect, it } from 'vitest'
import {
  bewertungsregel,
  bilingualAktiv,
  bilingualHinweise,
  checkBilingual,
  operatorenFuer
} from '../src/renderer/src/modules/arbeitsblatt/didactics/bilingual'
import { checkSheet } from '../src/renderer/src/modules/arbeitsblatt/didactics/sheetChecks'
import { zeigtUebersetzung } from '../src/renderer/src/modules/arbeitsblatt/didactics/phraseRules'
import { loesungsspracheRegel, operatorRules, phraseSheetModus, systemPrompt } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { mitHilfsblatt } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { PhrasesBlock, Sheet, TaskBlock, WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Wunsch der Lehrkraft (25.09.2026): bilingualen Sachfachunterricht so einbinden, „dass er
 * einwandfrei funktioniert", mit Länderunterschieden. Die Entscheidungen aus der Rücksprache
 * stehen in `didactics/bilingual.ts`.
 */
const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'geschichte',
  subjectLabel: 'Geschichte',
  grade: 9,
  bilingual: { an: true, sprache: 'en', spracheLabel: 'Englisch', form: 'sachfach' },
  ...patch
})

const aufgabe = (instruction: string, afb: TaskBlock['afb']): TaskBlock => ({ ...(newBlock('task') as TaskBlock), instruction, afb, solution: 'x' })
const glossar = (items: { text: string; german: string }[]): PhrasesBlock => ({
  ...(newBlock('phrases') as PhrasesBlock),
  groups: [{ label: 'Subject terms', items }]
})
const blatt = (...blocks: Sheet['blocks']): Sheet => ({ stars: 0, blocks }) as unknown as Sheet

describe('Wann ein Blatt bilingual ist', () => {
  it('nur in Sachfächern', () => {
    expect(bilingualAktiv(meta())).toBe(true)
    expect(bilingualAktiv(meta({ subjectId: 'biologie', subjectLabel: 'Biologie' }))).toBe(true)
    // Deutsch, Fremdsprachen und Latein sind keine Sachfächer (Berlin, AV 2020, Nr. 2 Abs. 3)
    for (const subjectId of ['deutsch', 'englisch', 'franzoesisch', 'latein', 'daz']) {
      expect(bilingualAktiv(meta({ subjectId })), subjectId).toBe(false)
    }
  })

  it('nicht, wenn der Schalter aus ist', () => {
    expect(bilingualAktiv(meta({ bilingual: { an: false, sprache: 'en', spracheLabel: 'Englisch', form: 'modul' } }))).toBe(false)
    expect(bilingualAktiv(meta({ bilingual: undefined }))).toBe(false)
  })
})

describe('Bewertung nach Bundesland', () => {
  it('nimmt die belegte Regel des Landes', () => {
    expect(bewertungsregel(meta({ stateId: 'NW' }))).toMatchObject({ belegt: true })
    expect(bewertungsregel(meta({ stateId: 'NW' })).regel).toMatch(/20 %/)
    expect(bewertungsregel(meta({ stateId: 'BY' })).regel).toMatch(/wählen/)
  })

  it('Thüringen hat für Module eine eigene Regel', () => {
    const th = bewertungsregel(meta({ stateId: 'TH', bilingual: { an: true, sprache: 'en', spracheLabel: 'Englisch', form: 'modul' } }))
    expect(th.regel).toMatch(/Modulen/)
  })

  it('fällt ohne Beleg auf die KMK-Grundregel zurück und sagt es', () => {
    const mv = meta({ stateId: 'MV' })
    expect(bewertungsregel(mv)).toMatchObject({ belegt: false })
    expect(bilingualHinweise(mv).join(' ')).toMatch(/keine eigene Bewertungsregel/)
  })
})

describe('Operatoren', () => {
  it('gibt es belegt für Englisch und Französisch, nicht für Spanisch und Italienisch', () => {
    expect(operatorenFuer('en')?.some((o) => o.ziel === 'assess' && o.afb === 'III')).toBe(true)
    expect(operatorenFuer('fr')?.some((o) => o.ziel === 'comparer' && o.afb === 'II')).toBe(true)
    expect(operatorenFuer('es')).toBeNull()
    expect(operatorenFuer('it')).toBeNull()
  })

  it('ersetzen im Prompt die deutsche Liste statt ihr zu widersprechen', () => {
    const regeln = operatorRules(meta(), undefined)
    expect(regeln).toMatch(/describe \(beschreiben\)/)
    expect(regeln).toMatch(/Anforderungsbereich III: .*assess/)
    // Ohne bilingual bleibt es bei den deutschen Operatoren
    expect(operatorRules(meta({ bilingual: undefined }), undefined)).not.toMatch(/describe/)
  })

  it('werden auf dem Blatt gegen die zielsprachliche Liste geprüft', () => {
    const ok = blatt(aufgabe('Describe the poster M1.', 'I'), aufgabe('Assess the decision.', 'III'), glossar([{ text: 'treaty', german: 'Vertrag' }]))
    expect(checkBilingual(ok, meta()).filter((w) => w.kind === 'operator')).toEqual([])

    const falsch = blatt(aufgabe('Beschreibe das Plakat M1.', 'I'), aufgabe('Compare M1 and M2.', 'III'), glossar([{ text: 'treaty', german: 'Vertrag' }]))
    const meldungen = checkBilingual(falsch, meta()).map((w) => w.message)
    expect(meldungen.some((m) => m.includes('„beschreibe“'))).toBe(true)
    expect(meldungen.some((m) => m.includes('Anforderungsbereich II'))).toBe(true)
  })

  it('meldet englische Operatoren nicht mehr als unbekannt', () => {
    const b = blatt(aufgabe('Describe the poster M1.', 'I'), glossar([{ text: 'treaty', german: 'Vertrag' }]))
    const meldungen = checkSheet(b, meta()).map((w) => w.message)
    expect(meldungen.some((m) => m.includes('nicht in der Operatorenliste für Geschichte'))).toBe(false)
  })

  it('prüft bei Spanisch nicht gegen eine erfundene Liste', () => {
    const b = blatt(aufgabe('Describe el cartel.', 'I'), glossar([{ text: 'tratado', german: 'Vertrag' }]))
    const es = meta({ bilingual: { an: true, sprache: 'es', spracheLabel: 'Spanisch', form: 'sachfach' } })
    expect(checkBilingual(b, es).filter((w) => w.kind === 'operator')).toEqual([])
  })
})

describe('Zweisprachiges Glossar', () => {
  it('sticht die Einsprachigkeits-Schwelle – auch in der Oberstufe', () => {
    expect(zeigtUebersetzung(meta({ grade: 12, cefrLevel: 'C1' }), 3)).toBe(true)
  })

  it('wird von selbst eingeschaltet und in die Gliederung gesetzt', () => {
    expect(phraseSheetModus(meta())).toBe('inline')
    const gliederung = mitHilfsblatt({ items: [] } as never, meta())
    expect(gliederung.items.map((i) => i.type)).toEqual(['phrases'])
    expect(gliederung.items[0].purpose).toMatch(/Zweisprachiges Fachglossar/)
  })

  it('wird gemeldet, wenn es fehlt oder die deutsche Spalte leer ist', () => {
    expect(checkBilingual(blatt(aufgabe('Describe M1.', 'I')), meta()).some((w) => w.message.includes('Fachglossar fehlt'))).toBe(true)
    const halb = blatt(
      aufgabe('Describe M1.', 'I'),
      glossar([
        { text: 'treaty', german: 'Vertrag' },
        { text: 'armistice', german: '' }
      ])
    )
    expect(checkBilingual(halb, meta()).some((w) => w.message.includes('„armistice“'))).toBe(true)
  })
})

describe('Prompt', () => {
  it('enthält die bilingualen Regeln nur, wenn bilingual unterrichtet wird', () => {
    const m = meta()
    const prompt = systemPrompt(m, profileFromMeta(m))
    expect(prompt).toMatch(/BILINGUALER SACHFACHUNTERRICHT/)
    expect(prompt).toMatch(/ZWEISPRACHIGES FACHGLOSSAR/)
    const ohne = meta({ bilingual: undefined })
    expect(systemPrompt(ohne, profileFromMeta(ohne))).not.toMatch(/BILINGUALER SACHFACHUNTERRICHT/)
  })

  it('verlangt die Musterlösung in der Arbeitssprache', () => {
    expect(loesungsspracheRegel(meta())).toMatch(/AUF ENGLISCH/)
    expect(loesungsspracheRegel(meta({ bilingual: undefined }))).toBe('')
  })

  it('weist bei der Übungsklausur auf die Prüfungssprache hin', () => {
    const klausur = meta({ grade: 12, abitur: { an: true, niveau: 'gA', aufgabenart: 'quelle', klausur: true } as never })
    const b = blatt(aufgabe('Describe M1.', 'I'), glossar([{ text: 'treaty', german: 'Vertrag' }]))
    expect(checkBilingual(b, klausur).some((w) => w.message.startsWith('Prüfungssprache'))).toBe(true)
    expect(checkBilingual(b, meta()).some((w) => w.message.startsWith('Prüfungssprache'))).toBe(false)
  })
})
