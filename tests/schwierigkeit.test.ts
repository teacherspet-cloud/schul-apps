import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { buildLearnerProfile } from '../src/renderer/src/modules/arbeitsblatt/didactics/profile'
import {
  fassungsLabel,
  MITTEL,
  profilFuerStufe,
  STANDARD_STUFEN,
  stufeFuer,
  stufenRegeln,
  stufeText
} from '../src/renderer/src/modules/arbeitsblatt/didactics/schwierigkeit'
import { levelInstruction } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { lesbarkeitAngleichen, lesbarkeitsBefund, lesbarkeitsZiel, messbar } from '../src/renderer/src/modules/arbeitsblatt/generation/lesbarkeit'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { Sheet, TextBlock, WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Schwierigkeit von Arbeitsblättern (27.09.2026): Anspruch und Sprache getrennt wählbar, bei einem
 * Niveau fürs Blatt, bei ★/★★ je Fassung; „mittel" ist der Jahrgang. Nach der Erzeugung wird
 * die Lesbarkeit nachgemessen und bei Abweichung umgeschrieben.
 */

const meta = (over: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'geschichte',
  subjectLabel: 'Geschichte',
  topic: 'Julikrise 1914',
  grade: 9,
  ...over
})

const SCHWER =
  'Die außenpolitische Konstellation der europäischen Großmächte, die sich infolge jahrzehntelanger Bündnisverpflichtungen, wechselseitiger Aufrüstungsanstrengungen und nationalistischer Prestigeerwägungen herausgebildet hatte, verwandelte die regionale Auseinandersetzung zwischen Österreich-Ungarn und Serbien innerhalb weniger Wochen in einen kontinentalen Konflikt, dessen Eskalationsdynamik von den verantwortlichen Entscheidungsträgern unterschätzt wurde. Die diplomatischen Initiativen, die Vermittlungsvorschläge und die halbherzigen Deeskalationsbemühungen scheiterten an gegenseitigem Misstrauen, militärischen Aufmarschplänen und der Überzeugung, dass Zurückweichen als Schwäche ausgelegt würde.'
const LEICHT =
  'Im Juli 1914 gab es eine Krise. Ein Mann schoss auf den Thronfolger. Er kam aus Österreich. Viele Länder hatten Verträge. Sie halfen sich im Krieg. So wurde aus einem Streit ein großer Krieg. Die Politiker sahen die Gefahr nicht. Sie wollten stark wirken. Niemand wollte nachgeben. Nach wenigen Wochen kämpften fast alle Länder. Das war der Anfang des Ersten Weltkriegs. Er dauerte vier Jahre. Millionen Menschen starben.'

describe('Stufen je Blatt und je Fassung', () => {
  it('ohne Wahl gilt der Jahrgang, bei ★/★★ die bisherigen Stufen', () => {
    expect(stufeFuer(meta(), null)).toEqual(MITTEL)
    expect(stufeFuer(meta(), 1)).toEqual(STANDARD_STUFEN[1])
    expect(stufeFuer(meta(), 2)).toEqual(STANDARD_STUFEN[2])
  })

  it('die Wahl der Lehrkraft gilt: ein Niveau anspruchsvoll, ★ mittel und ★★ anspruchsvoll', () => {
    const eins = meta({ differentiation: { levels: 1, mode: 'separate', schwierigkeit: { anspruch: 'anspruchsvoll', sprache: 'mittel' } } })
    expect(stufeText(stufeFuer(eins, null))).toBe('Anspruch anspruchsvoll, Sprache mittel')
    const zwei = meta({
      differentiation: {
        levels: 2,
        mode: 'separate',
        stufen: { 1: { anspruch: 'mittel', sprache: 'mittel' }, 2: { anspruch: 'anspruchsvoll', sprache: 'anspruchsvoll' } }
      }
    })
    expect(stufeText(stufeFuer(zwei, 1))).toBe('jahrgangsgemäß')
    expect(stufeText(stufeFuer(zwei, 2))).toBe('Anspruch anspruchsvoll, Sprache anspruchsvoll')
    expect(fassungsLabel(2, stufeFuer(zwei, 2))).toBe('★★ anspruchsvoll')
    expect(fassungsLabel(1, { anspruch: 'mittel', sprache: 'grundlegend' })).toBe('★ mittel / Sprache grundlegend')
  })

  it('das Profil wird relativ zum Jahrgang verschoben – Regeln für die KI eingeschlossen', () => {
    const p = buildLearnerProfile(meta())
    expect(profilFuerStufe(p, MITTEL)).toBe(p)
    const leicht = profilFuerStufe(p, { anspruch: 'grundlegend', sprache: 'grundlegend' })
    expect(leicht.afbMix.I).toBeGreaterThan(p.afbMix.I)
    expect(leicht.afbMix.III).toBeLessThan(p.afbMix.III)
    expect(leicht.afbMix.I + leicht.afbMix.II + leicht.afbMix.III).toBe(100)
    expect(leicht.language.lixMax).toBe(p.language.lixMax - 6)
    expect(leicht.language.avgSentenceWords).toBeLessThan(p.language.avgSentenceWords)
    expect(leicht.scaffolding).toBe('hoch')
    expect(leicht.promptRules.join('\n')).toContain(`LIX höchstens ${p.language.lixMax - 6}`)
    expect(leicht.promptRules.join('\n')).toContain(`${leicht.afbMix.I} % AFB I`)
    expect(leicht.promptRules.join('\n')).toContain('Hilfen: umfangreich')
    expect(leicht.promptRules.length).toBe(p.promptRules.length)
    const schwer = profilFuerStufe(p, { anspruch: 'anspruchsvoll', sprache: 'anspruchsvoll' })
    expect(schwer.afbMix.III).toBeGreaterThan(p.afbMix.III)
    expect(schwer.language.lixMax).toBe(p.language.lixMax + 6)
    expect(schwer.scaffolding).toBe('gering')
    // Nur die Sprache verschoben: Anforderungsbereiche und Hilfen bleiben
    const nurSprache = profilFuerStufe(p, { anspruch: 'mittel', sprache: 'anspruchsvoll' })
    expect(nurSprache.afbMix).toEqual(p.afbMix)
    expect(nurSprache.scaffolding).toBe(p.scaffolding)
    expect(nurSprache.language.lixMax).toBe(p.language.lixMax + 6)
  })

  it('die Auftragsregeln nennen Denkprozess, Hilfen und Sprache der Stufe', () => {
    const grund = stufenRegeln({ anspruch: 'grundlegend', sprache: 'grundlegend' }, buildLearnerProfile(meta())).join('\n')
    expect(grund).toContain('Reproduktion und naher Transfer')
    expect(grund).toContain('gelöstes Beispiel')
    expect(grund).toContain('Hilfekarten')
    expect(grund).toMatch(/kein Satz länger als \d+ Wörter/)
    const hoch = stufenRegeln({ anspruch: 'anspruchsvoll', sprache: 'anspruchsvoll' }).join('\n')
    expect(hoch).toContain('Problemlösen')
    expect(hoch).toContain('Knobel- oder Forscheraufgabe')
    expect(hoch).toContain('Fachsprache')
    expect(stufenRegeln(MITTEL).join('\n')).not.toContain('Knobel')
  })

  it('ein Blatt mit einem Niveau bekommt die Stufe in den Auftrag – jahrgangsgemäß bleibt still', () => {
    expect(levelInstruction(meta(), null)).toBe('')
    const m = meta({ differentiation: { levels: 1, mode: 'separate', schwierigkeit: { anspruch: 'grundlegend', sprache: 'mittel' } } })
    expect(levelInstruction(m, null)).toContain('Schwierigkeit dieses Blattes: Anspruch grundlegend, Sprache mittel')
    const zwei = meta({ differentiation: { levels: 2, mode: 'separate', stufen: { 1: MITTEL, 2: { anspruch: 'anspruchsvoll', sprache: 'anspruchsvoll' } } } })
    expect(levelInstruction(zwei, 1)).toContain('Diese Fassung ist ★ (jahrgangsgemäß)')
    expect(levelInstruction(zwei, 2)).toContain('Diese Fassung ist ★★ (Anspruch anspruchsvoll, Sprache anspruchsvoll)')
    expect(levelInstruction(zwei, 2)).toContain('Knobel- oder Forscheraufgabe')
    // Ein Blatt mit ★-markierten Zusatzaufgaben bleibt unverändert
    expect(levelInstruction(meta({ differentiation: { levels: 2, mode: 'combined' } }), null)).toContain('Fundamentum')
  })
})

describe('Lesbarkeit nachmessen und angleichen', () => {
  const text = (body: string, patch: Partial<TextBlock> = {}): TextBlock => ({ ...(newBlock('text') as TextBlock), body, ...patch })
  const sheet = (...blocks: TextBlock[]): Sheet => ({ id: 's', label: 'Arbeitsblatt', blocks })

  it('misst nur Lesetexte ohne Quellenangabe und keine zielsprachigen Texte', () => {
    const m = meta()
    expect(messbar(text(SCHWER), m)).toBe(true)
    expect(messbar(text(SCHWER, { source: 'Quelle X' }), m)).toBe(false)
    expect(messbar(text(SCHWER, { ref: 'quelle' }), m)).toBe(false)
    expect(messbar(text(SCHWER, { nurLoesung: true }), m)).toBe(false)
    expect(messbar(newBlock('task'), m)).toBe(false)
    const en = meta({ subjectId: 'englisch', subjectLabel: 'Englisch' })
    expect(messbar(text(SCHWER), en)).toBe(false)
    expect(messbar(text(SCHWER, { language: 'de' }), en)).toBe(true)
  })

  it('erkennt zu schwere Texte, bei anspruchsvoller Sprache auch zu leichte', () => {
    const p = buildLearnerProfile(meta())
    const mittel = lesbarkeitsZiel(p, MITTEL)
    expect(lesbarkeitsBefund(SCHWER, mittel)?.richtung).toBe('leichter')
    expect(lesbarkeitsBefund(LEICHT, mittel)).toBeNull()
    expect(lesbarkeitsBefund('Kurz.', mittel)).toBeNull()
    const hoch = lesbarkeitsZiel(profilFuerStufe(p, { anspruch: 'mittel', sprache: 'anspruchsvoll' }), { anspruch: 'mittel', sprache: 'anspruchsvoll' })
    expect(hoch.lixMin).not.toBeNull()
    expect(lesbarkeitsBefund(LEICHT, hoch)?.richtung).toBe('schwerer')
  })

  it('lässt nur abweichende Texte umschreiben und übernimmt nur eine bessere Fassung', async () => {
    const p = buildLearnerProfile(meta())
    const calls: StructuredRequest[] = []
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      calls.push(req)
      return { body: LEICHT } as T
    }
    const s = sheet(text(SCHWER), text(LEICHT), text(SCHWER, { source: 'Aus einem Lehrbuch' }))
    const out = await lesbarkeitAngleichen(meta(), s, p, MITTEL, ai)
    expect(calls.length).toBe(1)
    expect(calls[0].schemaName).toBe('text_lesbarkeit')
    expect(calls[0].user).toContain('leichter werden')
    expect((out.blocks[0] as TextBlock).body).toBe(LEICHT)
    expect(out.blocks[0].warnings?.join(' ')).toMatch(/\[Lesbarkeit\] Text sprachlich leichter gemacht: LIX \d+ → \d+/)
    expect((out.blocks[1] as TextBlock).body).toBe(LEICHT)
    expect((out.blocks[2] as TextBlock).body).toBe(SCHWER)

    // Bringt die Umformulierung nichts, bleibt der Text – mit Hinweis
    const gleich = async <T>(): Promise<T> => ({ body: SCHWER }) as T
    const bleibt = await lesbarkeitAngleichen(meta(), sheet(text(SCHWER)), p, MITTEL, gleich)
    expect((bleibt.blocks[0] as TextBlock).body).toBe(SCHWER)
    expect(bleibt.blocks[0].warnings?.join(' ')).toContain('keine Verbesserung')

    // Fehlschlag der Anfrage: Text bleibt, Hinweis bleibt
    const kaputt = async <T>(): Promise<T> => {
      throw new Error('aus')
    }
    const fehl = await lesbarkeitAngleichen(meta(), sheet(text(SCHWER)), p, MITTEL, kaputt)
    expect((fehl.blocks[0] as TextBlock).body).toBe(SCHWER)
    expect(fehl.blocks[0].warnings?.join(' ')).toContain('fehlgeschlagen')
  })
})
