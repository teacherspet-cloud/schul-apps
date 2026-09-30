// Bilder für Arbeitsblätter aller Fächer: freie Bilder aus dem Internet (Wikimedia Commons, Cliparts),
// von der KI auf fachliche Eignung geprüft; sonst KI-Bild (nie bei Originalquellen).
import { AiCall, chooseImages, gatherCandidates, ImageNeed, ImageServices } from '../../../shared/imageChoice'
import { runLimited } from '../../../shared/async'
import { GREEN_SCREEN_PROMPT } from '../../../shared/images'
import type { ImageBlock, ImageItem, WorksheetMeta, WsBlock } from '../model/types'
import { findReusable, type ReusableImage } from '../../../shared/imageReuse'
import { istZeitleiste, zeitleisteAusBeschreibung } from './zeitleiste'
import { beschriftungsAufgaben, istSchaltplan, zeichneSchaltplan } from './schaltplan'

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
  /**
   * Ersetzt einen Bild-Baustein durch einen anderen Baustein (27.09.2026): Eine als Bild
   * beschriebene Zeitleiste wird zur gezeichneten Zeitleiste (generation/zeitleiste.ts).
   * Fehlt der Rückruf, bleibt der Bild-Baustein mit Hinweis stehen.
   */
  ersetze?: (imageId: string, block: WsBlock) => void
}

const warn = (b: WsBlock, text: string): void => {
  b.warnings = [...(b.warnings ?? []).filter((w) => !w.startsWith('Bild:') && !w.startsWith('Bildquelle:')), text]
}

export function worksheetImageRules(meta: WorksheetMeta): string {
  return [
    `Arbeitsblatt ${meta.subjectLabel}, Klasse ${meta.grade}, Thema „${meta.topic}“.`,
    'Wähle je Eintrag das Bild, das das beschriebene KERNMOTIV fachlich korrekt zeigt und für Lernende dieser Klasse verständlich ist. Nebensächliche Abweichungen (Blickwinkel, Wetter, Hintergrund, Farbe, weitere Details) sind kein Grund zur Ablehnung – ein echtes Foto oder Schema ist einem erzeugten Bild vorzuziehen.',
    'Ungeeignet sind Bilder mit falschem oder nur ungefähr passendem Inhalt, fachlich falschen oder irreführenden Darstellungen, unleserlichen Details, Wasserzeichen, eingebranntem Schachbrettmuster (Transparenz-Karo), nicht altersgerechten Inhalten oder viel fremdsprachiger Beschriftung (bei Schemata: ohne oder mit deutscher Beschriftung ist besser).',
    'Karten, Dokumente und Diagramme: Geeignet ist das Bild, das Raum, Zeit und Gegenstand des Kernmotivs fachlich richtig zeigt – auch wenn in der Beschreibung genannte Zusätze fehlen (Pfeile, Datumsangaben, eine bestimmte Legende oder Farbgebung); solche Zusätze erarbeiten die Lernenden in der Aufgabe. Fremdsprachige Ländernamen und eine kurze fremdsprachige Legende auf einer Karte sind hinnehmbar („brauchbar"). Ein echtes Bild ist hier immer besser als keines.',
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
    // Beschriftungen setzt die App selbst (imageLabels); Schrift aus der Bild-KI ist erfunden und im Druck unlesbar
    'Absolutely no text, no labels, no letters, no numbers and no dates anywhere in the image – labels are added separately.'
  ].join(' ')
}

/**
 * Mindestanforderung an ein echtes Bild, wenn die genaue Beschreibung nichts ergab.
 *
 * Auf dem Blatt „Julikrise 1914" (27.09.2026) blieb die Europakarte leer: Die KI hatte eine
 * Karte „mit datierten Mobilmachungs- und Kriegspfeilen" beschrieben, der Prüfer lehnte vier
 * passende Bündniskarten ab, weil die Pfeile fehlten. Der zweite Durchgang fragt nur noch nach
 * dem Kernmotiv – der Bildunterschrift –, denn Zusätze, die kein Archivbild hat, gehören in die
 * Aufgabe und nicht in die Anforderung.
 */
export function mindestanforderung(b: Pick<ImageBlock, 'caption' | 'description'>): string {
  const kern = b.caption.replace(/^\s*[MQB]\d+\s*:\s*/, '').trim() || b.description.split(/[,.;]/)[0].trim()
  return `Mindestanforderung: ein echtes Bild, das „${kern}“ fachlich richtig zeigt. Zusätze aus der ursprünglichen Beschreibung (Pfeile, Datumsangaben, bestimmte Legende, Farben) sind NICHT nötig.`
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
): Promise<{ web: number; ai: number; missing: number; reused: number; gezeichnet: number }> {
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
  const stats = await completeTargets(targets, meta, deps, onProgress, blocks)
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
  onProgress?: (message: string, done: number, total: number) => void,
  blocks: WsBlock[] = images
): Promise<{ web: number; ai: number; missing: number; reused: number; gezeichnet: number }> {
  const mode = meta.imageSource ?? 'auto'
  const stats = { web: 0, ai: 0, missing: 0, reused: 0, gezeichnet: 0 }
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

  /*
   * Schaltpläne zeichnet die App (30.09.2026, generation/schaltplan.ts) – VOR Vorrat und Archiv:
   * Ein fremder Schaltplan zeigt fast nie genau die beschriebenen Bauteile, und Beschriftungspunkte
   * lassen sich nur an einer eigenen Zeichnung sicher an die Bauteile setzen.
   */
  const schaltplaene = [...pending].filter((r) => !r.original && istSchaltplan(r))
  if (schaltplaene.length) {
    onProgress?.('Schaltpläne werden gezeichnet …', 0, reps.length)
    await Promise.all(
      schaltplaene.map(async (rep) => {
        const gruppe = groups.get(`${rep.original ? 'Q' : ''}|${(rep.search || rep.description).toLowerCase()}`)!
        // Kein Rückfall auf die Bildsuche: Ein fremder Schaltplan zeigt fast nie die beschriebenen Bauteile
        const ergebnis = await zeichneSchaltplan(gruppe, blocks, meta, deps.ai).catch(() => 'abgelehnt' as const)
        pending.delete(rep)
        if (ergebnis === 'gezeichnet') stats.gezeichnet++
        else stats.missing++
      })
    )
  }

  /*
   * Beschriftungspunkte der Text-KI entstehen, BEVOR es ein Bild gibt – auf einem gefundenen oder
   * erzeugten Bild treffen sie nur zufällig (Befund „Wann leuchtet die Lampe?", 30.09.2026).
   * Lässt eine Aufgabe dieselben Teile schon über Schreiblinien benennen, fallen die Punkte weg
   * (ein Beschriftungsweg); sonst bleiben sie mit der Bitte, ihre Lage zu prüfen.
   */
  const blindeBeschriftung = (b: ImageBlock): void => {
    if (!b.labels?.length || b.schaltplan) return
    if (beschriftungsAufgaben([b], blocks).length) {
      delete b.labels
      warn(b, `${(b.warnings ?? []).find((w) => w.startsWith('Bild:')) ?? 'Bild: automatisch gewählt.'} Die geschätzten Beschriftungspunkte wurden entfernt – die Aufgabe bietet die Schreiblinien.`)
      return
    }
    warn(
      b,
      `${(b.warnings ?? []).find((w) => w.startsWith('Bild:')) ?? 'Bild: automatisch gewählt.'} Die Beschriftungspunkte wurden vor der Bildwahl geschätzt – bitte prüfen, ob jeder Punkt am gemeinten Bildteil sitzt, und ggf. verschieben.`
    )
  }

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
    /*
     * Zweiter Durchgang für Karten, Dokumente und Diagramme: Wurden Kandidaten gefunden, aber
     * wegen fehlender Zusätze abgelehnt, genügt das Kernmotiv (siehe `mindestanforderung`).
     * Ein erzeugtes Bild gibt es für diese Motive nicht – ohne diesen Durchgang bliebe die Stelle leer.
     */
    const zweiteRunde = gathered.filter(({ rep, candidates }) => pending.has(rep) && !rep.original && candidates.length && needsRealMaterial(rep))
    if (zweiteRunde.length) {
      onProgress?.('Kein Bild passte genau – die KI prüft die Funde noch einmal auf das Kernmotiv …', 0, reps.length)
      const locker = await chooseImages(
        zweiteRunde.map(({ rep, need, candidates }) => ({ need: { ...need, subject: `${need.subject} – ${mindestanforderung(rep)}` }, candidates })),
        worksheetImageRules(meta),
        deps.ai
      )
      for (const { rep, need } of zweiteRunde) {
        const c = locker.get(need.id)
        if (!c?.candidate) {
          if (c) reasons.set(rep, c.reason)
          continue
        }
        const dataUrl = await c.candidate.load().catch(() => null)
        if (!dataUrl) continue
        const source = c.candidate.source === 'ai' ? 'ai' : c.candidate.source
        apply(rep, (b) => {
          b.image = { dataUrl, source, credit: c.candidate!.credit, ...(c.candidate!.citation ? { citation: c.candidate!.citation } : {}) }
          b.autoPicked = true
          warn(
            b,
            `Bild: automatisch gewählt („${c.candidate!.title.slice(0, 60)}“) – zeigt das Kernmotiv, nicht jede beschriebene Einzelheit (${c.reason}). Bitte prüfen; fehlende Angaben gehören in die Aufgabe.`
          )
        })
        stats.web++
        pending.delete(rep)
      }
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
        /*
         * Zeitleiste ohne Archivbild (27.09.2026): Die App zeichnet sie selbst aus den Daten der
         * Beschreibung (generation/zeitleiste.ts) – aber erst HIER, nach Vorrat und Archivsuche:
         * Ein echtes Bild hat Vorrang, Erzeugtes ist der Rückfall (Vorgabe der Lehrkraft).
         */
        if (istZeitleiste(rep) && deps.ersetze) {
          onProgress?.('Kein Archivbild – die Zeitleiste wird aus der Beschreibung gezeichnet …', done, rest.length)
          try {
            const grid = await zeitleisteAusBeschreibung(rep, meta, deps.ai)
            if (grid) {
              apply(rep, (b) => deps.ersetze!(b.id, { ...grid, id: b.id, ...(b.ref ? { ref: b.ref } : {}), ...(b.stars ? { stars: b.stars } : {}) }))
              stats.gezeichnet++
              done++
              return
            }
          } catch {
            // Dann bleibt der Hinweis – die Lehrkraft kann es im KI-Menü noch einmal anstoßen
          }
        }
        // Erzeugte Bilder mit Schrift, Zahlen oder Karten wären erfunden – echtes Material nötig
        apply(rep, (b) =>
          warn(
            b,
            istZeitleiste(rep)
              ? `Bild: kein passendes freies Bild gefunden${reasons.has(rep) ? ` (${reasons.get(rep)})` : ''}, und die Zeitleiste ließ sich nicht aus der Beschreibung zeichnen. Im KI-Menü des Bausteins „Als Zeitleiste zeichnen lassen“ noch einmal anstoßen – oder ein Bild über „Bild wählen“ einfügen.`
              : `Bild: kein passendes freies Bild gefunden${reasons.has(rep) ? ` (${reasons.get(rep)})` : ''}. Für Dokumente, Karten und Statistiken wird kein KI-Bild erzeugt, weil es Inhalte erfinden würde – bitte echtes Material über „Bild wählen“ einfügen.`
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
  for (const b of images) if (b.image && b.autoPicked) blindeBeschriftung(b)
  return stats
}

/**
 * Motive, deren Inhalt aus Schrift, Zahlen oder genauen Lageangaben besteht: KI-Bilder würden Inhalte erfinden.
 * Seit dem 27.09.2026 auch Zeitleisten und Ablaufschemata – eine erzeugte „Zeitleiste der Julikrise" trug
 * erfundene, im Druck unlesbare Ereigniskarten.
 */
export function needsRealMaterial(b: Pick<ImageBlock, 'description' | 'caption'>): boolean {
  return /stimmzettel|wahlzettel|urkunde|dokument|zeitung|plakat mit|formular|diagramm|statistik|tabelle|grafik mit|schaubild|\b[a-zäöü]*karte\b|stadtplan|fahrplan|screenshot|quittung|rechnung|brief mit|beschriftet|zeitleiste|zeitachse|zeitstrahl|ablaufschema|ablaufplan|organigramm|ereigniskarte|mit datum|datumsangabe|datiert|jahreszahl|mit zahlen|mit text|mit schrift/i.test(
    `${b.caption} ${b.description}`
  )
}
