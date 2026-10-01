// Prüfmodus: stellt die echten Abläufe (KI, Bildsuche, KI-Prüfung, Tafelbild) für automatisierte Qualitätsprüfungen bereit.
// Wird nur geladen, wenn die App mit SCHULAPPS_SELFTEST=1 gestartet wird.
import { useRueckmeldung } from './modules/rueckmeldung/store'
import { useElternbrief } from './modules/elternbrief/store'
import { useTafelbild } from './modules/tafelbild/store'
import { cleanImageBackground } from './shared/imageCleanup'
import { normalizeImage } from './shared/util'
import { browserWorksheetImageDeps } from './modules/arbeitsblatt/generation/browserImages'
import { useAppSettings } from './shared/settingsStore'
import { bewerte } from './modules/arbeitsblatt/generation/textQualitaet'
import { finishWorksheet } from './modules/arbeitsblatt/generation/finish'
import { generateOutline, generateWorksheet } from './modules/arbeitsblatt/generation/generate'
import { browserMaterialDienste, browserSourceServices } from './modules/arbeitsblatt/generation/originalSources'
import { emptyAnswer } from './modules/arbeitsblatt/model/factory'
import type { PagePlan } from './modules/arbeitsblatt/render/paginate'
import { defaultMeta } from './modules/arbeitsblatt/model/defaults'
import { defaultExamMeta } from './modules/klassenarbeit/model/defaults'
import { defaultTestMeta } from './modules/grammatiktest/model/defaults'
import type { GrammarTest } from './modules/grammatiktest/model/types'
import { useGrammatiktest } from './modules/grammatiktest/store'
import type { Exam } from './modules/klassenarbeit/model/types'
import { useKlassenarbeit } from './modules/klassenarbeit/store'
import { defaultAxes, GRID_KINDS, gridDefaults } from './modules/arbeitsblatt/model/grid'
import { gridDrawing } from './modules/arbeitsblatt/render/gridSvg'
import { subjectById } from './modules/arbeitsblatt/model/subjects'
import type { BoardPlan, GridBlock, GridKind, OriginalMaterialAblage, TaskPart, Worksheet, WorksheetMeta, WsBlock } from './modules/arbeitsblatt/model/types'
import { setzeMaterialEin } from './modules/arbeitsblatt/generation/originalmaterial'
import { profileFromMeta } from './modules/arbeitsblatt/render/SheetPages'
import { expandObserverGroups } from './modules/arbeitsblatt/render/observerGroups'
import { aiCall as wsAi, useArbeitsblatt } from './modules/arbeitsblatt/store'
import { analyzeVocab } from './modules/vokabeltest/generation/generate'
import { pictureOptions } from './modules/vokabeltest/generation/pictureOptions'
import type { PictureItem, TestSettings, VocabEntry } from './modules/vokabeltest/model/types'
import { aiCall as vtAi, useVokabeltest } from './modules/vokabeltest/store'
import { defaultHeader } from './modules/vokabeltest/generation/generate'
import { TASK_TYPES } from './modules/vokabeltest/generation/taskTypes'
import { createRng } from './modules/vokabeltest/model/random'
import type { TestDocument } from './modules/vokabeltest/model/types'
import { presetDesigns } from '@shared/design'
import { pdfTexte, renderPages } from './shared/components/PrintPreview'
import { bereichAnlegen, neuImBereich, themenbereichName } from './shared/themenbereiche'
import { mitThemenbereich } from './shared/ueberthema'
import { deckblattBilder } from './modules/arbeitsblatt/render/deckblattBilder'
import { buildWorksheetHtml } from './modules/arbeitsblatt/render/printHtml'
import { useLernzielkontrolle } from './modules/lernzielkontrolle/store'
import { emptyKurztest } from './modules/lernzielkontrolle/model/defaults'
import type { Kurztest } from './modules/lernzielkontrolle/model/types'
import { openSavedKurztest, saveCurrentKurztest } from './modules/lernzielkontrolle/library'
import { blattOffen } from './modules/arbeitsblatt/library'
import { starteAuftrag } from './shared/auftraege'
import { standardFormat as standardFormatFuer, standardMinuten } from './modules/lernzielkontrolle/didactics/formate'
import { generateKurztest } from './modules/lernzielkontrolle/generation/generateKurztest'
import { aiCall as lzkAi } from './modules/lernzielkontrolle/store'
import { pruefeKurztest } from './modules/lernzielkontrolle/didactics/pruefungen'
import { profilFuer } from './modules/lernzielkontrolle/didactics/operatoren'
import { themenFuer, themenHinweis } from './modules/lernzielkontrolle/didactics/themen'
import { fussnotenBlatt, seitenrandBlatt, vtSeitenrand, type SeitenrandArt } from './selftestSeitenrand'
import { buildWorksheetDocx } from './modules/arbeitsblatt/export/docx'
import { browserDocxDeps } from './modules/arbeitsblatt/export/browserDeps'
import { strFromU8, unzipSync } from 'fflate'

/**
 * Ein einzelner stiller MP3-Frame (MPEG-1 Layer III, 44,1 kHz).
 * Klein genug für den Prüflauf, aber eine gültige Datei – eine leere Datei würde beim
 * Einbetten stillschweigend übersprungen und die Prüfung liefe ins Leere.
 */
const STILLE_MP3 = '//uQZAAAAAAAaQAAAAAAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV'

const thumb = async (dataUrl?: string): Promise<string | undefined> => (dataUrl ? normalizeImage(dataUrl, 480, 'jpeg').catch(() => undefined) : undefined)

async function worksheet(
  input: Partial<WorksheetMeta> & {
    stateId: string
    schoolTypeId: string
    schoolTypeName: string
  }
) {
  const started = Date.now()
  const log: string[] = []
  const meta: WorksheetMeta = {
    ...defaultMeta(input.stateId, input.schoolTypeId, input.schoolTypeName),
    pages: 1,
    boardPlan: true,
    ...input,
    subjectLabel: subjectById(input.subjectId ?? 'biologie').label
  }
  const ws: Worksheet = {
    version: 1,
    meta,
    design: presetDesigns()[0],
    outline: null,
    sheets: [],
    sources: [],
    createdAt: new Date().toISOString()
  }
  const profile = profileFromMeta(meta)
  ws.outline = await generateOutline(meta, profile, [], wsAi)
  log.push(`Gliederung ${Math.round((Date.now() - started) / 1000)} s`)
  const result = await generateWorksheet(ws, profile, {
    ai: wsAi,
    review: false,
    combined: true
  })
  log.push(`Blatt ${Math.round((Date.now() - started) / 1000)} s`)
  await finishWorksheet(
    result,
    profile,
    {
      ai: wsAi,
      images: await browserWorksheetImageDeps(),
      sources: browserSourceServices()
    },
    (m) => log.push(m)
  )
  log.push(`fertig ${Math.round((Date.now() - started) / 1000)} s`)
  const blocks = result.sheets.flatMap((s) => s.blocks)
  return {
    subject: meta.subjectLabel,
    topic: meta.topic,
    grade: meta.grade,
    log,
    teacherNote: result.meta.teacherNote,
    outline: result.outline?.items.map((i) => `${i.type}: ${i.purpose}`),
    images: await Promise.all(
      blocks
        .filter((b) => b.type === 'image')
        .map(async (b) =>
          b.type === 'image'
            ? {
                caption: b.caption,
                description: b.description,
                search: b.search,
                original: b.original,
                source: b.items?.length ? `Bildreihe: ${b.items.map((it) => it.image?.source ?? 'fehlt').join('/')}` : b.image?.source,
                credit: b.image?.credit,
                warnings: b.warnings,
                thumb: await thumb(b.image?.dataUrl ?? b.items?.find((it) => it.image)?.image?.dataUrl)
              }
            : null
        )
    ),
    texts: blocks.filter((b) => b.type === 'text').map((b) => (b.type === 'text' ? { title: b.title, source: b.source, warnings: b.warnings } : null)),
    board: result.board,
    worksheet: result
  }
}

async function vocab(input: { targetLanguage: string; grade: number; level: TestSettings['level']; words: { term: string; translation: string }[] }) {
  const settings: TestSettings = {
    targetLanguage: input.targetLanguage,
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 1,
    grade: input.grade,
    level: input.level,
    vocabCount: input.words.length,
    variantCount: 1,
    variantMode: 'sameVocab',
    tasks: [],
    topic: '',
    pictureSource: 'auto',
    answerKey: true,
    seed: 1
  }
  const entries: VocabEntry[] = input.words.map((w, i) => ({
    id: `v${i}`,
    term: w.term,
    translation: w.translation
  }))
  const analysed = await analyzeVocab(entries, settings, vtAi)
  const depictable = analysed.filter((v) => v.depictable)
  const items: PictureItem[] = depictable.map((v) => ({
    id: `i-${v.id}`,
    vocabId: v.id,
    answer: v.term,
    imageKeywords: v.imageKeywords ?? [v.term]
  }))
  const opts = await pictureOptions('auto')
  const notes = items.length ? await opts.findImages!(items, analysed, settings) : []
  return {
    language: input.targetLanguage,
    notes,
    words: await Promise.all(
      analysed.map(async (v) => {
        const item = items.find((i) => i.vocabId === v.id)
        return {
          term: v.term,
          translation: v.translation,
          depictable: v.depictable,
          keywords: v.imageKeywords,
          hint: v.imageHint,
          source: item?.image?.source,
          credit: item?.image?.credit,
          thumb: await thumb(item?.image?.dataUrl)
        }
      })
    )
  }
}

/**
 * Rahmendaten einer offenen Klassenarbeit bzw. eines Kurztests setzen – für Wachen, die
 * Oberfläche prüfen, ohne sich durch verschachtelte Auswahlfelder zu klicken.
 */
function kaMetaSetzen(patch: Partial<Exam['meta']>): boolean {
  const s = useKlassenarbeit.getState()
  if (!s.exam) return false
  s.update((d) => Object.assign(d.meta, patch))
  return true
}

function lzkMetaSetzen(patch: Partial<Kurztest['meta']>): boolean {
  const s = useLernzielkontrolle.getState()
  if (!s.test) return false
  s.update((d) => Object.assign(d.meta, patch))
  return true
}

/**
 * Legt eine fertige Klassenarbeit in den Zustand, ohne die KI zu bemühen.
 * Damit lässt sich prüfen, dass die erzeugte Arbeit angezeigt wird (kein weißer Bildschirm).
 */
function exam(): { parts: number; blocks: number } {
  const state = useKlassenarbeit.getState()
  const design = presetDesigns()[0]
  const block = (id: string): WsBlock => ({
    id,
    type: 'task',
    instruction: '**Tick** the correct answer.',
    operator: 'tick',
    afb: 'I',
    afbReason: '',
    socialForm: 'EA',
    minutes: 5,
    points: 3,
    solution: 'a)',
    answer: {
      ...emptyAnswer('multipleChoice'),
      options: ['York', 'Leeds', 'Hull'],
      correct: [0]
    },
    parts: []
  })
  const ready: Exam = {
    version: 1,
    design,
    createdAt: new Date().toISOString(),
    meta: {
      ...defaultExamMeta('NI', 'gymnasium', 'Gymnasium'),
      topic: 'Going abroad',
      content: 'simple past'
    },
    parts: [
      {
        id: 'p1',
        formatId: 'en-reading',
        label: 'Reading comprehension',
        competence: 'Leseverstehen',
        weight: 30,
        points: 21,
        minutes: 27,
        gradeGroup: 'other',
        afbMix: { I: 30, II: 45, III: 25 },
        blocks: [block('b1'), block('b2')]
      },
      {
        id: 'p2',
        formatId: 'en-writing',
        label: 'Writing',
        competence: 'Schreiben',
        weight: 70,
        points: 0,
        minutes: 63,
        gradeGroup: 'writing',
        contentShare: 40,
        afbMix: { I: 20, II: 50, III: 30 },
        blocks: [block('b3')]
      }
    ]
  }
  state.setExam(ready)
  state.setStep(1)
  return {
    parts: ready.parts.length,
    blocks: ready.parts.reduce((n, p) => n + p.blocks.length, 0)
  }
}

/**
 * Legt ein Arbeitsblatt mit Filmbeobachtung in den Zustand, ohne die KI zu bemühen.
 *
 * Damit lässt sich ansehen, was am Ende auf dem Papier steht: QR-Code samt Klartextlink,
 * die Zwischenüberschriften der drei Phasen und die Kennzeichnung der Beobachtergruppen.
 * Der Code wird gelesen, nicht nur geschrieben – aus derselben Erfahrung wie bei den
 * Piktogrammen, wo gefüllte Pfade erst im Bild als falsch auffielen.
 */
function videoSheet(groups = 2): { sheets: number; labels: string[] } {
  const state = useArbeitsblatt.getState()
  const meta: WorksheetMeta = {
    ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
    subjectId: 'deutsch',
    subjectLabel: 'Deutsch',
    topic: 'Kurzfilm „Schwarzfahrer“',
    grade: 9,
    pages: 1,
    video: {
      title: 'Schwarzfahrer (1993)',
      url: 'https://www.youtube.com/watch?v=BpnEZLKp1hA',
      kind: 'kurzfilm',
      platform: 'YouTube',
      minutes: 12,
      section: '',
      summary: '',
      during: 'auto',
      groups
    }
  }
  const videoBlock: WsBlock = {
    id: 'v1',
    type: 'video',
    title: 'Film',
    kind: 'kurzfilm',
    sourceTitle: 'Schwarzfahrer (1993), Regie: Pepe Danquart',
    url: 'https://www.youtube.com/watch?v=BpnEZLKp1hA',
    platform: 'YouTube',
    minutes: 12,
    section: '',
    summary: 'Ein Kurzfilm über eine Straßenbahnfahrt in Berlin.',
    beforeViewing: 'Lies zuerst deinen Beobachtungsauftrag. Der Film wird zweimal gezeigt.',
    plays: 2,
    teacherNote: 'Zeitmarken: erster Wortwechsel ab 02:10, Wendepunkt ab 10:40. Angaben am Film prüfen.'
  }
  const task = (id: string, phase: 'vor' | 'waehrend' | 'nach', instruction: string, group?: string): WsBlock => ({
    id,
    type: 'task',
    instruction,
    operator: instruction.split(' ')[0],
    afb: phase === 'nach' ? 'II' : 'I',
    afbReason: '',
    socialForm: 'EA',
    minutes: 5,
    points: 0,
    solution: 'Erwartungshorizont …',
    answer: emptyAnswer(phase === 'waehrend' ? 'trueFalse' : 'lines'),
    parts: [],
    viewingPhase: phase,
    videoId: 'v1',
    ...(group ? { observerGroup: group } : {})
  })
  const blocks: WsBlock[] = [
    videoBlock,
    task('t1', 'vor', '**Sammle**, was du über Zivilcourage weißt.'),
    task('t2', 'waehrend', '**Kreuze an**, welche Aussagen zutreffen.', groups > 1 ? 'A' : undefined),
    ...(groups > 1 ? [task('t3', 'waehrend', '**Kreuze an**, wie die Kamera die Frau zeigt.', 'B')] : []),
    task('t4', 'nach', '**Erläutere**, wie der Film seine Wirkung erzeugt.')
  ]
  const ws: Worksheet = {
    version: 1,
    meta,
    design: presetDesigns()[0],
    outline: null,
    sheets: expandObserverGroups([{ id: 's1', label: 'Arbeitsblatt', blocks }]),
    sources: [],
    createdAt: new Date().toISOString()
  }
  // Schritt 2 ist der Editor; setzt zugleich das angezeigte Blatt
  state.loadWorksheet(ws, 2)
  return { sheets: ws.sheets.length, labels: ws.sheets.map((s) => s.label) }
}

/**
 * Legt ein Arbeitsblatt an, das JEDE ausfüllbare Stelle einmal enthält – ohne KI.
 *
 * Für die Prüfung des ausfüllbaren PDFs: Schreiblinien, Ankreuzkästchen, Lücken im Text,
 * eine freie Fläche und die Kästchen einer Zuordnung. Bleibt eine Art davon im PDF ohne
 * Feld, fällt es hier auf und nicht erst der Lehrkraft.
 */
function fillableSheet(): { blocks: number } {
  const state = useArbeitsblatt.getState()
  const blocks: WsBlock[] = [
    {
      id: 'f1',
      type: 'task',
      instruction: '**Beantworte** die Frage in ganzen Sätzen.',
      operator: 'beantworte',
      afb: 'II',
      afbReason: '',
      socialForm: 'EA',
      minutes: 5,
      points: 0,
      solution: '',
      answer: { ...emptyAnswer('lines'), count: 4 },
      parts: []
    },
    {
      id: 'f2',
      type: 'task',
      instruction: '**Kreuze** die richtige Antwort an.',
      operator: 'kreuze an',
      afb: 'I',
      afbReason: '',
      socialForm: 'EA',
      minutes: 3,
      points: 0,
      solution: '',
      answer: {
        ...emptyAnswer('multipleChoice'),
        options: ['Berlin', 'Hamburg', 'München'],
        correct: [0]
      },
      parts: []
    },
    {
      id: 'f3',
      type: 'task',
      instruction: '**Ergänze** die Lücken.',
      operator: 'ergänze',
      afb: 'I',
      afbReason: '',
      socialForm: 'EA',
      minutes: 4,
      points: 0,
      solution: '',
      answer: {
        ...emptyAnswer('gapText'),
        gapText: 'Die Hauptstadt von Frankreich ist [[Paris]]. Sie liegt an der [[Seine]].'
      },
      parts: []
    },
    {
      id: 'f4',
      type: 'task',
      instruction: '**Zeichne** ein Schaubild.',
      operator: 'zeichne',
      afb: 'II',
      afbReason: '',
      socialForm: 'EA',
      minutes: 8,
      points: 0,
      solution: '',
      answer: { ...emptyAnswer('space'), heightMm: 40 },
      parts: []
    },
    {
      id: 'f5',
      type: 'task',
      instruction: '**Ordne** zu.',
      operator: 'ordne zu',
      afb: 'I',
      afbReason: '',
      socialForm: 'EA',
      minutes: 4,
      points: 0,
      solution: '',
      answer: {
        ...emptyAnswer('matching'),
        left: ['Frankreich', 'Italien'],
        right: ['Paris', 'Rom'],
        pairs: [0, 1]
      },
      parts: []
    }
  ]
  const ws: Worksheet = {
    version: 1,
    meta: {
      ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
      subjectId: 'erdkunde',
      subjectLabel: 'Erdkunde / Geographie',
      topic: 'Europa',
      grade: 7,
      pages: 1
    },
    design: presetDesigns()[0],
    outline: null,
    sheets: [{ id: 's1', label: 'Arbeitsblatt', blocks }],
    sources: [],
    createdAt: new Date().toISOString()
  }
  state.loadWorksheet(ws, 2)
  return { blocks: blocks.length }
}

/**
 * Ein PDF als Bilder – damit sich die LAGE der Formularfelder ansehen lässt.
 *
 * Die Zahl der Felder sagt nichts darüber, ob sie an der richtigen Stelle sitzen. Eine
 * falsche Umrechnung px→pt verschiebt alle gleichmäßig, und das fällt nur im Bild auf.
 */
async function renderPdf(data: number[]): Promise<string[]> {
  return renderPages(new Uint8Array(data))
}

/**
 * Die BEDRUCKTE Fläche je Seite eines PDF – in Prozent der Seite.
 *
 * Gemeldet von der Lehrkraft (24.09.2026): Auf ihrem PDF sass der Inhalt nur im oberen
 * Drittel der Seite. Am Bildschirm ist alles richtig, im PDF nicht – nachweisen liess sich
 * das bisher nur mit dem Auge. Diese Messung macht es zu einer Zahl: Wo hört die Tinte auf?
 *
 * Gemessen wird auf dem gerasterten Bild: Jede Zeile und Spalte, die nicht durchgehend weiss
 * ist, gilt als bedruckt.
 */
async function pdfFlaeche(data: number[]): Promise<
  {
    seite: number
    links: number
    rechts: number
    oben: number
    unten: number
  }[]
> {
  const bilder = await renderPages(new Uint8Array(data))
  const aus: {
    seite: number
    links: number
    rechts: number
    oben: number
    unten: number
  }[] = []
  for (const [i, url] of bilder.entries()) {
    const bild = await new Promise<HTMLImageElement>((ok, fehler) => {
      const el = new Image()
      el.onload = () => ok(el)
      el.onerror = fehler
      el.src = url
    })
    const c = document.createElement('canvas')
    c.width = bild.naturalWidth
    c.height = bild.naturalHeight
    const ctx = c.getContext('2d')!
    ctx.drawImage(bild, 0, 0)
    const { data: px, width, height } = ctx.getImageData(0, 0, c.width, c.height)
    let minX = width
    let maxX = -1
    let minY = height
    let maxY = -1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const k = (y * width + x) * 4
        // Toleranz gegen JPEG-Rauschen: erst deutlich unter Weiss gilt als Tinte
        if (px[k] < 230 || px[k + 1] < 230 || px[k + 2] < 230) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    const proz = (v: number, ganz: number): number => Math.round((v / ganz) * 1000) / 10
    aus.push({
      seite: i + 1,
      links: maxX < 0 ? -1 : proz(minX, width),
      rechts: maxX < 0 ? -1 : proz(maxX, width),
      oben: maxY < 0 ? -1 : proz(minY, height),
      unten: maxY < 0 ? -1 : proz(maxY, height)
    })
  }
  return aus
}

/**
 * Druck-HTML und Hörtexte für die PDF-Prüfung – genau so, wie der Export sie übergibt.
 *
 * Absichtlich hier und nicht in der Wache nachgebaut: Eine Wache, die den Ablauf nachbildet,
 * prüft am Ende sich selbst. So läuft sie über denselben Weg wie der echte Export.
 */
function audioPdfInput(): {
  html: string
  audio: { id: string; fileName: string; title: string; base64: string }[]
} {
  const ws = useArbeitsblatt.getState().worksheet
  if (!ws) throw new Error('Kein Arbeitsblatt geladen.')
  const audio = ws.sheets
    .flatMap((s) => s.blocks)
    .filter((b): b is Extract<WsBlock, { type: 'audio' }> => b.type === 'audio' && Boolean(b.audio?.dataUrl))
    .map((b) => ({
      id: b.id,
      fileName: b.audio!.fileName || 'hoertext.mp3',
      title: b.title || 'Hörtext',
      base64: b.audio!.dataUrl!.slice(b.audio!.dataUrl!.indexOf(',') + 1)
    }))
  const html = buildWorksheetHtml(
    ws,
    new Map(),
    {
      sheetIds: ws.sheets.map((s) => s.id),
      includeKey: false,
      audioAttached: audio.length > 0
    },
    null,
    ''
  )
  return { html, audio }
}

/**
 * Prueflatt mit FORMELN in allen Antwortformen - ohne KI.
 *
 * Anlass: In einer Lernzielkontrolle zu den Potenzgesetzen stand in Zuordnungen und
 * Ausfuelltabellen `$b^4\cdot b^3=b^7$` woertlich auf dem Blatt, waehrend dieselbe Formel
 * in der Arbeitsanweisung sauber gesetzt war. Ursache: Dort lief `RichText`, in den Zellen
 * nur `Editable` - und das gibt reinen Text aus.
 */
function mathSheet(): { blocks: number } {
  const state = useArbeitsblatt.getState()
  type TaskBlock = Extract<WsBlock, { type: 'task' }>
  const aufgabe = (id: string, instruction: string, answer: TaskBlock['answer']): WsBlock => ({
    id,
    type: 'task',
    instruction,
    operator: instruction.split(' ')[0],
    afb: 'I',
    afbReason: '',
    socialForm: 'EA',
    minutes: 5,
    points: 0,
    solution: '',
    answer,
    parts: []
  })
  const blocks: WsBlock[] = [
    aufgabe('m1', '**Berechne** die Werte von $(-3)^4$ und $5^0$.', {
      ...emptyAnswer('tableFill'),
      headers: ['Potenz', 'Wert'],
      rows: [
        ['$(-3)^4$', ''],
        ['$5^0$', ''],
        ['$7^3$', '']
      ],
      solutionRows: [
        ['$(-3)^4$', '81'],
        ['$5^0$', '1'],
        ['$7^3$', '343']
      ]
    }),
    aufgabe('m2', '**Ordne** jeder Umformung das passende Potenzgesetz zu.', {
      ...emptyAnswer('matching'),
      left: ['$b^4 \\cdot b^3 = b^7$', '$(c^2)^5 = c^{10}$'],
      right: ['Produktgesetz bei gleicher Basis', 'Potenzieren einer Potenz'],
      pairs: [0, 1]
    }),
    aufgabe('m3', '**Kreuze** die richtige Umformung an.', {
      ...emptyAnswer('multipleChoice'),
      options: ['$a^3 + a^3 = a^6$', '$a^3 \\cdot a^3 = a^6$', '$a^3 + a^3 = 2a^3$'],
      correct: [1]
    }),
    /*
     * Gemeinsames Material mit einer Formel im TABELLENKOPF.
     * Die Zeilen liefen schon immer über RichText, der Kopf aber über Editable – dort stand
     * die Formel deshalb wörtlich da, eine Zeile über derselben gesetzten Formel.
     */
    {
      id: 'm4',
      type: 'table',
      title: 'Potenzgesetze im Überblick',
      headers: ['Gesetz', 'Beispiel mit $a$'],
      rows: [
        ['$a^m \\cdot a^n = a^{m+n}$', '$a^2 \\cdot a^3 = a^5$'],
        ['$(a^m)^n = a^{m \\cdot n}$', '$(a^2)^3 = a^6$']
      ]
    }
  ]
  const ws: Worksheet = {
    version: 1,
    meta: {
      ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
      subjectId: 'mathematik',
      subjectLabel: 'Mathematik',
      topic: 'Potenzgesetze',
      grade: 10,
      pages: 1,
      // Auch das Deckblatt lief bis zuletzt ueber Editable und gab Formeln als Text aus
      coverPage: true,
      title: 'Rechnen mit $a^m \\cdot a^n$',
      coverText: 'Ein Blatt zu den Potenzgesetzen, von $a^0 = 1$ bis $(a^m)^n$.'
    },
    design: presetDesigns()[0],
    outline: null,
    sheets: [{ id: 's1', label: 'Arbeitsblatt', blocks }],
    sources: [],
    createdAt: new Date().toISOString()
  }
  state.loadWorksheet(ws, 2)
  return { blocks: blocks.length }
}

/**
 * Eine fertige Lernzielkontrolle im Zustand ablegen - ohne KI.
 *
 * Bewusst mit den Fehlern aus der vorgelegten Potenzgesetze-Kontrolle bestueckt, damit die
 * Pruefungen in der Oberflaeche sichtbar anschlagen: „Bestimme" fuer eine Zuordnung,
 * „Deute" ohne Sachzusammenhang, zwei Operatoren in einer Aufgabe - und ein Merkkasten, der
 * auf einem Pruefungsblatt nichts zu suchen hat.
 */
/** Speichert die aktuelle Lernzielkontrolle und liefert die Bibliothek zurueck. */
async function lzkSpeichern(name: string) {
  await saveCurrentKurztest(name)
  const liste = await window.api.kurztests.list()
  return {
    anzahl: liste.length,
    namen: liste.map((e) => e.name),
    erste: liste[0] ?? null
  }
}

/**
 * Der ganze Weg durch die Bibliothek: speichern, verwerfen, wieder oeffnen.
 *
 * Geprueft wird nicht, OB etwas zurueckkommt, sondern ob es DASSELBE ist. Der Inhalt laeuft
 * durch JSON; verliert die Serialisierung ein Feld, faellt es nur beim Vergleich auf.
 */
async function lzkRundreise(name: string) {
  const state = useLernzielkontrolle.getState()
  const vorher = state.test
  if (!vorher) throw new Error('Keine Lernzielkontrolle im Zustand.')
  const abbild = (t: Kurztest) => ({
    fach: t.meta.subjectId,
    thema: t.meta.thema,
    bezeichnung: t.meta.bezeichnung,
    minuten: t.meta.minutes,
    stufe: t.meta.stufe,
    bereich: t.meta.bewertung.bereich ? `${t.meta.bewertung.bereich.min}-${t.meta.bewertung.bereich.max}` : 'keiner',
    varianten: t.varianten.length,
    bausteine: t.varianten.flatMap((v) =>
      v.blocks.map((b) => ({
        typ: b.type,
        text: b.type === 'task' ? b.instruction : b.type === 'text' ? b.body : '',
        punkte: b.type === 'task' ? b.points : 0,
        loesung: b.type === 'task' ? b.solution : '',
        teile: b.type === 'task' ? b.parts.map((t2) => t2.instruction) : [],
        antwortform: b.type === 'task' ? b.answer.kind : ''
      }))
    )
  })
  const davor = abbild(vorher)

  await saveCurrentKurztest(name)
  const gespeichert = useLernzielkontrolle.getState().docId ?? ''

  // Zustand verwerfen – so wie beim Schliessen des Programms
  useLernzielkontrolle.getState().reset()
  const leer = useLernzielkontrolle.getState().test === null

  await openSavedKurztest(gespeichert)
  const danach = useLernzielkontrolle.getState().test
  const nachher = danach ? abbild(danach) : null

  return {
    id: gespeichert,
    zwischendurchLeer: leer,
    gleich: JSON.stringify(davor) === JSON.stringify(nachher),
    davor,
    nachher,
    schritt: useLernzielkontrolle.getState().step,
    name: useLernzielkontrolle.getState().docName
  }
}

/** Zaehlt, wie viele Eintraege die Bibliothek hat - und wie sie heissen. */
async function lzkBibliothek() {
  const liste = await window.api.kurztests.list()
  return {
    anzahl: liste.length,
    namen: liste.map((e) => e.name),
    ids: liste.map((e) => e.id)
  }
}

/** Loescht einen Eintrag aus der Bibliothek. */
async function lzkLoeschen(id: string) {
  const liste = await window.api.kurztests.delete(id)
  return { anzahl: liste.length }
}

/** Stellt Land, Fach und Stufe ein und bleibt in Schritt 1 – fuer Bildschirmabzuege. */
function lzkEinstellung(stateId: string, fach: string, stufe: 'sek1' | 'sek2'): { profil: string } {
  const state = useLernzielkontrolle.getState()
  const test = state.test ?? emptyKurztest(stateId, 'gymnasium', 'Gymnasium')
  test.meta = {
    ...test.meta,
    stateId,
    subjectId: fach,
    subjectLabel: subjectById(fach).label,
    stufe,
    grade: stufe === 'sek1' ? 9 : 12
  }
  state.setTest({ ...test })
  state.setStep(0)
  const p = profilFuer(stateId, fach, stufe)
  return { profil: p ? `${p.quelle} · ${p.stand}` : 'keins' }
}

/**
 * Lerngruppe setzen, damit sich die Themenvorschlaege in Schritt 1 pruefen lassen.
 *
 * Gibt zusaetzlich zurueck, was die Datenlage hergibt – die Wache vergleicht das mit dem,
 * was die Oberflaeche daraus macht.
 */
function lzkLerngruppe(stateId: string, fach: string, grade: number, schoolTypeId = 'gymnasium'): { vorschlaege: string[]; hinweis: string } {
  const state = useLernzielkontrolle.getState()
  const format = standardFormatFuer(stateId)
  const test = state.test ?? emptyKurztest(stateId, schoolTypeId, schoolTypeId)
  test.meta = {
    ...test.meta,
    stateId,
    schoolTypeId,
    schoolTypeName: schoolTypeId,
    subjectId: fach,
    subjectLabel: subjectById(fach).label,
    grade,
    stufe: grade > 10 ? 'sek2' : 'sek1',
    thema: '',
    // Wie beim Wechsel des Bundeslandes in der Oberflaeche: Das Format haengt am Land.
    // Ohne das stuende im Pruefbild zu Sachsen noch ein niedersaechsischer Erlass.
    formatId: format?.id ?? '',
    bezeichnung: format?.bezeichnung ?? 'Lernzielkontrolle',
    minutes: standardMinuten(format)
  }
  state.setTest({ ...test })
  state.setStep(0)
  return {
    vorschlaege: themenFuer(stateId, fach, grade, schoolTypeId).map((v) => v.thema),
    hinweis: themenHinweis(stateId, fach, grade, schoolTypeId)
  }
}

/**
 * Schreibaufgabe Fremdsprachen MIT ECHTER KI – nur Gliederung und Blatt, keine Bilder.
 *
 * Bewusst OHNE `finishWorksheet`: Bildsuche und KI-Pruefung kosten weitere Anfragen und
 * haben mit dem zu tun, was hier geprueft wird, nichts zu tun. Zwei Anfragen genuegen.
 */
async function schreibEcht(input: { stateId: string; grade: number; topic: string; textType: string; words: number }) {
  const started = Date.now()
  const meta: WorksheetMeta = {
    ...defaultMeta(input.stateId, 'integrierte-gesamtschule', 'Integrierte Gesamtschule'),
    subjectId: 'englisch',
    subjectLabel: 'Englisch',
    topic: input.topic,
    grade: input.grade,
    pages: 2,
    sheetType: 'uebung',
    skillFocus: 'writing',
    studentTextType: input.textType,
    cefrLevel: 'B1',
    materialWords: 300,
    wordLimit: true,
    writingNotes: true,
    phraseSheet: 'inline'
  }
  const ws: Worksheet = {
    version: 1,
    meta,
    design: presetDesigns()[0],
    outline: null,
    sheets: [],
    sources: [],
    createdAt: new Date().toISOString()
  }
  const profile = profileFromMeta(meta)
  ws.outline = await generateOutline(meta, profile, [], wsAi)
  const result = await generateWorksheet(ws, profile, {
    ai: wsAi,
    review: false,
    combined: true
  })
  // In den Editor wechseln: Die Wache prueft am gesetzten Blatt, nicht am Datenmodell
  useArbeitsblatt.getState().setWorksheet(result)
  useArbeitsblatt.getState().setStep(2)

  const blocks = result.sheets.flatMap((s) => s.blocks)
  const schreibaufgabe = blocks.find((b) => b.type === 'task' && b.skill === 'writing' && b.brief)
  const brief = schreibaufgabe && schreibaufgabe.type === 'task' ? schreibaufgabe.brief : undefined
  const phrases = blocks.find((b) => b.type === 'phrases')
  return {
    sekunden: Math.round((Date.now() - started) / 1000),
    bausteine: blocks.map((b) => ({
      typ: b.type,
      skill: b.type === 'task' ? b.skill : undefined,
      // Volltext des Bausteins: Nur damit laesst sich zeigen, WOHER ein Wort auf dem Blatt kommt
      text: JSON.stringify(b).slice(0, 1200)
    })),
    anweisung: schreibaufgabe && schreibaufgabe.type === 'task' ? schreibaufgabe.instruction : '',
    brief: brief ?? null,
    phrases: phrases && phrases.type === 'phrases' ? { title: phrases.title, hint: phrases.hint, groups: phrases.groups } : null
  }
}

/**
 * Eine bewusst ÜBERLANGE Schreibaufgabe – ohne KI, für die Prüfung der Seitenteilung.
 *
 * Situierung, zweispaltige Notizentabelle, Inhaltspunkte, Formvorgaben und viel Schreibraum:
 * zusammen mehr, als auf eine Seite passt. Genau dieser Fall führte vorher zur Meldung
 * „Ein Baustein ist größer als die Seite".
 */
function wsGeteilteAufgabe(teilaufgaben = 0, mitHilfsblatt = false): { bausteine: number } {
  const meta: WorksheetMeta = {
    ...defaultMeta('NI', 'integrierte-gesamtschule', 'Integrierte Gesamtschule'),
    subjectId: 'englisch',
    subjectLabel: 'Englisch',
    topic: 'An international youth conference',
    title: 'Writing: a report',
    grade: 10,
    pages: 2,
    wordLimit: true,
    phraseSheet: mitHilfsblatt ? 'inline' : 'aus'
  }
  const stich = (n: number, wort: string): string[] => Array.from({ length: n }, (_, i) => `${wort} ${i + 1}`)
  const aufgabe: WsBlock = {
    id: 'split-1',
    type: 'task',
    instruction: '**Write** a report about the conference.',
    operator: 'write',
    afbReason: '',
    socialForm: 'EA',
    answer: {
      ...emptyAnswer(),
      kind: teilaufgaben ? 'none' : 'lines',
      count: 26
    },
    parts: Array.from({ length: teilaufgaben }, (_, i) => ({
      id: `p${i}`,
      instruction: `Teilaufgabe ${i + 1}: Beschreibe einen Aspekt der Konferenz ausführlich.`,
      answer: { ...emptyAnswer(), kind: 'lines', count: 6 },
      solution: `Lösung ${i + 1}`
    })),
    solution: '',
    points: 20,
    minutes: 45,
    skill: 'writing',
    brief: {
      situation:
        'You took part in an international youth conference in Singapore. Young people from different countries came together to discuss how cities can become better places to live in the future. Your head teacher has asked you to write a report.',
      audience: 'your head teacher',
      textType: 'report',
      purpose: 'help the school decide whether students should take part again',
      words: 275,
      points: [
        'Describe what you did at the conference.',
        'Explain what you learned from working with young people from different countries.',
        'Evaluate the positive and negative aspects of the programme.'
      ],
      notes: [
        {
          title: 'The Conference',
          items: stich(8, 'conference note'),
          prompts: ['Positives: …', 'Problems: …']
        },
        {
          title: 'Experiencing Singapore',
          items: stich(8, 'city note'),
          prompts: ['Most interesting experience: …', 'Surprises: …']
        }
      ],
      form: ['Give your report a suitable heading and use subheadings.'],
      criteria: ['Inhalt vollständig', 'Sprache angemessen', 'Aufbau erkennbar gegliedert', 'Grammatik und Rechtschreibung sicher'],
      /*
       * Bewusst UMFANGREICH: Erwartungshorizont und Mustertext müssen zusammen mehr sein,
       * als unter die Aufgabe passt. Nur dann zeigt sich, ob beides sauber über Seiten
       * umbricht – vorher lief es unten aus der Seite heraus (gemeldet 24.09.2026).
       */
      expected: Array.from({ length: 4 }, (_, i) => ({
        aspect: ['Describe', 'Explain', 'Evaluate', 'Suggest'][i],
        criterion: `Der Bericht ${['nennt mindestens drei Programmpunkte', 'stellt Bezüge zum Lernen her', 'wägt Schwierigkeiten ab', 'schlägt umsetzbare Änderungen vor'][i]} und führt sie mit Einzelheiten aus.`,
        examples: [`Beispiel ${i + 1}a: ein ausgeführter Satz, der den Aspekt belegt.`, `Beispiel ${i + 1}b: ein zweiter ausgeführter Satz dazu.`],
        points: 4
      })),
      model: [
        'Report on the International Youth Conference',
        'Purpose and programme',
        'This report presents the main experiences from our conference week. It also evaluates their educational value and suggests improvements for future groups.',
        'Activities and learning',
        'The programme combined workshops, city walks and interviews. During a guided visit we observed how the city protects its limited natural spaces, and a walk along the historic trade route connected classroom knowledge with real places.',
        'Challenges',
        'The schedule was ambitious and left little rest, so some participants found it hard to stay productive. Public transport worked reliably, but the fees made several activities less accessible.',
        'Suggestions',
        'Future groups should plan a quieter afternoon and compare accommodation costs earlier, so that more money remains for educational activities.'
      ].join('\n\n')
    }
  }
  /*
   * Das Hilfsblatt steht auf einer EIGENEN Seite. Genau dadurch entstand der gemeldete
   * Eindruck zweier Schreibbereiche: Der Schreibbereich endete mitten auf Seite 2, und was
   * danach kam, bekam ohnehin ein eigenes Blatt – dazwischen blieb die Seite leer.
   */
  const hilfsblatt: WsBlock = {
    id: 'split-phrases',
    type: 'phrases',
    title: 'Useful phrases',
    hint: 'Nutze die Wendungen für deinen Bericht.',
    groups: [
      {
        label: 'describing',
        items: [
          { text: 'We visited …', german: 'Wir haben … besucht' },
          { text: 'The highlight was …', german: 'Der Höhepunkt war …' }
        ]
      },
      {
        label: 'evaluating',
        items: [
          {
            text: 'The main limitation was …',
            german: 'Die wichtigste Einschränkung war …'
          }
        ]
      },
      // Bewusst umfangreich: Das Hilfsblatt darf nicht mehr auf die Seite des Schreibbereichs passen
      ...Array.from({ length: 9 }, (_, k) => ({
        label: `group ${k + 1}`,
        items: Array.from({ length: 6 }, (_, j) => ({
          text: `useful phrase ${k + 1}.${j + 1} for the report`,
          german: `Wendung ${k + 1}.${j + 1}`
        }))
      }))
    ]
  }
  const ws: Worksheet = {
    version: 1,
    meta,
    design: presetDesigns()[0],
    outline: null,
    sources: [],
    createdAt: new Date().toISOString(),
    sheets: [
      {
        id: 'sheet-split',
        label: 'Arbeitsblatt',
        blocks: mitHilfsblatt ? [aufgabe, hilfsblatt] : [aufgabe]
      }
    ]
  }
  useArbeitsblatt.getState().setWorksheet(ws)
  useArbeitsblatt.getState().setStep(2)
  return { bausteine: ws.sheets[0].blocks.length }
}

/**
 * Bild ODER Tabelle NEBEN den Schreiblinien – ohne KI.
 *
 * Gewünscht von der Lehrkraft (23.09.2026). Der Punkt, auf den es ankommt: Neben dem
 * Baustein stehen kurze Linien, DARUNTER laufen sie über die volle Blattbreite weiter.
 * Genau das lässt sich nur am gesetzten Blatt messen, nicht am Modell.
 */
/**
 * Ein Blatt mit einem LANGEN Materialtext – zum Pruefen des Notizrands.
 *
 * Der Text muss ueber mehrere Seiten gehen: Nur dann zeigt sich, ob die Seitenaufteilung den
 * schmaleren (und damit hoeheren) Text mitrechnet. Auf einer einzelnen Seite faellt ein
 * falsch gerechneter Umbruch nicht auf.
 */
function wsMaterialtext(absaetze = 14, art: 'text' | 'klausur' = 'text'): { absaetze: number } {
  const meta: WorksheetMeta = {
    ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
    subjectId: 'geschichte',
    subjectLabel: 'Geschichte',
    topic: 'Die Weimarer Republik',
    title: 'Quellenarbeit',
    grade: 12,
    pages: 3,
    // Uebungsklausur: Aufgabe zuerst, Material danach – die Reihenfolge haengt an dieser Angabe
    ...(art === 'klausur'
      ? {
          abitur: {
            an: true,
            niveau: 'eA' as const,
            aufgabenart: 'analyse',
            klausur: true
          }
        }
      : {})
  }
  const satz = (i: number): string =>
    `Am ${i + 1}. Tag beriet die Versammlung ueber den Antrag, und die Abgeordneten verlangten, dass man ihnen die Gruende fuer den Beschluss nenne. ` +
    'Die Aussprache zog sich hin, weil jede Seite auf ihre Erfahrungen verwies und niemand nachgeben wollte. ' +
    'Am Abend wurde vertagt, ohne dass eine Einigung in Sicht gewesen waere.'
  const text = {
    id: 'q1',
    type: 'text' as const,
    title: 'Q1: Bericht aus der Versammlung',
    body: Array.from({ length: absaetze }, (_, i) => satz(i)).join('\n\n'),
    lineNumbers: true,
    source: 'Anna Berg: Bericht, 1920. Fundort: https://de.wikisource.org/wiki/Bericht',
    glossary: []
  }
  /*
   * Die Uebungsklausur geht durch DENSELBEN Einsetzweg wie die App: Die KI liefert die
   * Aufgabe, das Material setzt `setzeMaterialEin` dazu. Baute die Probe das Blatt selbst
   * zusammen, pruefte sie die Reihenfolge der Probe statt die des Programms – und genau
   * dort sass der Fehler (25.09.2026).
   */
  let n = 0
  const id = (): string => `probe-${++n}`
  const aufgabe: WsBlock = {
    id: 'a1',
    type: 'task',
    instruction: 'Analysiere den Bericht und ordne ihn in die Auseinandersetzungen der Zeit ein.',
    operator: 'Analysiere',
    afbReason: 'Erschliessen und Einordnen einer Quelle',
    socialForm: 'EA',
    answer: { ...emptyAnswer('lines'), count: 24 },
    parts: [],
    solution: '',
    points: 20,
    minutes: 60
  }
  const ablage: OriginalMaterialAblage = {
    titel: 'Bericht aus der Versammlung',
    urheber: 'Anna Berg',
    url: 'https://de.wikisource.org/wiki/Bericht',
    text: Array.from({ length: absaetze }, (_, i) => satz(i)).join('\n\n'),
    quellenangabe: 'Anna Berg: Bericht, 1920. https://de.wikisource.org/wiki/Bericht (abgerufen am 25.09.2026)',
    hinweis: '',
    protokoll: [],
    wortlautGeprueft: true
  }
  const blatt =
    art === 'klausur'
      ? setzeMaterialEin({ id: 'sheet-material', label: 'Arbeitsblatt', blocks: [aufgabe] }, ablage, meta, id)
      : { id: 'sheet-material', label: 'Arbeitsblatt', blocks: [text] }
  const ws: Worksheet = {
    version: 1,
    meta,
    design: presetDesigns()[0],
    outline: null,
    sources: [],
    createdAt: new Date().toISOString(),
    sheets: [blatt]
  }
  useArbeitsblatt.getState().setWorksheet(ws)
  useArbeitsblatt.getState().setStep(2)
  return { absaetze }
}

function wsAnordnung(
  was: 'bild' | 'tabelle' = 'tabelle',
  seite: 'left' | 'right' = 'left',
  frei?: { page: number; x: number; y: number; width: number }
): { bausteine: number } {
  const meta: WorksheetMeta = {
    ...defaultMeta('NI', 'integrierte-gesamtschule', 'Integrierte Gesamtschule'),
    subjectId: 'englisch',
    subjectLabel: 'Englisch',
    topic: 'My favourite place',
    title: 'Writing: a description',
    grade: 8,
    pages: 1
  }
  const daneben: WsBlock =
    was === 'tabelle'
      ? {
          id: 'neben-1',
          type: 'table',
          title: 'Useful words',
          headers: ['Place', 'Feeling'],
          rows: [
            ['park', 'calm'],
            ['beach', 'free'],
            ['library', 'quiet']
          ],
          side: seite
        }
      : {
          id: 'neben-1',
          type: 'image',
          description: 'A quiet park with benches and trees',
          caption: 'A place to relax',
          widthPercent: 60,
          role: 'illustration',
          side: seite
        }
  const aufgabe: WsBlock = {
    id: 'anordnung-1',
    type: 'task',
    instruction: '**Describe** your favourite place.',
    operator: 'describe',
    afbReason: '',
    socialForm: 'EA',
    answer: { ...emptyAnswer(), kind: 'lines', count: 22 },
    parts: [],
    solution: '',
    points: 10,
    minutes: 20,
    skill: 'writing'
  }
  // Auf Wunsch gleich frei platziert – so lässt sich auch dieser Zweig ohne Maus prüfen
  if (frei) daneben.free = frei
  const ws: Worksheet = {
    version: 1,
    meta,
    design: presetDesigns()[0],
    outline: null,
    sources: [],
    createdAt: new Date().toISOString(),
    sheets: [
      {
        id: 'sheet-anordnung',
        label: 'Arbeitsblatt',
        blocks: [daneben, aufgabe]
      }
    ]
  }
  useArbeitsblatt.getState().setWorksheet(ws)
  useArbeitsblatt.getState().setStep(2)
  return { bausteine: ws.sheets[0].blocks.length }
}

/**
 * Ein Blatt mit einer BREITEN Wortschatztabelle – fünf Spalten, lange Einträge.
 *
 * Nachgebaut nach dem Blatt der Lehrkraft (24.09.2026), auf dem der Inhalt im PDF nur im
 * oberen Drittel stand: Eine Tabelle, die über die Blattbreite hinauswächst, lässt Chromium
 * beim Drucken das ganze Dokument verkleinern.
 */
function wsBreiteTabelle(): { spalten: number } {
  const meta: WorksheetMeta = {
    ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
    subjectId: 'englisch',
    subjectLabel: 'Englisch',
    topic: 'Vocabulary in Action',
    title: 'Vocabulary in Action: Words, Context and Meaning',
    grade: 10,
    pages: 1
  }
  const kopf = ['Word', 'Meaning', 'Word family', 'Typical collocation', 'Register']
  const zeile = (w: string, m: string, f: string, c: string, r: string): string[] => [w, m, f, c, r]
  const tabelle: WsBlock = {
    id: 'breit-1',
    type: 'table',
    title: 'Vocabulary bank',
    headers: kopf,
    rows: [
      zeile('work-life balance', 'a healthy relation between work and private life', 'work, worker', 'improve work-life balance', 'neutral'),
      zeile('to enforce', 'to make people obey a rule', 'enforcement', 'enforce a restriction', 'formal'),
      zeile('innovative', 'using effective new ideas', 'innovation, innovate', 'an innovative tool', 'neutral/formal'),
      zeile('reputation', 'the opinion others have of someone or something', 'reputable', 'build a professional reputation', 'neutral/formal'),
      zeile('colloquial', 'suitable for informal conversation', 'colloquialism', 'a colloquial expression', 'language label')
    ]
  }
  const aufgabe: WsBlock = {
    id: 'breit-2',
    type: 'task',
    instruction: '**Examine** five unsuitable vocabulary choices and explain the problems.',
    operator: 'examine',
    afbReason: '',
    socialForm: 'EA',
    answer: { ...emptyAnswer(), kind: 'lines', count: 8 },
    parts: [],
    solution: '',
    points: 10,
    minutes: 20
  }
  const ws: Worksheet = {
    version: 1,
    meta,
    design: presetDesigns()[0],
    outline: null,
    sources: [],
    createdAt: new Date().toISOString(),
    sheets: [{ id: 'sheet-breit', label: 'Arbeitsblatt', blocks: [tabelle, aufgabe] }]
  }
  useArbeitsblatt.getState().setWorksheet(ws)
  useArbeitsblatt.getState().setStep(2)
  return { spalten: kopf.length }
}

/**
 * Ein Blatt MIT Tafelbild – ohne KI.
 *
 * Das Tafelbild steht im Querformat (297 mm breit). Ohne eigene Seitendefinition verkleinert
 * Chromium beim Drucken das ganze Dokument, damit die breiteste Seite hineinpasst – gemeldet
 * von der Lehrkraft am 24.09.2026. Genau dieser Fall lässt sich nur mit einem Tafelbild
 * nachstellen; ohne eines ist alles in Ordnung.
 */
function wsMitTafelbild(): { tafelbild: boolean } {
  const meta: WorksheetMeta = {
    ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
    subjectId: 'englisch',
    subjectLabel: 'Englisch',
    topic: 'Vocabulary in Action',
    title: 'Vocabulary in Action',
    grade: 10,
    pages: 1,
    boardPlan: true
  }
  const aufgabe: WsBlock = {
    id: 'tafel-1',
    type: 'task',
    instruction: '**Examine** five unsuitable vocabulary choices and explain the problems.',
    operator: 'examine',
    afbReason: '',
    socialForm: 'EA',
    answer: { ...emptyAnswer(), kind: 'lines', count: 10 },
    parts: [],
    solution: '',
    points: 10,
    minutes: 20
  }
  const board: BoardPlan = {
    title: 'How does context guide precise word choice?',
    layout: 'cluster',
    format: 'volltafel',
    sections: [
      {
        heading: 'Context problem',
        points: ['professional app → unclear focus', 'prohibition → complete ban'],
        field: 'links',
        fromTasks: 'Aufgabe 1'
      },
      {
        heading: 'Check four criteria',
        points: ['Meaning', 'Collocation', 'Register', 'Effect'],
        field: 'mitte',
        toNotebook: true,
        fromTasks: 'Aufgabe 2'
      },
      {
        heading: 'Result',
        points: ['Choose the word that fits purpose and reader.'],
        field: 'rechts',
        toNotebook: true,
        fromTasks: 'Aufgabe 3'
      }
    ],
    conclusion: 'Meaning, collocation, register and reader effect guide every precise choice.',
    steps: [
      {
        phase: 'Sichern',
        impulse: 'Which checks guide a precise choice?',
        expected: 'Meaning, collocation, register, effect'
      }
    ]
  }
  const ws: Worksheet = {
    version: 1,
    meta,
    design: presetDesigns()[0],
    outline: null,
    sources: [],
    createdAt: new Date().toISOString(),
    board,
    sheets: [{ id: 'sheet-tafel', label: 'Arbeitsblatt', blocks: [aufgabe] }]
  }
  useArbeitsblatt.getState().setWorksheet(ws)
  useArbeitsblatt.getState().setStep(2)
  return { tafelbild: true }
}

/** Druck-HTML MIT Tafelbild – so, wie der Export es mit angehaktem Tafelbild übergibt. */
function printHtmlMitTafelbild(): string {
  const ws = useArbeitsblatt.getState().worksheet
  if (!ws) throw new Error('Kein Arbeitsblatt geladen.')
  return buildWorksheetHtml(
    ws,
    new Map(),
    {
      sheetIds: ws.sheets.map((s) => s.id),
      includeKey: false,
      includeBoard: true
    },
    null,
    ''
  )
}

function lzkSheet(stateId = 'BY', fassungen = 1): { aufgaben: number; fassungen: number } {
  const state = useLernzielkontrolle.getState()
  const test = emptyKurztest(stateId, 'gymnasium', 'Gymnasium')
  test.meta = {
    ...test.meta,
    subjectId: 'mathematik',
    subjectLabel: 'Mathematik',
    grade: 10,
    thema: 'Potenzgesetze',
    stoff: 'Produkt- und Quotientenregel bei gleicher Basis, Potenzieren einer Potenz',
    bewertung: { punkteAufBlatt: true, schluessel: 'mv' }
  }
  const aufgabe = (id: string, instruction: string, answer: Extract<WsBlock, { type: 'task' }>['answer'], points: number): WsBlock => ({
    id,
    type: 'task',
    instruction,
    operator: instruction.replace(/\*\*/g, '').split(' ')[0],
    afb: 'I',
    afbReason: '',
    socialForm: 'EA',
    minutes: 4,
    points,
    solution: '',
    answer,
    parts: []
  })
  test.varianten = [
    {
      id: 'v1',
      label: '',
      blocks: [
        aufgabe('a1', '**Berechne** die Werte von $(-3)^4$, $5^0$ und $7^3$.', { ...emptyAnswer('lines'), count: 3 }, 3),
        aufgabe(
          'a2',
          '**Bestimme** zu jeder Umformung das passende Potenzgesetz.',
          {
            ...emptyAnswer('matching'),
            left: ['$b^4 \\cdot b^3 = b^7$', '$(c^2)^5 = c^{10}$'],
            right: ['Produktgesetz bei gleicher Basis', 'Potenzieren einer Potenz'],
            pairs: [0, 1]
          },
          2
        ),
        aufgabe('a3', '**Deute** das Ergebnis.', { ...emptyAnswer('lines'), count: 2 }, 2),
        aufgabe('a4', '**Entscheide**, ob die Aussage stimmt, und begründe deine Antwort.', { ...emptyAnswer('lines'), count: 3 }, 0),
        {
          id: 'a5',
          type: 'infoBox',
          variant: 'merke',
          title: 'Merke',
          body: 'Beim Potenzieren einer Potenz werden die Exponenten multipliziert.'
        }
      ]
    }
  ]
  // Drei Fassungen, damit sich die Rueckfrage beim Ausgeben pruefen laesst
  if (fassungen > 1) {
    test.varianten = Array.from({ length: fassungen }, (_, i) => ({
      id: `v${i + 1}`,
      label: String.fromCharCode(65 + i),
      blocks: structuredClone(test.varianten[0].blocks).map((b) => ({
        ...b,
        id: `${b.id}-${i}`
      }))
    }))
    test.meta = { ...test.meta, varianten: fassungen }
  }
  state.setTest(test)
  state.setStep(1)
  return {
    aufgaben: test.varianten[0].blocks.length,
    fassungen: test.varianten.length
  }
}

/**
 * ECHTER Durchlauf einer Lernzielkontrolle - VERBRAUCHT KI-KONTINGENT.
 *
 * Wird nur von `tests/e2e/lzk-echt.mjs` aufgerufen, und das nur auf ausdrueckliche
 * Anweisung. Die erzeugte Kontrolle wird NICHT gespeichert; sie bleibt im Zustand der App
 * und verschwindet mit dem Fenster.
 */
async function lzkEcht(input: { stateId: string; fach: string; grade: number; thema: string; stoff: string; minutes: number }) {
  const state = useLernzielkontrolle.getState()
  const test = emptyKurztest(input.stateId, 'gymnasium', 'Gymnasium')
  const format = standardFormatFuer(input.stateId)
  test.meta = {
    ...test.meta,
    subjectId: input.fach,
    subjectLabel: subjectById(input.fach).label,
    grade: input.grade,
    stufe: input.grade >= 11 ? 'sek2' : 'sek1',
    thema: input.thema,
    stoff: input.stoff,
    minutes: input.minutes,
    ...(format ? { formatId: format.id, bezeichnung: format.bezeichnung } : {})
  }
  const started = Date.now()
  const blocks = await generateKurztest(test, '', lzkAi)
  test.varianten = [{ id: 'v1', label: '', blocks }]
  state.setTest(test)
  state.setStep(1)
  const profil = profilFuer(test.meta.stateId, test.meta.subjectId, test.meta.stufe, test.meta.schoolTypeId)
  return {
    sekunden: Math.round((Date.now() - started) / 1000),
    format: test.meta.bezeichnung,
    profil: profil ? `${profil.quelle} (${(profil.belegt ?? 'volltext') === 'volltext' ? 'amtlich' : 'abgeleitet'})` : 'keins',
    bausteine: blocks.map((b) => ({
      typ: b.type,
      text: b.type === 'task' ? b.instruction : b.type === 'text' ? `${b.title}: ${b.body.slice(0, 60)}` : b.type === 'table' ? b.title : '',
      operator: b.type === 'task' ? b.operator : '',
      antwortform: b.type === 'task' ? b.answer.kind : '',
      punkte: b.type === 'task' ? b.points : 0,
      teilaufgaben: b.type === 'task' ? b.parts.map((t) => t.instruction) : [],
      loesung: b.type === 'task' ? b.solution : ''
    })),
    befunde: pruefeKurztest(test, 0).map((b) => `[${b.schwere}] ${b.bereich}: ${b.message}`)
  }
}

/** Das Druck-HTML des aktuellen Arbeitsblatts – Grundlage der PDF-Prüfung. */
function printHtmlNow(): string {
  const state = useArbeitsblatt.getState()
  // Wie der Editor: der Themenbereich steht als Überthema im Kopf (Paket 11)
  const ws = state.worksheet && mitThemenbereich(state.worksheet, themenbereichName('arbeitsblatt', state.docId))
  if (!ws) throw new Error('Kein Arbeitsblatt geladen.')
  /*
   * Mit der ECHTEN Seitenaufteilung, sobald der Editor sie berechnet hat (`__selftest.layouts`).
   *
   * Vorher stand hier immer eine leere Karte. Fuer eine Feldpruefung genuegte das, aber jede
   * Wache sah dadurch ein einseitiges Blatt – ein falscher Seitenumbruch im PDF konnte so gar
   * nicht auffallen.
   */
  const gemessen = (window as unknown as { __selftest?: { layouts?: Map<string, PagePlan[]> } }).__selftest?.layouts
  return buildWorksheetHtml(ws, gemessen ?? new Map(), { sheetIds: ws.sheets.map((s) => s.id), includeKey: false }, null, '')
}

/**
 * Legt ein Arbeitsblatt mit einer Reihe von Ankreuzfragen in den Zustand – ohne KI.
 *
 * Nachgebaut nach der Klassenarbeit der Lehrkraft („Exam no 1", Aufgabe 1b): vier Fragen,
 * je drei Möglichkeiten. Genau daran hängt die zweispaltige, rahmenlose Darstellung – und
 * daran, dass der Operator nur noch EINMAL oben steht.
 */
/**
 * Blindprobe auf Abruf (01.10.2026): ein älteres Blatt mit Lesetext und zwei Ankreuzfragen ohne
 * Blindprobe – die erste ist mit Weltwissen lösbar. Wache: tests/e2e/mc-blindprobe.mjs.
 */
function mcBlindSheet(): { aufgaben: number } {
  const frage = (id: string, instruction: string, options: string[], richtig: number): TaskPart => ({
    id,
    instruction,
    answer: { ...emptyAnswer('multipleChoice'), options, correct: [richtig] },
    solution: options[richtig]
  })
  const text: WsBlock = {
    id: 'text1',
    type: 'text',
    title: 'A day at the harbour',
    body: 'Mia works at the harbour café every Saturday. She starts at seven, when the fishing boats come in. The first customers are the fishermen, who order tea with lemon and talk about the weather.\n\nAt noon the tourists arrive, and Mia sells fish sandwiches until the café closes at three.',
    lineNumbers: true,
    source: '',
    glossary: []
  }
  const task: WsBlock = {
    id: 'blind1',
    type: 'task',
    instruction: '**Tick** the correct answer.',
    operator: 'tick',
    afb: 'I',
    afbReason: '',
    socialForm: 'EA',
    minutes: 5,
    points: 0,
    solution: '',
    answer: emptyAnswer('none'),
    skill: 'reading',
    parts: [frage('b1', 'What is the capital of France?', ['Paris', 'a fish', 'Saturday'], 0), frage('b2', 'When does the café close?', ['at one', 'at three', 'at five'], 1)]
  }
  const ws: Worksheet = {
    version: 1,
    meta: { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'englisch', subjectLabel: 'Englisch', topic: 'At the harbour', grade: 7, pages: 1 },
    design: presetDesigns()[0],
    outline: null,
    sheets: [{ id: 's1', label: 'Arbeitsblatt', blocks: [text, task] }],
    sources: [],
    createdAt: new Date().toISOString()
  }
  useArbeitsblatt.getState().loadWorksheet(ws, 2)
  return { aufgaben: 1 }
}

function mcSheet(): { fragen: number } {
  const state = useArbeitsblatt.getState()
  const frage = (id: string, text: string, optionen: string[]): TaskPart => ({
    id,
    // Absichtlich MIT „**Tick** " – so kommt es aus älteren Blättern; die Anzeige muss es wegnehmen
    instruction: `**Tick** ${text}`,
    answer: {
      ...emptyAnswer('multipleChoice'),
      options: optionen,
      correct: [0]
    },
    solution: ''
  })
  const task: WsBlock = {
    id: 'mc1',
    type: 'task',
    instruction: '**Tick** the correct answer.',
    operator: 'tick',
    afb: 'I',
    afbReason: '',
    socialForm: 'EA',
    minutes: 8,
    points: 0,
    solution: '',
    answer: emptyAnswer('none'),
    skill: 'listening',
    parts: [
      frage('p1', "what's in Ruby's picture?", ['a dog', 'a ball', 'a horse']),
      frage('p2', 'what the students can write about.', ['a pet', 'a teacher', 'a boy or a girl']),
      frage('p3', "what Karam can't find.", ['the library', 'his classroom', 'the assembly hall']),
      frage('p4', 'who can sing the song.', ['Lily', 'Ruby', 'Karam'])
    ]
  }
  /*
   * Zweiter Fall aus der Vorlage (Aufgabe 2): EINE Frage mit vielen kurzen Möglichkeiten.
   * Die gehören zweispaltig, aber weiterhin untereinander – nicht in eine Zeile gequetscht.
   */
  const liste: WsBlock = {
    id: 'mc2',
    type: 'task',
    instruction: '**Tick** the correct hobbies for Noah.',
    operator: 'tick',
    afb: 'I',
    afbReason: '',
    socialForm: 'EA',
    minutes: 5,
    points: 0,
    solution: '',
    answer: {
      ...emptyAnswer('multipleChoice'),
      options: ['playing football', 'riding a bike', 'riding horses', 'taking photos', 'singing', 'watching videos', 'dancing', 'cooking'],
      correct: [0, 4]
    },
    // Gelöstes Beispiel (Punkt 0) – zeigt die Form der Antwort, ist selbst keine Aufgabe
    example: {
      id: 'mc2-beispiel',
      instruction: 'reading books',
      answer: {
        ...emptyAnswer('multipleChoice'),
        options: ['yes', 'no'],
        correct: [0]
      },
      solution: 'yes'
    },
    parts: []
  }
  const ws: Worksheet = {
    version: 1,
    meta: {
      ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
      subjectId: 'englisch',
      subjectLabel: 'Englisch',
      topic: 'At school',
      grade: 5,
      pages: 1
    },
    design: presetDesigns()[0],
    outline: null,
    sheets: [{ id: 's1', label: 'Arbeitsblatt', blocks: [task, liste] }],
    sources: [],
    createdAt: new Date().toISOString()
  }
  state.loadWorksheet(ws, 2)
  return { fragen: task.type === 'task' ? task.parts.length : 0 }
}

/**
 * Legt ein Arbeitsblatt mit einem fertigen Hörtext-Skript in den Zustand – ohne KI.
 *
 * Der Reiter „Hörtexte" war bisher von keiner Wache erreichbar: Ein Hörtext entsteht sonst
 * nur über die KI, und Oberflächentests dürfen kein Kontingent verbrauchen. Dadurch blieb
 * gerade der Teil ungeprüft, in dem Stimmenauswahl, Filter und jetzt auch die Klangregler
 * sitzen – und ein Fehler dort nimmt die ganze Oberfläche mit, ohne eine Meldung zu zeigen.
 *
 * Zwei Sprechende, weil nur dann der Dialog-Weg und die Stimmenzuweisung greifen.
 */
function audioSheet(fach = 'englisch'): { blocks: number; speakers: string[] } {
  const state = useArbeitsblatt.getState()
  const meta: WorksheetMeta = {
    ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
    subjectId: fach,
    subjectLabel: fach === 'geschichte' ? 'Geschichte' : 'Englisch',
    topic: 'At school',
    grade: 8,
    cefrLevel: 'A2',
    skillFocus: fach === 'geschichte' ? 'mixed' : 'listening',
    pages: 1,
    audioAi: true
  }
  const audio: WsBlock = {
    id: 'a1',
    type: 'audio',
    title: 'Talking to the teacher',
    textType: 'Gespräch',
    transcript: [
      'Mr Clarkson: Good morning, Anna. You look tired today.',
      'Anna: [sighs] Good morning. I could not sleep last night.',
      'Mr Clarkson: Were you worried about the maths test?',
      'Anna: [nervously] Yes. I still do not understand the fractions.'
    ].join('\n'),
    speakers: [
      { id: 'a1-0', name: 'Mr Clarkson', voiceId: '', voiceName: '' },
      { id: 'a1-1', name: 'Anna', voiceId: '', voiceName: '' }
    ],
    plays: 2,
    beforeListening: 'Du hörst ein Gespräch zwischen einer Schülerin und ihrem Lehrer.',
    seconds: 40,
    /*
     * Vertont – nur dann erscheinen KI-Kennzeichnung und Anlagenhinweis.
     * Der Inhalt ist eine winzige, aber gültige MP3 (ein stiller Frame), damit der
     * PDF-Export etwas Echtes einzubetten hat.
     */
    audio: {
      fileName: 'probe.mp3',
      dataUrl: `data:audio/mpeg;base64,${STILLE_MP3}`
    }
  }
  const ws: Worksheet = {
    version: 1,
    meta,
    design: presetDesigns()[0],
    outline: null,
    sheets: [{ id: 's1', label: 'Arbeitsblatt', blocks: [audio] }],
    sources: [],
    createdAt: new Date().toISOString()
  }
  state.loadWorksheet(ws, 2)
  return { blocks: 1, speakers: audio.speakers.map((s) => s.name) }
}

/**
 * Legt einen fertigen Grammatiktest in den Zustand und öffnet den Editor – ohne KI.
 *
 * Die Wache gegen einen Absturz, der lange unsichtbar blieb: Der Test wurde erzeugt, der
 * Editor kam aber nie zum Vorschein, weil das Blatt bei jedem Rendern neu gebaut wurde und
 * die Messung sich selbst wieder anstieß („Maximum update depth exceeded"). Es erschien
 * dabei nicht einmal eine Fehlermeldung.
 */
function grammarTestSheet(): { blocks: number; step: number } {
  const state = useGrammatiktest.getState()
  const task = (id: string, instruction: string, gapText: string): WsBlock => ({
    id,
    type: 'task',
    instruction,
    operator: instruction.split(' ')[0],
    afb: 'II',
    afbReason: '',
    socialForm: 'EA',
    minutes: 5,
    points: 10,
    solution: 'siehe Lückentext',
    answer: { ...emptyAnswer('gapText'), gapText },
    parts: [],
    grammar: {
      topicId: 'en.verb.present_perfect_vs_past',
      error: 'since/for verwechselt'
    }
  })
  const ready: GrammarTest = {
    version: 1,
    design: presetDesigns()[0],
    createdAt: new Date().toISOString(),
    meta: {
      ...defaultTestMeta('NI', 'gymnasium', 'Gymnasium'),
      grade: 8,
      topics: ['en.verb.present_perfect_vs_past'],
      title: 'Grammar test'
    },
    blocks: [
      {
        id: 'material',
        type: 'text',
        title: 'A letter from London',
        body: 'Dear Sam,\n\nI have been here for three weeks now.',
        lineNumbers: false,
        source: '',
        glossary: []
      },
      task('t1', 'Setze die richtige Form ein.', 'I [[have lived]] here since 2019.'),
      task('t2', 'Setze since oder for ein.', 'She has worked here [[for]] two years.')
    ]
  }
  state.setTest(ready)
  state.setStep(1)
  return { blocks: ready.blocks.length, step: 1 }
}

/** Gitternetze als SVG (für die Sichtprüfung der Zeichenflächen) */
function grids(widthMm = 170): { kind: GridKind; svg: string; heightMm: number }[] {
  return GRID_KINDS.map((k) => {
    const block: GridBlock = {
      id: k.value,
      type: 'grid',
      kind: k.value,
      title: k.label,
      caption: '',
      ...gridDefaults(k.value),
      axes: defaultAxes(k.value)
    }
    const drawing = gridDrawing(block, widthMm)
    return { kind: k.value, svg: drawing.svg, heightMm: drawing.heightMm }
  })
}

/** Hintergrund eines Bildes entfernen (für die Prüfung der Freistellung) */
async function clean(dataUrl: string) {
  const res = await cleanImageBackground(dataUrl)
  return res
}

/**
 * Ein fertiger LATEIN-Vokabeltest – ohne KI.
 *
 * Der Nennform-Block ist der eigentliche Latein-Vokabeltest (amtlicher Mustertest,
 * Leitfaden Latein SH 2016, S. 25). Die Vokabeln decken die vier Wortarten ab, für die es
 * eine eigene Nennform gibt, dazu ein Adverb ohne Nennform.
 */
/**
 * Englischer Vokabeltest mit EINER Aufgabe „Write sentences", an der ein behebbarer Hinweis
 * hängt – für die Wache „Mit KI beheben" (Paket 13, tests/e2e/ki-beheben.mjs). Ohne KI.
 */
function vtMitHinweis(hinweis: string): { aufgaben: number } {
  const woerter: VocabEntry[] = [
    { id: 'e1', term: 'to explore', translation: 'erkunden', include: true },
    { id: 'e2', term: 'journey', translation: 'Reise', include: true },
    { id: 'e3', term: 'abroad', translation: 'im Ausland', include: true }
  ]
  const einstellungen: TestSettings = {
    targetLanguage: 'en',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 1,
    grade: 8,
    level: 'A2',
    vocabCount: woerter.length,
    variantCount: 1,
    variantMode: 'sameVocab',
    tasks: [{ type: 'writeSentences', count: woerter.length, pointsPerItem: 2 }],
    topic: 'Travelling',
    pictureSource: 'none',
    answerKey: true,
    seed: 1
  }
  const block = TASK_TYPES.writeSentences.build(
    woerter,
    {
      instruction: 'Write a sentence with each word.',
      items: woerter.map((w) => ({ vocabId: w.id, prompt: `${w.term} – ${w.term}`, modelAnswer: `I like ${w.term}.` }))
    },
    { settings: einstellungen, languageName: 'English', rng: createRng(1), allVocab: woerter } as never
  )
  block.warnings = [hinweis]
  const doc: TestDocument = {
    version: 1,
    header: defaultHeader(''),
    settings: einstellungen,
    vocab: woerter,
    variants: [{ id: 'v1', label: 'A', blocks: [block] }],
    fontSize: 11,
    createdAt: new Date().toISOString()
  }
  useVokabeltest.getState().loadDocument(doc)
  useVokabeltest.getState().setListName('Travelling')
  useVokabeltest.getState().setStep(2)
  return { aufgaben: 1 }
}

/** Der Vokabeltest im Speicher (für Wachen) */
const vtJetzt = (): TestDocument | null => useVokabeltest.getState().doc

/** Jahrgang des offenen Vokabeltests umstellen (Wache Maskottchen: Kopf- und Schlussfigur) */
const vtJahrgang = (grade: number): void => useVokabeltest.getState().updateDoc((d) => void (d.settings.grade = grade))

/** Hinweiszeile (ⓘ) der ersten Aufgabe setzen – Wache „Texte bearbeitbar" (30.09.2026) */
const vtHinweiszeile = (text: string): void =>
  useVokabeltest.getState().updateDoc((d) => {
    const b = d.variants[0]?.blocks[0]
    if (b) b.helpText = text
  })

function vtLatein(): { zeilen: number } {
  const woerter: VocabEntry[] = [
    {
      id: 'l1',
      term: 'servus',
      translation: 'Sklave, Diener',
      pos: 'servī m.',
      include: true
    },
    {
      id: 'l2',
      term: 'cantāre',
      translation: 'singen',
      pos: 'cantō, cantāvī, cantātum',
      include: true
    },
    {
      id: 'l3',
      term: 'praeclārus',
      translation: 'berühmt, herrlich',
      pos: '-a, -um',
      include: true
    },
    {
      id: 'l4',
      term: 'cum',
      translation: 'mit',
      pos: 'Präp. + Abl.',
      include: true
    },
    { id: 'l5', term: 'saepe', translation: 'oft', pos: 'Adv.', include: true }
  ]
  const einstellungen: TestSettings = {
    targetLanguage: 'la',
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    languageOrder: 2,
    grade: 7,
    level: 'A1',
    vocabCount: woerter.length,
    variantCount: 1,
    variantMode: 'sameVocab',
    tasks: [{ type: 'latinForms', count: woerter.length, pointsPerItem: 2 }],
    topic: '',
    pictureSource: 'none',
    answerKey: true,
    seed: 1
  }
  const block = TASK_TYPES.latinForms.build(woerter, {}, {
    settings: einstellungen,
    languageName: 'Latin',
    rng: createRng(1),
    allVocab: woerter
  } as never)
  const doc: TestDocument = {
    version: 1,
    header: defaultHeader(''),
    settings: einstellungen,
    vocab: woerter,
    variants: [{ id: 'v1', label: 'A', blocks: [block] }],
    fontSize: 11,
    createdAt: new Date().toISOString()
  }
  useVokabeltest.getState().loadDocument(doc)
  // Schritt 2 ist „Bearbeiten & Export" – die Zählung beginnt bei 0
  useVokabeltest.getState().setStep(2)
  return { zeilen: block.kind === 'latinForms' ? block.items.length : 0 }
}

export function installSelftest(): void {
  /*
   * Das Schullogo, wie es die Oberflaeche GERADE im Speicher hat.
   *
   * Nicht dasselbe wie ein frischer Aufruf: Genau darin lag der am 24.09.2026 gemeldete
   * Fehler – der Aufruf funktionierte, aber der Speicher war leer geblieben, weil die
   * Einstellungen vor der Anmeldung geladen wurden.
   */
  const logo = (): string | null => useAppSettings.getState().logoDataUrl

  /** Qualitaetsmessung eines geladenen Textes – fuer die Probe der Materialsuche */
  const textQualitaet = (text: string, wunsch: { zielWortzahl: number; jahrgang: number; sprache: string }): unknown => bewerte(text, wunsch)

  /** Eine Quelle laden – einschliesslich der PDF-Verarbeitung der Oberflaeche */
  const materialLaden = (url: string): Promise<unknown> => browserMaterialDienste().laden(url)

  /**
   * Ein fertiges Arbeitsblatt in den Zustand legen – fuer die Pruefung an einer echten Datei
   * der Lehrkraft, ohne dass dafuer die KI laufen muss.
   */
  const setWorksheet = (w: Worksheet, schritt = 2): void => {
    useArbeitsblatt.getState().setWorksheet(w)
    useArbeitsblatt.getState().setStep(schritt)
  }

  /** Das Arbeitsblatt, wie es gerade im Zustand steht – um Aenderungen nachzuweisen. */
  const worksheetJetzt = (): Worksheet | null => useArbeitsblatt.getState().worksheet

  /** Kennung des offenen Dokuments eines Programms (Paket 11: Themenbereich zuordnen) */
  const docIdVon = (modul: string): string =>
    ({
      arbeitsblatt: useArbeitsblatt.getState().docId,
      lernzielkontrolle: useLernzielkontrolle.getState().docId,
      grammatiktest: useGrammatiktest.getState().docId,
      klassenarbeit: useKlassenarbeit.getState().docId,
      vokabeltest: useVokabeltest.getState().testId
    })[modul] ?? ''

  /** Das offene Dokument in einen (neuen) Themenbereich legen – über denselben Weg wie „Neu in diesem Bereich" */
  const inBereich = async (modul: string, name: string, fachId: string): Promise<boolean> => {
    const b = await bereichAnlegen(fachId, name)
    if (!b) return false
    await neuImBereich(modul, docIdVon(modul), b)
    return true
  }

  /** Wie `inBereich`, aber in einen Unterbereich: legt den Pfad an und ordnet dem untersten Bereich zu (Paket 12) */
  const inUnterbereich = async (modul: string, pfad: string[], fachId: string): Promise<boolean> => {
    let eltern: string | null = null
    let b = null
    for (const name of pfad) {
      b = await bereichAnlegen(fachId, name, eltern)
      if (!b) return false
      eltern = b.id
    }
    if (!b) return false
    await neuImBereich(modul, docIdVon(modul), b)
    return true
  }

  /** Name der Vokabelliste setzen – daraus liest der Vokabeltest ohne Themenbereich die Unit (Paket 11) */
  const vtListenName = (name: string): void => useVokabeltest.getState().setListName(name)

  /** Text je Seite eines PDFs */
  const pdfText = (data: number[]): Promise<string[]> => pdfTexte(new Uint8Array(data))

  /**
   * Das Deckblatt so rastern, wie es der Word-Export tut (Paket 11) – mit der echten
   * Seitenaufteilung. Liefert Größe und Lage der Bilder; ein leeres oder „vergiftetes"
   * Canvas (foreignObject) fiele hier als Fehler bzw. winziges Bild auf.
   */
  const deckblattWord = async (
    mitBildern = false
  ): Promise<{
    hintergrund: number
    karten: { laenge: number; drehung: number; x0: number; y0: number }[]
    texte: { art: string; text: string; x: number; y: number; pt: number; farbe: string }[]
    bilder?: string[]
  }> => {
    const ws = useArbeitsblatt.getState().worksheet
    if (!ws) throw new Error('Kein Arbeitsblatt geladen.')
    const gemessen = (window as unknown as { __selftest?: { layouts?: Map<string, PagePlan[]> } }).__selftest?.layouts ?? new Map()
    const b = await deckblattBilder(ws, gemessen, null, '')
    return {
      hintergrund: b.hintergrund.length,
      karten: b.karten.map((k) => ({ laenge: k.png.length, drehung: k.drehung, x0: k.x0, y0: k.y0 })),
      // Die Kopftexte, die Word als echten Text setzt – mit gemessener Lage und Schrift
      texte: b.texte.map((t) => ({ art: t.art, text: t.text, x: t.x, y: t.y, pt: t.pt, farbe: t.farbe })),
      // Zum Ansehen: Hintergrund und erste Karte, wie sie ins Word-Dokument gehen
      ...(mitBildern ? { bilder: [b.hintergrund, b.karten[0]?.png ?? ''] } : {})
    }
  }

  ;(window as unknown as { __selftest: unknown }).__selftest = {
    kaMetaSetzen,
    lzkMetaSetzen,
    logo,
    setWorksheet,
    // Seitenrand-Wache (30.09.2026): Stress-Blätter ohne KI
    seitenrandBlatt: (art: SeitenrandArt, seed?: number, design?: number, idPraefix?: string) => seitenrandBlatt(art, seed, design, idPraefix),
    wsSeitenrand: (art: SeitenrandArt, seed?: number, design?: number) => setWorksheet(seitenrandBlatt(art, seed, design)),
    // Fußnoten oder Endnoten (01.10.2026, Wache fussnoten.mjs)
    wsFussnoten: (art: 'fussnoten' | 'endnoten') => setWorksheet(fussnotenBlatt(art)),
    fussnotenBlatt,
    /** Word-Datei des offenen Arbeitsblatts: document.xml und footnotes.xml als Text */
    wordXmlJetzt: async (): Promise<{ dokument: string; fussnoten: string }> => {
      const ws = useArbeitsblatt.getState().worksheet
      if (!ws) throw new Error('Kein Arbeitsblatt geladen.')
      const datei = unzipSync(await buildWorksheetDocx(ws, { sheetIds: ws.sheets.map((s) => s.id), includeKey: false }, browserDocxDeps(null, '')))
      return {
        dokument: strFromU8(datei['word/document.xml']),
        fussnoten: datei['word/footnotes.xml'] ? strFromU8(datei['word/footnotes.xml']) : ''
      }
    },
    vtSeitenrand,
    worksheetJetzt,
    docIdVon,
    inBereich,
    inUnterbereich,
    pdfText,
    deckblattWord,
    vtListenName,
    textQualitaet,
    materialLaden,
    wsMaterialtext,
    worksheet,
    vocab,
    clean,
    grids,
    exam,
    videoSheet,
    grammarTestSheet,
    audioSheet,
    mcSheet,
    mcBlindSheet,
    fillableSheet,
    mathSheet,
    lzkSheet,
    lzkEinstellung,
    lzkLerngruppe,
    schreibEcht,
    wsGeteilteAufgabe,
    wsAnordnung,
    wsBreiteTabelle,
    wsMitTafelbild,
    printHtmlMitTafelbild,
    vtLatein,
    vtMitHinweis,
    vtJetzt,
    vtJahrgang,
    vtHinweiszeile,
    gtJetzt: () => useGrammatiktest.getState().test,
    kaJetzt: () => useKlassenarbeit.getState().exam,
    lzkJetzt: () => useLernzielkontrolle.getState().test,
    // Rückmeldung (Großprogramm 0.4, F3)
    rmJetzt: () => useRueckmeldung.getState().dok,
    // Elternbrief (Großprogramm 0.4, F7)
    ebJetzt: () => useElternbrief.getState().dok,
    // Tafelbilder (30.09.2026)
    tbJetzt: () => useTafelbild.getState().dok,
    // Ganze Dokumente setzen (Wachen „Mit KI beheben": einen Mangel einbauen) – ein Rückgängig-Schritt
    gtSetzen: (t: GrammarTest) => useGrammatiktest.getState().setTest(t),
    kaSetzen: (e: Exam) => useKlassenarbeit.getState().setExam(e),
    kaSchritt: (n: number) => useKlassenarbeit.getState().setStep(n),
    lzkSetzen: (t: Kurztest) => useLernzielkontrolle.getState().setTest(t),
    lzkSpeichern,
    lzkRundreise,
    lzkBibliothek,
    lzkLoeschen,
    lzkEcht,
    // Auftragsleiste (01.10.2026, Wache mobil-touch.mjs): ein Probe-Auftrag am offenen Blatt, der läuft, bis `fertig()` ihn beendet
    auftragProbe: (titel: string, schluessel?: string): { fertig: () => void } => {
      const docId = useArbeitsblatt.getState().docId
      let fertig = (): void => undefined
      void starteAuftrag({
        moduleId: 'arbeitsblatt',
        docId,
        titel,
        art: 'Probe',
        eingabe: {},
        sperrt: false,
        schluessel,
        istOffen: () => blattOffen(docId),
        arbeit: () => new Promise<void>((weiter) => (fertig = weiter)),
        ablegen: async () => undefined
      })
      return { fertig: () => fertig() }
    },
    printHtml: printHtmlNow,
    renderPdf,
    pdfFlaeche,
    audioPdfInput
  }
}
