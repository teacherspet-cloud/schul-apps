/**
 * Falsch gebildete Operatorformen auf Blättern finden und mit einem Klick korrigieren
 * (01.10.2026, Fehlerbericht „Zusammenfassen Sie anhand von M1 …").
 *
 * Gilt für alle Programme mit Bausteinen (Arbeitsblatt, Lernzielkontrolle, Klassenarbeit,
 * Grammatiktest). Geprüft werden die Texte, die die Lernenden anweisen: Arbeitsanweisung,
 * Teilaufgaben und Situation einer Aufgabe. Der Satzbau selbst steht in
 * `@shared/operatoren/satzbau` – hier nur das Anwenden auf Bausteine.
 *
 * Die Korrektur ändert nur die Stellung („Zusammenfassen Sie … " → „Fassen Sie … zusammen"),
 * nie den Inhalt; deshalb läuft sie auch automatisch über jede KI-Ausgabe (convertBlock).
 */
import { korrigiereOperatorformen, operatorFormfehler, formfehlerMeldung } from '@shared/operatoren/satzbau'
import type { Sheet, WsBlock } from '../modules/arbeitsblatt/model/types'

export interface OperatorformBefund {
  blattId: string
  blockId: string
  /** „Aufgabe 2 b)" – mit Fassungsname, wenn es mehrere Blätter gibt */
  ort: string
  falsch: string
  richtig: string
  meldung: string
}

/** Die anweisenden Texte einer Aufgabe mit Ort */
function anweisungen(b: WsBlock, nummer: number): { ort: string; text: string }[] {
  if (b.type !== 'task') return []
  const a = `Aufgabe ${nummer}`
  return [
    { ort: a, text: b.instruction },
    ...b.parts.map((p, i) => ({ ort: `${a} ${String.fromCharCode(97 + i)})`, text: p.instruction })),
    ...(b.brief?.situation ? [{ ort: `${a} (Situation)`, text: b.brief.situation }] : [])
  ]
}

/** Alle falschen Formen auf den Blättern – leer, wenn die Anweisungen nicht deutsch sind */
export function operatorformBefunde(sheets: Sheet[], deutsch = true): OperatorformBefund[] {
  if (!deutsch) return []
  const out: OperatorformBefund[] = []
  for (const s of sheets) {
    let nummer = 0
    for (const b of s.blocks) {
      if (b.type !== 'task') continue
      nummer++
      for (const { ort, text } of anweisungen(b, nummer))
        for (const f of operatorFormfehler(text)) {
          const o = sheets.length > 1 && s.label ? `${s.label}, ${ort}` : ort
          out.push({ blattId: s.id, blockId: b.id, ort: o, falsch: f.falsch, richtig: f.richtig, meldung: formfehlerMeldung(o, f) })
        }
    }
  }
  return out
}

const korr = (t: string): string => korrigiereOperatorformen(t).text

/** Ein Baustein mit korrigierten Formen (neues Objekt, nur wenn sich etwas ändert) */
export function korrigiereBaustein<B extends WsBlock | null>(b: B): B {
  if (!b || b.type !== 'task') return b
  const instruction = korr(b.instruction)
  const parts = b.parts.map((p) => {
    const i = korr(p.instruction)
    return i === p.instruction ? p : { ...p, instruction: i }
  })
  const situation = b.brief?.situation ? korr(b.brief.situation) : undefined
  const geaendert = instruction !== b.instruction || parts.some((p, i) => p !== b.parts[i]) || (b.brief && situation !== b.brief.situation)
  if (!geaendert) return b
  return { ...b, instruction, parts, ...(b.brief ? { brief: { ...b.brief, situation: situation ?? b.brief.situation } } : {}) } as B
}

/**
 * „Vorschlag der App umsetzen": alle Formen in den Bausteinen korrigieren – an Ort und Stelle
 * (im Entwurf des Stores, damit es EIN Rückgängig-Schritt ist). Liefert die Zahl der Stellen.
 */
export function operatorformenUmsetzen(blocks: WsBlock[]): number {
  let n = 0
  for (const b of blocks) {
    if (b.type !== 'task') continue
    const setze = (t: string, fn: (neu: string) => void): void => {
      const r = korrigiereOperatorformen(t)
      if (!r.fehler.length || r.text === t) return
      n += r.fehler.length
      fn(r.text)
    }
    setze(b.instruction, (t) => (b.instruction = t))
    for (const p of b.parts) setze(p.instruction, (t) => (p.instruction = t))
    if (b.brief?.situation) setze(b.brief.situation, (t) => (b.brief!.situation = t))
  }
  return n
}
