import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { hoerablaufFuer, hoerStufe } from '../didactics/hoerablauf'
import { needsLargeType } from '../didactics/language'
import { buildLearnerProfile, LearnerProfile } from '../didactics/profile'
import type { Sheet, TextBlock, Worksheet, WorksheetMeta, WsBlock } from '../model/types'
import { BlockView, SeitenFussnoten } from './BlockView'
import { subjectById } from '../model/subjects'
import { contentInsets, PageFrame, PageInfo } from './PageFrame'
import { MeasuredItem, notenHoehe, PagePlan, paginate, PlacedItem } from './paginate'
import { WsContext, WsContextValue, WsMode, isKeyMode } from './WsContext'
import { DEFAULT_CITATION_STYLE, formatCitation } from '../../../shared/citation'
import type { CitationStyle } from '@shared/types'
import { canaryText, canaryWordFor, canaryWords } from '../../../shared/aiCanary'
import { gradeScaleRows } from '../../../shared/gradeScale'
import { punkteZeilen } from '../../../shared/notenpunkte'
import { GRAMMAR_TOPICS } from '../didactics/grammar'
import { phraseSheetModus } from '../generation/prompts'
import { zeigtUebersetzung } from '../didactics/phraseRules'
import { anredeFuerMeta, anweisungenDeutsch } from '../didactics/anrede'
import { anredeText } from '../../../shared/anrede'
import { druckDesign } from '../../../shared/fachfarben'
import { boardList } from '../didactics/boardDesign'
import { seitenSchluessel, type SeitenKandidat } from './deckblatt'
import { isMaterial, loeseMaterialverweise, materialNummern, verschluesseleBaustein } from '../didactics/integrity'
import { ueberlaufUnten } from './seitenUeberlauf'
import { anmerkungenJeAbsatz, anmerkungenImStueck, anmerkungsArt, anmerkungenVon, type Anmerkung } from '../didactics/anmerkungen'
import { aufAbsaetze, zeilenBaender, zeilenEinheiten, zeilenSchnitte, type AbsatzMessung, type Streifen, type ZeilenStelle } from './zeilenTeilung'
import { linieMmFuerMeta, schreibRegelFuerMeta } from '../didactics/schreibraum'

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
  // Die Fachfarbe ersetzt die Akzentfarbe der Vorlage (Paket 10a) – hier für Vorschau, Druck und Word zugleich
  const design = druckDesign(ws)
  return {
    // Ein Blatt mit eigener Kopfzeile (Fassung B, C …) überschreibt die des Dokuments
    design: sheet.kopfzeile === undefined ? design : { ...design, header: { ...design.header, customText: sheet.kopfzeile } },
    meta: ws.meta,
    logo: school ? logo : null,
    schoolName: school ? schoolName : '',
    fontPt: auto ? profile.typography.fontPt : ws.design.page.baseFontPt,
    lineHeight: ws.design.page.lineHeight ?? (auto ? profile.typography.lineHeight : 1.35),
    isKey,
    language: ws.meta.labelLanguage ?? 'de',
    levelMark: ws.meta.showLevelMarks !== false && ws.sheets.length > 1 && sheet.stars ? '★'.repeat(sheet.stars) : undefined,
    citationStyle,
    // Für dasselbe Blatt immer dasselbe Wort, damit die Lehrkraft weiß, wonach sie sucht; bei Fremdsprachen zweisprachig
    canary: ws.meta.aiCanary
      ? canaryText(canaryWords(ws.meta.aiCanaryWords, canaryWordFor(`${ws.meta.title}|${ws.meta.topic}`)), subjectById(ws.meta.subjectId).foreignLanguage)
      : undefined
  }
}

/** Bausteine, die als Material gelten und eine Nummer bekommen – dieselbe Regel wie in der Prüfung (didactics/integrity.ts) */
export { isMaterial }

/**
 * Materialnummern vergibt die App, nicht die KI: fortlaufend M1, M2 … in der Reihenfolge
 * der Bausteine. Vorher schrieb die KI die Nummern frei in die Überschrift – so konnte eine
 * Aufgabe auf ein „M5" verweisen, das es gar nicht gab.
 */
export function materialNumbersFor(sheet: Sheet): Map<string, string> {
  // Eine Zählung für Darstellung und Prüfung – sonst meldet die Prüfung Nummern, die das Blatt anders zeigt
  return materialNummern(sheet.blocks)
}

const anzeigen = new WeakMap<Sheet, Sheet>()

/**
 * Das Blatt, wie es dargestellt wird: gespeicherte Verweise „M{zeitleiste}" werden zu der
 * Nummer, die das Material nach der AKTUELLEN Reihenfolge trägt (27.09.2026). Verschiebt die
 * Lehrkraft M2 vor M1, heißt es auf dem Blatt M1 – und jede Aufgabe, die es nennt, sagt M1.
 * Je Blattobjekt einmal berechnet; ohne Verweise ist es dasselbe Objekt.
 */
export function zurAnzeige(sheet: Sheet): Sheet {
  const bekannt = anzeigen.get(sheet)
  if (bekannt) return bekannt
  const blocks = loeseMaterialverweise(sheet.blocks)
  const anzeige = blocks === sheet.blocks ? sheet : { ...sheet, blocks }
  anzeigen.set(sheet, anzeige)
  return anzeige
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
  const update = extra.update
  return {
    mode,
    contentWidthMm: 210 - insets.left - insets.right,
    // Schreiblinien und Ausfüllzellen nach Jahrgang (02.10.2026) – dieselbe Regel wie `--ws-linie` in PageFrame
    schreibRegel: schreibRegelFuerMeta(ws.meta),
    taskNumbers: taskNumbersFor(sheet),
    materialNumbers: materialNumbersFor(sheet),
    phaseStarts: viewingPhaseStarts(sheet),
    showTimecodes: Boolean(ws.meta.video?.timecodesOnSheet),
    showStars: ws.meta.showLevelMarks !== false && ws.meta.differentiation.levels > 1 && ws.meta.differentiation.mode === 'combined',
    sheetStars: sheet.stars,
    correctionMargin: ws.meta.correctionMargin,
    ohneSchreibhilfen: Boolean(ws.meta.ohneSchreibhilfen),
    ohneLernhilfen: ws.meta.lernhilfen === false,
    notesMargin: ws.meta.notesMargin,
    anmerkungsArt: anmerkungsArt(ws.meta),
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
    labelLanguage: ws.meta.labelLanguage,
    anrede: anredeFuerMeta(ws.meta),
    // Textauswahl-Menü (01.10.2026): nur Fach, Jahrgang, Schulform, Thema – keine Personendaten
    lerngruppeText: {
      fach: ws.meta.subjectLabel,
      fachId: ws.meta.subjectId,
      jahrgang: ws.meta.grade,
      schulform: ws.meta.schoolTypeName,
      thema: ws.meta.topic,
      zielsprache: subjectById(ws.meta.subjectId).foreignLanguage,
      cefr: ws.meta.cefrLevel,
      anrede: anredeFuerMeta(ws.meta) === 'sie' ? 'sie' : 'du',
      aufgabenSprache: anweisungenDeutsch(ws.meta) ? 'de' : (subjectById(ws.meta.subjectId).foreignLanguage ?? 'de')
    },
    blattBausteine: sheet.blocks,
    // Ablauf des Hörteils nach Land und Stufe (01.10.2026) – Bearbeitungszeit im Lehrkraft-Teil
    hoerablauf: hoerablaufFuer(ws.meta.stateId, hoerStufe(ws.meta.grade)),
    ...extra,
    // Getippte Nummern („M3") werden beim Speichern zur Kennung des Materials, das jetzt so heißt – so wandern sie beim Verschieben mit
    ...(update
      ? {
          update: (blockId: string, fn: (draft: WsBlock) => void) =>
            update(blockId, (draft) => {
              fn(draft)
              verschluesseleBaustein(draft, sheet.blocks)
            })
        }
      : {})
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
  sheet: gespeichert,
  plans,
  info,
  context,
  wrapBlock,
  nurSeite
}: {
  ws: Worksheet
  sheet: Sheet
  plans?: PagePlan[]
  info: PageInfo
  context: WsContextValue
  wrapBlock?: (block: WsBlock, placed: PlacedItem, content: React.ReactNode) => React.ReactNode
  /**
   * Nur diese eine Seite zeigen (0-basiert, Schlussseiten mitgezählt) – für die Vorschauen auf
   * dem Deckblatt (Paket 11). Seitenzahlen und Kopf bleiben die des ganzen Blattes.
   */
  nurSeite?: number
}): React.JSX.Element {
  // Dargestellt wird die Fassung mit aufgelösten Materialverweisen (siehe `zurAnzeige`)
  const sheet = zurAnzeige(gespeichert)
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
  // Reihenfolge wie `zusatzSeiten` – die Deckblattwahl zählt dieselben Seiten
  const zusatz: ZusatzSeite[] = [
    ...(phraseSheet.length ? ['hilfsblatt' as const] : []),
    ...(helpCards.length ? ['hilfekarten' as const] : []),
    ...(hasTeacherPage ? ['lehrkraft' as const] : []),
    ...(credits.length ? ['nachweise' as const] : [])
  ]
  const total = pages.length + zusatz.length
  // Seitenzahl einer Schlussseite; bis Paket 11 trugen alle Schlussseiten dieselbe Nummer
  const nr = (art: ZusatzSeite): number => pages.length + zusatz.indexOf(art) + 1
  const zeige = (seite: number): boolean => nurSeite === undefined || nurSeite === seite - 1
  return (
    <WsContext.Provider value={context}>
      {pages.map(
        (page, i) =>
          zeige(i + 1) && (
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
                // `data-fluss`: Stücke im Satz – Ziel beim Verschieben im Fluss (BausteinRahmen `imFluss`)
                return wrapBlock ? (
                  <div key={`${placed.id}-${placed.from ?? 0}`} data-fluss={placed.id} data-fortsetzung={placed.continued ? '' : undefined}>
                    {wrapBlock(block, placed, content)}
                  </div>
                ) : (
                  <div key={`${placed.id}-${placed.from ?? 0}`} className="ws-flow">
                    {content}
                  </div>
                )
              })}
              {/* Fußnoten dieser Seite (Blattoptionen „Fußnoten", 01.10.2026) – nur die Anmerkungen der Wörter auf ihr */}
              {context.anmerkungsArt === 'fussnoten' && <SeitenFussnoten gruppen={fussnotenDerSeite(page, byId)} />}
            </PageFrame>
          )
      )}
      {phraseSheet.length > 0 && zeige(nr('hilfsblatt')) && (
        <PageFrame info={info} page={nr('hilfsblatt')} pages={total}>
          <div className="ws-phrases-page">
            {phraseSheet.map((block) => (
              <div key={block.id}>{wrapBlock ? wrapBlock(block, { id: block.id }, <BlockView block={block} />) : <BlockView block={block} />}</div>
            ))}
          </div>
        </PageFrame>
      )}
      {helpCards.length > 0 && zeige(nr('hilfekarten')) && (
        <PageFrame info={info} page={nr('hilfekarten')} pages={total}>
          <div className="ws-helpcards-page">
            <h2>Tipp- und Hilfekarten</h2>
            <p className="ws-helpcards-hint">{anredeText('hilfekarten', anredeFuerMeta(ws.meta))}</p>
            {/*
              Auch die ausgelagerten Karten bekommen den Bausteinrahmen (26.09.2026): Vorher
              standen sie ohne Werkzeugleiste – nicht mit KI zu überarbeiten, nicht neu zu
              erzeugen, nicht zu löschen (Befund der Lehrkraft).
            */}
            {helpCards.map((block) => (
              <div key={block.id}>{wrapBlock ? wrapBlock(block, { id: block.id }, <BlockView block={block} />) : <BlockView block={block} />}</div>
            ))}
          </div>
        </PageFrame>
      )}
      {hasTeacherPage && zeige(nr('lehrkraft')) && (
        <PageFrame info={info} page={nr('lehrkraft')} pages={total}>
          <div className="ws-teacher-page">
            {scaleGroups.length > 0 && (
              <>
                <h2>Notenschlüssel</h2>
                {scaleGroups.map((group, gi) => (
                  <div key={gi} className="ws-gradescale">
                    {group.label && <div className="ws-gradescale-title">{group.label}</div>}
                    {ws.meta.gradeScale?.punkte ? (
                      /* Sekundarstufe II: Notenpunkte 0–15 (26.09.2026, shared/notenpunkte.ts) */
                      <>
                        <table>
                          <thead>
                            <tr>
                              <th>Notenpunkte</th>
                              <th>Note</th>
                              <th>Punkte</th>
                              <th>Anteil</th>
                            </tr>
                          </thead>
                          <tbody>
                            {punkteZeilen(group.points, ws.meta.gradeScale.punkte.schwellen).map((row) => (
                              <tr key={row.punkte}>
                                <td>{row.punkte}</td>
                                <td>{row.note}</td>
                                <td>{row.range}</td>
                                <td>{row.percent}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="ws-gradescale-note">
                          {group.points} Punkte insgesamt · Punktgrenze = kleinste Punktzahl, die den Prozentsatz erreicht · {ws.meta.gradeScale.punkte.hinweis}
                        </div>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                ))}
              </>
            )}
            {errorRows.length > 0 && (
              <>
                <h2>Fehlerprofil</h2>
                <p className="ws-teacher-hint">
                  Jede Aufgabe zielt auf eine bekannte Stolperstelle. In die Spalte „Anzahl“ gehört, wie viele Lernende sie getroffen haben – das zeigt, woran
                  als Nächstes zu arbeiten ist.
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
      {credits.length > 0 && zeige(nr('nachweise')) && (
        <PageFrame info={info} page={nr('nachweise')} pages={total}>
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

/**
 * Die Fußnoten einer Seite: je Material im Fluss die Anmerkungen, deren Wort im Stück auf dieser
 * Seite steht (Anmerkungen ohne Stelle im Text beim letzten Stück). Frei gezogene Materialien
 * behalten ihre Liste am Ende des Materials.
 */
export function fussnotenDerSeite(page: PagePlan, byId: Map<string, WsBlock>): { block: TextBlock; anmerkungen: Anmerkung[] }[] {
  const aus: { block: TextBlock; anmerkungen: Anmerkung[] }[] = []
  for (const placed of page.items) {
    const block = byId.get(placed.id)
    if (block?.type !== 'text' || block.free) continue
    // Zeilenweise geteilt (02.10.2026): Das Stück weiß selbst, welche Ziffern auf ihm stehen
    const anmerkungen = placed.noten
      ? anmerkungenVon(block).anmerkungen.filter((a) => placed.noten!.includes(a.nr))
      : anmerkungenImStueck(block, placed.from ?? 0, placed.to ?? Infinity)
    if (anmerkungen.length) aus.push({ block, anmerkungen })
  }
  return aus
}

export type ZusatzSeite = 'hilfsblatt' | 'hilfekarten' | 'lehrkraft' | 'nachweise'

/** Die Schlussseiten eines Blattes in der Reihenfolge, in der `SheetPages` sie setzt. */
export function zusatzSeiten(ws: Worksheet, sheet: Sheet, isKey: boolean): ZusatzSeite[] {
  const aus: ZusatzSeite[] = []
  if (!isKey && phraseSheetModus(ws.meta) === 'blatt' && sheet.blocks.some(isPhraseSheet)) aus.push('hilfsblatt')
  if (!isKey && sheet.blocks.some(isHelpCard)) aus.push('hilfekarten')
  if (isKey && ((ws.meta.gradeScale?.groups ?? []).some((g) => g.points > 0) || errorProfileRows(sheet).length > 0)) aus.push('lehrkraft')
  if (!isKey && imageCredits(sheet).length > 0) aus.push('nachweise')
  return aus
}

const ZUSATZ_TITEL: Record<ZusatzSeite, string> = {
  hilfsblatt: 'Hilfsblatt',
  hilfekarten: 'Hilfekarten',
  lehrkraft: 'Notenschlüssel',
  nachweise: 'Bildnachweise'
}

/**
 * Alle Seiten, die auf dem Deckblatt erscheinen können (Paket 11): Seiten jedes Blattes samt
 * Schlussseiten, die Lösungsseiten und das Tafelbild – in der Reihenfolge des Materials.
 * `layouts` ist die gemessene Seitenaufteilung; ohne sie zählt jedes Blatt eine Seite.
 */
export function deckblattKandidaten(ws: Worksheet, layouts: Map<string, PagePlan[]>): SeitenKandidat[] {
  const aus: SeitenKandidat[] = []
  const mehrere = ws.sheets.length > 1
  for (const key of [false, true]) {
    if (key && !ws.meta.answerKey) continue
    for (const sheet of ws.sheets) {
      const n = Math.max(1, layouts.get(layoutKey(sheet.id, key))?.length ?? 1)
      const name = mehrere ? `${sheet.label || 'Blatt'} · ` : ''
      for (let i = 0; i < n; i++)
        aus.push({
          schluessel: seitenSchluessel(sheet.id, key, i),
          art: key ? 'loesung' : 'blatt',
          sheetId: sheet.id,
          key,
          index: i,
          titel: `${name}${key ? 'Lösungen' : 'Seite'} ${i + 1}`
        })
      zusatzSeiten(ws, sheet, key).forEach((art, k) =>
        aus.push({ schluessel: seitenSchluessel(sheet.id, key, n + k), art, sheetId: sheet.id, key, index: n + k, titel: `${name}${ZUSATZ_TITEL[art]}` })
      )
    }
  }
  boardList(ws).forEach((_, i, alle) =>
    aus.push({ schluessel: `tafel:${i}`, art: 'tafel', index: i, titel: alle.length > 1 ? `Tafelbild ${i + 1}` : 'Tafelbild' })
  )
  return aus
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
/**
 * Hoehe einer Schreiblinie in px bei 96 dpi – seit 02.10.2026 nach Jahrgang (CSS `--ws-linie`,
 * gesetzt von PageFrame aus derselben Regel `linieMmFuerMeta`). Weichen beide ab, fuellt die
 * Auffuellung zu viele oder zu wenige Linien.
 */
const linienHoehePx = (meta: WorksheetMeta | undefined): number => (linieMmFuerMeta(meta) * 96) / 25.4

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
function linienAuffuellen(
  plaene: PagePlan[],
  items: MeasuredItem[],
  sheet: Sheet,
  ersteHoehe: number,
  weitereHoehe: number,
  abzug: readonly number[] = [],
  LINIEN_HOEHE = linienHoehePx(undefined)
): PagePlan[] {
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
      // Auf einem Folgestück zählt der Fortsetzungshinweis mit – sonst fällt die Auffüllung zu groß aus; der Fuß nur beim letzten Stück
      return (
        summe +
        (von === 0 ? (m.headHeight ?? 0) : (m.continuedHead ?? 0)) +
        m.units.slice(von, bis).reduce((a, b) => a + b, 0) +
        (bis >= m.units.length ? (m.footHeight ?? 0) : 0)
      )
    }, 0)
    // Fußnoten unten auf dieser Seite (samt Linie) nehmen den Schreiblinien ebenfalls Platz
    const noten = plan.items.reduce((summe, it) => {
      const m = hoehen.get(it.id)
      return m?.noteUnits ? summe + notenHoehe(m, it.from ?? 0, it.to ?? m.noteUnits.length) : summe
    }, 0)
    const linie = noten > 0 ? Math.max(0, ...plan.items.map((it) => hoehen.get(it.id)?.noteRule ?? 0)) : 0
    const rest = (seite === 0 ? ersteHoehe : weitereHoehe) - (abzug[seite] ?? 0) - genutzt - noten - linie
    // Ein Drittel Zeilenhöhe Reserve gegen Rundung – lieber eine Linie weniger als Überlauf
    const zusaetzlich = Math.floor((rest - LINIEN_HOEHE / 3) / LINIEN_HOEHE)
    if (zusaetzlich < 1) return plan
    return {
      ...plan,
      items: plan.items.map((it) => (it === letzte ? { ...it, fillLines: zusaetzlich } : it))
    }
  })
}

/**
 * Bausteine, die über eine Seite hinweg geteilt werden dürfen – an den Einheiten (`data-unit`),
 * die sie selbst ausweisen, und die ein Stück (`PlacedItem.from/to`) darstellen können.
 * Seit 01.10.2026 auch Merkkasten (Absätze), Lernziele und Hilfen (Listenpunkte), die
 * Selbsteinschätzung (Aussagen) und der linierte Schreibraum (Linien). NICHT: die nützlichen
 * Ausdrücke – sie stehen zweispaltig (`column-count`), ein Stück davon ließe sich nicht messen.
 */
const TEILBAR = new Set<WsBlock['type']>(['text', 'table', 'task', 'protocol', 'infoBox', 'learningGoals', 'scaffold', 'selfCheck', 'workspace'])

const KEIN_ABZUG = new Map<string, number[]>()
/** So oft wird nach der Prüfung höchstens neu umbrochen – danach bleibt es beim letzten Stand */
const PRUEF_RUNDEN = 6

/**
 * Höhen der Einheiten eines teilbaren Bausteins – von OBERKANTE zu OBERKANTE (30.09.2026).
 *
 * Vorher zählte nur die Höhe jeder Einheit selbst. Der Abstand ZWISCHEN den Einheiten (Absätze,
 * Tabellenzeilen, Abschnitte eines Protokolls) steckte damit im Kopf des Bausteins und kam nur
 * dem ersten Stück zugute; auf jeder Folgeseite fehlte er in der Rechnung – bei einem langen Text
 * je Absatz ein paar Punkte, zusammen genug, dass die letzte Zeile halb über den Rand ragte.
 * Die letzte Einheit zählt bis zu ihrer Unterkante; was danach kommt, gehört zum Kopf.
 * Liegen Einheiten ineinander oder nebeneinander (Oberkanten nicht aufsteigend), gilt wie
 * früher die eigene Höhe.
 */
function einheitenHoehen(els: HTMLElement[]): number[] {
  const r = els.map((u) => u.getBoundingClientRect())
  const geordnet = r.every((x, i) => i === 0 || x.top >= r[i - 1].bottom - 0.5)
  if (!geordnet) return r.map((x) => x.height)
  return r.map((x, i) => (i < r.length - 1 ? r[i + 1].top - x.top : x.height))
}

/** Elemente, die beim Schneiden zwischen zwei Zeilen nicht zerteilt werden dürfen */
const UNTEILBAR = 'img, svg, canvas, video, iframe, input, textarea, button, .rt-math'

/**
 * ZEILENWEISE TEILUNG (02.10.2026, render/zeilenTeilung.ts): die Einheiten eines Materialtexts
 * Zeile für Zeile gemessen – Zeilen aus den Rechtecken der Textknoten, Schnittstellen dazwischen,
 * die Ziffern der Anmerkungen ihrer Zeile zugeordnet.
 *
 * `teilen = false` (Bild oder Illustration neben dem Text): Dort ist der Text auf dem Folgestück
 * anders breit als beim Messen – Zeilen ließen sich nicht verlässlich ausschneiden. Dann bleibt der
 * Absatz die kleinste Einheit wie bisher.
 */
function textZeilen(block: TextBlock, unitEls: HTMLElement[], teilen: boolean, fontPx: number): { units: number[]; lines: number[]; karte: ZeilenStelle[] } {
  const hoehen = einheitenHoehen(unitEls)
  const je = anmerkungenJeAbsatz(block)
  const messungen: AbsatzMessung[] = unitEls.map((u, k) => {
    const nr = Number(u.dataset.absatz)
    const absatz = u.dataset.absatz !== undefined && Number.isFinite(nr) ? nr : k
    if (u.classList.contains('ws-glossary') || u.dataset.absatz === undefined) return { absatz, hoehe: hoehen[k], schnitte: [], zeilenJe: [0], marken: [] }
    const oben = u.getBoundingClientRect().top
    const rel = (r: DOMRect): Streifen => ({ top: r.top - oben, bottom: r.bottom - oben })
    // Textzeilen: Rechtecke der Textknoten – ohne hochgestellte Ziffern, sie ragen in die Zeile darüber
    const rects: Streifen[] = []
    const range = document.createRange()
    const gang = document.createTreeWalker(u, NodeFilter.SHOW_TEXT)
    for (let n = gang.nextNode(); n; n = gang.nextNode()) {
      if (!n.textContent?.trim() || n.parentElement?.closest('sup, sub')) continue
      range.selectNodeContents(n)
      for (const r of Array.from(range.getClientRects())) rects.push(rel(r))
    }
    const baender = zeilenBaender(rects)
    const zeile = parseFloat(getComputedStyle(u).lineHeight) || fontPx * 1.5
    const geschaetzt = Math.max(1, Math.round(u.getBoundingClientRect().height / zeile))
    // Ziffern der Anmerkungen dieses Absatzes, in Reihenfolge den hochgestellten Zahlen im Text zugeordnet
    const sups = Array.from(u.querySelectorAll('sup'))
    let s = 0
    const marken: AbsatzMessung['marken'] = []
    for (const nrAnm of je.absaetze[absatz] ?? []) {
      while (s < sups.length && sups[s].textContent?.trim() !== String(nrAnm)) s++
      if (s >= sups.length) {
        // Ziffer nicht gefunden: an den Anfang des Absatzes – lieber eine Seite zu früh als zu spät
        marken.push({ nr: nrAnm, mitte: 0 })
        continue
      }
      const r = rel(sups[s].getBoundingClientRect())
      marken.push({ nr: nrAnm, mitte: (r.top + r.bottom) / 2 })
      s++
    }
    if (!teilen || baender.length < 2) return { absatz, hoehe: hoehen[k], schnitte: [], zeilenJe: [baender.length || geschaetzt], marken }
    const hindernisse = Array.from(u.querySelectorAll<HTMLElement>(UNTEILBAR)).flatMap((h) => Array.from(h.getClientRects()).map(rel))
    // Auch Inline-Blöcke (Lücken als Kästchen) dürfen nicht zerschnitten werden
    u.querySelectorAll<HTMLElement>('span, mark, u').forEach((h) => {
      if (getComputedStyle(h).display.startsWith('inline-')) hindernisse.push(...Array.from(h.getClientRects()).map(rel))
    })
    const { schnitte, zeilenJe } = zeilenSchnitte(baender, hindernisse)
    // Die letzte Schnittstelle muss im Absatz liegen – sonst (Messfehler) nicht teilen
    if (schnitte.length && schnitte[schnitte.length - 1] >= hoehen[k]) return { absatz, hoehe: hoehen[k], schnitte: [], zeilenJe: [baender.length], marken }
    return { absatz, hoehe: hoehen[k], schnitte, zeilenJe, marken }
  })
  return zeilenEinheiten(messungen, je.rest)
}

/** Die Stücke zeilenweise gemessener Materialtexte auf Absätze zurückrechnen (`aufAbsaetze`) */
function aufTextAbsaetze(plaene: PagePlan[], karten: Map<string, ZeilenStelle[]>): PagePlan[] {
  if (!karten.size) return plaene
  return plaene.map((plan) => ({
    ...plan,
    items: plan.items.map((it) => {
      const karte = karten.get(it.id)
      return karte ? aufAbsaetze(it, karte) : it
    })
  }))
}

/** Spaltenbreiten einer gemessenen Tabelle in Prozent ihrer Breite (aus der Kopfzeile, sonst der ersten Zeile) */
function spaltenProzent(tabelle: HTMLTableElement): number[] {
  const breite = tabelle.getBoundingClientRect().width
  const zeile = tabelle.tHead?.rows[0] ?? tabelle.rows[0]
  if (!zeile || breite <= 0) return []
  return Array.from(zeile.cells).map((c) => (c.getBoundingClientRect().width / breite) * 100)
}

/** Geteilten Tabellen die Spaltenbreiten der ganzen Tabelle mitgeben (siehe `PlacedItem.spalten`) */
function mitSpalten(plaene: PagePlan[], spaltenJe: Map<string, number[]>, items: MeasuredItem[]): PagePlan[] {
  if (!spaltenJe.size) return plaene
  const einheiten = new Map(items.map((i) => [i.id, i.units?.length ?? 0]))
  return plaene.map((plan) => ({
    ...plan,
    items: plan.items.map((it) => {
      const spalten = spaltenJe.get(it.id)
      const geteilt = (it.from ?? 0) > 0 || (it.to !== undefined && it.to < (einheiten.get(it.id) ?? 0))
      return spalten?.length && geteilt ? { ...it, spalten } : it
    })
  }))
}

export function useSheetLayouts(ws: Worksheet | null, logo: string | null, schoolName: string): { layouts: Map<string, PagePlan[]>; measure: React.ReactNode } {
  const ref = useRef<HTMLDivElement>(null)
  const [layouts, setLayouts] = useState<Map<string, PagePlan[]>>(new Map())
  const [tick, setTick] = useState(0)
  /*
   * PRÜFUNG NACH DEM SETZEN (30.09.2026, Befund „letzte Tabellenzeile nur halb sichtbar").
   *
   * Die berechneten Seiten werden im Messbereich noch einmal wirklich gesetzt und nachgemessen
   * (`ueberlaufUnten`). Ragt auf einer Seite etwas über den Satzspiegel, bekommt genau diese
   * Seite so viel weniger Platz, und es wird neu umbrochen – das Überstehende rutscht auf die
   * Folgeseite, statt abgeschnitten zu werden. Die Abzüge gelten nur für dieses eine Blatt;
   * jede Änderung beginnt wieder bei null. Höchstens PRUEF_RUNDEN Durchgänge.
   */
  const [pruefung, setPruefung] = useState<{ ws: Worksheet | null; abzug: Map<string, number[]>; runden: number }>(() => ({
    ws: null,
    abzug: new Map(),
    runden: 0
  }))
  const abzug = pruefung.ws === ws ? pruefung.abzug : KEIN_ABZUG

  // Gemessen wird, was dargestellt wird – mit aufgelösten Verweisen („M3" ist kürzer als „M{zeitleiste}")
  const variants = useMemo(() => (ws ? ws.sheets.flatMap((s) => [false, true].map((key) => ({ sheet: zurAnzeige(s), key }))) : []), [ws])

  /*
   * VERSTECKT GEMESSEN = FALSCH GEMESSEN (Befund der Lehrkraft, 26.09.2026).
   *
   * Die Programme bleiben eingehängt; das gerade nicht gezeigte steht auf `hidden`
   * (App.tsx, `.module-container`). Wird ein Blatt fertig, während ein anderes Programm
   * vorn ist, misst dieser Hook in einem `display: none`-Zweig: Jede Höhe ist 0, die
   * Inhaltsfläche „fasst" nichts, und jede Einheit landet auf einer eigenen Seite – ein
   * Blatt mit 97 Seiten, darunter leere Seiten „Aufgabe 1 (Fortsetzung)". Erst eine
   * Änderung am Blatt (`ws` neu) maß noch einmal – dann richtig.
   *
   * Deshalb: Liefert die Messfläche keine brauchbare Höhe, wird NICHT gesetzt, sondern
   * kurz darauf erneut gemessen; und sobald der Messbereich seine Größe ändert (Programm
   * kommt nach vorn, Schriften sind da), wird ebenfalls neu gemessen.
   */
  const letzteGroesse = useRef({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || !ws) return
    const beobachter = new ResizeObserver(() => {
      const r = root.getBoundingClientRect()
      if (Math.abs(r.width - letzteGroesse.current.w) < 1 && Math.abs(r.height - letzteGroesse.current.h) < 1) return
      letzteGroesse.current = { w: r.width, h: r.height }
      setTick((t) => t + 1)
    })
    beobachter.observe(root)
    /*
     * Auch jeder einzelne Baustein wird beobachtet: Wächst er NACH dem Messen (ein Bild lädt,
     * eine Schrift kommt nach, eine Formel wird gesetzt), ändert sich an der Größe des
     * Messbereichs nichts – die Seiten darin sind fest 297 mm hoch. Ohne diesen Beobachter
     * blieb die alte, zu kleine Höhe in der Rechnung stehen.
     */
    const hoehen = new Map<Element, number>()
    const bausteine = new ResizeObserver((eintraege) => {
      let geaendert = false
      for (const e of eintraege) {
        const h = e.target.getBoundingClientRect().height
        const alt = hoehen.get(e.target)
        hoehen.set(e.target, h)
        if (alt !== undefined && Math.abs(alt - h) > 0.5) geaendert = true
      }
      if (geaendert) setTick((t) => t + 1)
    })
    root.querySelectorAll('[data-measure-block]').forEach((el) => bausteine.observe(el))
    let aktiv = true
    document.fonts?.ready.then(() => aktiv && setTick((t) => t + 1)).catch(() => undefined)
    return () => {
      aktiv = false
      beobachter.disconnect()
      bausteine.disconnect()
    }
  }, [ws])

  useLayoutEffect(() => {
    const root = ref.current
    if (!root || !ws) return
    // Versteckt oder noch ohne Stylesheet: nichts setzen – der Beobachter oben misst neu, sobald sich die Größe ändert
    const probe = root.querySelector<HTMLElement>('.ws-page .ws-body')
    if (!probe || probe.getBoundingClientRect().height < 50) return
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
      const probe = el.querySelector<HTMLElement>('[data-continued-probe]')
      // Mit dem Abstand darunter – der steht auf der Seite genauso
      const fortsetzungKopf = probe ? probe.getBoundingClientRect().height + (parseFloat(getComputedStyle(probe).marginBottom) || 0) : 0
      const items: MeasuredItem[] = []
      const spaltenJe = new Map<string, number[]>()
      /** Materialtexte mit Zeilen-Einheiten: wo jede Einheit im Text steht (render/zeilenTeilung.ts) */
      const zeilenKarten = new Map<string, ZeilenStelle[]>()
      /*
       * FUSSNOTEN (01.10.2026): Höhe jeder Anmerkung, gesetzt wie unten auf der Seite (gleiche Breite,
       * gleiche Klassen) – von Oberkante zu Oberkante, die letzte bis zu ihrer Unterkante. Was über der
       * ersten und unter der letzten steht (Linie, Abstände), ist einmal je Seite fällig (`noteRule`).
       */
      const notenJe = new Map<string, Map<number, number>>()
      let noteRule = 0
      const fnBox = el.querySelector<HTMLElement>('[data-fn-messung]')
      if (fnBox) {
        const zeilen = Array.from(fnBox.querySelectorAll<HTMLElement>('.ws-fussnote-zeile'))
        const r = zeilen.map((z) => z.getBoundingClientRect())
        const box = fnBox.getBoundingClientRect()
        if (r.length) noteRule = Math.max(0, r[0].top - box.top) + Math.max(0, box.bottom - r[r.length - 1].bottom)
        zeilen.forEach((z, i) => {
          const a = z.querySelector<HTMLElement>('[data-fn-block]')
          if (!a) return
          const id = a.dataset.fnBlock!
          const h = i < r.length - 1 ? r[i + 1].top - r[i].top : r[i].height
          if (!notenJe.has(id)) notenJe.set(id, new Map())
          notenJe.get(id)!.set(Number(a.dataset.fnNr), h)
        })
      }
      /** Fußnotenhöhen je Einheit eines Materials – Absätze über `data-absatz`, Anmerkungen ohne Stelle bei der letzten */
      const notenEinheiten = (block: WsBlock | undefined, unitEls: HTMLElement[], geteilt: boolean): number[] | undefined => {
        const h = block && notenJe.get(block.id)
        if (!h || block?.type !== 'text') return undefined
        const je = anmerkungenJeAbsatz(block)
        const summe = (nrn: number[]): number => nrn.reduce((a, nr) => a + (h.get(nr) ?? 0), 0)
        if (!geteilt) return [summe(je.satz.anmerkungen.map((a) => a.nr))]
        return unitEls.map((u, k) => {
          const absatz = Number(u.dataset.absatz)
          const hier = Number.isFinite(absatz) ? summe(je.absaetze[absatz] ?? []) : 0
          return hier + (k === unitEls.length - 1 ? summe(je.rest) : 0)
        })
      }
      el.querySelectorAll<HTMLElement>('[data-measure-block]').forEach((wrap) => {
        const id = wrap.dataset.measureBlock!
        const rahmen = wrap.getBoundingClientRect()
        const height = rahmen.height
        const block = sheet.blocks.find((b) => b.id === id)
        /*
         * Einheiten des Bausteins selbst: nicht die eines seitlich danebenstehenden Bausteins
         * (eine Tabelle neben der Aufgabe brachte sonst ihre Zeilen in die Rechnung der Aufgabe)
         * und keine, die in einer anderen Einheit stecken.
         */
        const unitEls = Array.from(wrap.querySelectorAll<HTMLElement>('[data-unit]')).filter(
          (u) => !u.closest('.ws-side-image') && !u.parentElement?.closest('[data-unit]')
        )
        /*
         * Materialtexte Zeile für Zeile (02.10.2026): Ihre Einheiten sind die Zeilen, nicht mehr die
         * Absätze – so ist auch ein Text aus einem einzigen Absatz teilbar.
         */
        const zeilen =
          block?.type === 'text' && unitEls.length
            ? textZeilen(block, unitEls, !block.illustration && !wrap.querySelector('.ws-side-image'), fontPx)
            : undefined
        const splittable = Boolean(block && TEILBAR.has(block.type)) && (zeilen ? zeilen.units.length : unitEls.length) > 1
        if (splittable) {
          const units = zeilen?.units ?? einheitenHoehen(unitEls)
          const unitSum = units.reduce((a, b) => a + b, 0)
          /*
           * Der FUSS (Wortzahl, Quellenangabe) steht nur unter dem letzten Teilstück. Bis zum
           * 27.09.2026 steckte er im Kopf und wurde damit dem ERSTEN Stück angerechnet – auf der
           * Seite davor fehlten dann genau diese Pixel, und ein Absatz, der noch gepasst hätte,
           * rutschte auf die Folgeseite (PDF „Test": 5 px zu wenig für 269 px Absatz).
           */
          const footHeight = Array.from(wrap.querySelectorAll<HTMLElement>('[data-foot]')).reduce((a, f) => a + f.getBoundingClientRect().height, 0)
          const headHeight = Math.max(0, height - unitSum - footHeight)
          /*
           * KOPF EINES FOLGESTÜCKS (30.09.2026). Was vor der ersten Einheit steht (Titel,
           * Materialkopf, Arbeitsanweisung), steht auf dem Folgestück nicht – dafür steht dort,
           * was sich wiederholt: bei Tabellen die Kopfzeile, bei Aufgaben der Hinweis
           * „Aufgabe N (Fortsetzung)". Bis dahin zählte bei Tabellen NICHTS davon: Jedes
           * Tabellenstück auf einer Folgeseite lief um die Höhe seiner Kopfzeile über den Rand.
           * Der Rest des Kopfes (Abstand unter dem Baustein, Rahmen) gilt für jedes Stück.
           */
          const vorlauf = Math.max(0, unitEls[0].getBoundingClientRect().top - rahmen.top)
          const tabelle = block?.type === 'table' ? unitEls[0].closest('table') : null
          /*
           * Jedes Folgestück trägt oben den Hinweis „Aufgabe 3 (Fortsetzung)" bzw. „M2
           * (Fortsetzung)" (seit 01.10.2026 bei allen geteilten Bausteinen), Tabellen dazu ihre
           * Kopfzeile.
           */
          const wiederholt = (tabelle ? Math.max(0, unitEls[0].getBoundingClientRect().top - tabelle.getBoundingClientRect().top) : 0) + fortsetzungKopf
          if (tabelle) spaltenJe.set(id, spaltenProzent(tabelle))
          /*
           * Gebundene Einheiten (`data-bindet`) und Kopfzeilen innerer Tabellen (Richtig/Falsch,
           * Ausfülltabelle, Selbsteinschätzung), die ein Stück, das mit dieser Zeile beginnt,
           * wiederholt. Beginnt ein Stück mit der ERSTEN Zeile, steckt die Kopfzeile in der Messung
           * in der Einheit davor – auf der neuen Seite steht sie trotzdem: also immer anrechnen.
           */
          // Zeilen-Einheiten eines Texts binden nichts und wiederholen nichts
          const unitGlue = zeilen ? [] : unitEls.map((u) => u.hasAttribute('data-bindet'))
          const unitRepeat = (zeilen ? [] : unitEls).map((u) => {
            if (block?.type === 'table' || u.tagName !== 'TR') return 0
            const kopf = u.closest('table')?.tHead
            return kopf ? kopf.getBoundingClientRect().height : 0
          })
          // Bei Zeilen-Einheiten: Fußnoten bei der Zeile ihrer Ziffer
          const notenH = block && notenJe.get(block.id)
          const noteUnits = zeilen
            ? notenH && zeilen.karte.some((z) => z.noten.length)
              ? zeilen.karte.map((z) => z.noten.reduce((a, nr) => a + (notenH.get(nr) ?? 0), 0))
              : undefined
            : notenEinheiten(block, unitEls, true)
          if (zeilen) zeilenKarten.set(id, zeilen.karte)
          items.push({
            id,
            height,
            headHeight,
            footHeight,
            units,
            ...(noteUnits ? { noteUnits, noteRule } : {}),
            ...(unitGlue.some(Boolean) ? { unitGlue } : {}),
            ...(unitRepeat.some((x) => x > 0) ? { unitRepeat } : {}),
            /*
             * Zeilennummern zählen nur den Materialtext, nicht die Worterklärungen darunter.
             *
             * Gezählt wird mit der ECHTEN Zeilenhöhe des Absatzes (27.09.2026): Vorher galt fest
             * „Seitenschrift × 1,5" – bei kleiner gesetztem Text kamen so weniger Zeilen heraus als
             * gedruckt, und die Nummern der Folgeseite liefen davon (28 Zeilen gezählt als 26).
             * Seit 02.10.2026 sind die Einheiten eines Texts seine Zeilen – gezählt werden die
             * tatsächlich gesetzten Zeilen (`zeilen.lines`), die Schätzung bleibt für alles andere.
             */
            unitLines:
              block?.type === 'text' && block.lineNumbers
                ? (zeilen?.lines ?? unitEls.map((u) => {
                    if (u.classList.contains('ws-glossary')) return 0
                    const zeile = parseFloat(getComputedStyle(u).lineHeight) || fontPx * 1.5
                    // Die Höhe des Absatzes selbst – `units` enthält den Abstand zum nächsten mit
                    return Math.max(1, Math.round(u.getBoundingClientRect().height / zeile))
                  }))
                : undefined,
            /*
             * KEIN `keepTogether` mehr (01.10.2026). Bis dahin wanderte jeder teilbare Baustein,
             * der in der unteren Seitenhälfte nicht mehr ganz Platz fand, vollständig auf die
             * nächste Seite – die Lehrkraft: „Dadurch benötigt man im Druck deutlich mehr Seiten
             * als vom Inhalt eigentlich notwendig wären." Jetzt wird an der nächsten natürlichen
             * Stelle geteilt; dass die Aufgabenstellung nicht allein unten steht, sichern Kopf +
             * erste Einheit und die gebundenen Einheiten.
             */
            pageBreakBefore: block?.pageBreakBefore,
            continuedHead: Math.max(0, headHeight - vorlauf) + wiederholt
          })
        } else {
          const noteUnits = notenEinheiten(block, unitEls, false)
          items.push({
            id,
            height,
            ...(noteUnits ? { noteUnits, noteRule } : {}),
            keepWithNext: block?.type === 'divider',
            pageBreakBefore: block?.pageBreakBefore
          })
        }
      })
      const k = layoutKey(sheet.id, key)
      const abzugHier = abzug.get(k) ?? []
      const plaene = linienAuffuellen(
        paginate(items, firstHeight, otherHeight, abzugHier),
        items,
        sheet,
        firstHeight,
        otherHeight,
        abzugHier,
        linienHoehePx(ws.meta)
      )
      // Stücke der Materialtexte von Zeilen zurück auf Absätze – erst ganz zum Schluss, alles davor rechnet in Einheiten
      next.set(k, aufTextAbsaetze(mitSpalten(plaene, spaltenJe, items), zeilenKarten))
    }
    setLayouts(next)
  }, [ws, variants, logo, schoolName, tick, abzug])

  /*
   * Die Prüfung selbst: die eben berechneten Seiten, im Messbereich gesetzt (`data-pruefung`),
   * Seite für Seite nachmessen. Läuft als Layout-Effekt – ein nötiger zweiter Umbruch ist
   * fertig, bevor der Bildschirm etwas zeigt. Seiten, auf denen ein einzelner Baustein schon
   * größer ist als die ganze Seite (`overflow`), lassen sich durch Umbrechen nicht retten.
   */
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || !ws || !layouts.size) return
    const runden = pruefung.ws === ws ? pruefung.runden : 0
    if (runden >= PRUEF_RUNDEN) return
    const neu = new Map(abzug)
    let geaendert = false
    for (const [k, plaene] of layouts) {
      const seiten = root.querySelectorAll<HTMLElement>(`[data-pruefung="${k}"] .ws-page`)
      // Stimmt die Zahl nicht, gehört der Satz noch zum vorigen Stand – dann nicht urteilen
      if (seiten.length < plaene.length) continue
      plaene.forEach((plan, i) => {
        if (plan.overflow) return
        const body = seiten[i].querySelector<HTMLElement>('.ws-body')
        if (!body || body.getBoundingClientRect().height < 50) return
        const ueber = ueberlaufUnten(body)
        if (ueber <= 0.5) return
        const liste = [...(neu.get(k) ?? [])]
        liste[i] = (liste[i] ?? 0) + Math.ceil(ueber) + 1
        neu.set(k, liste)
        geaendert = true
      })
    }
    if (geaendert) setPruefung({ ws, abzug: neu, runden: runden + 1 })
    // Nur nach einem neuen Umbruch prüfen – sonst misst jede Darstellung erneut
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layouts])

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
                    {/*
                      Dieselbe Regel wie beim Setzen (`phraseSheetModus`): Vorher galt hier nur die
                      ausdrückliche Wahl – bei Übungsklausuren in Fremdsprachen stand das Hilfsblatt
                      dann in der Messung, auf dem Blatt aber auf einer eigenen Seite.
                    */}
                    {blockLayout(sheet.blocks, phraseSheetModus(ws.meta) === 'blatt').map(({ block, side, sideAt }) => (
                      <div key={block.id} data-measure-block={block.id} style={{ display: 'flow-root' }}>
                        {side && (
                          <div className={`ws-side-image ${sideAt === 'left' ? 'ws-side-left' : ''}`}>
                            <BlockView block={side} />
                          </div>
                        )}
                        <BlockView block={block} />
                      </div>
                    ))}
                    {/* Fußnoten aller Materialien, gesetzt wie unten auf der Seite – nur zum Messen */}
                    {ctx.anmerkungsArt === 'fussnoten' && (
                      <SeitenFussnoten
                        messung
                        gruppen={blockLayout(sheet.blocks, phraseSheetModus(ws.meta) === 'blatt')
                          .map((e) => e.block)
                          .filter((b): b is TextBlock => b.type === 'text' && !b.free)
                          .map((b) => ({ block: b, anmerkungen: anmerkungenVon(b).anmerkungen }))}
                      />
                    )}
                  </div>
                </PageFrame>
              </WsContext.Provider>
              {/* Die berechneten Seiten, wirklich gesetzt – Grundlage der Prüfung nach dem Setzen */}
              {layouts.get(layoutKey(sheet.id, key)) && (
                <div data-pruefung={layoutKey(sheet.id, key)}>
                  <SheetPages ws={ws} sheet={sheet} plans={layouts.get(layoutKey(sheet.id, key))} info={info} context={ctx} />
                </div>
              )}
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
