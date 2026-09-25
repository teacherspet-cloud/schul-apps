/* eslint-disable @typescript-eslint/no-explicit-any */
import { newId, Rng, shuffle } from '../../vokabeltest/model/random'
import type { Stars } from '../didactics/differentiation'
import { emptyAnswer } from '../model/factory'
import { anredeText, type Anrede } from '../../../shared/anrede'
import { defaultAxes, gridDefaults, sanitizeAxes } from '../model/grid'
import type {
  Afb,
  Answer,
  AnswerKind,
  GridKind,
  ImageRole,
  InfoVariant,
  LanguageSkill,
  Outline,
  OutlineItem,
  ScaffoldVariant,
  SocialForm,
  TaskBrief,
  WsBlock,
  WsBlockType
} from '../model/types'
import {
  ANSWER_KINDS,
  BLOCK_TYPES,
  GRID_KIND_IDS,
  IMAGE_FUNCTION_IDS,
  IMAGE_ROLES,
  LANGUAGE_SKILLS,
  SOCIAL_FORMS,
  VIDEO_KIND_IDS,
  VIEWING_PHASE_IDS
} from './schemas'
import type { ImageFunction } from '../didactics/imageDesign'
import type { VideoKind, ViewingPhase } from '../didactics/videoTasks'

/** Wörter je Minute beim Vorlesen eines Hörtextes (deutlich artikulierte Standardsprache). */
const WORDS_PER_MINUTE = 130

export function estimateSeconds(transcript: string): number {
  const words = transcript.split(/\s+/).filter(Boolean).length
  return Math.round((words / WORDS_PER_MINUTE) * 60)
}

function convertBrief(b: any): TaskBrief {
  return {
    situation: text(b?.situation),
    audience: text(b?.audience),
    textType: text(b?.textType),
    purpose: text(b?.purpose),
    words: Math.max(0, Math.min(1200, Number(b?.words) || 0)),
    points: strings(b?.points),
    // Leere Spalten fallen weg: Eine Tabelle mit einer Überschrift und nichts darunter
    // sähe auf dem Blatt aus wie ein Fehler.
    notes: (Array.isArray(b?.notes) ? b.notes : [])
      .map((s: any) => ({ title: text(s?.title), items: strings(s?.items), prompts: strings(s?.prompts) }))
      .filter((s: { title: string; items: string[]; prompts: string[] }) => s.items.length || s.prompts.length),
    form: strings(b?.form),
    criteria: strings(b?.criteria),
    expected: (Array.isArray(b?.expected) ? b.expected : [])
      .map((e: any) => ({
        aspect: text(e?.aspect),
        criterion: text(e?.criterion),
        examples: strings(e?.examples),
        points: Math.max(0, Math.min(100, Number(e?.points) || 0))
      }))
      .filter((e: { aspect: string; criterion: string }) => e.aspect || e.criterion),
    model: text(b?.model)
  }
}

const pick = <T extends string>(value: any, allowed: readonly string[], fallback: T): T => (allowed.includes(value) ? (value as T) : fallback)
const text = (v: any): string => (typeof v === 'string' ? v : '')

/** Von der KI selbst geschriebene Zeilennummern („1 …“, „2 …“) entfernen – die App nummeriert die Zeilen. */
export function stripManualLineNumbers(body: string): string {
  const lines = body.split('\n')
  const numbered = lines.filter((l) => l.trim())
  if (numbered.length < 2) return body
  let expected = 1
  for (const l of numbered) {
    const m = /^\s*(\d{1,3})[\s.:)]\s*/.exec(l)
    if (!m || Number(m[1]) !== expected) return body
    expected++
  }
  return lines.map((l) => l.replace(/^\s*\d{1,3}[\s.:)]\s*/, '')).join('\n')
}
const strings = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : [])
const starsOf = (v: any): Stars | undefined => (v === 1 || v === 2 || v === 3 ? v : undefined)
const afbOf = (v: any): Afb | undefined => (v === 'I' || v === 'II' || v === 'III' ? v : undefined)
/**
 * Punkte, wie die KI sie geliefert hat – ganzzahlig und nie negativ.
 *
 * Bis Paket 6 (25.09.2026) stand hier fest `points: 0`. Das passte zum Arbeitsblatt (dort
 * „Immer 0"), aber LZK und Klassenarbeit verlangen ausdrücklich Punkte je Aufgabe – und
 * verloren sie auf diesem gemeinsamen Weg. Was ein Modul mit den Punkten macht, entscheidet
 * es selbst (Arbeitsblatt setzt sie wieder auf 0, `ohnePunkte` in generate.ts).
 */
export const punkteOf = (v: any): number => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function convertOutline(data: any): Outline {
  return {
    title: text(data?.title),
    learningGoals: strings(data?.learningGoals),
    minutes: Number(data?.minutes) || 45,
    teacherNote: text(data?.teacherNote),
    items: (Array.isArray(data?.items) ? data.items : []).map((it: any): OutlineItem => ({
      id: newId(),
      type: pick<WsBlockType>(it.type, BLOCK_TYPES, 'task'),
      purpose: text(it.purpose),
      afb: afbOf(it.afb),
      operator: text(it.operator),
      socialForm: pick<SocialForm>(it.socialForm, SOCIAL_FORMS, 'EA'),
      stars: starsOf(it.stars),
      answerKind: pick<AnswerKind>(it.answerKind, ANSWER_KINDS, 'lines')
    }))
  }
}

/** Antwortbereich übernehmen und Reihenfolgen mischen, damit die Lösung nicht an der Position erkennbar ist. */
export function convertAnswer(a: any, rng: Rng): Answer {
  const out = emptyAnswer(pick<AnswerKind>(a?.kind, ANSWER_KINDS, 'lines'))
  out.count = Math.max(0, Math.min(30, Number(a?.count) || (out.kind === 'grid' ? 6 : 3)))
  out.heightMm = Math.max(10, Math.min(200, Number(a?.heightMm) || 40))
  out.gapText = text(a?.gapText)
  out.labels = strings(a?.labels)
  switch (out.kind) {
    case 'matching': {
      const left = strings(a?.left)
      const right = strings(a?.right)
      const pairs: number[] = Array.isArray(a?.pairs) ? a.pairs.map(Number) : []
      const order = shuffle(
        right.map((_, i) => i),
        rng
      )
      out.left = left
      out.right = order.map((i) => right[i])
      out.pairs = left.map((_, i) => order.indexOf(pairs[i] ?? -1))
      break
    }
    case 'multipleChoice': {
      const options = strings(a?.options)
      const correct: number[] = Array.isArray(a?.correct) ? a.correct.map(Number) : []
      const order = shuffle(
        options.map((_, i) => i),
        rng
      )
      out.options = order.map((i) => options[i])
      out.correct = correct.map((c) => order.indexOf(c)).filter((c) => c >= 0)
      break
    }
    case 'trueFalse':
      out.statements = (Array.isArray(a?.statements) ? a.statements : []).map((s: any) => ({ text: text(s?.text), isTrue: Boolean(s?.isTrue) }))
      break
    case 'ordering': {
      out.items = strings(a?.items)
      let order = shuffle(
        out.items.map((_, i) => i),
        rng
      )
      // Nie die richtige Reihenfolge anzeigen
      if (order.length > 1 && order.every((v, i) => v === i)) order = [...order.slice(1), order[0]]
      out.displayOrder = order
      break
    }
    case 'tableFill':
      out.headers = strings(a?.headers)
      out.rows = (Array.isArray(a?.rows) ? a.rows : []).map((r: any) => (Array.isArray(r) ? r.map(text) : []))
      out.solutionRows = (Array.isArray(a?.solutionRows) ? a.solutionRows : []).map((r: any) => (Array.isArray(r) ? r.map(text) : []))
      break
  }
  return out
}

/**
 * Seitliche Anordnung aus der KI-Antwort.
 *
 * „auto" und alles Unbekannte bleiben leer – dann entscheidet die App wie bisher nach der
 * Rolle des Bildes. Nur eine ausdrückliche Angabe wird übernommen.
 */
const seite = (v: unknown): 'left' | 'right' | 'none' | undefined => (v === 'left' || v === 'right' || v === 'none' ? v : undefined)

export function convertBlock(
  b: any,
  rng: Rng,
  images: { index: number; dataUrl: string; fileName: string }[],
  /** Anrede der Lernenden – nur für feste Texte, die die App selbst einsetzt (Paket 8b) */
  anrede: Anrede = 'du'
): WsBlock | null {
  const id = newId(rng)
  const type = pick<WsBlockType>(b?.type, BLOCK_TYPES, 'task')
  const stars = starsOf(b?.stars)
  const base = { id, ...(stars ? { stars } : {}) }
  switch (type) {
    case 'learningGoals':
      return { ...base, type, title: text(b.title) || anredeText('lernziele', anrede), goals: strings(b.items) }
    case 'infoBox':
      return {
        ...base,
        type,
        variant: pick<InfoVariant>(b.variant, ['merke', 'definition', 'beispiel', 'wissen', 'regel'], 'merke'),
        title: text(b.title),
        body: text(b.body)
      }
    case 'text':
      return {
        ...base,
        type,
        title: text(b.title),
        body: stripManualLineNumbers(text(b.body)),
        lineNumbers: Boolean(b.lineNumbers),
        /*
         * Materialkopf nur, wenn die KI wenigstens eine Angabe geliefert hat. Ein leerer
         * Kopf wäre schlimmer als keiner: Er behauptet eine Quelle, ohne sie auszuweisen.
         */
        ...(text(b.sourceAuthor) || text(b.sourceDate) || text(b.sourceTextType)
          ? {
              sourceHeader: {
                author: text(b.sourceAuthor),
                date: text(b.sourceDate),
                textType: text(b.sourceTextType),
                found: text(b.source)
              }
            }
          : {}),
        source: text(b.source),
        glossary: (Array.isArray(b.glossary) ? b.glossary : [])
          .filter((g: any) => text(g?.term))
          .map((g: any) => ({ term: text(g.term), explanation: text(g.explanation) }))
      }
    case 'image': {
      const img = images.find((i) => i.index === Number(b.sourceImageIndex))
      return {
        ...base,
        type,
        description: text(b.imageDescription),
        // Bildunterschriften sind einfacher Text (ohne **fett**)
        caption: text(b.title).split('**').join(''),
        widthPercent: 60,
        ...(!img && text(b.imageSearch) ? { search: text(b.imageSearch) } : {}),
        ...(!img && b.imageIsSource ? { original: true } : {}),
        role: pick<ImageRole>(b.imageRole, IMAGE_ROLES, 'material'),
        ...(seite(b.blockSide) ? { side: seite(b.blockSide) } : {}),
        fn: pick<ImageFunction>(b.imageFunction, IMAGE_FUNCTION_IDS, 'repraesentation'),
        // Beschriftungen direkt am Bildteil; Werte außerhalb 0–100 wären unbrauchbar
        ...(Array.isArray(b.imageLabels) && b.imageLabels.length
          ? {
              labels: b.imageLabels
                .filter((l: any) => text(l?.text) && Number.isFinite(Number(l?.x)) && Number.isFinite(Number(l?.y)))
                .slice(0, 8)
                .map((l: any) => ({
                  id: newId(rng),
                  text: text(l.text),
                  x: Math.min(100, Math.max(0, Math.round(Number(l.x)))),
                  y: Math.min(100, Math.max(0, Math.round(Number(l.y)))),
                  ...(l.blank ? { blank: true } : {})
                }))
            }
          : {}),
        ...(!img && Array.isArray(b.imageItems) && b.imageItems.length > 1
          ? {
              items: b.imageItems
                .filter((it: any) => text(it?.description) || text(it?.search))
                .slice(0, 8)
                .map((it: any) => ({
                  id: newId(rng),
                  caption: text(it.caption).split('**').join(''),
                  description: text(it.description),
                  search: text(it.search) || undefined
                })),
              widthPercent: 100
            }
          : {}),
        ...(img ? { image: { dataUrl: img.dataUrl, source: 'material' as const, credit: img.fileName } } : {})
      }
    }
    case 'phrases':
      return {
        ...base,
        type,
        title: text(b.title) || 'Useful phrases',
        hint: text(b.body),
        // Gruppen nach Sprachhandlung; leere Einträge fallen weg
        groups: (Array.isArray(b.phraseGroups) ? b.phraseGroups : [])
          .map((g: any) => ({
            label: text(g?.label),
            items: (Array.isArray(g?.items) ? g.items : [])
              .filter((it: any) => text(it?.text))
              .map((it: any) => ({ text: text(it.text), german: text(it.german) }))
          }))
          .filter((g: { items: unknown[] }) => g.items.length)
      }
    case 'task':
      return {
        ...base,
        type,
        instruction: text(b.instruction),
        operator: text(b.operator),
        afb: afbOf(b.afb),
        afbReason: text(b.afbReason),
        socialForm: pick<SocialForm>(b.socialForm, SOCIAL_FORMS, 'EA'),
        minutes: Number(b.minutes) || 0,
        points: punkteOf(b.points),
        solution: text(b.solution),
        answer: convertAnswer(b.answer, rng),
        parts: (Array.isArray(b.parts) ? b.parts : [])
          .filter((p: any) => text(p?.instruction))
          .map((p: any) => ({ id: newId(rng), instruction: text(p.instruction), answer: convertAnswer(p.answer, rng), solution: text(p.solution) })),
        ...(b.skill && LANGUAGE_SKILLS.includes(b.skill) ? { skill: b.skill as LanguageSkill } : {}),
        ...(b.viewingPhase && VIEWING_PHASE_IDS.includes(b.viewingPhase) ? { viewingPhase: b.viewingPhase as ViewingPhase } : {}),
        ...(text(b.observerGroup) ? { observerGroup: text(b.observerGroup).toUpperCase().slice(0, 2) } : {}),
        ...(text(b.timecode) ? { timecode: text(b.timecode) } : {}),
        ...(b.brief ? { brief: convertBrief(b.brief) } : {})
      }
    case 'scaffold':
      return {
        ...base,
        type,
        variant: pick<ScaffoldVariant>(b.variant, ['tipp', 'satzanfaenge', 'wortspeicher', 'hilfekarten'], 'tipp'),
        title: text(b.title) || 'Hilfe',
        items: strings(b.items)
      }
    case 'table':
      return {
        ...base,
        type,
        title: text(b.title),
        headers: strings(b.headers),
        rows: (Array.isArray(b.rows) ? b.rows : []).map((r: any) => (Array.isArray(r) ? r.map(text) : [])),
        ...(seite(b.blockSide) ? { side: seite(b.blockSide) } : {})
      }
    case 'workspace':
      return {
        ...base,
        type,
        kind: pick(b.variant, ['lines', 'grid', 'blank'], 'lines'),
        heightMm: Math.max(15, Math.min(200, Number(b.heightMm) || 40)),
        label: text(b.title)
      }
    case 'grid': {
      const kind = pick<GridKind>(b.variant, GRID_KIND_IDS, 'karo')
      const preset = gridDefaults(kind)
      return {
        ...base,
        type,
        kind,
        title: text(b.title),
        caption: text(b.body),
        cellMm: Math.max(1, Math.min(10, Number(b.cellMm) || preset.cellMm)),
        heightMm: Math.max(20, Math.min(220, Number(b.heightMm) || preset.heightMm)),
        axes: sanitizeAxes({ ...defaultAxes(kind), ...(b.axes ?? {}) }, kind)
      }
    }
    case 'audio': {
      const script = text(b.body)
      return {
        ...base,
        type,
        title: text(b.title) || 'Hörtext',
        textType: text(b.variant) || 'Interview',
        transcript: script,
        speakers: (Array.isArray(b.speakers) ? b.speakers : [])
          .filter((s: any) => text(s?.name))
          .slice(0, 4)
          .map((s: any) => ({ id: newId(rng), name: text(s.name), voiceId: '', voiceName: '' })),
        plays: Math.max(1, Math.min(3, Number(b.plays) || 2)),
        beforeListening: text(b.instruction),
        seconds: estimateSeconds(script)
      }
    }
    case 'video':
      return {
        ...base,
        type,
        title: text(b.title) || 'Film',
        kind: pick<VideoKind>(b.videoKind, VIDEO_KIND_IDS, 'lernvideo'),
        sourceTitle: text(b.videoTitle),
        url: text(b.videoUrl),
        platform: text(b.videoPlatform),
        // Suchbegriffe nur, wenn keine Adresse genannt wurde – sonst wären sie überflüssig
        ...(!text(b.videoUrl) && Array.isArray(b.videoSearchTerms) && b.videoSearchTerms.length
          ? {
              searchTerms: (b.videoSearchTerms as unknown[])
                .map((t) => text(t as string))
                .filter(Boolean)
                .slice(0, 4)
            }
          : {}),
        minutes: Math.max(0, Number(b.videoMinutes) || 0),
        section: text(b.videoSection),
        summary: text(b.body),
        beforeViewing: text(b.instruction),
        plays: Math.max(1, Math.min(3, Number(b.plays) || 1)),
        teacherNote: text(b.videoTeacherNote)
      }
    case 'selfCheck':
      return {
        ...base,
        type,
        title: text(b.title) || 'Das kann ich jetzt',
        statements: strings(b.items),
        format: pick(b.variant, ['smileys', 'ampel', 'kompetenzraster'], 'smileys')
      }
    case 'divider':
      return { ...base, type, title: text(b.title) }
  }
}
