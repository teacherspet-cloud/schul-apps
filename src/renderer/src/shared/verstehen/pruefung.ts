/**
 * App-Prüfung der Schwierigkeitsstufe über die Wortüberlappung Text ↔ Item (29.09.2026).
 *
 * Entscheidung der Lehrkraft: Die KI schlägt die Stufe vor, die App kontrolliert die
 * Merkmale, die sich OHNE KI entscheiden lassen – genau die, die Kostin (2004) gemessen hat:
 * - Anteil der Wörter der richtigen Option, die im Text vorkommen (je höher, desto leichter),
 * - Wortgleichheit der Distraktoren im Vergleich zur richtigen Option (höher = schwerer).
 *
 * Wortgleichheit ist damit KEIN Fehler an sich mehr (bis 29.09.2026 meldete
 * `didactics/itemWording.ts` jede wörtlich übernommene Option). Ein Befund entsteht nur, wenn
 * die ausgewiesene Stufe nicht zu dem passt, was im Text steht: Stufe 1 ohne wörtliche Lösung,
 * Stufe 3 und höher mit abgeschriebener Lösung, Stufe 4 ohne „schwerere" Distraktoren.
 * Items ohne Stufe werden nicht bewertet.
 */
import { plainText } from '../richtext/parse'
import type { Answer, TaskBlock } from '../../modules/arbeitsblatt/model/types'
import { istStufe, STUFEN, type VerstehensStufe } from './stufen'

/** Kleine Wörter, die in jedem Satz stehen – sie sagen über Wortgleichheit nichts. */
const FUELLWOERTER = new Set(
  (
    'the a an and or but of to in on at for with by from is are was were be been am do does did has have had it its this that these those ' +
    'i you he she we they me him her us them my your his our their not no yes there here what who where when why how which ' +
    'der die das den dem des ein eine einen einem einer und oder aber zu im in am an auf für mit von ist sind war waren hat haben es sie er wir ihr ' +
    'le la les un une des et ou de du à au en est sont el los las y o del es son'
  ).split(' ')
)

/** Wörter eines Textes in Kleinschreibung (ohne Richtext-Auszeichnung und Lückenklammern). */
export function woerterVon(s: string): string[] {
  return plainText(String(s ?? '').replace(/\[\[|\]\]/g, ' '))
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean)
}

/** Inhaltswörter: ohne Füllwörter und ohne einzelne Buchstaben. */
export const inhaltswoerter = (s: string): string[] => woerterVon(s).filter((w) => w.length > 1 && !FUELLWOERTER.has(w))

/** Steht die Wortfolge `teil` zusammenhängend in `text`? */
function enthaeltFolge(text: string[], teil: string[]): boolean {
  if (!teil.length || teil.length > text.length) return false
  outer: for (let i = 0; i + teil.length <= text.length; i++) {
    for (let j = 0; j < teil.length; j++) if (text[i + j] !== teil[j]) continue outer
    return true
  }
  return false
}

/** Erste Kette aus vier gleichen Wörtern (wie `wortgleicheStelle` in itemWording.ts) */
function viererKette(item: string[], text: string[]): string | null {
  if (item.length < 4 || text.length < 4) return null
  const imText = new Set<string>()
  for (let i = 0; i + 4 <= text.length; i++) imText.add(text.slice(i, i + 4).join(' '))
  for (let i = 0; i + 4 <= item.length; i++) {
    const k = item.slice(i, i + 4).join(' ')
    if (imText.has(k)) return k
  }
  return null
}

export interface OptionsBefund {
  /** Die Option steht als zusammenhängende Wortfolge im Text */
  woertlich: boolean
  /** Anteil ihrer Inhaltswörter, die im Text vorkommen (0–1); ohne Inhaltswörter 0 */
  anteil: number
}

/** Wie stark eine Antwortmöglichkeit den Text wiederholt. */
export function optionImText(option: string, text: string): OptionsBefund {
  const t = woerterVon(text)
  const o = woerterVon(option)
  const inhalt = inhaltswoerter(option)
  const menge = new Set(t)
  const anteil = inhalt.length ? inhalt.filter((w) => menge.has(w)).length / inhalt.length : 0
  // Ein einzelnes Füllwort („yes") ist kein Beleg für eine wörtliche Übernahme
  const woertlich = inhalt.length > 0 && enthaeltFolge(t, o)
  return { woertlich, anteil }
}

/** Ein Item zur Prüfung: Stamm, richtige Lösung(en), Distraktoren, ausgewiesene Stufe. */
export interface PruefItem {
  /** Bezeichnung für die Meldung, z. B. „Frage 2" */
  label: string
  stamm: string
  /** Auswahlformate: richtige Option(en); offene Formate: leer */
  richtig: string[]
  distraktoren: string[]
  stufe?: VerstehensStufe
  /** Richtig/Falsch-Aussage: true, wenn sie laut Lösung stimmt */
  wahreAussage?: boolean
}

/** Alle Items einer Aufgabe – Teilaufgaben, Aussagen, oder die Aufgabe selbst. */
export function pruefItems(block: TaskBlock): PruefItem[] {
  const aus = (answer: Answer, stamm: string, label: string, stufe: VerstehensStufe | undefined): PruefItem[] => {
    if (answer.kind === 'multipleChoice') {
      const richtig = answer.options.filter((_, i) => answer.correct.includes(i))
      const distraktoren = answer.options.filter((_, i) => !answer.correct.includes(i))
      return [{ label, stamm, richtig, distraktoren, stufe }]
    }
    if (answer.kind === 'trueFalse' && answer.statements.length) {
      return answer.statements.map((s, i) => ({
        label: `${label}, Aussage ${i + 1}`,
        stamm: s.text,
        richtig: [],
        distraktoren: [],
        stufe: istStufe(s.stufe) ? s.stufe : stufe,
        wahreAussage: s.isTrue
      }))
    }
    if (answer.kind === 'gapText' && answer.gapText.trim()) {
      return [{ label, stamm: `${stamm} ${answer.gapText}`, richtig: [], distraktoren: [], stufe }]
    }
    return [{ label, stamm, richtig: [], distraktoren: [], stufe }]
  }
  const eigene = istStufe(block.stufe) ? block.stufe : undefined
  if (block.parts.length) {
    return block.parts.flatMap((p, i) => aus(p.answer, p.instruction, `Frage ${i + 1}`, istStufe(p.stufe) ? p.stufe : eigene))
  }
  return aus(block.answer, block.instruction, 'Die Frage', eigene)
}

export interface StufenBefund {
  label: string
  stufe: VerstehensStufe
  meldung: string
}

const kurz = (s: string): string => {
  const t = plainText(s).trim()
  return t.length <= 48 ? t : `${t.slice(0, 45)}…`
}

/**
 * Passt die ausgewiesene Stufe zur Wortüberlappung mit dem Text?
 *
 * Nur die Merkmale, die sich lokal sicher prüfen lassen. Ob eine Stufe 4 wirklich zwei Stellen
 * verbindet oder Stufe 5 eine Haltung erschließt, entscheidet die KI bzw. die Lehrkraft.
 */
export function pruefeStufe(item: PruefItem, text: string): StufenBefund[] {
  const s = item.stufe
  if (!s || !text.trim()) return []
  const out: StufenBefund[] = []
  const name = `${item.label} (Stufe ${s}, ${STUFEN[s].name})`
  const melde = (meldung: string): void => void out.push({ label: item.label, stufe: s, meldung: `${name}: ${meldung}` })
  const t = woerterVon(text)
  const stammKette = viererKette(woerterVon(item.stamm), t)

  // Richtig/Falsch: Die Aussage ist Stamm UND Lösung zugleich
  if (item.wahreAussage !== undefined) {
    if (s >= 3 && stammKette)
      melde(`Die Aussage übernimmt den Wortlaut des Textes („${stammKette}"). Ab Stufe 3 ist sie paraphrasiert – so ist sie eher Stufe 1–2.`)
    if (s === 1 && item.wahreAussage && !stammKette)
      melde('Eine „sehr leichte" wahre Aussage ist fast gleichlautend mit dem Text – hier ist sie umformuliert. Eher Stufe 2–3.')
    return out
  }

  if (s >= 3 && stammKette)
    melde(`Die Frage übernimmt den Wortlaut des Textes („${stammKette}"). Ab Stufe 3 wird paraphrasiert – sonst wird über Wortgleichheit gelöst.`)

  if (!item.richtig.length) return out
  const richtig = item.richtig.map((o) => optionImText(o, text))
  const distr = item.distraktoren.map((o) => ({ o, ...optionImText(o, text) }))
  const richtigWoertlich = richtig.some((r) => r.woertlich)
  const richtigAnteil = Math.max(...richtig.map((r) => r.anteil))
  const distrMax = distr.length ? Math.max(...distr.map((d) => d.anteil)) : 0

  if (s === 1) {
    if (!richtigWoertlich) melde('Die richtige Antwort steht nicht wörtlich im Text. „Sehr leicht" heißt: 1:1 übernehmbar – so ist es eher Stufe 2–3.')
    const vorkommend = distr.find((d) => d.woertlich || d.anteil > 0)
    if (vorkommend) melde(`Die Antwortmöglichkeit „${kurz(vorkommend.o)}" enthält Wörter aus dem Text. Bei Stufe 1 kommen die Distraktoren im Text nicht vor.`)
  }
  if (s === 2) {
    if (richtigWoertlich) melde('Die richtige Antwort steht unverändert im Text – das ist Stufe 1. Für Stufe 2 leicht umformen (Wortform, Satzbau, Zahl als Ziffer).')
    const woertlich = distr.find((d) => d.woertlich)
    if (woertlich) melde(`Die Antwortmöglichkeit „${kurz(woertlich.o)}" steht wörtlich im Text. Bei Stufe 2 sind die Distraktoren nicht wörtlich im Text.`)
  }
  if (s >= 3) {
    if (richtigWoertlich) melde('Die richtige Antwort steht wörtlich im Text – so ist das Item Stufe 1. Ab Stufe 3 steht sie als Synonym oder Umschreibung da.')
    else if (s >= 5 && richtigAnteil >= 0.5)
      melde('Die richtige Antwort teilt viele Wörter mit dem Text. Bei Stufe 5 ergibt sie sich aus Ton oder Zusammenhang, nicht aus Wortgleichheit.')
  }
  if (s === 4 && distr.length && !richtigWoertlich && distrMax <= richtigAnteil)
    melde(
      'Merkmal von Stufe 4 fehlt: Kein Distraktor teilt mehr Wörter mit dem Text als die richtige Option. Das ist in Ordnung, wenn die Lösung aus zwei Stellen oder einer Korrektur folgt – sonst eher Stufe 3.'
    )
  return out
}

/**
 * Eine Stufe aus der Wortüberlappung SCHÄTZEN – nur als Gegenprobe für Auswahlformate.
 * Liefert 1 (richtige Option wörtlich, Distraktoren nicht im Text), 4 (Distraktoren mit mehr
 * Wortgleichheit) oder `null`, wenn sich lokal nichts sicher sagen lässt.
 */
export function schaetzeStufe(item: PruefItem, text: string): VerstehensStufe | null {
  if (!item.richtig.length || !text.trim()) return null
  const richtig = item.richtig.map((o) => optionImText(o, text))
  const distr = item.distraktoren.map((o) => optionImText(o, text))
  const richtigAnteil = Math.max(...richtig.map((r) => r.anteil))
  if (richtig.some((r) => r.woertlich) && distr.every((d) => d.anteil === 0 && !d.woertlich)) return 1
  if (distr.length && !richtig.some((r) => r.woertlich) && Math.max(...distr.map((d) => d.anteil)) > richtigAnteil) return 4
  return null
}

/** Befunde für eine ganze Aufgabe gegen ihren Bezugstext. */
export function pruefeAufgabeStufen(block: TaskBlock, text: string): StufenBefund[] {
  return pruefItems(block).flatMap((it) => pruefeStufe(it, text))
}
