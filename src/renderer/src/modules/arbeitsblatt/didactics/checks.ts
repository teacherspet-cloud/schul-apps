import type { Afb, AfbMix } from './ageBands'
import { tooAdvancedOperators } from './operators'
import type { LearnerProfile } from './profile'

export interface Readability {
  words: number
  sentences: number
  longWords: number
  avgSentenceWords: number
  maxSentenceWords: number
  lix: number
}

/** Lesbarkeitsindex LIX = Wörter/Sätze + 100 · lange Wörter (> 6 Buchstaben)/Wörter (Björnsson). */
export function readability(text: string): Readability {
  const clean = text
    .replace(/\$[^$]*\$/g, ' ') // Formeln nicht mitzählen
    .replace(/[*_#>|]/g, ' ')
  const sentences = clean
    .split(/(?<=[.!?:;])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /\p{L}/u.test(s))
  const wordsIn = (s: string): string[] => s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []
  const sentenceLengths = sentences.map((s) => wordsIn(s).length).filter((n) => n > 0)
  const allWords = sentences.flatMap(wordsIn)
  const words = allWords.length
  const longWords = allWords.filter((w) => w.replace(/[^\p{L}]/gu, '').length > 6).length
  const count = Math.max(1, sentenceLengths.length)
  return {
    words,
    sentences: sentenceLengths.length,
    longWords,
    avgSentenceWords: words / count,
    maxSentenceWords: sentenceLengths.length ? Math.max(...sentenceLengths) : 0,
    lix: words ? words / count + (100 * longWords) / words : 0
  }
}

export interface DidacticWarning {
  kind:
    | 'readability'
    | 'sentence'
    | 'afb'
    | 'afbMix'
    | 'tasksPerPage'
    | 'operator'
    | 'scaffold'
    | 'closure'
    | 'taskMix'
    | 'taskCount'
    | 'instruction'
    | 'mediation'
    | 'writing'
    | 'listening'
    // Wortlaut der einzelnen Verstehensfragen (didactics/itemWording.ts)
    | 'itemWording'
    // Die Lehrkraft wollte Bilder, es kam keines (didactics/sheetChecks.ts)
    | 'image'
    // Bilingualer Sachfachunterricht (didactics/bilingual.ts)
    | 'bilingual'
  message: string
}

/** Prüft einen Text gegen die Sprachgrenzen des Profils. Kurze Texte (< 40 Wörter) werden nicht bewertet. */
export function checkText(text: string, profile: LearnerProfile, label: string): DidacticWarning[] {
  const r = readability(text)
  if (r.words < 40) return []
  const out: DidacticWarning[] = []
  if (r.lix > profile.language.lixMax + 3) {
    out.push({
      kind: 'readability',
      message: `${label}: Text für Kl. ${profile.ageBand.label.replace('Klasse ', '')} vermutlich zu schwer (LIX ${Math.round(r.lix)} > ${profile.language.lixMax}).`
    })
  }
  if (r.avgSentenceWords > profile.language.avgSentenceWords * 1.3) {
    out.push({
      kind: 'sentence',
      message: `${label}: Sätze im Schnitt zu lang (${r.avgSentenceWords.toFixed(1).replace('.', ',')} statt ≈ ${Math.round(profile.language.avgSentenceWords)} Wörter).`
    })
  }
  return out
}

/** Vergleicht die tatsächliche Verteilung der Anforderungsbereiche mit dem Soll (Toleranz ±15 Prozentpunkte). */
export function checkAfbMix(afbs: (Afb | undefined)[], target: AfbMix): DidacticWarning[] {
  const tagged = afbs.filter((a): a is Afb => Boolean(a))
  if (tagged.length < 3) return []
  const actual = (['I', 'II', 'III'] as Afb[]).map((k) => Math.round((100 * tagged.filter((a) => a === k).length) / tagged.length))
  const off = (['I', 'II', 'III'] as Afb[]).filter((k, i) => Math.abs(actual[i] - target[k]) > 15)
  if (!off.length) return []
  return [
    {
      kind: 'afb',
      message: `Anforderungsbereiche ${actual.join(' / ')} % weichen vom Soll ${target.I} / ${target.II} / ${target.III} % ab (${off.map((k) => `AFB ${k}`).join(', ')}).`
    }
  ]
}

export function actualAfbMix(afbs: (Afb | undefined)[]): AfbMix | null {
  const tagged = afbs.filter((a): a is Afb => Boolean(a))
  if (!tagged.length) return null
  const pct = (k: Afb): number => Math.round((100 * tagged.filter((a) => a === k).length) / tagged.length)
  return { I: pct('I'), II: pct('II'), III: pct('III') }
}

/** Findet Operatoren, die für die Stufe zu anspruchsvoll sind. */
export function checkOperators(instruction: string, profile: LearnerProfile, label: string): DidacticWarning[] {
  const lower = instruction.toLocaleLowerCase('de')
  const hits = tooAdvancedOperators(profile.stage, profile.grade).filter((op) => {
    const stem = op.toLocaleLowerCase('de').replace(/(en|n)$/, '')
    return new RegExp(`(^|[^\\p{L}])${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\p{L}*`, 'u').test(lower)
  })
  return hits.length ? [{ kind: 'operator', message: `${label}: Operator „${hits[0]}“ ist für ${profile.ageBand.label} sehr anspruchsvoll.` }] : []
}

/**
 * Stil: Passiv und Nominalisierungen erschweren das Verstehen (sprachsensibler Fachunterricht).
 * Geprüft wird erst ab 40 Wörtern.
 */
export function checkStyle(text: string, label: string): DidacticWarning[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 40) return []
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().split(/\s+/).length > 2)
  const passive = sentences.filter((s) => /\b(wird|werden|wurde|wurden)\b/.test(s) && /\w+(t|en)\b/.test(s)).length
  const nominal = words.filter((w) => /(ung|heit|keit|nis|tion|ismus)(en)?[.,;:]?$/i.test(w)).length
  const out: DidacticWarning[] = []
  if (sentences.length >= 4 && passive / sentences.length > 0.35) {
    out.push({ kind: 'sentence', message: `${label}: viele Passivsätze (${Math.round((passive / sentences.length) * 100)} %) – besser im Aktiv formulieren.` })
  }
  if (nominal / words.length > 0.12) {
    out.push({ kind: 'sentence', message: `${label}: viele Nominalisierungen (${Math.round((nominal / words.length) * 100)} %) – lieber Verben verwenden.` })
  }
  return out
}

export function checkTasksPerPage(tasksOnPages: number[], profile: LearnerProfile): DidacticWarning[] {
  const max = profile.tasks.perPage[1]
  const pages = tasksOnPages.map((n, i) => ({ n, page: i + 1 })).filter((p) => p.n > max + 1)
  return pages.map((p) => ({
    kind: 'tasksPerPage' as const,
    message: `Seite ${p.page}: ${p.n} Aufgaben – für ${profile.ageBand.label} sind höchstens ${max} üblich.`
  }))
}
