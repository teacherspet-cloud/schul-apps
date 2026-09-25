import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { needsLargeType } from '../didactics/language'
import { buildLearnerProfile, LearnerProfile } from '../didactics/profile'
import type { Sheet, Worksheet, WorksheetMeta, WsBlock } from '../model/types'
import { BlockView } from './BlockView'
import { subjectById } from '../model/subjects'
import { contentInsets, PageFrame, PageInfo } from './PageFrame'
import { MeasuredItem, PagePlan, paginate, PlacedItem } from './paginate'
import { WsContext, WsContextValue, WsMode, isKeyMode } from './WsContext'
import { DEFAULT_CITATION_STYLE, formatCitation } from '../../../shared/citation'
import type { CitationStyle } from '@shared/types'
import { canaryText, canaryWordFor, canaryWords } from '../../../shared/aiCanary'
import { gradeScaleRows } from '../../../shared/gradeScale'
import { GRAMMAR_TOPICS } from '../didactics/grammar'
import { phraseSheetModus } from '../generation/prompts'
import { zeigtUebersetzung } from '../didactics/phraseRules'

export function profileFromMeta(meta: WorksheetMeta): LearnerProfile {
  return buildLearnerProfile(
    {
      stateId: meta.stateId,
      schoolTypeId: meta.schoolTypeId,
      schoolTypeName: meta.schoolTypeName,
      grade: meta.grade,
      courseLevel: meta.courseLevel,
      subjectId: meta.subjectId,
      subjectLabel: meta.subjectLabel,
      languageMode: meta.languageMode,
      cefrLevel: meta.cefrLevel,
      instructionsInGerman: meta.instructionsInGerman
    },
    meta.overrides
  )
}

export function pageInfoFor(ws: Worksheet, sheet: Sheet, logo: string | null, schoolName: string, isKey: boolean, citationStyle?: CitationStyle): PageInfo {
  const profile = profileFromMeta(ws.meta)
  const auto = ws.design.page.autoFontSize
  // Der Schalter am Blatt hat Vorrang vor der Vorgabe aus den Einstellungen und gilt
  // unabhängig von der Designvorlage.
  const school = ws.meta.showSchool !== false
  return {
    // Ein Blatt mit eigener Kopfzeile (Fassung B, C …) überschreibt die des Dokuments
    design: sheet.kopfzeile === undefined ? ws.design : { ...ws.design, header: { ...ws.design.header, customText: sheet.kopfzeile } },
    meta: ws.meta,
    logo: school ? logo : null,
    schoolName: school ? schoolName : '',
    fontPt: auto ? profile.typography.fontPt : ws.design.page.baseFontPt,
    lineHeight: ws.design.page.lineHeight ?? (auto ? profile.typography.lineHeight : 1.35),
    isKey,
    language: ws.meta.labelLanguage ?? 'de',
    levelMark: ws.meta.showLevelMarks !== false && ws.sheets.length > 1 && sheet.stars ? '★'.repeat(sheet.stars) : undefined,
    citationStyle,
    // Für dasselbe Blatt immer dasselbe Wort, damit die Lehrkraft weiß, wonach sie sucht
    canary: ws.meta.aiCanary ? canaryText(canaryWords(ws.meta.aiCanaryWords, canaryWordFor(`${ws.meta.title}|${ws.meta.topic}`))) : undefined
  }
}

/** Bausteine, die als Material gelten und eine Nummer bekommen. */
export const isMaterial = (block: WsBlock): boolean => ['text', 'image', 'table', 'grid', 'audio', 'video'].includes(block.type)

/**
 * Materialnummern vergibt die App, nicht die KI: fortlaufend M1, M2 … in der Reihenfolge
 * der Bausteine. Vorher schrieb die KI die Nummern frei in die Überschrift – so konnte eine
 * Aufgabe auf ein „M5" verweisen, das es gar nicht gab.
 */
export function materialNumbersFor(sheet: Sheet): Map<string, string> {
  const map = new Map<string, string>()
  let n = 0
  for (const block of sheet.blocks) if (isMaterial(block)) map.set(block.id, `M${++n}`)
  return map
}

export function taskNumbersFor(sheet: Sheet): Map<string, number> {
  const map = new Map<string, number>()
  let n = 0
  for (const b of sheet.blocks) if (b.type === 'task') map.set(b.id, ++n)
  return map
}

/**
 * Die Aufgaben, bei denen eine neue Phase der Filmbeobachtung beginnt.
 *
 * Nur dort steht die Zwischenüberschrift „Vor dem Sehen" / „Während des Sehens" /
 * „Nach dem Sehen". An jede Aufgabe geschrieben wäre sie Lärm; einmal je Abschnitt
 * ordnet sie das Blatt.
 */
export function viewingPhaseStarts(sheet: Sheet): Set<string> {
  const starts = new Set<string>()
  let last: string | undefined
  for (const b of sheet.blocks) {
    if (b.type !== 'task') continue
    if (b.viewingPhase && b.viewingPhase !== last) starts.add(b.id)
    last = b.viewingPhase
  }
  return starts
}

/**
 * Welche Seiten auf dem Deckblatt gezeigt werden.
 *
 * Wunsch der Lehrkraft (24.09.2026): „Aktuell werden alle Seiten des Materials untereinander
 * angezeigt. Trenne auf dem Deckblatt die Seiten voneinander und nutze 4-6 repräsentative
 * Seiten des Materials einzeln angeordnet."
 *
 * Erste und letzte Seite sind immer dabei – sie zeigen Einstieg und Abschluss. Dazwischen
 * wird gleichmäßig verteilt, statt einfach die ersten zu nehmen: Sonst sähe man bei einem
 * achtseitigen Blatt viermal den Anfang und nie eine Aufgabe.
 */
export function vorschauSeiten(anzahl: number, hoechstens = 6): number[] {
  if (anzahl <= 0) return []
  if (anzahl <= hoechstens) return Array.from({ length: anzahl }, (_, i) => i)
  const aus = new Set<number>([0, anzahl - 1])
  const schritte = hoechstens - 2
  for (let k = 1; k <= schritte; k++) aus.add(Math.round((k * (anzahl - 1)) / (schritte + 1)))
  return [...aus].sort((a, b) => a - b).slice(0, hoechstens)
}

export function contextFor(ws: Worksheet, sheet: Sheet, mode: WsMode, extra: Partial<WsContextValue> = {}): WsContextValue {
  const insets = contentInsets(ws.design)
  return {
    mode,
    contentWidthMm: 210 - insets.left - insets.right,
    taskNumbers: taskNumbersFor(sheet),
    materialNumbers: materialNumbersFor(sheet),
    phaseStarts: viewingPhaseStarts(sheet),
    showTimecodes: Boolean(ws.meta.video?.timecodesOnSheet),
    showStars: ws.meta.showLevelMarks !== false && ws.meta.differentiation.levels > 1 && ws.meta.differentiation.mode === 'combined',
    sheetStars: sheet.stars,
    correctionMargin: ws.meta.correctionMargin,
    notesMargin: ws.meta.notesMargin,
    phraseGerman: zeigtUebersetzung(ws.meta, sheet.stars),
    taskStyle: {
      numberStyle: ws.design.tasks.numberStyle,
      showSocialFormIcons: ws.design.tasks.showSocialFormIcons,
      pictograms: ws.meta.pictograms
    },
    justify: justifyText(ws),
    answerLanguage: subjectById(ws.meta.subjectId).foreignLanguage ?? 'de',
    wordLimit: ws.meta.wordLimit,
    subjectId: ws.meta.subjectId,
    ...extra
  }
}

/** Ohne Messung (z. B. vor dem ersten Messen): alles auf eine Seite. */
const fallbackPlan = (sheet: Sheet, ownPhrasePage = false): PagePlan[] => [
  {
    items: blockLayout(sheet.blocks, ownPhrasePage).map((e) => ({
      id: e.block.id
    })),
    overflow: false
  }
]

export const layoutKey = (sheetId: string, key: boolean): string => `${sheetId}:${key ? 'key' : 'print'}`

/**
 * Bilder neben dem Text: Ein Verständnis- oder Motivationsbild wird in den folgenden Text- oder Aufgabenbaustein
 * eingebettet (umflossen). Arbeitsmaterial bleibt ein eigener Baustein in voller Breite.
 */
/** Gestufte Hilfekarten gehören auf eine eigene Schlussseite, nicht zwischen die Aufgaben. */
export const isHelpCard = (block: WsBlock): boolean => block.type === 'scaffold' && block.variant === 'hilfekarten'

/** Hilfsblatt mit nützlichen Ausdrücken – steht auf Wunsch auf einer eigenen Seite. */
export const isPhraseSheet = (block: WsBlock): boolean => block.type === 'phrases'

/** Bausteine, neben denen etwas stehen darf. */
const NIMMT_SEITE = ['text', 'task', 'infoBox']

/**
 * Steht dieser Baustein seitlich – und auf welcher Seite?
 *
 * Bilder standen bisher immer rechts, und zwar automatisch nach ihrer Rolle. Die Lehrkraft
 * kann das jetzt je Baustein festlegen, und auch Tabellen dürfen daneben stehen: Eine
 * Notizen- oder Datentabelle neben den Schreiblinien spart eine halbe Seite.
 */
export function seiteVon(b: WsBlock): 'left' | 'right' | undefined {
  if (b.type !== 'image' && b.type !== 'table') return undefined
  // Frei gezogen schlägt „daneben": Wer ihn weggezogen hat, will ihn nicht neben der Aufgabe
  if (b.free) return undefined
  if (b.side === 'none') return undefined
  if (b.type === 'image') {
    // Bildreihen nie: Ihre Einzelbilder brauchen die volle Breite nebeneinander
    if (b.items?.length) return undefined
    if (b.side) return b.side
    return b.role === 'illustration' || b.role === 'motivation' ? 'right' : undefined
  }
  return b.side
}

/** Frei platzierte Bausteine gehören nicht in den Fluss – sie stehen auf ihrer Seite fest. */
export const istFrei = (b: WsBlock): boolean => Boolean(b.free)

/**
 * Reihenfolge der Bausteine, mit den seitlich stehenden schon zugeordnet.
 *
 * `mitFreien` ist für den Word-Export: Word setzt die Seiten selbst und kennt unsere
 * Seitennummern nicht – eine freie Lage ließe sich dort nicht wiedergeben. Statt den
 * Baustein zu verlieren, steht er in der Word-Datei im Fluss an seiner Listenstelle.
 * Bildschirm, PDF und Druck zeigen ihn an der gezogenen Stelle.
 */
export function blockLayout(blocks: WsBlock[], ownPhrasePage = false, mitFreien = false): { block: WsBlock; side?: WsBlock; sideAt?: 'left' | 'right' }[] {
  const out: { block: WsBlock; side?: WsBlock; sideAt?: 'left' | 'right' }[] = []
  blocks = blocks.filter((b) => !isHelpCard(b) && !(ownPhrasePage && isPhraseSheet(b)) && (mitFreien || !istFrei(b)))
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const next = blocks[i + 1]
    const sideAt = seiteVon(b)
    if (sideAt && next && NIMMT_SEITE.includes(next.type)) {
      out.push({ block: next, side: b, sideAt })
      i++
      continue
    }
    out.push({ block: b })
  }
  return out
}

/** Seiten eines Blattes nach berechneter Aufteilung. */
export function SheetPages({
  ws,
  sheet,
  plans,
  info,
  context,
  wrapBlock
}: {
  ws: Worksheet
  sheet: Sheet
  plans?: PagePlan[]
  info: PageInfo
  context: WsContextValue
  wrapBlock?: (block: WsBlock, placed: PlacedItem, content: React.ReactNode) => React.ReactNode
}): React.JSX.Element {
  const ownPhrasePage = phraseSheetModus(ws.meta) === 'blatt'
  const pages = plans && plans.length ? plans : fallbackPlan(sheet, ownPhrasePage)
  const byId = new Map(sheet.blocks.map((b) => [b.id, b]))
  const sides = new Map(
    blockLayout(sheet.blocks, ownPhrasePage)
      .filter((e) => e.side)
      .map((e) => [e.block.id, { block: e.side!, at: e.sideAt ?? 'right' }])
  )
  void ws
  // Schlussseiten: Hilfekarten und Bildnachweise stehen nicht zwischen den Aufgaben.
  // Im Lösungsteil entfallen beide – dort helfen sie niemandem.
  const isKey = isKeyMode(context.mode)
  // Von Hand auf die Seite gezogene Bausteine – sie stehen außerhalb des Flusses
  const freie = sheet.blocks.filter(istFrei)
  const helpCards = isKey ? [] : sheet.blocks.filter(isHelpCard)
  // Hilfsblatt „nützliche Ausdrücke": auf Wunsch eine eigene Seite statt zwischen den Aufgaben.
  // Es gehört den Lernenden und steht deshalb auch im Lösungsteil nicht – dort hilft es niemandem.
  const phraseSheet = !isKey && ownPhrasePage ? sheet.blocks.filter(isPhraseSheet) : []
  const credits = isKey ? [] : imageCredits(sheet, info.citationStyle)
  // Notenschlüssel und Fehlerprofil gehören zur Lehrkraft, nicht aufs Schülerblatt
  const scaleGroups = isKey ? (ws.meta.gradeScale?.groups ?? []).filter((g) => g.points > 0) : []
  const errorRows = isKey ? errorProfileRows(sheet) : []
  const hasTeacherPage = scaleGroups.length > 0 || errorRows.length > 0
  const extraPages = (helpCards.length ? 1 : 0) + (credits.length ? 1 : 0) + (hasTeacherPage ? 1 : 0) + (phraseSheet.length ? 1 : 0)
  const total = pages.length + extraPages
  return (
    <WsContext.Provider value={context}>
      {pages.map((page, i) => (
        <PageFrame key={i} info={info} page={i + 1} pages={total}>
          {/*
            Frei platzierte Bausteine liegen ÜBER dem Fluss, auf ihrer eigenen Seite.
            Zuerst gezeichnet, damit der fließende Inhalt sie bei gleicher Lage überdeckt –
            ein versehentlich abgelegter Baustein verdeckt so nicht die Aufgabenstellung.
            Gibt es die gemerkte Seite nicht mehr, rutscht er auf die letzte.
          */}
          {freie
            .filter((b) => Math.min(b.free!.page, pages.length) === i + 1)
            .map((b) => {
              const inhalt = <BlockView block={b} />
              const box = (
                <div
                  className="ws-free"
                  style={{
                    left: `${b.free!.x}%`,
                    top: `${b.free!.y}%`,
                    width: `${b.free!.width}%`
                  }}
                  data-free-block={b.id}
                >
                  {wrapBlock ? wrapBlock(b, { id: b.id }, inhalt) : inhalt}
                </div>
              )
              return <div key={`frei-${b.id}`}>{box}</div>
            })}
          {page.items.map((placed) => {
            const block = byId.get(placed.id)
            if (!block) return null
            const side = placed.continued ? undefined : sides.get(placed.id)
            const content = (
              <>
                {side && (
                  <div className={`ws-side-image ${side.at === 'left' ? 'ws-side-left' : ''}`}>
                    {/*
                      Auch der seitlich stehende Baustein braucht seinen eigenen Griff – sonst
                      ließe sich ausgerechnet das Bild bzw. die Tabelle neben der Aufgabe als
                      Einziges nicht anfassen.
                    */}
                    {wrapBlock ? wrapBlock(side.block, { id: side.block.id }, <BlockView block={side.block} />) : <BlockView block={side.block} />}
                  </div>
                )}
                <BlockView block={block} placed={placed} />
              </>
            )
            return wrapBlock ? (
              <div key={`${placed.id}-${placed.from ?? 0}`}>{wrapBlock(block, placed, content)}</div>
            ) : (
              <div key={`${placed.id}-${placed.from ?? 0}`} className="ws-flow">
                {content}
              </div>
            )
          })}
        </PageFrame>
      ))}
      {phraseSheet.length > 0 && (
        <PageFrame info={info} page={pages.length + 1} pages={total}>
          <div className="ws-phrases-page">
            {phraseSheet.map((block) => (
              <BlockView key={block.id} block={block} />
            ))}
          </div>
        </PageFrame>
      )}
      {helpCards.length > 0 && (
        <PageFrame info={info} page={pages.length + 1} pages={total}>
          <div className="ws-helpcards-page">
            <h2>Tipp- und Hilfekarten</h2>
            <p className="ws-helpcards-hint">Nimm eine Karte erst, wenn du allein nicht weiterkommst – und immer nur die nächste.</p>
            {helpCards.map((block) => (
              <BlockView key={block.id} block={block} />
            ))}
          </div>
        </PageFrame>
      )}
      {hasTeacherPage && (
        <PageFrame info={info} page={pages.length + 1} pages={total}>
          <div className="ws-teacher-page">
            {scaleGroups.length > 0 && (
              <>
                <h2>Notenschlüssel</h2>
                {scaleGroups.map((group, gi) => (
                  <div key={gi} className="ws-gradescale">
                    {group.label && <div className="ws-gradescale-title">{group.label}</div>}
                    <table>
                      <thead>
                        <tr>
                          <th>Note</th>
                          <th>Punkte</th>
                          <th>Anteil</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gradeScaleRows(group.points, ws.meta.gradeScale?.thresholds).map((row) => (
                          <tr key={row.grade}>
                            <td>{row.grade}</td>
                            <td>{row.range}</td>
                            <td>{row.percent}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="ws-gradescale-note">{group.points} Punkte insgesamt · gerundet wird ab ,5 aufwärts</div>
                  </div>
                ))}
              </>
            )}
            {errorRows.length > 0 && (
              <>
                <h2>Fehlerprofil</h2>
                <p className="ws-teacher-hint">
                  Jede Aufgabe zielt auf eine bekannte Stolperstelle. Tragen Sie ein, wie viele Lernende sie getroffen haben – das zeigt, woran als Nächstes zu
                  arbeiten ist.
                </p>
                <table className="ws-errorprofile">
                  <thead>
                    <tr>
                      <th>Form</th>
                      <th>Typischer Fehler</th>
                      <th>Aufgabe</th>
                      <th>Anzahl</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorRows.map((row, i) => (
                      <tr key={i}>
                        <td>{row.topicLabel}</td>
                        <td>{row.error}</td>
                        <td>{row.tasks.join(', ')}</td>
                        <td className="ws-errorprofile-blank" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </PageFrame>
      )}
      {credits.length > 0 && (
        <PageFrame info={info} page={total} pages={total}>
          <div className="ws-credits-page">
            <h2>Bildnachweise</h2>
            <ul>
              {credits.map((c, i) => (
                <li key={i}>
                  <b>{c.label}</b>
                  {c.credit ? `: ${c.credit}` : ''}
                </li>
              ))}
            </ul>
          </div>
        </PageFrame>
      )}
    </WsContext.Provider>
  )
}

/** Alle Bildnachweise eines Blattes, in der Reihenfolge der Bausteine. */
/**
 * Bildnachweise der Schlussseite.
 *
 * Liegen die Einzelangaben vor, entsteht der Nachweis im eingestellten Zitierstil – mit
 * Adresse der Fundstelle, sodass sich die Quelle nachprüfen lässt. Ältere Blätter haben nur
 * den fertigen Text; der bleibt dann unverändert stehen.
 */
/**
 * Zeilen des Fehlerprofils: je Stolperstelle die Aufgaben, die darauf zielen.
 * Grundlage sind die Angaben, die der Grammatiktest an den Aufgaben hinterlegt.
 */
const grammarTopicById = (id: string) => GRAMMAR_TOPICS.find((t) => t.id === id)

export function errorProfileRows(sheet: Sheet): { topicLabel: string; error: string; tasks: number[] }[] {
  const numbers = taskNumbersFor(sheet)
  const rows = new Map<string, { topicLabel: string; error: string; tasks: number[] }>()
  for (const b of sheet.blocks) {
    if (b.type !== 'task' || !b.grammar?.error) continue
    const topic = grammarTopicById(b.grammar.topicId)
    const key = `${b.grammar.topicId}|${b.grammar.error}`
    const row = rows.get(key) ?? {
      topicLabel: topic?.label ?? b.grammar.topicId,
      error: b.grammar.error,
      tasks: []
    }
    const n = numbers.get(b.id)
    if (n !== undefined) row.tasks.push(n)
    rows.set(key, row)
  }
  return [...rows.values()]
}

export function imageCredits(sheet: Sheet, style: CitationStyle = DEFAULT_CITATION_STYLE): { label: string; credit: string }[] {
  const out: { label: string; credit: string }[] = []
  let n = 0
  for (const block of sheet.blocks) {
    if (block.type !== 'image') continue
    const items = block.items?.length ? block.items : [{ image: block.image, caption: block.caption }]
    for (const item of items) {
      const citation = item.image?.citation
      const credit = citation ? formatCitation(citation, style) : item.image?.credit?.trim()
      if (!credit) continue
      n++
      out.push({
        label: `Bild ${n}${item.caption?.trim() ? ` – ${item.caption.trim()}` : ''}`,
        credit
      })
    }
  }
  return out
}

/**
 * Misst alle Blätter (Schülerfassung und Lösungen) in einem unsichtbaren Bereich
 * und berechnet daraus die Seitenaufteilung.
 */
/** Hoehe einer Schreiblinie in px bei 96 dpi (CSS: 8.5mm) */
const LINIEN_HOEHE = (8.5 * 96) / 25.4

/**
 * Den Rest der letzten Seite mit Schreiblinien fuellen.
 *
 * Nur dort, wo eine SCHREIBAUFGABE die Seite beschliesst: Ihre Linienzahl folgt der
 * geforderten Woerterzahl, und die ist auf den unteren Niveaustufen kleiner – dort blieb der
 * untere Teil des Blattes leer, waehrend das erweiterte Niveau eine volle Seite bekam
 * (gemeldet 24.09.2026). Mehr Platz zum Schreiben schadet nie; die geforderte Laenge steht
 * ohnehin in der Aufgabe.
 *
 * Bewusst NICHT angefasst: Seiten, auf denen noch etwas folgt, und alles ausser Schreiblinien.
 */
function linienAuffuellen(plaene: PagePlan[], items: MeasuredItem[], sheet: Sheet, ersteHoehe: number, weitereHoehe: number): PagePlan[] {
  const hoehen = new Map(items.map((i) => [i.id, i]))
  const blockVon = new Map(sheet.blocks.map((b) => [b.id, b]))
  return plaene.map((plan, seite) => {
    const letzte = plan.items[plan.items.length - 1]
    /*
     * AUF JEDER Seite, auf der der Schreibbereich endet – nicht nur auf der letzten.
     *
     * Gemeldet von der Lehrkraft (24.09.2026): „einmal linien für die aufgabe und einmal ein
     * neuer linierter bereich für das writing". Tatsächlich war es EIN Schreibbereich, den
     * der Seitenumbruch zerrissen hatte: unten auf Seite 1 ein Stück, oben auf Seite 2 der
     * Rest – und darunter zwei Drittel leeres Papier, weil das Folgende (Hilfsblatt,
     * Hilfekarten) ohnehin eine eigene Seite bekommt. Zwei getrennte Blöcke mit einer großen
     * Lücke dazwischen liest sich wie zwei Aufgaben.
     *
     * Endet der Schreibbereich auf einer Seite, war für alles Weitere ohnehin kein Platz
     * mehr – die Fläche gehört also den Lernenden.
     */
    if (!letzte) return plan
    const block = blockVon.get(letzte.id)
    const mass = hoehen.get(letzte.id)
    // Nur eine Schreibaufgabe mit Linien, und nur ihr LETZTES Stueck
    const schreibt = block?.type === 'task' && block.answer.kind === 'lines' && !block.parts.length
    if (!schreibt || !mass || (letzte.to ?? 0) < (mass.units?.length ?? 0)) return plan
    const genutzt = plan.items.reduce((summe, it) => {
      const m = hoehen.get(it.id)
      if (!m) return summe
      if (!m.units) return summe + m.height
      const von = it.from ?? 0
      const bis = it.to ?? m.units.length
      // Auf einem Folgestück zählt der Fortsetzungshinweis mit – sonst fällt die Auffüllung zu groß aus
      return summe + (von === 0 ? (m.headHeight ?? 0) : (m.continuedHead ?? 0)) + m.units.slice(von, bis).reduce((a, b) => a + b, 0)
    }, 0)
    const rest = (seite === 0 ? ersteHoehe : weitereHoehe) - genutzt
    // Ein Drittel Zeilenhöhe Reserve gegen Rundung – lieber eine Linie weniger als Überlauf
    const zusaetzlich = Math.floor((rest - LINIEN_HOEHE / 3) / LINIEN_HOEHE)
    if (zusaetzlich < 1) return plan
    return {
      ...plan,
      items: plan.items.map((it) => (it === letzte ? { ...it, fillLines: zusaetzlich } : it))
    }
  })
}

export function useSheetLayouts(ws: Worksheet | null, logo: string | null, schoolName: string): { layouts: Map<string, PagePlan[]>; measure: React.ReactNode } {
  const ref = useRef<HTMLDivElement>(null)
  const [layouts, setLayouts] = useState<Map<string, PagePlan[]>>(new Map())
  const [tick, setTick] = useState(0)

  const variants = useMemo(() => (ws ? ws.sheets.flatMap((s) => [false, true].map((key) => ({ sheet: s, key }))) : []), [ws])

  useLayoutEffect(() => {
    const root = ref.current
    if (!root || !ws) return
    const next = new Map<string, PagePlan[]>()
    for (const { sheet, key } of variants) {
      const el = root.querySelector<HTMLElement>(`[data-layout="${layoutKey(sheet.id, key)}"]`)
      if (!el) continue
      const bodies = el.querySelectorAll<HTMLElement>('.ws-page .ws-body')
      const available = (body?: HTMLElement): number => {
        if (!body) return 1000
        const pad = parseFloat(getComputedStyle(body).paddingTop) || 0
        return body.getBoundingClientRect().height - pad
      }
      const firstHeight = available(bodies[0])
      const otherHeight = available(bodies[1])
      const fontPx = parseFloat(getComputedStyle(el.querySelector<HTMLElement>('.ws-page')!).fontSize) || 16
      /*
       * Der Hinweis „Aufgabe N (Fortsetzung)" steht auf jedem Folgestück einer geteilten
       * Aufgabe. Er gehört zu keiner Einheit – ohne diese Messung fehlte seine Höhe in der
       * Rechnung, und jede Folgeseite lief um genau so viel über den Rand.
       */
      const fortsetzungKopf = el.querySelector<HTMLElement>('[data-continued-probe]')?.getBoundingClientRect().height ?? 0
      const items: MeasuredItem[] = []
      el.querySelectorAll<HTMLElement>('[data-measure-block]').forEach((wrap) => {
        const id = wrap.dataset.measureBlock!
        const height = wrap.getBoundingClientRect().height
        const block = sheet.blocks.find((b) => b.id === id)
        const unitEls = Array.from(wrap.querySelectorAll<HTMLElement>('[data-unit]'))
        const splittable = (block?.type === 'text' || block?.type === 'table' || block?.type === 'task') && unitEls.length > 1
        if (splittable) {
          const units = unitEls.map((u) => u.getBoundingClientRect().height)
          const unitSum = units.reduce((a, b) => a + b, 0)
          items.push({
            id,
            height,
            headHeight: Math.max(0, height - unitSum),
            units,
            // Zeilennummern zählen nur den Materialtext, nicht die Worterklärungen darunter
            unitLines:
              block?.type === 'text' && block.lineNumbers
                ? unitEls.map((u, k) => (u.classList.contains('ws-glossary') ? 0 : Math.max(1, Math.round(units[k] / (fontPx * 1.5)))))
                : undefined,
            keepTogether: true,
            pageBreakBefore: block?.pageBreakBefore,
            continuedHead: block?.type === 'task' ? fortsetzungKopf : 0
          })
        } else {
          items.push({
            id,
            height,
            keepWithNext: block?.type === 'divider',
            pageBreakBefore: block?.pageBreakBefore
          })
        }
      })
      next.set(layoutKey(sheet.id, key), linienAuffuellen(paginate(items, firstHeight, otherHeight), items, sheet, firstHeight, otherHeight))
    }
    setLayouts(next)
  }, [ws, variants, logo, schoolName, tick])

  const measure =
    ws && variants.length ? (
      <div className="ws-measure" ref={ref} onLoadCapture={() => setTick((t) => t + 1)} aria-hidden>
        {variants.map(({ sheet, key }) => {
          const info = pageInfoFor(ws, sheet, logo, schoolName, key)
          const ctx = contextFor(ws, sheet, key ? 'key' : 'measure')
          return (
            <div key={layoutKey(sheet.id, key)} data-layout={layoutKey(sheet.id, key)}>
              <WsContext.Provider value={ctx}>
                {/* Einmal je Blatt gemessen: die Höhe des Fortsetzungshinweises */}
                <div className="ws-page">
                  <div className="ws-task">
                    <div className="ws-task-continued" data-continued-probe>
                      Aufgabe 1 (Fortsetzung)
                    </div>
                  </div>
                </div>
                <PageFrame info={info} page={1} pages={2} />
                <PageFrame info={info} page={2} pages={2}>
                  {/* Inhalt in voller Breite der Inhaltsfläche messen */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
                    {blockLayout(sheet.blocks, ws.meta.phraseSheet === 'blatt').map(({ block, side, sideAt }) => (
                      <div key={block.id} data-measure-block={block.id} style={{ display: 'flow-root' }}>
                        {side && (
                          <div className={`ws-side-image ${sideAt === 'left' ? 'ws-side-left' : ''}`}>
                            <BlockView block={side} />
                          </div>
                        )}
                        <BlockView block={block} />
                      </div>
                    ))}
                  </div>
                </PageFrame>
              </WsContext.Provider>
            </div>
          )
        })}
      </div>
    ) : null

  return { layouts, measure }
}

/**
 * Blocksatz für längere Texte: Standard an, aber nie bei Einfacher/Leichter Sprache oder DaZ-Anfängern
 * und nicht in Designvorlagen, die ausdrücklich linksbündig setzen.
 */
export function justifyText(ws: Pick<Worksheet, 'design' | 'meta'>): boolean {
  if (ws.design.page.justifyText === false) return false
  return !needsLargeType(ws.meta.languageMode)
}
