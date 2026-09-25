/**
 * Fassungen einer Klassenarbeit (A/B, A/B/C) – gegen Abschreiben.
 *
 * Bis 25.09.2026 gab es nur das Feld „Varianten (A/B)", das nichts bewirkte. Übernommen ist
 * das Modell der Lernzielkontrolle (eine / A/B / A/B/C, alle Fassungen in einem Auftrag,
 * Umschalter der angezeigten Fassung, beim Ausgeben die Frage „nur die angezeigte oder alle").
 * Deren Regel für die Erzeugung gilt auch hier: Jede weitere Fassung prüft DIESELBEN Inhalte
 * und Aufgabentypen mit anderen Beispielen, bei gleichem Schwierigkeitsgrad
 * (lernzielkontrolle/generation/generateKurztest.ts).
 *
 * Für eine Klassenarbeit hat die Lehrkraft das verschärft (25.09.2026): Fassung B besteht aus
 * GLEICHWERTIGEN PARALLELAUFGABEN – gleiche Operatoren, gleiche Anforderungsbereiche, gleiche
 * Punkte. Nur so sind die Noten beider Gruppen vergleichbar. Deshalb gilt der Aufbau (Teile,
 * Punkte, Minuten, Anteile) für alle Fassungen gemeinsam, und nur die Bausteine unterscheiden
 * sich (`ExamPart.weitereFassungen`).
 *
 * Beim MATERIAL gibt es zwei Wege (`materialweg`):
 *
 * - DASSELBE Material, andere Aufgaben:
 *   - Hörverstehen – aus der Sache zwingend: Der Hörtext wird der ganzen Klasse vorgespielt.
 *     Zwei Hörtexte hießen zwei Durchgänge, bei denen jeweils die halbe Klasse wartet.
 *   - Oberstufe mit Originaltext – Vorgabe der Lehrkraft (24.09.2026): kein KI-Material, die
 *     Quelle wählt sie selbst aus. Eine zweite, KI-geschriebene „Parallelquelle" ist dort
 *     ausgeschlossen.
 *   - Geschichte mit Quellen-, Bild- oder Datenmaterial – eine historische Quelle ist ein
 *     Einzelstück; eine zweite, genau gleich ergiebige und gleich schwere Quelle gibt es in
 *     der Regel nicht. Gleichwertig bleibt die Arbeit sicherer mit derselben Quelle und
 *     anderen Aufgaben. (Fachliche Abwägung, keine Vorschrift.)
 * - PARALLELTEXT: Englisch Lesen, Sprachmittlung, Sprachgebrauch und Grammatik in der
 *   Sekundarstufe I. Dort ist der Text ein Übungstext, der sich gleichwertig neu schreiben
 *   lässt – gleiche Textsorte, gleiches Thema, gleiche Länge, gleicher Wortschatz.
 *   Schreibaufgaben bekommen eine parallele Situation mit derselben Textsorte.
 *
 * Die Toleranzen für die Textlänge (±10 % im Auftrag, Hinweis ab ±20 %) sind FAUSTREGELN:
 * Eine belegte Grenze dafür wurde nicht gefunden. Sie sollen nur verhindern, dass eine Gruppe
 * merklich mehr zu lesen hat.
 */
import { stageForGrade } from '../../arbeitsblatt/didactics/profile'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import { aufgabenIn, punkteNachTeilaufgaben, skalierePunkte } from '../../../shared/punkte'
import { formatById } from './formats'
import type { Exam, ExamPart } from './types'

/** Mehr als A/B/C bietet auch die Lernzielkontrolle nicht an */
export const MAX_FASSUNGEN = 3

/** „A", „B", „C" – bei einer einzigen Fassung leer (wie `variantenLabel` der Lernzielkontrolle) */
export const fassungsLabel = (index: number, gesamt: number): string => (gesamt < 2 ? '' : String.fromCharCode(65 + index))

/**
 * Wie viele Fassungen die Arbeit TATSÄCHLICH hat.
 *
 * Maßgeblich ist, was erzeugt wurde, nicht die Einstellung: Wer nach dem Erzeugen im Rahmen
 * auf „A/B" umstellt, hat bis zum neuen Erzeugen weiterhin nur eine Fassung.
 */
export function fassungsZahl(exam: Exam): number {
  const n = Math.max(1, ...exam.parts.map((p) => 1 + (p.weitereFassungen?.length ?? 0)))
  return Math.min(MAX_FASSUNGEN, n)
}

/** Die Bausteine eines Teils in Fassung `f` (0 = A). */
export const bloeckeDerFassung = (part: ExamPart, f: number): WsBlock[] => (f <= 0 ? part.blocks : (part.weitereFassungen?.[f - 1] ?? []))

/** Ein Teil mit neuen Bausteinen in Fassung `f` – die übrigen Fassungen bleiben, wie sie sind. */
export function mitBloecken(part: ExamPart, f: number, blocks: WsBlock[]): ExamPart {
  if (f <= 0) return { ...part, blocks }
  const weitere = [...(part.weitereFassungen ?? [])]
  while (weitere.length < f - 1) weitere.push([])
  weitere[f - 1] = blocks
  return { ...part, weitereFassungen: weitere }
}

/** Die Teile, wie sie in Fassung `f` aussehen: gleicher Aufbau, Bausteine dieser Fassung. */
export const teileDerFassung = (exam: Exam, f: number): ExamPart[] => exam.parts.map((p) => ({ ...p, blocks: bloeckeDerFassung(p, f) }))

/** Die Bausteinlisten aller Fassungen eines Teils (A zuerst). */
export const alleFassungen = (part: ExamPart): WsBlock[][] => [part.blocks, ...(part.weitereFassungen ?? [])]

/**
 * Gespeicherte Arbeiten auf den heutigen Stand bringen.
 *
 * Eine Arbeit mit einer Fassung (variants = 1, keine weiteren Bausteine) kommt UNVERÄNDERT
 * zurück – dasselbe Objekt. Korrigiert wird nur, was es so nie hätte geben dürfen: eine
 * Fassungszahl außerhalb 1–3 (das alte Feld ließ jede Zahl zu) oder ein kaputtes Feld.
 */
export function normalisiereArbeit(exam: Exam): Exam {
  const roh = Number(exam.meta?.variants)
  const variants = Number.isFinite(roh) ? Math.min(MAX_FASSUNGEN, Math.max(1, Math.round(roh))) : 1
  const kaputt = exam.parts.some((p) => p.weitereFassungen !== undefined && !Array.isArray(p.weitereFassungen))
  if (variants === exam.meta.variants && !kaputt) return exam
  return {
    ...exam,
    meta: { ...exam.meta, variants },
    parts: kaputt
      ? exam.parts.map((p) => {
          if (Array.isArray(p.weitereFassungen)) return p
          // Ein kaputtes Feld verwerfen – Fassung A ist unberührt
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { weitereFassungen, ...rest } = p
          return rest
        })
      : exam.parts
  }
}

export type Materialweg = 'gleich' | 'parallel'

/** Bekommt die weitere Fassung DASSELBE Material oder einen Paralleltext? (Begründung oben) */
export function materialweg(exam: Exam, part: ExamPart): Materialweg {
  if (part.formatId === 'en-listening') return 'gleich'
  const format = formatById(part.formatId)
  const mitMaterial = Boolean(format && format.material !== 'none')
  if (mitMaterial && stageForGrade(exam.meta.grade, exam.meta.schoolTypeId) === 'sek2') return 'gleich'
  if (mitMaterial && exam.meta.subjectId === 'geschichte') return 'gleich'
  // Sprechanlass als Bild: dasselbe Bild, andere Impulse
  if (format?.material === 'image') return 'gleich'
  return 'parallel'
}

/** Wörter der Materialtexte – Maß für die Länge eines Paralleltextes. */
export function materialWoerter(blocks: WsBlock[]): number {
  return blocks.reduce((n, b) => (b.type === 'text' ? n + (b.body.trim() ? b.body.trim().split(/\s+/).length : 0) : n), 0)
}

/** Kurzbeschreibung einer Aufgabe der Vorlage: Operator, AFB, Punkte, Antwortform. */
function aufgabenZeile(b: Extract<WsBlock, { type: 'task' }>, nr: number): string {
  const art = b.parts.length ? `${b.parts.length} Teilaufgaben` : b.answer.kind
  return `${nr}. Operator „${b.operator || '–'}", AFB ${b.afb || '–'}, ${b.points} Punkte, Antwortform ${art}`
}

/**
 * Der Zusatz zum Auftrag eines Teils für eine weitere Fassung.
 *
 * `vorlage` ist die Beschreibung der Fassung A (describeBlock) – die KI sieht, wozu sie das
 * Gegenstück schreibt. Die Aufgabenliste darunter nennt Operator, Anforderungsbereich und
 * Punkte je Aufgabe noch einmal ausdrücklich, weil genau diese drei gleich bleiben müssen.
 */
export function parallelAuftrag(exam: Exam, part: ExamPart, label: string, vorlageBloecke: WsBlock[], vorlage: string): string {
  const weg = materialweg(exam, part)
  const aufgaben = vorlageBloecke.filter((b): b is Extract<WsBlock, { type: 'task' }> => b.type === 'task')
  const woerter = materialWoerter(vorlageBloecke)
  const format = formatById(part.formatId)
  return [
    `PARALLELFASSUNG ${label} (gegen Abschreiben):`,
    `Die Arbeit wird in ${Math.max(2, exam.meta.variants)} Fassungen geschrieben; benachbarte Lernende bekommen verschiedene Fassungen. Unten steht Fassung A dieses Teils als Vorlage. Fassung ${label} muss GLEICHWERTIG sein, damit die Noten beider Gruppen vergleichbar sind:`,
    `- Gleich viele Aufgaben (${aufgaben.length}) in derselben Reihenfolge, jede mit DEMSELBEN Operator, DEMSELBEN Anforderungsbereich, derselben Antwortform (gleiche Zahl an Items bzw. Teilaufgaben) und DERSELBEN Punktzahl wie die entsprechende Aufgabe in Fassung A.`,
    '- Anderer Inhalt: andere Items, andere Beispiele, andere Textstellen. Keine Antwort darf sich aus Fassung A übernehmen lassen.',
    '- Gleiche Schwierigkeit: gleiches Sprachniveau, gleicher Wortschatz, gleich lange erwartete Antworten.',
    weg === 'gleich'
      ? part.formatId === 'en-listening'
        ? '- Das MATERIAL bleibt dasselbe: Der Hörtext wird der ganzen Klasse vorgespielt. Die App setzt ihn selbst ein. Gib NUR die Aufgaben (type "task") zu diesem Hörtext zurück, kein Material.'
        : '- Das MATERIAL bleibt dasselbe (dieselbe Quelle für alle Fassungen). Die App setzt es selbst ein. Gib NUR die Aufgaben (type "task") zu diesem Material zurück, kein Material.'
      : format?.material && format.material !== 'none'
        ? `- Schreibe einen PARALLELTEXT: gleiche Textsorte, gleiches Thema der Unterrichtseinheit, aber anderer Inhalt (andere Situation, andere Personen, andere Einzelheiten)${woerter ? `, gleiche Länge (etwa ${woerter} Wörter, höchstens 10 % Abweichung)` : ''}, gleiche sprachliche Schwierigkeit.`
        : '- Stelle eine PARALLELE Aufgabe: gleiche Textsorte, gleiche Zahl an Inhaltspunkten und gleiche Anforderung, aber eine andere Situation bzw. ein anderer Gegenstand.',
    `- Die Lösungen (solution) und der Erwartungshorizont gehören zu Fassung ${label}.`,
    '',
    aufgaben.length
      ? `AUFGABEN DER FASSUNG A (Operator, AFB, Punkte, Antwortform – bleiben gleich):\n${aufgaben.map((a, i) => aufgabenZeile(a, i + 1)).join('\n')}`
      : '',
    '',
    `VORLAGE – FASSUNG A DIESES TEILS:\n${vorlage}`
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Setzt die neuen Aufgaben an die Stellen der Aufgaben der Vorlage; das Material der Vorlage
 * bleibt, MIT seiner id (siehe `ExamPart.weitereFassungen`). Überzählige neue Aufgaben folgen
 * auf die letzte Aufgabe.
 */
export function uebernimmMaterial(vorlage: WsBlock[], neu: WsBlock[]): WsBlock[] {
  const aufgaben = neu.filter((b) => b.type === 'task')
  const out: WsBlock[] = []
  let letzteAufgabe = -1
  for (const b of vorlage) {
    if (b.type !== 'task') {
      out.push(structuredClone(b))
      continue
    }
    const naechste = aufgaben.shift()
    if (naechste) {
      out.push(naechste)
      letzteAufgabe = out.length - 1
    }
  }
  if (aufgaben.length) out.splice(letzteAufgabe + 1 || out.length, 0, ...aufgaben)
  return out
}

/**
 * Gleiche Punkte als Zusage, nicht nur als Bitte: Stimmt die Zahl der Aufgaben überein, bekommt
 * jede Aufgabe der Fassung die Punkte ihres Gegenstücks in Fassung A. Weicht die Zahl ab, bleibt
 * alles stehen, und der Befund geht als Hinweis an die Lehrkraft.
 */
export function gleichePunkte(vorlage: WsBlock[], fassung: WsBlock[]): string | null {
  const a = vorlage.filter((b): b is Extract<WsBlock, { type: 'task' }> => b.type === 'task')
  const f = fassung.filter((b): b is Extract<WsBlock, { type: 'task' }> => b.type === 'task')
  if (a.length !== f.length) return `${f.length} statt ${a.length} Aufgaben wie in Fassung A – Punkte und Anforderungen bitte angleichen.`
  f.forEach((t, i) => (t.points = a[i].points))
  return null
}

/** Hinweis, wenn ein Paralleltext merklich länger oder kürzer ist (Faustregel: ab 20 %). */
export function laengenHinweis(vorlage: WsBlock[], fassung: WsBlock[]): string | null {
  const a = materialWoerter(vorlage)
  const b = materialWoerter(fassung)
  if (!a || !b) return null
  return Math.abs(b - a) / a > 0.2 ? `Der Paralleltext hat ${b} statt etwa ${a} Wörter – die Lesezeit der Gruppen unterscheidet sich.` : null
}

/**
 * Die Punkte der Aufgaben eines Teils auf die Punkte des Teils bringen.
 *
 * Der Auftrag an die KI nennt die Punkte des Teils und verlangt Punkte je Aufgabe. Bis Paket 6
 * gingen diese auf dem Weg `convertBlock` verloren (fest 0); seitdem kommen sie an – aber
 * die Summe ist eine Bitte, keine Zusage. Hier wird sie zur Zusage, mit erhaltener
 * Gewichtung. Ein Teil ohne Punktvorgabe (Englisch ohne Punkte: 0) bleibt, wie die KI ihn
 * bepunktet hat. Verändert die Bausteine an Ort und Stelle.
 */
export function punkteAufTeil(blocks: WsBlock[], ziel: number): void {
  const aufgaben = aufgabenIn(blocks)
  if (!aufgaben.length || ziel <= 0) return
  punkteNachTeilaufgaben(aufgaben)
  skalierePunkte(aufgaben, ziel)
}

/**
 * Ein Teil, nachdem EINE Fassung überarbeitet wurde (Auftrag der Lehrkraft in Schritt 2).
 *
 * - Punkte: Fassung A wird auf die Punkte des Teils gebracht; eine weitere Fassung übernimmt
 *   die Punkte ihres Gegenstücks in A (`gleichePunkte`).
 * - Gemeinsames Material: Wird Fassung A eines Teils mit übernommenem Material (Hörtext,
 *   Quelle) überarbeitet, kann dabei neues Material entstehen. Bis Paket 6 stand in B dann
 *   noch das alte – bei einem Hörtext, der der ganzen Klasse vorgespielt wird, ein grober
 *   Fehler. Deshalb zieht die Überarbeitung von A das Material in allen Fassungen mit.
 *   Umgekehrt behält eine überarbeitete weitere Fassung das Material ihrer bisherigen Fassung.
 */
export function teilNachUeberarbeitung(exam: Exam, part: ExamPart, f: number, blocks: WsBlock[]): ExamPart {
  const gleich = materialweg(exam, part) === 'gleich'
  if (f <= 0) {
    const a = structuredClone(blocks)
    punkteAufTeil(a, part.points)
    // Kopien: Die Listen gehören dem Store und dürfen nicht an Ort und Stelle geändert werden
    const weitere = part.weitereFassungen?.map((alt) => {
      const liste = structuredClone(alt)
      const neu = gleich && a.some((b) => b.type === 'task') ? uebernimmMaterial(a, liste) : liste
      gleichePunkte(a, neu)
      return neu
    })
    return { ...part, blocks: a, ...(weitere ? { weitereFassungen: weitere } : {}) }
  }
  const neu = gleich ? uebernimmMaterial(bloeckeDerFassung(part, f), structuredClone(blocks)) : structuredClone(blocks)
  gleichePunkte(part.blocks, neu)
  return mitBloecken(part, f, neu)
}
