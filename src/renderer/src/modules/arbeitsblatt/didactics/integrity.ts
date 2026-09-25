/**
 * Prüfungen auf Vollständigkeit und Brauchbarkeit eines fertigen Blattes.
 *
 * Sie laufen ohne KI und fangen die Fehler ab, die ein Blatt für die Lernenden unbrauchbar
 * machen, obwohl es auf den ersten Blick vollständig aussieht:
 * - Eine Aufgabe verweist auf „M5", das es auf dem Blatt gar nicht gibt.
 * - Zwei Vergleichsgegenstände zählen ihre Merkmale in derselben Reihenfolge auf; dann
 *   lässt sich die Aufgabe durch Abgleichen der Position lösen, ohne zu vergleichen.
 * - Eine Aufgabe hat keine Lösung, ein Material keinen Inhalt.
 */
import type { Sheet, WorksheetMeta, WsBlock } from '../model/types'
import { DURING_ANSWER_KINDS, duringPolicy } from './videoTasks'

export interface IntegrityFinding {
  /** Baustein, der nachgebessert werden muss */
  blockId: string
  message: string
  /** hoch = das Blatt ist so nicht brauchbar */
  severity: 'hoch' | 'mittel'
}

/** Materialbezeichnungen, die ein Baustein trägt („M1", „Q2", „B3"). */
const labelsOf = (block: WsBlock): string[] => {
  const texts: string[] = []
  if (block.type === 'text') texts.push(block.title ?? '')
  if (block.type === 'image') texts.push(block.caption ?? '')
  if (block.type === 'table') texts.push(block.title ?? '')
  if (block.type === 'grid') texts.push(block.title ?? '')
  if (block.type === 'audio') texts.push(block.title ?? '')
  if (block.type === 'video') texts.push(block.title ?? '')
  return texts.flatMap((t) => [...String(t).matchAll(/\b([MQB]\s?\d+)\b/g)].map((m) => m[1].replace(/\s+/g, '')))
}

/** Verweise in einer Aufgabe („anhand von M3", „in M5"). */
const referencesOf = (block: WsBlock): string[] => {
  if (block.type !== 'task') return []
  const texts = [block.instruction ?? '', block.brief?.situation ?? '', ...block.parts.map((p) => p.instruction ?? '')]
  return [...new Set(texts.flatMap((t) => [...String(t).matchAll(/\b([MQB]\s?\d+)\b/g)].map((m) => m[1].replace(/\s+/g, ''))))]
}

/** Eine Zeile „Alex: Buch, Stift, Heft" → die aufgezählten Dinge. */
function listedItems(line: string): { name: string; items: string[] } | null {
  const m = /^\s*([^:•\-–]{1,40}):\s*(.+)$/.exec(line)
  if (!m) return null
  const items = m[2]
    .split(/[,;]|\bund\b|\band\b/)
    .map((x) =>
      x
        .replace(/[.!?]+$/, '')
        .replace(/^(a|an|the|ein|eine|einen)\s+/i, '')
        .trim()
        .toLowerCase()
    )
    .filter((x) => x.length > 1)
  return items.length >= 3 ? { name: m[1].trim(), items } : null
}

/**
 * Zwei Aufzählungen in derselben Reihenfolge? Dann ist die Vergleichsaufgabe trivial:
 * Die Lernenden können Zeile für Zeile abgleichen, statt Gemeinsamkeiten zu suchen.
 */
export function sameOrder(a: string[], b: string[]): boolean {
  const shared = a.filter((x) => b.includes(x))
  if (shared.length < 3) return false
  const inB = b.filter((x) => shared.includes(x))
  return shared.every((x, i) => inB[i] === x)
}

/** Wörter eines Textes, klein geschrieben und ohne Satzzeichen – für den Abgleich. */
const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/\[\[|\]\]/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 3)

/**
 * Hörverstehen: Die Aufgaben müssen zu einem Hörtext gehören, der auch da ist – und ihre
 * Lösungen müssen im Skript vorkommen.
 *
 * Auf dem kritisierten Blatt entstanden Aufgaben ganz ohne Hörtext. Und eine Hörverstehens-
 * aufgabe, deren Antwort nicht im Skript steht, ist unlösbar: Die Lernenden hören etwas
 * anderes, als sie beantworten sollen.
 */
export function checkListening(sheet: Sheet): IntegrityFinding[] {
  const findings: IntegrityFinding[] = []
  const audio = sheet.blocks.filter((b) => b.type === 'audio')
  const listeningTasks = sheet.blocks.filter((b) => b.type === 'task' && b.skill === 'listening')

  if (listeningTasks.length && !audio.length) {
    for (const task of listeningTasks) {
      findings.push({ blockId: task.id, severity: 'hoch', message: 'Die Aufgabe prüft Hörverstehen, auf dem Blatt gibt es aber keinen Hörtext.' })
    }
    return findings
  }

  for (const block of audio) {
    if (block.type !== 'audio') continue
    if (!block.transcript.trim()) {
      findings.push({ blockId: block.id, severity: 'hoch', message: 'Der Hörtext hat kein Skript – er lässt sich weder vorlesen noch vertonen.' })
      continue
    }
    if (!listeningTasks.length) {
      findings.push({ blockId: block.id, severity: 'hoch', message: 'Zu diesem Hörtext gibt es keine Aufgabe.' })
    }
  }

  /*
   * Passen die Lösungen zum Gehörten?
   *
   * Verglichen wird mit DEM Skript, zu dem die Aufgabe gehört – nicht mit allen zusammen.
   * Bei zwei Hörtexten käme eine Lösung sonst auch dann durch, wenn sie im falschen Text
   * steht; die Aufgabe wäre beim Hören trotzdem unlösbar.
   */
  const scripts = new Map<string, Set<string>>()
  for (const b of audio) if (b.type === 'audio') scripts.set(b.id, new Set(wordsOf(`${b.transcript} ${b.title}`)))
  const allWords = new Set(audio.flatMap((b) => (b.type === 'audio' ? wordsOf(`${b.transcript} ${b.title}`) : [])))
  if (!allWords.size) return findings
  for (const task of listeningTasks) {
    if (task.type !== 'task') continue
    // Ohne Zuordnung bleibt nur der Abgleich mit allen Skripten (ältere Blätter)
    const inScript = (task.audioId && scripts.get(task.audioId)) || allWords
    for (const part of task.parts) {
      const answer = part.solution?.trim()
      if (!answer || answer.length < 8) continue
      const words = wordsOf(answer)
      if (words.length < 3) continue
      const hits = words.filter((w) => inScript.has(w)).length
      // Weniger als ein Drittel der Wörter im Skript: Die Lösung steht dort so nicht
      if (hits / words.length < 0.34) {
        findings.push({
          blockId: task.id,
          severity: 'hoch',
          message: `Die erwartete Lösung („${answer.slice(0, 60)}…") kommt im Hörtext so nicht vor – die Aufgabe ist beim Hören nicht lösbar.`
        })
        break
      }
    }
  }
  return findings
}

export function checkIntegrity(sheet: Sheet): IntegrityFinding[] {
  const findings: IntegrityFinding[] = []
  const present = new Set(sheet.blocks.flatMap(labelsOf))
  const materials = sheet.blocks.filter((b) => b.type !== 'task').length

  for (const block of sheet.blocks) {
    // 1. Verweise auf Material, das es nicht gibt
    for (const ref of referencesOf(block)) {
      if (present.has(ref)) continue
      findings.push({
        blockId: block.id,
        severity: 'hoch',
        message: present.size
          ? `Die Aufgabe verweist auf „${ref}“, auf dem Blatt gibt es aber nur ${[...present].join(', ')}.`
          : `Die Aufgabe verweist auf „${ref}“, auf dem Blatt ist aber kein Material so bezeichnet.`
      })
    }

    // 2. Aufgabe ohne Material, obwohl sie sich darauf beruft
    if (block.type === 'task' && !materials && referencesOf(block).length) {
      findings.push({ blockId: block.id, severity: 'hoch', message: 'Die Aufgabe beruft sich auf Material, das Blatt hat aber keines.' })
    }

    // 3. Leeres Material
    if (block.type === 'text' && !(block.body ?? '').trim()) {
      findings.push({ blockId: block.id, severity: 'hoch', message: 'Der Materialtext ist leer.' })
    }

    // 4. Gleiche Reihenfolge in zwei Aufzählungen (Vergleichsaufgaben)
    if (block.type === 'text') {
      const lists = String(block.body ?? '')
        .split(/\n+/)
        .map(listedItems)
        .filter((x): x is { name: string; items: string[] } => Boolean(x))
      for (let i = 0; i < lists.length; i++) {
        for (let j = i + 1; j < lists.length; j++) {
          if (!sameOrder(lists[i].items, lists[j].items)) continue
          findings.push({
            blockId: block.id,
            severity: 'mittel',
            message: `„${lists[i].name}“ und „${lists[j].name}“ zählen dieselben Dinge in derselben Reihenfolge auf – zum Vergleichen muss die Reihenfolge sich unterscheiden.`
          })
        }
      }
    }
  }
  return findings
}

/**
 * Prüfungen für Beobachtungsaufträge zu Filmen und Videos.
 *
 * Die drei Fehler, die ein Videoblatt unbrauchbar machen, obwohl es vollständig aussieht:
 * eine Beobachtungsaufgabe ohne Video, ein Video ohne Aufgabe – und eine Aufgabe, die
 * während des Sehens einen Fließtext verlangt. Der letzte ist der heimtückische: Das Blatt
 * sieht gut aus, aber wer schreibt, sieht nicht.
 */
export function checkVideo(sheet: Sheet, meta: WorksheetMeta): IntegrityFinding[] {
  const findings: IntegrityFinding[] = []
  const videos = sheet.blocks.filter((b): b is Extract<WsBlock, { type: 'video' }> => b.type === 'video')
  const tasks = sheet.blocks.filter((b): b is Extract<WsBlock, { type: 'task' }> => b.type === 'task')
  const viewing = tasks.filter((t) => t.viewingPhase)

  if (!videos.length) {
    for (const task of viewing) {
      findings.push({ blockId: task.id, severity: 'hoch', message: 'Die Aufgabe gehört zu einem Video, auf dem Blatt gibt es aber keines.' })
    }
    return findings
  }

  for (const video of videos) {
    if (!viewing.some((t) => t.videoId === video.id)) {
      findings.push({ blockId: video.id, severity: 'hoch', message: 'Zu diesem Video gibt es keine Aufgabe.' })
    }
    if (!video.sourceTitle.trim()) {
      findings.push({ blockId: video.id, severity: 'mittel', message: 'Das Video hat keinen Titel – so ist es nicht wiederzufinden.' })
    }
    if (video.url && !/^https?:\/\/\S+$/i.test(video.url.trim())) {
      findings.push({
        blockId: video.id,
        severity: 'mittel',
        message: 'Die Adresse ist keine gültige Internetadresse; daraus entsteht kein brauchbarer QR-Code.'
      })
    }
  }

  const during = meta.video ? duringPolicy(meta.video.kind, meta.video.during) : 'ankreuzen'
  const whileWatching = viewing.filter((t) => t.viewingPhase === 'waehrend')
  if (during === 'keine' && whileWatching.length) {
    for (const task of whileWatching) {
      findings.push({
        blockId: task.id,
        severity: 'mittel',
        message: 'Bei dieser Videoart soll während des Sehens nicht gearbeitet werden – die Aufgabe gehört vor oder nach den Film.'
      })
    }
  }
  if (during === 'ankreuzen') {
    for (const task of whileWatching) {
      const kinds = [task.answer.kind, ...task.parts.map((p) => p.answer.kind)]
      if (kinds.some((k) => !DURING_ANSWER_KINDS.includes(k as (typeof DURING_ANSWER_KINDS)[number]) && k !== 'none')) {
        findings.push({
          blockId: task.id,
          severity: 'mittel',
          message: 'Während des Sehens wird hier geschrieben statt angekreuzt. Wer schreibt, sieht nicht – ankreuzbares Format wählen.'
        })
      }
    }
    if (whileWatching.length > 2) {
      findings.push({
        blockId: whileWatching[2].id,
        severity: 'mittel',
        message: 'Mehr als zwei Aufgaben während des Sehens: Der Blick kann nicht auf so vielen Dingen zugleich liegen.'
      })
    }
  }

  // Arbeitsteilige Beobachtung: Kommen alle bestellten Gruppen vor?
  const wanted = meta.video?.groups ?? 0
  if (wanted > 1) {
    const present = new Set(viewing.map((t) => t.observerGroup).filter(Boolean))
    if (present.size < wanted) {
      findings.push({
        blockId: videos[0].id,
        severity: 'hoch',
        message: `Es sollten ${wanted} Beobachtergruppen entstehen, es gibt aber nur ${present.size || 'keine'}.`
      })
    }
    if (!viewing.some((t) => t.viewingPhase === 'nach' && !t.observerGroup)) {
      findings.push({
        blockId: videos[0].id,
        severity: 'mittel',
        message: 'Es fehlt eine gemeinsame Aufgabe nach dem Sehen, die die Beobachtungen der Gruppen zusammenträgt.'
      })
    }
  }
  return findings
}
