/**
 * „Weitere Fragen im gleichen Format" zu einer vorhandenen Verstehensaufgabe (29.09.2026).
 *
 * Entscheidung der Lehrkraft: Beim Hörverstehen zieht die Lehrkraft die Original-Hördatei und
 * das Transkript hinein. Im Unterricht läuft das Original; die KI nutzt NUR das Transkript, um
 * die vorhandenen Aufgaben um weitere Fragen im GLEICHEN Frageformat zu ergänzen. Anzahl und
 * Stufenmix wählt die Lehrkraft (Vorschlag je Jahrgang/GER, „sehr leicht" gedeckelt).
 *
 * Dasselbe gilt fürs Leseverstehen (Bezug = Lesetext) – das Raster gilt für Hören, Lesen und
 * Hör-Seh-Verstehen gleichermaßen.
 *
 * Eingefügt wird an der Stelle, die die KI aus dem Transkript ableitet (`position`); die
 * Nummerierung (a, b, c …) läuft danach von selbst neu. Jedes neue Item bekommt seine Stufe;
 * die App prüft sie anschließend an der Wortüberlappung (shared/verstehen/pruefung.ts) und
 * hängt Abweichungen als Hinweis an die Aufgabe.
 */
import type { StructuredRequest } from '@shared/types'
import { arr, bool, int, obj, str } from '../../../shared/aiSchema'
import { describeBlock } from '../../arbeitsblatt/generation/describe'
import { emptyAnswer } from '../../arbeitsblatt/model/factory'
import type { Answer, TaskBlock, TaskPart, WsBlock } from '../../arbeitsblatt/model/types'
import { newId } from '../../vokabeltest/model/random'
import { pruefeStufe, type PruefItem } from '../../../shared/verstehen/pruefung'
import { zusatzfragenRegeln } from '../../../shared/verstehen/regeln'
import { istStufe, stufeAus, type VerstehensStufe } from '../../../shared/verstehen/stufen'

/** Der Text, auf den sich eine Aufgabe bezieht */
export interface Bezug {
  art: 'audio' | 'text'
  id: string
  titel: string
  text: string
  /** Stammt der Text aus fremdem Material (Verlag, Original)? Dann vorher der Rechtshinweis. */
  fremd: boolean
}

/**
 * Bezugstext einer Aufgabe in ihrer Bausteinliste: der verknüpfte Hörtext (audioId), sonst der
 * letzte Hörtext bzw. Lesetext VOR der Aufgabe.
 */
export function bezugFuer(bloecke: WsBlock[], aufgabeId: string): Bezug | null {
  const i = bloecke.findIndex((b) => b.id === aufgabeId)
  if (i < 0) return null
  const aufgabe = bloecke[i]
  if (aufgabe.type !== 'task') return null
  const alsBezug = (b: WsBlock): Bezug | null => {
    if (b.type === 'audio' && b.transcript.trim())
      return { art: 'audio', id: b.id, titel: b.title, text: b.transcript, fremd: b.origin === 'archiv' }
    if (b.type === 'text' && b.body.trim())
      return { art: 'text', id: b.id, titel: b.title, text: b.body, fremd: Boolean(b.source?.trim() || b.sourceHeader) }
    return null
  }
  if (aufgabe.audioId) {
    const a = bloecke.find((b) => b.id === aufgabe.audioId)
    if (a) return alsBezug(a)
  }
  for (let k = i - 1; k >= 0; k--) {
    const b = alsBezug(bloecke[k])
    if (b) return b
  }
  // In der Klausur steht das Material oft NACH den Aufgaben
  for (let k = i + 1; k < bloecke.length; k++) {
    const b = alsBezug(bloecke[k])
    if (b) return b
  }
  return null
}

/** Vorhandene Items (Stämme) einer Aufgabe mit ihrer Stufe – für Auftrag und Deckel */
export function vorhandeneItems(block: TaskBlock): { stamm: string; stufe?: VerstehensStufe }[] {
  const eigene = istStufe(block.stufe) ? block.stufe : undefined
  if (block.parts.length) return block.parts.map((p) => ({ stamm: p.instruction, stufe: istStufe(p.stufe) ? p.stufe : eigene }))
  const a = block.answer
  if (a.kind === 'trueFalse') return a.statements.map((s) => ({ stamm: s.text, stufe: istStufe(s.stufe) ? s.stufe : eigene }))
  if (a.kind === 'matching') return a.left.map((l) => ({ stamm: l, stufe: eigene }))
  if (a.kind === 'gapText')
    return a.gapText
      .split('\n')
      .filter((z) => z.trim())
      .map((z) => ({ stamm: z, stufe: eigene }))
  if (a.kind === 'tableFill') return a.rows.map((r) => ({ stamm: r.join(' | '), stufe: eigene }))
  return [{ stamm: block.instruction, stufe: eigene }]
}

/** Welche Antwortform die neuen Items bekommen (die der vorhandenen) */
export function formatDer(block: TaskBlock): Answer['kind'] {
  return block.parts.length ? block.parts[0].answer.kind : block.answer.kind
}

const NEUE_ITEMS = obj({
  items: arr(
    obj({
      position: int('Einfügen NACH diesem vorhandenen Item (0 = vor dem ersten, n = nach Item n) – so, dass die Reihenfolge dem Text folgt'),
      stamm: str('Frage bzw. Aussage; bei Lückentext der Satz mit [[Lösung]]'),
      optionen: arr(str(), 'multipleChoice: Antwortmöglichkeiten (so viele wie bei den vorhandenen Items), sonst leer'),
      richtig: int('multipleChoice: Index der richtigen Option, sonst -1'),
      wahr: bool('trueFalse: stimmt die Aussage laut Text?'),
      links: str('matching: neuer Eintrag links, sonst leer'),
      rechts: str('matching: passender neuer Eintrag rechts, sonst leer'),
      zeile: arr(str(), 'tableFill: neue Zeile – Vorgaben ausgefüllt, auszufüllende Zellen leer; sonst leer'),
      zeilenLoesung: arr(str(), 'tableFill: Lösungen derselben Zeile, sonst leer'),
      loesung: str('Lösung bzw. Erwartungshorizont mit zulässigen Varianten'),
      stufe: int('Schwierigkeitsstufe 1–5'),
      stufeGrund: str('Begründung der Stufe, z. B. „Option wörtlich im Text" oder „Synonym cheap ↔ expensive"'),
      textstelle: str('Die Stelle im Transkript bzw. Text, auf die sich das Item bezieht (wörtlich, kurz)')
    })
  )
})

export interface NeuesItem {
  position: number
  stamm: string
  optionen: string[]
  richtig: number
  wahr: boolean
  links: string
  rechts: string
  zeile: string[]
  zeilenLoesung: string[]
  loesung: string
  stufe?: VerstehensStufe
  stufeGrund: string
  textstelle: string
}

export interface ZusatzAuftrag {
  aufgabe: TaskBlock
  bezug: Bezug
  /** Anzahl je Stufe [1..5] */
  mix: number[]
  trueFalseErlaubt: boolean
  fach: string
  niveau?: string
  klasse?: number
}

export function zusatzfragenAnfrage(z: ZusatzAuftrag): StructuredRequest {
  const vorhanden = vorhandeneItems(z.aufgabe)
  return {
    system:
      'Du bist eine erfahrene Fremdsprachenlehrkraft und schreibst Verstehensitems für eine Klassenarbeit nach den Regeln der Testkonstruktion. Du schreibst NUR neue Items; Vorhandenes änderst du nicht.',
    user: [
      `Fach: ${z.fach}${z.klasse ? `, Klasse ${z.klasse}` : ''}${z.niveau ? `, Niveau ${z.niveau}` : ''}.`,
      `Ergänze die vorhandene ${z.bezug.art === 'audio' ? 'Hörverstehens' : 'Leseverstehens'}aufgabe um weitere Items im GLEICHEN Format (Antwortform: ${formatDer(z.aufgabe)}).`,
      z.bezug.art === 'audio'
        ? 'Das Transkript dient nur dir: Die Lernenden hören die Originalaufnahme und sehen das Transkript nicht.'
        : 'Die Lernenden lesen den Text; die Items beziehen sich ausschließlich darauf.',
      '',
      zusatzfragenRegeln(z.mix, z.trueFalseErlaubt),
      '',
      'VORHANDENE AUFGABE:',
      describeBlock(z.aufgabe),
      '',
      'VORHANDENE ITEMS (Nummer: Stamm, Stufe):',
      ...vorhanden.map((v, i) => `${i + 1}: ${v.stamm}${v.stufe ? ` (Stufe ${v.stufe})` : ''}`),
      '',
      z.bezug.art === 'audio' ? '--- TRANSKRIPT ---' : '--- TEXT ---',
      z.bezug.text.slice(0, 12000),
      '--- ENDE ---'
    ].join('\n'),
    schemaName: 'zusatzfragen',
    schema: NEUE_ITEMS
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function neueItemsAus(daten: unknown): NeuesItem[] {
  const liste = Array.isArray((daten as any)?.items) ? (daten as any).items : []
  const t = (v: any): string => (typeof v === 'string' ? v.trim() : '')
  const out = liste
    .map((it: any): NeuesItem => {
      const stufe = stufeAus(it?.stufe)
      return {
        position: Math.max(0, Math.round(Number(it?.position) || 0)),
        stamm: t(it?.stamm),
        optionen: Array.isArray(it?.optionen) ? it.optionen.map(t).filter(Boolean) : [],
        richtig: Number.isInteger(Number(it?.richtig)) ? Number(it.richtig) : -1,
        wahr: Boolean(it?.wahr),
        links: t(it?.links),
        rechts: t(it?.rechts),
        zeile: Array.isArray(it?.zeile) ? it.zeile.map(t) : [],
        zeilenLoesung: Array.isArray(it?.zeilenLoesung) ? it.zeilenLoesung.map(t) : [],
        loesung: t(it?.loesung),
        ...(stufe ? { stufe } : {}),
        stufeGrund: t(it?.stufeGrund),
        textstelle: t(it?.textstelle)
      }
    })
    .filter((it: NeuesItem) => it.stamm || it.links || it.zeile.length)
  if (!out.length) throw new Error('Die KI hat keine neuen Items geliefert.')
  return out
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const grund = (it: NeuesItem): string => [it.stufeGrund, it.textstelle ? `Textstelle: „${it.textstelle}"` : ''].filter(Boolean).join(' – ')

/** Antwort eines neuen Items nach dem Vorbild einer vorhandenen Teilaufgabe */
function antwortWie(vorbild: Answer, it: NeuesItem): Answer {
  const a = { ...emptyAnswer(vorbild.kind), count: vorbild.count, heightMm: vorbild.heightMm }
  if (vorbild.kind === 'multipleChoice') {
    a.options = it.optionen
    a.correct = it.richtig >= 0 && it.richtig < it.optionen.length ? [it.richtig] : []
  } else if (vorbild.kind === 'trueFalse') {
    a.statements = [{ text: it.stamm, isTrue: it.wahr, ...(it.stufe ? { stufe: it.stufe } : {}) }]
  } else if (vorbild.kind === 'gapText') {
    a.gapText = it.stamm
  }
  return a
}

/** Prüf-Item der App zu einem neuen Item (für die Stufenprüfung) */
function pruefItemVon(it: NeuesItem, art: Answer['kind'], label: string): PruefItem {
  if (art === 'multipleChoice' && it.richtig >= 0)
    return { label, stamm: it.stamm, richtig: [it.optionen[it.richtig] ?? ''], distraktoren: it.optionen.filter((_, i) => i !== it.richtig), stufe: it.stufe }
  if (art === 'trueFalse') return { label, stamm: it.stamm, richtig: [], distraktoren: [], stufe: it.stufe, wahreAussage: it.wahr }
  return { label, stamm: it.stamm, richtig: [], distraktoren: [], stufe: it.stufe }
}

/**
 * Die neuen Items in die Bausteinliste einfügen – im Format der Aufgabe.
 *
 * Teilaufgaben: neue Teilaufgabe an der Stelle `position`. Ohne Teilaufgaben: neue Aussage
 * (Richtig/Falsch), neue Zeile (Lückentext, Tabelle) oder neues Paar (Zuordnung, rechts an
 * einer zufälligen Stelle, damit die Lösung nicht am Ende steht). Alles andere bekommt eine
 * eigene Aufgabe gleichen Formats direkt dahinter.
 *
 * Punkte: Hat die Aufgabe Punkte, kommt je Item ein Punkt dazu (ein Item = ein Punkt, wie bei
 * rezeptiven Teilen üblich). Liefert die Hinweise der Stufenprüfung.
 */
export function fuegeEin(bloecke: WsBlock[], aufgabeId: string, items: NeuesItem[], bezugText: string, zufall: () => number = Math.random): string[] {
  const i = bloecke.findIndex((b) => b.id === aufgabeId)
  const block = bloecke[i]
  if (!block || block.type !== 'task') throw new Error('Die Aufgabe ist nicht mehr da.')
  const art = formatDer(block)
  const hinweise: string[] = []
  // Von hinten nach vorn einfügen, damit die Positionen der früheren gültig bleiben
  const sortiert = [...items].sort((x, y) => y.position - x.position)
  const geschwister: TaskBlock[] = []

  for (const it of sortiert) {
    if (block.parts.length) {
      const vorbild = block.parts[0].answer
      const teil: TaskPart = {
        id: newId(),
        instruction: vorbild.kind === 'gapText' || vorbild.kind === 'trueFalse' ? '' : it.stamm,
        answer: antwortWie(vorbild, it),
        solution: it.loesung,
        ...(it.stufe ? { stufe: it.stufe } : {}),
        ...(grund(it) ? { stufeGrund: grund(it) } : {})
      }
      block.parts.splice(Math.min(it.position, block.parts.length), 0, teil)
    } else if (art === 'trueFalse') {
      block.answer.statements.splice(Math.min(it.position, block.answer.statements.length), 0, {
        text: it.stamm,
        isTrue: it.wahr,
        ...(it.stufe ? { stufe: it.stufe } : {})
      })
    } else if (art === 'gapText') {
      const zeilen = block.answer.gapText.split('\n')
      zeilen.splice(Math.min(it.position, zeilen.length), 0, it.stamm)
      block.answer.gapText = zeilen.join('\n')
    } else if (art === 'tableFill' && it.zeile.length) {
      const pos = Math.min(it.position, block.answer.rows.length)
      block.answer.rows.splice(pos, 0, it.zeile)
      block.answer.solutionRows.splice(pos, 0, it.zeilenLoesung)
    } else if (art === 'matching' && it.links && it.rechts) {
      const a = block.answer
      const ziel = Math.floor(zufall() * (a.right.length + 1))
      a.right.splice(ziel, 0, it.rechts)
      a.pairs = a.pairs.map((p) => (p >= ziel ? p + 1 : p))
      const pos = Math.min(it.position, a.left.length)
      a.left.splice(pos, 0, it.links)
      a.pairs.splice(pos, 0, ziel)
    } else {
      geschwister.unshift({
        ...structuredClone(block),
        id: newId(),
        instruction: it.stamm || block.instruction,
        answer: antwortWie(block.answer, it),
        parts: [],
        solution: it.loesung,
        points: block.points > 0 ? 1 : 0,
        warnings: [],
        versions: undefined,
        versionIndex: undefined,
        ...(it.stufe ? { stufe: it.stufe } : {}),
        ...(grund(it) ? { stufeGrund: grund(it) } : {})
      } as TaskBlock)
      continue
    }
    if (block.points > 0) block.points += 1
  }

  // Formate ohne eigenes Stufenfeld je Item: die Stufen in der Begründung der Aufgabe festhalten
  if (!block.parts.length && ['gapText', 'tableFill', 'matching'].includes(art)) {
    const zeilen = items.filter((it) => it.stufe).map((it) => `„${it.stamm || it.links}": Stufe ${it.stufe}${it.stufeGrund ? ` (${it.stufeGrund})` : ''}`)
    if (zeilen.length) block.stufeGrund = [block.stufeGrund, `Ergänzt: ${zeilen.join('; ')}`].filter(Boolean).join(' · ')
  }

  // App-Prüfung der Stufe an der Wortüberlappung
  items.forEach((it, k) => {
    for (const b of pruefeStufe(pruefItemVon(it, art, `Neues Item ${k + 1}`), bezugText)) hinweise.push(b.meldung)
  })
  if (hinweise.length) block.warnings = [...(block.warnings ?? []), ...hinweise]
  if (geschwister.length) bloecke.splice(i + 1, 0, ...geschwister)
  return hinweise
}
