/**
 * Zeitleisten zeichnet die App selbst (27.09.2026).
 *
 * Gemeldet von der Lehrkraft zum Blatt „Julikrise 1914": Statt einer Zeitleiste stand auf dem
 * Blatt der Platzhalter „Bild wählen: Breite Zeitachse vom 28. Juni bis 4. August 1914 …" mit
 * dem Hinweis, für Diagramme werde kein KI-Bild erzeugt. Das war die Folge der Regel vom
 * selben Tag: Ein von der Bild-KI gezeichnetes Zeitstrahl-Bild trug erfundene, im Druck
 * unlesbare Ereigniskarten, also zählte die Zeitleiste fortan als „echtes Material" – das im
 * Archiv niemand findet.
 *
 * Eine Zeitleiste braucht aber kein Bild aus dem Archiv: Ihre Beschreibung enthält bereits die
 * Daten (Zeitraum, Stufen, Ereignisse). Die Text-KI bringt sie in die Form, die die
 * Zeichenfläche „Zeitleiste" der Antwortformen ohnehin versteht (model/diagram.ts,
 * render/diagramSvg.ts) – und die App zeichnet sie maßhaltig, mit Schrift in Druckgröße,
 * als Baustein „grid" mit `diagram`. Drei Wege führen hierher:
 * - die KI legt die Zeitleiste gleich so an (Prompt, convert.ts `grid` mit variant „zeitleiste");
 * - ein Bild-Baustein, dessen Beschreibung eine Zeitleiste ist, wird beim Fertigstellen umgewandelt
 *   (worksheetImages.ts, statt eines Platzhalters);
 * - die Lehrkraft lässt einen vorhandenen Platzhalter über das KI-Menü zeichnen (EditorStep).
 */
import { arr, enumOf, int, obj, str } from '../../../shared/aiSchema'
import type { AiCall } from '../../../shared/imageChoice'
import { sanitizeDiagram } from '../model/diagram'
import { defaultAxes, gridDefaults } from '../model/grid'
import type { GridBlock, ImageBlock, TimelineSpec, WorksheetMeta } from '../model/types'
import { TIMELINE_UNIT_IDS } from './schemas'

/** Beschreibungen, die eine Zeitleiste meinen – die zeichnet die App selbst */
export function istZeitleiste(b: Pick<ImageBlock, 'description' | 'caption'>): boolean {
  return /zeitleiste|zeitachse|zeitstrahl|chronologie|ereignisfolge/i.test(`${b.caption} ${b.description}`)
}

/** Dieselbe Struktur wie `timeline` in der Zeichenfläche (schemas.ts DIAGRAM) */
export const TIMELINE_SCHEMA = obj({
  unit: enumOf(TIMELINE_UNIT_IDS),
  from: str('Anfang der Achse: „1914-06-28", „1914-07", „1914" oder „-500" (v. Chr.)'),
  to: str('Ende der Achse'),
  step: int('Marke alle … Einheiten (so, dass 6–12 Marken entstehen)'),
  sections: arr(
    obj({ from: str(), to: str(), unit: enumOf(TIMELINE_UNIT_IDS), step: int() }),
    'Abschnitte mit eigener Skala nur bei sehr langen Zeiträumen, sonst leer'
  ),
  yLabel: str('Beschriftung der Stufen-Achse, z. B. „Eskalation" – leer, wenn keine Stufen'),
  yLevels: arr(str(), 'Stufen von unten nach oben (höchstens 5), sonst leer'),
  strands: arr(str(), 'Parallele Stränge (Länder, Akteure) nur, wenn die Beschreibung sie verlangt, sonst leer'),
  events: arr(
    obj({ date: str('„1914-07-28"'), text: str('höchstens 5 Wörter'), strand: int('0-basiert, sonst 0'), level: int('Stufe 0-basiert, -1 = keine') }),
    'alle Ereignisse der Beschreibung'
  )
})

/**
 * Aus der Bildbeschreibung eine Zeitleiste als Daten – gezeichnet wird sie von der App.
 * Liefert null, wenn die KI keine brauchbare Zeitleiste liefert (dann bleibt der Platzhalter).
 */
export async function zeitleisteAusBeschreibung(
  bild: Pick<ImageBlock, 'id' | 'description' | 'caption' | 'ref' | 'stars'>,
  meta: Pick<WorksheetMeta, 'subjectLabel' | 'grade' | 'topic'>,
  ai: AiCall
): Promise<GridBlock | null> {
  const data = await ai<{ timeline: Partial<TimelineSpec> }>({
    system: [
      `Du bereitest eine Zeitleiste für ein Arbeitsblatt (${meta.subjectLabel}, Klasse ${meta.grade}, Thema „${meta.topic}") als Daten auf. Gezeichnet wird sie vom Programm.`,
      'Regeln: Ereignistexte höchstens 5 Wörter, fachlich korrekt, keine Erfindungen über die Beschreibung hinaus; Daten als ISO-Angabe.',
      'Stufen (yLevels) nur, wenn die Beschreibung Stufen oder eine Eskalation nennt – dann bekommt jedes Ereignis seine Stufe (level).',
      'Stränge (strands) nur, wenn mehrere Akteure als getrennte Linien beschrieben sind.',
      'Einheit und Schrittweite so wählen, dass die Achse 6 bis 12 Marken hat.'
    ].join('\n'),
    user: `Bildunterschrift: ${bild.caption || '–'}\nBeschreibung: ${bild.description}`,
    schemaName: 'zeitleiste',
    schema: obj({ timeline: TIMELINE_SCHEMA })
  })
  const diagram = sanitizeDiagram({ kind: 'zeitleiste', timeline: (data?.timeline ?? {}) as TimelineSpec })
  if (diagram.timeline.events.length < 2) return null
  const preset = gridDefaults('karo')
  return {
    id: bild.id,
    ...(bild.stars ? { stars: bild.stars } : {}),
    ...(bild.ref ? { ref: bild.ref } : {}),
    type: 'grid',
    kind: 'karo',
    title: bild.caption.replace(/^\s*[MQB]\d+\s*:\s*/, ''),
    caption: '',
    heightMm: diagram.heightMm,
    cellMm: preset.cellMm,
    axes: defaultAxes('karo'),
    diagram
  }
}
