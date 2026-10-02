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

/** M2 vor M10 */
const nachNummer = (a: string, b: string): number => a.localeCompare(b, 'de', { numeric: true })

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
  return [
    ...new Set(
      texts.flatMap((t) => [
        ...[...String(t).matchAll(/\b([MQB]\s?\d+)\b/g)].map((m) => m[1].replace(/\s+/g, '')),
        // Nicht aufgelöste Kennungen („M{karte}" ohne Material dieser Kennung) sind ebenfalls tote Verweise
        ...[...String(t).matchAll(MATERIAL_VERWEIS)].map((m) => m[0])
      ])
    )
  ]
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

/** Bausteintypen, die als Material gelten und von der App eine Nummer bekommen */
export const MATERIAL_TYPES: WsBlock['type'][] = ['text', 'image', 'table', 'grid', 'audio', 'video']

/** Bausteine, die als Material gelten und von der App eine Nummer bekommen (render/SheetPages.tsx nummeriert genauso). */
export const isMaterial = (block: WsBlock): boolean => MATERIAL_TYPES.includes(block.type) && !block.nurLoesung

/** Verweis über die Kennung eines Materials, wie er GESPEICHERT wird: „M{zeitleiste}" (siehe `ref` in model/types.ts) */
export const MATERIAL_VERWEIS = /M\{([a-z0-9-]+)\}/g
/** Verweis, wie er auf dem Blatt STEHT: „M3" */
const MATERIAL_NUMMER = /\bM(\d+)\b/g

/**
 * Kennung eines Materials für Verweise: die von der KI gewählte (`ref`), sonst die Kennung des
 * Bausteins – so lässt sich JEDES Material dynamisch ansprechen, auch von Hand eingefügte.
 */
export const refOf = (b: WsBlock): string => b.ref ?? b.id

/** Felder, die keine Texte sind und nie umgeschrieben werden */
const KEINE_TEXTE = new Set(['id', 'ref', 'dataUrl', 'aiPrompt', 'url'])

/** Wendet `fn` auf alle Texte eines Wertes an; unveränderte Teile bleiben dasselbe Objekt. */
function wandleTexte(wert: unknown, fn: (s: string) => string): unknown {
  if (typeof wert === 'string') return fn(wert)
  if (Array.isArray(wert)) {
    let geaendert = false
    const neu = wert.map((w) => {
      const n = wandleTexte(w, fn)
      if (n !== w) geaendert = true
      return n
    })
    return geaendert ? neu : wert
  }
  if (wert && typeof wert === 'object') {
    let geaendert = false
    const neu: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(wert as Record<string, unknown>)) {
      const n = KEINE_TEXTE.has(k) ? v : wandleTexte(v, fn)
      if (n !== v) geaendert = true
      neu[k] = n
    }
    return geaendert ? neu : wert
  }
  return wert
}

/** Dasselbe AN ORT UND STELLE – für Entwürfe im Editor, die der Speicher gerade ändert */
function wandleTexteInPlace(wert: unknown, fn: (s: string) => string): void {
  if (Array.isArray(wert)) {
    wert.forEach((w, i) => {
      if (typeof w === 'string') wert[i] = fn(w)
      else wandleTexteInPlace(w, fn)
    })
    return
  }
  if (wert && typeof wert === 'object') {
    const o = wert as Record<string, unknown>
    for (const k of Object.keys(o)) {
      if (KEINE_TEXTE.has(k)) continue
      if (typeof o[k] === 'string') o[k] = fn(o[k] as string)
      else wandleTexteInPlace(o[k], fn)
    }
  }
}

/** Kennung → Nummer und Nummer → Kennung, gezählt über das Dokument */
function kennungen(dokument: WsBlock[]): { nachKennung: Map<string, string>; nachNummer: Map<string, string> } {
  const nummern = materialNummern(dokument)
  const nachKennung = new Map<string, string>()
  const nachNummer = new Map<string, string>()
  for (const b of dokument) {
    const n = nummern.get(b.id)
    if (!n) continue
    const r = refOf(b)
    if (!nachKennung.has(r)) nachKennung.set(r, n)
    if (!nachNummer.has(n)) nachNummer.set(n, r)
  }
  return { nachKennung, nachNummer }
}

/**
 * ANZEIGE: Löst gespeicherte Verweise „M{kennung}" in die Nummern auf, die die App nach der
 * Reihenfolge der Bausteine vergibt – gezählt über `dokument` (Standard: die Bausteine selbst;
 * bei der Klassenarbeit alle Teile). Wird ein Material verschoben, wandern damit auch die
 * Nummern in den Aufgaben, Hilfen und Tabellenköpfen mit (Wunsch der Lehrkraft, 27.09.2026).
 * Unbekannte Kennungen bleiben stehen, damit die Prüfung sie melden kann. Bausteine ohne
 * Verweis kommen unverändert (dasselbe Objekt) zurück.
 */
export function loeseMaterialverweise<T extends WsBlock>(blocks: T[], dokument: WsBlock[] = blocks): T[] {
  const { nachKennung } = kennungen(dokument)
  if (!nachKennung.size) return blocks
  const ersetze = (s: string): string => (s.includes('M{') ? s.replace(MATERIAL_VERWEIS, (ganz, kennung: string) => nachKennung.get(kennung) ?? ganz) : s)
  return gleichWennUnveraendert(blocks, ersetze)
}

/** Neue Liste nur, wenn sich ein Baustein geändert hat – sonst dieselbe (Anzeige-Zwischenspeicher, Vergleiche) */
function gleichWennUnveraendert<T extends WsBlock>(blocks: T[], fn: (s: string) => string): T[] {
  let geaendert = false
  const neu = blocks.map((b) => {
    const n = wandleTexte(b, fn) as T
    if (n !== b) geaendert = true
    return n
  })
  return geaendert ? neu : blocks
}

/**
 * SPEICHERN: der umgekehrte Weg. Nummern „M3", wie die Lehrkraft sie tippt oder wie die KI sie
 * trotz Anweisung schreibt, werden zur Kennung des Materials, das GERADE diese Nummer trägt.
 * Nummern ohne Material bleiben stehen.
 */
export function verschluesseleMaterialverweise<T extends WsBlock>(blocks: T[], dokument: WsBlock[] = blocks): T[] {
  const { nachNummer } = kennungen(dokument)
  if (!nachNummer.size) return blocks
  return gleichWennUnveraendert(blocks, (s) => verschluesseleText(s, nachNummer))
}

const verschluesseleText = (s: string, nachNummer: Map<string, string>): string =>
  /\bM\d/.test(s) ? s.replace(MATERIAL_NUMMER, (ganz, n: string) => (nachNummer.has(`M${n}`) ? `M{${nachNummer.get(`M${n}`)}}` : ganz)) : s

/**
 * Für den Editor: Ein gerade geänderter Baustein (Entwurf des Speichers) wird an Ort und
 * Stelle verschlüsselt. Die Anzeige zeigt „M3", gespeichert wird „M{zeitleiste}" – tippt die
 * Lehrkraft „M3", meint sie das Material, das jetzt so heißt.
 */
export function verschluesseleBaustein(draft: WsBlock, dokument: WsBlock[]): void {
  const { nachNummer } = kennungen(dokument)
  if (!nachNummer.size) return
  wandleTexteInPlace(draft, (s) => verschluesseleText(s, nachNummer))
}

/**
 * Materialnummern, wie die App sie beim Darstellen vergibt: fortlaufend M1, M2 … in der
 * Reihenfolge der Bausteine des GANZEN Dokuments (bei der Klassenarbeit über alle Teile hinweg).
 */
export function materialNummern(blocks: WsBlock[]): Map<string, string> {
  const map = new Map<string, string>()
  let n = 0
  for (const block of blocks) if (isMaterial(block)) map.set(block.id, `M${++n}`)
  return map
}

/**
 * Vollständigkeit eines Blattes.
 *
 * `dokument`: alle Bausteine des Dokuments, in dem das Blatt steht – Standard: das Blatt selbst.
 *
 * Gemeldet am 26.09.2026 (Sprachmittlung, Übungsklausur): „Die Aufgabe verweist auf ‚M1‘, auf
 * dem Blatt ist aber kein Material so bezeichnet“ – obwohl M1 auf der nächsten Seite stand. Zwei
 * Kurzsichtigkeiten auf einmal: (1) Die Prüfung las nur Nummern aus den TITELN, die Nummern
 * vergibt aber seit Langem die App beim Darstellen (Titel tragen keine mehr); (2) sie sah nur
 * den gerade geprüften Ausschnitt – in der Klassenarbeit den einzelnen Teil, obwohl die Nummern
 * über alle Teile durchgezählt werden, und im Arbeitsblatt das Blatt VOR dem Einsetzen des
 * Originaltextes. Die Reihenfolge Aufgabe → Material (Klausur) ist ausdrücklich erlaubt: Es
 * zählt, ob das Material im Dokument steht, nicht ob es davor steht.
 */
export function checkIntegrity(sheet: Sheet, dokument: WsBlock[] = sheet.blocks): IntegrityFinding[] {
  const findings: IntegrityFinding[] = []
  const nummern = materialNummern(dokument)
  const present = new Set([...dokument.flatMap(labelsOf), ...nummern.values()])
  const materials = dokument.filter((b) => b.type !== 'task').length

  // Geprüft wird, was auf dem Blatt steht: Kennungen mit Material werden zu Nummern, unbekannte bleiben „M{…}"
  for (const block of loeseMaterialverweise(sheet.blocks, dokument)) {
    // 1. Verweise auf Material, das es nicht gibt
    for (const ref of referencesOf(block)) {
      if (present.has(ref)) continue
      findings.push({
        blockId: block.id,
        severity: 'hoch',
        message: ref.startsWith('M{')
          ? `Die Aufgabe verweist auf „${ref}“, aber kein Material trägt diese Kennung – die Kennung des gemeinten Materials verwenden.`
          : present.size
            ? `Die Aufgabe verweist auf „${ref}“, im Material gibt es aber nur ${[...present].sort(nachNummer).join(', ')}.`
            : `Die Aufgabe verweist auf „${ref}“, es gibt aber kein Material so bezeichnet.`
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
    // Ohne Adresse kein QR-Code und kein Link (Befund 02.10.2026: „Videoreportage … weder verlinkt noch per QR-Code erreichbar")
    if (!video.url.trim()) {
      findings.push({
        blockId: video.id,
        severity: 'mittel',
        message: 'Das Video hat keine Adresse – auf dem Blatt stehen weder QR-Code noch Link. Adresse in den Einstellungen des Bausteins eintragen.'
      })
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

/**
 * Die Adresse aus den Video-Angaben der Lehrkraft in jeden Videobaustein ohne Adresse setzen
 * (02.10.2026). Die KI bekam nur „es liegt eine Adresse vor", nie die Adresse selbst, und das
 * Schema verlangte sie „wie die Lehrkraft sie angegeben hat, sonst leer" – sie blieb also leer,
 * und auf dem Blatt fehlten QR-Code und Link. Die App setzt sie jetzt selbst ein, wie den
 * Originaltext: Was die Lehrkraft eingegeben hat, gibt die App unverändert weiter.
 */
export function setzeVideoAdresse(sheet: Sheet, meta: WorksheetMeta): Sheet {
  const v = meta.video
  const url = v?.url.trim()
  if (!v || !url) return sheet
  if (!sheet.blocks.some((b) => b.type === 'video' && !b.url.trim())) return sheet
  return {
    ...sheet,
    blocks: sheet.blocks.map((b) =>
      b.type === 'video' && !b.url.trim()
        ? { ...b, url, sourceTitle: b.sourceTitle.trim() || v.title, platform: b.platform.trim() || v.platform, searchTerms: undefined }
        : b
    )
  }
}
