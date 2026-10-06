/**
 * Grammatik-Recherche 06.10.2026 (abgestimmt: Thema mit Teilformen, Grundlinie + belegte Abweichungen je Land/Schulform,
 * GER erkennen / bilden / sicher). Daten: grammatikRecherche.json aus scripts/grammatik-katalog.mjs.
 */
import { describe, expect, it } from 'vitest'
import {
  abweichungFuer,
  abweichungsHinweis,
  GRAMMAR_SUBJECTS,
  GRAMMAR_TOPICS,
  teilformenAuftrag,
  teilformenFuer,
  topicFits
} from '../src/renderer/src/modules/arbeitsblatt/didactics/grammar'
import { LAENDER, SCHULFORMEN } from '../src/shared/schulformen'

const thema = (id: string) => GRAMMAR_TOPICS.find((t) => t.id === id)!
const futuro = thema('es.verb.futuro_simple')
const sp = (stateId: string, schoolTypeId: string) => ({ subjectId: 'spanisch', grade: 10, sequence: 'fs2' as const, stateId, schoolTypeId })

describe('Grammatik-Recherche: Umfang', () => {
  it('alle Grammatikfächer haben Themen mit Teilformen; sehr ausführlich', () => {
    for (const f of GRAMMAR_SUBJECTS) {
      const liste = GRAMMAR_TOPICS.filter((t) => t.subject === f)
      const mitTeilen = liste.filter((t) => (t.teilformen?.length ?? 0) >= 3)
      expect(mitTeilen.length / liste.length, f).toBeGreaterThan(0.6)
    }
    expect(GRAMMAR_TOPICS.reduce((a, t) => a + (t.teilformen?.length ?? 0), 0)).toBeGreaterThan(4000)
    const ids = GRAMMAR_TOPICS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('Abweichungen nennen nur bekannte Länder und Schulformen und haben einen Beleg', () => {
    const laender = new Set(LAENDER.map((l) => l.id))
    const formen = new Set(Object.values(SCHULFORMEN).flatMap((l) => l.map((s) => s.id)))
    for (const t of GRAMMAR_TOPICS)
      for (const a of t.abweichungen ?? []) {
        for (const l of a.laender) expect(laender.has(l), `${t.id}: ${l}`).toBe(true)
        for (const s of a.schulformen) expect(formen.has(s), `${t.id}: ${s}`).toBe(true)
        expect(a.quelle?.trim(), t.id).toBeTruthy()
      }
  })
  it('Teilformen tragen eine Stufe und GER (bzw. Phase) für erkennen', () => {
    const ohne = GRAMMAR_TOPICS.flatMap((t) => (t.teilformen ?? []).filter((x) => !Number.isFinite(x.from) || !x.erkennen).map((x) => `${t.id}/${x.id}`))
    expect(ohne.length).toBeLessThan(20)
  })
})

describe('Grammatik-Recherche: Abweichungen je Land und Schulform', () => {
  it('MV Regionale Schule: futuro simple im Rahmenplan nicht genannt → nicht vorgeschlagen', () => {
    expect(abweichungFuer(futuro, sp('MV', 'regionale-schule'))?.entfaellt).toBe(true)
    expect(topicFits(futuro, sp('MV', 'regionale-schule'))).toBe(false)
    expect(abweichungsHinweis(futuro, sp('MV', 'regionale-schule'))).toMatch(/nicht genannt/)
  })
  it('MV Gymnasium: eigenes Lernjahr; ohne Abweichung (BY) gilt die Grundlinie', () => {
    expect(abweichungFuer(futuro, sp('MV', 'gymnasium'))?.from).toBe(4)
    expect(topicFits(futuro, sp('MV', 'gymnasium'))).toBe(true)
    expect(abweichungFuer(futuro, sp('BY', 'gymnasium'))).toBeUndefined()
  })
  it('Hamburg: nur GER-Stufe – dann entscheidet das Niveau der Lerngruppe', () => {
    expect(abweichungFuer(futuro, sp('HH', 'gymnasium'))?.niveau).toBe('A2')
    expect(topicFits(futuro, { ...sp('HH', 'gymnasium'), grade: 7, cefrLevel: 'A1' })).toBe(false)
    expect(topicFits(futuro, { ...sp('HH', 'gymnasium'), grade: 7, cefrLevel: 'A1+' })).toBe(true)
  })
  it('eine Abweichung für eine andere Fremdsprachenfolge greift nicht', () => {
    expect(abweichungFuer(futuro, { ...sp('MV', 'gymnasium'), sequence: 'fs3' })?.folge ?? 'fs3').toBe('fs3')
  })
})

describe('Grammatik-Recherche: Teilformen', () => {
  const past = thema('en.verb.past_simple')
  const q = (grade: number) => ({ subjectId: 'englisch', grade, stateId: 'NI', schoolTypeId: 'gymnasium', sequence: 'fs1' as const })
  it('simple past: Bildung, Verneinung, Fragen im 1. Lernjahr; Erzähltempus erst später', () => {
    const k5 = teilformenFuer(past, q(5))
    const status = Object.fromEntries(k5.map((x) => [x.teil.id, x.status]))
    expect(status.regelmaessig).toBe('bilden')
    expect(status.verneinung).toBe('bilden')
    expect(status.erzaehltempus).toBe('spaeter')
    expect(teilformenFuer(past, q(6)).find((x) => x.teil.id === 'erzaehltempus')?.status).toBe('bilden')
  })
  it('Auftrag an die KI: bilden / nur erkennen / nicht verwenden; Auswahl der Lehrkraft geht vor', () => {
    const alle = teilformenAuftrag([past], q(5))
    expect(alle).toMatch(/TEILFORMEN – /)
    expect(alle).toMatch(/selbst bilden: .*Verneinung/)
    expect(alle).toMatch(/NICHT verwenden .*Erzähl/)
    const nur = teilformenAuftrag([past], q(6), [`${past.id}/regelmaessig`])
    expect(nur).toMatch(/von der Lehrkraft ausgewählt/)
    expect(nur).toMatch(/NICHT verwenden .*nicht gewählt/)
    expect(nur.split('\n').find((z) => z.startsWith('- selbst bilden'))).not.toMatch(/Verneinung/)
  })
  it('über dem GER-Niveau der Lerngruppe: nur erkennen', () => {
    const inv = thema('en.focus.inversion')
    const k9 = teilformenFuer(inv, { ...q(9), cefrLevel: 'B1' })
    expect(k9.some((x) => x.status === 'erkennen')).toBe(true)
    expect(k9.some((x) => x.status === 'bilden')).toBe(false)
  })
})
