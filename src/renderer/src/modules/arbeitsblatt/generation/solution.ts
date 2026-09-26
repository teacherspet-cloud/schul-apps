/**
 * „Lösung im Erwartungshorizont generieren" – nachträglich, je Aufgabe, im Lösungsblatt.
 *
 * Wunsch der Lehrkraft (26.09.2026): Auf der Lösungsseite fehlte im KI-Menü ein Weg, zu
 * einer fertigen Aufgabe eine Lösung erzeugen zu lassen. Bei Rechenkästchen soll die Lösung
 * „nach Möglichkeit in den Rechenkästchen erfolgen oder die Rechenkästchen im Lösungen-
 * Bildschirm so ersetzen, dass es aussehen würde, wie es bei den Schülern aussehen müsste".
 *
 * Deshalb liefert die KI ZWEI Dinge je Aufgabe bzw. Teilaufgabe:
 *  - den ERWARTUNGSHORIZONT (`solution`): Stichpunkte, woran die Lehrkraft eine vollständige
 *    Antwort erkennt – das rote Feld „Lösung:" am Ende der Aufgabe;
 *  - die MUSTERLÖSUNG in Schülerform (`modelAnswer`): der Text, wie er auf den Linien, in den
 *    Kästchen oder auf der freien Fläche stünde. Verlangt die Aufgabe eine Zeichnung
 *    (Zeitleiste, Diagramm, Koordinatensystem, Skizze), kommt dazu eine SVG-Skizze
 *    (`modelSketch`), die über den Kästchen liegt.
 *
 * Die Aufgabe selbst bleibt unverändert – die KI bekommt sie als unveränderliche Grundlage,
 * dazu das ganze Blatt (die Materialien M1, M2 …, auf die sich Aufgaben beziehen) und die
 * Materialien der Lehrkraft. Der vorige Stand bleibt als Fassung abrufbar (`addVersion`).
 */
import { arr, obj, str } from '../../../shared/aiSchema'
import { plainText } from '../../../shared/richtext/parse'
import type { Answer, Sheet, TaskBlock, Worksheet } from '../model/types'
import { describeSheet } from './describe'
import type { AiCall } from './generate'
import { materialText } from './prompts'
import { diagramDrawing } from '../render/diagramSvg'

const TEIL = obj({
  solution: str('Erwartungshorizont der Teilaufgabe: knappe Stichpunkte, was eine vollständige und richtige Antwort enthält'),
  model: str('Musterlösung in Schülerform – nur bei Schreiblinien, Rechenkästchen oder freier Fläche; sonst leer'),
  sketch: str('Nur wenn die Teilaufgabe eine Zeichnung verlangt: die Skizze als SVG; sonst leer')
})

const SCHEMA = obj({
  solution: str('Erwartungshorizont der ganzen Aufgabe: knappe Stichpunkte, woran die Lehrkraft eine vollständige Antwort erkennt'),
  model: str('Musterlösung in Schülerform – nur bei Schreiblinien, Rechenkästchen oder freier Fläche ohne Teilaufgaben; sonst leer'),
  sketch: str('Nur wenn die Aufgabe eine Zeichnung verlangt: die Skizze als SVG; sonst leer'),
  parts: arr(TEIL, 'Je Teilaufgabe ein Eintrag in derselben Reihenfolge; ohne Teilaufgaben leer')
})

interface KiLoesung {
  solution?: string
  model?: string
  sketch?: string
  parts?: { solution?: string; model?: string; sketch?: string }[]
}

/** Antwortformen, in die eine Musterlösung in Schülerform gehört. */
export const MUSTER_FORMEN: Answer['kind'][] = ['lines', 'grid', 'space', 'diagram']

/** Antwortformen, auf denen eine Skizze liegen kann. */
const SKIZZEN_FORMEN: Answer['kind'][] = ['grid', 'space', 'diagram']

/** Was die KI über den Antwortbereich wissen muss, um die Musterlösung passend zu bauen. */
function antwortBeschreibung(a: Answer): string {
  switch (a.kind) {
    case 'lines':
      return `Schreiblinien (${a.count} Zeilen): Musterlösung als ausformulierter Text, der etwa auf diese Zeilen passt.`
    case 'grid':
      return [
        `Rechenkästchen (${a.count} Kästchenzeilen à 5 mm, Breite etwa 170 mm): Musterlösung Zeile für Zeile, wie sie in die Kästchen geschrieben würde – Rechenweg mit Zwischenschritten, Ergebnis am Ende.`,
        `Verlangt die Aufgabe eine ZEICHNUNG (Zeitleiste, Diagramm, Koordinatensystem, Skizze), dann zusätzlich „sketch" als SVG mit viewBox="0 0 170 ${Math.max(1, a.count) * 5}" (Einheiten = Millimeter, 5 = ein Kästchen), nur mit line, polyline, rect, circle, text und path, Strichstärke 0.4 bis 0.6, Schriftgröße 3 bis 4, dunkle Farben, ohne Skript und ohne externe Verweise; alle Beschriftungen vollständig innerhalb der viewBox.`
      ].join(' ')
    case 'space':
      return `Freie Fläche (${a.heightMm} mm hoch): Musterlösung als Text; bei einer Zeichnung zusätzlich „sketch" als SVG mit viewBox="0 0 170 ${Math.max(5, a.heightMm)}" (Millimeter), nur line, polyline, rect, circle, text, path.`
    case 'diagram': {
      // Dieselbe Breite wie die Darstellung (Answers.tsx: diagramWidthMm) – Skizze und Fläche müssen deckungsgleich sein
      const d = diagramDrawing(a.diagram, 160)
      return [
        `Zeichenfläche mit Achsen (${a.diagram?.kind ?? 'koordinaten'}), ${d.widthMm} × ${d.heightMm} mm.`,
        `Abbildung der Werte auf Millimeter (y wächst nach UNTEN, Ursprung links oben): ${d.frame.hinweis}.`,
        `Musterlösung ZWINGEND als „sketch": SVG mit viewBox="0 0 ${d.widthMm} ${d.heightMm}" (Einheiten = Millimeter), nur line, polyline, circle, text, path; Strichstärke 0.5, Farbe #c62828, Schriftgröße 3; Punkte/Ereignisse als Kreise r=1.2 mit kurzer Beschriftung; Kurven als polyline durch die berechneten Millimeterkoordinaten. Dazu „model" als kurze Beschreibung der Eintragung (Werte, Verlauf).`
      ].join(' ')
    }
    case 'none':
      return 'Kein Antwortbereich (mündlich): nur der Erwartungshorizont, „model" leer.'
    default:
      return `Antwortform „${a.kind}": Die Lösung steckt bereits in der Aufgabe (Kreuze, Lücken, Zuordnung …) – nur der Erwartungshorizont, „model" leer.`
  }
}

/**
 * Entschärft eine SVG-Skizze aus der KI oder aus einer gespeicherten Datei.
 *
 * Skript, Ereignis-Attribute, externe Verweise und eingebettetes HTML fliegen heraus; übrig
 * bleibt reine Zeichnung. Liefert '' wenn kein <svg> darin steckt.
 */
export function bereinigeSkizze(svg: string | undefined): string {
  if (!svg) return ''
  const m = /<svg[\s\S]*?<\/svg>/i.exec(svg)
  if (!m) return ''
  return m[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<(?:iframe|object|embed|image|use)\b[^>]*\/?>/gi, '')
    .replace(/\s(?:on\w+|xlink:href|href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<svg\b/i, '<svg preserveAspectRatio="xMinYMin meet"')
}

const text = (v: unknown): string => String(v ?? '').trim()

export async function generateSolution(block: TaskBlock, sheet: Sheet, ws: Worksheet, ai: AiCall): Promise<TaskBlock> {
  const meta = ws.meta
  const mitTeilen = block.parts.length > 0
  const data = await ai<KiLoesung>({
    system: [
      `Du bist eine erfahrene Lehrkraft für das Fach ${meta.subjectLabel} und schreibst den Lösungsteil zu einer FERTIGEN Aufgabe eines Arbeitsblatts.`,
      'Die Aufgabe bleibt unverändert. Du lieferst nur den Erwartungshorizont und – wo die Lernenden frei schreiben oder rechnen – eine Musterlösung in Schülerform.',
      'Bezieht sich die Aufgabe auf Materialien (M1, M2 …), stützt sich die Lösung auf GENAU diese Materialien, so wie sie auf dem Blatt stehen.',
      'Der Erwartungshorizont steht in der Unterrichtssprache des Fachs. Die Musterlösung steht in der Sprache, in der die Lernenden antworten, und auf deren Niveau.'
    ].join('\n'),
    user: [
      `Gesamtes Arbeitsblatt (Zusammenhang, Materialien):\n${describeSheet(sheet)}`,
      [
        'Die Aufgabe, zu der die Lösung gehört:',
        `Arbeitsanweisung: ${plainText(block.instruction)}`,
        block.operator ? `Operator: ${block.operator}` : '',
        block.afb ? `Anforderungsbereich: ${block.afb}` : ''
      ]
        .filter(Boolean)
        .join('\n'),
      mitTeilen
        ? [
            'Teilaufgaben (in dieser Reihenfolge, je ein Eintrag in „parts"):',
            ...block.parts.map((p, i) => `${String.fromCharCode(97 + i)}) ${plainText(p.instruction)}\n   Antwortbereich: ${antwortBeschreibung(p.answer)}`)
          ].join('\n')
        : `Antwortbereich: ${antwortBeschreibung(block.answer)}`,
      [
        'Verbindlich:',
        '- „solution": Erwartungshorizont als knappe Stichpunkte (je Zeile ein Punkt, mit „- " beginnend), fachlich richtig und vollständig, ohne Einleitung.',
        '- „model": nur bei Schreiblinien, Rechenkästchen oder freier Fläche. Genau das, was eine gute Schülerin an dieser Stelle schreiben würde – fertig ausformuliert bzw. ausgerechnet, ohne Kommentar an die Lehrkraft. Absätze durch Leerzeile trennen.',
        '- „sketch": nur bei Zeichenaufgaben, sonst leer.',
        mitTeilen
          ? '- Auf Aufgabenebene bleibt „model" leer; die Musterlösungen stehen bei den Teilaufgaben. „solution" auf Aufgabenebene nennt nur, was übergreifend gilt (darf leer sein).'
          : '- „parts" bleibt leer.',
        '- Ändere nichts an der Aufgabe.'
      ].join('\n'),
      materialText(ws.sources)
    ]
      .filter(Boolean)
      .join('\n\n'),
    schemaName: 'task_solution',
    schema: SCHEMA
  })

  const parts = block.parts.map((p, i) => {
    const t = data.parts?.[i]
    const model = MUSTER_FORMEN.includes(p.answer.kind) ? text(t?.model) : ''
    const sketch = SKIZZEN_FORMEN.includes(p.answer.kind) ? bereinigeSkizze(t?.sketch) : ''
    return {
      ...p,
      solution: text(t?.solution) || p.solution,
      ...(model ? { modelAnswer: model } : {}),
      ...(sketch ? { modelSketch: sketch } : {})
    }
  })
  const model = !mitTeilen && MUSTER_FORMEN.includes(block.answer.kind) ? text(data.model) : ''
  const sketch = !mitTeilen && SKIZZEN_FORMEN.includes(block.answer.kind) ? bereinigeSkizze(data.sketch) : ''
  const solution = text(data.solution)
  const etwas = solution || model || sketch || parts.some((p, i) => p.solution !== block.parts[i].solution || p.modelAnswer || p.modelSketch)
  if (!etwas) throw new Error('Die KI hat keine Lösung geliefert.')

  return {
    ...block,
    parts,
    solution: solution || block.solution,
    ...(model ? { modelAnswer: model } : {}),
    ...(sketch ? { modelSketch: sketch } : {})
  }
}
