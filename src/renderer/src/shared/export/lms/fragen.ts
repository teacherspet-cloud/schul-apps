/**
 * Export in Lernplattformen (Großprogramm 0.4, F5): Aufgaben der App → neutrale Fragen →
 * Moodle-XML, GIFT (Moodle/ILIAS-Import) und H5P.
 *
 * Nicht jede Aufgabe lässt sich abbilden. Was übersprungen wird, steht mit Grund im Bericht –
 * die Lehrkraft soll nicht erst im Kurs merken, dass Aufgaben fehlen.
 */
import type { Answer, TaskBlock, Worksheet, WsBlock } from '../../../modules/arbeitsblatt/model/types'
import type { VocabEntry } from '../../../modules/vokabeltest/model/types'

export type LmsFrage =
  | { art: 'mc'; titel: string; frage: string; optionen: { text: string; richtig: boolean }[] }
  | { art: 'wf'; titel: string; frage: string; richtig: boolean }
  | { art: 'zuordnung'; titel: string; frage: string; paare: { links: string; rechts: string }[] }
  | { art: 'lueckentext'; titel: string; frage: string; teile: ({ text: string } | { luecke: string[] })[] }
  | { art: 'kurz'; titel: string; frage: string; antworten: string[] }
  | { art: 'freitext'; titel: string; frage: string; hinweis?: string }

export interface LmsBericht {
  fragen: LmsFrage[]
  uebersprungen: { titel: string; grund: string }[]
}

/** Formatierung der App (**fett**, $Formel$) in schlichten Text */
export const schlicht = (s: string): string =>
  String(s ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

const GRUENDE: Partial<Record<Answer['kind'], string>> = {
  ordering: 'Reihenfolge-Aufgaben kennt Moodle nur mit einem Zusatz-Plugin',
  tableFill: 'Tabellen zum Ausfüllen lassen sich nicht als Plattform-Frage abbilden',
  labels: 'Bildbeschriftungen brauchen das Bild – bitte im Kurs als „Drag and drop onto image" anlegen',
  grid: 'Rechen- oder Zeichenflächen gibt es auf der Plattform nicht',
  diagram: 'Diagramme zum Zeichnen gibt es auf der Plattform nicht'
}

/** Lückentext „Der [[Hund]] bellt." → Teile */
export function lueckenTeile(gapText: string): ({ text: string } | { luecke: string[] })[] {
  const teile: ({ text: string } | { luecke: string[] })[] = []
  let rest = gapText
  const re = /\[\[(.+?)\]\]/
  for (let m = re.exec(rest); m; m = re.exec(rest)) {
    if (m.index) teile.push({ text: rest.slice(0, m.index) })
    teile.push({
      luecke: m[1]
        .split('|')
        .map((x) => x.trim())
        .filter(Boolean)
    })
    rest = rest.slice(m.index + m[0].length)
  }
  if (rest) teile.push({ text: rest })
  return teile
}

function ausAntwort(titel: string, frage: string, a: Answer, loesung: string): { fragen: LmsFrage[]; grund?: string } {
  switch (a.kind) {
    case 'multipleChoice':
      if (!a.options.length || !a.correct.length) return { fragen: [], grund: 'Auswahlaufgabe ohne markierte richtige Antwort' }
      return { fragen: [{ art: 'mc', titel, frage, optionen: a.options.map((o, i) => ({ text: schlicht(o), richtig: a.correct.includes(i) })) }] }
    case 'trueFalse':
      if (!a.statements.length) return { fragen: [], grund: 'Richtig/Falsch ohne Aussagen' }
      return {
        fragen: a.statements.map((s, i) => ({ art: 'wf' as const, titel: `${titel} (${i + 1})`, frage: `${frage} – ${schlicht(s.text)}`, richtig: s.isTrue }))
      }
    case 'matching': {
      const paare = a.left.map((l, i) => ({ links: schlicht(l), rechts: schlicht(a.right[a.pairs[i]] ?? '') })).filter((p) => p.links && p.rechts)
      if (paare.length < 2) return { fragen: [], grund: 'Zuordnung mit weniger als zwei vollständigen Paaren' }
      return { fragen: [{ art: 'zuordnung', titel, frage, paare }] }
    }
    case 'gapText': {
      const teile = lueckenTeile(a.gapText)
      if (!teile.some((t) => 'luecke' in t)) return { fragen: [], grund: 'Lückentext ohne markierte Lücken' }
      return { fragen: [{ art: 'lueckentext', titel, frage, teile }] }
    }
    case 'lines':
    case 'space':
    case 'none':
      return { fragen: [{ art: 'freitext', titel, frage, ...(loesung.trim() ? { hinweis: schlicht(loesung) } : {}) }] }
    default:
      return { fragen: [], grund: GRUENDE[a.kind] ?? `Antwortform „${a.kind}" wird nicht unterstützt` }
  }
}

/** Alle Aufgaben eines Blattes (auch Klassenarbeit, Lernzielkontrolle, Grammatiktest nach der Umwandlung) */
export function fragenAusBlatt(ws: Worksheet): LmsBericht {
  const fragen: LmsFrage[] = []
  const uebersprungen: { titel: string; grund: string }[] = []
  let nr = 0
  const bloecke: WsBlock[] = ws.sheets.flatMap((s) => s.blocks)
  for (const b of bloecke) {
    if (b.type !== 'task') continue
    const t = b as TaskBlock
    nr++
    const titel = `Aufgabe ${nr}`
    const anweisung = schlicht(t.instruction)
    if (t.parts?.length) {
      t.parts.forEach((p, i) => {
        const r = ausAntwort(`${titel}${String.fromCharCode(97 + i)}`, `${anweisung} ${schlicht(p.instruction)}`.trim(), p.answer, p.solution ?? '')
        fragen.push(...r.fragen)
        if (r.grund) uebersprungen.push({ titel: `${titel}${String.fromCharCode(97 + i)}`, grund: r.grund })
      })
      continue
    }
    const r = ausAntwort(titel, anweisung, t.answer, t.solution ?? '')
    fragen.push(...r.fragen)
    if (r.grund) uebersprungen.push({ titel, grund: r.grund })
  }
  return { fragen, uebersprungen }
}

/** Vokabeltest: je Vokabel eine Kurzantwort (Übersetzung → Wort in der Zielsprache) */
export function fragenAusVokabeln(vokabeln: VocabEntry[], sprache: string): LmsBericht {
  const fragen: LmsFrage[] = vokabeln
    .filter((v) => v.include !== false && v.term.trim() && v.translation.trim())
    .map((v, i) => ({
      art: 'kurz' as const,
      titel: `Vokabel ${i + 1}`,
      frage: `${sprache}: ${schlicht(v.translation)}`,
      antworten: v.term
        .split(/[;/]/)
        .map((x) => schlicht(x))
        .filter(Boolean)
    }))
  return { fragen, uebersprungen: [] }
}
