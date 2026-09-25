// Bilder für Arbeitsblätter aller Fächer: freie Bilder aus dem Internet (Wikimedia Commons, Cliparts),
// von der KI auf fachliche Eignung geprüft; sonst KI-Bild (nie bei Originalquellen).
import { AiCall, chooseImages, gatherCandidates, ImageNeed, ImageServices } from '../../../shared/imageChoice'
import { runLimited } from '../../../shared/async'
import { GREEN_SCREEN_PROMPT } from '../../../shared/images'
import type { ImageBlock, ImageItem, WorksheetMeta, WsBlock } from '../model/types'
import { findReusable, type ReusableImage } from '../../../shared/imageReuse'

export interface WorksheetImageDeps {
  ai: AiCall
  services: ImageServices
  /** KI-Bilderzeugung, falls eingerichtet */
  generateImage?: (prompt: string) => Promise<string>
  /** Suchvarianten (genau → locker) */
  variants: (query: string) => string[]
  /**
   * Bilder früherer Blätter zum selben Thema.
   * Wird ein Bedarf daraus bedient, sieht die Lerngruppe dasselbe Motiv wie beim Üben – das
   * wirkt als Abrufhilfe (Schneider u. a. 2020) und spart zugleich Suche und Kontingent.
   */
  reuse?: Map<string, ReusableImage>
}

const warn = (b: WsBlock, text: string): void => {
  b.warnings = [...(b.warnings ?? []).filter((w) => !w.startsWith('Bild:') && !w.startsWith('Bildquelle:')), text]
}

export function worksheetImageRules(meta: WorksheetMeta): string {
  return [
    `Arbeitsblatt ${meta.subjectLabel}, Klasse ${meta.grade}, Thema „${meta.topic}“.`,
    'Wähle je Eintrag das Bild, das das beschriebene KERNMOTIV fachlich korrekt zeigt und für Lernende dieser Klasse verständlich ist. Nebensächliche Abweichungen (Blickwinkel, Wetter, Hintergrund, Farbe, weitere Details) sind kein Grund zur Ablehnung – ein echtes Foto oder Schema ist einem erzeugten Bild vorzuziehen.',
    'Ungeeignet sind Bilder mit falschem oder nur ungefähr passendem Inhalt, fachlich falschen oder irreführenden Darstellungen, unleserlichen Details, Wasserzeichen, eingebranntem Schachbrettmuster (Transparenz-Karo), nicht altersgerechten Inhalten oder viel fremdsprachiger Beschriftung (bei Schemata: ohne oder mit deutscher Beschriftung ist besser).',
    'Einträge mit „Originalquelle“: eindeutig ist nur das genannte Werk selbst (Urheber, Titel, Jahr) – ein ähnliches anderes Werk ist ungeeignet.',
    '„brauchbar“ nur, wenn das Bild den Zweck erfüllt, aber nicht ideal ist.'
  ].join('\n')
}

function needFor(b: ImageBlock, meta: WorksheetMeta, variants: WorksheetImageDeps['variants']): ImageNeed {
  const search = b.search?.trim() || b.description.split(/[,.;]/)[0]
  const kinds: ImageNeed['kinds'] = b.original ? ['photo'] : meta.grade <= 4 ? ['photo', 'clipart', 'pictogram'] : ['photo', 'clipart']
  return {
    id: b.id,
    subject: `${b.original ? 'Originalquelle: ' : ''}${b.caption ? `„${b.caption}“ – ` : ''}${b.description}`,
    // Zuletzt auch mit der (deutschen) Bildunterschrift suchen, ohne Materialnummer „M1:“
    queries: [
      ...new Set(
        [
          ...variants(search),
          b.caption
            .replace(/^\s*[MQB]\d+\s*:\s*/, '')
            .split(/[(–,]/)[0]
            .trim()
        ].filter((q) => q.length > 3)
      )
    ],
    kinds
  }
}

/** Auftrag für ein KI-Bild zu einem Arbeitsblatt-Baustein */
export function worksheetImagePrompt(b: ImageBlock, meta: WorksheetMeta): string {
  return [
    `Clear educational illustration for a school worksheet (${meta.subjectLabel}, grade ${meta.grade}, topic: ${meta.topic}).`,
    `It must show exactly: ${b.description}.`,
    'Scientifically and factually correct, simple and uncluttered, friendly flat style with clear outlines, suitable for black-and-white printing.',
    GREEN_SCREEN_PROMPT,
    'No text, no labels, no letters, no numbers unless explicitly required above.'
  ].join(' ')
}

/**
 * Setzt Bilder in alle Bild-Bausteine ohne Bild. Gleiche Bilder in mehreren Niveaufassungen werden nur einmal gesucht.
 * Liefert Zahlen für den Hinweis an die Lehrkraft.
 */
export async function completeWorksheetImages(
  blocks: WsBlock[],
  meta: WorksheetMeta,
  deps: WorksheetImageDeps,
  onProgress?: (message: string, done: number, total: number) => void
): Promise<{ web: number; ai: number; missing: number; reused: number }> {
  // Einzelbilder von Bildreihen werden wie eigene Bild-Bausteine gesucht und danach zurückgeschrieben
  const proxies: { proxy: ImageBlock; block: ImageBlock; item: ImageItem; index: number }[] = []
  const targets: ImageBlock[] = []
  for (const b of blocks) {
    if (b.type !== 'image') continue
    if (b.items?.length) {
      b.items.forEach((item, index) => {
        if (item.image) return
        const proxy: ImageBlock = { id: item.id, type: 'image', description: item.description, caption: item.caption, widthPercent: 100, search: item.search }
        proxies.push({ proxy, block: b, item, index })
        targets.push(proxy)
      })
    } else if (!b.image) {
      targets.push(b)
    }
  }
  const stats = await completeTargets(targets, meta, deps, onProgress)
  for (const { proxy, block, item } of proxies) {
    if (proxy.image) item.image = proxy.image
    if (proxy.autoPicked) block.autoPicked = true
  }
  for (const block of new Set(proxies.map((p) => p.block))) {
    const notes = proxies.filter((p) => p.block === block).flatMap((p) => (p.proxy.warnings ?? []).map((w) => w.replace(/^Bild:/, `Bild ${p.index + 1}:`)))
    block.warnings = [...(block.warnings ?? []).filter((w) => !/^Bild( \d+)?:/.test(w)), ...notes]
  }
  return stats
}

async function completeTargets(
  images: ImageBlock[],
  meta: WorksheetMeta,
  deps: WorksheetImageDeps,
  onProgress?: (message: string, done: number, total: number) => void
): Promise<{ web: number; ai: number; missing: number; reused: number }> {
  const mode = meta.imageSource ?? 'auto'
  const stats = { web: 0, ai: 0, missing: 0, reused: 0 }
  if (!images.length || mode === 'placeholder') return stats

  // Gleiche Suche/Beschreibung → ein Bedarf
  const groups = new Map<string, ImageBlock[]>()
  for (const b of images) {
    const key = `${b.original ? 'Q' : ''}|${(b.search || b.description).toLowerCase()}`
    groups.set(key, [...(groups.get(key) ?? []), b])
  }
  const reps = [...groups.values()].map((g) => g[0])

  const apply = (rep: ImageBlock, fn: (b: ImageBlock) => void): void =>
    groups.get(`${rep.original ? 'Q' : ''}|${(rep.search || rep.description).toLowerCase()}`)!.forEach(fn)
  const pending = new Set(reps)
  const reasons = new Map<ImageBlock, string>()

  // Zuerst der Vorrat: Ein Motiv, das die Lerngruppe vom Übungsblatt kennt, ist einem neuen
  // vorzuziehen – es wirkt in der Abfrage als Abrufhilfe.
  if (deps.reuse?.size) {
    for (const rep of [...pending]) {
      const found = findReusable(deps.reuse, rep.description, rep.search, rep.original)
      if (!found) continue
      apply(rep, (b) => {
        b.image = found.image
        b.autoPicked = true
        warn(b, `Bild: übernommen aus „${found.from}“ – dasselbe Motiv wie beim Üben.`)
      })
      pending.delete(rep)
      stats.reused++
    }
  }

  if (mode === 'auto' || mode === 'web' || reps.some((r) => r.original)) {
    // Nur noch offene Bedarfe suchen – was der Vorrat schon gedeckt hat, bleibt außen vor
    const searchable = [...pending].filter((r) => mode !== 'ai' || r.original)
    onProgress?.(`Passende Bilder werden im Internet gesucht (${searchable.length}) …`, 0, reps.length)
    const gathered = await Promise.all(
      searchable.map(async (rep) => {
        const need = needFor(rep, meta, deps.variants)
        return { rep, need, candidates: await gatherCandidates(need, deps.services, rep.original ? 4 : 3) }
      })
    )
    onProgress?.('Die KI prüft die gefundenen Bilder …', 0, reps.length)
    const choices = await chooseImages(
      gathered.map(({ need, candidates }) => ({ need, candidates })),
      worksheetImageRules(meta),
      deps.ai
    )
    for (const { rep, need, candidates } of gathered) {
      const c = choices.get(need.id)
      if (c) reasons.set(rep, candidates.length ? c.reason : 'keine freien Bilder gefunden')
      if (!c?.candidate) continue
      const dataUrl = await c.candidate.load().catch(() => null)
      if (!dataUrl) continue
      const source = c.candidate.source === 'ai' ? 'ai' : c.candidate.source
      apply(rep, (b) => {
        b.image = { dataUrl, source, credit: c.candidate!.credit, ...(c.candidate!.citation ? { citation: c.candidate!.citation } : {}) }
        b.autoPicked = true
        warn(
          b,
          c.fit === 'eindeutig'
            ? `Bild: automatisch gewählt („${c.candidate!.title.slice(0, 60)}“) – bitte kurz prüfen.`
            : `Bild: automatisch gewählt, passt aber nicht ideal (${c.reason}) – bitte prüfen oder über „Bild wählen“ ersetzen.`
        )
      })
      stats.web++
      pending.delete(rep)
    }
    for (const { rep, need } of gathered) {
      if (pending.has(rep) && rep.original) {
        apply(rep, (b) =>
          warn(
            b,
            `Bildquelle: „${rep.search ?? rep.caption}“ wurde nicht sicher gefunden (${choices.get(need.id)?.reason ?? 'keine Treffer'}) – bitte über „Bild wählen“ suchen.`
          )
        )
        stats.missing++
        pending.delete(rep)
      }
    }
  }

  // KI-Bilder für den Rest (nie für Originalquellen – ein erzeugtes Bild wäre keine Quelle), zwei gleichzeitig
  const rest = [...pending].filter((r) => !r.original)
  const generate = deps.generateImage
  let done = 0
  await runLimited(
    rest.map((rep) => async () => {
      if (needsRealMaterial(rep)) {
        // Erzeugte Bilder mit Schrift, Zahlen oder Karten wären erfunden – echtes Material nötig
        apply(rep, (b) =>
          warn(
            b,
            `Bild: kein passendes freies Bild gefunden${reasons.has(rep) ? ` (${reasons.get(rep)})` : ''}. Für Dokumente, Diagramme, Karten und Statistiken wird kein KI-Bild erzeugt, weil es Inhalte erfinden würde – bitte echtes Material über „Bild wählen“ einfügen.`
          )
        )
      } else if ((mode === 'auto' || mode === 'ai') && generate) {
        onProgress?.(`KI-Bilder werden erzeugt (${done} von ${rest.length} fertig) …`, done, rest.length)
        try {
          const prompt = worksheetImagePrompt(rep, meta)
          const dataUrl = await generate(prompt)
          apply(rep, (b) => {
            // Der Auftrag wird mitgespeichert: Er lässt die Entstehung offenlegen und
            // erlaubt, ein missratenes Bild gezielt neu erzeugen zu lassen.
            b.image = { dataUrl, source: 'ai', credit: 'KI-generiert', aiPrompt: prompt }
            b.autoPicked = true
            warn(b, `Bild: KI-generiert${reasons.has(rep) ? ` (kein passendes freies Bild: ${reasons.get(rep)})` : ''} – bitte fachliche Richtigkeit prüfen.`)
          })
          stats.ai++
          done++
          return
        } catch (e) {
          apply(rep, (b) => warn(b, `Bild: KI-Bild konnte nicht erzeugt werden: ${e instanceof Error ? e.message : String(e)}`))
        }
      } else {
        apply(rep, (b) => warn(b, 'Bild: kein passendes freies Bild gefunden – bitte über „Bild wählen“ auswählen.'))
      }
      stats.missing++
      done++
    }),
    2
  )
  return stats
}

/** Motive, deren Inhalt aus Schrift, Zahlen oder genauen Lageangaben besteht: KI-Bilder würden Inhalte erfinden. */
export function needsRealMaterial(b: Pick<ImageBlock, 'description' | 'caption'>): boolean {
  return /stimmzettel|wahlzettel|urkunde|dokument|zeitung|plakat mit|formular|diagramm|statistik|tabelle|grafik mit|schaubild mit zahlen|landkarte|\bkarte\b|stadtplan|fahrplan|screenshot|quittung|rechnung|brief mit|beschriftet/i.test(
    `${b.caption} ${b.description}`
  )
}
