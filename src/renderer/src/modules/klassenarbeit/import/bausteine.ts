/**
 * Aus einer zerlegten Aufgabe (zerlegen.ts) die Bausteine der App bauen (29.09.2026).
 *
 * „Wörtlich übernehmen" heißt: Inhalt unverändert, Layout der App. Anders als
 * `convertAnswer` der Arbeitsblatt-Erzeugung wird hier NICHTS gemischt – die Reihenfolge der
 * Antwortmöglichkeiten und Zuordnungen bleibt die des Materials.
 */
import { newId } from '../../vokabeltest/model/random'
import { emptyAnswer, newBlock } from '../../arbeitsblatt/model/factory'
import type { Answer, AudioBlock, LanguageSkill, TaskBlock, TaskPart, WsBlock } from '../../arbeitsblatt/model/types'
import { ENTWURF_VERMERK } from '../../rueckmeldung/aufgabeAusMaterial'
import type { ImportAntwort, ImportAufgabe, ImportKompetenz, ImportMaterial } from './zerlegen'

export interface UebernahmeOptionen {
  /** Punkte und Erwartungshorizont ergänzen, wo das Material keine hat (als Entwurf markiert) */
  entwuerfe: boolean
  /** Schwierigkeitsstufen der KI übernehmen */
  stufen: boolean
}

/** Die Verstehenskompetenzen – nur dort gilt das Stufenraster */
export const VERSTEHEN: ImportKompetenz[] = ['listening', 'reading', 'viewing']

const SKILL: Partial<Record<ImportKompetenz, LanguageSkill>> = {
  listening: 'listening',
  viewing: 'listening',
  reading: 'reading',
  writing: 'writing',
  mediation: 'mediation',
  grammar: 'grammar',
  vocabulary: 'vocabulary'
}

/** Antwort in die Form der App – ohne Mischen, fehlende Lösungen bleiben leer. */
export function alsAntwort(a: ImportAntwort, stufen: boolean): Answer {
  const out = emptyAnswer(a.kind)
  out.count = a.count
  switch (a.kind) {
    case 'gapText':
      out.gapText = a.gapText
      break
    case 'matching':
      out.left = a.left
      out.right = a.right
      out.pairs = a.left.map((_, i) => (Number.isInteger(a.pairs[i]) && a.pairs[i] >= 0 && a.pairs[i] < a.right.length ? a.pairs[i] : -1))
      break
    case 'multipleChoice':
      out.options = a.options
      out.correct = a.correct.filter((i) => i < a.options.length)
      break
    case 'trueFalse':
      out.statements = a.statements.map((s) => ({ text: s.text, isTrue: s.isTrue, ...(stufen && s.stufe ? { stufe: s.stufe } : {}) }))
      break
    case 'ordering': {
      out.items = a.items
      const n = a.items.length
      const gueltig = a.displayOrder.length === n && [...a.displayOrder].sort((x, y) => x - y).every((v, i) => v === i)
      // Ohne Angabe: umgekehrt – nie die richtige Reihenfolge zeigen
      out.displayOrder = gueltig ? a.displayOrder : a.items.map((_, i) => n - 1 - i)
      break
    }
    case 'tableFill':
      out.headers = a.headers
      out.rows = a.rows
      out.solutionRows = a.solutionRows
      break
  }
  return out
}

function materialBaustein(m: ImportMaterial, kompetenz: ImportKompetenz): WsBlock {
  const id = newId()
  if (m.art === 'hoertext') {
    return {
      ...(newBlock('audio') as AudioBlock),
      id,
      title: m.titel || 'Listening',
      textType: kompetenz === 'viewing' ? 'Film' : 'Hörtext',
      transcript: m.text,
      /*
       * Kein KI-Text: Das Transkript stammt aus dem Material, gespielt wird die Original-
       * aufnahme (Reiter „Hörtexte" → „Eigene Hördatei"). 'archiv' verhindert den Vermerk
       * „KI-erzeugt" auf dem Schülerblatt.
       */
      origin: 'archiv',
      warnings: ['Transkript aus dem Material übernommen. Die Original-Hördatei (MP3) im Reiter „Hörtexte" einbinden.']
    }
  }
  if (m.art === 'tabelle' && m.zeilen.length) {
    const [kopf, ...zeilen] = m.zeilen
    return { ...(newBlock('table') as Extract<WsBlock, { type: 'table' }>), id, title: m.titel, headers: kopf, rows: zeilen }
  }
  if (m.art === 'bild') {
    return {
      ...(newBlock('image') as Extract<WsBlock, { type: 'image' }>),
      id,
      description: m.text,
      caption: m.titel,
      widthPercent: 60,
      warnings: ['Bild aus dem Material: hier das Originalbild einsetzen (die KI hat es nur beschrieben).']
    }
  }
  return { ...(newBlock('text') as Extract<WsBlock, { type: 'text' }>), id, title: m.titel, body: m.text, source: m.quelle }
}

/**
 * Bausteine einer Aufgabe: zuerst ihr Material, dann die Aufgabe. Hörverstehensaufgaben werden
 * mit ihrem Hörtext verknüpft (audioId) – so findet die Stufenprüfung das Transkript.
 */
export function aufgabeAlsBausteine(a: ImportAufgabe, opt: UebernahmeOptionen): WsBlock[] {
  const material = a.material.map((m) => materialBaustein(m, a.kompetenz))
  const audio = material.find((b): b is AudioBlock => b.type === 'audio')
  const verstehen = VERSTEHEN.includes(a.kompetenz)
  const stufenAn = opt.stufen && verstehen
  const entwurf = a.loesungQuelle === 'entwurf'
  const punkteEntwurf = a.punkteQuelle === 'entwurf'
  const teile: TaskPart[] = a.teile.map((t) => ({
    id: newId(),
    instruction: t.anweisung,
    answer: alsAntwort(t.antwort, stufenAn),
    solution: entwurf && !opt.entwuerfe ? '' : t.loesung,
    ...(stufenAn && t.stufe ? { stufe: t.stufe, ...(t.stufeGrund ? { stufeGrund: t.stufeGrund } : {}) } : {})
  }))
  const hinweise = [
    a.hinweis,
    entwurf && opt.entwuerfe && a.loesung ? 'Der Erwartungshorizont ist ein Entwurf der KI – er stand nicht im Material.' : '',
    punkteEntwurf && opt.entwuerfe ? 'Die Punkte sind ein Vorschlag der KI – sie standen nicht im Material.' : ''
  ].filter(Boolean)
  const loesung = entwurf ? (opt.entwuerfe && a.loesung ? `${ENTWURF_VERMERK} ${a.loesung}` : '') : a.loesung
  const task: TaskBlock = {
    ...(newBlock('task') as TaskBlock),
    id: newId(),
    instruction: a.anweisung,
    operator: a.operator,
    ...(a.afb ? { afb: a.afb } : {}),
    afbReason: '',
    answer: alsAntwort(a.antwort, stufenAn),
    parts: teile,
    solution: loesung,
    points: punkteEntwurf && !opt.entwuerfe ? 0 : a.punkte,
    ...(SKILL[a.kompetenz] ? { skill: SKILL[a.kompetenz] } : {}),
    ...(audio ? { audioId: audio.id } : {}),
    ...(stufenAn && a.stufe ? { stufe: a.stufe, ...(a.stufeGrund ? { stufeGrund: a.stufeGrund } : {}) } : {}),
    ...(hinweise.length ? { warnings: hinweise } : {})
  }
  return [...material, task]
}
