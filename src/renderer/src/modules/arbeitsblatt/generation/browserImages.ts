import { browserImageServices, generateAiImage, imageGenerationAvailable, sourceSearchVariants } from '../../../shared/images'
import { aiCall } from '../store'
import type { WorksheetImageDeps } from './worksheetImages'
import { reusePool, type ReusableImage } from '../../../shared/imageReuse'

/**
 * Bildsuche, KI-Prüfung und KI-Bilder über die App.
 * In einem Hintergrund-Auftrag kommen dessen KI-Aufrufe hinein – dann lassen sie sich mit ihm abbrechen.
 */
export async function browserWorksheetImageDeps(auftrag?: {
  ai: WorksheetImageDeps['ai']
  bild: (prompt: string) => Promise<string>
}): Promise<WorksheetImageDeps> {
  const canGenerate = await imageGenerationAvailable()
  return {
    ai: auftrag?.ai ?? aiCall,
    services: browserImageServices(),
    // 1024 Punkte: Ein Bild über die ganze Blattbreite (170 mm) braucht bei 150 dpi rund 1000 Punkte (didactics/bildarbeit.ts);
    // mit den bisherigen 512 wurde jedes Schema im Druck unscharf
    generateImage: canGenerate ? async (prompt) => (await generateAiImage(prompt, 1024, auftrag?.bild)).dataUrl : undefined,
    variants: sourceSearchVariants
  }
}

/**
 * Bilder früherer Arbeitsblätter zum selben Thema.
 *
 * Wird beim Erstellen einer Klassenarbeit herangezogen: Erscheint dort dasselbe Motiv wie auf
 * dem Übungsblatt, wirkt es als Abrufhilfe statt als Ablenkung (Schneider u. a. 2020). Damit
 * das trägt, muss das Blatt wirklich zur Lerngruppe und zum Stoff passen – deshalb die enge
 * Filterung nach Fach, Jahrgang und Thema.
 */
export async function worksheetImagePool(subjectId: string, topic: string, grade: number): Promise<Map<string, ReusableImage>> {
  try {
    const list = await window.api.sheets.list()
    const wanted = topicWords(topic)
    const candidates = list
      .filter((s) => s.subjectId === subjectId && Math.abs(s.grade - grade) <= 1)
      .map((s) => ({ s, score: overlap(wanted, topicWords(s.topic)) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      // Mehr als drei Blätter bringen nichts: Was oft vorkam, steht im ähnlichsten Blatt
      .slice(0, 3)
    if (!candidates.length) return new Map()
    const loaded = await Promise.all(
      candidates.map(async ({ s }) => {
        const full = await window.api.sheets.get(s.id)
        const ws = full.payload as { sheets?: { blocks: unknown[] }[] }
        return { name: s.name, blocks: (ws?.sheets ?? []).flatMap((sheet) => sheet.blocks) as never[] }
      })
    )
    return reusePool(loaded)
  } catch {
    // Ein fehlender Vorrat ist kein Fehler – dann wird eben gesucht
    return new Map()
  }
}

const topicWords = (topic: string): string[] =>
  topic
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 3)

const overlap = (a: string[], b: string[]): number => (a.length && b.length ? a.filter((w) => b.includes(w)).length / Math.max(a.length, b.length) : 0)
