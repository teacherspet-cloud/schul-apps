import { newId } from '../../vokabeltest/model/random'
import { defaultAxes } from './grid'
import type { Answer, AnswerKind, TaskBlock, WsBlock, WsBlockType } from './types'

export function emptyAnswer(kind: AnswerKind = 'lines'): Answer {
  return {
    kind,
    count: kind === 'grid' ? 6 : 3,
    heightMm: 40,
    gapText: '',
    left: [],
    right: [],
    pairs: [],
    options: [],
    correct: [],
    statements: [],
    items: [],
    displayOrder: [],
    headers: [],
    rows: [],
    solutionRows: [],
    labels: []
  }
}

/** Neuer, leerer Baustein zum Hinzufügen im Editor. */
export function newBlock(type: WsBlockType): WsBlock {
  const id = newId()
  switch (type) {
    case 'learningGoals':
      return { id, type, title: 'Das lernst du', goals: ['Ich kann …'] }
    case 'infoBox':
      return { id, type, variant: 'merke', title: 'Merke', body: '' }
    case 'text':
      return { id, type, title: '', body: '', lineNumbers: false, source: '', glossary: [] }
    case 'phrases':
      return {
        id,
        type,
        title: 'Useful phrases',
        hint: 'Diese Wendungen helfen dir bei den Aufgaben.',
        groups: [{ label: '', items: [{ text: '', german: '' }] }]
      }
    case 'image':
      return { id, type, description: '', caption: '', widthPercent: 60 }
    case 'task':
      return newTask(id)
    case 'scaffold':
      return { id, type, variant: 'tipp', title: 'Tipp', items: [''] }
    case 'table':
      return { id, type, title: '', headers: ['Spalte 1', 'Spalte 2'], rows: [['', '']] }
    case 'workspace':
      return { id, type, kind: 'lines', heightMm: 40, label: '' }
    case 'grid':
      return { id, type, kind: 'karo', title: '', caption: '', heightMm: 60, cellMm: 5, axes: defaultAxes('karo') }
    case 'audio':
      return { id, type, title: 'Hörtext', textType: 'Interview', transcript: '', speakers: [], plays: 2, beforeListening: '', seconds: 0 }
    case 'video':
      return {
        id,
        type,
        title: 'Film',
        kind: 'lernvideo',
        sourceTitle: '',
        url: '',
        platform: '',
        minutes: 0,
        section: '',
        summary: '',
        beforeViewing: '',
        plays: 1,
        teacherNote: ''
      }
    case 'selfCheck':
      return { id, type, title: 'Das kann ich jetzt', statements: ['Ich kann …'], format: 'smileys' }
    case 'divider':
      return { id, type, title: 'Abschnitt' }
  }
}

function newTask(id: string): TaskBlock {
  return {
    id,
    type: 'task',
    instruction: '',
    operator: '',
    afbReason: '',
    socialForm: 'EA',
    answer: emptyAnswer('lines'),
    parts: [],
    solution: '',
    points: 0,
    minutes: 5
  }
}

export const BLOCK_LABELS: Record<WsBlockType, string> = {
  learningGoals: 'Lernziele',
  infoBox: 'Merkkasten / Info',
  text: 'Text / Material',
  image: 'Abbildung',
  task: 'Aufgabe',
  scaffold: 'Hilfe (Tipp, Wortspeicher …)',
  phrases: 'Nützliche Ausdrücke und Wortschatz',
  table: 'Tabelle',
  workspace: 'Schreib- / Rechenfläche',
  grid: 'Gitternetz / Koordinatensystem',
  audio: 'Hörtext',
  video: 'Film / Video',
  selfCheck: 'Selbsteinschätzung',
  divider: 'Abschnittsüberschrift'
}

/**
 * Wörter, die `newBlock` als Platzhalter einsetzt. Sie stehen auf dem Blatt, sind aber kein
 * Inhalt – ein Kasten mit der Überschrift „Merke" und nichts darunter ist leer.
 */
const PLATZHALTER = ['Ich kann …', 'Das lernst du', 'Merke', 'Tipp', 'Abschnitt', 'Spalte 1', 'Spalte 2', 'Hörtext', 'Film', 'Useful phrases']

const leererText = (s: string | undefined): boolean => !s?.trim() || PLATZHALTER.includes(s.trim())

/**
 * Ist dieser Baustein noch ohne Inhalt?
 *
 * Wunsch der Lehrkraft (25.09.2026): „füge einen zauberstab in ‚bearbeiten & export' bei
 * einem noch leeren baustein hinzu, wodurch der inhalt hier von einer KI gefüllt wird."
 *
 * Gemeint ist der FACHLICHE Inhalt, nicht das Gerüst: Ein frisch eingefügter Merkkasten trägt
 * schon die Überschrift „Merke" und ein Lernziel-Baustein die Zeile „Ich kann …". Beides
 * kommt aus `newBlock` und sagt nichts darüber aus, worum es gehen soll.
 *
 * `false` für Bausteine, die gar keinen Inhalt haben: Schreibraum, Gitternetz und Trennlinie
 * sind bewusst leer, und ein Film lässt sich nicht erfinden – dort gäbe es nichts zu füllen.
 */
export function istLeer(block: WsBlock): boolean {
  switch (block.type) {
    case 'learningGoals':
      return block.goals.every(leererText)
    case 'infoBox':
      return leererText(block.body)
    case 'text':
      return leererText(block.body)
    case 'phrases':
      return block.groups.every((g) => g.items.every((i) => leererText(i.text)))
    case 'image':
      return leererText(block.description) && !block.image
    case 'task':
      return leererText(block.instruction) && block.parts.every((p) => leererText(p.instruction))
    case 'scaffold':
      return block.items.every(leererText)
    case 'table':
      return block.rows.every((r) => r.every(leererText))
    case 'audio':
      return leererText(block.transcript)
    case 'selfCheck':
      return block.statements.every(leererText)
    default:
      return false
  }
}

/**
 * Kopie eines Bausteins zum Duplizieren (Paket 6, Wunsch der Lehrkraft: „Baustein duplizieren"
 * in Gliederung und Editor).
 *
 * Neu ist nur die Kennung des Bausteins selbst; innere Kennungen (Teilaufgaben, Einzelbilder)
 * gelten ohnehin nur innerhalb ihres Bausteins. Nicht mit kopiert werden:
 * - die früheren Entwürfe – die Kopie beginnt mit dem Stand, der zu sehen ist; die Entwürfe
 *   tragen die alte Kennung, und ein Blättern darin machte aus der Kopie wieder das Original,
 * - eine freie Lage auf der Seite – sonst läge die Kopie genau über dem Original.
 */
export function dupliziereBaustein(block: WsBlock): WsBlock {
  const kopie = structuredClone(block)
  delete kopie.versions
  delete kopie.versionIndex
  delete kopie.free
  return { ...kopie, id: newId() }
}
