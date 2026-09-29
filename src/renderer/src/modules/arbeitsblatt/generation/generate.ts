/* eslint-disable @typescript-eslint/no-explicit-any */
import { setzeVersuchEin } from '../didactics/protokoll'
import type { StructuredRequest } from '@shared/types'
import { runLimited } from '../../../shared/async'
import { obj, str } from '../../../shared/aiSchema'
import { plainText } from '../../../shared/richtext/parse'
import { createRng, newId, randomSeed } from '../../vokabeltest/model/random'
import { checkIntegrity, checkListening, checkVideo, verschluesseleMaterialverweise } from '../didactics/integrity'
import { markiereLoesungsbausteine } from '../didactics/loesungsteil'
import { lernzieleFormulieren } from './lernziele'
import { useThemen } from '../../../shared/themenbereiche'
import { pfadVon } from '@shared/themen'
import { checkDemand } from '../didactics/demand'
import { checkImages } from '../didactics/imageDesign'
import { checkAfbMix, checkOperators, checkStyle, checkText, DidacticWarning } from '../didactics/checks'
import { checkSheet } from '../didactics/sheetChecks'
import { anredeBefundeBaustein, anredeFuerMeta } from '../didactics/anrede'
import type { Anrede } from '../../../shared/anrede'
import { subjectById } from '../model/subjects'
import { COMBINED_RULES, DIFFERENTIATION_PRINCIPLES, STAR_LABELS, Stars } from '../didactics/differentiation'
import { fassungsLabel, istMittel, profilFuerStufe, stufeFuer, stufenRegeln, stufeText } from '../didactics/schwierigkeit'
import { lesbarkeitAngleichen } from './lesbarkeit'
import type { LearnerProfile } from '../didactics/profile'
import type { OriginalMaterialAblage, Outline, OutlineItem, Sheet, SourceMaterial, Worksheet, WorksheetMeta, WsBlock } from '../model/types'
import { convertBlock, convertOutline } from './convert'
import { describeBlock, describeSheet } from './describe'
import { setzeMaterialEin } from './originalmaterial'
import { istUebungsklausur } from './abiturPrompt'
import { bilingualAktiv, glossarZweck } from '../didactics/bilingual'
import {
  embeddableImages,
  materialImages,
  materialText,
  originalMaterialVorgabe,
  originalSourceRules,
  phraseSheetModus,
  systemPrompt,
  taskContext
} from './prompts'
import { FLAT_BLOCK, OUTLINE_SCHEMA, REVIEW_SCHEMA, WORKSHEET_SCHEMA } from './schemas'
import { seitenPlanAus, seitenPlanRegeln } from '../didactics/seiten'
import { linkListeningTasks, scriptForSheet, wantsListening, writeListeningScripts } from './listening'
import type { ListeningScript } from './listening'
import { listeningCount } from '../didactics/listeningFormats'
import { expandObserverGroups } from '../render/observerGroups'
import { linkVideoTasks, sortViewingTasks } from './video'

export type AiCall = <T>(req: StructuredRequest) => Promise<T>
export type Progress = (message: string, done: number, total: number) => void

// ---------- Gliederung ----------

export async function generateOutline(
  meta: WorksheetMeta,
  profile: LearnerProfile,
  sources: SourceMaterial[],
  ai: AiCall,
  /** Bereits beschaffter Originaltext – die Aufgaben werden dann zu ihm geplant */
  material?: OriginalMaterialAblage | null
): Promise<Outline> {
  const images = embeddableImages(sources)
  const levels = meta.differentiation.levels
  const data = await ai<any>({
    system: systemPrompt(meta, profile),
    user: [
      'Plane die Gliederung eines Arbeitsblatts (noch ohne ausformulierte Inhalte).',
      taskContext(meta, profile),
      themenbereichVorgabe(meta.subjectId),
      originalSourceRules(meta, levels > 1 && meta.differentiation.mode === 'separate' ? (Math.min(3, levels) as Stars) : null, material),
      originalMaterialVorgabe(material),
      levels > 1 && meta.differentiation.mode === 'combined'
        ? `Differenzierung auf einem Blatt mit ${levels} Niveaustufen: markiere Zusatzaufgaben mit stars 2 bzw. 3, Pflichtaufgaben mit 0. ${COMBINED_RULES.join(' ')}`
        : levels > 1
          ? `Es werden später ${levels} getrennte Niveaufassungen ausformuliert; plane die gemeinsame Grundstruktur (stars = 0).`
          : '',
      /*
       * Der Bauplan des Blattes. Was hier nicht steht, entsteht spaeter nicht: Beim
       * Ausformulieren gilt „Erzeuge KEINEN Baustein, der nicht in der Gliederung steht".
       *
       * Deshalb muessen die Ausnahmen HIER stehen und nicht nur in den allgemeinen Regeln.
       * Eine Uebungsklausur endet nicht mit einer Selbsteinschaetzung (in der Pruefung wird
       * bewertet, nicht angeleitet), und ein verlangtes Hilfsblatt gehoert ans Ende.
       */
      [
        'Gib für jede Aufgabe Anforderungsbereich (afb), Operator und Sozialform an und halte die Soll-Verteilung der Anforderungsbereiche ein.',
        'Beginne mit den Lernzielen und stelle Material (Texte, Kästen, Bilder) vor die zugehörigen Aufgaben.',
        istUebungsklausur(meta) ? 'Dies ist eine Übungsklausur: KEINE Selbsteinschätzung.' : 'Ende mit einer Selbsteinschätzung.',
        phraseSheetModus(meta) !== 'aus'
          ? 'Die Lehrkraft hat ein Hilfsblatt mit nützlichen Ausdrücken verlangt: Setze dafür einen Gliederungspunkt vom Typ „phrases" ans ENDE.'
          : ''
      ]
        .filter(Boolean)
        .join(' '),
      images.length ? `Übernehmbare Bilder aus dem Material: ${images.map((i) => `Index ${i.index}: ${i.fileName}`).join('; ')}.` : '',
      materialText(sources)
    ]
      .filter(Boolean)
      .join('\n\n'),
    images: materialImages(sources),
    schemaName: 'worksheet_outline',
    schema: OUTLINE_SCHEMA
  })
  const outline = mitHilfsblatt(convertOutline(data), meta)
  // Lernziele in einer eigenen Anfrage aus der fertigen Gliederung (generation/lernziele.ts) – sonst Blatt für Blatt dieselben Formeln
  return { ...outline, learningGoals: await lernzieleFormulieren(meta, outline, ai) }
}

/**
 * Die vorhandenen Themenbereiche des Fachs für die Gliederung (27.09.2026): Die KI nennt in
 * „ueberthema" den Wortlaut des passenden Bereichs – so landet ein neues Blatt sicher in seinem
 * Ordner, statt dass die Wortähnlichkeit raten muss („Die Julikrise 1914" ↔ „Ursachen des
 * Ersten Weltkriegs"). Ohne Bereiche nennt sie die Unterrichtseinheit frei; daraus entsteht der Bereich.
 */
export function themenbereichVorgabe(fachId: string): string {
  const d = useThemen.getState().daten
  const namen = d.bereiche
    .filter((b) => b.fachId === fachId)
    .map((b) =>
      pfadVon(d, b.id)
        .map((x) => x.name)
        .join(' › ')
    )
  if (!namen.length) return 'ÜBERTHEMA: Nenne in „ueberthema" die Unterrichtseinheit (2–5 Wörter, lehrplannah), unter der dieses Blatt steht.'
  return `VORHANDENE THEMENBEREICHE DES FACHS: ${namen.join('; ')}. Nenne in „ueberthema" GENAU den Wortlaut des Bereichs (bei Unterbereichen nur den letzten Teil), zu dem dieses Blatt gehört; passt keiner, die Unterrichtseinheit (2–5 Wörter, lehrplannah).`
}

/**
 * Ergänzt den Gliederungspunkt für das Hilfsblatt, wenn die Lehrkraft es verlangt hat.
 *
 * Gemeldet am 25.09.2026: In einer Übungsklausur (Englisch, Jg. 13, Sprachmittlung) fehlten
 * die sprachlichen Hilfsmittel, obwohl sie in Schritt 1 ausgewählt waren.
 *
 * Die Ursache ist eine Regel gegen eine andere: Beim Ausformulieren gilt „Erzeuge KEINEN
 * Baustein, der nicht in der Gliederung steht" – und sie schlägt die allgemeine Pflichtregel
 * aus dem System-Prompt. Fehlt der Punkt in der Gliederung, kann das Hilfsblatt danach nicht
 * mehr entstehen; die Lehrkraft sieht nur, dass ihre Auswahl wirkungslos blieb.
 *
 * Eine ausgewählte Option darf nicht davon abhängen, ob ein Sprachmodell sie eingeplant hat.
 */
export function mitHilfsblatt(outline: Outline, meta: WorksheetMeta): Outline {
  if (phraseSheetModus(meta) === 'aus') return outline
  if (outline.items.some((i) => i.type === 'phrases')) return outline
  const punkt: OutlineItem = {
    id: newId(),
    type: 'phrases',
    purpose: bilingualAktiv(meta)
      ? glossarZweck(meta)
      : `Hilfsblatt „nützliche Ausdrücke": Wendungen und Wortschatz auf ${meta.subjectLabel} für die Aufgaben dieses Blattes, nach Sprachhandlung geordnet.`,
    operator: '',
    socialForm: 'EA',
    answerKind: 'none'
  }
  // Ans Ende, aber vor eine Selbsteinschätzung: Die bleibt der Abschluss des Blattes
  const letzte = outline.items.length - (outline.items[outline.items.length - 1]?.type === 'selfCheck' ? 1 : 0)
  return { ...outline, items: [...outline.items.slice(0, letzte), punkt, ...outline.items.slice(letzte)] }
}

// ---------- Ausformulieren ----------

/**
 * Gliederungspunkte, die wirklich ausformuliert werden.
 *
 * Ein frisch hinzugefügter Baustein ist zunächst leer – er sagt nicht, was er enthalten soll.
 * Die KI machte daraus irgendetwas, das zum Thema passte, und es entstand ein Baustein, den
 * niemand bestellt hatte. Leere Punkte werden deshalb übersprungen; die übrigen werden
 * lückenlos neu gezählt, damit „outlineIndex" wieder stimmt.
 */
export const filledOutlineItems = (outline: Outline): Outline['items'] => outline.items.filter((it) => it.purpose.trim())

function outlineText(outline: Outline): string {
  return [
    `Titel: ${outline.title}`,
    `Lernziele: ${outline.learningGoals.join('; ')}`,
    'Gliederung:',
    ...filledOutlineItems(outline).map(
      (it, i) =>
        `${i}. ${it.type}${it.stars ? ` ★${it.stars}` : ''}${it.type === 'task' ? ` [AFB ${it.afb ?? '?'}, ${it.operator}, ${it.socialForm}, Antwortform ${it.answerKind}]` : ''}: ${it.purpose}`
    )
  ].join('\n')
}

/*
 * Schwierigkeit der Fassung (didactics/schwierigkeit.ts): Ein Blatt mit einem Niveau bekommt die
 * gewählte Stufe, bei getrennten Fassungen hat jedes ★ seine eigene. „mittel/mittel" ist der
 * Jahrgang selbst – dann steht hier nichts Zusätzliches, das Profil regelt es.
 */
export function levelInstruction(meta: WorksheetMeta, level: Stars | null, profile?: LearnerProfile): string {
  if (meta.differentiation.levels > 1 && meta.differentiation.mode === 'combined') return [...DIFFERENTIATION_PRINCIPLES, ...COMBINED_RULES].join('\n')
  const stufe = stufeFuer(meta, level)
  if (!level) return istMittel(stufe) ? '' : [`Schwierigkeit dieses Blattes: ${stufeText(stufe)}.`, ...stufenRegeln(stufe, profile)].join('\n')
  if (meta.differentiation.levels <= 1) return ''
  return [`Diese Fassung ist ${STAR_LABELS[level]} (${stufeText(stufe)}).`, ...DIFFERENTIATION_PRINCIPLES, ...stufenRegeln(stufe, profile)].join('\n')
}

export async function generateSheet(
  ws: Pick<Worksheet, 'meta' | 'outline' | 'sources'> & Partial<Pick<Worksheet, 'originalMaterial'>>,
  profile: LearnerProfile,
  level: Stars | null,
  ai: AiCall,
  /** Bereits geschriebene Hörtexte; die Aufgaben werden dann zu ihnen gebaut */
  script?: ListeningScript | ListeningScript[] | null
): Promise<Sheet> {
  const { meta, sources } = ws
  const outline = ws.outline!
  const images = embeddableImages(sources)
  // Anforderungsbereiche, Sprachgrenzen und Hilfen der gewählten Stufe
  profile = profilFuerStufe(profile, stufeFuer(meta, level))
  const data = await ai<any>({
    system: systemPrompt(meta, profile),
    user: [
      'Formuliere das komplette Arbeitsblatt nach der Gliederung aus. Erzeuge für jeden Gliederungspunkt genau einen Baustein in derselben Reihenfolge (outlineIndex). Zusätzliche Hilfen (scaffold) sind erlaubt (outlineIndex -1), wenn das Profil oder die Niveaustufe sie verlangt.',
      /*
       * Die Gliederung schlägt die allgemeinen Regeln.
       *
       * Unter den Profilregeln steht „Selbsteinschätzung am Ende" – die gilt für die PLANUNG.
       * Hatte die Lehrkraft sie danach aus der Gliederung entfernt, erschien sie trotzdem auf
       * dem Blatt: Zwei Anweisungen widersprachen sich, und die allgemeinere gewann.
       */
      `Die Gliederung ist verbindlich. Erzeuge KEINEN Baustein, der nicht darin steht – ausgenommen sind allein zusätzliche Hilfen (scaffold).${
        outline.items.some((i) => i.type === 'selfCheck') ? '' : ' Die Gliederung enthält KEINE Selbsteinschätzung; setze also auch keine ans Ende.'
      }`,
      taskContext(meta, profile),
      outlineText(outline),
      levelInstruction(meta, level, profile),
      originalSourceRules(meta, level, ws.originalMaterial),
      originalMaterialVorgabe(ws.originalMaterial),
      scriptForSheet(script ?? null),
      seitenPlanRegeln(meta),
      images.length ? `Übernehmbare Bilder (sourceImageIndex): ${images.map((i) => `${i.index}: ${i.fileName}`).join('; ')}.` : '',
      'Für alle nicht benötigten Felder leere Werte verwenden (leerer Text, leere Liste, 0 bzw. -1).',
      materialText(sources)
    ]
      .filter(Boolean)
      .join('\n\n'),
    images: materialImages(sources),
    schemaName: 'worksheet',
    schema: WORKSHEET_SCHEMA
  })
  const sheet = buildSheet(data, level, images, anredeFuerMeta(meta))
  // Die Fassung heißt nach ihrer gewählten Stufe („★ grundlegend", „★★ anspruchsvoll") – so steht es im Blattwechsler und beim Export
  return level ? { ...sheet, label: fassungsLabel(level, stufeFuer(meta, level)) } : sheet
}

/**
 * Arbeitsblätter tragen keine Punkte (Schema: „Immer 0"). Seit `convertBlock` die Punkte der
 * KI übernimmt – LZK und Klassenarbeit brauchen sie –, wird das hier ausdrücklich
 * durchgesetzt: Schickt die KI doch welche, stünden sie sonst im Erwartungshorizont.
 */
export function ohnePunkte<T extends WsBlock | null>(block: T, punkte = 0): T {
  return block && block.type === 'task' ? ({ ...block, points: punkte } as T) : block
}

function buildSheet(data: any, level: Stars | null, images: ReturnType<typeof embeddableImages>, anrede: Anrede = 'du'): Sheet {
  const rng = createRng(randomSeed())
  const roh: (WsBlock | null)[] = (Array.isArray(data?.blocks) ? data.blocks : []).map((b: any) => ohnePunkte(convertBlock(b, rng, images, anrede)))
  // Erwartungshorizont & Co. als Baustein: nur im Lösungsteil (didactics/loesungsteil.ts)
  const blocks = markiereLoesungsbausteine(sortViewingTasks(roh.filter((b: WsBlock | null): b is WsBlock => Boolean(b))))
  // Hier, weil JEDER Weg durch buildSheet läuft – auch der Sparmodus, der die Prüfrunde
  // überspringt. Ohne die Zuordnung liefe die Lösungsprüfung gegen alle Skripte zugleich.
  linkListeningTasks(blocks)
  linkVideoTasks(blocks)
  // Angabe zur Seitenzahl: Die KI nennt Bausteine nach ihrer Stelle in ihrer Antwort – hier in Kennungen übersetzt
  const seitenPlan = seitenPlanAus(
    data?.seiten,
    roh.map((b) => b?.id)
  )
  return { id: newId(), stars: level ?? undefined, label: level ? STAR_LABELS[level] : 'Arbeitsblatt', blocks, ...(seitenPlan ? { seitenPlan } : {}) }
}

/** Nur für Tests: dasselbe Bauen eines Blattes aus einer KI-Antwort. */
export const buildSheetForTest = (data: unknown): Sheet => buildSheet(data, null, [])

// ---------- Prüfung ----------

/** Lokale didaktische Prüfungen (ohne KI). Hinweise werden an die Bausteine gehängt. */
export function localChecks(sheet: Sheet, profile: LearnerProfile, meta?: WorksheetMeta): DidacticWarning[] {
  const sheetWarnings: DidacticWarning[] = []
  let taskNo = 0
  for (const b of sheet.blocks) {
    const warnings: DidacticWarning[] = []
    if (b.type === 'text') warnings.push(...checkText(plainText(b.body), profile, 'Text'), ...checkStyle(plainText(b.body), 'Text'))
    if (b.type === 'infoBox') warnings.push(...checkText(plainText(b.body), profile, 'Kasten'))
    if (b.type === 'task') {
      taskNo++
      const instructions = [b.instruction, ...b.parts.map((p) => p.instruction)].join(' ')
      warnings.push(...checkOperators(instructions, profile, `Aufgabe ${taskNo}`))
      if (!b.solution.trim() && !b.parts.some((p) => p.solution.trim())) warnings.push({ kind: 'scaffold', message: `Aufgabe ${taskNo}: Lösung fehlt.` })
    }
    // Nur die EIGENEN Hinweise ersetzen: Befunde der Vollständigkeitsprüfung und der
    // KI-Prüfung bleiben stehen, sonst gingen sie beim nächsten Lauf verloren.
    const other = (b.warnings ?? []).filter((w) => !w.startsWith('[Prüfung]'))
    b.warnings = [...other, ...warnings.map((w) => `[Prüfung] ${w.message}`)]
  }
  const tasks = sheet.blocks.filter((b) => b.type === 'task')
  sheetWarnings.push(
    ...checkAfbMix(
      tasks.map((t) => (t.type === 'task' ? t.afb : undefined)),
      profile.afbMix
    )
  )
  if (sheet.stars === 1 && !sheet.blocks.some((b) => b.type === 'scaffold')) {
    sheetWarnings.push({ kind: 'scaffold', message: 'Niveau ★ enthält keine Hilfen (Wortspeicher, Satzanfänge oder Hilfekarten).' })
  }
  if (meta) sheetWarnings.push(...checkSheet(sheet, meta, subjectById(meta.subjectId).foreignLanguage, profile))
  return sheetWarnings
}

/**
 * Bessert ein Blatt nach den Vollständigkeitsprüfungen nach.
 *
 * Schwere Befunde (z. B. Verweis auf ein Material, das es nicht gibt) werden einmal an die
 * KI zurückgegeben; gelingt die Korrektur nicht, bleibt der Befund als Hinweis stehen.
 * Jede Änderung wird protokolliert, damit die Lehrkraft sie nachvollziehen kann.
 */
export async function repairSheet(
  ws: Pick<Worksheet, 'meta'>,
  sheet: Sheet,
  profile: LearnerProfile,
  ai: AiCall,
  step: (message: string) => void = () => undefined,
  label = 'Arbeitsblatt'
): Promise<Sheet> {
  // Hörverstehen wird mitgeprüft: Aufgaben ohne Hörtext und Lösungen, die im Skript fehlen
  const findings = [...checkIntegrity(sheet), ...checkListening(sheet), ...checkVideo(sheet, ws.meta), ...checkDemand(sheet), ...checkImages(sheet, ws.meta)]
  if (!findings.length) return sheet
  const severe = findings.filter((f) => f.severity === 'hoch')
  step(`${label}: ${severe.length ? `${severe.length} Baustein(e) werden nachgebessert …` : 'Hinweise werden vermerkt …'}`)

  const blocks = [...sheet.blocks]
  const repaired: string[] = []
  const byBlock = new Map<string, string[]>()
  for (const f of severe) byBlock.set(f.blockId, [...(byBlock.get(f.blockId) ?? []), f.message])
  await runLimited(
    [...byBlock.entries()].map(([blockId, msgs]) => async () => {
      const index = blocks.findIndex((b) => b.id === blockId)
      if (index < 0) return
      try {
        blocks[index] = await regenerateBlock({ ...ws, sheets: [sheet] } as Worksheet, sheet, blockId, profile, ai, msgs.join(' '))
        repaired.push(msgs.join(' '))
      } catch {
        // Eigenes Präfix: `localChecks` räumt seine eigenen `[Prüfung]`-Hinweise vor jedem
        // Lauf weg. Trügen die Befunde der Vollständigkeitsprüfung dasselbe Präfix, würden
        // sie dabei stillschweigend mitgelöscht – und die Lehrkraft sähe sie nie.
        blocks[index] = { ...blocks[index], warnings: [...(blocks[index].warnings ?? []), ...msgs.map((m) => `[Vollständigkeit] ${m}`)] }
      }
    }),
    3
  )
  // Mittlere Befunde bleiben als Hinweis am Baustein
  for (const f of findings.filter((x) => x.severity !== 'hoch')) {
    const b = blocks.find((x) => x.id === f.blockId)
    if (b) b.warnings = [...(b.warnings ?? []), `[Vollständigkeit] ${f.message}`]
  }
  const next = { ...sheet, blocks }
  if (repaired.length && next.blocks[0]) {
    next.blocks[0].warnings = [...(next.blocks[0].warnings ?? []), `[Nachgebessert] ${repaired.join(' | ')}`]
  }
  return next
}

export async function reviewSheet(
  ws: Pick<Worksheet, 'meta'>,
  sheet: Sheet,
  profile: LearnerProfile,
  ai: AiCall
): Promise<{ blockNumber: number; severity: string; problem: string }[]> {
  const res = await ai<{ problems: { blockNumber: number; severity: string; problem: string }[] }>({
    system: systemPrompt(ws.meta, profile),
    user: [
      'Prüfe dieses Arbeitsblatt wie eine erfahrene Fachleitung. Melde NUR echte Probleme:',
      '- fachliche Fehler oder falsche Lösungen',
      '- unklare oder mehrdeutige Arbeitsanweisungen; Aufgaben, die mit dem Material nicht lösbar sind',
      '- Sprache oder Anforderungen passen nicht zur Lerngruppe (Jahrgang, Schulform, Sprachniveau)',
      '- falsch eingeordneter Anforderungsbereich oder unpassender Operator',
      '- fehlender Lebensweltbezug bzw. unpassende Beispiele für die Schulform',
      'severity „hoch“ = muss korrigiert werden, „mittel“ = Hinweis für die Lehrkraft. Leere Liste, wenn alles passt.',
      sheet.stars ? `Niveaustufe dieser Fassung: ${STAR_LABELS[sheet.stars]} (${stufeText(stufeFuer(ws.meta, sheet.stars))}).` : '',
      describeSheet(sheet)
    ]
      .filter(Boolean)
      .join('\n\n'),
    schemaName: 'worksheet_review',
    schema: REVIEW_SCHEMA
  })
  return Array.isArray(res?.problems) ? res.problems : []
}

/**
 * Anrede im einzeln erzeugten Baustein prüfen (Paket 8b).
 *
 * Die Blattprüfung (`localChecks`) läuft nur beim Erzeugen des ganzen Blattes. Ein einzeln
 * neu erzeugter oder überarbeiteter Baustein ginge sonst ungeprüft aufs Blatt – ein eigener
 * Erzeugungsweg mit eigener Lücke. Gemeldet wird am Baustein, korrigiert wird nichts.
 */
function mitAnredePruefung(block: WsBlock, sheet: Sheet, meta: WorksheetMeta): WsBlock {
  let nummer = 0
  for (const b of sheet.blocks) {
    if (b.type === 'task') nummer++
    if (b.id === block.id) break
  }
  const befunde = anredeBefundeBaustein(block, meta, block.type === 'task' ? nummer : undefined)
  return befunde.length ? { ...block, warnings: [...(block.warnings ?? []), ...befunde.map((m) => `[Prüfung] ${m}`)] } : block
}

/**
 * Erzeugt einen einzelnen Baustein neu (mit dem übrigen Blatt als Zusammenhang).
 * `instruction`: eigener Auftrag der Lehrkraft (z. B. „einfacher formulieren“); `feedback`: zu behebende Probleme.
 */
export async function regenerateBlock(
  ws: Worksheet,
  sheet: Sheet,
  blockId: string,
  profile: LearnerProfile,
  ai: AiCall,
  feedback = '',
  instruction = ''
): Promise<WsBlock> {
  const index = sheet.blocks.findIndex((b) => b.id === blockId)
  const old = sheet.blocks[index]
  const images = embeddableImages(ws.sources)
  profile = profilFuerStufe(profile, stufeFuer(ws.meta, sheet.stars ?? null))
  const data = await ai<any>({
    system: systemPrompt(ws.meta, profile),
    user: [
      `Überarbeite Baustein (${index + 1}) des folgenden Arbeitsblatts. Behalte Typ${old.type === 'task' ? ', Anforderungsbereich' : ''} und Zweck bei und passe ihn in den Zusammenhang ein.`,
      instruction
        ? `Auftrag der Lehrkraft für diesen Baustein (genau umsetzen, alles andere möglichst beibehalten): ${instruction}`
        : feedback
          ? `Zu behebende Probleme: ${feedback}`
          : 'Formuliere ihn neu und verbessere ihn didaktisch.',
      levelInstruction(ws.meta, sheet.stars ?? null, profile),
      taskContext(ws.meta, profile),
      originalSourceRules(ws.meta, sheet.stars ?? null),
      `Gesamtes Arbeitsblatt:\n${describeSheet(sheet)}`,
      `Zu überarbeitender Baustein:\n${describeBlock(old)}`,
      'Für nicht benötigte Felder leere Werte verwenden.',
      materialText(ws.sources)
    ]
      .filter(Boolean)
      .join('\n\n'),
    images: materialImages(ws.sources),
    schemaName: 'worksheet_block',
    schema: obj({ block: FLAT_BLOCK })
  })
  // Von Hand vergebene Punkte bleiben stehen; die KI vergibt auf Arbeitsblättern keine
  const block = ohnePunkte(
    convertBlock({ ...data?.block, type: old.type }, createRng(randomSeed()), images, anredeFuerMeta(ws.meta)),
    old.type === 'task' ? old.points : 0
  )
  if (!block) throw new Error('Die KI hat keinen Baustein geliefert.')
  const neu = { ...block, id: old.id, stars: old.stars }
  // Nummern, die die KI schreibt, werden zu Kennungen – gezählt über das ganze Blatt; der neue Baustein steht an der Stelle des alten
  const [aufgeloest] = verschluesseleMaterialverweise(
    [neu],
    sheet.blocks.map((b) => (b.id === old.id ? neu : b))
  )
  return mitAnredePruefung(aufgeloest, sheet, ws.meta)
}

/**
 * Füllt einen noch LEEREN Baustein mit Inhalt, der an seine Stelle im Blatt passt.
 *
 * Wunsch der Lehrkraft (25.09.2026): „füge einen zauberstab in ‚bearbeiten & export' bei
 * einem noch leeren baustein hinzu, wodurch der inhalt hier von einer KI gefüllt wird."
 *
 * Ein eigener Weg neben `regenerateBlock`, weil der Auftrag ein anderer ist: Dort heißt es
 * „behalte Zweck und Inhalt bei und verbessere" – bei einem leeren Baustein gibt es weder
 * das eine noch das andere. Die KI erführe aus der Beschreibung nur, dass alle Felder leer
 * sind, und müsste raten, was gemeint ist.
 *
 * Stattdessen zählt hier die NACHBARSCHAFT: Was steht davor, was danach? Ein leerer Kasten
 * zwischen Material und erster Aufgabe wird etwas anderes als einer am Blattende.
 */
export async function fuelleBaustein(
  ws: Worksheet,
  sheet: Sheet,
  blockId: string,
  profile: LearnerProfile,
  ai: AiCall,
  /** Freier Wunsch der Lehrkraft, etwa „ein Beispiel aus dem Alltag" */
  wunsch = ''
): Promise<WsBlock> {
  const index = sheet.blocks.findIndex((b) => b.id === blockId)
  const old = sheet.blocks[index]
  if (!old) throw new Error('Der Baustein wurde nicht gefunden.')
  const images = embeddableImages(ws.sources)
  const nachbar = (i: number): string => (sheet.blocks[i] ? describeBlock(sheet.blocks[i]) : '')
  profile = profilFuerStufe(profile, stufeFuer(ws.meta, sheet.stars ?? null))
  const data = await ai<any>({
    system: systemPrompt(ws.meta, profile),
    user: [
      `Fülle den noch leeren Baustein (${index + 1}) des folgenden Arbeitsblatts. Er hat den Typ „${old.type}" und ist eben erst eingefügt worden – es gibt noch keinen Inhalt, den du übernehmen müsstest.`,
      'Entscheide aus dem Zusammenhang, was an dieser Stelle gebraucht wird, und formuliere es vollständig aus. Der Baustein muss zu Thema, Jahrgang und den übrigen Bausteinen passen und darf nichts wiederholen, was schon auf dem Blatt steht.',
      wunsch ? `Vorgabe der Lehrkraft (genau umsetzen): ${wunsch}` : '',
      index > 0 ? `Davor steht: ${nachbar(index - 1)}` : 'Er steht am Anfang des Blattes.',
      index < sheet.blocks.length - 1 ? `Danach folgt: ${nachbar(index + 1)}` : 'Er steht am Ende des Blattes.',
      levelInstruction(ws.meta, sheet.stars ?? null, profile),
      taskContext(ws.meta, profile),
      originalSourceRules(ws.meta, sheet.stars ?? null, ws.originalMaterial),
      `Gesamtes Arbeitsblatt:
${describeSheet(sheet)}`,
      'Für nicht benötigte Felder leere Werte verwenden.',
      materialText(ws.sources)
    ]
      .filter(Boolean)
      .join('\n\n'),
    images: materialImages(ws.sources),
    schemaName: 'worksheet_block',
    schema: obj({ block: FLAT_BLOCK })
  })
  // Von Hand vergebene Punkte bleiben stehen; die KI vergibt auf Arbeitsblättern keine
  const block = ohnePunkte(
    convertBlock({ ...data?.block, type: old.type }, createRng(randomSeed()), images, anredeFuerMeta(ws.meta)),
    old.type === 'task' ? old.points : 0
  )
  if (!block) throw new Error('Die KI hat keinen Baustein geliefert.')
  const neu = { ...block, id: old.id, stars: old.stars }
  // Nummern, die die KI schreibt, werden zu Kennungen – gezählt über das ganze Blatt; der neue Baustein steht an der Stelle des alten
  const [aufgeloest] = verschluesseleMaterialverweise(
    [neu],
    sheet.blocks.map((b) => (b.id === old.id ? neu : b))
  )
  return mitAnredePruefung(aufgeloest, sheet, ws.meta)
}

// ---------- Gesamtablauf ----------

export interface GenerateOptions {
  ai: AiCall
  review: boolean
  onProgress?: Progress
  /** Sparmodus: eine Anfrage je Niveaustufe (parallel), ohne KI-Prüfrunde (nur lokale Prüfungen) */
  combined?: boolean
}

function addSheetWarnings(sheet: Sheet, profile: LearnerProfile, meta?: WorksheetMeta): Sheet {
  const sheetWarnings = localChecks(sheet, profile, meta)
  if (sheetWarnings.length && sheet.blocks[0]) {
    sheet.blocks[0].warnings = [...(sheet.blocks[0].warnings ?? []), ...sheetWarnings.map((w) => `[Blatt] ${w.message}`)]
  }
  return sheet
}

/**
 * Alle lokalen Prüfungen eines Blattes neu laufen lassen – ohne KI (Paket 12).
 *
 * Nach „Mit KI beheben" muss sichtbar werden, ob der Hinweis wirklich weg ist – und ob die
 * Reparatur einen neuen verursacht hat. Die Hinweise der Prüfungen (`[Prüfung]`, `[Blatt]`,
 * `[Vollständigkeit]`) werden dafür weggeräumt und frisch ermittelt; Hinweise der KI-Prüfrunde
 * und Notizen bleiben stehen, die lassen sich ohne KI nicht neu bewerten.
 */
export function pruefeBlattNeu(sheet: Sheet, profile: LearnerProfile, meta: WorksheetMeta): Sheet {
  const blocks = sheet.blocks.map((b) => ({ ...b, warnings: (b.warnings ?? []).filter((w) => !/^\[(Prüfung|Blatt|Vollständigkeit)\]/.test(w)) }))
  const next: Sheet = { ...sheet, blocks }
  const findings = [...checkIntegrity(next), ...checkListening(next), ...checkVideo(next, meta), ...checkDemand(next), ...checkImages(next, meta)]
  for (const f of findings) {
    const b = next.blocks.find((x) => x.id === f.blockId)
    if (b) b.warnings = [...(b.warnings ?? []), `[Vollständigkeit] ${f.message}`]
  }
  return addSheetWarnings(next, profile, meta)
}

/** Formuliert alle Niveaufassungen aus, prüft sie und korrigiert schwerwiegende Probleme gezielt. */
export async function generateWorksheet(ws: Worksheet, profile: LearnerProfile, opts: GenerateOptions): Promise<Worksheet> {
  const { meta } = ws
  const levels: (Stars | null)[] =
    meta.differentiation.levels > 1 && meta.differentiation.mode === 'separate' ? ([1, 2, 3] as Stars[]).slice(0, meta.differentiation.levels) : [null]
  /*
   * Ein einziger Maßstab für den ganzen Lauf.
   *
   * Vorher zählte jede Phase für sich: Die Hörtexte meldeten durchweg „0 von n", und der
   * Sparmodus rechnete mit einer anderen Gesamtzahl als der normale Weg. Der Balken stand
   * dadurch still und sprang danach. Jetzt zählen Hörtexte und Niveaufassungen in derselben
   * Einheit.
   */
  const scriptCount = wantsListening(meta) ? listeningCount(meta) : 0
  const perLevel = opts.combined ? 1 : opts.review ? 3 : 1
  const total = scriptCount + levels.length * perLevel
  let done = 0
  const step = (msg: string): void => opts.onProgress?.(msg, done, total)

  /*
   * Den beschafften Originaltext setzt die APP ein, nicht die KI.
   *
   * Ein Sprachmodell, das einen Text „uebernimmt", aendert dabei Kleinigkeiten – ein Komma,
   * eine Schreibweise, ein Wort. Auf dem Blatt staende das mit Quellenangabe da und saehe aus
   * wie ein Zitat. Was die App selbst einsetzt, ist dagegen genau der Wortlaut, den sie
   * geladen und geprueft hat.
   */
  /*
   * Eingesetzt wird er DIREKT nach dem Ausformulieren, VOR den Prüfungen und der Nachbesserung
   * (Paket 12, 26.09.2026). Vorher kam er erst ganz am Ende hinzu: Die Prüfungen sahen ein
   * Blatt ohne Material und meldeten „Die Aufgabe verweist auf ‚M1‘, … kein Material so
   * bezeichnet" und „Es fehlt der deutsche Ausgangstext" – für einen Text, der auf dem fertigen
   * Blatt stand. Die Nachbesserung schrieb dann womöglich eine Aufgabe um, die in Ordnung war.
   */
  const mitMaterial = (sheet: Sheet): Sheet => {
    // Versuchsprotokoll (29.09.2026): Die App setzt den ausgearbeiteten Versuch selbst ein (didactics/protokoll.ts)
    const mitVersuch = setzeVersuchEin(sheet, meta)
    const mit = ws.originalMaterial ? setzeMaterialEin(mitVersuch, ws.originalMaterial, meta, newId) : mitVersuch
    // Gespeichert werden KENNUNGEN: Schreibt die KI trotzdem „M2", wird daraus die Kennung des Materials, das jetzt M2 ist.
    // Erst jetzt, wo alle Materialien an ihrem Platz stehen – auch der eingesetzte Ausgangstext. Die Nummern entstehen beim Darstellen.
    return { ...mit, blocks: verschluesseleMaterialverweise(mit.blocks) }
  }

  /*
   * Das Kuerzungsprotokoll gehoert in den Lehrkraft-Hinweis, nicht in eine Randnotiz.
   *
   * Die Lehrkraft verantwortet die Kuerzung, ohne den Originaltext daneben zu legen. Sie muss
   * deshalb sehen, wie viel wo fehlt – und vor allem, wenn die Pruefung einen Eingriff am
   * Wortlaut gefunden hat. Ein stillschweigend umformulierter Satz steht sonst mit
   * Quellenangabe auf dem Blatt und liest sich wie ein Zitat.
   */
  const metaMitProtokoll = (): WorksheetMeta => {
    const m = ws.originalMaterial
    if (!m) return meta
    const kopf = m.wortlautGeprueft
      ? `Originalquelle „${m.titel}": Wortlaut gegen die Fundstelle geprueft.`
      : `Originalquelle „${m.titel}": ACHTUNG – beim Abgleich mit der Fundstelle gab es Abweichungen. Vor dem Einsatz mit dem Original vergleichen.`
    // Zeilenweise – `didactics/hinweise.ts` gliedert daraus die Anzeige
    return { ...meta, teacherNote: [meta.teacherNote, kopf, ...m.protokoll].filter(Boolean).join('\n') }
  }

  // Der Hörtext entsteht zuerst und in einer eigenen Anfrage – auf Wunsch mit einem stärkeren
  // Modell. Erst danach werden die Aufgaben dazu geschrieben. Bei mehreren Niveaustufen hören
  // alle denselben Text; unterschieden wird über die Aufgaben.
  let scripts: ListeningScript[] = []
  if (wantsListening(meta)) {
    try {
      scripts = await writeListeningScripts(meta, profile, opts.ai, { provider: meta.audioProvider, model: meta.audioModel }, (i, n) =>
        opts.onProgress?.(n > 1 ? `Hörtext ${i + 1} von ${n} wird geschrieben …` : 'Der Hörtext wird geschrieben …', i, total)
      )
    } catch (e) {
      // Ohne eigenen Hörtext entsteht das Blatt trotzdem; die KI schreibt ihn dann mit
      scripts = []
      opts.onProgress?.(`Der Hörtext konnte nicht getrennt erzeugt werden (${e instanceof Error ? e.message : String(e)}).`, scriptCount, total)
    }
  }

  // Die geschriebenen Hörtexte sind erledigt – beide Wege zählen ab hier weiter
  done = scriptCount

  if (opts.combined) {
    // Sparmodus: jede Niveaustufe in genau einer Anfrage, alle gleichzeitig, ohne KI-Prüfrunde.
    // (Alle Stufen in EINER Antwort war im Praxistest unzuverlässig: bei drei vollständigen Blättern wurde die Antwort zu lang.)
    let finished = 0
    opts.onProgress?.(`${levels.length > 1 ? `${levels.length} Niveaustufen werden gleichzeitig` : 'Das Arbeitsblatt wird'} ausformuliert …`, done, total)
    const sheets = await runLimited(
      levels.map((level) => async () => {
        const label = level ? STAR_LABELS[level] : 'Arbeitsblatt'
        const stufe = stufeFuer(meta, level)
        const profil = profilFuerStufe(profile, stufe)
        let sheet = mitMaterial(await generateSheet(ws, profil, level, opts.ai, scripts))
        /*
         * Auch im Sparmodus: Die Vollständigkeitsprüfungen laufen und bessern einmal nach.
         *
         * Gespart wird die KI-PRÜFRUNDE, nicht die Prüfung auf Brauchbarkeit. Ein Blatt mit
         * einem Verweis auf ein Material, das es nicht gibt, oder mit einer Höraufgabe, deren
         * Lösung im Hörtext nicht vorkommt, spart kein Kontingent – es kostet Unterrichtszeit.
         * Sind keine schweren Befunde da, kostet das auch keine einzige Anfrage.
         */
        sheet = await repairSheet(ws, sheet, profil, opts.ai, () => undefined, label)
        // Sprache nachmessen und bei Abweichung umschreiben lassen (Entscheidung der Lehrkraft: automatisch)
        sheet = await lesbarkeitAngleichen(meta, sheet, profil, stufe, opts.ai)
        finished++
        opts.onProgress?.(`${label} fertig (${finished} von ${levels.length})`, done + finished, total)
        return addSheetWarnings(sheet, profil, meta)
      }),
      3
    )
    return { ...ws, meta: metaMitProtokoll(), sheets: expandObserverGroups(sheets) }
  }

  const sheets = await runLimited(
    levels.map((level) => async () => {
      const label = level ? STAR_LABELS[level] : 'Arbeitsblatt'
      const stufe = stufeFuer(meta, level)
      const profil = profilFuerStufe(profile, stufe)
      step(`${label}: wird ausformuliert …`)
      let sheet = mitMaterial(await generateSheet(ws, profil, level, opts.ai, scripts))
      done++
      if (opts.review) {
        step(`${label}: wird geprüft …`)
        const problems = await reviewSheet(ws, sheet, profil, opts.ai)
        done++
        const severe = problems.filter((p) => p.severity === 'hoch' && p.blockNumber > 0 && p.blockNumber <= sheet.blocks.length)
        step(`${label}: ${severe.length ? `${severe.length} Baustein(e) werden verbessert …` : 'keine Korrekturen nötig'}`)
        const byBlock = new Map<number, string[]>()
        for (const p of severe) byBlock.set(p.blockNumber, [...(byBlock.get(p.blockNumber) ?? []), p.problem])
        const blocks = [...sheet.blocks]
        await runLimited(
          [...byBlock.entries()].map(([num, msgs]) => async () => {
            try {
              blocks[num - 1] = await regenerateBlock({ ...ws, sheets: [sheet] }, sheet, sheet.blocks[num - 1].id, profil, opts.ai, msgs.join(' '))
            } catch {
              blocks[num - 1] = { ...blocks[num - 1], warnings: [...(blocks[num - 1].warnings ?? []), ...msgs] }
            }
          }),
          3
        )
        sheet = { ...sheet, blocks }
        // Mittlere Hinweise für die Lehrkraft sichtbar machen
        for (const p of problems.filter((x) => x.severity !== 'hoch')) {
          const b = sheet.blocks[p.blockNumber - 1]
          if (b) b.warnings = [...(b.warnings ?? []), `[KI-Hinweis] ${p.problem}`]
        }
        done++
      }
      // Vollständigkeit: tote Materialverweise, leeres Material, gleiche Reihenfolge in
      // Vergleichslisten. Läuft auf beiden Wegen – der Sparmodus tut dasselbe weiter oben.
      sheet = await repairSheet(ws, sheet, profil, opts.ai, step, label)
      // Sprache nachmessen und bei Abweichung umschreiben lassen (Entscheidung der Lehrkraft: automatisch)
      sheet = await lesbarkeitAngleichen(meta, sheet, profil, stufe, opts.ai, (m) => step(`${label}: ${m}`))
      const sheetWarnings = localChecks(sheet, profil, ws.meta)
      if (sheetWarnings.length && sheet.blocks[0]) {
        sheet.blocks[0].warnings = [...(sheet.blocks[0].warnings ?? []), ...sheetWarnings.map((w) => `[Blatt] ${w.message}`)]
      }
      return sheet
    }),
    3
  )

  return { ...ws, meta: metaMitProtokoll(), sheets: expandObserverGroups(sheets) }
}

/**
 * Einen einzelnen Gliederungspunkt von der KI beschreiben lassen.
 *
 * Für den Knopf neben jedem Baustein: Die Lehrkraft legt Art, Anforderungsbereich, Operator,
 * Sozialform und Antwortform fest – die KI füllt nur, WAS darin stehen soll. Die Vorgaben
 * sind nicht verhandelbar, sonst wäre der Knopf ein Glücksspiel.
 */
export async function suggestOutlineItem(
  ws: Pick<Worksheet, 'meta' | 'sources'>,
  profile: LearnerProfile,
  outline: Outline,
  index: number,
  ai: AiCall,
  /** Änderungswunsch der Lehrkraft (27.09.2026): „anders gestalten", „umformulieren", „als Partnerarbeit" … */
  wunsch = ''
): Promise<{ purpose: string; operator: string }> {
  const item = outline.items[index]
  const umgebung = outline.items
    .map((it, i) => `${i === index ? '>>' : '  '} ${i + 1}. ${it.type}: ${it.purpose || '(dieser Baustein wird gerade beschrieben)'}`)
    .join('\n')
  const data = await ai<{ purpose?: string; operator?: string }>({
    system: systemPrompt(ws.meta, profile),
    user: [
      `Beschreibe NUR den mit >> markierten Gliederungspunkt (Nummer ${index + 1}) des folgenden Arbeitsblatts.`,
      taskContext(ws.meta, profile),
      `Titel: ${outline.title}`,
      `Lernziele: ${outline.learningGoals.join('; ')}`,
      umgebung,
      '',
      'VERBINDLICHE VORGABEN für diesen Baustein – ändere sie nicht:',
      `- Art des Bausteins: ${item.type}`,
      item.type === 'task' ? `- Anforderungsbereich: ${item.afb ?? 'II'}` : '',
      item.type === 'task' && item.operator ? `- Operator: ${item.operator}` : '',
      item.type === 'task' ? `- Sozialform: ${item.socialForm}` : '',
      item.type === 'task' ? `- Antwortform: ${item.answerKind}` : '',
      item.stars ? `- Niveaustufe: ${'*'.repeat(item.stars)}` : '',
      '',
      wunsch.trim()
        ? `ÄNDERUNGSWUNSCH der Lehrkraft (genau umsetzen, alles andere möglichst beibehalten): ${wunsch.trim()}${item.purpose.trim() ? `\nBisherige Beschreibung: ${item.purpose.trim()}` : ''}`
        : '',
      'Antworte mit „purpose": ein bis zwei Sätze, WAS dieser Baustein enthält bzw. verlangt – so genau, dass sich daraus das Blatt ausformulieren lässt. Er darf nicht wiederholen, was die anderen Bausteine schon leisten.',
      item.type === 'task' && !item.operator ? 'Nenne in „operator" den passenden Operator; sonst lasse das Feld leer.' : 'Lasse „operator" leer.',
      materialText(ws.sources)
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'outline_item',
    schema: obj({ purpose: str('Was dieser Baustein enthält bzw. verlangt (1–2 Sätze)'), operator: str('Operator der Aufgabe, sonst leer') })
  })
  return { purpose: String(data?.purpose ?? '').trim(), operator: String(data?.operator ?? '').trim() }
}
